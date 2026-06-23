'use client';

import { useClaims } from '@/hooks/use-claims';
import SettingsModal from '@/components/settings-modal';
import { ThemeToggleDropdown } from '@/components/theme-toggle';

export default function HeaderAuth() {
  const { userId, email, profile, loading } = useClaims();

  if (loading) {
    return (
      <div className="flex items-center gap-2 mr-2">
        <ThemeToggleDropdown />
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="mr-2">
        <ThemeToggleDropdown />
      </div>
    );
  }

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
