import { ArrowDownToDot, ArrowUpFromDot, RotateCcw, ShoppingCart, Wrench } from "lucide-react";

const CONFIG: Record<string, { label: string; cls: string }> = {
  entree: { label: "Entrée", cls: "badge-emerald" },
  vente: { label: "Vente", cls: "badge-blue" },
  retour: { label: "Retour", cls: "badge-violet" },
  ajustement_pos: { label: "Ajustement +", cls: "badge-amber" },
  ajustement_neg: { label: "Ajustement −", cls: "badge-rose" },
};

const ICONS: Record<string, typeof ArrowDownToDot> = {
  entree: ArrowDownToDot,
  vente: ShoppingCart,
  retour: RotateCcw,
  ajustement_pos: Wrench,
  ajustement_neg: Wrench,
};

export function MovementsBadge({ type }: { type: string }) {
  const c = CONFIG[type] ?? { label: type, cls: "badge-slate" };
  const Icon = ICONS[type] ?? ArrowUpFromDot;
  return (
    <span className={`badge ${c.cls}`}>
      <Icon size={11} strokeWidth={2.2} />
      {c.label}
    </span>
  );
}
