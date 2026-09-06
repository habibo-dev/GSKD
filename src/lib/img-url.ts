/** URL publique d'une image de pièce (pure, utilisable côté client). */
export function imageUrl(
  filename: string,
  version?: number | Date | string | null,
) {
  const v =
    version instanceof Date
      ? version.getTime()
      : version
        ? String(version)
        : undefined;
  return `/api/images/parts/${encodeURIComponent(filename)}${v ? `?v=${v}` : ""}`;
}
