import { Car } from "lucide-react";
import { listVehicles } from "@/lib/queries";
import { PageHeader, EmptyState } from "@/components/ui";
import { VehicleForm } from "@/components/vehicle-form";
import { DeleteVehicleButton } from "@/components/delete-vehicle-button";

export const dynamic = "force-dynamic";

export default async function VehiculesPage() {
  const vehiclesList = await listVehicles();

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="Véhicules"
        description="Référentiel des véhicules pour la compatibilité des pièces — aucune correspondance n'est supposée sans données fiables."
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="card">
          {vehiclesList.length === 0 ? (
            <EmptyState
              icon={Car}
              title="Aucun véhicule enregistré"
              description="Ajoutez les véhicules courants de votre clientèle (marque, modèle, années, motorisation, carburant) pour préparer la compatibilité des pièces."
            />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Marque</th>
                    <th>Modèle</th>
                    <th>Années</th>
                    <th>Motorisation</th>
                    <th>Carburant</th>
                    <th className="num">Pièces compatibles</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {vehiclesList.map((v) => (
                    <tr key={v.id}>
                      <td className="font-bold text-slate-800">{v.brand}</td>
                      <td>{v.model}</td>
                      <td className="mono text-slate-600">
                        {v.yearFrom ?? "?"} – {v.yearTo ?? "?"}
                      </td>
                      <td className="text-slate-600">{v.engine ?? "—"}</td>
                      <td className="text-slate-600">{v.fuel ?? "—"}</td>
                      <td className="num">
                        <span className={`badge ${v.compatCount > 0 ? "badge-blue" : "badge-slate"}`}>
                          {v.compatCount}
                        </span>
                      </td>
                      <td>
                        <DeleteVehicleButton id={v.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <VehicleForm />
      </div>
    </div>
  );
}
