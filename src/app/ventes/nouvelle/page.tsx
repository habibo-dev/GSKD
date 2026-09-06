import { SaleForm } from "@/components/sale-form";
import { PageHeader } from "@/components/ui";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function NouvelleVentePage({
  searchParams,
}: {
  searchParams: Promise<{ part?: string }>;
}) {
  const { part } = await searchParams;
  const cfg = await getSettings();
  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="Nouvelle vente"
        description="Recherchez la pièce, choisissez la quantité et le type de prix (Gros / Détail), puis confirmez."
      />
      <SaleForm
        presetPartId={part ? Number(part) || undefined : undefined}
        defaultUser={cfg.defaultUser}
        currency={cfg.currencySuffix}
      />
    </div>
  );
}
