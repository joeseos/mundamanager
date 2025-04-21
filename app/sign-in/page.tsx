import { signInAction } from "@/app/actions";
import { FormMessage, Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { cookies } from 'next/headers';
import TurnstileWidget from './TurnstileWidget';

export default async function SignIn({
  searchParams,
}: {
  searchParams: { 
    message?: string;
    success?: string;
    error?: string;
  };
}) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const cookieStore = await cookies();
    const redirectPath = cookieStore.get('redirectPath');
    if (redirectPath) {
      cookieStore.delete('redirectPath');
    }
    redirect(redirectPath?.value || "/");
  }

  // Extract error message from searchParams (query string)
  const errorMessage = searchParams.error || null;

  // Create the appropriate message object based on what's in searchParams
  let topMessage: Message | null = null;
  if (searchParams.success) {
    topMessage = { success: searchParams.success };
  } else if (searchParams.message) {
    topMessage = { message: searchParams.message };
  }

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-4xl w-full p-4">
        {topMessage && (
          <div className="mb-4">
            <FormMessage message={topMessage} />
          </div>
        )}
        <form 
          className="flex flex-col w-full max-w-sm mx-auto text-white"
          action={signInAction}
        >
          <h1 className="text-2xl font-medium text-white mb-2">Sign in</h1>
          <p className="text-sm text-white mb-8">
            Don't have an account?{" "}
            <Link className="text-white font-medium underline" href="/sign-up">
              Sign up
            </Link>
          </p>
          <div className="flex flex-col gap-4">
            <Label htmlFor="email">Email</Label>
            <Input 
              id="email" 
              name="email" 
              type="email"
              placeholder="you@example.com" 
              required 
              className="text-black" 
              autoComplete="email"
            />
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              required
              className="text-black"
              autoComplete="current-password"
            />
            {errorMessage && (
              <div className="text-red-500 text-sm">
                {errorMessage}
              </div>
            )}
            <Link 
              href="/reset-password" 
              className="text-sm text-white hover:underline self-end"
            >
              Forgot your password?
            </Link>
            <div className="mt-2">
              <TurnstileWidget />
            </div>
            <SubmitButton pendingText="Signing in..." className="mt-2">
              Sign in
            </SubmitButton>
          </div>
        </form>
      </div>
    </main>
  );
}
