import { NextRequest, NextResponse } from "next/server";
import { pdfArtifactKey } from "@/lib/pdf";
import { storageRead } from "@/lib/storage";

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
  try {
    const obj = await storageRead(pdfArtifactKey(token, rel));
    if (!obj) {
      return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
    }
    const ext = "." + rel.split(".").pop();
    return new NextResponse(new Uint8Array(obj.data), {
      headers: {
        "Content-Type": obj.mime || MIME[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=3600, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  }
}
