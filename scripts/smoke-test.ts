// ---------------------------------------------------------------------------
// Test de fumée automatisé de la logique métier (sans navigateur).
//
// Exécute le schéma, insère un produit avec références alternatives, vérifie :
//   - recherche / référencement alternatif
//   - mouvement d'entrée (audit) et stock courant
//   - vente (décrément stock + mouvement + historique)
//   - import CSV (création + mise à jour sans double mouvement)
//   - export Excel
//
// Usage :
//   DATABASE_URL=pglite:///tmp/autostock-smoke db npm run test
// ou via `npm run test` (qui prépare un dossier temporaire propre).
// ---------------------------------------------------------------------------

import { promises as fs } from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { eq } from "drizzle-orm";
import { ensureSchema } from "@/db/bootstrap";
import { db } from "@/db";
import { parts, partReferences, brands, stockMovements, sales } from "@/db/schema";
import { splitReferences } from "@/lib/normalize";
import { searchParts, listParts, getPartDetail, listMovements, listSales } from "@/lib/queries";
import { toNum } from "@/lib/format";
import { applyStockChange, createSale } from "@/lib/movements";
import { executeImport, validateRows } from "@/lib/imports";
import { extractRows } from "@/lib/excel";
import { buildExport } from "@/lib/export";

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string, detail?: unknown) {
  if (cond) {
    passed += 1;
    console.log(`  ✔ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✘ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

async function main() {
  console.log("1/8 — Application du schéma");
  await ensureSchema();

  const [brand] = await db
    .insert(brands)
    .values({ name: "MarqueTest" })
    .onConflictDoNothing()
    .returning();
  const brandId = brand?.id ?? 1;

  console.log("2/8 — Insertion pièce + références alternatives");
  const [part] = await db
    .insert(parts)
    .values({
      reference: "7703800107",
      referenceRaw: "7703800107 / 8200651172",
      designation: "Filtre à huile test",
      brandId,
      purchasePrice: "800",
      wholesalePrice: "1100",
      retailPrice: "1400",
      initialStock: "10",
      currentStock: "10",
      unit: "U",
      location: "A2",
    })
    .returning();
  const partId = part.id;
  for (const [i, token] of splitReferences("7703800107 / 8200651172").entries()) {
    await db.insert(partReferences).values({ partId, reference: token, isPrimary: i === 0 });
  }

  console.log("3/8 — Recherche par référence primaire et alternative");
  const byPrimary = await searchParts("7703800107", 5);
  const byAlt = await searchParts("8200651172", 5);
  assert(byPrimary.some((r) => r.id === partId), "« 7703800107 » retrouve la pièce", byPrimary[0]?.id);
  assert(byAlt.some((r) => r.id === partId), "« 8200651172 » retrouve la même pièce", byAlt[0]?.id);
  const detail = await getPartDetail(partId);
  assert(detail !== null, "Le détail de la pièce est accessible");

  console.log("4/8 — Mouvement d'entrée (audit + stock)");
  const entry = await db.transaction((tx) =>
    applyStockChange(tx, {
      partId,
      type: "entree",
      quantity: 5,
      userName: "Smoke Test",
      reason: "Réception test",
      documentRef: "BL-TEST-01",
    }),
  );
  assert(entry.previousStock === 10 && entry.newStock === 15, "Entrée 10 → 15 enregistrée");
  const entries = await listMovements({ partId, type: "entree", limit: 10 });
  assert(entries.some((m) => m.type === "entree" && toNum(m.newStock) === 15), "Mouvement d'entrée tracé", entries[0]?.newStock);

  console.log("5/8 — Vente (décrément + historique)");
  const sale = await createSale({
    clientName: "Client test",
    userName: "Smoke Test",
    notes: `smoke-${Date.now()}`,
    items: [{ partId, quantity: 2, priceType: "detail" }],
  });
  const afterSale = await getPartDetail(partId);
  if (!afterSale) throw new Error("Pièce introuvable après vente");
  assert(toNum(afterSale.part.currentStock) === 13, "Stock après vente 15 → 13", afterSale.part.currentStock);
  assert(toNum(afterSale.part.soldQuantity) === 2, "Quantité vendue = 2", afterSale.part.soldQuantity);
  const saleMovements = await listMovements({ partId, type: "vente", limit: 10 });
  assert(saleMovements.some((m) => m.saleId === sale.saleId), "Vente liée à un mouvement de stock");
  const salesList = await listSales(10);
  assert(salesList.some((s) => s.id === sale.saleId), "Vente présente dans l'historique");

  console.log("6/8 — Import CSV (nouvelle pièce + réconciliation de référence)");
  const csv = [
    "Référence;Désignation;Marque;Quantité;Prix Achat;Prix Gros;Prix Détail;UM;Rayon",
    "8200651172;Filtre à huile import;MarqueTest;14;800;1100;1500;U;A2",
    "99999999X;Rétroviseur gauche;MarqueTest;4;4600;5900;7200;U;D2",
  ].join("\n");
  const buf = Buffer.from(csv, "utf8");
  const sheets = await import("@/lib/excel").then((m) => m.analyzeWorkbook(buf, "test.csv"));
  const mapping = sheets[0].autoMapping as Record<string, string>;
  const rows = extractRows(buf, sheets[0].name, sheets[0].headerRow, mapping, "test.csv");
  const { validated, summary } = await validateRows(rows);
  assert(validated.length === 2, "Deux lignes CSV lues");
  assert(summary.total === 2, "Validation CSV : 2 lignes analysées");
  const result = await executeImport(buf, "test.csv", sheets[0].name, sheets[0].headerRow, mapping, "update");
  assert(result.updated === 1, "CSV met à jour la pièce existante via la référence alternative");
  assert(result.created === 1, "CSV crée la nouvelle pièce");
  const refreshed = await getPartDetail(partId);
  if (!refreshed) throw new Error("Pièce introuvable après import");
  assert(toNum(refreshed.part.currentStock) === 14, "Réconciliation import : stock 13 → 14", refreshed.part.currentStock);
  assert(Boolean(refreshed.part.referenceRaw?.includes("8200651172")), "referenceRaw préserve les deux références");
  const [createdPart] = await db
    .select()
    .from(parts)
    .where(eq(parts.reference, "99999999X"))
    .limit(1);
  assert(createdPart?.id !== undefined, "Nouvelle pièce 99999999X créée");

  console.log("7/8 — Export Excel");
  const exportStock = await buildExport("stock", { q: "7703800107" });
  assert(exportStock.buffer.length > 1000, "Export stock produit un fichier non vide");
  const wb = XLSX.read(exportStock.buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Array<Record<string, unknown>>;
  assert(aoa.length > 0, "Export contient des lignes");
  assert(("Référence" in (aoa[0] ?? {})) || ("Stock restant" in (aoa[0] ?? {})), "Export contient les colonnes métier");

  console.log("8/8 — Nettoyage temporel");
  await db.delete(sales).where(eq(sales.id, sale.saleId)); // n'affecte pas le test ci-dessus
  await db.delete(stockMovements).where(eq(stockMovements.partId, partId)).catch(() => undefined);

  const TMP_DB = process.env.DATABASE_URL?.startsWith("pglite://")
    ? process.env.DATABASE_URL.replace(/^pglite:\/\//, "")
    : "";
  if (TMP_DB && TMP_DB.includes("autostock-smoke")) {
    await fs.rm(path.resolve(TMP_DB), { recursive: true, force: true });
  }

  console.log(`\nRésultat : ${passed} succès, ${failed} échec(s).`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
