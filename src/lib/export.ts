import * as XLSX from "xlsx";
import { db } from "@/db";
import { partReferences } from "@/db/schema";
import { listParts, listMovements, type PartFilters } from "@/lib/queries";
import { sql, type SQL } from "drizzle-orm";
import { toNum } from "@/lib/format";

// ---------------------------------------------------------------------------
// Export Excel — colonnes françaises, libellés métier conservés
// ---------------------------------------------------------------------------

export type ExportType =
  | "stock"
  | "catalogue"
  | "stock-faible"
  | "ruptures"
  | "ventes"
  | "mouvements";

const HEADERS_STOCK = [
  "Référence",
  "Références alternatives",
  "Désignation",
  "Marque",
  "Catégorie",
  "Rayon",
  "UM",
  "Stock initial",
  "Entrées",
  "Vendus",
  "Stock restant",
  "Stock minimum",
  "Statut",
  "Prix d'Achat",
  "Prix Gros",
  "Prix Détail",
];

function statusLabel(current: string, min: string) {
  const c = toNum(current);
  const m = toNum(min);
  if (c <= 0) return "Rupture";
  if (c <= m) return "Stock faible";
  return "Disponible";
}

function bookFromAoa(aoa: (string | number)[][], widths: number[]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = widths.map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Export");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

async function stockRows(filters: PartFilters) {
  const { rows } = await listParts(filters, { perPage: 5000, page: 1 });
  const agg = await db.execute(sql`
    SELECT part_id,
      COALESCE(SUM(CASE WHEN type IN ('entree','retour','ajustement_pos') THEN quantity ELSE 0 END), 0) AS entrees,
      COALESCE(SUM(CASE WHEN type = 'vente' THEN quantity ELSE 0 END), 0) AS vendus
    FROM stock_movements GROUP BY part_id
  `);
  const byId = new Map<number, { entrees: string; vendus: string }>();
  for (const r of agg.rows as Array<{ part_id: number; entrees: string; vendus: string }>) {
    byId.set(r.part_id, { entrees: r.entrees, vendus: r.vendus });
  }
  const allRefs = await db.select().from(partReferences);
  const refsByPart = new Map<number, string[]>();
  for (const r of allRefs) {
    const arr = refsByPart.get(r.partId) ?? [];
    if (!r.isPrimary) arr.push(r.reference);
    refsByPart.set(r.partId, arr);
  }
  return rows.map((r) => {
    const a = byId.get(r.id);
    return [
      r.reference,
      (refsByPart.get(r.id) ?? []).join(" / "),
      r.designation,
      r.brand ?? "",
      r.category ?? "",
      r.location ?? "",
      r.unit,
      toNum(r.initialStock),
      toNum(a?.entrees ?? 0),
      toNum(a?.vendus ?? 0),
      toNum(r.currentStock),
      toNum(r.minStock),
      statusLabel(r.currentStock, r.minStock),
      toNum(r.purchasePrice),
      toNum(r.wholesalePrice),
      toNum(r.retailPrice),
    ] as (string | number)[];
  });
}

export async function buildExport(
  type: ExportType,
  filters: PartFilters & { from?: string; to?: string } = {},
): Promise<{ buffer: Buffer; filename: string }> {
  const stamp = new Date().toISOString().slice(0, 10);

  if (type === "catalogue") {
    const { rows } = await listParts(filters, { perPage: 5000, page: 1 });
    const allRefs = await db.select().from(partReferences);
    const refsByPart = new Map<number, string[]>();
    for (const r of allRefs) {
      const arr = refsByPart.get(r.partId) ?? [];
      if (!r.isPrimary) arr.push(r.reference);
      refsByPart.set(r.partId, arr);
    }
    const aoa: (string | number)[][] = [
      ["Référence", "Références alternatives", "Désignation", "Marque", "Catégorie", "Rayon", "UM", "Prix Gros", "Prix Détail"],
      ...rows.map(
        (r) =>
          [
            r.reference,
            (refsByPart.get(r.id) ?? []).join(" / "),
            r.designation,
            r.brand ?? "",
            r.category ?? "",
            r.location ?? "",
            r.unit,
            toNum(r.wholesalePrice),
            toNum(r.retailPrice),
          ] as (string | number)[],
      ),
    ];
    return {
      buffer: bookFromAoa(aoa, [16, 24, 40, 16, 16, 8, 6, 12, 12]),
      filename: `catalogue-prix-de-vente-${stamp}.xlsx`,
    };
  }

  if (type === "stock" || type === "stock-faible" || type === "ruptures") {
    const f: PartFilters = { ...filters };
    if (type === "stock-faible") f.status = "faible";
    if (type === "ruptures") f.status = "rupture";
    const aoa: (string | number)[][] = [HEADERS_STOCK, ...(await stockRows(f))];
    return {
      buffer: bookFromAoa(aoa, [16, 24, 38, 14, 14, 8, 6, 12, 10, 10, 12, 12, 12, 12, 12, 12]),
      filename: `${type}-${stamp}.xlsx`,
    };
  }

  if (type === "ventes") {
    const clauses: SQL[] = [];
    if (filters.from) clauses.push(sql`s.created_at::date >= ${filters.from}`);
    if (filters.to) clauses.push(sql`s.created_at::date <= ${filters.to}`);
    const where =
      clauses.length > 1
        ? sql`WHERE ${clauses[0]} AND ${clauses[1]}`
        : clauses.length === 1
          ? sql`WHERE ${clauses[0]}`
          : sql``;
    const res = await db.execute(
      sql`SELECT s.number, s.created_at, si.part_reference, si.designation, si.quantity,
                si.price_type, si.unit_price, si.line_total, s.client_name, s.user_name
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         ${where} ORDER BY s.created_at DESC, si.id`,
    );
    const aoa: (string | number)[][] = [
      ["N° Vente", "Date", "Référence", "Désignation", "Quantité", "Type de prix", "Prix unitaire", "Total", "Client", "Vendeur"],
      ...(res.rows as Array<Record<string, unknown>>).map((r) => [
        String(r.number ?? ""),
        new Date(String(r.created_at)).toLocaleString("fr-FR"),
        String(r.part_reference ?? ""),
        String(r.designation ?? ""),
        toNum(r.quantity),
        r.price_type === "gros" ? "Prix Gros" : "Prix Détail",
        toNum(r.unit_price),
        toNum(r.line_total),
        String(r.client_name ?? ""),
        String(r.user_name ?? ""),
      ]),
    ];
    return {
      buffer: bookFromAoa(aoa, [10, 16, 16, 38, 10, 12, 12, 12, 16, 12]),
      filename: `ventes-${stamp}.xlsx`,
    };
  }

  // mouvements
  const rows = await listMovements({ limit: 5000 });
  const aoa: (string | number)[][] = [
    ["Date", "Référence", "Désignation", "Type", "Quantité", "Stock avant", "Stock après", "Utilisateur", "Motif", "Document"],
    ...rows.map((r) => [
      r.createdAt ? new Date(r.createdAt).toLocaleString("fr-FR") : "",
      r.partReference ?? "",
      r.designation ?? "",
      ({ entree: "Entrée", vente: "Vente", retour: "Retour", ajustement_pos: "Ajustement +", ajustement_neg: "Ajustement -" } as Record<string, string>)[r.type] ?? r.type,
      toNum(r.quantity),
      toNum(r.previousStock),
      toNum(r.newStock),
      r.userName ?? "",
      r.reason ?? "",
      r.documentRef ?? "",
    ]),
  ];
  return {
    buffer: bookFromAoa(aoa, [16, 16, 38, 12, 10, 11, 11, 14, 26, 16]),
    filename: `mouvements-${stamp}.xlsx`,
  };
}
