import { NextRequest, NextResponse } from "next/server";
import { getAllContacts, searchContacts, getAllTags, createContact } from "@/lib/rolodex";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const tag = searchParams.get("tag") ?? "";
  const trust = searchParams.get("trust") ?? "";

  let contacts = q ? searchContacts(q) : getAllContacts();

  if (tag) contacts = contacts.filter(c => c.tags.includes(tag));
  if (trust) contacts = contacts.filter(c => (c.trustStatus ?? "unknown") === trust);

  const tags = getAllTags();
  return NextResponse.json({ contacts, tags, total: contacts.length });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch { /* malformed JSON body */
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const contact = createContact({
    name: (body.name as string).trim(),
    emails: Array.isArray(body.emails) ? (body.emails as string[]) : [],
    phones: Array.isArray(body.phones) ? (body.phones as string[]) : [],
    domains: Array.isArray(body.domains) ? (body.domains as string[]) : [],
    tags: Array.isArray(body.tags) ? (body.tags as string[]) : [],
    trustStatus: (body.trustStatus as "verified" | "pending" | "untrusted" | "unknown") ?? "unknown",
    notes: typeof body.notes === "string" ? body.notes : "",
  });

  return NextResponse.json(contact, { status: 201 });
}
