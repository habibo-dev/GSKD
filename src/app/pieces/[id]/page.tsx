import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Pencil,
  ShoppingCart,
  MapPin,
  Ruler,
  Tag,
  Layers,
  Truck,
  History,
  Car,
  BadgeCheck,
} from "lucide-react";
import { getPartDetail } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { imageUrl } from "@/lib/images";
import {
  formatDZD,
  formatQty,
  formatDateTime,
  stockStatusOf,
  toNum,
} from "@/lib/format";
import { StockBadge, EmptyState } from "@/components/ui";
import { ImageManager } from "@/components/image-manager";
import { AdjustStockButton } from "@/components/adjust-stock-dialog";
import { DeletePartButton } from "@/components/delete-part-button";
import { MovementsBadge } from "@/components/movements-badge";

export const dynamic = "force-dynamic";

export default async function PartDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const [detail, cfg] = await Promise.all([getPartDetail(id), getSettings()]);
  if (!detail) notFound();

  const { part, references, aggregates, movements, compatibilities, supplierName } = detail;
  const status = stockStatusOf(part.currentStock, part.minStock);
  const altRefs = references.filter((r) => r.reference !== part.reference);
  const restant = toNum(part.currentStock);

  const stat = (label: string, value: string, accent?: string) => (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mono mt-0.5 text-lg font-bold ${accent ?? "text-slate-900"}`}>{value}</div>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1400px]">
      {/* Fil d'ariane + actions */}
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-[12.5px] text-slate-500">
          <Link href="/pieces" className="hover:text-blue-700">Pièces</Link>
          <span className="mx-1.5 text-slate-300">/</span>
          <span className="mono font-semibold text-slate-700">{part.reference}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/ventes/nouvelle?part=${part.id}`} className="btn btn-primary btn-sm">
            <ShoppingCart size={13} /> Vendre
          </Link>
          <AdjustStockButton
            partId={part.id}
            reference={part.reference}
            currentStock={restant}
            mode="entree"
            defaultUser={cfg.defaultUser}
            className="btn btn-secondary btn-sm"
          />
          <AdjustStockButton
            partId={part.id}
            reference={part.reference}
            currentStock={restant}
            mode="sortie"
            defaultUser={cfg.defaultUser}
            className="btn btn-secondary btn-sm"
          />
          <AdjustStockButton
            partId={part.id}
            reference={part.reference}
            currentStock={restant}
            mode="ajustement"
            defaultUser={cfg.defaultUser}
            className="btn btn-secondary btn-sm"
          />
          <Link href={`/pieces/${part.id}/modifier`} className="btn btn-secondary btn-sm">
            <Pencil size={13} /> Modifier
          </Link>
          <DeletePartButton partId={part.id} reference={part.reference} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* Colonne gauche : image + infos */}
        <div className="flex flex-col gap-4">
          <ImageManager
            partId={part.id}
            reference={part.reference}
            currentImage={part.imageFilename ? imageUrl(part.imageFilename, part.imageUpdatedAt) : null}
            filename={part.imageFilename}
          />

          <div className="card p-4">
            <h3 className="mb-2.5 text-[13px] font-bold text-slate-800">Localisation & unité</h3>
            <dl className="flex flex-col gap-2 text-[13px]">
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-1.5 text-slate-500"><MapPin size={13} /> Rayon</dt>
                <dd className="font-semibold">{part.location ?? "—"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-1.5 text-slate-500"><Ruler size={13} /> UM</dt>
                <dd className="font-semibold">{part.unit}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-1.5 text-slate-500"><Layers size={13} /> Catégorie</dt>
                <dd className="font-semibold">{part.category ?? "—"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-1.5 text-slate-500"><Tag size={13} /> Marque</dt>
                <dd className="font-semibold">{part.brand ?? "—"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-1.5 text-slate-500"><Truck size={13} /> Fournisseur</dt>
                <dd className="font-semibold">{supplierName ?? "—"}</dd>
              </div>
            </dl>
          </div>

          {/* Compatibilité véhicules */}
          <div className="card p-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-slate-800">
              <Car size={14} className="text-slate-400" /> Compatibilité véhicules
            </h3>
            {compatibilities.length === 0 ? (
              <p className="text-[12px] leading-relaxed text-slate-500">
                Aucune compatibilité vérifiée enregistrée. Ajoutez des
                correspondances lorsque les données constructeur / fournisseur
                sont disponibles — aucune compatibilité n&apos;est supposée.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {compatibilities.map((c) => (
                  <li key={c.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-2.5 text-[12px]">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                      {c.brand} {c.model}
                      {c.verified && <BadgeCheck size={13} className="text-emerald-600" />}
                    </div>
                    <div className="text-slate-500">
                      {c.yearFrom ?? "?"}–{c.yearTo ?? "?"} {c.engine ? `· ${c.engine}` : ""} {c.fuel ? `· ${c.fuel}` : ""}
                    </div>
                    {c.oemReference && <div className="mono text-[11px] text-slate-400">OEM : {c.oemReference}</div>}
                  </li>
                ))}
              </ul>
            )}
            <Link href={`/compatibilite?part=${part.id}`} className="mt-2.5 block text-[12px] font-medium text-blue-700 hover:underline">
              Gérer les compatibilités →
            </Link>
          </div>
        </div>

        {/* Colonne principale */}
        <div className="flex flex-col gap-4">
          {/* En-tête produit */}
          <div className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900">{part.designation}</h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="mono rounded-md bg-slate-900 px-2 py-0.5 text-[13px] font-bold text-white">
                    {part.reference}
                  </span>
                  {part.brand && <span className="badge badge-slate">{part.brand}</span>}
                  <StockBadge status={status} />
                </div>
              </div>
            </div>

            {(altRefs.length > 0 || (part.referenceRaw && part.referenceRaw !== part.reference)) && (
              <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">
                  Références alternatives (toutes recherchables)
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {altRefs.map((r) => (
                    <span key={r.id} className="mono rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[12px] font-semibold text-slate-700">
                      {r.reference}
                    </span>
                  ))}
                </div>
                {part.referenceRaw && (
                  <div className="mt-1.5 text-[11px] text-slate-400">
                    Valeur d&apos;origine du fichier Excel : <span className="mono">{part.referenceRaw}</span>
                  </div>
                )}
              </div>
            )}

            {part.description && (
              <p className="mt-3 text-[13px] leading-relaxed text-slate-600">{part.description}</p>
            )}
            {part.notes && (
              <p className="mt-2 rounded-lg bg-amber-50/70 p-2.5 text-[12px] italic text-amber-800">
                Note interne : {part.notes}
              </p>
            )}
          </div>

          {/* Prix */}
          <div className="card p-5">
            <h3 className="mb-3 text-[13px] font-bold text-slate-800">Tarification</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">Prix d&apos;Achat</div>
                <div className="mono mt-0.5 text-lg font-bold text-slate-700">
                  {formatDZD(part.purchasePrice, cfg.currencySuffix)}
                </div>
              </div>
              <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-blue-600">Prix Gros</div>
                <div className="mono mt-0.5 text-lg font-bold text-blue-800">
                  {formatDZD(part.wholesalePrice, cfg.currencySuffix)}
                </div>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-emerald-600">Prix Détail</div>
                <div className="mono mt-0.5 text-lg font-bold text-emerald-800">
                  {formatDZD(part.retailPrice, cfg.currencySuffix)}
                </div>
              </div>
            </div>
          </div>

          {/* Stock */}
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-bold text-slate-800">Stock — Stock restant = Stock initial + Entrées − Sorties</h3>
              <StockBadge status={status} />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {stat("Stock initial", formatQty(part.initialStock))}
              {stat("Entrées (+ retours)", formatQty(aggregates.entrees + aggregates.retours), "text-emerald-800")}
              {stat("Vendus", formatQty(aggregates.vendus), "text-blue-800")}
              {stat("Sorties", formatQty(aggregates.sorties), "text-amber-800")}
              {stat("Ajustements", formatQty(aggregates.ajustementsPos - aggregates.ajustementsNeg), "text-violet-800")}
              {stat("Stock restant", formatQty(restant), status === "rupture" ? "text-rose-700" : status === "faible" ? "text-amber-700" : "text-emerald-700")}
            </div>
            <div className="mono mt-2.5 text-[11.5px] text-slate-400">
              Seuil de stock faible : {formatQty(part.minStock)} {part.unit}
              {(aggregates.ajustementsPos > 0 || aggregates.ajustementsNeg > 0) && (
                <> · Ajustements : +{formatQty(aggregates.ajustementsPos)} / −{formatQty(aggregates.ajustementsNeg)}</>
              )}
            </div>
          </div>

          {/* Historique des mouvements */}
          <div className="card">
            <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="flex items-center gap-2 text-[13px] font-bold text-slate-800">
                <History size={15} className="text-slate-400" />
                Historique des mouvements
              </h3>
              <Link href={`/mouvements?q=${encodeURIComponent(part.reference)}`} className="text-xs font-medium text-blue-700 hover:underline">
                Tout voir
              </Link>
            </header>
            {movements.length === 0 ? (
              <EmptyState
                title="Aucun mouvement"
                description="Chaque entrée, vente, retour ou ajustement sera tracé ici avec avant / après."
              />
            ) : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th className="num">Quantité</th>
                      <th className="num">Avant</th>
                      <th className="num">Après</th>
                      <th>Motif</th>
                      <th>Utilisateur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => (
                      <tr key={m.id}>
                        <td className="whitespace-nowrap text-slate-500">{formatDateTime(m.createdAt)}</td>
                        <td><MovementsBadge type={m.type} /></td>
                        <td className="num font-bold">
                          {m.type === "vente" || m.type === "sortie" || m.type === "ajustement_neg" ? "−" : "+"}
                          {formatQty(m.quantity)}
                        </td>
                        <td className="num mono text-slate-500">{formatQty(m.previousStock)}</td>
                        <td className="num mono font-semibold">{formatQty(m.newStock)}</td>
                        <td className="max-w-[200px] truncate text-slate-500">
                          {m.reason ?? "—"}
                          {m.documentRef && <span className="mono block text-[10.5px] text-slate-400">{m.documentRef}</span>}
                        </td>
                        <td className="text-slate-500">{m.userName ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
