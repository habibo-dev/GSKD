import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { PDF_IMPORT_ROOT } from "@/lib/pdf";

export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
};

const SEGMENT_OK = /^[A-Za-z0-9._-]+$/;

type Ctx = { params: Promise<{ rest: string[] }> };

/**
 * Sert les pages rendues / découpes générées par l'analyse d'un PDF.
 * Le premier segment est le jeton (UUID) du lot ; les suivants le chemin relatif.
 * Nom de fichier strictement contrôlé (aucune traversée possible).
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const rest = (await ctx.params).rest ?? [];
  const [token, ...segments] = rest;
  if (!token || !/^[a-f0-9-]{36}$/i.test(token) || segments.length === 0) {
    return NextResponse.json({ error: "Chemin invalide." }, { status: 400 });
  }
  for (const seg of segments) {
    if (!SEGMENT_OK.test(seg) || seg === ".." || seg.startsWith(".")) {
      return NextResponse.json({ error: "Chemin invalide." }, { status: 400 });
    }
  }
  const rel = segments.join("/");
  const full = path.join(PDF_IMPORT_ROOT, token, rel);
  if (!full.startsWith(path.join(PDF_IMPORT_ROOT, token) + path.sep)) {
    return NextResponse.json({ error: "Chemin invalide." }, { status: 400 });
  }
  try {
    const data = await fs.readFile(full);
    const ext = path.extname(full).toLowerCase();
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=3600, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  }
}
