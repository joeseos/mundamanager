import Link from 'next/link';
import { Metadata } from 'next';
import Script from 'next/script';
import { LuCodeXml } from "react-icons/lu";
import { Button } from "@/components/ui/button";

const defaultUrl = process.env.NODE_ENV === 'development'
  ? "http://localhost:3000"
  : "https://www.mundamanager.com";

// SEO constants - edit these to update all metadata
const PAGE_TITLE = 'API Access - Munda Manager REST API Documentation';
const PAGE_DESCRIPTION = 'Access your Munda Manager campaign data as XML or JSON. Integrate live campaign information into your own tools, dashboards, or spreadsheets with our REST API for Necromunda campaigns.';
const PAGE_DESCRIPTION_SHORT = 'Access your Munda Manager campaign data as XML or JSON. Integrate live information into your own tools and spreadsheets.';
const PAGE_KEYWORDS = 'Munda Manager API, Necromunda API, campaign data API, XML export, JSON export, Google Sheets integration, campaign tracking';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  keywords: PAGE_KEYWORDS,
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION_SHORT,
    url: `${defaultUrl}/api-access`,
    type: 'article',
    siteName: 'Munda Manager',
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION_SHORT,
  },
  alternates: {
    canonical: `${defaultUrl}/api-access`,
  },
};

export default function ApiAccessPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": PAGE_TITLE,
    "description": PAGE_DESCRIPTION,
    "author": {
      "@type": "Organization",
      "name": "Munda Manager Team"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Munda Manager",
      "logo": {
        "@type": "ImageObject",
        "url": `${defaultUrl}/images/favicon-192x192.png`
      }
    },
    "datePublished": "2024-01-01",
    "dateModified": new Date().toISOString().split('T')[0],
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `${defaultUrl}/api-access`
    },
    "articleSection": "Developer Documentation",
    "keywords": PAGE_KEYWORDS
  };

  return (
    <>
      <Script
        id="api-access-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData),
        }}
      />
      <main className="flex min-h-screen flex-col items-center">
      <div className="container ml-[10px] mr-[10px] max-w-4xl w-full space-y-4">
        <div className="bg-card shadow-md rounded-lg p-4">
          <h1 className="text-2xl md:text-2xl font-bold mb-4">
            API Access
          </h1>
          
          <div className="mb-8">
            <p className="text-muted-foreground mb-4">
              Munda Manager does not currently provide API keys for full programmatic access to all data. However, we do offer a <strong className="text-foreground">public REST API for campaign data</strong>, allowing you to retrieve campaign information as XML or JSON without authentication.
            </p>
            <p className="text-muted-foreground mb-4">
              We plan to extend API access to other parts of the app in the future, such as gang data and fighter information. Stay tuned for updates!
            </p>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-2">Campaign Data as XML and JSON</h2>
            <p className="text-muted-foreground mb-4">
              Munda Manager now lets you access your campaign data as <strong className="text-foreground">XML or JSON</strong>, making it easy to plug live information into your own tools, dashboards, or spreadsheets.
            </p>
            <p className="text-muted-foreground mb-4">
              If you run a campaign and want full control over tracking gang wealth, territories, ratings, or overall progress outside the app, this provides a clean, structured REST API designed for external use, with no authentication required.
            </p>
            <p className="text-muted-foreground">
              To view your campaign data as XML or JSON, click the <Button variant="outline" size="icon" className="size-8 inline-flex align-middle cursor-default"><LuCodeXml className="size-5" /></Button> icon on your campaign page.
            </p>
          </div>

          {/* Table of contents */}
          <div className="mb-12">
            <h2 className="text-xl font-semibold text-foreground mb-2">Contents</h2>
            <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
              <li><a href="#google-sheets-integration" className="underline hover:text-red-800">How to Access Your Campaign Data from Google Sheets</a></li>
              <li>
                <span className="text-muted-foreground">Examples:</span>
                <ul className="list-disc marker:text-red-800 pl-6 mt-2 space-y-1">
                  <li><a href="#get-campaign-name" className="underline hover:text-red-800">Get the Campaign Name</a></li>
                  <li><a href="#get-all-gang-names" className="underline hover:text-red-800">Get All Gang Names</a></li>
                  <li><a href="#get-gang-rating" className="underline hover:text-red-800">Get the Rating of a Gang by ID</a></li>
                  <li><a href="#get-gang-territories" className="underline hover:text-red-800">Get the Territories of a Gang by ID</a></li>
                  <li><a href="#get-gang-wealth-dynamic" className="underline hover:text-red-800">Get the Wealth of a Gang Using a Cell Reference</a></li>
                </ul>
              </li>
              <li><a href="#usage-guidelines" className="underline hover:text-red-800">Usage Guidelines</a></li>
              <li><a href="#support" className="underline hover:text-red-800">Support</a></li>
            </ul>
          </div>

          {/* Main content */}
          <div className="space-y-6">
            <section id="google-sheets-integration" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-foreground mb-4">How to Access Your Campaign Data from Google Sheets</h2>
              <p className="text-muted-foreground mb-4">
                Below are a few examples showing how to use campaign data in Google Sheets.
              </p>
              <p className="text-muted-foreground mb-4">
                For all examples, we use the campaign ID <code className="text-gray-400 bg-neutral-900 px-2 py-0.5 rounded text-sm break-all">4a2ab55f-ec68-44ab-9572-e0f68e2450d0</code>
              </p>
              <p className="text-muted-foreground mb-6">
                <a 
                  href="https://www.mundamanager.com/campaigns/4a2ab55f-ec68-44ab-9572-e0f68e2450d0" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline hover:text-red-800"
                >
                  View this campaign on Munda Manager →
                </a>
              </p>

              {/* Example 1: Get Campaign Name */}
              <div id="get-campaign-name" className="scroll-mt-24 mb-8">
                <h3 className="text-lg font-semibold text-foreground mb-2">Get the Campaign Name</h3>
                <div className="bg-neutral-900 rounded-lg p-4 my-4 overflow-x-auto">
                  <pre className="text-sm text-green-400 whitespace-pre-wrap"><code>{`=IMPORTXML(
  "https://www.mundamanager.com/api/campaigns/4a2ab55f-ec68-44ab-9572-e0f68e2450d0/data?format=xml",
  "/campaign_data/campaign/campaign_name"
)`}</code></pre>
                </div>
                <p className="text-muted-foreground">
                  <strong className="text-foreground">Result:</strong> <code className="text-gray-400 bg-neutral-900 px-2 py-0.5 rounded">Live from Rust Town</code>
                </p>
              </div>

              {/* Example 2: Get All Gang Names */}
              <div id="get-all-gang-names" className="scroll-mt-24 mb-8">
                <h3 className="text-lg font-semibold text-foreground mb-2">Get All Gang Names</h3>
                <div className="bg-neutral-900 rounded-lg p-4 my-4 overflow-x-auto">
                  <pre className="text-sm text-green-400 whitespace-pre-wrap"><code>{`=IMPORTXML(
  "https://www.mundamanager.com/api/campaigns/4a2ab55f-ec68-44ab-9572-e0f68e2450d0/data?format=xml",
  "//member/gangs/gang/name"
)`}</code></pre>
                </div>
                <p className="mb-2">
                  <strong className="text-foreground">Result:</strong>
                </p>
                <div className="bg-neutral-900 rounded-lg p-4 overflow-x-auto">
                  <pre className="text-sm text-gray-400 whitespace-pre-wrap"><code>{`Obsidian Protocol
Ironstorm Chasers
The Tyrant Dethroners
Rig
Da Smiffee Boyz
The Slime Eaters
Nitro Oni
Badlands Banditos
Runners from the 90s
Shotgun-347
Squat
Ironfang
Pyres of Redemption
Rust-Fangs
The Stygian Coven
The Sump Disciples
Eschatine Promethian Choir
The Performance Improvement Plan
Smoke and Mirrors
Bald Bryen's Gladiators
Bryen's pet experiments`}</code></pre>
                </div>
              </div>

              {/* Example 3: Get Gang Rating */}
              <div id="get-gang-rating" className="scroll-mt-24 mb-8">
                <h3 className="text-lg font-semibold text-foreground mb-2">Get the Rating of a Gang by ID</h3>
                <p className="text-muted-foreground mb-2">
                  Get the rating of the gang with ID <code className="text-gray-400 bg-neutral-900 px-2 py-0.5 rounded text-sm break-all">1a18a45f-b1db-42c2-a212-3af060219b78</code>
                </p>
                <div className="bg-neutral-900 rounded-lg p-4 my-4 overflow-x-auto">
                  <pre className="text-sm text-green-400 whitespace-pre-wrap"><code>{`=IMPORTXML(
  "https://www.mundamanager.com/api/campaigns/4a2ab55f-ec68-44ab-9572-e0f68e2450d0/data?format=xml",
  "//gang[id='1a18a45f-b1db-42c2-a212-3af060219b78']/rating"
)`}</code></pre>
                </div>
                <p className="text-muted-foreground">
                  <strong className="text-foreground">Result:</strong> <code className="text-gray-400 bg-neutral-900 px-2 py-0.5 rounded">1355</code>
                </p>
              </div>

              {/* Example 4: Get Gang Territories */}
              <div id="get-gang-territories" className="scroll-mt-24 mb-8">
                <h3 className="text-lg font-semibold text-foreground mb-2">Get the Territories of a Gang by ID</h3>
                <div className="bg-neutral-900 rounded-lg p-4 my-4 overflow-x-auto">
                  <pre className="text-sm text-green-400 whitespace-pre-wrap"><code>{`=IMPORTXML(
  "https://www.mundamanager.com/api/campaigns/4a2ab55f-ec68-44ab-9572-e0f68e2450d0/data?format=xml",
  "//gang[id='1a18a45f-b1db-42c2-a212-3af060219b78']/territories/territory/name"
)`}</code></pre>
                </div>
                <p className="mb-2">
                  <strong className="text-foreground">Result:</strong>
                </p>
                <div className="bg-neutral-900 rounded-lg p-4 overflow-x-auto">
                  <pre className="text-sm text-gray-400 whitespace-pre-wrap"><code>{`Second Best Smuggler Sympathisers
Gang Sympathisers`}</code></pre>
                </div>
              </div>

              {/* Example 5: Get Gang Wealth with Cell Reference */}
              <div id="get-gang-wealth-dynamic" className="scroll-mt-24 mb-8">
                <h3 className="text-lg font-semibold text-foreground mb-2">Get the Wealth of a Gang Using a Cell Reference</h3>
                <p className="text-muted-foreground mb-2">
                  You can use a cell reference to dynamically specify the gang ID. In this example, cell <code className="text-gray-400 bg-neutral-900 px-2 py-0.5 rounded">A1</code> contains the gang ID:
                </p>
                <div className="bg-neutral-900 rounded-lg p-4 my-2 overflow-x-auto">
                  <code className="text-sm text-gray-400">A1 = "1a18a45f-b1db-42c2-a212-3af060219b78"</code>
                </div>
                <div className="bg-neutral-900 rounded-lg p-4 my-4 overflow-x-auto">
                  <pre className="text-sm text-green-400 whitespace-pre-wrap"><code>{`=IMPORTXML(
  "https://www.mundamanager.com/api/campaigns/4a2ab55f-ec68-44ab-9572-e0f68e2450d0/data?format=xml",
  "//gang[id='" & A1 & "']/rating"
)`}</code></pre>
                </div>
                <p className="text-muted-foreground">
                  <strong className="text-foreground">Result:</strong> <code className="text-gray-400 bg-neutral-900 px-2 py-0.5 rounded">1355</code>
                </p>
              </div>
            </section>

            <section id="usage-guidelines" className="scroll-mt-24">
              <h2 className="text-2xl font-semibold text-foreground mb-1">Usage Guidelines</h2>
              <p className="text-muted-foreground mb-4">
                When using the Munda Manager API, please follow these guidelines:
              </p>
              <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                <li className="text-muted-foreground">
                  <strong className="text-foreground">Fair use:</strong> Avoid excessive requests. If you're polling for updates, consider reasonable intervals (e.g., once every 15 minutes) rather than continuous requests.
                </li>
                <li className="text-muted-foreground">
                  <strong className="text-foreground">Caching:</strong> Cache responses locally when possible to reduce load on our servers and improve your application's performance.
                </li>
                <li className="text-muted-foreground">
                  <strong className="text-foreground">Attribution:</strong> If you display campaign data publicly, please provide attribution to Munda Manager.
                </li>
                <li className="text-muted-foreground">
                  <strong className="text-foreground">No commercial use:</strong> The API is provided for personal and community use. Commercial applications require prior approval.
                </li>
                <li className="text-muted-foreground">
                  <strong className="text-foreground">Respect privacy:</strong> Only access campaign data that is intended to be public. Do not attempt to access or scrape private user data.
                </li>
              </ul>
            </section>

            <section id="support" className="scroll-mt-24">
              <h2 className="text-2xl font-semibold text-foreground mb-1">Support</h2>
              <p className="text-muted-foreground mb-2">
                If you have questions about the API, need assistance with your integration, or want to report bugs and request features, please reach out through our{' '}
                <Link href="/contact" className="underline hover:text-red-800">
                  contact page
                </Link>{' '}
                or join our{' '}
                <a 
                  href="https://discord.gg/ZWXXqd5NUt" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline hover:text-red-800"
                >
                  Discord server
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
    </>
  );
}
