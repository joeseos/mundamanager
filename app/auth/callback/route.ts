import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

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

  // Honour an optional `next` destination carried through the auth link
  // (same single source of truth as the rest of the sign-in flow). Defaults
  // to the home page.
  const destination = safePath(requestUrl.searchParams.get("next") ?? undefined);
  return NextResponse.redirect(`${origin}${destination}`);
}
