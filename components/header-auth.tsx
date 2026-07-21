import { createClient } from '@/utils/supabase/server';
import { getClaims } from '@/utils/auth';
import SettingsModal from '@/components/settings-modal';
import { ThemeToggleDropdown } from '@/components/theme-toggle';

export default async function HeaderAuth() {
  const supabase = await createClient();
  const claims = await getClaims(supabase);

  if (!claims) {
    return (
      <div className="mr-2">
        <ThemeToggleDropdown />
      </div>
    );
  }

  const { userId, email, profile } = claims;

  return (
    <div className="flex items-center gap-2 mr-2">
      <ThemeToggleDropdown />
      <SettingsModal
        user={{ id: userId, email: email ?? undefined } as any}
        isAdmin={profile?.user_role === 'admin'}
        username={profile?.username ?? undefined}
        patreonTierId={profile?.patreon_tier_id ?? undefined}
        patreonTierTitle={profile?.patreon_tier_title ?? undefined}
        patronStatus={profile?.patron_status ?? undefined}
      />
    </div>
  );
}
