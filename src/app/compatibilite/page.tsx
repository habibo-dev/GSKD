import { listVehicles, listCompatibilities } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { CompatManager } from "@/components/compat-manager";

export const dynamic = "force-dynamic";

export default async function CompatibilitePage({
  searchParams,
}: {
  searchParams: Promise<{ part?: string }>;
}) {
  const { part } = await searchParams;
  const [vehiclesList, compats] = await Promise.all([listVehicles(), listCompatibilities()]);

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Compatibilité pièces / véhicules"
        description="Déclarez les correspondances Pièce ↔ Véhicule uniquement à partir de données fiables (références OEM, catalogues officiels)."
      />
      <CompatManager
        vehicles={vehiclesList}
        initial={compats}
        presetPartId={part ? Number(part) || undefined : undefined}
      />
    </div>
  );
}
