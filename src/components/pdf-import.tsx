"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  Loader2,
  FileText,
  Search,
  RefreshCw,
  CircleAlert,
  TriangleAlert,
  CircleCheck,
  Check,
  X,
  FileImage,
  ZoomIn,
  ZoomOut,
  Maximize,
  Minimize,
  Download,
  Save,
} from "lucide-react";

type Candidate = {
  partId: number;
  reference: string;
  designation: string;
  hasImage: boolean;
};

type PdfRow = {
  id: string;
  pageNo: number;
  rowIndex: number;
  referenceRaw: string;
  n: string;
  designation: string;
  confidence: string;
  status: string;
  imageUrl: string | null;
  matches: Candidate[];
};

type PdfData = {
  ok: boolean;
  token: string;
  filename: string;
  size: number;
  numPages: number;
  ocrError: string | null;
  pages: Array<{ pageNo: number; url: string }>;
  rows: PdfRow[];
  counts: { pages: number; rows: number; withImage: number; matched: number };
};

type Hit = { id: number; reference: string; designation: string };

const PDF_MIME = "application/pdf";

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// ---------------------------------------------------------------------------
// Visionneuse plein écran (lightbox) d'une photo produit : zoom molette / +/-,
// plein écran et fermeture par Échap.
// ---------------------------------------------------------------------------
function ProductLightbox({
  row,
  onClose,
}: {
  row: PdfRow;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [isFull, setIsFull] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const MIN = 0.2;
  const MAX = 8;

  const zoomIn = () => setZoom((z) => Math.min(MAX, z * 1.3));
  const zoomOut = () => setZoom((z) => Math.max(MIN, z / 1.3));
  const resetZoom = () => setZoom(1);

  // Fermeture par Échap + verrou du défilement de la page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const toggleFullscreen = async () => {
    const el = wrapRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFull(false);
      } else {
        await el.requestFullscreen();
        setIsFull(true);
      }
    } catch {
      // plein écran refusé (permissions navigateur) : on ignore silencieusement.
    }
  };

  const onFullscreenChange = () => {
    setIsFull(!!document.fullscreenElement);
  };
  useEffect(() => {
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const pct = Math.round(zoom * 100);

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-slate-950/95 backdrop-blur-sm">
      {/* Barre du haut : infos + contrôles */}
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3 text-white">
        <div className="min-w-0 flex-1">
          {row.referenceRaw && (
            <div className="mono truncate text-[15px] font-bold text-white">
              {row.referenceRaw}
            </div>
          )}
          <div className="truncate text-[12.5px] text-slate-300">
            {row.designation || "Photo du catalogue"}
            {row.pageNo ? ` — page ${row.pageNo}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className="mono mr-1 text-[12px] text-slate-300">{pct}%</span>
          <button
            className="btn btn-ghost btn-xs text-slate-200 hover:bg-white/10"
            onClick={zoomOut}
            title="Zoom arrière"
          >
            <ZoomOut size={16} />
          </button>
          <button
            className="btn btn-ghost btn-xs text-slate-200 hover:bg-white/10"
            onClick={zoomIn}
            title="Zoom avant"
          >
            <ZoomIn size={16} />
          </button>
          <button
            className="btn btn-ghost btn-xs text-slate-200 hover:bg-white/10"
            onClick={resetZoom}
            title="Réinitialiser le zoom"
          >
            <span className="text-[13px] font-semibold">{pct}%</span>
          </button>
          <button
            className="btn btn-ghost btn-xs text-slate-200 hover:bg-white/10"
            onClick={toggleFullscreen}
            title={isFull ? "Quitter le plein écran" : "Plein écran"}
          >
            {isFull ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
          <button
            className="btn btn-ghost btn-xs ml-1 text-slate-300 hover:bg-white/15"
            onClick={onClose}
            title="Fermer (Échap)"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Zone image : zoom à la molette, clic-glisser non requis */}
      <div
        ref={wrapRef}
        className="relative flex-1 overflow-auto bg-[#0a0e16]"
        onWheel={(e) => {
          e.preventDefault();
          setZoom((z) =>
            Math.min(MAX, Math.max(MIN, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))),
          );
        }}
      >
        <div className="grid min-h-full min-w-full place-items-center p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={row.imageUrl ?? ""}
            alt={row.referenceRaw || row.designation || "Photo produit"}
            className="max-h-full max-w-full cursor-zoom-out select-none shadow-2xl"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "center center",
              transition: "transform 0.08s linear",
            }}
            draggable={false}
            onDoubleClick={resetZoom}
          />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
        <span className="pointer-events-auto rounded-full bg-slate-800/90 px-3 py-1 text-[11px] text-slate-300">
          Molette&nbsp;: zoom · double-clic&nbsp;: réinitialiser · Échap&nbsp;: fermer
        </span>
      </div>
    </div>
  );
}

export function PdfImport({ blobUpload = false }: { blobUpload?: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [filename, setFilename] = useState<string | null>(null);
  const [size, setSize] = useState(0);
  const [phase, setPhase] = useState<"idle" | "busy" | "result">("idle");
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [data, setData] = useState<PdfData | null>(null);

  // Revue manuelle
  const [assign, setAssign] = useState<Record<string, number>>({});
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [searchOpen, setSearchOpen] = useState<Record<string, boolean>>({});
  const [searchQ, setSearchQ] = useState<Record<string, string>>({});
  const [searchHit, setSearchHit] = useState<Record<string, Hit[]>>({});
  const [searchBusy, setSearchBusy] = useState<Record<string, boolean>>({});
  const [viewer, setViewer] = useState<PdfRow | null>(null);
  // Lignes dont l'image a été enregistrée comme photo canonique de la pièce.
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  const reset = () => {
    setFilename(null);
    setSize(0);
    setPhase("idle");
    setError(null);
    setSuccess(null);
    setData(null);
    setAssign({});
    setIncluded({});
    setSearchOpen({});
    setSearchQ({});
    setSearchHit({});
    setSaved({});
    if (inputRef.current) inputRef.current.value = "";
  };

  // Téléversement direct vers Vercel Blob depuis le navigateur (évite de faire
  // transiter un gros PDF par le corps d'une fonction serverless, limité à
  // ~4,5 Mo sur Vercel). Active UNIQUEMENT quand BLOB_READ_WRITE_TOKEN existe ;
  // sinon (dev / auto-hébergé) on garde le flux multipart historique.
  const uploadPdfBlob = async (file: File): Promise<{ pathname: string } | null> => {
    try {
      const { upload } = await import("@vercel/blob/client");
      const slug =
        (file.name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/\.pdf$/i, "") || "catalogue")
          .slice(0, 80) || "catalogue";
      const pathname = `pdf-import/uploads/${Date.now()}-${slug}-${Math.random()
        .toString(36)
        .slice(2, 8)}.pdf`;
      const blob = await upload(pathname, file, {
        access: "private",
        handleUploadUrl: "/api/pdf/upload",
        contentType: "application/pdf",
      });
      return { pathname: blob.pathname };
    } catch {
      // Jeton refusé / Blob indisponible : on retombe sur le flux multipart.
      return null;
    }
  };

  const runAnalyse = async (file: File) => {
    setFilename(file.name);
    setSize(file.size);
    setError(null);
    setSuccess(null);
    setPhase("busy");
    try {
      let res: Response;
      if (blobUpload) {
        const up = await uploadPdfBlob(file);
        if (up) {
          res = await fetch("/api/pdf/analyse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pathname: up.pathname, filename: file.name }),
          });
        } else {
          const form = new FormData();
          form.append("file", file);
          res = await fetch("/api/pdf/analyse", { method: "POST", body: form });
        }
      } else {
        const form = new FormData();
        form.append("file", file);
        res = await fetch("/api/pdf/analyse", { method: "POST", body: form });
      }
      const body = (await res.json()) as PdfData & { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? "Analyse impossible.");
      }
      // Initialise la revue : lignes avec photo ; rattachement auto UNIQUEMENT
      // si la correspondance est SANS ambiguïté (une seule pièce trouvée).
      // Les candidats manuels (0 ou plusieurs correspondances) restent non
      // sélectionnés tant que l'utilisateur ne les confirme pas.
      const inc: Record<string, boolean> = {};
      const asg: Record<string, number> = {};
      for (const r of body.rows) {
        if (r.imageUrl && r.matches.length === 1) {
          asg[r.id] = r.matches[0].partId;
          inc[r.id] = true;
        } else {
          inc[r.id] = false;
        }
      }
      setAssign(asg);
      setIncluded(inc);
      setSaved({});
      setData(body);
      setPhase("result");
    } catch (e) {
      setPhase("idle");
      setFilename(null);
      setSize(0);
      setError(e instanceof Error ? e.message : "Analyse impossible.");
    }
  };

  const handleFile = (f: File | undefined | null) => {
    if (!f) return;
    const isPdf =
      /\.pdf$/i.test(f.name) &&
      (f.type === "" || f.type === PDF_MIME || f.type === "application/octet-stream");
    if (!isPdf) {
      setFilename(f.name);
      setSize(f.size);
      setError("Le fichier doit être un PDF (.pdf).");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    void runAnalyse(f);
  };

  const doSearch = async (rowId: string) => {
    const q = (searchQ[rowId] ?? "").trim();
    if (q.length < 2) return;
    setSearchBusy((s) => ({ ...s, [rowId]: true }));
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=6`);
      const d = (await res.json()) as { results: Hit[] };
      setSearchHit((s) => ({ ...s, [rowId]: d.results ?? [] }));
    } catch {
      setSearchHit((s) => ({ ...s, [rowId]: [] }));
    } finally {
      setSearchBusy((s) => ({ ...s, [rowId]: false }));
    }
  };

  const pickPart = (rowId: string, partId: number) => {
    setAssign((a) => ({ ...a, [rowId]: partId }));
    setIncluded((i) => ({ ...i, [rowId]: true }));
    setSearchOpen((s) => ({ ...s, [rowId]: false }));
    setSearchHit((s) => ({ ...s, [rowId]: [] }));
  };

  const reviewRows = (data?.rows ?? []).filter((r) => r.imageUrl);

  // Catégories (source de vérité unique dérivée de l'analyse).
  // Une ligne est « éligible » si elle est rattachée de façon NON ambiguë à
  // exactement une pièce existante (matches.length === 1) → elle peut être
  // sauvegardée. Les lignes sans correspondance (unmatched) ou ambigües
  // (matches.length > 1) exigent une revue manuelle et restent non éligibles.
  const eligibleRows = reviewRows.filter((r) => r.matches.length === 1);
  const ambiguousRows = reviewRows.filter((r) => r.matches.length > 1);
  const unmatchedRows = reviewRows.filter((r) => r.matches.length === 0);

  const selected = reviewRows.filter((r) => included[r.id] && assign[r.id]);
  const savedRows = reviewRows.filter((r) => saved[r.id]);
  // Candidats à sauvegarder = sélectionnés, rattachés à UNE pièce, non encore enregistrés.
  const pendingSelected = selected.filter((r) => !saved[r.id]);
  const savedCount = savedRows.length;

  // Une ligne est « prête » à enregistrer : rattachée à UNE pièce (éligible ou
  // confirmée manuellement) et non encore enregistrée.
  const isReady = (r: PdfRow) =>
    !!r.imageUrl && Number.isInteger(assign[r.id]) && !!assign[r.id] && !saved[r.id];

  // « Sélectionner tout » sélectionne TOUTES les lignes éligibles (toutes les
  // pages, pas seulement les cartes visibles) et re-consomme l'assignation auto.
  // Les lignes non éligibles (unmatched/ambiguës) ne sont JAMAIS sélectionnées
  // automatiquement ; une ligne déjà enregistrée reste cochée mais est exclue
  // de la sauvegarde (pendingSelected filtre saved).
  const selectAll = () => {
    setIncluded((prevIncluded) => {
      const next: Record<string, boolean> = {};
      for (const r of reviewRows) {
        if (r.matches.length === 1) {
          // Tout éligible (toutes pages) est sélectionné.
          next[r.id] = true;
        } else {
          // Non éligible : jamais auto-sélectionné. On conserve seulement un
          // choix manuel déjà confirmé sur la ligne (rattachement explicite).
          next[r.id] = !!prevIncluded[r.id];
        }
      }
      return next;
    });
    setAssign((prevAssign) => {
      const next = { ...prevAssign };
      for (const r of eligibleRows) {
        next[r.id] = r.matches[0].partId;
      }
      return next;
    });
  };

  const deselectAll = () => {
    const next: Record<string, boolean> = {};
    for (const r of reviewRows) next[r.id] = false;
    setIncluded(next);
  };

  const saveImages = async () => {
    if (!data || applying) return;
    // Le chemin réel de la découpe (crops/page-XX/row-YY.png) est reconstruit à
    // partir du numéro de page et de l'index de la ligne (1-based par page).
    const source = pendingSelected
      .filter((r) => isReady(r))
      .map((r) => {
        const candidate = r.matches.find((m) => m.partId === assign[r.id]);
        return {
          partId: assign[r.id],
          imageRel: `crops/page-${String(r.pageNo).padStart(2, "0")}/row-${String(
            r.rowIndex,
          ).padStart(2, "0")}.png`,
          pageNo: r.pageNo,
          pdfReference: candidate?.reference ?? r.referenceRaw ?? r.n ?? undefined,
          confidence: r.confidence || undefined,
        };
      });
    if (source.length === 0) {
      setError(
        "Aucun candidat à enregistrer : sélectionnez des photos rattachées à une pièce.",
      );
      return;
    }

    setError(null);
    setSuccess(null);
    setApplying(true);
    try {
      const res = await fetch("/api/pdf/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: data.token, assignments: source }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        done?: number;
        errors?: Array<{ partId: number; message: string }>;
        applied?: Array<{ partId: number }>;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? "Échec de l'enregistrement.");
      const done = body.done ?? 0;
      const errCount = body.errors?.length ?? 0;
      // Marque les lignes effectivement enregistrées (évite le double enregistrement).
      if (done > 0) {
        const appliedPartIds = new Set((body.applied ?? []).map((x) => x.partId));
        const newlySaved: Record<string, boolean> = {};
        for (const r of pendingSelected) {
          if (appliedPartIds.has(assign[r.id])) newlySaved[r.id] = true;
        }
        setSaved((s) => ({ ...s, ...newlySaved }));
      }
      router.refresh();
      if (errCount > 0) {
        setError(`${done} photo(s) enregistrée(s), ${errCount} erreur(s).`);
      } else if (done > 0) {
        setSuccess(
          `${done} image${done > 1 ? "s" : ""} enregistrée${done > 1 ? "s" : ""} comme photo canonique.`,
        );
      } else {
        setError("Aucune photo n'a été enregistrée (vérifiez vos sélections).");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'enregistrement.");
    } finally {
      setApplying(false);
    }
  };

  const downloadedPartIds = savedRows
    .map((r) => assign[r.id])
    .filter((id): id is number => Number.isInteger(id) && !!id);
  const downloadHref =
    downloadedPartIds.length > 0
      ? `/api/pdf/download-images?partIds=${downloadedPartIds.join(",")}`
      : null;

  const busyLabel = filename ? "Analyse du PDF…" : "Préparation…";

  const busyDetail =
    "Rendu des pages et lecture optique (OCR) des lignes du catalogue. Le traitement peut prendre quelques instants selon la taille du fichier.";

  return (
    <>
    <div className="card overflow-hidden">
      {/* En-tête */}
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
        <FileText size={15} className="text-rose-600" />
        <h3 className="text-[13px] font-bold text-slate-800">
          Import du catalogue PDF
        </h3>
        <span className="ml-auto badge badge-rose">
          <span className="dot" /> Revue manuelle avant écriture
        </span>
      </div>

      <div className="p-4">
        {/* Étape 1 — sélection du fichier */}
        {phase === "idle" && (
          <div className="grid place-items-center rounded-xl border-2 border-dashed border-slate-300 bg-white px-6 py-10 text-center transition-colors hover:border-blue-400">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-600">
              <FileText size={26} />
            </span>
            <h4 className="mt-3 text-[15px] font-bold text-slate-800">
              Déposez le catalogue au format PDF
            </h4>
            <p className="mx-auto mt-1 max-w-md text-[12.5px] leading-relaxed text-slate-500">
              Chaque page est rendue puis lue par OCR pour retrouver les lignes
              (référence, désignation) et découper la zone «&nbsp;Photo&nbsp;».
              Aucune photo n&apos;est rattachée sans votre confirmation.
            </p>

            {/* Ouverture native du sélecteur de fichiers : <label> lié à un
                <input type="file"> réel (pas de input.click() programmatique). */}
            <label
              htmlFor="pdf-file-input"
              className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-rose-700"
            >
              <Upload size={15} />
              Importer un PDF
            </label>
            <input
              ref={inputRef}
              id="pdf-file-input"
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <p className="mt-2 text-[11px] text-slate-400">
              Formats acceptés&nbsp;: <span className="mono">.pdf</span> (application/pdf)
            </p>
          </div>
        )}

        {/* Étape 2 — traitement en cours */}
        {phase === "busy" && (
          <div className="grid place-items-center rounded-xl border border-slate-100 bg-white px-6 py-10 text-center">
            <Loader2 size={30} className="animate-spin text-rose-600" />
            <h4 className="mt-3 text-[15px] font-bold text-slate-800">{busyLabel}</h4>
            {filename && (
              <p className="mono mt-1 max-w-md truncate text-[12.5px] text-slate-500">
                {filename} · {fmtSize(size)}
              </p>
            )}
            <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-slate-400">
              {busyDetail}
            </p>
            {error && (
              <p className="mt-3 flex items-center gap-2 rounded-lg bg-rose-50 p-2.5 text-[12.5px] font-medium text-rose-700">
                <CircleAlert size={14} /> {error}
              </p>
            )}
          </div>
        )}

        {error && phase !== "busy" && (
          <p className="mb-3 mt-1 flex items-start gap-2 rounded-lg bg-rose-50 p-2.5 text-[12.5px] font-medium text-rose-700">
            <CircleAlert size={15} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}
        {success && phase !== "busy" && (
          <p className="mb-3 mt-1 flex items-start gap-2 rounded-lg bg-emerald-50 p-2.5 text-[12.5px] font-medium text-emerald-800">
            <CircleCheck size={15} className="mt-0.5 shrink-0" /> {success}
          </p>
        )}

        {/* Étape 3 — résultats + revue */}
        {phase === "result" && data && (
          <div>
            {/* Résumé fichier */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
              <span className="mono flex min-w-0 items-center gap-1.5 text-[12.5px] font-bold text-slate-800">
                <CircleCheck size={14} className="shrink-0 text-emerald-600" />
                <span className="truncate">{data.filename}</span>
              </span>
              <span className="text-[11px] text-slate-400">· {fmtSize(data.size)}</span>
              <span className="ml-auto flex flex-wrap gap-1.5">
                <span className="badge badge-slate">{data.counts.pages} page(s)</span>
                <span className="badge badge-blue">{data.counts.rows} ligne(s)</span>
                <span className="badge badge-violet">{data.counts.withImage} photo(s)</span>
                <span className="badge badge-emerald">
                  {data.counts.matched} correspondance(s)
                </span>
              </span>
              <button
                className="btn btn-ghost btn-xs ml-auto text-slate-500"
                onClick={reset}
              >
                <RefreshCw size={12} /> Réinitialiser
              </button>
            </div>

            {data.ocrError && (
              <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-[12.5px] text-amber-800">
                <TriangleAlert size={15} className="mt-0.5 shrink-0" />
                Lecture OCR partielle&nbsp;: {data.ocrError} Les pages rendues restent
                consultables ci-dessous.
              </p>
            )}

            {/* Revue des photos */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <h4 className="flex items-center gap-2 text-[13px] font-bold text-slate-800">
                <FileImage size={15} className="text-rose-500" />
                Photos à enregistrer — {reviewRows.length} détectée(s) ·{" "}
                {selected.length} sélectionnée(s)
              </h4>
              {savedCount > 0 && (
                <span className="badge badge-emerald">
                  <CircleCheck size={11} /> {savedCount} enregistrée(s)
                </span>
              )}
              <span className="ml-auto text-[11.5px] text-slate-400">
                Seules les photos rattachées à une pièce peuvent être enregistrées.
              </span>
            </div>

            {/* Décomposition transparente des lignes — montre pourquoi
                « Sélectionner tout » ne retient que les éligibles : seules les
                lignes rattachées de façon NON ambiguë à une pièce peuvent être
                sauvegardées ; le reste (sans correspondance ou ambigüe) reste
                en revue manuelle et n'est jamais sélectionné automatiquement. */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="rounded-md bg-blue-50 px-2 py-1 font-semibold text-blue-800">
                {eligibleRows.length} éligible(s)
              </span>
              <span className="text-slate-300">·</span>
              <span className="rounded-md bg-emerald-50 px-2 py-1 font-semibold text-emerald-800">
                {selected.length} sélectionnée(s)
              </span>
              {savedCount > 0 && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="rounded-md bg-emerald-100 px-2 py-1 font-semibold text-emerald-900">
                    {savedCount} enregistrée(s)
                  </span>
                </>
              )}
              <span className="text-slate-300">·</span>
              <span className="rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-600">
                {unmatchedRows.length} à revoir (sans correspondance)
              </span>
              {ambiguousRows.length > 0 && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="rounded-md bg-amber-50 px-2 py-1 font-semibold text-amber-800">
                    {ambiguousRows.length} ambigüe(s)
                  </span>
                </>
              )}
            </div>

            {reviewRows.length === 0 ? (
              <p className="mt-2 rounded-lg bg-slate-50 p-4 text-center text-[12.5px] text-slate-500">
                Aucune zone «&nbsp;Photo&nbsp;» exploitable n&apos;a été détectée dans ce
                PDF. Les pages rendues sont disponibles plus bas.
              </p>
            ) : (
              <>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {reviewRows.map((r) => {
                    const isIncluded = !!included[r.id];
                    const isSaved = !!saved[r.id];
                    const assignedCandidate = r.matches.find((m) => m.partId === assign[r.id]);
                    const opened = !!searchOpen[r.id];
                    const hits = searchHit[r.id] ?? [];
                    const searching = !!searchBusy[r.id];
                    return (
                      <div
                        key={r.id}
                        className={`rounded-xl border p-2.5 transition-colors ${
                          isSaved
                            ? "border-emerald-300 bg-emerald-50/40"
                            : isIncluded
                              ? "border-blue-300 bg-blue-50/30"
                              : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <label className="mt-6 flex cursor-pointer items-center">
                            <input
                              type="checkbox"
                              className="accent-blue-600"
                              disabled={applying}
                              checked={isIncluded}
                              onChange={(e) =>
                                setIncluded((s) => ({ ...s, [r.id]: e.target.checked }))
                              }
                            />
                          </label>
                          <button
                            type="button"
                            className="grid h-16 w-16 shrink-0 cursor-zoom-in overflow-hidden rounded-md border border-slate-200 bg-white transition-shadow hover:ring-2 hover:ring-blue-400"
                            onClick={() => setViewer(r)}
                            title="Agrandir la photo"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={r.imageUrl ?? ""}
                              alt={r.referenceRaw || r.designation || "Photo produit"}
                              className="h-full w-full object-cover"
                            />
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="mono text-[11px] font-semibold text-slate-500">
                              P{r.pageNo} · L{r.rowIndex}
                            </div>
                            <div className="mono truncate text-[12.5px] font-bold text-slate-800">
                              {r.referenceRaw || r.n || "—"}
                            </div>
                            <div className="truncate text-[11px] text-slate-500">
                              {r.designation || "…"}
                            </div>
                            {isSaved && (
                              <div className="mt-0.5 flex items-center gap-1 text-[10.5px] font-semibold text-emerald-700">
                                <CircleCheck size={11} /> Statut : Enregistrée
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Rattachement à une pièce */}
                        {isSaved ? (
                          <div className="mt-2 rounded-md border border-emerald-200 bg-white px-2 py-1.5 text-[11.5px]">
                            <span className="text-emerald-700">✓</span>{" "}
                            <span className="mono font-bold text-emerald-800">
                              {assignedCandidate?.reference ?? `#${assign[r.id]}`}
                            </span>
                            <span className="text-slate-500"> — photo canonique enregistrée.</span>
                          </div>
                        ) : isIncluded && assign[r.id] ? (
                          <div className="mt-2 rounded-md border border-blue-100 bg-white px-2 py-1.5 text-[11.5px]">
                            {assignedCandidate ? (
                              <>
                                <span className="text-slate-500">→</span>{" "}
                                <span className="mono font-bold text-blue-800">
                                  {assignedCandidate.reference}
                                </span>{" "}
                                <span className="text-slate-500">
                                  {assignedCandidate.designation}
                                </span>
                                {assignedCandidate.hasImage && (
                                  <span className="badge badge-amber ml-1">
                                    remplacera l&apos;image
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="mono font-bold text-blue-800">
                                #{assign[r.id]}
                              </span>
                            )}
                            <button
                              className="float-right text-slate-400 hover:text-rose-600"
                              onClick={() => {
                                setAssign((a) => {
                                  const n = { ...a };
                                  delete n[r.id];
                                  return n;
                                });
                                setIncluded((i) => ({ ...i, [r.id]: false }));
                              }}
                              aria-label="Retirer"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <div className="mt-2">
                            <button
                              className="text-[11.5px] font-medium text-blue-700 hover:underline"
                              onClick={() => setSearchOpen((s) => ({ ...s, [r.id]: !opened }))}
                            >
                              <Search size={12} className="mr-1 inline" />
                              {opened ? "Masquer la recherche" : "Rattacher à une pièce"}
                            </button>
                          </div>
                        )}

                        {opened && (
                          <div className="mt-1.5 rounded-lg bg-slate-50 p-2">
                            <div className="flex gap-1.5">
                              <input
                                className="input h-8"
                                placeholder="Référence ou désignation…"
                                value={searchQ[r.id] ?? ""}
                                onChange={(e) =>
                                  setSearchQ((s) => ({ ...s, [r.id]: e.target.value }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") void doSearch(r.id);
                                }}
                              />
                              <button
                                className="btn btn-secondary btn-sm shrink-0"
                                onClick={() => void doSearch(r.id)}
                                disabled={searching}
                              >
                                {searching ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <Search size={13} />
                                )}
                              </button>
                            </div>
                            {hits.length > 0 && (
                              <ul className="mt-1.5 flex flex-col gap-1">
                                {hits.map((h) => (
                                  <li key={h.id}>
                                    <button
                                      className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-left hover:border-blue-300"
                                      onClick={() => pickPart(r.id, h.id)}
                                    >
                                      <span className="min-w-0">
                                        <span className="mono block truncate text-[12px] font-bold text-slate-800">
                                          {h.reference}
                                        </span>
                                        <span className="block truncate text-[10.5px] text-slate-500">
                                          {h.designation}
                                        </span>
                                      </span>
                                      <Check size={14} className="shrink-0 text-blue-600" />
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {!searching && searchQ[r.id]?.trim() && hits.length === 0 && (
                              <p className="mt-1 text-[11px] text-slate-400">
                                Aucun résultat pour «&nbsp;{searchQ[r.id]}&nbsp;».
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      className="btn btn-ghost btn-sm text-slate-600"
                      onClick={selectAll}
                      disabled={applying}
                    >
                      <Check size={13} /> Sélectionner tout
                    </button>
                    <button
                      className="btn btn-ghost btn-sm text-slate-500"
                      onClick={deselectAll}
                      disabled={applying}
                    >
                      <X size={13} /> Désélectionner tout
                    </button>
                    {downloadHref && (
                      <a className="btn btn-secondary btn-sm" href={downloadHref}>
                        <Download size={13} /> Télécharger les images ({savedCount})
                      </a>
                    )}
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={saveImages}
                    disabled={pendingSelected.length === 0 || applying}
                  >
                    {applying ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Save size={14} />
                    )}
                    {applying
                      ? "Enregistrement en cours…"
                      : pendingSelected.length > 0
                        ? `Sauvegarder les images (${pendingSelected.length})`
                        : savedCount > 0
                          ? "Images enregistrées ✓"
                          : "Sauvegarder les images (0)"}
                  </button>
                </div>
              </>
            )}

            {/* Pages rendues */}
            <h4 className="mt-5 text-[13px] font-bold text-slate-800">
              Pages du PDF ({data.pages.length})
            </h4>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {data.pages.map((p) => (
                <a
                  key={p.pageNo}
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group overflow-hidden rounded-lg border border-slate-200 bg-white"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={`Page ${p.pageNo}`}
                    loading="lazy"
                    className="aspect-[3/4] w-full object-cover"
                  />
                  <div className="border-t border-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">
                    Page {p.pageNo}
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>

    {viewer && <ProductLightbox row={viewer} onClose={() => setViewer(null)} />}
    </>
  );
}
