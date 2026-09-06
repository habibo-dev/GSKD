import { NextRequest, NextResponse } from "next/server";
import { extractFromImage } from "@/lib/vision";
import { searchParts } from "@/lib/queries";
import { imageUrl } from "@/lib/images";
import { stockStatusOf, toNum } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Aucune image reçue." }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Image trop volumineuse (10 Mo max)." }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await extractFromImage(buffer, file.type || "image/jpeg");

  // Correspondances automatiques : chaque référence extraite est recherchée en base
  const matches: Array<{
    candidate: string;
    parts: Array<{
      id: number;
      reference: string;
      designation: string;
      brand: string | null;
      status: string;
      currentStock: number;
      retailPrice: number;
      image: string | null;
    }>;
  }> = [];
  for (const candidate of result.candidates.slice(0, 6)) {
    const rows = await searchParts(candidate, 4);
    if (rows.length) {
      matches.push({
        candidate,
        parts: rows.map((r) => ({
          id: r.id,
          reference: r.reference,
          designation: r.designation,
          brand: r.brand,
          status: stockStatusOf(r.currentStock, r.minStock),
          currentStock: toNum(r.currentStock),
          retailPrice: toNum(r.retailPrice),
          image: r.imageFilename ? imageUrl(r.imageFilename, r.imageUpdatedAt) : null,
        })),
      });
    }
  }

  return NextResponse.json({
    provider: result.provider,
    ok: result.ok,
    message: result.message ?? null,
    texts: result.texts.slice(0, 20),
    candidates: result.candidates,
    matches,
  });
}
