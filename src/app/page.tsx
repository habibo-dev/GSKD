import Link from "next/link";
import {
  Package,
  Boxes,
  CircleCheck,
  TriangleAlert,
  OctagonX,
  ShoppingCart,
  Banknote,
  Plus,
  FileSpreadsheet,
  BookOpen,
  ArrowDownToDot,
  TrendingUp,
  History,
} from "lucide-react";
import { dashboardStats } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import {
  formatDZD,
  formatQty,
  formatInt,
  formatDateTime,
  toNum,
} from "@/lib/format";
import { StatCard, StockBadge, PageHeader, EmptyState } from "@/components/ui";
import { MovementsBadge } from "@/components/movements-badge";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [stats, cfg] = await Promise.all([dashboardStats(), getSettings()]);
  const t = stats.totals;

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title={`Bienvenue — ${cfg.businessName}`}
        description="Vue d'ensemble de l'activité et du stock en temps réel."
        actions={
          <>
            <Link href="/pieces/nouvelle" className="btn btn-secondary">
              <Plus size={14} /> Ajouter une pièce
            </Link>
            <Link href="/import-export" className="btn btn-secondary">
              <FileSpreadsheet size={14} /> Importer Excel
            </Link>
            <Link href="/ventes/nouvelle" className="btn btn-primary">
              <ShoppingCart size={14} /> Enregistrer une vente
            </Link>
          </>
        }
      />

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <StatCard
          label="Références"
          value={formatInt(t.refs)}
          sub={`${formatInt(t.tokens)} références recherchables`}
          icon={Package}
          tone="blue"
          href="/pieces"
        />
        <StatCard
          label="Quantité totale"
          value={formatQty(t.total_qty)}
          sub="pièces en stock"
          icon={Boxes}
          tone="slate"
          href="/stock"
        />
        <StatCard
          label="Disponibles"
          value={formatInt(t.disponibles)}
          sub={`${formatInt(t.faibles)} en stock faible`}
          icon={CircleCheck}
          tone="emerald"
          href="/stock?status=disponible"
        />
        <StatCard
          label="Ruptures"
          value={formatInt(t.ruptures)}
          sub="à réapprovisionner"
          icon={OctagonX}
          tone="rose"
          href="/stock?status=rupture"
        />
        <StatCard
          label="Ventes du jour"
          value={formatInt(stats.today.ventes)}
          sub={`${formatQty(stats.today.quantite)} pièce(s) vendue(s)`}
          icon={ShoppingCart}
          tone="violet"
          href="/ventes"
        />
        <StatCard
          label="Chiffre du jour"
          value={formatDZD(stats.today.montant, cfg.currencySuffix)}
          sub="ventes confirmées"
          icon={TrendingUp}
          tone="emerald"
          href="/rapports"
        />
        <StatCard
          label="Valeur du stock"
          value={formatDZD(t.valeur_achat, cfg.currencySuffix)}
          sub={`valeur de vente : ${formatDZD(t.valeur_detail, cfg.currencySuffix)}`}
          icon={Banknote}
          tone="blue"
          href="/rapports"
        />
        <StatCard
          label="Stock faible"
          value={formatInt(t.faibles)}
          sub="sous le seuil minimum"
          icon={TriangleAlert}
          tone="amber"
          href="/stock?status=faible"
        />
      </div>

      {/* Actions rapides */}
      <div className="no-print mt-3 flex flex-wrap gap-2">
        <Link href="/pieces/nouvelle" className="btn btn-secondary btn-sm">
          <Plus size={13} /> Pièce
        </Link>
        <Link href="/import-export" className="btn btn-secondary btn-sm">
          <FileSpreadsheet size={13} /> Import Excel
        </Link>
        <Link href="/ventes/nouvelle" className="btn btn-secondary btn-sm">
          <ShoppingCart size={13} /> Vente
        </Link>
        <Link href="/stock" className="btn btn-secondary btn-sm">
          <ArrowDownToDot size={13} /> Entrée de stock
        </Link>
        <Link href="/catalogue" className="btn btn-secondary btn-sm">
          <BookOpen size={13} /> Catalogue
        </Link>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* Mouvements récents */}
        <section className="card lg:col-span-2">
          <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h3 className="flex items-center gap-2 text-[13px] font-bold text-slate-800">
              <History size={15} className="text-slate-400" />
              Mouvements récents
            </h3>
            <Link href="/mouvements" className="text-xs font-medium text-blue-700 hover:underline">
              Tout voir
            </Link>
          </header>
          {stats.recentMovements.length === 0 ? (
            <EmptyState
              title="Aucun mouvement enregistré"
              description="Les entrées, ventes, retours et ajustements apparaîtront ici avec leur historique complet."
            />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Pièce</th>
                    <th>Type</th>
                    <th className="num">Qté</th>
                    <th className="num">Stock après</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentMovements.map((m) => (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap text-slate-500">
                        {formatDateTime(m.createdAt)}
                      </td>
                      <td>
                        {m.partId ? (
                          <Link href={`/pieces/${m.partId}`} className="hover:text-blue-700">
                            <span className="mono font-semibold">{m.reference}</span>
                            <span className="block max-w-[260px] truncate text-xs text-slate-500">
                              {m.designation ?? "Pièce supprimée"}
                            </span>
                          </Link>
                        ) : (
                          <span className="mono text-slate-400">{m.reference}</span>
                        )}
                      </td>
                      <td>
                        <MovementsBadge type={m.type} />
                      </td>
                      <td className="num font-semibold">
                        {m.type === "vente" || m.type === "ajustement_neg" ? "−" : "+"}
                        {formatQty(m.quantity)}
                      </td>
                      <td className="num mono text-slate-600">{formatQty(m.newStock)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="flex flex-col gap-4">
          {/* Meilleures ventes */}
          <section className="card">
            <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="flex items-center gap-2 text-[13px] font-bold text-slate-800">
                <TrendingUp size={15} className="text-slate-400" />
                Meilleures ventes
              </h3>
              <Link href="/rapports" className="text-xs font-medium text-blue-700 hover:underline">
                Rapport
              </Link>
            </header>
            {stats.topSellers.length === 0 ? (
              <EmptyState
                title="Aucune vente"
                description="Les pièces les plus vendues apparaîtront ici."
              />
            ) : (
              <ul className="divide-y divide-slate-50">
                {stats.topSellers.map((s, i) => (
                  <li key={`${s.id}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="mono grid h-6 w-6 shrink-0 place-items-center rounded bg-blue-50 text-[11px] font-bold text-blue-700">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      {s.id ? (
                        <Link href={`/pieces/${s.id}`} className="block truncate text-[13px] font-medium text-slate-800 hover:text-blue-700">
                          <span className="mono">{s.reference}</span> — {s.designation}
                        </Link>
                      ) : (
                        <span className="mono text-[13px] text-slate-500">{s.reference}</span>
                      )}
                    </div>
                    <span className="mono text-[13px] font-bold text-slate-700">
                      {formatQty(s.vendus)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Stock faible */}
          <section className="card">
            <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="flex items-center gap-2 text-[13px] font-bold text-slate-800">
                <TriangleAlert size={15} className="text-slate-400" />
                Stock faible / ruptures
              </h3>
              <Link href="/stock?status=faible" className="text-xs font-medium text-blue-700 hover:underline">
                Gérer
              </Link>
            </header>
            {stats.lowStock.length === 0 ? (
              <EmptyState
                title="Aucune alerte de stock"
                description="Toutes les pièces sont au-dessus de leur seuil minimum."
              />
            ) : (
              <ul className="divide-y divide-slate-50">
                {stats.lowStock.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Link href={`/pieces/${p.id}`} className="block truncate text-[13px] font-medium text-slate-800 hover:text-blue-700">
                        <span className="mono">{p.reference}</span> — {p.designation}
                      </Link>
                      <span className="text-xs text-slate-500">
                        Reste {formatQty(p.currentStock)} / seuil {formatQty(p.minStock)}
                      </span>
                    </div>
                    <StockBadge
                      status={toNum(p.currentStock) <= 0 ? "rupture" : "faible"}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
