import { db } from "@/db";
import {
  parts,
  partReferences,
  brands,
  categories,
  suppliers,
  images,
  stockMovements,
  sales,
  saleItems,
  vehicles,
  compatibilities,
  importBatches,
} from "@/db/schema";
import { eq, desc, ilike, or, asc, sql, and, gte, lte, type SQL } from "drizzle-orm";
import { queryWords, norm, normReference } from "@/lib/normalize";
import { stockStatusOf, toNum, type StockStatus } from "@/lib/format";

// ---------------------------------------------------------------------------
// Types de présentation
// ---------------------------------------------------------------------------
export type PartRow = {
  id: number;
  reference: string;
  referenceRaw: string | null;
  designation: string;
  brand: string | null;
  category: string | null;
  purchasePrice: string;
  wholesalePrice: string;
  retailPrice: string;
  initialStock: string;
  currentStock: string;
  soldQuantity: string;
  minStock: string;
  unit: string;
  location: string | null;
  notes: string | null;
  description: string | null;
  imageFilename: string | null;
  imageUpdatedAt: Date | null;
  altCount: number;
  createdAt: Date;
  updatedAt: Date;
};

const partSelect = {
  id: parts.id,
  reference: parts.reference,
  referenceRaw: parts.referenceRaw,
  designation: parts.designation,
  brand: brands.name,
  category: categories.name,
  purchasePrice: parts.purchasePrice,
  wholesalePrice: parts.wholesalePrice,
  retailPrice: parts.retailPrice,
  initialStock: parts.initialStock,
  currentStock: parts.currentStock,
  soldQuantity: parts.soldQuantity,
  minStock: parts.minStock,
  unit: parts.unit,
  location: parts.location,
  notes: parts.notes,
  description: parts.description,
  imageFilename: images.filename,
  imageUpdatedAt: images.updatedAt,
  createdAt: parts.createdAt,
  updatedAt: parts.updatedAt,
};

function basePartQuery() {
  return db
    .select(partSelect)
    .from(parts)
    .leftJoin(brands, eq(parts.brandId, brands.id))
    .leftJoin(categories, eq(parts.categoryId, categories.id))
    .leftJoin(images, eq(images.partId, parts.id));
}

/** Construit le filtre texte multi-mots : chaque mot doit correspondre quelque part. */
function textFilter(q: string, defaultMinStock: number): SQL | undefined {
  const words = queryWords(q);
  if (!words.length) return undefined;
  void defaultMinStock;
  const clauses: SQL[] = words.map((w) => {
    const like = `%${w}%`;
    const refLike = `%${normReference(w)}%`;
    // La référence normalisée permet de trouver "7703800107" même si la
    // donnée d'origine contient des points / espaces parasites.
    return sql`(
      parts.reference ILIKE ${like}
      OR regexp_replace(parts.reference, '[^A-Za-z0-9]', '', 'g') ILIKE ${refLike}
      OR EXISTS (SELECT 1 FROM part_references r WHERE r.part_id = parts.id AND (
        r.reference ILIKE ${like}
        OR regexp_replace(r.reference, '[^A-Za-z0-9]', '', 'g') ILIKE ${refLike}
      ))
      OR parts.designation ILIKE ${like}
      OR parts.description ILIKE ${like}
      OR parts.location ILIKE ${like}
      OR EXISTS (SELECT 1 FROM brands b WHERE b.id = parts.brand_id AND b.name ILIKE ${like})
      OR EXISTS (SELECT 1 FROM categories c WHERE c.id = parts.category_id AND c.name ILIKE ${like})
      /* Compatibilité véhicules : recherche par marque, modèle, moteur, carburant */
      OR EXISTS (
        SELECT 1 FROM compatibilities cp
        JOIN vehicles v ON v.id = cp.vehicle_id
        WHERE cp.part_id = parts.id AND (
          v.brand ILIKE ${like} OR v.model ILIKE ${like}
          OR v.engine ILIKE ${like} OR v.fuel ILIKE ${like}
          OR coalesce(v.notes, '') ILIKE ${like}
        )
      )
    )`;
  });
  return and(...clauses);
}

function statusFilter(status: StockStatus): SQL {
  if (status === "rupture")
    return sql`${parts.currentStock} <= 0`;
  if (status === "faible")
    return sql`${parts.currentStock} > 0 AND ${parts.currentStock} <= ${parts.minStock}`;
  return sql`${parts.currentStock} > ${parts.minStock}`;
}

export type PartFilters = {
  q?: string;
  brand?: string;
  category?: string;
  rayon?: string;
  status?: StockStatus | "";
  supplierId?: number;
};

function buildWhere(filters: PartFilters): SQL | undefined {
  const clauses: SQL[] = [];
  const t = filters.q ? textFilter(filters.q, 2) : undefined;
  if (t) clauses.push(t);
  if (filters.brand) clauses.push(ilike(brands.name, filters.brand));
  if (filters.category) clauses.push(ilike(categories.name, filters.category));
  if (filters.rayon) clauses.push(ilike(parts.location, filters.rayon));
  if (filters.status) clauses.push(statusFilter(filters.status));
  if (filters.supplierId) clauses.push(eq(parts.supplierId, filters.supplierId));
  if (!clauses.length) return undefined;
  return and(...clauses);
}

export async function listParts(
  filters: PartFilters,
  opts: {
    sort?: "reference" | "designation" | "stock" | "prix" | "recent" | "marque";
    page?: number;
    perPage?: number;
  } = {},
) {
  const where = buildWhere(filters);
  const page = Math.max(1, opts.page ?? 1);
  const perPage = Math.min(200, opts.perPage ?? 40);

  const orderBy: SQL[] = [];
  switch (opts.sort) {
    case "designation":
      orderBy.push(asc(parts.designation));
      break;
    case "stock":
      orderBy.push(asc(parts.currentStock));
      break;
    case "prix":
      orderBy.push(desc(parts.retailPrice));
      break;
    case "marque":
      orderBy.push(asc(brands.name));
      break;
    case "recent":
      orderBy.push(desc(parts.updatedAt));
      break;
    default:
      orderBy.push(asc(parts.reference));
  }

  const rows = await db
    .select({ ...partSelect })
    .from(parts)
    .leftJoin(brands, eq(parts.brandId, brands.id))
    .leftJoin(categories, eq(parts.categoryId, categories.id))
    .leftJoin(images, eq(images.partId, parts.id))
    .where(where)
    .orderBy(...orderBy)
    .limit(perPage)
    .offset((page - 1) * perPage);

  const countRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(parts)
    .leftJoin(brands, eq(parts.brandId, brands.id))
    .leftJoin(categories, eq(parts.categoryId, categories.id))
    .where(where);

  const altCounts = await altCountsFor(rows.map((r) => r.id));
  return {
    rows: rows.map((r) => ({ ...r, altCount: altCounts.get(r.id) ?? 0 })),
    total: countRows[0]?.n ?? 0,
    page,
    perPage,
  };
}

async function altCountsFor(ids: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (!ids.length) return map;
  const res = await db.execute(sql`
    SELECT part_id, count(*)::int AS n FROM part_references
    WHERE part_id IN ${ids} GROUP BY part_id
  `);
  for (const r of res.rows as Array<{ part_id: number; n: number }>) {
    map.set(r.part_id, r.n);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Recherche rapide avec classement par pertinence
// ---------------------------------------------------------------------------
export async function searchParts(q: string, limit = 24): Promise<PartRow[]> {
  const words = queryWords(q);
  if (!words.length) return [];
  const where = textFilter(q, 2);
  const exact = words.join(" ");

  const rows = await db
    .select(partSelect)
    .from(parts)
    .leftJoin(brands, eq(parts.brandId, brands.id))
    .leftJoin(categories, eq(parts.categoryId, categories.id))
    .leftJoin(images, eq(images.partId, parts.id))
    .where(where)
    .orderBy(
      sql`(
        CASE WHEN lower(${parts.reference}) = ${norm(exact)} THEN 0
             WHEN EXISTS (SELECT 1 FROM part_references r WHERE r.part_id = parts.id AND lower(r.reference) = ${norm(exact)}) THEN 1
             WHEN ${parts.reference} ILIKE ${exact + "%"} THEN 2
             WHEN EXISTS (SELECT 1 FROM part_references r WHERE r.part_id = parts.id AND r.reference ILIKE ${exact + "%"}) THEN 3
             WHEN lower(${parts.designation}) = ${norm(exact)} THEN 4
             ELSE 5 END
      )`,
      asc(parts.reference),
    )
    .limit(limit);

  const altCounts = await altCountsFor(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, altCount: altCounts.get(r.id) ?? 0 }));
}

// ---------------------------------------------------------------------------
// Détail d'une pièce
// ---------------------------------------------------------------------------
export async function getPartDetail(id: number) {
  const [row] = await basePartQuery()
    .where(eq(parts.id, id))
    .limit(1);
  if (!row) return null;

  const refs = await db
    .select()
    .from(partReferences)
    .where(eq(partReferences.partId, id));

  const agg = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'entree' THEN quantity ELSE 0 END), 0) AS entrees,
      COALESCE(SUM(CASE WHEN type = 'retour' THEN quantity ELSE 0 END), 0) AS retours,
      COALESCE(SUM(CASE WHEN type = 'vente' THEN quantity ELSE 0 END), 0) AS vendus,
      COALESCE(SUM(CASE WHEN type = 'sortie' THEN quantity ELSE 0 END), 0) AS sorties,
      COALESCE(SUM(CASE WHEN type = 'ajustement_pos' THEN quantity ELSE 0 END), 0) AS aj_pos,
      COALESCE(SUM(CASE WHEN type = 'ajustement_neg' THEN quantity ELSE 0 END), 0) AS aj_neg
    FROM stock_movements WHERE part_id = ${id}
  `);

  const movements = await db
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.partId, id))
    .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
    .limit(30);

  const compats = await db
    .select({
      id: compatibilities.id,
      oemReference: compatibilities.oemReference,
      source: compatibilities.source,
      verified: compatibilities.verified,
      notes: compatibilities.notes,
      vehicleId: vehicles.id,
      brand: vehicles.brand,
      model: vehicles.model,
      yearFrom: vehicles.yearFrom,
      yearTo: vehicles.yearTo,
      engine: vehicles.engine,
      fuel: vehicles.fuel,
    })
    .from(compatibilities)
    .innerJoin(vehicles, eq(compatibilities.vehicleId, vehicles.id))
    .where(eq(compatibilities.partId, id));

  const supplierName = await (async () => {
    const p = await db.select({ s: suppliers.name }).from(parts).leftJoin(suppliers, eq(parts.supplierId, suppliers.id)).where(eq(parts.id, id));
    return p[0]?.s ?? null;
  })();

  const a = agg.rows[0] as {
    entrees: string;
    retours: string;
    vendus: string;
    sorties: string;
    aj_pos: string;
    aj_neg: string;
  };

  return {
    part: { ...row, altCount: refs.length },
    references: refs,
    aggregates: {
      entrees: toNum(a.entrees),
      retours: toNum(a.retours),
      vendus: toNum(a.vendus),
      sorties: toNum(a.sorties),
      ajustementsPos: toNum(a.aj_pos),
      ajustementsNeg: toNum(a.aj_neg),
    },
    movements,
    compatibilities: compats,
    supplierName,
  };
}

// ---------------------------------------------------------------------------
// Tableau de bord
// ---------------------------------------------------------------------------
export async function dashboardStats() {
  const totals = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM parts) AS refs,
      (SELECT count(*)::int FROM part_references) AS tokens,
      COALESCE((SELECT sum(current_stock) FROM parts), 0) AS total_qty,
      (SELECT count(*)::int FROM parts WHERE current_stock > min_stock) AS disponibles,
      (SELECT count(*)::int FROM parts WHERE current_stock > 0 AND current_stock <= min_stock) AS faibles,
      (SELECT count(*)::int FROM parts WHERE current_stock <= 0) AS ruptures,
      COALESCE((SELECT sum(current_stock * purchase_price) FROM parts), 0) AS valeur_achat,
      COALESCE((SELECT sum(current_stock * retail_price) FROM parts), 0) AS valeur_detail
  `);

  const today = await db.execute(sql`
    SELECT
      COALESCE(sum(si.line_total), 0) AS montant,
      COALESCE(sum(si.quantity), 0) AS quantite,
      count(DISTINCT s.id)::int AS ventes
    FROM sale_items si JOIN sales s ON s.id = si.sale_id
    WHERE s.created_at::date = CURRENT_DATE
  `);

  const recentMovements = await db
    .select({
      id: stockMovements.id,
      type: stockMovements.type,
      quantity: stockMovements.quantity,
      previousStock: stockMovements.previousStock,
      newStock: stockMovements.newStock,
      userName: stockMovements.userName,
      reason: stockMovements.reason,
      createdAt: stockMovements.createdAt,
      partId: parts.id,
      reference: stockMovements.partReference,
      designation: parts.designation,
    })
    .from(stockMovements)
    .leftJoin(parts, eq(stockMovements.partId, parts.id))
    .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
    .limit(8);

  const topSellers = await db.execute(sql`
    SELECT si.part_id AS id, si.part_reference AS reference,
           max(si.designation) AS designation,
           sum(si.quantity)::float AS vendus, sum(si.line_total)::float AS ca
    FROM sale_items si
    GROUP BY si.part_id, si.part_reference
    ORDER BY vendus DESC LIMIT 5
  `);

  const lowStock = await basePartQuery()
    .where(sql`${parts.currentStock} <= ${parts.minStock}`)
    .orderBy(asc(parts.currentStock))
    .limit(6);

  return {
    totals: totals.rows[0] as {
      refs: number;
      tokens: number;
      total_qty: string;
      disponibles: number;
      faibles: number;
      ruptures: number;
      valeur_achat: string;
      valeur_detail: string;
    },
    today: today.rows[0] as { montant: string; quantite: string; ventes: number },
    recentMovements,
    topSellers: topSellers.rows as Array<{
      id: number;
      reference: string;
      designation: string;
      vendus: number;
      ca: number;
    }>,
    lowStock: lowStock.map((r) => ({ ...r, altCount: 0 })),
  };
}

// ---------------------------------------------------------------------------
// Listes simples (menus, filtres, typeahead)
// ---------------------------------------------------------------------------
export async function listBrands() {
  return db.select().from(brands).orderBy(asc(brands.name));
}
export async function listCategories() {
  return db.select().from(categories).orderBy(asc(categories.name));
}
export async function listSuppliers() {
  return db.select().from(suppliers).orderBy(asc(suppliers.name));
}
export async function listRayons(): Promise<string[]> {
  const res = await db.execute(
    sql`SELECT DISTINCT location FROM parts WHERE location IS NOT NULL AND location <> '' ORDER BY location`,
  );
  return (res.rows as Array<{ location: string }>).map((r) => r.location);
}

// ---------------------------------------------------------------------------
// Mouvements / Ventes pour les pages listes
// ---------------------------------------------------------------------------
export async function listMovements(opts: {
  partId?: number;
  type?: string;
  q?: string;
  limit?: number;
}) {
  const clauses: SQL[] = [];
  if (opts.partId) clauses.push(eq(stockMovements.partId, opts.partId));
  if (opts.type) clauses.push(eq(stockMovements.type, opts.type));
  if (opts.q) {
    const like = `%${norm(opts.q)}%`;
    clauses.push(
      or(
        ilike(stockMovements.partReference, like),
        ilike(parts.designation, like),
        ilike(stockMovements.reason, like),
      )!,
    );
  }
  return db
    .select({
      id: stockMovements.id,
      type: stockMovements.type,
      quantity: stockMovements.quantity,
      previousStock: stockMovements.previousStock,
      newStock: stockMovements.newStock,
      userName: stockMovements.userName,
      reason: stockMovements.reason,
      documentRef: stockMovements.documentRef,
      createdAt: stockMovements.createdAt,
      partId: stockMovements.partId,
      partReference: stockMovements.partReference,
      designation: parts.designation,
      saleId: stockMovements.saleId,
    })
    .from(stockMovements)
    .leftJoin(parts, eq(stockMovements.partId, parts.id))
    .where(clauses.length ? and(...clauses) : undefined)
    .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
    .limit(Math.min(500, opts.limit ?? 120));
}

export async function listSales(limit = 60) {
  const rows = await db
    .select()
    .from(sales)
    .orderBy(desc(sales.createdAt), desc(sales.id))
    .limit(limit);
  if (!rows.length) return [];
  const ids = rows.map((s) => s.id);
  const items = await db.execute(sql`
    SELECT * FROM sale_items WHERE sale_id IN ${ids} ORDER BY id
  `);
  const bySale = new Map<number, unknown[]>();
  for (const it of items.rows as Array<{ sale_id: number }>) {
    const arr = bySale.get(it.sale_id) ?? [];
    arr.push(it);
    bySale.set(it.sale_id, arr);
  }
  return rows.map((s) => ({ ...s, items: (bySale.get(s.id) ?? []) as Array<Record<string, unknown>> }));
}

export async function listVehicles() {
  const rows = await db.select().from(vehicles).orderBy(asc(vehicles.brand), asc(vehicles.model));
  const counts = await db.execute(sql`
    SELECT vehicle_id, count(*)::int AS n FROM compatibilities GROUP BY vehicle_id
  `);
  const map = new Map<number, number>();
  for (const r of counts.rows as Array<{ vehicle_id: number; n: number }>) {
    map.set(r.vehicle_id, r.n);
  }
  return rows.map((v) => ({ ...v, compatCount: map.get(v.id) ?? 0 }));
}

export async function listCompatibilities() {
  return db
    .select({
      id: compatibilities.id,
      oemReference: compatibilities.oemReference,
      source: compatibilities.source,
      verified: compatibilities.verified,
      notes: compatibilities.notes,
      createdAt: compatibilities.createdAt,
      partId: parts.id,
      reference: parts.reference,
      designation: parts.designation,
      vehicleId: vehicles.id,
      vBrand: vehicles.brand,
      vModel: vehicles.model,
      vYearFrom: vehicles.yearFrom,
      vYearTo: vehicles.yearTo,
      vEngine: vehicles.engine,
      vFuel: vehicles.fuel,
    })
    .from(compatibilities)
    .innerJoin(parts, eq(compatibilities.partId, parts.id))
    .innerJoin(vehicles, eq(compatibilities.vehicleId, vehicles.id))
    .orderBy(desc(compatibilities.createdAt))
    .limit(200);
}

export async function listImportBatches() {
  return db.select().from(importBatches).orderBy(desc(importBatches.createdAt)).limit(15);
}

// ---------------------------------------------------------------------------
// Rapports
// ---------------------------------------------------------------------------
export async function salesReport(from?: string, to?: string) {
  const clauses: SQL[] = [];
  if (from) clauses.push(gte(sales.createdAt, new Date(`${from}T00:00:00`)));
  if (to) clauses.push(lte(sales.createdAt, new Date(`${to}T23:59:59`)));
  const where = clauses.length ? and(...clauses) : undefined;

  const kpi = await db
    .select({
      ventes: sql<number>`count(DISTINCT ${sales.id})::int`,
      lignes: sql<number>`count(${saleItems.id})::int`,
      quantite: sql<string>`COALESCE(sum(${saleItems.quantity}), 0)`,
      montant: sql<string>`COALESCE(sum(${saleItems.lineTotal}), 0)`,
    })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .where(where);

  const top = await db.execute(sql`
    SELECT si.part_reference AS reference, max(si.designation) AS designation,
           sum(si.quantity)::float AS quantite, sum(si.line_total)::float AS montant
    FROM sale_items si JOIN sales s ON s.id = si.sale_id
    ${where ? sql`WHERE ${where}` : sql``}
    GROUP BY si.part_reference ORDER BY quantite DESC LIMIT 10
  `);

  const byDay = await db.execute(sql`
    SELECT s.created_at::date AS jour, count(DISTINCT s.id)::int AS ventes,
           sum(si.line_total)::float AS montant, sum(si.quantity)::float AS quantite
    FROM sales s JOIN sale_items si ON si.sale_id = s.id
    ${where ? sql`WHERE ${where}` : sql``}
    GROUP BY s.created_at::date ORDER BY jour DESC LIMIT 31
  `);

  return {
    kpi: kpi[0] ?? { ventes: 0, lignes: 0, quantite: "0", montant: "0" },
    top: top.rows as Array<{ reference: string; designation: string; quantite: number; montant: number }>,
    byDay: byDay.rows as Array<{ jour: string; ventes: number; montant: number; quantite: number }>,
  };
}
