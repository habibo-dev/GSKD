"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Loader2, Trash2, BadgeCheck, Car, Package } from "lucide-react";

type Vehicle = {
  id: number;
  brand: string;
  model: string;
  yearFrom: number | null;
  yearTo: number | null;
  engine: string | null;
  fuel: string | null;
};

type CompatRow = {
  id: number;
  partId: number;
  reference: string;
  designation: string;
  vehicleId: number;
  vBrand: string;
  vModel: string;
  vYearFrom: number | null;
  vYearTo: number | null;
  vEngine: string | null;
  vFuel: string | null;
  oemReference: string | null;
  source: string | null;
  verified: boolean;
};

type Found = { id: number; reference: string; designation: string; brand: string | null };

const SOURCES = ["Fournisseur", "Constructeur", "Catalogue officiel", "Mesure / montage réel", "Autre"];

export function CompatManager({
  vehicles,
  initial,
  presetPartId,
}: {
  vehicles: Vehicle[];
  initial: CompatRow[];
  presetPartId?: number;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Found[]>([]);
  const [part, setPart] = useState<Found | null>(null);
  const [vehicleId, setVehicleId] = useState("");
  const [oemReference, setOemReference] = useState("");
  const [source, setSource] = useState(SOURCES[0]);
  const [verified, setVerified] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pré-sélection via ?part=<id>
  useEffect(() => {
    if (!presetPartId) return;
    fetch(`/api/parts/${presetPartId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.part) setPart({ id: d.part.id, reference: d.part.reference, designation: d.part.designation, brand: null });
      })
      .catch(() => undefined);
  }, [presetPartId]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}&limit=6`);
      const data = (await res.json()) as { results: Found[] };
      setHits(data.results);
    }, 170);
    return () => clearTimeout(t);
  }, [q]);

  const submit = async () => {
    if (!part || !vehicleId) {
      setError("Sélectionnez une pièce et un véhicule.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/compatibilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partId: part.id,
          vehicleId: Number(vehicleId),
          oemReference,
          source,
          verified,
          notes,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Enregistrement impossible.");
        return;
      }
      setOemReference("");
      setNotes("");
      setVerified(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Supprimer cette liaison de compatibilité ?")) return;
    await fetch(`/api/compatibilities?id=${id}`, { method: "DELETE" });
    router.refresh();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      {/* Formulaire */}
      <div className="card h-fit p-4">
        <h3 className="mb-3 text-[13px] font-bold text-slate-800">
          Lier une pièce à un véhicule
        </h3>
        <p className="mb-3 rounded-lg bg-blue-50/70 p-2.5 text-[11.5px] leading-snug text-blue-900">
          N'ajoutez que des compatibilités fiables (données fournisseur,
          constructeur ou montage réel). Aucune compatibilité n'est déduite
          automatiquement.
        </p>

        {part ? (
          <div className="mb-3 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50/60 p-2.5">
            <div className="flex items-center gap-2">
              <Package size={15} className="text-blue-600" />
              <div>
                <div className="mono text-[12.5px] font-bold text-slate-800">{part.reference}</div>
                <div className="max-w-[260px] truncate text-[11.5px] text-slate-500">{part.designation}</div>
              </div>
            </div>
            <button className="btn btn-ghost btn-xs" onClick={() => setPart(null)}>Changer</button>
          </div>
        ) : (
          <div className="relative mb-3">
            <label className="label">Pièce</label>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-8"
                placeholder="Rechercher la pièce (référence, nom)…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            {hits.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                {hits.map((h) => (
                  <button
                    key={h.id}
                    className="block w-full border-b border-slate-50 px-3 py-2 text-left last:border-0 hover:bg-blue-50/60"
                    onClick={() => {
                      setPart(h);
                      setHits([]);
                      setQ("");
                    }}
                  >
                    <span className="mono text-[12.5px] font-bold">{h.reference}</span>
                    <span className="ml-2 text-[12px] text-slate-600">{h.designation}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <label className="label">Véhicule</label>
        <select className="select" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
          <option value="">— Choisir un véhicule —</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.brand} {v.model} {v.yearFrom ?? "?"}–{v.yearTo ?? "?"} {v.engine ?? ""} {v.fuel ?? ""}
            </option>
          ))}
        </select>
        {vehicles.length === 0 && (
          <p className="mt-1 text-[11.5px] text-amber-700">
            Aucun véhicule : ajoutez-en d'abord dans « Véhicules ».
          </p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div>
            <label className="label">Référence OEM</label>
            <input className="input mono" placeholder="77 01 479 …" value={oemReference} onChange={(e) => setOemReference(e.target.value)} />
          </div>
          <div>
            <label className="label">Source</label>
            <select className="select" value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-[12.5px] text-slate-600">
          <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
          Compatibilité vérifiée (montage confirmé)
        </label>
        <div className="mt-2.5">
          <label className="label">Notes</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {error && <p className="mt-2 text-[12px] font-medium text-rose-600">{error}</p>}
        <button className="btn btn-primary mt-3 w-full" onClick={submit} disabled={busy || !part || !vehicleId}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Enregistrer la compatibilité
        </button>
      </div>

      {/* Liste */}
      <div className="card">
        <div className="border-b border-slate-100 px-4 py-3 text-[13px] font-bold text-slate-800">
          Compatibilités enregistrées ({initial.length})
        </div>
        {initial.length === 0 ? (
          <div className="grid place-items-center px-6 py-14 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-400">
              <Car size={22} strokeWidth={1.6} />
            </span>
            <p className="mt-3 max-w-sm text-[12.5px] leading-relaxed text-slate-500">
              Aucune compatibilité enregistrée. La structure est prête :
              ajoutez les correspondances Pièce ↔ Véhicule dès que vous disposez
              de données fiables (catalogues fournisseurs, références OEM).
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Pièce</th>
                  <th>Véhicule</th>
                  <th>Réf. OEM</th>
                  <th>Source</th>
                  <th>Vérifiée</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {initial.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className="mono font-bold text-slate-800">{c.reference}</span>
                      <span className="block max-w-[220px] truncate text-xs text-slate-500">{c.designation}</span>
                    </td>
                    <td>
                      <span className="font-semibold">{c.vBrand} {c.vModel}</span>
                      <span className="block text-xs text-slate-500">
                        {c.vYearFrom ?? "?"}–{c.vYearTo ?? "?"} {c.vEngine ? `· ${c.vEngine}` : ""} {c.vFuel ? `· ${c.vFuel}` : ""}
                      </span>
                    </td>
                    <td className="mono text-[12px] text-slate-600">{c.oemReference ?? "—"}</td>
                    <td className="text-slate-600">{c.source ?? "—"}</td>
                    <td>
                      {c.verified ? (
                        <span className="badge badge-emerald"><BadgeCheck size={11} /> Vérifiée</span>
                      ) : (
                        <span className="badge badge-slate">À vérifier</span>
                      )}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-xs text-rose-500" onClick={() => remove(c.id)}>
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
