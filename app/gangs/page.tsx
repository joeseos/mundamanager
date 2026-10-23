import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getAuthenticatedUser, signInPath } from "@/utils/auth";
import { BrowseGangs } from "@/components/browse-gangs";
import { getUserProfile } from "@/app/lib/shared/gang-data";
import { getPublicGangFilterOptions, searchPublicGangs } from "@/app/lib/search-public-gangs";
import { parsePublicGangFilters } from "@/utils/browse-gangs-filters";

export default async function BrowseGangsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();

  // The search reads over the direct connection, which doesn't check who is asking
  try {
    await getAuthenticatedUser(supabase);
  } catch {
    redirect(signInPath("/gangs"));
  }

  const filters = parsePublicGangFilters(await props.searchParams);
  const [{ gangTypes, subtypes }, { gangs, total }, profile] = await Promise.all([
    getPublicGangFilterOptions(filters.edition),
    searchPublicGangs(filters),
    filters.userId ? getUserProfile(filters.userId) : null,
  ]);

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container ml-[10px] mr-[10px] max-w-4xl w-full">
        <BrowseGangs
          // Remount on each search so the inputs show the filters in the URL
          key={JSON.stringify(filters)}
          filters={filters}
          username={profile?.username ?? null}
          gangTypes={gangTypes}
          subtypes={subtypes}
          gangs={gangs}
          total={total}
        />
      </div>
    </main>
  );
}
