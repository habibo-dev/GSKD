import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { parts, partReferences, brands, categories, suppliers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { splitReferences, norm } from "@/lib/normalize";
import { deletePartImage } from "@/lib/images";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "ID invalide" }, { status: 400 });
  const [part] = await db.select().from(parts).where(eq(parts.id, id));
  if (!part) return NextResponse.json({ error: "Pièce introuvable" }, { status: 404 });
  return NextResponse.json({ part });
}

const num = (v: unknown, fallback: number | null = null): string | null => {
  const n = Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return fallback === null ? null : String(fallback);
  return String(n);
};

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "ID invalide" }, { status: 400 });

  const [existing] = await db.select().from(parts).where(eq(parts.id, id));
  if (!existing) return NextResponse.json({ error: "Pièce introuvable" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }

  const referenceCell = String(body.reference ?? existing.referenceRaw ?? existing.reference).trim();
  const tokens = splitReferences(referenceCell);
  if (!tokens.length) return NextResponse.json({ error: "La référence est obligatoire." }, { status: 400 });
  const designation = String(body.designation ?? existing.designation).trim();
  if (!designation) return NextResponse.json({ error: "La désignation est obligatoire." }, { status: 400 });

  async function brandIdFor(name: unknown): Promise<number | null> {
    const clean = String(name ?? "").trim();
    if (!clean) return null;
    const [ins] = await db.insert(brands).values({ name: clean }).onConflictDoNothing().returning();
    if (ins) return ins.id;
    const [f] = await db.select().from(brands).where(eq(brands.name, clean));
    return f?.id ?? null;
  }
  async function categoryIdFor(name: unknown): Promise<number | null> {
    const clean = String(name ?? "").trim();
    if (!clean) return null;
    const [ins] = await db.insert(categories).values({ name: clean }).onConflictDoNothing().returning();
    if (ins) return ins.id;
    const [f] = await db.select().from(categories).where(eq(categories.name, clean));
    return f?.id ?? null;
  }
  async function supplierIdFor(name: unknown): Promise<number | null> {
    const clean = String(name ?? "").trim();
    if (!clean) return null;
    const [ins] = await db.insert(suppliers).values({ name: clean }).onConflictDoNothing().returning();
    if (ins) return ins.id;
    const [f] = await db.select().from(suppliers).where(eq(suppliers.name, clean));
    return f?.id ?? null;
  }

  await db
    .update(parts)
    .set({
      reference: tokens[0],
      referenceRaw: referenceCell,
      designation,
      brandId: body.brand !== undefined ? await brandIdFor(body.brand) : existing.brandId,
      categoryId: body.category !== undefined ? await categoryIdFor(body.category) : existing.categoryId,
      supplierId: body.supplier !== undefined ? await supplierIdFor(body.supplier) : existing.supplierId,
      purchasePrice: num(body.purchasePrice) ?? existing.purchasePrice,
      wholesalePrice: num(body.wholesalePrice) ?? existing.wholesalePrice,
      retailPrice: num(body.retailPrice) ?? existing.retailPrice,
      minStock: num(body.minStock) ?? existing.minStock,
      unit: String(body.unit ?? existing.unit).trim() || "U",
      location: body.location !== undefined ? String(body.location ?? "").trim() || null : existing.location,
      description: body.description !== undefined ? String(body.description ?? "").trim() || null : existing.description,
      notes: body.notes !== undefined ? String(body.notes ?? "").trim() || null : existing.notes,
      updatedAt: new Date(),
    })
    .where(eq(parts.id, id));

  // Synchronise les références (conserve l'historique des jetons existants)
  const refs = await db.select().from(partReferences).where(eq(partReferences.partId, id));
  const existingKeys = new Set(refs.map((r) => norm(r.reference)));
  for (const [i, token] of tokens.entries()) {
    if (!existingKeys.has(norm(token))) {
      await db.insert(partReferences).values({ partId: id, reference: token, isPrimary: i === 0 && !refs.some((r) => r.isPrimary) });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "ID invalide" }, { status: 400 });
  const [existing] = await db.select().from(parts).where(eq(parts.id, id));
  if (!existing) return NextResponse.json({ error: "Pièce introuvable" }, { status: 404 });

  await deletePartImage(id); // supprime le fichier + la ligne image
  await db.delete(parts).where(eq(parts.id, id)); // cascade : références, compatibilités
  return NextResponse.json({ ok: true });
}
