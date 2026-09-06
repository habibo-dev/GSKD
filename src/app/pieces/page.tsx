import Link from "next/link";
import { Plus, ChevronLeft, ChevronRight, Package } from "lucide-react";
import { listParts, listBrands, listCategories, listRayons, type PartFilters } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { formatDZD, formatQty, formatInt, stockStatusOf, type StockStatus } from "@/lib/format";
import { imageUrl } from "@/lib/images";
import { PageHeader, PartThumb, StockBadge, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

function buildQuery(params: Record<string, string | undefined>, override: Record<string, string>) {
  const merged = { ...params, ...override };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v) sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export default async function PiecesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const filters: PartFilters = {
    q: sp.q ?? undefined,
    brand: sp.brand ?? undefined,
    category: sp.category ?? undefined,
    rayon: sp.rayon ?? undefined,
    status: (sp.status as StockStatus) || undefined,
  };
  const page = Math.max(1, Number(sp.page) || 1);
  const [{ rows, total, perPage }, brands, categories, rayons, cfg] =
    await Promise.all([
      listParts(filters, { page, perPage: 40, sort: (sp.sort as "reference") || "reference" }),
      listBrands(),
      listCategories(),
      listRayons(),
      getSettings(),
    ]);
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Pièces détachées"
        description={`${formatInt(total)} référence${total > 1 ? "s" : ""} dans la base`}
        actions={
          <>
            <a href="/api/export?type=stock" className="btn btn-secondary">
              Exporter Excel
            </a>
            <Link href="/pieces/nouvelle" className="btn btn-primary">
              <Plus size={14} /> Nouvelle pièce
            </Link>
          </>
        }
      />

      {/* Filtres */}
      <form method="GET" className="no-print card mb-3 grid grid-cols-2 gap-2 p-3 md:grid-cols-6">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Référence, désignation, marque…" className="input col-span-2" />
        <select name="brand" defaultValue={sp.brand ?? ""} className="select">
          <option value="">Toutes marques</option>
          {brands.map((b) => (
            <option key={b.id} value={b.name}>{b.name}</option>
          ))}
        </select>
        <select name="category" defaultValue={sp.category ?? ""} className="select">
          <option value="">Toutes catégories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>
        <select name="rayon" defaultValue={sp.rayon ?? ""} className="select">
          <option value="">Tous rayons</option>
          {rayons.map((r) => (
            <option key={r} value={r}>Rayon {r}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <select name="status" defaultValue={sp.status ?? ""} className="select">
            <option value="">Tout statut</option>
            <option value="disponible">Disponible</option>
            <option value="faible">Stock faible</option>
            <option value="rupture">Rupture</option>
          </select>
          <button type="submit" className="btn btn-primary shrink-0">Filtrer</button>
        </div>
      </form>

      <div className="card">
        {rows.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Aucune pièce trouvée"
            description="Modifiez les filtres, ajoutez une pièce manuellement ou importez votre inventaire Excel."
            action={
              <>
                <Link href="/pieces/nouvelle" className="btn btn-primary btn-sm mr-2">
                  <Plus size={13} /> Ajouter une pièce
                </Link>
                <Link href="/import-export" className="btn btn-secondary btn-sm">
                  Importer Excel
                </Link>
              </>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="w-12">Photo</th>
                  <th>Référence</th>
                  <th>Désignation</th>
                  <th>Marque</th>
                  <th>Rayon</th>
                  <th className="num">Stock restant</th>
                  <th>Statut</th>
                  <th className="num">Prix Gros</th>
                  <th className="num">Prix Détail</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const status = stockStatusOf(p.currentStock, p.minStock);
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/pieces/${p.id}`}>
                          <PartThumb
                            src={p.imageFilename ? imageUrl(p.imageFilename, p.imageUpdatedAt) : null}
                            size={40}
                          />
                        </Link>
                      </td>
                      <td>
                        <Link href={`/pieces/${p.id}`} className="mono font-bold text-slate-900 hover:text-blue-700">
                          {p.reference}
                        </Link>
                        {p.altCount > 1 && (
                          <span className="badge badge-slate ml-1.5" title={p.referenceRaw ?? ""}>
                            +{p.altCount - 1}
                          </span>
                        )}
                      </td>
                      <td className="max-w-[340px]">
                        <Link href={`/pieces/${p.id}`} className="block truncate text-slate-700 hover:text-blue-700">
                          {p.designation}
                        </Link>
                        {p.category && (
                          <span className="text-[11px] text-slate-400">{p.category}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap">{p.brand ?? "—"}</td>
                      <td className="whitespace-nowrap text-slate-500">{p.location ?? "—"}</td>
                      <td className="num mono font-bold">{formatQty(p.currentStock)} <span className="text-[10px] font-normal text-slate-400">{p.unit}</span></td>
                      <td><StockBadge status={status} /></td>
                      <td className="num mono text-slate-600">{formatDZD(p.wholesalePrice, cfg.currencySuffix)}</td>
                      <td className="num mono font-semibold">{formatDZD(p.retailPrice, cfg.currencySuffix)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="no-print mt-3 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Page {page} sur {totalPages} — {formatInt(total)} pièces
          </span>
          <div className="flex gap-1.5">
            <Link
              className={`btn btn-secondary btn-sm ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
              href={buildQuery(sp, { page: String(page - 1) })}
            >
              <ChevronLeft size={14} /> Préc.
            </Link>
            <Link
              className={`btn btn-secondary btn-sm ${page >= totalPages ? "pointer-events-none opacity-40" : ""}`}
              href={buildQuery(sp, { page: String(page + 1) })}
            >
              Suiv. <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
