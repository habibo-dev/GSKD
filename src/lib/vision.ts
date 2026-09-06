// ---------------------------------------------------------------------------
// Recherche par image — architecture fournisseur (Vision/OCR)
//
//   Image -> Provider Vision/OCR -> Texte/Références -> Recherche en base
//
// Deux fournisseurs :
//  1. ExternalHttpProvider : activé si VISION_API_URL + VISION_API_KEY sont
//     configurés (tout service Vision compatible JSON { texts: [...] } ou { text }).
//  2. OcrProvider : OCR local via tesseract.js (si disponible dans l'environnement).
// Si aucun fournisseur ne fonctionne, l'interface propose la saisie manuelle :
// AUCUNE reconnaissance n'est simulée.
// ---------------------------------------------------------------------------

import { extractReferenceCandidates } from "@/lib/normalize";

export type VisionResult = {
  provider: string;
  ok: boolean;
  message?: string;
  texts: string[];
  candidates: string[];
};

export interface VisionProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  extract(buffer: Buffer, mime: string): Promise<string[]>;
}

class ExternalHttpProvider implements VisionProvider {
  name = "api-vision-externe";
  private url = process.env.VISION_API_URL;
  private key = process.env.VISION_API_KEY;
  async isAvailable() {
    return Boolean(this.url && this.key);
  }
  async extract(buffer: Buffer, mime: string): Promise<string[]> {
    const res = await fetch(this.url!, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image: buffer.toString("base64"),
        mime,
      }),
    });
    if (!res.ok) throw new Error(`Service Vision indisponible (${res.status})`);
    const data = (await res.json()) as { texts?: string[]; text?: string };
    if (Array.isArray(data.texts)) return data.texts;
    if (typeof data.text === "string") return [data.text];
    return [];
  }
}

class OcrProvider implements VisionProvider {
  name = "ocr-local";
  async isAvailable() {
    try {
      await import("tesseract.js");
      return true;
    } catch {
      return false;
    }
  }
  async extract(buffer: Buffer): Promise<string[]> {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    try {
      const { data } = await worker.recognize(buffer);
      const lines = (data.text ?? "")
        .split(/\n+/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      return lines.slice(0, 40);
    } finally {
      await worker.terminate();
    }
  }
}

const PROVIDERS: VisionProvider[] = [
  new ExternalHttpProvider(),
  new OcrProvider(),
];

export async function extractFromImage(
  buffer: Buffer,
  mime: string,
): Promise<VisionResult> {
  for (const provider of PROVIDERS) {
    try {
      if (!(await provider.isAvailable())) continue;
      const texts = await provider.extract(buffer, mime);
      const candidates = extractReferenceCandidates(texts.join("\n"));
      return { provider: provider.name, ok: true, texts, candidates };
    } catch (err) {
      return {
        provider: provider.name,
        ok: false,
        message:
          err instanceof Error
            ? `Le moteur ${provider.name} a échoué : ${err.message}`
            : "Le moteur de reconnaissance a échoué.",
        texts: [],
        candidates: [],
      };
    }
  }
  return {
    provider: "aucun",
    ok: false,
    message:
      "Aucun moteur de reconnaissance n'est configuré (VISION_API_URL absent et OCR local indisponible). Saisissez la référence manuellement ou photographiez l'étiquette puis tapez la référence lue.",
    texts: [],
    candidates: [],
  };
}
