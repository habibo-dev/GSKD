import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_SIZE = 60 * 1024 * 1024; // 60 Mo
const UPLOAD_PREFIX = "pdf-import/uploads/";

/**
 * Génère un jeton client pour un téléversement DIRECT vers Vercel Blob depuis
 * le navigateur. Contourne ainsi la limite de corps (~4,5 Mo) des fonctions
 * serverless : le gros du fichier ne traverse JAMAIS la requête HTTP du
 * serveur — seul un jeton court (JSON) circule jusqu'ici.
 *
 * N'est sollicité que lorsque BLOB_READ_WRITE_TOKEN est configuré (sinon le
 * client utilise le flux multipart historique, suffisant en local).
 */
export async function POST(req: NextRequest) {
  const forbidden = await requireAdmin(req);
  if (forbidden) return forbidden;

  const body = (await req.json()) as HandleUploadBody;

  try {
    const response = await handleUpload({
      body,
      request: req as unknown as Request,
      onBeforeGenerateToken: async (pathname) => {
        // Sécurité : on limite aux catalogues PDF, sous pdf-import/uploads/.
        if (!pathname || !pathname.startsWith(UPLOAD_PREFIX) || !/\.pdf$/i.test(pathname)) {
          throw new Error("Chemin de téléversement non autorisé.");
        }
        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: MAX_SIZE,
          allowOverwrite: false,
          addRandomSuffix: false,
          validUntil: Date.now() + 15 * 60 * 1000, // 15 min
        };
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Téléversement non autorisé.",
      },
      { status: 400 },
    );
  }
}
