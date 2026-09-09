import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { listParts, type PartFilters } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { formatQty, formatInt, stockStatusOf, type StockStatus } from "@/lib/format";
import { imageUrl } from "@/lib/images";
import { PageHeader, PartThumb, StockBadge, EmptyState } from "@/components/ui";
import { PdfExportMenu } from "@/components/pdf-export-menu";
import { AdjustStockButton } from "@/components/adjust-stock-dialog";
import { ShoppingCart } from "lucide-react";

export const dynamic = "force-dynamic";

const TABS: Array<{ key: string; label: string }> = [
  { key: "", label: "Tous" },
  { key: "disponible", label: "Disponible" },
  { key: "faible", label: "Stock faible" },
  { key: "rupture", label: "Rupture" },
];

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const filters: PartFilters = {
    q: sp.q ?? undefined,
    status: (sp.status as StockStatus) || undefined,
  };
  const [countsRes, { rows, total }, cfg] = await Promise.all([
    db.execute(sql`
      SELECT
        count(*)::int AS tous,
        count(*) FILTER (WHERE current_stock > min_stock)::int AS disponible,
        count(*) FILTER (WHERE current_stock > 0 AND current_stock <= min_stock)::int AS faible,
        count(*) FILTER (WHERE current_stock <= 0)::int AS rupture
      FROM parts
    `),
    listParts(filters, { perPage: 150, sort: "stock" }),
    getSettings(),
  ]);
  const counts = countsRes.rows[0] as Record<string, number>;

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Gestion du stock"
        description="Niveaux de stock en temps réel calculés : Stock restant = Stock initial + Entrées − Sorties (ventes, sorties et ajustements)."
        actions={
          <>
            <a href="/api/export?type=stock-faible" className="btn btn-secondary btn-sm">Export stock faible</a>
            <a href="/api/export?type=ruptures" className="btn btn-secondary btn-sm">Export ruptures</a>
            <a href="/api/export?type=stock" className="btn btn-secondary btn-sm">Export complet</a>
            <PdfExportMenu scope="stock" params={sp} />
          </>
        }
      />

      {/* Onglets de statut */}
      <div className="no-print mb-3 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const active = (sp.status ?? "") === t.key;
          const n = t.key === "" ? counts.tous : (counts[t.key] ?? 0);
          const href = `/stock${t.key ? `?status=${t.key}` : ""}${sp.q ? `${t.key ? "&" : "?"}q=${encodeURIComponent(sp.q)}` : ""}`;
          return (
            <Link
              key={t.key}
              href={href}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-semibold transition-colors ${
                active
                  ? "border-blue-600 bg-blue-600 text-white shadow"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t.label}
              <span className={`mono rounded px-1.5 py-0.5 text-[11px] font-bold ${active ? "bg-white/20" : "bg-slate-100"}`}>
                {formatInt(n)}
              </span>
            </Link>
          );
        })}
        <form method="GET" className="ml-auto flex gap-2">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Filtrer par référence, désignation…" className="input w-64" />
          <button className="btn btn-secondary" type="submit">Rechercher</button>
        </form>
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <EmptyState
            title="Aucune pièce dans ce statut"
            description="Importez votre inventaire Excel ou modifiez les filtres."
            action={<Link href="/import-export" className="btn btn-primary btn-sm">Importer Excel</Link>}
          />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="w-12">Photo</th>
                  <th>Pièce</th>
                  <th>Rayon</th>
                  <th className="num">Stock restant</th>
                  <th className="num">Seuil</th>
                  <th>Statut</th>
                  <th className="w-[300px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const status = stockStatusOf(p.currentStock, p.minStock);
                  return (
                    <tr key={p.id}>
                      <td>
                        <PartThumb src={p.imageFilename ? imageUrl(p.imageFilename, p.imageUpdatedAt) : null} size={38} />
                      </td>
                      <td>
                        <Link href={`/pieces/${p.id}`} className="mono font-bold text-slate-900 hover:text-blue-700">
                          {p.reference}
                        </Link>
                        <span className="block max-w-[280px] truncate text-xs text-slate-500">{p.designation}</span>
                      </td>
                      <td className="text-slate-500">{p.location ?? "—"}</td>
                      <td className={`num mono text-[14px] font-bold ${
                        status === "rupture" ? "text-rose-700" : status === "faible" ? "text-amber-700" : "text-slate-900"
                      }`}>
                        {formatQty(p.currentStock)} <span className="text-[10px] font-normal text-slate-400">{p.unit}</span>
                      </td>
                      <td className="num mono text-slate-400">{formatQty(p.minStock)}</td>
                      <td><StockBadge status={status} /></td>
                      <td>
                        <div className="flex flex-wrap gap-1.5">
                          <Link href={`/ventes/nouvelle?part=${p.id}`} className="btn btn-primary btn-xs">
                            <ShoppingCart size={11} /> Vendre
                          </Link>
                          <AdjustStockButton
                            partId={p.id}
                            reference={p.reference}
                            currentStock={Number(p.currentStock)}
                            mode="entree"
                            defaultUser={cfg.defaultUser}
                            className="btn btn-secondary btn-xs"
                          />
                          <AdjustStockButton
                            partId={p.id}
                            reference={p.reference}
                            currentStock={Number(p.currentStock)}
                            mode="sortie"
                            defaultUser={cfg.defaultUser}
                            className="btn btn-secondary btn-xs"
                          />
                          <AdjustStockButton
                            partId={p.id}
                            reference={p.reference}
                            currentStock={Number(p.currentStock)}
                            mode="ajustement"
                            defaultUser={cfg.defaultUser}
                            className="btn btn-ghost btn-xs"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="no-print mt-2 text-[11.5px] text-slate-400">
        {formatInt(total)} pièce(s) affichée(s) — toute modification de stock passe par un mouvement tracé (Entrée, Vente, Retour, Sortie, Ajustement).
      </p>
    </div>
  );
}
