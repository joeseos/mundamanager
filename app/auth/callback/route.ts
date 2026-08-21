import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { safePostSignInPath } from "@/utils/auth";
import { invalidateUserPermissions } from "@/utils/cache-tags";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const token_hash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const origin = requestUrl.origin;



  if (token_hash && type === 'recovery') {
    return NextResponse.redirect(`${origin}/reset-password/update?token_hash=${token_hash}&type=${type}`);
  }

  if (token_hash && type === 'email_change') {
    return NextResponse.redirect(`${origin}/confirm-email?token_hash=${token_hash}&type=${type}`);
  }

  // Check for other possible email-related types
  if (token_hash && (type === 'email' || type === 'email_change_current' || type === 'email_change_new')) {
    return NextResponse.redirect(`${origin}/confirm-email?token_hash=${token_hash}&type=${type}`);
  }

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    // Same reason as signInAction: any path that establishes a session clears
    // that user's permission entries, which are cached with revalidate: false.
    if (!error && data.user) {
      invalidateUserPermissions(data.user.id);
    }
  }

  const destination = safePostSignInPath(requestUrl.searchParams.get("next"));
  return NextResponse.redirect(`${origin}${destination}`);
}
