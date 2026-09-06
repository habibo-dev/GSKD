"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, CircleCheck, TriangleAlert } from "lucide-react";

type Settings = {
  businessName: string;
  tagline: string;
  phone: string;
  address: string;
  currencySuffix: string;
  defaultMinStock: number;
  allowNegativeStock: boolean;
  defaultUser: string;
  cataloguePrice: "detail" | "gros";
};

export function SettingsForm({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [purgeBusy, setPurgeBusy] = useState(false);
  const [purgeError, setPurgeError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setBusy(false);
    }
  };

  const purge = async () => {
    if (confirmText !== "PURGER") return;
    setPurgeBusy(true);
    setPurgeError(null);
    try {
      const res = await fetch("/api/admin/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: confirmText }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        setPurgeError(d.error ?? "Échec de la purge.");
        return;
      }
      setConfirmText("");
      router.refresh();
      router.push("/");
    } finally {
      setPurgeBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="card p-5">
          <h3 className="mb-3 text-[13px] font-bold text-slate-800">Entreprise & catalogue</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nom de l&apos;entreprise</label>
              <input className="input" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
            </div>
            <div>
              <label className="label">Symbole monétaire</label>
              <input className="input" value={form.currencySuffix} onChange={(e) => setForm({ ...form, currencySuffix: e.target.value })} placeholder="DA" />
            </div>
            <div>
              <label className="label">Téléphone (en-tête du catalogue)</label>
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="label">Adresse (en-tête du catalogue)</label>
              <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="label">Prix mis en avant dans le catalogue</label>
              <select className="select" value={form.cataloguePrice} onChange={(e) => setForm({ ...form, cataloguePrice: e.target.value as "detail" | "gros" })}>
                <option value="detail">Prix Détail (vente au détail)</option>
                <option value="gros">Prix Gros (vente en gros)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="mb-3 text-[13px] font-bold text-slate-800">Stock & opérations</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Seuil de stock faible (défaut)</label>
              <input
                className="input num mono"
                inputMode="decimal"
                value={String(form.defaultMinStock)}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(",", "."));
                  if (e.target.value === "" || (Number.isFinite(n) && n >= 0)) {
                    setForm({ ...form, defaultMinStock: Number.isFinite(n) ? n : 0 });
                  }
                }}
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Appliqué aux nouvelles pièces ; ajustable pièce par pièce.
              </p>
            </div>
            <div>
              <label className="label">Opérateur par défaut</label>
              <input className="input" value={form.defaultUser} onChange={(e) => setForm({ ...form, defaultUser: e.target.value })} />
              <p className="mt-1 text-[11px] text-slate-400">Nom tracé dans les mouvements et ventes.</p>
            </div>
            <label className="col-span-2 flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-3">
              <input type="checkbox" className="mt-0.5" checked={form.allowNegativeStock} onChange={(e) => setForm({ ...form, allowNegativeStock: e.target.checked })} />
              <span>
                <span className="block text-[13px] font-bold text-slate-800">Autoriser le stock négatif</span>
                <span className="block text-[11.5px] leading-snug text-slate-500">
                  Par défaut, vendre plus que le stock disponible est bloqué. Activez
                  uniquement si votre pratique l&apos;exige (déconseillé).
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          {saved && (
            <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-emerald-700">
              <CircleCheck size={14} /> Paramètres enregistrés
            </span>
          )}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Enregistrer
          </button>
        </div>
      </form>

      <div>
        <div className="card border-rose-200 p-5">
          <h3 className="flex items-center gap-2 text-[13px] font-bold text-rose-700">
            <TriangleAlert size={15} /> Zone dangereuse — Purge des données
          </h3>
          <p className="mt-2 text-[12.5px] leading-relaxed text-slate-500">
            Supprime <strong>toutes</strong> les pièces, références, images,
            mouvements, ventes, véhicules, compatibilités et lots d&apos;import. Utile
            pour retirer les données de démonstration avant la mise en
            production. <strong>Action irréversible.</strong>
          </p>
          <label className="label mt-3">Saisissez PURGER pour confirmer</label>
          <div className="flex gap-2">
            <input
              className="input mono"
              placeholder="PURGER"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-danger shrink-0"
              disabled={confirmText !== "PURGER" || purgeBusy}
              onClick={purge}
            >
              {purgeBusy ? <Loader2 size={14} className="animate-spin" /> : <TriangleAlert size={14} />}
              Tout supprimer
            </button>
          </div>
          {purgeError && <p className="mt-2 text-[12px] font-medium text-rose-600">{purgeError}</p>}
        </div>
      </div>
    </div>
  );
}
