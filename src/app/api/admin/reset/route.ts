import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { PARTS_DIR } from "@/lib/images";

export const dynamic = "force-dynamic";

/** Purge complète des données (démonstration / remise à zéro avant production). */
export async function POST(req: NextRequest) {
  let body: { confirm?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  if (body.confirm !== "PURGER") {
    return NextResponse.json(
      { error: "Confirmation requise : saisissez PURGER." },
      { status: 400 },
    );
  }
  const tables = [
    "sale_items",
    "sales",
    "stock_movements",
    "compatibilities",
    "images",
    "part_references",
    "parts",
    "vehicles",
    "import_batches",
    "brands",
    "categories",
    "suppliers",
  ];
  for (const t of tables) {
    await db.execute(sql.raw(`DELETE FROM ${t}`));
  }
  // Supprime les fichiers images téléversés
  try {
    const files = await fs.readdir(PARTS_DIR);
    for (const f of files) {
      await fs.rm(path.join(PARTS_DIR, f), { force: true });
    }
  } catch {
    // dossier absent : rien à faire
  }
  return NextResponse.json({ ok: true });
}
