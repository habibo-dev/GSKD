"use client";

import { Printer } from "lucide-react";

export function PrintButton({
  label = "Imprimer",
  className = "btn btn-secondary",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      <Printer size={14} />
      {label} <span className="hidden text-slate-400 sm:inline">(PDF)</span>
    </button>
  );
}
