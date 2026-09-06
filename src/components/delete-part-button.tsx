"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";

export function DeletePartButton({ partId, reference }: { partId: number; reference: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (
      !confirm(
        `Supprimer définitivement la pièce « ${reference} » ?\n\nSes références alternatives et son image seront supprimées. L'historique des ventes et mouvements conservé (archivage par référence).`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/parts/${partId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/pieces");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button className="btn btn-ghost text-rose-600 hover:bg-rose-50" onClick={remove} disabled={busy}>
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
      Supprimer
    </button>
  );
}
