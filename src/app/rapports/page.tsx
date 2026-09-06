import { BarChart3, ShoppingCart, Package, Banknote, CalendarDays } from "lucide-react";
import { salesReport, dashboardStats } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { formatDZD, formatQty, formatInt, formatDate } from "@/lib/format";
import { PageHeader, StatCard } from "@/components/ui";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function RapportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const [report, stats, cfg] = await Promise.all([
    salesReport(from || undefined, to || undefined),
    dashboardStats(),
    getSettings(),
  ]);

  const exportVentes = `/api/export?type=ventes${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`;

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Rapports"
        description="Indicateurs réels calculés depuis la base : ventes, quantités et valorisation du stock."
        actions={
          <>
            <a href={exportVentes} className="btn btn-secondary">Export ventes (.xlsx)</a>
            <a href="/api/export?type=stock" className="btn btn-secondary">Export stock (.xlsx)</a>
          </>
        }
      />

      {/* Période */}
      <form method="GET" className="no-print card mb-4 flex flex-wrap items-end gap-2 p-3">
        <div>
          <label className="label flex items-center gap-1"><CalendarDays size={12} /> Du</label>
          <input type="date" name="from" defaultValue={from ?? ""} className="input w-40" />
        </div>
        <div>
          <label className="label">Au</label>
          <input type="date" name="to" defaultValue={to ?? ""} className="input w-40" />
        </div>
        <button className="btn btn-primary" type="submit">Appliquer la période</button>
        {(from || to) && (
          <Link href="/rapports" className="btn btn-ghost">Réinitialiser</Link>
        )}
        <span className="ml-auto text-[11.5px] text-slate-400">
          {from || to ? `Période : ${from ?? "…"} → ${to ?? "…"}` : "Toutes périodes"}
        </span>
      </form>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Ventes" value={formatInt(report.kpi.ventes)} sub="tickets confirmés" icon={ShoppingCart} tone="blue" />
        <StatCard label="Pièces vendues" value={formatQty(report.kpi.quantite)} sub={`${formatInt(report.kpi.lignes)} lignes`} icon={Package} tone="violet" />
        <StatCard label="Chiffre d'affaires" value={formatDZD(report.kpi.montant, cfg.currencySuffix)} sub="sur la période" icon={Banknote} tone="emerald" />
        <StatCard label="Valeur stock (achat)" value={formatDZD(stats.totals.valeur_achat, cfg.currencySuffix)} sub="au prix d'achat" icon={Banknote} tone="slate" />
        <StatCard label="Valeur stock (vente)" value={formatDZD(stats.totals.valeur_detail, cfg.currencySuffix)} sub="au prix détail" icon={Banknote} tone="blue" />
        <StatCard label="Marge potentielle" value={formatDZD(Number(stats.totals.valeur_detail) - Number(stats.totals.valeur_achat), cfg.currencySuffix)} sub="détail − achat" icon={BarChart3} tone="amber" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Top ventes */}
        <div className="card">
          <header className="border-b border-slate-100 px-4 py-3 text-[13px] font-bold text-slate-800">
            Top 10 des pièces vendues
          </header>
          {report.top.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-slate-400">Aucune vente sur la période.</p>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Référence</th>
                    <th>Désignation</th>
                    <th className="num">Qté vendue</th>
                    <th className="num">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {report.top.map((r, i) => (
                    <tr key={r.reference}>
                      <td className="mono font-bold text-blue-600">{i + 1}</td>
                      <td className="mono font-bold">{r.reference}</td>
                      <td className="max-w-[220px] truncate text-slate-600">{r.designation}</td>
                      <td className="num mono font-bold">{formatQty(r.quantite)}</td>
                      <td className="num mono">{formatDZD(r.montant, cfg.currencySuffix)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Ventes par jour */}
        <div className="card">
          <header className="border-b border-slate-100 px-4 py-3 text-[13px] font-bold text-slate-800">
            Ventes par jour
          </header>
          {report.byDay.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-slate-400">Aucune vente sur la période.</p>
          ) : (
            <div className="table-wrap max-h-[420px] overflow-y-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="num">Ventes</th>
                    <th className="num">Pièces</th>
                    <th className="num">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byDay.map((d) => (
                    <tr key={String(d.jour)}>
                      <td className="font-medium text-slate-700">{formatDate(new Date(String(d.jour)))}</td>
                      <td className="num mono">{formatInt(d.ventes)}</td>
                      <td className="num mono">{formatQty(d.quantite)}</td>
                      <td className="num mono font-semibold">{formatDZD(d.montant, cfg.currencySuffix)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
