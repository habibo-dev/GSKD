import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { parts } from "@/db/schema";
import { pdfArtifactKey } from "@/lib/pdf";
import { applyPdfCrop } from "@/lib/images";
import { storageRead } from "@/lib/storage";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const CROP_OK = /^crops\/page-\d{2}\/row-\d{2}\.png$/;

type Assignment = {
  partId: number;
  imageRel?: string;
  pageNo?: number;
  pdfReference?: string;
  confidence?: string;
};

export async function POST(req: NextRequest) {
  const forbidden = await requireAdmin(req);
  if (forbidden) return forbidden;

  let body: { token?: string; assignments?: Assignment[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const token = body.token ?? "";
  const assignments = (body.assignments ?? []).filter(
    (a) => Number.isInteger(a.partId) && a.partId > 0,
  );
  if (!/^[a-f0-9-]{36}$/i.test(token)) {
    return NextResponse.json({ error: "Jeton de lot invalide." }, { status: 400 });
  }
  if (assignments.length === 0) {
    return NextResponse.json(
      { error: "Aucune photo à rattacher n'a été sélectionnée." },
      { status: 400 },
    );
  }

  let done = 0;
  const errors: Array<{ partId: number; message: string }> = [];
  const applied: Array<{ partId: number; reference: string; versionNo?: number }> = [];

  for (const a of assignments) {
    const imageRel = a.imageRel ?? "";
    if (!CROP_OK.test(imageRel)) {
      errors.push({ partId: a.partId, message: "Chemin de découpe invalide." });
      continue;
    }
    const [part] = await db
      .select()
      .from(parts)
      .where(eq(parts.id, a.partId))
      .limit(1);
    if (!part) {
      errors.push({ partId: a.partId, message: "Pièce introuvable." });
      continue;
    }

    let data: Buffer;
    try {
      const obj = await storageRead(pdfArtifactKey(token, imageRel));
      if (!obj) throw new Error("missing");
      data = obj.data;
    } catch {
      errors.push({ partId: a.partId, message: "Découpe photo introuvable sur le serveur." });
      continue;
    }

    // Affecte la découpe comme nouvelle photo canonique (source pdf_extract).
    // La version précédente, si elle existe, est archivée dans image_versions
    // (réversible) — jamais supprimée. La provenance est conservée.
    try {
      const { versionNo } = await applyPdfCrop(a.partId, data, {
        token,
        sourceRel: imageRel,
        reference: part.reference,
        pdfPage: a.pageNo,
        pdfReference: a.pdfReference ?? part.reference,
        confidence: a.confidence || undefined,
      });
      done += 1;
      applied.push({ partId: a.partId, reference: part.reference, versionNo });
    } catch (err) {
      errors.push({
        partId: a.partId,
        message: err instanceof Error ? err.message : "Échec de l'enregistrement.",
      });
    }
  }

  return NextResponse.json({ ok: true, done, errors, applied });
}
