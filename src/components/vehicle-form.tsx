"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, CircleAlert } from "lucide-react";

const FUELS = ["Essence", "Diesel", "GPL", "Hybride", "Électrique", "Autre"];

export function VehicleForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    brand: "",
    model: "",
    yearFrom: "",
    yearTo: "",
    engine: "",
    fuel: "",
    notes: "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.brand.trim() || !form.model.trim()) {
      setError("La marque et le modèle sont obligatoires.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Enregistrement impossible.");
        return;
      }
      setForm({ brand: "", model: "", yearFrom: "", yearTo: "", engine: "", fuel: "", notes: "" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card p-4">
      <h3 className="mb-3 text-[13px] font-bold text-slate-800">Ajouter un véhicule</h3>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="label label-required">Marque</label>
          <input className="input" placeholder="Renault, Peugeot…" value={form.brand} onChange={set("brand")} />
        </div>
        <div>
          <label className="label label-required">Modèle</label>
          <input className="input" placeholder="Clio III, 206…" value={form.model} onChange={set("model")} />
        </div>
        <div>
          <label className="label">Année début</label>
          <input className="input mono" inputMode="numeric" placeholder="2005" value={form.yearFrom} onChange={set("yearFrom")} />
        </div>
        <div>
          <label className="label">Année fin</label>
          <input className="input mono" inputMode="numeric" placeholder="2012" value={form.yearTo} onChange={set("yearTo")} />
        </div>
        <div>
          <label className="label">Motorisation</label>
          <input className="input" placeholder="1.5 dCi" value={form.engine} onChange={set("engine")} />
        </div>
        <div>
          <label className="label">Carburant</label>
          <select className="select" value={form.fuel} onChange={set("fuel")}>
            <option value="">—</option>
            {FUELS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">Notes</label>
          <input className="input" placeholder="K9K, phase 2…" value={form.notes} onChange={set("notes")} />
        </div>
      </div>
      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-rose-600">
          <CircleAlert size={13} /> {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary mt-3 w-full" disabled={busy}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        Ajouter le véhicule
      </button>
    </form>
  );
}
