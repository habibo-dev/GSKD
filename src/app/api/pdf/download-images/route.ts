import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { eq, inArray } from "drizzle-orm";
import JSZip from "jszip";
import { db } from "@/db";
import { images, parts } from "@/db/schema";
import { PARTS_DIR } from "@/lib/images";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Nom de fichier sûr à partir de la référence produit (aucun nom interne). */
function safeRef(ref: string): string {
  const clean = ref.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._-]+|[._-]+$/g, "");
  return clean || "produit";
}

function extFor(filename: string): string {
  const e = path.extname(filename).toLowerCase();
  return e === ".jpg" || e === ".jpeg" || e === ".png" || e === ".webp" ? e : ".png";
}

export async function GET(req: NextRequest) {
  const forbidden = await requireAdmin(req);
  if (forbidden) return forbidden;

  const partIds = (req.nextUrl.searchParams.get("partIds") ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);

  if (partIds.length === 0) {
    return NextResponse.json({ error: "Aucune pièce sélectionnée." }, { status: 400 });
  }

  const joined = await db
    .select({
      partId: parts.id,
      reference: parts.reference,
      filename: images.filename,
    })
    .from(parts)
    .innerJoin(images, eq(images.partId, parts.id))
    .where(inArray(parts.id, partIds));

  const byPart = new Map<number, { reference: string; filename: string }>();
  for (const r of joined) {
    if (!byPart.has(r.partId)) byPart.set(r.partId, r);
  }

  const zip = new JSZip();
  let count = 0;
  for (const id of partIds) {
    const rec = byPart.get(id);
    if (!rec) continue;
    let data: Buffer;
    try {
      data = await fs.readFile(path.join(PARTS_DIR, rec.filename));
    } catch {
      continue;
    }
    const name = `${safeRef(rec.reference)}${extFor(rec.filename)}`;
    zip.file(name, data);
    count += 1;
  }

  if (count === 0) {
    return NextResponse.json(
      { error: "Aucune image enregistrée à télécharger." },
      { status: 400 },
    );
  }

  const out = await zip.generateAsync({ type: "nodebuffer" });
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(Buffer.from(out), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="images-enregistrees-${stamp}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
