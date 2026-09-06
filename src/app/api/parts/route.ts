import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { parts, partReferences, brands, categories } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { splitReferences, normReference } from "@/lib/normalize";
import { getSettings } from "@/lib/settings";
import { listParts, type PartFilters } from "@/lib/queries";
import { imageUrl } from "@/lib/images";
import { stockStatusOf, toNum, type StockStatus } from "@/lib/format";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const filters: PartFilters = {
    q: sp.get("q") ?? undefined,
    brand: sp.get("brand") ?? undefined,
    category: sp.get("category") ?? undefined,
    rayon: sp.get("rayon") ?? undefined,
    status: (sp.get("status") as StockStatus) || undefined,
  };
  const { rows, total } = await listParts(filters, {
    page: Number(sp.get("page")) || 1,
    perPage: Number(sp.get("perPage")) || 60,
    sort: (sp.get("sort") as "reference") || "reference",
  });
  return NextResponse.json({
    total,
    results: rows.map((r) => ({
      id: r.id,
      reference: r.reference,
      designation: r.designation,
      brand: r.brand,
      location: r.location,
      currentStock: toNum(r.currentStock),
      minStock: toNum(r.minStock),
      status: stockStatusOf(r.currentStock, r.minStock),
      retailPrice: toNum(r.retailPrice),
      wholesalePrice: toNum(r.wholesalePrice),
      image: r.imageFilename ? imageUrl(r.imageFilename, r.imageUpdatedAt) : null,
      altCount: r.altCount,
    })),
  });
}

async function ensureNamed(
  table: typeof brands | typeof categories,
  name: string,
): Promise<number | null> {
  const clean = name.trim();
  if (!clean) return null;
  const [inserted] = await db
    .insert(table)
    .values({ name: clean })
    .onConflictDoNothing()
    .returning();
  if (inserted) return inserted.id;
  const [found] = await db
    .select()
    .from(table)
    .where(eq(table.name, clean));
  return found?.id ?? null;
}

export async function POST(req: NextRequest) {
  const forbidden = await requireAdmin(req);
  if (forbidden) return forbidden;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const referenceCell = String(body.reference ?? "").trim();
  const designation = String(body.designation ?? "").trim();
  const tokens = splitReferences(referenceCell);
  if (!tokens.length) {
    return NextResponse.json({ error: "La référence est obligatoire." }, { status: 400 });
  }
  if (!designation) {
    return NextResponse.json({ error: "La désignation est obligatoire." }, { status: 400 });
  }

  // Empêche le doublon lors d'une création manuelle : recherche dans les
  // références principales ET alternatives (normalisées).
  const normalizedTokens = tokens.map(normReference).filter(Boolean);
  if (normalizedTokens.length) {
    const dupRows = await db.execute(sql`
      SELECT p.id, p.reference
      FROM parts p
      WHERE ${sql.join(
        normalizedTokens.map(
          (t) =>
            sql`(lower(p.reference) = ${t} OR EXISTS (
               SELECT 1 FROM part_references r
               WHERE r.part_id = p.id AND lower(r.reference) = ${t}
             ))`,
        ),
        sql` OR `,
      )}
      LIMIT 1
    `);
    const dup = (dupRows.rows as Array<{ id: number; reference: string }>)[0];
    if (dup) {
      return NextResponse.json(
        {
          error: `Cette référence existe déjà (pièce ${dup.reference}). Importez-la plutôt avec la stratégie de mise à jour.`,
          code: "DUPLICATE",
          partId: dup.id,
        },
        { status: 409 },
      );
    }
  }

  const num = (v: unknown): number => {
    const n = Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const cfg = await getSettings();
  const brandId = await ensureNamed(brands, String(body.brand ?? ""));
  const categoryId = await ensureNamed(categories, String(body.category ?? ""));

  const initial = num(body.initialStock);
  const [part] = await db
    .insert(parts)
    .values({
      reference: tokens[0],
      referenceRaw: referenceCell,
      designation,
      brandId,
      categoryId,
      purchasePrice: String(num(body.purchasePrice)),
      wholesalePrice: String(num(body.wholesalePrice)),
      retailPrice: String(num(body.retailPrice)),
      initialStock: String(initial),
      currentStock: String(initial),
      minStock: String(num(body.minStock) || cfg.defaultMinStock),
      unit: String(body.unit ?? "").trim() || "U",
      location: String(body.location ?? "").trim() || null,
      description: String(body.description ?? "").trim() || null,
      notes: String(body.notes ?? "").trim() || null,
    })
    .returning();

  await db.insert(partReferences).values(
    tokens.map((t, i) => ({ partId: part.id, reference: t, isPrimary: i === 0 })),
  );

  return NextResponse.json({ id: part.id, reference: part.reference }, { status: 201 });
}
