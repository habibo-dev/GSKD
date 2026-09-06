"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToDot, RotateCcw, Wrench, X, Loader2 } from "lucide-react";

type Mode = "entree" | "retour" | "ajustement";

const MODE_CONFIG: Record<
  Mode,
  { title: string; button: string; hint: string; icon: typeof ArrowDownToDot }
> = {
  entree: {
    title: "Enregistrer une entrée",
    button: "Entrée",
    hint: "Réapprovisionnement fournisseur : la quantité est ajoutée au stock.",
    icon: ArrowDownToDot,
  },
  retour: {
    title: "Enregistrer un retour",
    button: "Retour",
    hint: "Retour client : la quantité est réintégrée au stock.",
    icon: RotateCcw,
  },
  ajustement: {
    title: "Ajuster le stock",
    button: "Ajuster",
    hint: "Correction d'inventaire : choisissez le sens de l'ajustement. Tracé dans l'historique.",
    icon: Wrench,
  },
};

export function AdjustStockButton({
  partId,
  reference,
  currentStock,
  mode,
  defaultUser,
  className = "btn btn-secondary",
  children,
}: {
  partId: number;
  reference: string;
  currentStock: number;
  mode: Mode;
  defaultUser: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [sign, setSign] = useState<"pos" | "neg">("pos");
  const [reason, setReason] = useState("");
  const [documentRef, setDocumentRef] = useState("");
  const [userName, setUserName] = useState(defaultUser);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cfg = MODE_CONFIG[mode];
  const Icon = cfg.icon;

  const submit = async () => {
    const qty = Number(quantity.replace(",", "."));
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Saisissez une quantité valide (supérieure à 0).");
      return;
    }
    const type =
      mode === "entree"
        ? "entree"
        : mode === "retour"
          ? "retour"
          : sign === "pos"
            ? "ajustement_pos"
            : "ajustement_neg";
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partId,
          type,
          quantity: qty,
          reason: reason || cfg.title,
          documentRef: documentRef || null,
          userName: userName || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string; newStock?: number };
      if (!res.ok) {
        setError(data.error ?? "Le mouvement a été refusé.");
        return;
      }
      setOpen(false);
      setQuantity("1");
      setReason("");
      setDocumentRef("");
      router.refresh();
    } catch {
      setError("Erreur réseau, réessayez.");
    } finally {
      setBusy(false);
    }
  };

  const newStock =
    Number(quantity.replace(",", ".")) > 0
      ? currentStock +
        (mode === "ajustement" && sign === "neg" ? -1 : 1) *
          Number(quantity.replace(",", "."))
      : null;

  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>
        {children ?? (
          <>
            <Icon size={14} />
            {cfg.button}
          </>
        )}
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] grid place-items-center p-4">
          <div className="absolute inset-0 bg-slate-950/50" onClick={() => !busy && setOpen(false)} />
          <div className="card relative w-full max-w-md p-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-[15px] font-bold text-slate-900">
                  <Icon size={17} className="text-blue-600" />
                  {cfg.title}
                </h3>
                <p className="mono mt-0.5 text-[12px] text-slate-500">
                  {reference} — stock actuel : {currentStock}
                </p>
              </div>
              <button className="btn btn-ghost btn-xs" onClick={() => setOpen(false)} disabled={busy}>
                <X size={15} />
              </button>
            </div>
            <p className="mt-2 rounded-lg bg-slate-50 p-2.5 text-[12px] text-slate-500">{cfg.hint}</p>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="label label-required">Quantité</label>
                <input
                  autoFocus
                  className="input"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Effectué par</label>
                <input className="input" value={userName} onChange={(e) => setUserName(e.target.value)} />
              </div>
              {mode === "ajustement" && (
                <div className="col-span-2">
                  <label className="label">Sens de l'ajustement</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className={`btn ${sign === "pos" ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => setSign("pos")}
                    >
                      Positif (+)
                    </button>
                    <button
                      type="button"
                      className={`btn ${sign === "neg" ? "btn-danger" : "btn-secondary"}`}
                      onClick={() => setSign("neg")}
                    >
                      Négatif (−)
                    </button>
                  </div>
                </div>
              )}
              <div>
                <label className="label">Motif</label>
                <input
                  className="input"
                  placeholder={mode === "entree" ? "Livraison fournisseur…" : "Motif…"}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Document (bon, BL…)</label>
                <input
                  className="input"
                  placeholder="N° de document"
                  value={documentRef}
                  onChange={(e) => setDocumentRef(e.target.value)}
                />
              </div>
            </div>

            {newStock !== null && (
              <p className={`mono mt-3 rounded-lg p-2 text-center text-[13px] font-bold ${newStock < 0 ? "bg-rose-50 text-rose-700" : "bg-blue-50 text-blue-800"}`}>
                Nouveau stock : {currentStock} → {newStock}
              </p>
            )}
            {error && <p className="mt-2 text-center text-[12px] font-medium text-rose-600">{error}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setOpen(false)} disabled={busy}>
                Annuler
              </button>
              <button className="btn btn-primary" onClick={submit} disabled={busy}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
                Confirmer le mouvement
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
