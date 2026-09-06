"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileSpreadsheet,
  Upload,
  Loader2,
  ArrowRight,
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  TriangleAlert,
  Table2,
  Columns3,
  ListChecks,
} from "lucide-react";

type SheetInfo = {
  name: string;
  rowCount: number;
  headerRow: number;
  columns: string[];
  sample: string[][];
  autoMapping: Record<string, string>;
  ignoredColumns: string[];
};

type Preview = { token: string; filename: string; size: number; sheets: SheetInfo[] };

type Summary = { total: number; ok: number; erreurs: number; doublons: number; existants: number };
type ProblemRow = {
  rowNumber: number;
  reference: string;
  designation: string;
  status: string;
  issues: Array<{ level: string; message: string }>;
  existing: { id: number; reference: string; designation: string } | null;
};
type Validation = {
  summary: Summary;
  problemRows: ProblemRow[];
  sample: Array<Record<string, string | number>>;
};

const FIELDS: Array<{ key: string; label: string }> = [
  { key: "reference", label: "Référence *" },
  { key: "designation", label: "Désignation" },
  { key: "marque", label: "Marque" },
  { key: "quantite", label: "Quantité" },
  { key: "prixAchat", label: "Prix d'Achat" },
  { key: "prixGros", label: "Prix Gros" },
  { key: "prixDetail", label: "Prix Détail" },
  { key: "um", label: "UM" },
  { key: "rayon", label: "Rayon" },
  { key: "categorie", label: "Catégorie" },
];

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  erreur: { label: "Erreur", cls: "badge-rose" },
  doublon_fichier: { label: "Doublon fichier", cls: "badge-amber" },
  existant: { label: "Déjà en base", cls: "badge-blue" },
};

export function ImportWizard() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [validation, setValidation] = useState<Validation | null>(null);
  const [policy, setPolicy] = useState<"update" | "skip">("update");
  const [result, setResult] = useState<Record<string, number> | null>(null);

  const sheet: SheetInfo | null = preview ? preview.sheets[sheetIdx] ?? null : null;

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/import/preview", { method: "POST", body: form });
      const data = (await res.json()) as Preview & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Lecture du fichier impossible.");
        return;
      }
      setPreview(data);
      const best = data.sheets.findIndex((s) => Object.keys(s.autoMapping).length >= 2);
      const idx = best >= 0 ? best : 0;
      setSheetIdx(idx);
      setHeaderRow(data.sheets[idx]?.headerRow ?? 0);
      setMapping({ ...(data.sheets[idx]?.autoMapping ?? {}) });
      setStep(2);
    } catch {
      setError("Envoi du fichier impossible.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const runValidate = async () => {
    if (!preview || !sheet) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/import/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: preview.token,
          sheet: sheet.name,
          headerRow,
          mapping,
        }),
      });
      const data = (await res.json()) as Validation & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Validation impossible.");
        return;
      }
      setValidation(data);
      setStep(3);
    } catch {
      setError("Validation impossible.");
    } finally {
      setBusy(false);
    }
  };

  const runExecute = async () => {
    if (!preview || !sheet) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/import/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: preview.token,
          sheet: sheet.name,
          headerRow,
          mapping,
          policy,
        }),
      });
      const data = (await res.json()) as { result?: Record<string, number>; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Import impossible.");
        return;
      }
      setResult(data.result ?? null);
      setStep(4);
      router.refresh();
    } catch {
      setError("Import impossible.");
    } finally {
      setBusy(false);
    }
  };

  const mappedColumns = new Set(Object.values(mapping).filter(Boolean));
  const ignoredColumns = sheet ? sheet.columns.filter((c) => c && !mappedColumns.has(c)) : [];

  const stepCls = (n: number) =>
    `flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] font-bold ${
      step === n ? "bg-blue-600 text-white" : step > n ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"
    }`;

  return (
    <div className="card overflow-hidden">
      {/* Étapes */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
        <span className={stepCls(1)}><FileSpreadsheet size={13} /> 1. Fichier</span>
        <span className={stepCls(2)}><Columns3 size={13} /> 2. Colonnes</span>
        <span className={stepCls(3)}><ListChecks size={13} /> 3. Validation</span>
        <span className={stepCls(4)}><CircleCheck size={13} /> 4. Import</span>
        {preview && (
          <span className="mono ml-auto text-[11.5px] text-slate-400">
            {preview.filename} ({Math.round(preview.size / 1024)} Ko)
          </span>
        )}
      </div>

      {error && (
        <p className="mx-4 mt-4 flex items-center gap-2 rounded-lg bg-rose-50 p-2.5 text-[12.5px] font-medium text-rose-700">
          <CircleAlert size={14} /> {error}
        </p>
      )}

      {/* ÉTAPE 1 : fichier */}
      {step === 1 && (
        <div className="p-5">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) void upload(f);
            }}
            className="grid place-items-center rounded-xl border-2 border-dashed border-slate-300 px-6 py-12 text-center transition-colors hover:border-blue-400"
          >
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
              {busy ? <Loader2 size={24} className="animate-spin" /> : <FileSpreadsheet size={26} />}
            </span>
            <h3 className="mt-3 text-[15px] font-bold text-slate-800">
              {busy ? "Analyse du classeur…" : "Déposez votre fichier Excel d'inventaire"}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-[12.5px] leading-relaxed text-slate-500">
              Formats .xls / .xlsx — les colonnes attendues sont
              Référence, Désignation, Marque, Quantité, Prix d'Achat, Prix Gros,
              Prix Détail, UM, Rayon. Les références multiples
              (« 7703800107 / 8200651172 ») sont prises en charge.
            </p>
            <button className="btn btn-primary mt-4" disabled={busy} onClick={() => fileRef.current?.click()}>
              <Upload size={14} /> Choisir le fichier Excel
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xls,.xlsx,.xlsm,.xlsb"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />
          </div>
        </div>
      )}

      {/* ÉTAPE 2 : mapping */}
      {step === 2 && sheet && (
        <div className="p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="label">Feuille du classeur</label>
              <select
                className="select"
                value={sheetIdx}
                onChange={(e) => {
                  const i = Number(e.target.value);
                  setSheetIdx(i);
                  setHeaderRow(preview!.sheets[i].headerRow);
                  setMapping({ ...preview!.sheets[i].autoMapping });
                }}
              >
                {preview!.sheets.map((s, i) => (
                  <option key={s.name} value={i}>
                    {s.name} ({s.rowCount} lignes)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Ligne d'en-tête (dans le fichier)</label>
              <select className="select" value={headerRow} onChange={(e) => setHeaderRow(Number(e.target.value))}>
                {Array.from({ length: 8 }, (_, i) => (
                  <option key={i} value={i}>
                    Ligne {i + 1}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end justify-end">
              <span className="badge badge-blue">
                <Table2 size={11} /> {sheet.rowCount} lignes de données détectées
              </span>
            </div>
          </div>

          <h4 className="mt-5 text-[12px] font-bold uppercase tracking-wide text-slate-500">
            Association des colonnes
          </h4>
          <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-5">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <label className="label">{f.label}</label>
                <select
                  className={`select ${f.key === "reference" && !mapping[f.key] ? "border-rose-400" : ""}`}
                  value={mapping[f.key] ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                >
                  <option value="">— Ignorer —</option>
                  {sheet.columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {ignoredColumns.length > 0 && (
            <p className="mt-3 rounded-lg bg-slate-50 p-2.5 text-[12px] text-slate-500">
              <TriangleAlert size={13} className="mr-1 inline text-amber-500" />
              Colonnes détectées <strong>non importées</strong> (aucune association) :{" "}
              <span className="mono">{ignoredColumns.join(", ")}</span>. Associez-les
              ci-dessus si elles contiennent des données utiles.
            </p>
          )}

          {/* Aperçu du fichier */}
          <h4 className="mt-4 text-[12px] font-bold uppercase tracking-wide text-slate-500">
            Aperçu des premières lignes
          </h4>
          <div className="table-wrap mt-2 max-h-56 overflow-auto rounded-lg border border-slate-200">
            <table className="tbl">
              <tbody>
                {sheet.sample.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} className={`whitespace-nowrap ${i === 0 ? "font-bold text-slate-700" : ""}`}>
                        {cell || <span className="text-slate-300">∅</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex justify-between">
            <button className="btn btn-secondary" onClick={() => setStep(1)}>
              <ArrowLeft size={14} /> Changer de fichier
            </button>
            <button className="btn btn-primary" onClick={runValidate} disabled={busy || !mapping.reference}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
              Valider les données
            </button>
          </div>
        </div>
      )}

      {/* ÉTAPE 3 : validation */}
      {step === 3 && validation && (
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              { label: "Lignes lues", value: validation.summary.total, cls: "text-slate-900" },
              { label: "Nouvelles pièces", value: validation.summary.ok, cls: "text-emerald-700" },
              { label: "Déjà en base", value: validation.summary.existants, cls: "text-blue-700" },
              { label: "Doublons (fichier)", value: validation.summary.doublons, cls: "text-amber-700" },
              { label: "Lignes en erreur", value: validation.summary.erreurs, cls: "text-rose-700" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-center">
                <div className={`mono text-2xl font-bold ${s.cls}`}>{s.value}</div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{s.label}</div>
              </div>
            ))}
          </div>

          {validation.sample.length > 0 && (
            <>
              <h4 className="mt-4 text-[12px] font-bold uppercase tracking-wide text-slate-500">
                Aperçu des données mappées
              </h4>
              <div className="table-wrap mt-2 max-h-48 overflow-auto rounded-lg border border-slate-200">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Ligne</th><th>Référence</th><th>Désignation</th><th>Marque</th>
                      <th className="num">Qté</th><th className="num">Prix d'Achat</th>
                      <th className="num">Prix Gros</th><th className="num">Prix Détail</th><th>UM</th><th>Rayon</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validation.sample.map((r) => (
                      <tr key={r.rowNumber}>
                        <td className="mono text-slate-400">{r.rowNumber}</td>
                        <td className="mono font-semibold">{String(r.reference)}</td>
                        <td className="max-w-[220px] truncate">{String(r.designation)}</td>
                        <td>{String(r.marque)}</td>
                        <td className="num mono">{String(r.quantite)}</td>
                        <td className="num mono">{String(r.prixAchat)}</td>
                        <td className="num mono">{String(r.prixGros)}</td>
                        <td className="num mono">{String(r.prixDetail)}</td>
                        <td>{String(r.um)}</td>
                        <td>{String(r.rayon)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {validation.problemRows.length > 0 && (
            <>
              <h4 className="mt-4 text-[12px] font-bold uppercase tracking-wide text-slate-500">
                Lignes nécessitant votre attention ({validation.problemRows.length})
              </h4>
              <div className="table-wrap mt-2 max-h-64 overflow-auto rounded-lg border border-slate-200">
                <table className="tbl">
                  <thead>
                    <tr><th>Ligne</th><th>Référence</th><th>Désignation</th><th>Statut</th><th>Détail</th></tr>
                  </thead>
                  <tbody>
                    {validation.problemRows.map((r) => {
                      const cfg = STATUS_LABELS[r.status] ?? { label: r.status, cls: "badge-slate" };
                      return (
                        <tr key={r.rowNumber}>
                          <td className="mono text-slate-400">{r.rowNumber}</td>
                          <td className="mono font-semibold">{r.reference || <span className="text-rose-500">∅</span>}</td>
                          <td className="max-w-[220px] truncate">{r.designation || <span className="text-rose-500">∅</span>}</td>
                          <td><span className={`badge ${cfg.cls}`}>{cfg.label}</span></td>
                          <td className="max-w-[360px] text-[12px] text-slate-500">
                            {r.issues.map((i, k) => (
                              <div key={k} className={i.level === "error" ? "text-rose-600" : ""}>{i.message}</div>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {validation.summary.existants > 0 && (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
              <h4 className="text-[13px] font-bold text-blue-900">
                {validation.summary.existants} référence(s) existent déjà dans la base — que faire ?
              </h4>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <label className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 ${policy === "update" ? "border-blue-500 bg-white" : "border-slate-200 bg-white/50"}`}>
                  <input type="radio" name="policy" checked={policy === "update"} onChange={() => setPolicy("update")} className="mt-0.5" />
                  <span>
                    <span className="block text-[13px] font-bold text-slate-800">Mettre à jour (recommandé)</span>
                    <span className="block text-[11.5px] leading-snug text-slate-500">
                      Prix, désignation, marque, rayon mis à jour. Les nouvelles références alternatives sont ajoutées.
                      Tout écart de quantité est tracé par un ajustement. Aucune donnée détruite.
                    </span>
                  </span>
                </label>
                <label className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 ${policy === "skip" ? "border-blue-500 bg-white" : "border-slate-200 bg-white/50"}`}>
                  <input type="radio" name="policy" checked={policy === "skip"} onChange={() => setPolicy("skip")} className="mt-0.5" />
                  <span>
                    <span className="block text-[13px] font-bold text-slate-800">Ignorer les existants</span>
                    <span className="block text-[11.5px] leading-snug text-slate-500">
                      Les pièces déjà en base ne sont pas touchées. Seules les nouvelles références sont créées. Jamais de doublon.
                    </span>
                  </span>
                </label>
              </div>
            </div>
          )}

          <div className="mt-4 flex justify-between">
            <button className="btn btn-secondary" onClick={() => setStep(2)}>
              <ArrowLeft size={14} /> Modifier le mapping
            </button>
            <button
              className="btn btn-primary"
              onClick={runExecute}
              disabled={busy || validation.summary.ok + validation.summary.existants === 0}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <CircleCheck size={14} />}
              Lancer l'import ({validation.summary.ok + (policy === "update" ? validation.summary.existants : 0)} ligne(s))
            </button>
          </div>
        </div>
      )}

      {/* ÉTAPE 4 : résultat */}
      {step === 4 && result && (
        <div className="p-8 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
            <CircleCheck size={30} strokeWidth={1.8} />
          </span>
          <h3 className="mt-3 text-lg font-bold text-slate-900">Import terminé</h3>
          <div className="mx-auto mt-4 grid max-w-2xl grid-cols-2 gap-2 text-left sm:grid-cols-5">
            {[
              ["Créées", result.created ?? 0, "text-emerald-700"],
              ["Mises à jour", result.updated ?? 0, "text-blue-700"],
              ["Ignorées", result.skipped ?? 0, "text-slate-600"],
              ["Doublons écartés", result.duplicates ?? 0, "text-amber-700"],
              ["Lignes en erreur", result.invalid ?? 0, "text-rose-700"],
            ].map(([label, v, cls]) => (
              <div key={String(label)} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-center">
                <div className={`mono text-2xl font-bold ${cls}`}>{String(v)}</div>
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link href="/pieces" className="btn btn-primary">Voir les pièces</Link>
            <Link href="/" className="btn btn-secondary">Tableau de bord</Link>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setStep(1);
                setPreview(null);
                setValidation(null);
                setResult(null);
              }}
            >
              Importer un autre fichier
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
