import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { vehicles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { listVehicles } from "@/lib/queries";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const FUELS = ["Essence", "Diesel", "GPL", "Hybride", "Électrique", "Autre"];

export async function GET() {
  return NextResponse.json({ vehicles: await listVehicles() });
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
  const brand = String(body.brand ?? "").trim();
  const model = String(body.model ?? "").trim();
  if (!brand || !model) {
    return NextResponse.json(
      { error: "La marque et le modèle du véhicule sont obligatoires." },
      { status: 400 },
    );
  }
  const year = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 1950 && n <= 2100 ? n : null;
  };
  const fuel = String(body.fuel ?? "").trim();
  const [row] = await db
    .insert(vehicles)
    .values({
      brand,
      model,
      yearFrom: year(body.yearFrom),
      yearTo: year(body.yearTo),
      engine: String(body.engine ?? "").trim() || null,
      fuel: FUELS.includes(fuel) ? fuel : fuel || null,
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
  await db.delete(vehicles).where(eq(vehicles.id, id));
  return NextResponse.json({ ok: true });
}
