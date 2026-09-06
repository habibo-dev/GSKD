// Helpers UI partagés (client + serveur) — aucune dépendance Node.
import type { StockStatus } from "@/lib/format";

export const STATUS_BADGE: Record<StockStatus, string> = {
  disponible: "badge-emerald",
  faible: "badge-amber",
  rupture: "badge-rose",
};

export function stockStatusLabel(s: StockStatus): string {
  return s === "disponible" ? "Disponible" : s === "faible" ? "Stock faible" : "Rupture";
}
