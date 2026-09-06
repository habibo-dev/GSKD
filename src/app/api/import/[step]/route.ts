import { NextRequest, NextResponse } from "next/server";
import { analyzeWorkbook, extractRows, type TargetField } from "@/lib/excel";
import {
  storeUpload,
  loadUpload,
  discardUpload,
  validateRows,
  executeImport,
} from "@/lib/imports";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX_SIZE = 15 * 1024 * 1024;

type Ctx = { params: Promise<{ step: string }> };

function badParams(step: string) {
  return !["preview", "validate", "execute"].includes(step);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { step } = await ctx.params;
  if (badParams(step)) {
    return NextResponse.json({ error: "Étape inconnue." }, { status: 404 });
  }
  const forbidden = await requireAdmin(req);
  if (forbidden) return forbidden;

  // Étape 1 : téléversement + analyse du classeur
  if (step === "preview") {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Fichier trop volumineux (15 Mo max)." }, { status: 400 });
    }
    if (!/\.(xlsx?|xlsm|xlsb|csv)$/i.test(file.name)) {
      return NextResponse.json(
        { error: "Format non pris en charge : utilisez un classeur .xls / .xlsx ou un fichier .csv." },
        { status: 400 },
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    let sheets;
    try {
      sheets = analyzeWorkbook(buffer, file.name);
    } catch {
      return NextResponse.json(
        { error: "Impossible de lire ce classeur. Vérifiez qu'il s'agit bien d'un fichier Excel ou CSV." },
        { status: 400 },
      );
    }
    const token = await storeUpload(buffer, file.name);
    return NextResponse.json({
      token,
      filename: file.name,
      size: file.size,
      sheets,
    });
  }

  // Étapes 2 & 3 : JSON { token, sheet, headerRow, mapping, policy? }
  let body: {
    token?: string;
    sheet?: string;
    headerRow?: number;
    mapping?: Partial<Record<TargetField, string>>;
    policy?: "update" | "skip";
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  if (!body.token || !body.sheet || body.headerRow === undefined || !body.mapping) {
    return NextResponse.json({ error: "Paramètres d'import incomplets." }, { status: 400 });
  }
  if (!body.mapping.reference) {
    return NextResponse.json(
      { error: "Associez au minimum la colonne « Référence »." },
      { status: 400 },
    );
  }

  let stored;
  try {
    stored = await loadUpload(body.token);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Fichier introuvable." },
      { status: 410 },
    );
  }

  if (step === "validate") {
    const rows = extractRows(
      stored.buffer,
      body.sheet,
      body.headerRow,
      body.mapping,
      stored.filename,
    );
    const { validated, summary } = await validateRows(rows);
    const problemRows = validated
      .filter((r) => r.status !== "ok")
      .slice(0, 200)
      .map((r) => ({
        rowNumber: r.rowNumber,
        reference: r.reference,
        designation: r.designation,
        status: r.status,
        issues: r.issues,
        existing: r.existingPart ?? null,
      }));
    const sample = validated.slice(0, 8).map((r) => ({
      rowNumber: r.rowNumber,
      reference: r.reference,
      designation: r.designation,
      marque: r.marque,
      quantite: r.quantite,
      prixAchat: r.prixAchat,
      prixGros: r.prixGros,
      prixDetail: r.prixDetail,
      um: r.um,
      rayon: r.rayon,
      status: r.status,
    }));
    return NextResponse.json({ summary, problemRows, sample });
  }

  // execute
  try {
    const result = await executeImport(
      stored.buffer,
      stored.filename,
      body.sheet,
      body.headerRow,
      body.mapping,
      body.policy === "skip" ? "skip" : "update",
    );
    await discardUpload(body.token);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Échec de l'import." },
      { status: 500 },
    );
  }
}
