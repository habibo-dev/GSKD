import { PageHeader } from "@/components/ui";
import { SettingsForm } from "@/components/settings-form";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function ParametresPage() {
  const settings = await getSettings();
  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title="Paramètres"
        description="Identité de l'entreprise, règles de stock et préférences du catalogue."
      />
      <SettingsForm initial={settings} />
    </div>
  );
}
