import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

function safePath(p?: string) {
  if (!p) return "/";
  if (!p.startsWith("/") || p.startsWith("//")) return "/";
  return p;
}

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

  const cookieStore = await cookies();
  const redirectCookie = cookieStore.get('redirectPath');
  if (redirectCookie?.value) {
    cookieStore.delete('redirectPath');
    const destination = safePath(redirectCookie.value);
    return NextResponse.redirect(`${origin}${destination}`);
  }

  // Redirect to the home page by default
  return NextResponse.redirect(origin);
}
