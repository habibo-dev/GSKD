import Link from "next/link";
import { FileDown, FileUp, History, FileText, FileArchive } from "lucide-react";
import { ImportWizard } from "@/components/import-wizard";
import { PdfImport } from "@/components/pdf-import";
import { PdfExportMenu } from "@/components/pdf-export-menu";
import { PageHeader, EmptyState } from "@/components/ui";
import { listImportBatches } from "@/lib/queries";
import { formatDateTime, formatInt } from "@/lib/format";

export const dynamic = "force-dynamic";

const EXPORTS: Array<{
  type: string;
  label: string;
  description: string;
}> = [
  { type: "stock", label: "Stock complet", description: "Toutes les pièces : références, prix, stock initial / entrées / vendus / restant — colonnes Excel d'origine." },
  { type: "catalogue", label: "Catalogue / Liste de prix", description: "Référence, désignation, marque, Prix Gros et Prix Détail — sans prix d'achat." },
  { type: "stock-faible", label: "Stock faible", description: "Pièces sous leur seuil minimum, à réapprovisionner." },
  { type: "ruptures", label: "Ruptures", description: "Pièces à stock nul." },
  { type: "ventes", label: "Ventes", description: "Détail des ventes : pièces, quantités, type de prix, montants." },
  { type: "mouvements", label: "Mouvements", description: "Journal complet d'audit des mouvements de stock." },
];

// Exports PDF présentables aux clients — générés en fichier .pdf réel (pdf-lib),
// avec les mêmes images canoniques que Pièces / Stock / Catalogue / Ventes.
const PDF_EXPORTS: Array<{
  scope: "catalogue" | "stock";
  label: string;
  description: string;
}> = [
  {
    scope: "catalogue",
    label: "Catalogue / Liste de prix",
    description: "Référence, désignation, marque, prix de vente et photo — mise en page A4 propre.",
  },
  {
    scope: "stock",
    label: "État du stock au prix de vente",
    description: "Référence, désignation, marque, prix de vente, stock restant et photo.",
  },
];

export default async function ImportExportPage() {
  const batches = await listImportBatches();

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Import / Export Excel"
        description="Excel devient une source d'import et d'export — la base de données est la référence quotidienne."
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-[13px] font-bold text-slate-800">
            <FileUp size={15} className="text-emerald-600" /> Import Excel
          </h3>
          <ImportWizard />

          <h3 className="mb-2 mt-6 flex items-center gap-2 text-[13px] font-bold text-slate-800">
            <FileText size={15} className="text-rose-600" /> Import PDF (photos catalogue)
            <Link href="/images" className="text-[11px] font-medium text-blue-700 hover:underline">
              Ouvrir la page Photos &amp; PDF →
            </Link>
          </h3>
          <PdfImport />
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-[13px] font-bold text-slate-800">
              <FileDown size={15} className="text-blue-600" /> Export Excel
            </h3>
            <div className="card divide-y divide-slate-100">
              {EXPORTS.map((e) => (
                <div key={e.type} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-bold text-slate-800">{e.label}</div>
                    <div className="text-[11.5px] leading-snug text-slate-500">{e.description}</div>
                  </div>
                  <a className="btn btn-secondary btn-xs shrink-0" href={`/api/export?type=${e.type}`}>
                    <FileDown size={12} /> .xlsx
                  </a>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 flex items-center gap-2 text-[13px] font-bold text-slate-800">
              <FileArchive size={15} className="text-rose-600" /> Export PDF
            </h3>
            <div className="card divide-y divide-slate-100">
              {PDF_EXPORTS.map((e) => (
                <div key={e.scope} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-bold text-slate-800">{e.label}</div>
                    <div className="text-[11.5px] leading-snug text-slate-500">{e.description}</div>
                  </div>
                  <PdfExportMenu scope={e.scope} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 flex items-center gap-2 text-[13px] font-bold text-slate-800">
              <History size={15} className="text-slate-400" /> Historique des imports
            </h3>
            <div className="card">
              {batches.length === 0 ? (
                <EmptyState
                  title="Aucun import"
                  description="Les lots d'import Excel seront listés ici."
                />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {batches.map((b) => (
                    <li key={b.id} className="px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="mono max-w-[200px] truncate text-[12.5px] font-bold text-slate-800" title={b.filename}>
                          {b.filename}
                        </span>
                        <span className="text-[11px] text-slate-400">{formatDateTime(b.createdAt)}</span>
                      </div>
                      <div className="mt-1 text-[11.5px] text-slate-500">
                        {formatInt(b.totalRows)} lignes
                        {b.status === "demo" ? (
                          <span className="ml-1 badge badge-violet">Données de démonstration</span>
                        ) : (
                          <>
                            {" · "}<span className="text-emerald-700 font-semibold">+{b.created} créées</span>
                            {" · "}<span className="text-blue-700 font-semibold">{b.updated} mises à jour</span>
                            {b.skipped > 0 && <>{" · "}{b.skipped} ignorées</>}
                            {b.invalid > 0 && <>{" · "}<span className="text-rose-600">{b.invalid} erreurs</span></>}
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
