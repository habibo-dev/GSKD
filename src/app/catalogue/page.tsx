import Link from "next/link";
import { listParts, listBrands, listCategories, type PartFilters } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { formatDZD, formatDate, stockStatusOf, type StockStatus } from "@/lib/format";
import { imageUrl } from "@/lib/images";
import { PrintButton } from "@/components/print-button";
import { BookOpen } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CataloguePage({
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
  const dispo = sp.dispo ?? "tous";
  if (dispo === "disponible") filters.status = undefined;
  const [{ rows, total }, brands, categories, cfg] = await Promise.all([
    listParts(filters, {
      perPage: 500,
      sort: sp.sort === "designation" ? "designation" : sp.sort === "prix" ? "prix" : "reference",
    }),
    listBrands(),
    listCategories(),
    getSettings(),
  ]);
  const visible = dispo === "disponible" ? rows.filter((r) => Number(r.currentStock) > 0) : rows;

  const exportParams = new URLSearchParams();
  exportParams.set("type", "catalogue");
  for (const k of ["q", "brand", "category", "rayon"] as const) {
    if (sp[k]) exportParams.set(k, sp[k]!);
  }

  const showGros = cfg.cataloguePrice === "gros";

  return (
    <div className="mx-auto max-w-[1400px]">
      {/* ---------- ÉCRAN ---------- */}
      <div className="no-print mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <BookOpen size={19} className="text-blue-600" />
            Catalogue — Liste des Articles au Prix de Vente
          </h2>
          <p className="mt-0.5 text-[13px] text-slate-500">
            {total} article{total > 1 ? "s" : ""} · Édition du {formatDate(new Date())} · Présentable aux clients (aucun prix d&apos;achat affiché)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn btn-secondary" href={`/api/export?${exportParams.toString()}`}>
            Exporter Excel
          </a>
          <PrintButton />
        </div>
      </div>

      <form method="GET" className="no-print card mb-4 grid grid-cols-2 gap-2 p-3 md:grid-cols-6">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Référence, désignation…" className="input col-span-2" />
        <select name="brand" defaultValue={sp.brand ?? ""} className="select">
          <option value="">Toutes marques</option>
          {brands.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
        </select>
        <select name="category" defaultValue={sp.category ?? ""} className="select">
          <option value="">Toutes catégories</option>
          {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <select name="dispo" defaultValue={dispo} className="select">
          <option value="tous">Tous articles</option>
          <option value="disponible">En stock uniquement</option>
        </select>
        <div className="flex gap-2">
          <select name="sort" defaultValue={sp.sort ?? "reference"} className="select">
            <option value="reference">Tri : Référence</option>
            <option value="designation">Tri : Désignation</option>
            <option value="prix">Tri : Prix décroissant</option>
          </select>
          <button className="btn btn-primary shrink-0" type="submit">Appliquer</button>
        </div>
      </form>

      {/* Grille écran */}
      <div className="no-print grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {visible.map((p) => {
          const status = stockStatusOf(p.currentStock, p.minStock);
          return (
            <Link
              key={p.id}
              href={`/pieces/${p.id}`}
              className="card group flex flex-col overflow-hidden transition-shadow hover:shadow-lg"
            >
              <div className="relative aspect-[4/3] overflow-hidden border-b border-slate-100 bg-slate-50">
                {p.imageFilename ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl(p.imageFilename, p.imageUpdatedAt)}
                    alt={p.designation}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                  />
                ) : (
                  <div className="grid h-full place-items-center text-slate-300">
                    <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                      <circle cx="9" cy="9" r="2" />
                      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                    </svg>
                  </div>
                )}
                {status === "rupture" && (
                  <span className="absolute left-2 top-2 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    Rupture
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col p-3">
                <div className="mono text-[12.5px] font-bold text-slate-900">{p.reference}</div>
                <div className="mt-0.5 line-clamp-2 min-h-8 text-[12px] leading-snug text-slate-600">{p.designation}</div>
                <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">{p.brand ?? "—"}</div>
                <div className="mt-auto pt-2">
                  <div className="mono text-[15px] font-bold text-blue-700">
                    {formatDZD(showGros ? p.wholesalePrice : p.retailPrice, cfg.currencySuffix)}
                  </div>
                  <div className="mono text-[11px] text-slate-400">
                    {showGros ? "Prix Gros" : "Prix Détail"}
                    {" · Gros "}
                    {formatDZD(p.wholesalePrice, cfg.currencySuffix)}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      {visible.length === 0 && (
        <div className="no-print card p-10 text-center text-[13px] text-slate-500">
          Aucun article ne correspond aux filtres — élargissez la recherche ou importez votre inventaire.
        </div>
      )}

      {/* ---------- IMPRESSION ---------- */}
      <div className="print-only">
        <div style={{ textAlign: "center", marginBottom: "10pt" }}>
          <div style={{ fontSize: "16pt", fontWeight: 800, letterSpacing: "-0.01em" }}>
            {cfg.businessName} — Liste des Articles au Prix de Vente
          </div>
          <div style={{ fontSize: "9pt", color: "#475569", marginTop: "3pt" }}>
            Édition du : {formatDate(new Date())}
            {cfg.phone ? ` · Tél : ${cfg.phone}` : ""}
            {cfg.address ? ` · ${cfg.address}` : ""}
          </div>
        </div>
        <table className="print-table">
          <thead>
            <tr>
              <th style={{ width: "44pt" }}>Photo</th>
              <th style={{ width: "80pt" }}>Référence</th>
              <th>Désignation</th>
              <th style={{ width: "64pt" }}>Marque</th>
              <th style={{ width: "70pt", textAlign: "right" }}>Prix Gros</th>
              <th style={{ width: "70pt", textAlign: "right" }}>Prix Détail</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.imageFilename ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageUrl(p.imageFilename, p.imageUpdatedAt)}
                      alt=""
                      style={{ width: "36pt", height: "36pt", objectFit: "cover", borderRadius: "3pt" }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "36pt",
                        height: "36pt",
                        border: "0.5pt dashed #cbd5e1",
                        borderRadius: "3pt",
                      }}
                    />
                  )}
                </td>
                <td style={{ fontFamily: "monospace", fontWeight: 700 }}>{p.reference}</td>
                <td>{p.designation}</td>
                <td>{p.brand ?? "—"}</td>
                <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                  {formatDZD(p.wholesalePrice, cfg.currencySuffix)}
                </td>
                <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>
                  {formatDZD(p.retailPrice, cfg.currencySuffix)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: "8pt", fontSize: "8pt", color: "#64748b", textAlign: "center" }}>
          {total} article(s) — Prix au {formatDate(new Date())}, susceptibles de modification · {cfg.businessName}
        </div>
      </div>
    </div>
  );
}
