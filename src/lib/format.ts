// ---------------------------------------------------------------------------
// Formatage : devises (DA), nombres, dates — interface en français
// ---------------------------------------------------------------------------

const nf2 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const nfQty = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

const nfInt = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

export function toNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Prix en dinars algériens : "1 250,00 DA" */
export function formatDZD(value: unknown, suffix = "DA"): string {
  return `${nf2.format(toNum(value))} ${suffix}`;
}

export function formatQty(value: unknown): string {
  return nfQty.format(toNum(value));
}

export function formatInt(value: unknown): string {
  return nfInt.format(toNum(value));
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  entree: "Entrée",
  vente: "Vente",
  retour: "Retour",
  ajustement_pos: "Ajustement +",
  ajustement_neg: "Ajustement −",
};

export function movementLabel(type: string): string {
  return MOVEMENT_TYPE_LABELS[type] ?? type;
}

export type StockStatus = "disponible" | "faible" | "rupture";

export function stockStatusOf(
  currentStock: unknown,
  minStock: unknown,
): StockStatus {
  const current = toNum(currentStock);
  const min = toNum(minStock);
  if (current <= 0) return "rupture";
  if (current <= min) return "faible";
  return "disponible";
}

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  disponible: "Disponible",
  faible: "Stock faible",
  rupture: "Rupture",
};
