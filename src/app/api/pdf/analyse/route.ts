import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { parts, images } from "@/db/schema";
import { analysePdfFile, pdfFileUrl, type PdfRow } from "@/lib/pdf";
import { storageRead, STORAGE_MODE } from "@/lib/storage";
import { requireAdmin } from "@/lib/auth";
import { normReference, splitReferences } from "@/lib/normalize";

export const dynamic = "force-dynamic";

const MAX_SIZE = 60 * 1024 * 1024; // 60 Mo
const PDF_MIME = "application/pdf";

type Candidate = {
  partId: number;
  reference: string;
  designation: string;
  hasImage: boolean;
};

type RowOut = PdfRow & {
  imageUrl: string | null;
  // Pièces candidates distinctes auxquelles la photo peut correspondre.
  // 0 = non rattachée · 1 = correspondance NON ambiguë · >1 = ambigu (revue manuelle).
  matches: Candidate[];
};

type PartMeta = { reference: string; designation: string; hasImage: boolean };

async function buildPartLookup(): Promise<{
  // jeton normalisé -> pièces distinctes qui portent ce jeton.
  tokenToParts: Map<string, number[]>;
  meta: Map<number, PartMeta>;
}> {
  const tokens = await db.execute(
    sql`SELECT r.part_id, r.reference FROM part_references r`,
  );
  const partsMeta = await db
    .select({
      id: parts.id,
      reference: parts.reference,
      designation: parts.designation,
      imageFilename: images.filename,
    })
    .from(parts)
    .leftJoin(images, eq(images.partId, parts.id));

  const tokenToParts = new Map<string, number[]>();
  for (const t of tokens.rows as Array<{ part_id: number; reference: string }>) {
    const key = normReference(t.reference);
    if (!key) continue;
    const arr = tokenToParts.get(key) ?? [];
    if (!arr.includes(t.part_id)) arr.push(t.part_id);
    tokenToParts.set(key, arr);
  }
  const meta = new Map<number, PartMeta>();
  for (const p of partsMeta) {
    meta.set(p.id, {
      reference: p.reference,
      designation: p.designation,
      hasImage: !!p.imageFilename,
    });
  }
  return { tokenToParts, meta };
}

/**
 * Découpe la référence détectée en jetons individuels (la même logique que
 * l'import Excel : "7703800107 / 8200651172" -> 2 jetons). La base stocke les
 * références UN JETON à la fois ; normaliser la cellule entière concatènerait
 * les jetons et ne correspondrait jamais ("7703800107 / 8200651172" ->
 * "77038001078200651172"). On cherche donc chaque jeton séparément et on
 * rassemble les pièces distinctes trouvées.
 */
function referencesOf(row: PdfRow): string[] {
  const raw = (row.referenceRaw ?? "").trim();
  if (raw) return splitReferences(raw);
  // Secours : la cellule N° (rarement une référence). Sinon aucun.
  const n = (row.n ?? "").trim();
  return n ? splitReferences(n) : [];
}

export async function POST(req: NextRequest) {
  const forbidden = await requireAdmin(req);
  if (forbidden) return forbidden;

  const contentType = req.headers.get("content-type") ?? "";
  let buffer: Buffer;
  let displayName = "";

  if (contentType.includes("application/json")) {
    // Chemin « gros fichiers » : le PDF a déjà été téléversé DIRECTEMENT vers
    // Vercel Blob par le navigateur (voir /api/pdf/upload) pour éviter la
    // limite de corps serverless. Ici on ne transmet qu'une petite référence.
    let body: { pathname?: string; filename?: string };
    try {
      body = (await req.json()) as { pathname?: string; filename?: string };
    } catch {
      return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
    }
    const pathname = (body.pathname ?? "").trim();
    if (
      !/^pdf-import\/uploads\/[A-Za-z0-9._-]+\.pdf$/i.test(pathname) ||
      STORAGE_MODE !== "blob"
    ) {
      return NextResponse.json(
        { error: "Référence de fichier invalide." },
        { status: 400 },
      );
    }
    const obj = await storageRead(pathname);
    if (!obj) {
      return NextResponse.json(
        { error: "Fichier PDF introuvable dans le stockage." },
        { status: 404 },
      );
    }
    buffer = obj.data;
    displayName =
      (body.filename ?? "").trim() ||
      pathname.split("/").pop() ||
      "catalogue.pdf";
  } else {
    // Chemin historique (multipart) — flux local / auto-hébergé.
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Aucun fichier PDF reçu." }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "Le fichier PDF est vide." }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Fichier trop volumineux (60 Mo max)." }, { status: 400 });
    }
    if (!/\.pdf$/i.test(file.name) && file.type !== PDF_MIME) {
      return NextResponse.json(
        { error: "Format non pris en charge : sélectionnez un fichier PDF (.pdf)." },
        { status: 400 },
      );
    }
    if (file.type !== "" && file.type !== PDF_MIME && file.type !== "application/octet-stream") {
      // Acceptation souple : certains navigateurs envoient un type vide pour .pdf.
      return NextResponse.json(
        { error: "Le fichier sélectionné n'est pas un PDF (type application/pdf requis)." },
        { status: 400 },
      );
    }
    buffer = Buffer.from(await file.arrayBuffer());
    displayName = file.name;
  }

  // Garde de sécurité indépendante du chemin d'entrée.
  if (buffer.length > MAX_SIZE) {
    return NextResponse.json({ error: "Fichier trop volumineux (60 Mo max)." }, { status: 400 });
  }

  let result;
  try {
    result = await analysePdfFile(buffer, displayName);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Impossible d'analyser ce PDF : ${err.message}`
            : "Impossible d'analyser ce PDF.",
      },
      { status: 500 },
    );
  }

  // Enrichissement : correspondance des références détectées avec la base.
  const { tokenToParts, meta } = await buildPartLookup();
  let matched = 0;
  const rows: RowOut[] = result.rows.map((r) => {
    // Pièces distinctes couvertes par tous les jetons de la cellule référence.
    const distinct = new Set<number>();
    for (const token of referencesOf(r)) {
      const key = normReference(token);
      if (!key) continue;
      for (const pid of tokenToParts.get(key) ?? []) distinct.add(pid);
    }
    const matches: Candidate[] = [];
    for (const pid of distinct) {
      const m = meta.get(pid);
      matches.push({
        partId: pid,
        reference: m?.reference ?? String(pid),
        designation: m?.designation ?? "",
        hasImage: m?.hasImage ?? false,
      });
    }
    // matches.length : 0 = non rattaché, 1 = NON ambigu (sauvegarde auto
    // possible), >1 = ambigu / conflit (revue manuelle obligatoire).
    if (matches.length) matched += 1;
    return {
      ...r,
      imageUrl: r.imageRel ? pdfFileUrl(result.token, r.imageRel) : null,
      matches,
    };
  });

  const pages = result.pages.map((p) => ({
    pageNo: p.pageNo,
    url: pdfFileUrl(result.token, p.rel),
  }));

  return NextResponse.json({
    ok: true,
    token: result.token,
    filename: result.filename,
    size: result.size,
    numPages: result.numPages,
    ocrError: result.ocrError,
    pages,
    rows,
    counts: {
      pages: result.pages.length,
      rows: rows.length,
      withImage: rows.filter((r) => r.imageUrl).length,
      matched,
    },
  });
}
