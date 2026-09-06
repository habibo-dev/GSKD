import Link from "next/link";
import { PackageSearch } from "lucide-react";

export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-200/60 text-slate-400">
          <PackageSearch size={26} strokeWidth={1.6} />
        </span>
        <h2 className="mt-4 text-xl font-bold text-slate-800">Page introuvable</h2>
        <p className="mt-1 text-[13px] text-slate-500">
          La page ou la pièce demandée n&apos;existe pas (ou a été supprimée).
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link href="/" className="btn btn-primary btn-sm">Tableau de bord</Link>
          <Link href="/recherche" className="btn btn-secondary btn-sm">Recherche</Link>
        </div>
      </div>
    </div>
  );
}
