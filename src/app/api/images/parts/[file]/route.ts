import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { PARTS_DIR } from "@/lib/images";

export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

type Ctx = { params: Promise<{ file: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { file } = await ctx.params;
  if (!file || !/^[A-Za-z0-9._-]+$/.test(file) || file.includes("..")) {
    return NextResponse.json({ error: "Nom de fichier invalide." }, { status: 400 });
  }
  try {
    const full = path.join(PARTS_DIR, file);
    const data = await fs.readFile(full);
    const ext = path.extname(full).toLowerCase();
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=300, must-revalidate",
      },
    });
  } catch {
    return NextResponse.json({ error: "Image introuvable." }, { status: 404 });
  }
}
