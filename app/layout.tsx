import { EnvVarWarning } from "@/components/env-var-warning";
import { hasEnvVars } from "@/utils/supabase/check-env-vars";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import BackgroundImage from '@/components/background-image';
import { Inter } from 'next/font/google'
import dynamic from 'next/dynamic';
import { headers } from 'next/headers';
import { createClient } from "@/utils/supabase/server";
import ClientToaster from "@/components/ui/client-toaster";

const DynamicHeaderAuth = dynamic(() => import('@/components/header-auth'), {
  ssr: true,
  loading: () => <div className="h-16" />
});

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
  icons: {
    icon: [
      { url: '/images/favicon.ico', sizes: 'any' },
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
};

export const dynamicConfig = 'force-static'
export const revalidate = 3600 // In seconds, so 3600 = 1 hour

export default async function RootLayout({
  children,
  breadcrumb,
}: {
  children: React.ReactNode;
  breadcrumb: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en" className={inter.className}>
      <head>
        <link rel="manifest" href="/site.webmanifest" />
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
        <DynamicHeaderAuth />
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
