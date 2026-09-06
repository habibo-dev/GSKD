"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";

export function DeleteVehicleButton({ id }: { id: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-ghost btn-xs text-rose-500"
      disabled={busy}
      onClick={async () => {
        if (!confirm("Supprimer ce véhicule ? Ses liaisons de compatibilité seront supprimées.")) return;
        setBusy(true);
        try {
          await fetch(`/api/vehicles?id=${id}`, { method: "DELETE" });
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
    </button>
  );
}
