import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import PasswordChange from '@/components/password-change';
import { NotificationsSection } from '../../components/settings-modal';
import FriendsSearchBar from '@/components/profile/friends';
import { getFriendsAndRequests } from '@/app/lib/friends';

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/sign-in');
  }

  // Fetch profile data
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('username')
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
        <div className="bg-white shadow-md rounded-lg p-4 md:p-4">
          <h2 className="text-xl md:text-2xl font-bold mb-4">Profile</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <div className="text-gray-900 bg-gray-100 rounded-md px-3 py-2">
                {user.email}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <div className="text-gray-900 bg-gray-100 rounded-md px-3 py-2">
                {profile?.username || 'Not set'}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <PasswordChange />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Last Sign In
              </label>
              <div className="text-gray-900 bg-gray-100 rounded-md px-3 py-2">
                {
                  new Date(user.last_sign_in_at || '')
                    .toISOString()
                    .split('T')[0]
                }
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account Created
              </label>
              <div className="text-gray-900 bg-gray-100 rounded-md px-3 py-2">
                {new Date(user.created_at).toISOString().split('T')[0]}
              </div>
            </div>
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
