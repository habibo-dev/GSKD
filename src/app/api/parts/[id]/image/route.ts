import { NextRequest, NextResponse } from "next/server";
import {
  savePartImage,
  deletePartImage,
  getPartImageVersions,
  restorePartImageVersion,
  imageUrl,
} from "@/lib/images";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function partIdOf(ctx: Ctx): Promise<number | null> {
  const id = Number((await ctx.params).id);
  return Number.isInteger(id) ? id : null;
}

// Historique / versions d'une pièce (pour restaurer une photo antérieure).
export async function GET(req: NextRequest, ctx: Ctx) {
  const forbidden = await requireAdmin(req);
  if (forbidden) return forbidden;

  const id = await partIdOf(ctx);
  if (!id) return NextResponse.json({ error: "ID invalide" }, { status: 400 });

  const versions = await getPartImageVersions(id);
  return NextResponse.json({ ok: true, versions });
}

// Téléversement / remplacement de la photo canonique (réversible).
export async function POST(req: NextRequest, ctx: Ctx) {
  const forbidden = await requireAdmin(req);
  if (forbidden) return forbidden;

  const id = await partIdOf(ctx);
  if (!id) return NextResponse.json({ error: "ID invalide" }, { status: 400 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
  }
  try {
    const { filename } = await savePartImage(id, file);
    return NextResponse.json({ ok: true, filename, url: imageUrl(filename) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Échec de l'envoi." },
      { status: 400 },
    );
  }
}

// Restaure une version archivée comme photo canonique.
export async function PUT(req: NextRequest, ctx: Ctx) {
  const forbidden = await requireAdmin(req);
  if (forbidden) return forbidden;

  const id = await partIdOf(ctx);
  if (!id) return NextResponse.json({ error: "ID invalide" }, { status: 400 });

  let versionId: number;
  try {
    const body = await req.json();
    versionId = Number(body?.versionId);
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  if (!Number.isInteger(versionId) || versionId <= 0) {
    return NextResponse.json({ error: "Version invalide." }, { status: 400 });
  }
  try {
    const { filename } = await restorePartImageVersion(id, versionId);
    return NextResponse.json({ ok: true, filename, url: imageUrl(filename) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Restauration impossible." },
      { status: 400 },
    );
  }
}

// Retire la photo canonique (l'archivage reste restauré par l'historique).
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const forbidden = await requireAdmin(req);
  if (forbidden) return forbidden;

  const id = await partIdOf(ctx);
  if (!id) return NextResponse.json({ error: "ID invalide" }, { status: 400 });

  await deletePartImage(id);
  return NextResponse.json({ ok: true });
}
