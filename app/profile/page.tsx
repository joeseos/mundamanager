import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import PasswordChange from "@/components/password-change";
import EmailChange from "@/components/profile/email-change";
import { NotificationsSection } from "../../components/settings-modal";
import FriendsSearchBar from "@/components/profile/friends";
import { getFriendsAndRequests } from "@/app/lib/friends";
import { PatreonSupporterBadge } from "@/components/ui/patreon-supporter-badge";
import { ImInfo } from "react-icons/im";
// Using full auth user on profile to display email and timestamps

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }

  // Fetch profile data
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('username, patreon_tier_id, patreon_tier_title, patron_status')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('Error fetching profile:', error);
  }

  // Fetch all friends and requests
  const friends = await getFriendsAndRequests(user.id);

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container ml-[10px] mr-[10px] max-w-4xl w-full space-y-4 mt-2">
        <div className="bg-card shadow-md rounded-lg p-4 md:p-4">
          <h2 className="text-xl md:text-2xl font-bold mb-4">Profile</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Email
              </label>
              <EmailChange currentEmail={user.email || ''} />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Username
              </label>
              <div className="text-foreground bg-muted rounded-md px-3 py-2">
                {profile?.username || 'Not set'}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Password
              </label>
              <PasswordChange />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                Patreon Status
                <div className="relative group">
                  <ImInfo className="text-muted-foreground cursor-help" />
                  <div className="absolute bottom-full mb-2 hidden group-hover:block bg-black text-white text-xs p-2 rounded w-72 -left-36 z-50">
                    Email on Patreon and Munda Manager need to match for the membership to be displayed
                    <br /><br />
                    Please raise a ticket on Discord if you think there is an error.
                  </div>
                </div>
              </label>
              <div className="text-foreground bg-muted rounded-md px-3 py-2">
                {profile?.patreon_tier_id && profile?.patron_status === 'active_patron' ? (
                  <PatreonSupporterBadge
                    username={profile.patreon_tier_title || 'Patreon Supporter'}
                    patreonTierId={profile.patreon_tier_id}
                    patreonTierTitle={profile.patreon_tier_title}
                  />
                ) : (
                  '-'
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-row item-center justify-between text-xs text-muted-foreground">
            <span>Account Created: {user.created_at ? new Date(user.created_at).toISOString().split('T')[0] : '—'}</span>
            <span>Last Sign In: {user.last_sign_in_at ? new Date(user.last_sign_in_at).toISOString().split('T')[0] : '—'}</span>
          </div>
          
          {/* Friends Section */}
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-3">Friends</h3>
            <FriendsSearchBar userId={user.id} initialFriends={friends} />
          </div>
          
          {/* Notifications */}
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-3">Notifications</h3>
            <NotificationsSection userId={user.id} />
          </div>
        </div>
      </div>
    </main>
  );
} 