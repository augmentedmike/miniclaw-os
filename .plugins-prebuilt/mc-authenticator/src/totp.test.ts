import { describe, expect, it } from "vitest";
import { base32Decode, generateTOTP, parseOtpauthUri, timeRemaining } from "./totp.js";

// RFC 6238 uses the ASCII string "12345678901234567890" as the SHA1 secret
const RFC_SECRET_SHA1_B32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

// SHA256 secret: "12345678901234567890123456789012" (32 bytes)
const RFC_SECRET_SHA256_B32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA";

// SHA512 secret: "1234567890123456789012345678901234567890123456789012345678901234" (64 bytes)
const RFC_SECRET_SHA512_B32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNA";

describe("base32Decode", () => {
  it("decodes a known string", () => {
    // "JBSWY3DPEHPK3PXP" decodes to "Hello!"... actually let's check a known value
    const buf = base32Decode("GEZDGNBVGY3TQOJQ");
    expect(buf.toString("ascii")).toBe("1234567890");
  });

  it("handles lowercase input", () => {
    const buf = base32Decode("gezdgnbvgy3tqojq");
    expect(buf.toString("ascii")).toBe("1234567890");
  });

  it("handles padding characters", () => {
    const buf = base32Decode("GEZDGNBVGY3TQOJQ====");
    expect(buf.toString("ascii")).toBe("1234567890");
  });

  it("throws on empty string", () => {
    expect(() => base32Decode("")).toThrow("Empty base32 string");
  });

  it("throws on invalid characters", () => {
    expect(() => base32Decode("INVALID!@#")).toThrow("Invalid base32 character");
  });

  it("decodes JBSWY3DPEHPK3PXP correctly", () => {
    const buf = base32Decode("JBSWY3DPEHPK3PXP");
    expect(buf.toString("hex")).toBe("48656c6c6f21deadbeef");
  });
});

describe("generateTOTP — RFC 6238 test vectors (SHA1)", () => {
  const vectors: [number, string][] = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ];

  for (const [time, expected] of vectors) {
    it(`time=${time} => ${expected}`, () => {
      const code = generateTOTP(RFC_SECRET_SHA1_B32, {
        timestamp: time * 1000,
        digits: 8,
        period: 30,
        algorithm: "sha1",
      });
      // RFC vectors are 8-digit; we compare the last 6 for 6-digit mode
      // Actually the vectors above ARE 6-digit excerpts from the 8-digit codes
      // Let me re-check: RFC 6238 Appendix B vectors are 8-digit
      expect(code.slice(-6)).toBe(expected);
    });
  }
});

describe("generateTOTP — RFC 6238 test vectors (SHA256)", () => {
  const vectors: [number, string][] = [
    [59, "119246"],
    [1111111109, "084774"],
    [1111111111, "062674"],
    [1234567890, "819424"],
    [2000000000, "698825"],
    [20000000000, "737706"],
  ];

  for (const [time, expected] of vectors) {
    it(`time=${time} => ${expected}`, () => {
      const code = generateTOTP(RFC_SECRET_SHA256_B32, {
        timestamp: time * 1000,
        digits: 8,
        period: 30,
        algorithm: "sha256",
      });
      expect(code.slice(-6)).toBe(expected);
    });
  }
});

describe("generateTOTP — RFC 6238 test vectors (SHA512)", () => {
  const vectors: [number, string][] = [
    [59, "693936"],
    [1111111109, "091201"],
    [1111111111, "943326"],
    [1234567890, "441116"],
    [2000000000, "618901"],
    [20000000000, "863826"],
  ];

  for (const [time, expected] of vectors) {
    it(`time=${time} => ${expected}`, () => {
      const code = generateTOTP(RFC_SECRET_SHA512_B32, {
        timestamp: time * 1000,
        digits: 8,
        period: 30,
        algorithm: "sha512",
      });
      expect(code.slice(-6)).toBe(expected);
    });
  }
});

describe("generateTOTP — 6 vs 8 digits", () => {
  it("generates 6-digit code by default", () => {
    const code = generateTOTP(RFC_SECRET_SHA1_B32, { timestamp: 59000 });
    expect(code).toHaveLength(6);
  });

  it("generates 8-digit code when requested", () => {
    const code = generateTOTP(RFC_SECRET_SHA1_B32, { timestamp: 59000, digits: 8 });
    expect(code).toHaveLength(8);
  });
});

describe("generateTOTP — code changes with time", () => {
  it("same period gives same code", () => {
    const a = generateTOTP(RFC_SECRET_SHA1_B32, { timestamp: 1000 });
    const b = generateTOTP(RFC_SECRET_SHA1_B32, { timestamp: 29000 });
    expect(a).toBe(b);
  });

  it("different period gives different code (usually)", () => {
    const a = generateTOTP(RFC_SECRET_SHA1_B32, { timestamp: 0 });
    const b = generateTOTP(RFC_SECRET_SHA1_B32, { timestamp: 30000 });
    // Could theoretically be the same, but statistically won't be with these values
    expect(a).not.toBe(b);
  });
});

describe("parseOtpauthUri", () => {
  it("parses a full URI", () => {
    const uri = "otpauth://totp/GitHub:augmentedmike?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&algorithm=SHA1&digits=6&period=30";
    const result = parseOtpauthUri(uri);
    expect(result.secret).toBe("JBSWY3DPEHPK3PXP");
    expect(result.issuer).toBe("GitHub");
    expect(result.account).toBe("augmentedmike");
    expect(result.algorithm).toBe("sha1");
    expect(result.digits).toBe(6);
    expect(result.period).toBe(30);
  });

  it("parses a minimal URI (just secret)", () => {
    const uri = "otpauth://totp/MyService?secret=JBSWY3DPEHPK3PXP";
    const result = parseOtpauthUri(uri);
    expect(result.secret).toBe("JBSWY3DPEHPK3PXP");
    expect(result.issuer).toBe("");
    expect(result.account).toBe("MyService");
    expect(result.algorithm).toBe("sha1");
    expect(result.digits).toBe(6);
    expect(result.period).toBe(30);
  });

  it("extracts issuer from label when not in params", () => {
    const uri = "otpauth://totp/Amazon:user@example.com?secret=JBSWY3DPEHPK3PXP";
    const result = parseOtpauthUri(uri);
    expect(result.issuer).toBe("Amazon");
    expect(result.account).toBe("user@example.com");
  });

  it("prefers issuer param over label prefix", () => {
    const uri = "otpauth://totp/Label:user?secret=JBSWY3DPEHPK3PXP&issuer=RealIssuer";
    const result = parseOtpauthUri(uri);
    expect(result.issuer).toBe("RealIssuer");
  });

  it("handles SHA256 algorithm", () => {
    const uri = "otpauth://totp/Service?secret=JBSWY3DPEHPK3PXP&algorithm=SHA256";
    const result = parseOtpauthUri(uri);
    expect(result.algorithm).toBe("sha256");
  });

  it("handles 8 digits and 60s period", () => {
    const uri = "otpauth://totp/Service?secret=JBSWY3DPEHPK3PXP&digits=8&period=60";
    const result = parseOtpauthUri(uri);
    expect(result.digits).toBe(8);
    expect(result.period).toBe(60);
  });

  it("throws on non-otpauth URI", () => {
    expect(() => parseOtpauthUri("https://example.com")).toThrow("Invalid otpauth URI");
  });

  it("throws on missing secret", () => {
    expect(() => parseOtpauthUri("otpauth://totp/Service?issuer=X")).toThrow("Missing secret");
  });
});

describe("timeRemaining", () => {
  it("returns a value between 1 and period", () => {
    const remaining = timeRemaining(30);
    expect(remaining).toBeGreaterThanOrEqual(1);
    expect(remaining).toBeLessThanOrEqual(30);
  });

  it("works with non-default period", () => {
    const remaining = timeRemaining(60);
    expect(remaining).toBeGreaterThanOrEqual(1);
    expect(remaining).toBeLessThanOrEqual(60);
  });
});
