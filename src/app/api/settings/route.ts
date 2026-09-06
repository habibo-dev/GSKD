import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ settings: await getSettings() });
}

export async function PATCH(req: NextRequest) {
  const forbidden = await requireAdmin(req);
  if (forbidden) return forbidden;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const minRaw = body.defaultMinStock;
  const min =
    minRaw === undefined || String(minRaw).trim() === ""
      ? Number.NaN
      : Number(String(minRaw).replace(",", "."));
  await saveSettings({
    businessName: String(body.businessName ?? "").trim().slice(0, 80) || undefined,
    tagline: String(body.tagline ?? "").trim().slice(0, 120) || undefined,
    phone: String(body.phone ?? "").trim().slice(0, 40),
    address: String(body.address ?? "").trim().slice(0, 160),
    currencySuffix: String(body.currencySuffix ?? "").trim().slice(0, 8) || undefined,
    defaultMinStock: Number.isFinite(min) && min >= 0 ? min : undefined,
    allowNegativeStock: Boolean(body.allowNegativeStock),
    defaultUser: String(body.defaultUser ?? "").trim().slice(0, 60) || undefined,
    cataloguePrice: body.cataloguePrice === "gros" ? "gros" : "detail",
    authEnabled: Boolean(body.authEnabled),
  });
  return NextResponse.json({ ok: true });
}
