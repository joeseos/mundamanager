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

  // Debug logging to see what we're actually receiving
  console.log('🔍 Auth callback debug:', {
    url: requestUrl.toString(),
    code: code ? 'present' : 'missing',
    token_hash: token_hash ? token_hash.substring(0, 10) + '...' : 'missing',
    type,
    allParams: Object.fromEntries(requestUrl.searchParams)
  });


  if (token_hash && type === 'recovery') {
    console.log('✅ Taking recovery path');
    return NextResponse.redirect(`${origin}/reset-password/update?token_hash=${token_hash}&type=${type}`);
  }

  if (token_hash && type === 'email_change') {
    console.log('✅ Taking email_change path');
    return NextResponse.redirect(`${origin}/confirm-email?token_hash=${token_hash}&type=${type}`);
  }

  // Check for other possible email-related types
  if (token_hash && (type === 'email' || type === 'email_change_current' || type === 'email_change_new')) {
    console.log('✅ Taking email variant path, type:', type);
    return NextResponse.redirect(`${origin}/confirm-email?token_hash=${token_hash}&type=${type}`);
  }

  if (code) {
    console.log('✅ Taking code exchange path');
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  const cookieStore = await cookies();
  const redirectCookie = cookieStore.get('redirectPath');
  if (redirectCookie?.value) {
    console.log('✅ Taking redirect cookie path:', redirectCookie.value);
    cookieStore.delete('redirectPath');
    const destination = safePath(redirectCookie.value);
    return NextResponse.redirect(`${origin}${destination}`);
  }

  // Redirect to the home page by default
  console.log('✅ Taking default redirect path to home');
  return NextResponse.redirect(origin);
}
