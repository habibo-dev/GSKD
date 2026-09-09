import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite embarque son runtime WASM avec import.meta.url : on le laisse hors
  // du bundle Next afin d'éviter l'erreur « path must be string ... URL ».
  serverExternalPackages: [
    "@electric-sql/pglite",
    // L'analyse PDF (rendu + OCR local) s'exécute côté serveur en runtime
    // Node, exactement comme `scripts/extract-pdf-catalogue.ts`. On laisse ces
    // paquets hors du bundle webpack pour qu'ils se chargent normalement en
    // Node (workers tesseract, données OCR françaises, canvas natif, pdfjs).
    "pdfjs-dist",
    "tesseract.js",
    "@tesseract.js-data/fra",
    "@napi-rs/canvas",
  ],
  // En dev, la prévisualisation Arena est servie depuis un hôte d'origine
  // différent (https://<port>-<sandbox>.e2b.app). Sans cette liste, Next
  // bloque les requêtes internes cross-origin (HMR/_next) et la page ne
  // s'hydrate pas correctement. Sans effet en production.
  allowedDevOrigins: [
    "localhost",
    "*.localhost",
    "*.e2b.app",
  ],
};

export default nextConfig;
