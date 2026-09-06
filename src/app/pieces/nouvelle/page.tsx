import { PageHeader } from "@/components/ui";
import { PartForm } from "@/components/part-form";

export const dynamic = "force-dynamic";

export default function NouvellePiecePage() {
  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title="Nouvelle pièce"
        description="Ajout manuel d'une pièce détachée. Pour un inventaire complet, utilisez Import Excel."
      />
      <PartForm mode="create" />
    </div>
  );
}
