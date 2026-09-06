import { promises as fs } from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { db } from "@/db";
import {
  parts,
  partReferences,
  brands,
  categories,
  importBatches,
  stockMovements,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  extractRows,
  parseFrenchNumber,
  roundQty,
  type ExtractedRow,
  type TargetField,
} from "@/lib/excel";
import { norm, splitReferences } from "@/lib/normalize";
import { toNum } from "@/lib/format";
import { getSettings } from "@/lib/settings";

// ---------------------------------------------------------------------------
// Stockage temporaire des fichiers téléversés (validation en plusieurs étapes)
// ---------------------------------------------------------------------------
const TMP_DIR = path.join(os.tmpdir(), "autostock-imports");

export async function storeUpload(buffer: Buffer, filename: string) {
  await fs.mkdir(TMP_DIR, { recursive: true });
  const token = crypto.randomUUID();
  await fs.writeFile(path.join(TMP_DIR, `${token}.bin`), buffer);
  await fs.writeFile(
    path.join(TMP_DIR, `${token}.json`),
    JSON.stringify({ filename, storedAt: Date.now() }),
  );
  return token;
}

export async function loadUpload(
  token: string,
): Promise<{ buffer: Buffer; filename: string }> {
  if (!/^[a-f0-9-]{36}$/i.test(token)) throw new Error("Jeton invalide.");
  const binPath = path.join(TMP_DIR, `${token}.bin`);
  const metaPath = path.join(TMP_DIR, `${token}.json`);
  const [buffer, meta] = await Promise.all([
    fs.readFile(binPath),
    fs.readFile(metaPath, "utf8").catch(() => "{}"),
  ]);
  // Expire après 2 heures
  const stat = await fs.stat(binPath);
  if (Date.now() - stat.mtimeMs > 2 * 60 * 60 * 1000) {
    throw new Error("Le fichier a expiré, veuillez le téléverser à nouveau.");
  }
  const filename = (JSON.parse(meta) as { filename?: string }).filename ?? "import.xlsx";
  return { buffer, filename };
}

export async function discardUpload(token: string) {
  if (!/^[a-f0-9-]{36}$/i.test(token)) return;
  await fs.rm(path.join(TMP_DIR, `${token}.bin`), { force: true });
  await fs.rm(path.join(TMP_DIR, `${token}.json`), { force: true });
}

// ---------------------------------------------------------------------------
// Validation des lignes extraites
// ---------------------------------------------------------------------------
export type RowIssue = { level: "error" | "warning"; message: string };

export type ValidatedRow = ExtractedRow & {
  status: "ok" | "erreur" | "doublon_fichier" | "existant";
  issues: RowIssue[];
  tokens: string[];
  qty: number;
  pa: number;
  pg: number;
  pd: number;
  existingPart?: { id: number; reference: string; designation: string };
};

export async function validateRows(rows: ExtractedRow[]) {
  // Index des références existantes en base
  const existing = await db.execute(sql`
    SELECT r.reference AS token, p.id, p.reference, p.designation
    FROM part_references r JOIN parts p ON p.id = r.part_id
  `);
  const byToken = new Map<
    string,
    { id: number; reference: string; designation: string }
  >();
  for (const r of existing.rows as Array<{
    token: string;
    id: number;
    reference: string;
    designation: string;
  }>) {
    const key = norm(r.token);
    if (!byToken.has(key)) {
      byToken.set(key, {
        id: r.id,
        reference: r.reference,
        designation: r.designation,
      });
    }
  }

  const seenInFile = new Map<string, number>(); // jeton normalisé -> rowNumber
  const validated: ValidatedRow[] = [];

  for (const row of rows) {
    const issues: RowIssue[] = [];
    const tokens = splitReferences(row.reference);

    if (tokens.length === 0) {
      issues.push({ level: "error", message: "Référence manquante" });
    }
    if (row.designation.trim() === "") {
      issues.push({ level: "error", message: "Désignation manquante" });
    }

    let qty = 0;
    if (row.quantite.trim() === "") {
      issues.push({ level: "warning", message: "Quantité vide (0 retenu)" });
    } else {
      const parsed = parseFrenchNumber(row.quantite);
      if (parsed === null) {
        issues.push({
          level: "error",
          message: `Quantité invalide (« ${row.quantite} »)`,
        });
      } else if (parsed < 0) {
        issues.push({ level: "error", message: "Quantité négative" });
      } else {
        qty = roundQty(parsed);
      }
    }

    const parsePrice = (label: string, raw: string): number => {
      if (raw.trim() === "") return 0;
      const n = parseFrenchNumber(raw);
      if (n === null || n < 0) {
        issues.push({
          level: "warning",
          message: `${label} invalide (« ${raw} »), 0 retenu`,
        });
        return 0;
      }
      return Math.round(n * 100) / 100;
    };
    const pa = parsePrice("Prix d'Achat", row.prixAchat);
    const pg = parsePrice("Prix Gros", row.prixGros);
    const pd = parsePrice("Prix Détail", row.prixDetail);

    let status: ValidatedRow["status"] = "ok";
    let existingPart: ValidatedRow["existingPart"];

    // Doublon dans le fichier ?
    let duplicateOf: number | null = null;
    for (const t of tokens) {
      const k = norm(t);
      const firstRow = seenInFile.get(k);
      if (firstRow !== undefined) {
        duplicateOf = firstRow;
        break;
      }
    }
    if (duplicateOf !== null) {
      status = "doublon_fichier";
      issues.push({
        level: "warning",
        message: `Référence déjà présente (ligne ${duplicateOf})`,
      });
    } else {
      for (const t of tokens) seenInFile.set(norm(t), row.rowNumber);
      // Existant en base ?
      for (const t of tokens) {
        const found = byToken.get(norm(t));
        if (found) {
          existingPart = found;
          break;
        }
      }
      if (existingPart) {
        status = "existant";
        issues.push({
          level: "warning",
          message: `Existe déjà (${existingPart.reference} — ${existingPart.designation})`,
        });
      }
    }

    const hasError = issues.some((i) => i.level === "error");
    if (hasError) status = "erreur";

    validated.push({
      ...row,
      status,
      issues,
      tokens,
      qty,
      pa,
      pg,
      pd,
      existingPart,
    });
  }

  const summary = {
    total: validated.length,
    ok: validated.filter((r) => r.status === "ok").length,
    erreurs: validated.filter((r) => r.status === "erreur").length,
    doublons: validated.filter((r) => r.status === "doublon_fichier").length,
    existants: validated.filter((r) => r.status === "existant").length,
  };

  return { validated, summary };
}

// ---------------------------------------------------------------------------
// Exécution de l'import
// ---------------------------------------------------------------------------
async function ensureBrand(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], name: string) {
  const clean = name.trim();
  if (!clean) return null;
  const [row] = await tx
    .insert(brands)
    .values({ name: clean })
    .onConflictDoNothing({ target: brands.name })
    .returning();
  if (row) return row.id;
  const [found] = await tx
    .select()
    .from(brands)
    .where(eq(brands.name, clean));
  return found?.id ?? null;
}

async function ensureCategory(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  name: string,
) {
  const clean = name.trim();
  if (!clean) return null;
  const [row] = await tx
    .insert(categories)
    .values({ name: clean })
    .onConflictDoNothing({ target: categories.name })
    .returning();
  if (row) return row.id;
  const [found] = await tx
    .select()
    .from(categories)
    .where(eq(categories.name, clean));
  return found?.id ?? null;
}

export async function executeImport(
  buffer: Buffer,
  filename: string,
  sheetName: string,
  headerRow: number,
  mapping: Partial<Record<TargetField, string>>,
  existingPolicy: "update" | "skip",
) {
  const cfg = await getSettings();
  const rows = extractRows(buffer, sheetName, headerRow, mapping);
  const { validated, summary } = await validateRows(rows);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let invalid = 0;
  let duplicates = 0;

  await db.transaction(async (tx) => {
    for (const row of validated) {
      if (row.status === "erreur") {
        invalid += 1;
        continue;
      }
      if (row.status === "doublon_fichier") {
        duplicates += 1;
        continue;
      }

      const brandId = await ensureBrand(tx, row.marque);
      const categoryId = await ensureCategory(tx, row.categorie);
      const primary = row.tokens[0];
      const unit = row.um.trim() || "U";
      const rayon = row.rayon.trim() || null;

      if (row.status === "existant" && row.existingPart) {
        if (existingPolicy === "skip") {
          skipped += 1;
          continue;
        }
        const partId = row.existingPart.id;
        const [before] = await tx
          .select()
          .from(parts)
          .where(eq(parts.id, partId));
        // Mise à jour des informations commerciales
        const mergedRaw =
          before.referenceRaw && row.reference.trim() !== ""
            ? Array.from(
                new Set([
                  ...splitReferences(before.referenceRaw),
                  ...row.tokens,
                ]),
              ).join(" / ")
            : before.referenceRaw ?? row.reference;

        await tx
          .update(parts)
          .set({
            designation: row.designation.trim() || before.designation,
            brandId: brandId ?? before.brandId,
            categoryId: categoryId ?? before.categoryId,
            purchasePrice: String(row.pa),
            wholesalePrice: String(row.pg),
            retailPrice: String(row.pd),
            unit: unit || before.unit,
            location: rayon ?? before.location,
            referenceRaw: mergedRaw,
            updatedAt: new Date(),
          })
          .where(eq(parts.id, partId));

        // Ajoute les nouvelles références alternatives sans jamais détruire
        const existingRefs = await tx
          .select()
          .from(partReferences)
          .where(eq(partReferences.partId, partId));
        const existingKeys = new Set(existingRefs.map((r) => norm(r.reference)));
        for (const token of row.tokens) {
          if (!existingKeys.has(norm(token))) {
            await tx.insert(partReferences).values({
              partId,
              reference: token,
              isPrimary: false,
            });
          }
        }

        // Réconciliation du stock : la différence est tracée par un ajustement
        const current = toNum(before.currentStock);
        if (row.qty !== current) {
          const diff = roundQty(Math.abs(row.qty - current));
          const type = row.qty > current ? "ajustement_pos" : "ajustement_neg";
          await tx.insert(stockMovements).values({
            partId,
            partReference: before.reference,
            type,
            quantity: String(diff),
            previousStock: String(current),
            newStock: String(row.qty),
            userName: cfg.defaultUser,
            reason: "Réconciliation import Excel",
            documentRef: filename,
          });
          await tx
            .update(parts)
            .set({ currentStock: String(row.qty), updatedAt: new Date() })
            .where(eq(parts.id, partId));
        }
        updated += 1;
        continue;
      }

      // Création d'une nouvelle pièce : Quantité Excel = stock initial
      const [inserted] = await tx
        .insert(parts)
        .values({
          reference: primary,
          referenceRaw: row.reference.trim() || primary,
          designation: row.designation.trim(),
          brandId,
          categoryId,
          purchasePrice: String(row.pa),
          wholesalePrice: String(row.pg),
          retailPrice: String(row.pd),
          initialStock: String(row.qty),
          currentStock: String(row.qty),
          soldQuantity: "0",
          minStock: String(cfg.defaultMinStock),
          unit,
          location: rayon,
        })
        .returning();

      await tx.insert(partReferences).values(
        row.tokens.map((token, i) => ({
          partId: inserted.id,
          reference: token,
          isPrimary: i === 0,
        })),
      );
      created += 1;
    }

    await tx.insert(importBatches).values({
      filename,
      status: "termine",
      totalRows: summary.total,
      created,
      updated,
      skipped,
      invalid,
      duplicates,
    });
  });

  return { created, updated, skipped, invalid, duplicates, total: summary.total };
}
