import { NextRequest, NextResponse } from "next/server";
import { searchParts } from "@/lib/queries";
import { imageUrl } from "@/lib/images";
import { stockStatusOf, toNum } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const limit = Math.min(40, Number(req.nextUrl.searchParams.get("limit")) || 24);
  if (!q.trim()) return NextResponse.json({ results: [] });

  const rows = await searchParts(q, limit);
  return NextResponse.json({
    results: rows.map((r) => ({
      id: r.id,
      reference: r.reference,
      referenceRaw: r.referenceRaw,
      designation: r.designation,
      brand: r.brand,
      category: r.category,
      location: r.location,
      unit: r.unit,
      currentStock: toNum(r.currentStock),
      minStock: toNum(r.minStock),
      status: stockStatusOf(r.currentStock, r.minStock),
      wholesalePrice: toNum(r.wholesalePrice),
      retailPrice: toNum(r.retailPrice),
      image: r.imageFilename
        ? imageUrl(r.imageFilename, r.imageUpdatedAt)
        : null,
      altCount: r.altCount,
    })),
  });
}
