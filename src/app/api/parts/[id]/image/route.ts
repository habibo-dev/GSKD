import { NextRequest, NextResponse } from "next/server";
import { savePartImage, deletePartImage } from "@/lib/images";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "ID invalide" }, { status: 400 });
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
  }
  try {
    const { filename } = await savePartImage(id, file);
    return NextResponse.json({ ok: true, filename });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Échec de l'envoi." },
      { status: 400 },
    );
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "ID invalide" }, { status: 400 });
  }
  await deletePartImage(id);
  return NextResponse.json({ ok: true });
}
