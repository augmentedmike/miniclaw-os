import { NextRequest, NextResponse } from "next/server";
import { getContactById, updateContact, deleteContact } from "@/lib/rolodex";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contact = getContactById(id);
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(contact);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch { // request body is not valid JSON
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim())) {
    return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = (body.name as string).trim();
  if (body.emails !== undefined) updates.emails = Array.isArray(body.emails) ? body.emails : [];
  if (body.phones !== undefined) updates.phones = Array.isArray(body.phones) ? body.phones : [];
  if (body.domains !== undefined) updates.domains = Array.isArray(body.domains) ? body.domains : [];
  if (body.tags !== undefined) updates.tags = Array.isArray(body.tags) ? body.tags : [];
  if (body.trustStatus !== undefined) updates.trustStatus = body.trustStatus;
  if (body.notes !== undefined) updates.notes = body.notes;

  const contact = updateContact(id, updates);
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(contact);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ok = deleteContact(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
