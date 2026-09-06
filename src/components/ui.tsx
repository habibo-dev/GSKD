import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { ImageOff, PackageSearch } from "lucide-react";
import type { StockStatus } from "@/lib/format";
import { STATUS_BADGE, stockStatusLabel } from "@/lib/status-ui";

// ---------------------------------------------------------------------------
// Vignette produit : image canonique de la pièce, ou placeholder professionnel
// ---------------------------------------------------------------------------
export function PartThumb({
  src,
  alt = "",
  size = 40,
  rounded = "rounded-md",
}: {
  src: string | null;
  alt?: string;
  size?: number;
  rounded?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        loading="lazy"
        className={`shrink-0 border border-slate-200 bg-white object-cover ${rounded}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={`grid shrink-0 place-items-center border border-dashed border-slate-300 bg-slate-100 text-slate-300 ${rounded}`}
      style={{ width: size, height: size }}
      title="Aucune image associée"
    >
      <ImageOff size={Math.max(14, size * 0.36)} strokeWidth={1.6} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badge de statut de stock
// ---------------------------------------------------------------------------
export function StockBadge({ status }: { status: StockStatus }) {
  return (
    <span className={`badge ${STATUS_BADGE[status]}`}>
      <span className="dot" />
      {stockStatusLabel(status)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Carte KPI du tableau de bord
// ---------------------------------------------------------------------------
export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "blue",
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: ComponentType<{ size?: number | string; strokeWidth?: number | string; className?: string }>;
  tone?: "blue" | "emerald" | "amber" | "rose" | "slate" | "violet";
  href?: string;
}) {
  const tones: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    slate: "bg-slate-100 text-slate-600",
    violet: "bg-violet-50 text-violet-700",
  };
  const inner = (
    <div className="card flex items-start gap-3.5 p-4 transition-shadow hover:shadow-md">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${tones[tone]}`}>
        <Icon size={19} strokeWidth={2} />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.07em] text-slate-500">
          {label}
        </span>
        <span className="mono mt-0.5 block truncate text-xl font-bold tracking-tight text-slate-900">
          {value}
        </span>
        {sub && <span className="mt-0.5 block truncate text-xs text-slate-500">{sub}</span>}
      </span>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

// ---------------------------------------------------------------------------
// État vide professionnel
// ---------------------------------------------------------------------------
export function EmptyState({
  icon: Icon = PackageSearch,
  title,
  description,
  action,
}: {
  icon?: ComponentType<{ size?: number | string; strokeWidth?: number | string; className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid place-items-center px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon size={26} strokeWidth={1.6} />
      </span>
      <h3 className="mt-4 text-[15px] font-semibold text-slate-800">{title}</h3>
      {description && (
        <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-slate-500">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// En-tête de section de page
// ---------------------------------------------------------------------------
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="no-print mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
