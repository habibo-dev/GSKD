// ---------------------------------------------------------------------------
// Normalisation : accents, références, noms de fichiers
// ---------------------------------------------------------------------------

/** Minuscules + suppression des accents (pour comparaisons / alias de colonnes) */
export function stripAccents(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function norm(value: string): string {
  return stripAccents(value.trim().toLowerCase()).replace(/\s+/g, " ");
}

/**
 * Découpe une cellule de référence Excel en jetons individuels.
 * "7703800107 / 8200651172" -> ["7703800107", "8200651172"]
 * La valeur brute n'est jamais détruite : elle est conservée dans referenceRaw.
 */
export function splitReferences(cell: string): string[] {
  const parts = cell
    .split(/[\/;,|]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  // Déduplique en conservant l'ordre
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = norm(p);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

/** Nom de fichier sûr à partir d'une référence (ex: "6455-EK" -> "6455-ek") */
export function safeFilename(ref: string): string {
  const cleaned = stripAccents(ref)
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .toLowerCase();
  return cleaned || "image";
}

/** Mots d'une requête de recherche */
export function queryWords(q: string): string[] {
  return norm(q)
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .slice(0, 6);
}

/** Jetons de référence extraits d'un texte OCR (lettres/chiffres, tirets, points) */
export function extractReferenceCandidates(text: string): string[] {
  const raw = text.match(/[A-Z0-9][A-Z0-9.\-]{3,24}[A-Z0-9]/gi) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of raw) {
    const token = candidate.replace(/^[.\-]+|[.\-]+$/g, "");
    const digits = (token.match(/\d/g) ?? []).length;
    // Une référence de pièce plausible contient au moins 4 chiffres
    if (token.length >= 5 && digits >= 3) {
      const key = token.toUpperCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(token.toUpperCase());
      }
    }
    if (out.length >= 15) break;
  }
  return out;
}
