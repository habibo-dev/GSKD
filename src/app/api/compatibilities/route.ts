import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { compatibilities, parts, vehicles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { listCompatibilities } from "@/lib/queries";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ compatibilities: await listCompatibilities() });
}

export async function POST(req: NextRequest) {
  const forbidden = await requireAdmin(req);
  if (forbidden) return forbidden;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const partId = Number(body.partId);
  const vehicleId = Number(body.vehicleId);
  if (!Number.isInteger(partId) || !Number.isInteger(vehicleId)) {
    return NextResponse.json({ error: "Pièce ou véhicule invalide." }, { status: 400 });
  }
  const [part] = await db.select({ id: parts.id }).from(parts).where(eq(parts.id, partId));
  const [vehicle] = await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, vehicleId));
  if (!part || !vehicle) {
    return NextResponse.json({ error: "Pièce ou véhicule introuvable." }, { status: 404 });
  }
  const [row] = await db
    .insert(compatibilities)
    .values({
      partId,
      vehicleId,
      oemReference: String(body.oemReference ?? "").trim() || null,
      source: String(body.source ?? "").trim() || null,
      verified: Boolean(body.verified),
      notes: String(body.notes ?? "").trim() || null,
    })
    .returning();
  return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const forbidden = await requireAdmin(req);
  if (forbidden) return forbidden;

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "ID invalide." }, { status: 400 });
  }
  await db.delete(compatibilities).where(eq(compatibilities.id, id));
  return NextResponse.json({ ok: true });
}
