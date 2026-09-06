import { SearchExperience } from "@/components/search-experience";

export const dynamic = "force-dynamic";

export default async function RecherchePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return (
    <div className="mx-auto max-w-[1100px]">
      <SearchExperience initialQuery={q ?? ""} />
    </div>
  );
}
