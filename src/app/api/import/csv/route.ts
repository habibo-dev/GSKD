import { NextRequest, NextResponse } from "next/server";
import { analyzeWorkbook, extractRows, type TargetField } from "@/lib/excel";
import { validateRows, executeImport } from "@/lib/imports";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX_SIZE = 20 * 1024 * 1024;

/**
 * Import direct CSV (rapide) pour les fichiers convertis depuis Excel.
 * Réutilise exactement le pipeline /api/import/* de sorte que la validation,
 * la détection de doublons et l'upsert soient identiques.
 */
export async function POST(req: NextRequest) {
  const forbidden = await requireAdmin(req);
  if (forbidden) return forbidden;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Fichier trop volumineux (20 Mo max)." }, { status: 400 });
  }
  if (!/\.csv$/i.test(file.name)) {
    return NextResponse.json({ error: "Format attendu : .csv" }, { status: 400 });
  }
  const policy = String(form.get("policy") ?? "update") === "skip" ? "skip" : "update";

  const buffer = Buffer.from(await file.arrayBuffer());
  let sheets;
  try {
    sheets = analyzeWorkbook(buffer, file.name);
  } catch {
    return NextResponse.json({ error: "Fichier CSV illisible." }, { status: 400 });
  }
  const sheet = sheets[0];
  if (!sheet || !sheet.autoMapping.reference) {
    return NextResponse.json(
      { error: "Impossible de détecter la colonne Référence. Utilisez l'assistant complet ou précisez le mapping." },
      { status: 400 },
    );
  }
  const mapping = sheet.autoMapping as Partial<Record<TargetField, string>>;
  const rows = extractRows(buffer, sheet.name, sheet.headerRow, mapping, file.name);
  const { validated, summary } = await validateRows(rows);
  const result = await executeImport(
    buffer,
    file.name,
    sheet.name,
    sheet.headerRow,
    mapping,
    policy,
  );
  return NextResponse.json({
    ok: true,
    filename: file.name,
    sheet: sheet.name,
    headerRow: sheet.headerRow,
    mapping,
    validation: { summary, sample: validated.slice(0, 6) },
    result,
  });
}
