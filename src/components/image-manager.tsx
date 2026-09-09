"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Upload,
  Trash2,
  Loader2,
  CircleCheck,
  History,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";

type Version = {
  id: number;
  versionNo: number;
  filename: string;
  originalName: string | null;
  mime: string | null;
  size: number | null;
  source: string;
  token: string | null;
  sourceRel: string | null;
  isCurrent: boolean;
  createdAt: string;
  url: string;
};

const SOURCE_LABEL: Record<string, string> = {
  upload: "Téléversée",
  pdf_extract: "Catalogue PDF",
  seed: "Démo",
  restore: "Restauration",
  import: "Import",
};

function fmtDate(s: string): string {
  try {
    return new Date(s).toLocaleString("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return s;
  }
}

export function ImageManager({
  partId,
  reference,
  currentImage,
  filename,
}: {
  partId: number;
  reference: string;
  currentImage: string | null;
  filename: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/parts/${partId}/image`);
      const data = (await res.json()) as { versions?: Version[] };
      setVersions(data.versions ?? []);
    } catch {
      setVersions([]);
    }
  }, [partId]);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`/api/parts/${partId}/image`, {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Échec de l'envoi.");
      } else {
        router.refresh();
        await loadHistory();
        setShowHistory(true);
      }
    } catch {
      setError("Échec de l'envoi de l'image.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async () => {
    if (
      !confirm(
        "Retirer la photo de cette pièce ? L'image restera récupérable via l'historique.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/parts/${partId}/image`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Impossible de retirer l'image.");
      } else {
        router.refresh();
        await loadHistory();
      }
    } finally {
      setBusy(false);
    }
  };

  const restore = async (version: Version) => {
    if (version.isCurrent) return;
    if (!confirm(`Rétablir la photo de la version ${version.versionNo} ?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/parts/${partId}/image`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: version.id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Restauration impossible.");
      } else {
        router.refresh();
        await loadHistory();
      }
    } finally {
      setBusy(false);
    }
  };

  const refreshHistory = async () => {
    setLoadingHistory(true);
    await loadHistory();
    setLoadingHistory(false);
  };

  const toggleHistory = async () => {
    const opening = !showHistory;
    if (opening && versions.length === 0) await loadHistory();
    setShowHistory(opening);
  };

  const versionCount = versions.length;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h3 className="text-[13px] font-bold text-slate-800">Photo du produit</h3>
        {currentImage && (
          <span className="badge badge-emerald">
            <CircleCheck size={11} />
            Associée
          </span>
        )}
      </div>
      <div className="p-4">
        <div className="grid aspect-square w-full place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {currentImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentImage}
              alt={`Photo de la pièce ${reference}`}
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="text-center">
              <Camera size={34} className="mx-auto text-slate-300" strokeWidth={1.4} />
              <p className="mt-2 px-4 text-[11.5px] leading-snug text-slate-400">
                Aucune image.
                <br />
                Le catalogue affichera un visuel par défaut.
              </p>
            </div>
          )}
        </div>

        {filename && (
          <p className="mono mt-2 truncate text-center text-[11px] text-slate-400" title={filename}>
            {filename}
          </p>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />

        <div className="mt-3 flex flex-col gap-2">
          <button
            className="btn btn-secondary w-full"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {currentImage ? "Changer la photo" : "Téléverser une image"}
          </button>
          {currentImage && (
            <button
              className="btn btn-ghost w-full text-rose-600 hover:bg-rose-50"
              disabled={busy}
              onClick={remove}
            >
              <Trash2 size={14} />
              Retirer la photo
            </button>
          )}
        </div>

        {error && <p className="mt-2 text-center text-[12px] font-medium text-rose-600">{error}</p>}

        {/* Historique / provenance (réversibilité) */}
        {(versionCount > 0 || showHistory) && (
          <div className="mt-3 border-t border-slate-100 pt-2.5">
            <button
              className="flex w-full items-center justify-between rounded-md px-1 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => void toggleHistory()}
            >
              <span className="flex items-center gap-1.5">
                <History size={13} className="text-slate-400" />
                Historique des photos
                <span className="mono text-slate-400">({versionCount})</span>
              </span>
              <span className="flex items-center gap-1.5">
                {loadingHistory ? (
                  <RefreshCw size={12} className="animate-spin text-slate-400" />
                ) : (
                  <button
                    className="text-slate-400 hover:text-slate-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      void refreshHistory();
                    }}
                    title="Actualiser"
                  >
                    <RefreshCw size={12} />
                  </button>
                )}
                {showHistory ? (
                  <ChevronUp size={14} className="text-slate-400" />
                ) : (
                  <ChevronDown size={14} className="text-slate-400" />
                )}
              </span>
            </button>

            {showHistory && (
              <>
                {versions.length === 0 ? (
                  <p className="px-1 py-1.5 text-[11px] text-slate-400">
                    Aucune version archivée.
                  </p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-1.5">
                    {versions.map((v) => (
                      <li
                        key={v.id}
                        className={`flex items-center gap-2.5 rounded-lg border p-1.5 ${
                          v.isCurrent
                            ? "border-emerald-200 bg-emerald-50/50"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <span className="grid h-11 w-11 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-white">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={v.url}
                            alt={`Version ${v.versionNo}`}
                            loading="lazy"
                            className="h-full w-full object-contain"
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
                            <span className="mono font-bold text-slate-700">v{v.versionNo}</span>
                            {v.isCurrent ? (
                              <span className="badge badge-emerald">Actuelle</span>
                            ) : (
                              <span className="badge badge-slate">Ancienne</span>
                            )}
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                              {SOURCE_LABEL[v.source] ?? v.source}
                            </span>
                          </span>
                          <span className="block truncate text-[10.5px] text-slate-400">
                            {fmtDate(v.createdAt)}
                            {v.source === "pdf_extract" && v.sourceRel
                              ? ` · ${v.sourceRel}`
                              : v.originalName
                                ? ` · ${v.originalName}`
                                : ""}
                          </span>
                        </span>
                        {!v.isCurrent && (
                          <button
                            className="btn btn-ghost btn-xs shrink-0 text-blue-700 hover:bg-blue-50"
                            disabled={busy}
                            onClick={() => void restore(v)}
                            title={`Rétablir la version ${v.versionNo} comme photo de la pièce`}
                          >
                            {busy ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <RotateCcw size={12} />
                            )}
                            Rétablir
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-1.5 px-1 text-[10.5px] leading-snug text-slate-400">
                  Les anciennes photos sont conservées et tracées (provenance,
                  date). Vous pouvez rétablir n&apos;importe laquelle à tout moment.
                </p>
              </>
            )}
          </div>
        )}

        <p className="mt-2.5 text-center text-[10.5px] leading-snug text-slate-400">
          Une image canonique par pièce, réutilisée dans la recherche, le
          catalogue, les ventes, le stock et les exports. Toute photo remplacée
          reste récupérable via l&apos;historique. JPEG / PNG / WebP — 8 Mo max.
        </p>
      </div>
    </div>
  );
}
