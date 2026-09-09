import { NextRequest, NextResponse } from "next/server";
import { partObjectKey } from "@/lib/images";
import { storageRead } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ file: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { file } = await ctx.params;
  if (!file || !/^[A-Za-z0-9._-]+$/.test(file) || file.includes("..")) {
    return NextResponse.json({ error: "Nom de fichier invalide." }, { status: 400 });
  }
  try {
    const obj = await storageRead(partObjectKey(file));
    if (!obj) {
      return NextResponse.json({ error: "Image introuvable." }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(obj.data), {
      headers: {
        "Content-Type": obj.mime || "application/octet-stream",
        "Cache-Control": "public, max-age=300, must-revalidate",
      },
    });
  } catch {
    return NextResponse.json({ error: "Image introuvable." }, { status: 404 });
  }
}
