import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { brands, categories, suppliers } from "@/db/schema";
import {
  listBrands,
  listCategories,
  listRayons,
  listSuppliers,
  listVehicles,
} from "@/lib/queries";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const [brandList, categoryList, rayons, supplierList, vehicleList] =
    await Promise.all([
      listBrands(),
      listCategories(),
      listRayons(),
      listSuppliers(),
      listVehicles(),
    ]);
  return NextResponse.json({
    brands: brandList,
    categories: categoryList,
    rayons,
    suppliers: supplierList,
    vehicles: vehicleList,
  });
}

export async function POST(req: NextRequest) {
  const forbidden = await requireAdmin(req);
  if (forbidden) return forbidden;

  let body: { entity?: string; name?: string; phone?: string; email?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Nom obligatoire." }, { status: 400 });

  if (body.entity === "brand") {
    const [row] = await db.insert(brands).values({ name }).onConflictDoNothing().returning();
    return NextResponse.json({ ok: true, id: row?.id ?? null });
  }
  if (body.entity === "category") {
    const [row] = await db.insert(categories).values({ name }).onConflictDoNothing().returning();
    return NextResponse.json({ ok: true, id: row?.id ?? null });
  }
  if (body.entity === "supplier") {
    const [row] = await db
      .insert(suppliers)
      .values({ name, phone: body.phone || null, email: body.email || null, notes: body.notes || null })
      .onConflictDoNothing()
      .returning();
    return NextResponse.json({ ok: true, id: row?.id ?? null });
  }
  return NextResponse.json({ error: "Entité inconnue." }, { status: 400 });
}
