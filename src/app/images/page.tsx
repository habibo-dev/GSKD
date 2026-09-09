import Link from "next/link";
import { ImageIcon, ImageOff, FileText } from "lucide-react";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { parts, images } from "@/db/schema";
import { PageHeader, EmptyState, PartThumb } from "@/components/ui";
import { PdfImport } from "@/components/pdf-import";
import { formatInt } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ImagesPage() {
  const coverage = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM parts) AS parts,
      (SELECT count(*)::int FROM images) AS with_image
  `);
  const c = coverage.rows[0] as { parts: number; with_image: number };
  const partsTotal = c?.parts ?? 0;
  const withImage = c?.with_image ?? 0;
  const without = Math.max(0, partsTotal - withImage);

  const missing = await db
    .select({
      id: parts.id,
      reference: parts.reference,
      designation: parts.designation,
    })
    .from(parts)
    .leftJoin(images, eq(images.partId, parts.id))
    .where(sql`${images.id} IS NULL`)
    .orderBy(parts.reference)
    .limit(60);

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Photos produits — Import PDF"
        description="Rattachez aux pièces les photos du catalogue PDF : téléversez un fichier, vérifiez chaque découpe puis confirmez l'association."
      />

      {/* Bandeau couverture */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="card p-4 text-center">
          <div className="mono text-2xl font-bold text-slate-900">{formatInt(partsTotal)}</div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Pièces en base
          </div>
        </div>
        <div className="card p-4 text-center">
          <div className="mono text-2xl font-bold text-emerald-700">{formatInt(withImage)}</div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Avec photo
          </div>
        </div>
        <div className="card p-4 text-center">
          <div className="mono text-2xl font-bold text-amber-700">{formatInt(without)}</div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Sans photo
          </div>
        </div>
      </div>

      {/* Import PDF */}
      <PdfImport />

      {/* Pièces sans photo */}
      <div className="card mt-4 overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="flex items-center gap-2 text-[13px] font-bold text-slate-800">
            <ImageOff size={15} className="text-amber-500" />
            Pièces sans photo ({formatInt(without)})
            {without > missing.length && (
              <span className="text-[11px] font-normal text-slate-400">
                — {formatInt(missing.length)} affichées
              </span>
            )}
          </h3>
          <Link href="/pieces" className="text-xs font-medium text-blue-700 hover:underline">
            Tout voir
          </Link>
        </header>
        {missing.length === 0 ? (
          <EmptyState
            icon={ImageIcon}
            title="Toutes les pièces ont une photo"
            description="Ajoutez une image via la fiche d'une pièce, ou importez les photos depuis un PDF ci-dessus."
          />
        ) : (
          <ul className="max-h-[520px] divide-y divide-slate-100 overflow-auto">
            {missing.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/pieces/${p.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50"
                >
                  <PartThumb src={null} size={36} />
                  <span className="min-w-0">
                    <span className="mono block truncate text-[13px] font-bold text-slate-800">
                      {p.reference}
                    </span>
                    <span className="block truncate text-[11.5px] text-slate-500">
                      {p.designation}
                    </span>
                  </span>
                  <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-blue-700">
                    <FileText size={12} /> Ajouter une image
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
