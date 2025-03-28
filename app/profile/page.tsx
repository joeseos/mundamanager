import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import PasswordChange from "@/components/password-change";

export default async function ProfilePage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
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

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container ml-[10px] mr-[10px] max-w-4xl w-full space-y-4 mt-2">
        <div className="bg-white shadow-md rounded-lg p-4 md:p-4">
          <h2 className="text-2xl font-bold mb-4">Profile</h2>
          
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
                {new Date(user.last_sign_in_at || '').toLocaleDateString()}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account Created
              </label>
              <div className="text-gray-900 bg-gray-100 rounded-md px-3 py-2">
                {new Date(user.created_at).toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
} 