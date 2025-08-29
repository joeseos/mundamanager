import { EnvVarWarning } from "@/components/env-var-warning";
import { hasEnvVars } from "@/utils/supabase/check-env-vars";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import BackgroundImage from '@/components/background-image';
import { Inter } from 'next/font/google'
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from "@/utils/supabase/server";
import { getAuthenticatedUser } from "@/utils/auth";
import ClientToaster from "@/components/ui/client-toaster";
import { WebsiteStructuredData, OrganizationStructuredData } from "@/components/structured-data";
import SettingsModal from "@/components/settings-modal";

const defaultUrl = process.env.NODE_ENV === 'development'
  ? "http://localhost:3000"
  : "https://www.mundamanager.com";

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  preload: true,
  variable: '--font-inter',
})

// Metadata constants
const SITE_TITLE = "Munda Manager";
const SITE_DESCRIPTION = "Gang & Campaign management tool for Necromunda";
const SITE_IMAGE = '/images/favicon-192x192.png';

export const metadata = {
  metadataBase: new URL(defaultUrl),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  keywords: "Necromunda, gang management, campaign tool, list builder, gang list, gang builder, yaktribe replacement, Munda Manager",
  authors: [{ name: "Munda Manager Team" }],
  creator: "Munda Manager",
  publisher: "Munda Manager",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: [
              { url: '/favicon.ico', sizes: 'any' },
      { url: '/images/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/images/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: { url: '/images/apple-touch-icon.png' },
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: defaultUrl,
    siteName: SITE_TITLE,
    images: [
      {
        url: SITE_IMAGE,
        width: 192,
        height: 192,
        alt: SITE_TITLE,
      },
    ],
    locale: 'en_GB',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [SITE_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export const dynamic = 'force-dynamic'

export default async function RootLayout({
  children,
  breadcrumb,
}: {
  children: React.ReactNode;
  breadcrumb: React.ReactNode;
}) {
  const supabase = await createClient();
  let user: { id: string; email?: string } | null = null;
  try {
    user = await getAuthenticatedUser(supabase);
  } catch {}

  // Fetch profile details for header (username, admin flag)
  let username: string | undefined = undefined;
  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_role, username')
      .eq('id', user.id)
      .single();
    username = profile?.username;
    isAdmin = profile?.user_role === 'admin';
  }

  return (
    <html lang="en" className={inter.className}>
      <head>
        <link rel="manifest" href="/site.webmanifest" />
        <WebsiteStructuredData />
        <OrganizationStructuredData />
        {process.env.NODE_ENV === 'development' && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                // Suppress Next.js scroll warnings for fixed breadcrumbs
                const originalConsoleWarn = console.warn;
                console.warn = function(...args) {
                  if (args[0] && args[0].includes && args[0].includes('Skipping auto-scroll behavior')) {
                    return;
                  }
                  originalConsoleWarn.apply(console, args);
                };
              `,
            }}
          />
        )}
      </head>
      <body className="bg-background text-foreground" suppressHydrationWarning>
        <BackgroundImage />
        <header className="fixed top-0 left-0 right-0 bg-white shadow-md z-50 print:hidden">
          <div className="flex justify-between items-center h-14 px-2">
            <Link href="/" className="flex items-center">
              <Image
                src="/images/favicon-192x192.png"
                alt="App Icon"
                width={36}
                height={36}
                className="ml-1 mr-2"
              />
              <span className="text-lg font-bold hover:text-primary transition-colors">
                Munda Manager
              </span>
            </Link>
            {user ? (
              <div className="mr-2">
                {/* Fetch minimal profile info for header */}
                {/* We intentionally avoid an extra auth call here and use claims (done above) */}
                {/* SettingsModal expects a Supabase user-like object */}
                <SettingsModal user={{ id: user.id, email: user.email } as any} isAdmin={isAdmin} username={username} />
              </div>
            ) : null}
          </div>
        </header>
        {breadcrumb}
        <main className={`min-h-screen flex flex-col items-center ${user ? 'pt-24' : 'pt-16'} print:print-reset`}>
          <div className="flex-1 w-full flex flex-col items-center">
            {!hasEnvVars && (
              <nav className="w-full flex justify-center border-b border-b-foreground/10 h-12">
                <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
                  <EnvVarWarning />
                </div>
              </nav>
            )}
            <div id="main-content-wrapper" className="flex flex-col max-w-5xl w-full px-[10px] py-4 print:print-reset">
              {children}
            </div>
          </div>
        </main>
        <ClientToaster />
      </body>
    </html>
  );
}
