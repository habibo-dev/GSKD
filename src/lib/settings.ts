import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

export type AppSettings = {
  businessName: string;
  tagline: string;
  phone: string;
  address: string;
  currencySuffix: string;
  defaultMinStock: number;
  allowNegativeStock: boolean;
  defaultUser: string;
  cataloguePrice: "detail" | "gros";
  authEnabled: boolean;
};

const DEFAULTS: AppSettings = {
  businessName: "AutoStock",
  tagline: "Gestion intelligente des pièces automobiles",
  phone: "",
  address: "",
  currencySuffix: "DA",
  defaultMinStock: 2,
  allowNegativeStock: false,
  defaultUser: "Employé",
  cataloguePrice: "detail",
  authEnabled: false,
};

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.select().from(settings);
  const map = new Map(rows.map((r) => [r.key, r.value ?? ""]));
  const get = (k: keyof AppSettings) => {
    const v = map.get(k as string);
    return v === undefined || v === "" ? undefined : v;
  };
  return {
    businessName: (get("businessName") as string) ?? DEFAULTS.businessName,
    tagline: (get("tagline") as string) ?? DEFAULTS.tagline,
    phone: (get("phone") as string) ?? DEFAULTS.phone,
    address: (get("address") as string) ?? DEFAULTS.address,
    currencySuffix:
      (get("currencySuffix") as string) ?? DEFAULTS.currencySuffix,
    defaultMinStock: Number(get("defaultMinStock")) || DEFAULTS.defaultMinStock,
    allowNegativeStock: get("allowNegativeStock") === "true",
    defaultUser: (get("defaultUser") as string) ?? DEFAULTS.defaultUser,
    cataloguePrice:
      get("cataloguePrice") === "gros" ? "gros" : ("detail" as const),
    authEnabled: get("authEnabled") === "true",
  };
}

export async function saveSettings(
  input: Partial<AppSettings>,
): Promise<void> {
  const entries: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    entries.push([k, typeof v === "boolean" ? String(v) : String(v)]);
  }
  for (const [key, value] of entries) {
    await db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } });
  }
}
