import "dotenv/config";
import { ensureSchema } from "@/db/bootstrap";

async function main() {
  console.log("Création / mise à jour du schéma…");
  await ensureSchema();
  console.log("Schéma prêt.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
