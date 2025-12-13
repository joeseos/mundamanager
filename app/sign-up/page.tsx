'use client';

import { signUpAction } from "@/app/actions/auth";
import { FormMessage, Message } from "@/components/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, use } from "react";
import { LuEye, LuEyeOff } from "react-icons/lu";

export default function Page(props: { searchParams: Promise<Message> }) {
  const searchParams = use(props.searchParams);
  const [passwordError, setPasswordError] = useState<string>("");
  const [usernameError, setUsernameError] = useState<string>("");
  const [emailError, setEmailError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const [passwordRequirements, setPasswordRequirements] = useState({
    hasLowerCase: false,
    hasUpperCase: false,
    hasNumber: false,
    hasSpecialChar: false,
    hasMinLength: false,
  });

  const checkPasswordRequirements = (password: string) => {
    setPasswordRequirements({
      hasLowerCase: /[a-z]/.test(password),
      hasUpperCase: /[A-Z]/.test(password),
      hasNumber: /\d/.test(password),
      hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?~]/.test(password),
      hasMinLength: password.length >= 6,
    });
  };

  if ("message" in searchParams) {
    return (
      <main className="flex min-h-screen flex-col items-center">
        <div className="container mx-auto max-w-4xl w-full p-4">
          <div className="flex flex-col items-center justify-center text-white text-center">
            <p className="text-lg mb-4">
              Please check your email to verify your account.
            </p>
            <Link href="/sign-in" className="text-lg text-white hover:underline">
              Sign in here once verified
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const password = formData.get('password') as string;
    const username = formData.get('username') as string;
    const email = formData.get('email') as string;

    const isValidUsername = /^[a-zA-Z0-9_-]{3,20}$/.test(username);
    if (!isValidUsername) {
      setUsernameError("Username must be 3-20 characters and can only contain letters, numbers, underscores, and hyphens");
      setIsSubmitting(false);
      return;
    }

    const hasLowerCase = /[a-z]/.test(password);
    const hasUpperCase = /[A-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?~]/.test(password);
    const hasMinLength = password.length >= 6;

    if (!hasLowerCase || !hasUpperCase || !hasNumber || !hasSpecialChar || !hasMinLength) {
      setPasswordError("Password must contain at least 6 characters, including uppercase, lowercase, number, and special character");
      setIsSubmitting(false);
      return;
    }

    setPasswordError("");
    setUsernameError("");
    setEmailError("");

    try {
      const result = await signUpAction(formData);
      if (result?.message) {
        router.push(`/sign-up?message=${encodeURIComponent(result.message)}`);
      } else if (result?.error) {
        if (result.error.includes("email is already registered")) {
          setEmailError("This email is already registered. Please sign in instead");
        } else if (result.error.includes("Username already taken")) {
          setUsernameError(result.error);
        } else {
          router.push(`/sign-up?error=${encodeURIComponent(result.error)}`);
        }
      }
    } catch (error: any) {
      if (!error.digest?.includes('NEXT_REDIRECT')) {
        router.push('/sign-up?error=Something went wrong. Please try again');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-4xl w-full p-4">
        <form 
          className="flex flex-col w-full max-w-sm mx-auto text-white"
          onSubmit={handleSubmit}
        >
          <h1 className="text-2xl font-medium text-white mb-2">Sign up</h1>
          <p className="text-sm text-white mb-8">
            Already have an account?{" "}
            <Link className="text-white font-medium underline" href="/sign-in">
              Sign in
            </Link>
          </p>
          <div className="flex flex-col gap-4">
            <div>
              <Label htmlFor="username" className="text-white">Username</Label>
              <Input
                id="username"
                name="username"
                type="text"
                placeholder="your_username"
                required
                className="text-foreground mt-1"
                minLength={3}
                maxLength={20}
                autoComplete="username"
              />
              {usernameError && (
                <p className="text-red-400 text-sm mt-1">{usernameError}</p>
              )}
            </div>

            <div>
              <Label htmlFor="email" className="text-white">Email</Label>
              <Input 
                id="email"
                name="email" 
                type="email"
                placeholder="you@example.com" 
                required 
                className="text-foreground mt-1" 
                autoComplete="email"
              />
              {emailError && (
                <p className="text-red-400 text-sm mt-1">{emailError}</p>
              )}
            </div>
            
            <div>
              <Label htmlFor="password" className="text-white">Password</Label>
              <div className="relative mt-1">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="••••••••"
                  minLength={6}
                  required
                  className="text-foreground pr-10"
                  onChange={(e) => checkPasswordRequirements(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onMouseDown={() => setShowPassword(true)}
                  onMouseUp={() => setShowPassword(false)}
                  onMouseLeave={() => setShowPassword(false)}
                  onTouchStart={() => setShowPassword(true)}
                  onTouchEnd={() => setShowPassword(false)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors select-none touch-none"
                  aria-label="Hold to reveal password"
                >
                  {showPassword ? (
                    <LuEyeOff className="h-5 w-5" />
                  ) : (
                    <LuEye className="h-5 w-5" />
                  )}
                </button>
              </div>
              {passwordError && (
                <p className="text-red-400 text-sm mt-1">{passwordError}</p>
              )}
              <div className="mt-2 text-sm space-y-1">
                <p className={passwordRequirements.hasMinLength ? "text-green-500" : "text-gray-400"}>
                  ✓ At least 6 characters
                </p>
                <p className={passwordRequirements.hasLowerCase ? "text-green-500" : "text-gray-400"}>
                  ✓ One lowercase letter
                </p>
                <p className={passwordRequirements.hasUpperCase ? "text-green-500" : "text-gray-400"}>
                  ✓ One uppercase letter
                </p>
                <p className={passwordRequirements.hasNumber ? "text-green-500" : "text-gray-400"}>
                  ✓ One number
                </p>
                <p className={passwordRequirements.hasSpecialChar ? "text-green-500" : "text-gray-400"}>
                  ✓ One special character (!@#$%^&*()_+-=[]{}|;:,&lt;&gt;?~)
                </p>
              </div>
            </div>

            <button 
              type="submit" 
              className="bg-neutral-900 text-white px-4 py-2 rounded hover:bg-gray-800 transition-colors mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Signing up...' : 'Sign up'}
            </button>
            <FormMessage message={searchParams} />
          </div>
        </form>
      </div>
    </main>
  );
}