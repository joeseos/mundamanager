import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { safePostSignInPath } from "@/utils/auth";

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
    await supabase.auth.exchangeCodeForSession(code);
  }

  const destination = safePostSignInPath(requestUrl.searchParams.get("next"));
  return NextResponse.redirect(`${origin}${destination}`);
}
