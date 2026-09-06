import Link from "next/link";
import { Plus, ReceiptText } from "lucide-react";
import { listSales } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { formatDZD, formatQty, formatDateTime } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function VentesPage() {
  const [salesList, cfg] = await Promise.all([listSales(60), getSettings()]);

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="Ventes"
        description="Historique des ventes confirmées — chaque vente déduit le stock via des mouvements tracés."
        actions={
          <>
            <a href="/api/export?type=ventes" className="btn btn-secondary">Exporter Excel</a>
            <Link href="/ventes/nouvelle" className="btn btn-primary">
              <Plus size={14} /> Nouvelle vente
            </Link>
          </>
        }
      />

      {salesList.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={ReceiptText}
            title="Aucune vente enregistrée"
            description="La première vente apparaîtra ici avec son détail : pièces, quantités, type de prix et montant."
            action={<Link href="/ventes/nouvelle" className="btn btn-primary btn-sm">Enregistrer une vente</Link>}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {salesList.map((s) => (
            <div key={s.id} className="card overflow-hidden">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
                <span className="mono text-[13px] font-bold text-slate-900">{s.number ?? `V-${s.id}`}</span>
                <span className="text-[12px] text-slate-500">{formatDateTime(s.createdAt)}</span>
                {s.clientName && <span className="badge badge-slate">{s.clientName}</span>}
                <span className="text-[11.5px] text-slate-400">
                  {s.itemCount} ligne{s.itemCount > 1 ? "s" : ""} · {s.userName ?? "—"}
                </span>
                <span className="mono ml-auto text-[15px] font-bold text-slate-900">
                  {formatDZD(s.totalAmount, cfg.currencySuffix)}
                </span>
              </div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Référence</th>
                      <th>Désignation</th>
                      <th className="num">Quantité</th>
                      <th>Type de prix</th>
                      <th className="num">Prix unitaire</th>
                      <th className="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.items.map((it) => (
                      <tr key={String(it.id)}>
                        <td>
                          {it.part_id ? (
                            <Link href={`/pieces/${it.part_id}`} className="mono font-bold text-slate-800 hover:text-blue-700">
                              {String(it.part_reference ?? "")}
                            </Link>
                          ) : (
                            <span className="mono text-slate-400">{String(it.part_reference ?? "")}</span>
                          )}
                        </td>
                        <td className="max-w-[300px] truncate text-slate-600">{String(it.designation ?? "")}</td>
                        <td className="num mono font-semibold">{formatQty(it.quantity)}</td>
                        <td>
                          <span className={`badge ${it.price_type === "gros" ? "badge-blue" : "badge-emerald"}`}>
                            {it.price_type === "gros" ? "Prix Gros" : "Prix Détail"}
                          </span>
                        </td>
                        <td className="num mono text-slate-600">{formatDZD(it.unit_price, cfg.currencySuffix)}</td>
                        <td className="num mono font-bold">{formatDZD(it.line_total, cfg.currencySuffix)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
