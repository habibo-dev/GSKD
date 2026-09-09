"use client";

import { useEffect, useRef, useState } from "react";
import { FileDown, ChevronDown, Download } from "lucide-react";

type Option = { label: string; sub?: string; href: string };

export function PdfExportMenu({
  scope,
  params = {},
}: {
  scope: "catalogue" | "stock";
  params?: Record<string, string | undefined>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const mk = (extra: Record<string, string | number>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v) p.set(k, v);
    }
    for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
    return `/api/pdf-export?${p.toString()}`;
  };

  const dispo = params.dispo ?? "tous";
  const stockOnly = dispo === "disponible" ? 1 : 0;

  const options: Option[] =
    scope === "catalogue"
      ? [
          { label: "PDF complet", sub: "Photos + prix de vente", href: mk({ scope: "catalogue", images: 1, stockonly: stockOnly }) },
          { label: "PDF avec stock", sub: "Photos + prix + stock", href: mk({ scope: "catalogue", images: 1, stock: 1, stockonly: stockOnly }) },
          { label: "PDF sans images", sub: "Référence, désignation, prix", href: mk({ scope: "catalogue", images: 0, stockonly: stockOnly }) },
        ]
      : [
          { label: "PDF complet", sub: "Photos + prix + stock", href: mk({ scope: "stock", images: 1, stock: 1 }) },
          { label: "PDF avec stock", sub: "Photos + prix + stock", href: mk({ scope: "stock", images: 1, stock: 1 }) },
          { label: "PDF sans images", sub: "Texte uniquement", href: mk({ scope: "stock", images: 0, stock: 1 }) },
        ];

  // dédoublonne les libellés pour le scope stock
  const dedup: Option[] = [];
  for (const o of options) {
    if (!dedup.some((d) => d.label === o.label && d.sub === o.sub)) dedup.push(o);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="btn btn-secondary inline-flex items-center gap-1.5"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <FileDown size={14} />
        Exporter PDF
        <ChevronDown size={13} className={open ? "rotate-180" : ""} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1.5 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
        >
          {dedup.map((o) => (
            <a
              key={o.href + o.label}
              role="menuitem"
              href={o.href}
              className="flex items-start gap-2.5 px-3 py-2.5 text-[12.5px] text-slate-700 hover:bg-blue-50"
            >
              <Download size={14} className="mt-0.5 shrink-0 text-blue-600" />
              <span className="min-w-0">
                <span className="block font-semibold">{o.label}</span>
                {o.sub && <span className="block text-[10.5px] text-slate-400">{o.sub}</span>}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
