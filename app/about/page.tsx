import { createClient } from '@supabase/supabase-js';
import { unstable_cache } from "next/cache";
import AboutMundaManager from "@/components/munda-manager-info/about-munda-manager";
import { CACHE_TAGS } from "@/utils/cache-tags";

export default async function AboutPage() {
  // Fetch Patreon supporters with cache tag
  const getCachedPatreonSupporters = unstable_cache(
    async () => {
      // Use anon key for static generation (RLS controls access)
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      
      const { data: patreonSupporters } = await supabase
        .from('profiles')
        .select('username, patreon_tier_id, patreon_tier_title')
        .not('patreon_tier_id', 'is', null)
        .eq('patron_status', 'active_patron')
        .order('patreon_tier_id', { ascending: false })
        .order('username', { ascending: true });
      
      return patreonSupporters;
    },
    ['global-patreon-supporters'],
    {
      tags: [CACHE_TAGS.GLOBAL_PATREON_SUPPORTERS()]
    }
  );

  const cachedSupporters = await getCachedPatreonSupporters();

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container ml-[10px] mr-[10px] max-w-4xl w-full space-y-4">
        <div className="bg-card shadow-md rounded-lg p-4">
          <h1 className="text-xl md:text-2xl font-bold mb-4">About Munda Manager</h1>
          <AboutMundaManager patreonSupporters={cachedSupporters || []} />
        </div>
      </div>
    </main>
  );
}
