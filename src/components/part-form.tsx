"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, CircleAlert } from "lucide-react";

type Meta = {
  brands: Array<{ id: number; name: string }>;
  categories: Array<{ id: number; name: string }>;
  rayons: string[];
};

export function PartForm({
  mode,
  partId,
  initial,
}: {
  mode: "create" | "edit";
  partId?: number;
  initial?: Partial<{
    reference: string;
    designation: string;
    brand: string;
    category: string;
    purchasePrice: string;
    wholesalePrice: string;
    retailPrice: string;
    initialStock: string;
    minStock: string;
    unit: string;
    location: string;
    description: string;
    notes: string;
  }>;
}) {
  const router = useRouter();
  const [meta, setMeta] = useState<Meta>({ brands: [], categories: [], rayons: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    reference: initial?.reference ?? "",
    designation: initial?.designation ?? "",
    brand: initial?.brand ?? "",
    category: initial?.category ?? "",
    purchasePrice: initial?.purchasePrice ?? "",
    wholesalePrice: initial?.wholesalePrice ?? "",
    retailPrice: initial?.retailPrice ?? "",
    initialStock: initial?.initialStock ?? "",
    minStock: initial?.minStock ?? "",
    unit: initial?.unit ?? "U",
    location: initial?.location ?? "",
    description: initial?.description ?? "",
    notes: initial?.notes ?? "",
  });

  useEffect(() => {
    fetch("/api/meta")
      .then((r) => r.json())
      .then((d) => setMeta({ brands: d.brands ?? [], categories: d.categories ?? [], rayons: d.rayons ?? [] }))
      .catch(() => undefined);
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.reference.trim() || !form.designation.trim()) {
      setError("La référence et la désignation sont obligatoires.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(mode === "create" ? "/api/parts" : `/api/parts/${partId}`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { error?: string; id?: number };
      if (!res.ok) {
        setError(data.error ?? "Enregistrement impossible.");
        return;
      }
      const id = mode === "create" ? data.id : partId;
      router.push(`/pieces/${id}`);
      router.refresh();
    } catch {
      setError("Erreur réseau, réessayez.");
    } finally {
      setBusy(false);
    }
  };

  const isNumberField = (v: string) => v === "" || /^\d*([.,]\d*)?$/.test(v);

  return (
    <form onSubmit={submit} className="grid gap-4 lg:grid-cols-2">
      <div className="card p-5">
        <h3 className="mb-4 text-[13px] font-bold text-slate-800">Identification</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label label-required">Référence(s)</label>
            <input
              className="input mono"
              placeholder="8200137650 ou 7703800107 / 8200651172"
              value={form.reference}
              onChange={set("reference")}
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Séparez les références alternatives par « / », « ; » ou « , » — toutes seront recherchables. La valeur est conservée telle quelle.
            </p>
          </div>
          <div className="col-span-2">
            <label className="label label-required">Désignation</label>
            <input className="input" placeholder="Kit de distribution, filtre à huile…" value={form.designation} onChange={set("designation")} />
          </div>
          <div>
            <label className="label">Marque</label>
            <input className="input" list="brands-list" placeholder="Bosch, Valeo…" value={form.brand} onChange={set("brand")} />
            <datalist id="brands-list">
              {meta.brands.map((b) => <option key={b.id} value={b.name} />)}
            </datalist>
          </div>
          <div>
            <label className="label">Catégorie</label>
            <input className="input" list="cats-list" placeholder="Freinage, Filtration…" value={form.category} onChange={set("category")} />
            <datalist id="cats-list">
              {meta.categories.map((c) => <option key={c.id} value={c.name} />)}
            </datalist>
          </div>
          <div>
            <label className="label">Rayon</label>
            <input className="input" list="rayons-list" placeholder="A1, B3…" value={form.location} onChange={set("location")} />
            <datalist id="rayons-list">
              {meta.rayons.map((r) => <option key={r} value={r} />)}
            </datalist>
          </div>
          <div>
            <label className="label">UM (unité de mesure)</label>
            <input className="input" placeholder="U, jeu, kit…" value={form.unit} onChange={set("unit")} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="card p-5">
          <h3 className="mb-4 text-[13px] font-bold text-slate-800">Tarification (DA)</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Prix d&apos;Achat</label>
              <input className="input num mono" inputMode="decimal" placeholder="0,00" value={form.purchasePrice} onChange={(e) => isNumberField(e.target.value) && set("purchasePrice")(e as never)} />
            </div>
            <div>
              <label className="label">Prix Gros</label>
              <input className="input num mono" inputMode="decimal" placeholder="0,00" value={form.wholesalePrice} onChange={(e) => isNumberField(e.target.value) && set("wholesalePrice")(e as never)} />
            </div>
            <div>
              <label className="label">Prix Détail</label>
              <input className="input num mono" inputMode="decimal" placeholder="0,00" value={form.retailPrice} onChange={(e) => isNumberField(e.target.value) && set("retailPrice")(e as never)} />
            </div>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="mb-4 text-[13px] font-bold text-slate-800">Stock</h3>
          <div className="grid grid-cols-2 gap-3">
            {mode === "create" && (
              <div>
                <label className="label">Stock initial</label>
                <input className="input num mono" inputMode="decimal" placeholder="0" value={form.initialStock} onChange={(e) => isNumberField(e.target.value) && set("initialStock")(e as never)} />
              </div>
            )}
            <div>
              <label className="label">Seuil de stock faible</label>
              <input className="input num mono" inputMode="decimal" placeholder="2" value={form.minStock} onChange={(e) => isNumberField(e.target.value) && set("minStock")(e as never)} />
              <p className="mt-1 text-[11px] text-slate-400">
                Alerte « Stock faible » en dessous de ce seuil (configurable).
              </p>
            </div>
          </div>
          {mode === "edit" && (
            <p className="mt-2 text-[11.5px] leading-snug text-slate-400">
              Le stock ne se modifie pas ici : utilisez Entrée / Vente / Retour /
              Ajustement pour conserver une traçabilité complète.
            </p>
          )}
        </div>

        <div className="card p-5">
          <h3 className="mb-4 text-[13px] font-bold text-slate-800">Informations complémentaires</h3>
          <div className="grid gap-3">
            <div>
              <label className="label">Description</label>
              <textarea className="textarea" rows={2} value={form.description} onChange={set("description")} />
            </div>
            <div>
              <label className="label">Notes internes</label>
              <textarea className="textarea" rows={2} value={form.notes} onChange={set("notes")} />
            </div>
          </div>
        </div>
      </div>

      <div className="lg:col-span-2">
        {error && (
          <p className="mb-3 flex items-center gap-2 rounded-lg bg-rose-50 p-2.5 text-[12.5px] font-medium text-rose-700">
            <CircleAlert size={14} /> {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => router.back()} disabled={busy}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {mode === "create" ? "Créer la pièce" : "Enregistrer les modifications"}
          </button>
        </div>
      </div>
    </form>
  );
}
