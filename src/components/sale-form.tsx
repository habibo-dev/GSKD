"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search,
  Plus,
  Trash2,
  Loader2,
  ShoppingCart,
  CircleAlert,
  CircleCheck,
  User,
  StickyNote,
} from "lucide-react";

type Found = {
  id: number;
  reference: string;
  designation: string;
  brand: string | null;
  currentStock: number;
  wholesalePrice: number;
  retailPrice: number;
  unit: string;
  status: string;
  image: string | null;
};

type Line = {
  part: Found;
  quantity: string;
  priceType: "gros" | "detail";
};

function fmt(n: number) {
  return `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} DA`;
}

export function SaleForm({
  presetPartId,
  defaultUser,
  currency,
}: {
  presetPartId?: number;
  defaultUser: string;
  currency: string;
}) {
  void currency;
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Found[]>([]);
  const [searching, setSearching] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [clientName, setClientName] = useState("");
  const [userName, setUserName] = useState(defaultUser);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ number: string; total: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const term = q.trim();
  const canSearch = term.length >= 2;

  const addLine = (part: Found) => {
    setLines((ls) => {
      if (ls.some((l) => l.part.id === part.id)) return ls;
      return [...ls, { part, quantity: "1", priceType: "detail" }];
    });
    setQ("");
    setHits([]);
    searchRef.current?.focus();
    setError(null);
  };

  // Pré-remplissage via /ventes/nouvelle?part=<id>
  useEffect(() => {
    if (!presetPartId) return;
    fetch(`/api/parts/${presetPartId}`)
      .then((r) => r.json())
      .then((d) => {
        const p = d.part;
        if (!p) return;
        addLine({
          id: p.id,
          reference: p.reference,
          designation: p.designation,
          brand: null,
          currentStock: Number(p.currentStock),
          wholesalePrice: Number(p.wholesalePrice),
          retailPrice: Number(p.retailPrice),
          unit: p.unit,
          status: "disponible",
          image: null,
        });
      })
      .catch(() => undefined);
  }, [presetPartId]);

  useEffect(() => {
    if (!canSearch) return;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}&limit=7`);
        const data = (await res.json()) as { results: Found[] };
        setHits(data.results);
      } finally {
        setSearching(false);
      }
    }, 170);
    return () => clearTimeout(t);
  }, [canSearch, term]);

  const visibleHits = canSearch ? hits : [];
  const visibleSearching = canSearch && searching;

  const updateLine = (id: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.part.id === id ? { ...l, ...patch } : l)));

  const removeLine = (id: number) => setLines((ls) => ls.filter((l) => l.part.id !== id));

  const lineTotal = (l: Line) => {
    const qty = Number(l.quantity.replace(",", "."));
    const price = l.priceType === "gros" ? l.part.wholesalePrice : l.part.retailPrice;
    return Number.isFinite(qty) && qty > 0 ? qty * price : 0;
  };

  const total = useMemo(() => lines.reduce((s, l) => s + lineTotal(l), 0), [lines]);

  const stockErrors = lines.filter((l) => {
    const qty = Number(l.quantity.replace(",", "."));
    return qty > l.part.currentStock;
  });

  const submit = async () => {
    const items = lines
      .map((l) => ({
        partId: l.part.id,
        quantity: Number(l.quantity.replace(",", ".")),
        priceType: l.priceType,
      }))
      .filter((i) => i.quantity > 0);
    if (!items.length) {
      setError("Ajoutez au moins une pièce avec une quantité valide.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName, userName, notes, items }),
      });
      const data = (await res.json()) as { error?: string; number?: string; total?: number };
      if (!res.ok) {
        setError(data.error ?? "La vente a été refusée.");
        return;
      }
      setDone({ number: data.number ?? "", total: data.total ?? 0 });
      router.refresh();
    } catch {
      setError("Erreur réseau, réessayez.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
          <CircleCheck size={30} strokeWidth={1.8} />
        </span>
        <h3 className="mt-4 text-lg font-bold text-slate-900">Vente enregistrée</h3>
        <p className="mono mt-1 text-[13px] text-slate-500">
          N° {done.number} — Total : <span className="font-bold text-slate-800">{fmt(done.total)}</span>
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-slate-500">
          Le stock a été déduit, les quantités vendues mises à jour et chaque
          ligne a généré un mouvement de stock tracé.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button className="btn btn-primary" onClick={() => { setDone(null); setLines([]); setClientName(""); setNotes(""); }}>
            <Plus size={14} /> Nouvelle vente
          </button>
          <Link href="/ventes" className="btn btn-secondary">Historique des ventes</Link>
          <Link href="/" className="btn btn-ghost">Tableau de bord</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-4">
        {/* Recherche produit */}
        <div className="card p-4">
          <label className="label">Ajouter une pièce à la vente</label>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Scannez ou tapez : référence, désignation, marque…"
              className="input h-10 pl-9"
              autoFocus
            />
            {visibleSearching && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-blue-600" />}
          </div>
          {visibleHits.length > 0 && (
            <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
              {visibleHits.map((h) => (
                <button
                  key={h.id}
                  onClick={() => addLine(h)}
                  className="flex w-full items-center gap-3 border-b border-slate-50 px-3 py-2 text-left last:border-0 hover:bg-blue-50/60"
                >
                  <div className="min-w-0 flex-1">
                    <span className="mono text-[13px] font-bold">{h.reference}</span>
                    <span className="ml-2 text-[12.5px] text-slate-600">{h.designation}</span>
                    <span className="block text-[11px] text-slate-400">
                      Stock : {h.currentStock} {h.unit} · Détail {fmt(h.retailPrice)}
                    </span>
                  </div>
                  <Plus size={15} className="shrink-0 text-blue-600" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Lignes de la vente */}
        <div className="card">
          <div className="border-b border-slate-100 px-4 py-3 text-[13px] font-bold text-slate-800">
            Lignes de la vente ({lines.length})
          </div>
          {lines.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-slate-400">
              Aucune pièce ajoutée — utilisez la recherche ci-dessus.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Pièce</th>
                    <th className="w-24">Quantité</th>
                    <th className="w-36">Type de prix</th>
                    <th className="num">Prix unitaire</th>
                    <th className="num">Total</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const qty = Number(l.quantity.replace(",", "."));
                    const over = qty > l.part.currentStock;
                    const unitPrice = l.priceType === "gros" ? l.part.wholesalePrice : l.part.retailPrice;
                    return (
                      <tr key={l.part.id}>
                        <td>
                          <span className="mono text-[12.5px] font-bold">{l.part.reference}</span>
                          <span className="block max-w-[220px] truncate text-xs text-slate-500">{l.part.designation}</span>
                          <span className={`text-[10.5px] ${over ? "font-bold text-rose-600" : "text-slate-400"}`}>
                            Stock disponible : {l.part.currentStock} {l.part.unit}
                            {over && " — dépassement"}
                          </span>
                        </td>
                        <td>
                          <input
                            className={`input num mono h-8 ${over ? "border-rose-400" : ""}`}
                            value={l.quantity}
                            inputMode="decimal"
                            onChange={(e) => updateLine(l.part.id, { quantity: e.target.value })}
                          />
                        </td>
                        <td>
                          <div className="flex rounded-lg border border-slate-200 p-0.5">
                            {(["detail", "gros"] as const).map((t) => (
                              <button
                                key={t}
                                type="button"
                                onClick={() => updateLine(l.part.id, { priceType: t })}
                                className={`flex-1 rounded-md px-2 py-1 text-[11px] font-bold transition-colors ${
                                  l.priceType === t ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"
                                }`}
                              >
                                {t === "detail" ? "Détail" : "Gros"}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="num mono text-slate-600">{fmt(unitPrice)}</td>
                        <td className="num mono font-bold">{fmt(lineTotal(l))}</td>
                        <td>
                          <button className="btn btn-ghost btn-xs text-rose-500" onClick={() => removeLine(l.part.id)}>
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Récapitulatif */}
      <div className="flex flex-col gap-4">
        <div className="card p-4">
          <div className="grid gap-3">
            <div>
              <label className="label flex items-center gap-1"><User size={12} /> Client (optionnel)</label>
              <input className="input" placeholder="Nom du client ou atelier" value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </div>
            <div>
              <label className="label">Vendeur</label>
              <input className="input" value={userName} onChange={(e) => setUserName(e.target.value)} />
            </div>
            <div>
              <label className="label flex items-center gap-1"><StickyNote size={12} /> Notes</label>
              <textarea className="textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Total de la vente</span>
            <span className="mono text-2xl font-bold tracking-tight text-slate-900">{fmt(total)}</span>
          </div>
          {stockErrors.length > 0 && (
            <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-[11.5px] leading-snug text-amber-800">
              <CircleAlert size={13} className="mt-0.5 shrink-0" />
              Quantité supérieure au stock sur {stockErrors.length} ligne(s) : la vente sera refusée
              sauf si le stock négatif est autorisé dans les paramètres.
            </p>
          )}
          {error && (
            <p className="mt-2 flex items-start gap-2 rounded-lg bg-rose-50 p-2 text-[12px] font-medium text-rose-700">
              <CircleAlert size={13} className="mt-0.5 shrink-0" /> {error}
            </p>
          )}
          <button
            className="btn btn-primary btn-lg mt-3 w-full"
            onClick={submit}
            disabled={busy || lines.length === 0}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ShoppingCart size={16} />}
            Confirmer la vente
          </button>
          <p className="mt-2 text-center text-[10.5px] leading-snug text-slate-400">
            À la confirmation : stock déduit, quantité vendue augmentée,
            mouvements tracés, tableau de bord mis à jour.
          </p>
        </div>
      </div>
    </div>
  );
}
