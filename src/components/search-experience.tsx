"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search,
  Camera,
  Upload,
  Loader2,
  ScanSearch,
  CircleAlert,
  FileImage,
} from "lucide-react";
import { STATUS_BADGE, stockStatusLabel } from "@/lib/status-ui";

type Hit = {
  id: number;
  reference: string;
  referenceRaw: string | null;
  designation: string;
  brand: string | null;
  category: string | null;
  location: string | null;
  unit: string;
  currentStock: number;
  minStock: number;
  status: "disponible" | "faible" | "rupture";
  wholesalePrice: number;
  retailPrice: number;
  image: string | null;
  altCount: number;
};

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(n);
}
function fmtPrice(n: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function ResultRow({ hit, active }: { hit: Hit; active?: boolean }) {
  return (
    <Link
      href={`/pieces/${hit.id}`}
      data-active={active ? "true" : undefined}
      className={`flex items-center gap-3 border-b border-slate-100 px-3 py-2 transition-colors hover:bg-blue-50/50 ${
        active ? "bg-blue-50" : ""
      }`}
    >
      <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        {hit.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hit.image} alt="" className="h-full w-full object-cover" />
        ) : (
          <Camera size={16} className="text-slate-300" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="mono text-[13px] font-bold text-slate-900">{hit.reference}</span>
          {hit.altCount > 1 && (
            <span className="badge badge-slate" title={hit.referenceRaw ?? undefined}>
              +{hit.altCount - 1} réf.
            </span>
          )}
        </div>
        <div className="truncate text-[12.5px] text-slate-600">{hit.designation}</div>
        <div className="truncate text-[11px] text-slate-400">
          {hit.brand ?? "Sans marque"}
          {hit.location ? ` · Rayon ${hit.location}` : ""}
          {hit.category ? ` · ${hit.category}` : ""}
        </div>
      </div>
      <div className="hidden text-right sm:block">
        <div className="text-[10.5px] uppercase tracking-wide text-slate-400">Stock</div>
        <div className="mono text-[13.5px] font-bold text-slate-800">
          {fmt(hit.currentStock)} <span className="text-[11px] font-normal text-slate-400">{hit.unit}</span>
        </div>
      </div>
      <div className="hidden text-right md:block">
        <div className="text-[10.5px] uppercase tracking-wide text-slate-400">Prix Gros</div>
        <div className="mono text-[13px] font-semibold text-slate-700">{fmtPrice(hit.wholesalePrice)} DA</div>
      </div>
      <div className="hidden text-right md:block">
        <div className="text-[10.5px] uppercase tracking-wide text-slate-400">Prix Détail</div>
        <div className="mono text-[13px] font-bold text-slate-900">{fmtPrice(hit.retailPrice)} DA</div>
      </div>
      <span className={`badge shrink-0 ${STATUS_BADGE[hit.status]}`}>
        <span className="dot" />
        {stockStatusLabel(hit.status)}
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Recherche texte instantanée
// ---------------------------------------------------------------------------
function TextSearch({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (term: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (term.trim().length === 0) {
      setHits([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}&limit=30`, {
        signal: controller.signal,
      });
      const data = (await res.json()) as { results: Hit[] };
      setHits(data.results);
      setActive(0);
      setSearched(true);
    } catch {
      /* requête annulée */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => run(q), 160);
    return () => clearTimeout(t);
  }, [q, run]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(hits.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && hits.length > 0) {
      router.push(`/pieces/${hits[active].id}`);
    }
  };

  return (
    <div>
      <div className="card relative flex items-center p-1.5">
        <Search size={18} className="ml-3 shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Référence, référence alternative, désignation, marque, rayon… (ex. 8200, Bosch, plaquette, Clio, filtre)"
          className="h-11 w-full bg-transparent px-3 text-[15px] font-medium text-slate-900 placeholder:text-[13.5px] placeholder:text-slate-400 focus:outline-none"
          autoComplete="off"
          spellCheck={false}
        />
        {loading && (
          <Loader2 size={17} className="mr-3 shrink-0 animate-spin text-blue-600" />
        )}
      </div>

      <p className="mt-2 px-1 text-[11.5px] text-slate-500">
        <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-semibold">↑</kbd>{" "}
        <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-semibold">↓</kbd>{" "}
        pour naviguer, <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-semibold">Entrée</kbd> pour
        ouvrir la pièce — la recherche couvre aussi les références alternatives (ex. « 8200651172 » trouve « 7703800107 / 8200651172 »).
      </p>

      {searched && hits.length === 0 && !loading && (
        <div className="card mt-3 grid place-items-center px-6 py-12 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-400">
            <ScanSearch size={22} strokeWidth={1.6} />
          </span>
          <p className="mt-3 text-[14px] font-semibold text-slate-700">
            Aucune pièce trouvée pour « {q} »
          </p>
          <p className="mt-1 max-w-sm text-[12.5px] text-slate-500">
            Essayez une référence partielle (8200), une marque, un rayon, ou la
            recherche par image si la référence est illisible.
          </p>
        </div>
      )}

      {hits.length > 0 && (
        <div className="card mt-3 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <span>{hits.length} résultat{hits.length > 1 ? "s" : ""}</span>
            <span>Recherche instantanée</span>
          </div>
          {hits.map((h, i) => (
            <ResultRow key={h.id} hit={h} active={i === active} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recherche par image (OCR / Vision — aucun résultat fabriqué)
// ---------------------------------------------------------------------------
type ImageSearchResponse = {
  provider: string;
  ok: boolean;
  message: string | null;
  texts: string[];
  candidates: string[];
  matches: Array<{ candidate: string; parts: Hit[] }>;
};

function ImageSearch() {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<ImageSearchResponse | null>(null);
  const [manual, setManual] = useState("");
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const analyse = async (file: File) => {
    setBusy(true);
    setResult(null);
    setPreview(URL.createObjectURL(file));
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/image-search", { method: "POST", body: form });
      setResult((await res.json()) as ImageSearchResponse);
    } catch {
      setResult({
        provider: "aucun",
        ok: false,
        message: "L'analyse de l'image a échoué. Réessayez ou saisissez la référence manuellement.",
        texts: [],
        candidates: [],
        matches: [],
      });
    } finally {
      setBusy(false);
    }
  };

  const openFile = (files: FileList | null) => {
    const f = files?.[0];
    if (f) void analyse(f);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div>
        {/* Zone de dépôt */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            openFile(e.dataTransfer.files);
          }}
          className={`grid place-items-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragging ? "border-blue-500 bg-blue-50/60" : "border-slate-300 bg-white"
          }`}
        >
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600">
            {busy ? <Loader2 size={24} className="animate-spin" /> : <ScanSearch size={26} strokeWidth={1.7} />}
          </span>
          <h3 className="mt-3 text-[15px] font-bold text-slate-800">
            {busy ? "Analyse de l'image en cours…" : "Déposez une photo de la pièce ou de son étiquette"}
          </h3>
          <p className="mx-auto mt-1 max-w-md text-[12.5px] leading-relaxed text-slate-500">
            Le texte de l&apos;étiquette (référence, marque) est extrait puis recherché dans la base.
            Formats : JPEG, PNG, WebP — 10 Mo max.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload size={14} /> Choisir une image
            </button>
            <button className="btn btn-secondary" onClick={() => cameraRef.current?.click()} disabled={busy}>
              <Camera size={14} /> Appareil photo
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => openFile(e.target.files)}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => openFile(e.target.files)}
          />
        </div>

        {/* Saisie manuelle / confirmation */}
        <div className="card mt-4 p-4">
          <label className="label">Référence extraite ou lue sur l&apos;étiquette</label>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (manual.trim()) router.push(`/recherche?q=${encodeURIComponent(manual.trim())}`);
            }}
          >
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Ex. 8200651172, 7703800107…"
              className="input"
            />
            <button className="btn btn-primary" type="submit" disabled={!manual.trim()}>
              <Search size={14} /> Rechercher
            </button>
          </form>
          {result && result.candidates.length > 0 && (
            <div className="mt-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Références détectées sur l&apos;image — cliquez pour rechercher
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {result.candidates.map((c) => (
                  <button
                    key={c}
                    onClick={() => router.push(`/recherche?q=${encodeURIComponent(c)}`)}
                    className="mono rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[13px] font-bold text-blue-800 hover:bg-blue-100"
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Correspondances automatiques */}
        {result?.matches && result.matches.length > 0 && (
          <div className="card mt-4 overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Correspondances trouvées dans la base
            </div>
            {result.matches.map((m) =>
              m.parts.map((p) => <ResultRow key={`${m.candidate}-${p.id}`} hit={{ ...p, referenceRaw: null, category: null, location: null, unit: "U", minStock: 0, wholesalePrice: 0, altCount: 0, status: p.status as Hit["status"] }} />),
            )}
          </div>
        )}
      </div>

      {/* Aperçu & journal */}
      <div className="flex flex-col gap-4">
        {preview && (
          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Image analysée
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Image analysée" className="max-h-64 w-full object-contain bg-slate-50" />
          </div>
        )}
        {result && (
          <div className="card p-4">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-700">
              <FileImage size={14} className="text-slate-400" />
              Moteur : <span className="mono">{result.provider}</span>
            </div>
            {result.message && (
              <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-[12px] leading-relaxed text-amber-800">
                <CircleAlert size={14} className="mt-0.5 shrink-0" />
                {result.message}
              </p>
            )}
            {result.ok && result.candidates.length === 0 && (
              <p className="mt-2 text-[12px] text-slate-500">
                Aucune référence détectée sur cette image. Vérifiez la netteté de
                l&apos;étiquette ou saisissez la référence manuellement ci-contre.
              </p>
            )}
            {result.texts.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-[11.5px] font-medium text-blue-700">
                  Texte brut extrait ({result.texts.length} lignes)
                </summary>
                <pre className="mono mt-2 max-h-44 overflow-auto rounded-lg bg-slate-50 p-2.5 text-[10.5px] leading-relaxed text-slate-600">
                  {result.texts.join("\n")}
                </pre>
              </details>
            )}
          </div>
        )}
        <div className="card p-4 text-[12px] leading-relaxed text-slate-500">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            Comment ça marche
          </div>
          Image → extraction du texte (OCR / fournisseur Vision) → références
          candidates → recherche en base. Les résultats affichés proviennent
          toujours de votre base de données réelle.
        </div>
      </div>
    </div>
  );
}

export function SearchExperience({ initialQuery }: { initialQuery: string }) {
  const [tab, setTab] = useState<"texte" | "image">("texte");
  return (
    <div>
      <div className="no-print mb-4 flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:inline-flex">
        <button
          onClick={() => setTab("texte")}
          className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors ${
            tab === "texte" ? "bg-blue-600 text-white shadow" : "text-slate-500 hover:bg-slate-100"
          }`}
        >
          <Search size={15} /> Recherche texte
        </button>
        <button
          onClick={() => setTab("image")}
          className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors ${
            tab === "image" ? "bg-blue-600 text-white shadow" : "text-slate-500 hover:bg-slate-100"
          }`}
        >
          <ScanSearch size={15} /> Recherche par image
        </button>
      </div>
      {tab === "texte" ? <TextSearch initialQuery={initialQuery} /> : <ImageSearch />}
    </div>
  );
}
