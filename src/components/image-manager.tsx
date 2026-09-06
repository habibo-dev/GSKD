"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Upload, Trash2, Loader2, CircleCheck } from "lucide-react";

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
      }
    } catch {
      setError("Échec de l'envoi de l'image.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async () => {
    if (!confirm("Supprimer l'image associée à cette pièce ?")) return;
    setBusy(true);
    setError(null);
    try {
      await fetch(`/api/parts/${partId}/image`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

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
            {currentImage ? "Remplacer l'image" : "Téléverser une image"}
          </button>
          {currentImage && (
            <button className="btn btn-ghost w-full text-rose-600 hover:bg-rose-50" disabled={busy} onClick={remove}>
              <Trash2 size={14} />
              Supprimer l&apos;image
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-center text-[12px] font-medium text-rose-600">{error}</p>}
        <p className="mt-2.5 text-center text-[10.5px] leading-snug text-slate-400">
          Une seule image canonique par pièce, réutilisée dans la recherche, le
          catalogue, les ventes et les rapports. JPEG / PNG / WebP — 8 Mo max.
        </p>
      </div>
    </div>
  );
}
