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

const DynamicBreadcrumbNav = dynamic(() => import('@/components/breadcrumb-nav'), {
  ssr: true,
  loading: () => <div className="h-10" />
});

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  preload: true,
  variable: '--font-inter',
})

export const metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Munda Manager",
  description: "A gang management tool for the boardgame Necromunda",
  icons: {
    icon: [
      { url: '/images/favicon.ico', sizes: 'any' },
      { url: '/images/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/images/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: { url: '/images/apple-touch-icon.png' },
  },
};

export const dynamicConfig = 'force-static'
export const revalidate = 3600 // Revalidate every hour

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en" className={inter.className}>
      <head>
        <link rel="manifest" href="/site.webmanifest" />
      </head>
      <body className="bg-background text-foreground">
        <BackgroundImage />
        <DynamicHeaderAuth />
        {user && <DynamicBreadcrumbNav />}
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
