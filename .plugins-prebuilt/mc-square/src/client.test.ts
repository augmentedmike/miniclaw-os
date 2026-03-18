/**
 * client.test.ts — unit tests for mc-square SquareClient
 *
 * Tests the fetch-based REST client against mocked responses.
 * No real Square API calls. Uses a fake vault binary for token resolution.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SquareClient } from "./client.js";
import { vaultSet } from "./vault.js";
import type { SquareConfig } from "./config.js";

let tmpDir: string;
let fakeVault: string;
let storePath: string;
let mockCfg: SquareConfig;
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;

  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-square-client-test-"));
  storePath = path.join(tmpDir, "store.json");
  fs.writeFileSync(storePath, "{}");

  fakeVault = path.join(tmpDir, "fake-vault");
  fs.writeFileSync(
    fakeVault,
    `#!/bin/bash
STORE="${storePath}"
CMD="$1"; KEY="$2"; VAL="$3"
if [ "$CMD" = "get" ]; then
  val=$(cat "$STORE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$KEY',''))" 2>/dev/null)
  if [ -n "$val" ]; then echo "$KEY = $val"; else exit 1; fi
elif [ "$CMD" = "set" ]; then
  VAL=$(echo "$VAL" | sed 's/^"//;s/"$//')
  python3 -c "
import json
with open('$STORE') as f: d=json.load(f)
d['$KEY']='$VAL'
with open('$STORE','w') as f: json.dump(d,f)
"
fi
`,
  );
  fs.chmodSync(fakeVault, 0o755);

  // Vault a fake token so SquareClient can construct
  vaultSet(fakeVault, "square-access-token", "fake-sandbox-token");

  mockCfg = {
    vaultBin: fakeVault,
    environment: "sandbox",
    locationId: "LOC_TEST",
    currency: "USD",
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function mockFetch(status: number, body: unknown) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    json: async () => body,
  });
}

describe("SquareClient", () => {
  it("constructs with valid config", () => {
    const client = new SquareClient(mockCfg);
    expect(client).toBeDefined();
  });
});

describe("listLocations", () => {
  it("returns parsed locations", async () => {
    mockFetch(200, {
      locations: [
        { id: "LOC_1", name: "Main Store", status: "ACTIVE" },
        { id: "LOC_2", name: "Popup", status: "INACTIVE" },
      ],
    });
    const client = new SquareClient(mockCfg);
    const locations = await client.listLocations();
    expect(locations).toHaveLength(2);
    expect(locations[0].id).toBe("LOC_1");
    expect(locations[0].name).toBe("Main Store");
    expect(locations[1].status).toBe("INACTIVE");
  });

  it("returns empty array when no locations", async () => {
    mockFetch(200, {});
    const client = new SquareClient(mockCfg);
    const locations = await client.listLocations();
    expect(locations).toEqual([]);
  });

  it("throws on API error", async () => {
    mockFetch(401, { errors: [{ detail: "Unauthorized" }] });
    const client = new SquareClient(mockCfg);
    await expect(client.listLocations()).rejects.toThrow("Square API error (401): Unauthorized");
  });
});

describe("createPayment", () => {
  it("returns parsed payment", async () => {
    mockFetch(200, {
      payment: {
        id: "PAY_123",
        status: "COMPLETED",
        amount_money: { amount: 1999, currency: "USD" },
        receipt_url: "https://squareup.com/receipt/abc",
      },
    });
    const client = new SquareClient(mockCfg);
    const payment = await client.createPayment(1999, "USD", "Test");
    expect(payment.id).toBe("PAY_123");
    expect(payment.status).toBe("COMPLETED");
    expect(payment.amount).toBe(1999);
    expect(payment.currency).toBe("USD");
    expect(payment.receiptUrl).toBe("https://squareup.com/receipt/abc");
  });

  it("sends correct request body", async () => {
    mockFetch(200, {
      payment: { id: "PAY_1", status: "COMPLETED", amount_money: { amount: 500, currency: "USD" } },
    });
    const client = new SquareClient(mockCfg);
    await client.createPayment(500, "USD", "Note");

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toContain("/v2/payments");
    const body = JSON.parse(fetchCall[1].body);
    expect(body.amount_money.amount).toBe(500);
    expect(body.amount_money.currency).toBe("USD");
    expect(body.location_id).toBe("LOC_TEST");
    expect(body.idempotency_key).toBeDefined();
    expect(body.note).toBe("Note");
  });
});

describe("getPayment", () => {
  it("returns parsed payment details", async () => {
    mockFetch(200, {
      payment: {
        id: "PAY_456",
        status: "COMPLETED",
        amount_money: { amount: 3000, currency: "USD" },
        note: "Test note",
        created_at: "2026-03-11T00:00:00Z",
      },
    });
    const client = new SquareClient(mockCfg);
    const payment = await client.getPayment("PAY_456");
    expect(payment.id).toBe("PAY_456");
    expect(payment.amount).toBe(3000);
    expect(payment.note).toBe("Test note");
    expect(payment.createdAt).toBe("2026-03-11T00:00:00Z");
  });
});

describe("refundPayment", () => {
  it("returns parsed refund", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200, statusText: "OK",
        json: async () => ({
          payment: { id: "PAY_1", status: "COMPLETED", amount_money: { amount: 2000, currency: "USD" }, created_at: "2026-01-01" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200, statusText: "OK",
        json: async () => ({
          refund: { id: "REF_1", status: "PENDING", amount_money: { amount: 2000 } },
        }),
      });
    globalThis.fetch = fetchMock;

    const client = new SquareClient(mockCfg);
    const refund = await client.refundPayment("PAY_1");
    expect(refund.id).toBe("REF_1");
    expect(refund.status).toBe("PENDING");
    expect(refund.amount).toBe(2000);
  });
});

describe("createPaymentLink", () => {
  it("returns parsed link", async () => {
    mockFetch(200, {
      payment_link: {
        id: "LINK_1",
        url: "https://square.link/abc",
        order_id: "ORD_1",
      },
    });
    const client = new SquareClient(mockCfg);
    const link = await client.createPaymentLink(1999, "Consultation");
    expect(link.id).toBe("LINK_1");
    expect(link.url).toBe("https://square.link/abc");
    expect(link.orderId).toBe("ORD_1");
  });
});

describe("listPayments", () => {
  it("returns parsed payments list", async () => {
    mockFetch(200, {
      payments: [
        { id: "PAY_A", status: "COMPLETED", amount_money: { amount: 100, currency: "USD" }, created_at: "2026-01-01" },
        { id: "PAY_B", status: "COMPLETED", amount_money: { amount: 200, currency: "USD" }, created_at: "2026-01-02" },
      ],
    });
    const client = new SquareClient(mockCfg);
    const payments = await client.listPayments(10);
    expect(payments).toHaveLength(2);
    expect(payments[0].id).toBe("PAY_A");
    expect(payments[1].amount).toBe(200);
  });

  it("returns empty when no payments", async () => {
    mockFetch(200, {});
    const client = new SquareClient(mockCfg);
    const payments = await client.listPayments();
    expect(payments).toEqual([]);
  });
});

describe("sandbox vs production URL", () => {
  it("uses sandbox URL for sandbox environment", async () => {
    mockFetch(200, { locations: [] });
    const client = new SquareClient({ ...mockCfg, environment: "sandbox" });
    await client.listLocations();
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("squareupsandbox.com");
  });

  it("uses production URL for production environment", async () => {
    mockFetch(200, { locations: [] });
    const client = new SquareClient({ ...mockCfg, environment: "production" });
    await client.listLocations();
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("connect.squareup.com");
    expect(url).not.toContain("sandbox");
  });
});
