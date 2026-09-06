import Link from "next/link";
import { listMovements } from "@/lib/queries";
import { formatQty, formatDateTime, formatInt } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/ui";
import { MovementsBadge } from "@/components/movements-badge";
import { ArrowLeftRight } from "lucide-react";

export const dynamic = "force-dynamic";

const TYPES = [
  ["", "Tous"],
  ["entree", "Entrées"],
  ["vente", "Ventes"],
  ["retour", "Retours"],
  ["ajustement_pos", "Ajustements +"],
  ["ajustement_neg", "Ajustements −"],
] as const;

export default async function MouvementsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string }>;
}) {
  const { type, q } = await searchParams;
  const movements = await listMovements({ type: type || undefined, q: q || undefined, limit: 200 });

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Mouvements de stock"
        description="Journal d'audit : chaque modification de stock est enregistrée avec l'avant / l'après, l'utilisateur et le motif."
        actions={<a href="/api/export?type=mouvements" className="btn btn-secondary">Exporter Excel</a>}
      />

      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        {TYPES.map(([key, label]) => {
          const active = (type ?? "") === key;
          const href = `/mouvements${key ? `?type=${key}` : ""}${q ? `${key ? "&" : "?"}q=${encodeURIComponent(q)}` : ""}`;
          return (
            <Link
              key={key}
              href={href}
              className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </Link>
          );
        })}
        <form method="GET" className="ml-auto flex gap-2">
          {type && <input type="hidden" name="type" value={type} />}
          <input name="q" defaultValue={q ?? ""} placeholder="Filtrer par référence, pièce, motif…" className="input w-64" />
          <button className="btn btn-secondary" type="submit">Filtrer</button>
        </form>
      </div>

      <div className="card">
        {movements.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="Aucun mouvement trouvé"
            description="Les entrées, ventes, retours et ajustements apparaîtront ici."
          />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Pièce</th>
                  <th>Type</th>
                  <th className="num">Quantité</th>
                  <th className="num">Stock avant</th>
                  <th className="num">Stock après</th>
                  <th>Motif</th>
                  <th>Document</th>
                  <th>Utilisateur</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap text-slate-500">{formatDateTime(m.createdAt)}</td>
                    <td>
                      {m.partId ? (
                        <Link href={`/pieces/${m.partId}`} className="hover:text-blue-700">
                          <span className="mono font-bold">{m.partReference}</span>
                          <span className="block max-w-[260px] truncate text-xs text-slate-500">{m.designation}</span>
                        </Link>
                      ) : (
                        <span>
                          <span className="mono text-slate-400">{m.partReference}</span>
                          <span className="block text-xs italic text-slate-300">pièce supprimée</span>
                        </span>
                      )}
                    </td>
                    <td><MovementsBadge type={m.type} /></td>
                    <td className="num font-bold">
                      {m.type === "vente" || m.type === "ajustement_neg" ? "−" : "+"}
                      {formatQty(m.quantity)}
                    </td>
                    <td className="num mono text-slate-500">{formatQty(m.previousStock)}</td>
                    <td className="num mono font-semibold">{formatQty(m.newStock)}</td>
                    <td className="max-w-[220px] truncate text-slate-500">{m.reason ?? "—"}</td>
                    <td className="mono text-[11.5px] text-slate-400">{m.documentRef ?? "—"}</td>
                    <td className="text-slate-500">{m.userName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="no-print mt-2 text-[11.5px] text-slate-400">{formatInt(movements.length)} mouvement(s) affiché(s).</p>
    </div>
  );
}
