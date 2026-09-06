import { notFound } from "next/navigation";
import { db } from "@/db";
import { parts, brands, categories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui";
import { PartForm } from "@/components/part-form";

export const dynamic = "force-dynamic";

export default async function ModifierPiecePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const [row] = await db
    .select({
      referenceRaw: parts.referenceRaw,
      reference: parts.reference,
      designation: parts.designation,
      brand: brands.name,
      category: categories.name,
      purchasePrice: parts.purchasePrice,
      wholesalePrice: parts.wholesalePrice,
      retailPrice: parts.retailPrice,
      minStock: parts.minStock,
      unit: parts.unit,
      location: parts.location,
      description: parts.description,
      notes: parts.notes,
    })
    .from(parts)
    .leftJoin(brands, eq(parts.brandId, brands.id))
    .leftJoin(categories, eq(parts.categoryId, categories.id))
    .where(eq(parts.id, id));
  if (!row) notFound();

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title={`Modifier — ${row.reference}`}
        description="Informations commerciales de la pièce. Le stock se modifie par mouvements uniquement."
      />
      <PartForm
        mode="edit"
        partId={id}
        initial={{
          reference: row.referenceRaw ?? row.reference,
          designation: row.designation,
          brand: row.brand ?? "",
          category: row.category ?? "",
          purchasePrice: row.purchasePrice,
          wholesalePrice: row.wholesalePrice,
          retailPrice: row.retailPrice,
          minStock: row.minStock,
          unit: row.unit,
          location: row.location ?? "",
          description: row.description ?? "",
          notes: row.notes ?? "",
        }}
      />
    </div>
  );
}
