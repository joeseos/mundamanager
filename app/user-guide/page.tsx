import { Metadata } from 'next';
import Script from 'next/script';
import { UserGuideContent } from '@/components/user-guide/user-guide-content';
import { getUserGuides } from '@/app/lib/user-guide';
import { prepareUserGuideContent } from '@/utils/user-guide-content';
import { EDITION_N23, EDITION_N26 } from '@/types/edition';

const defaultUrl = process.env.NODE_ENV === 'development'
  ? "http://localhost:3000"
  : "https://www.mundamanager.com";

// SEO constants - edit these to update all metadata
const PAGE_TITLE = 'User Guide - How to Use Munda Manager';
const PAGE_DESCRIPTION = 'Complete user guide for Munda Manager. Learn how to create gangs, manage fighters, run campaigns, use custom assets, and explore advanced features like Chem-alchemy and Gene-Smithing for Necromunda.';
const PAGE_DESCRIPTION_SHORT = 'Complete user guide for Munda Manager. Learn how to create gangs, manage fighters, run campaigns, and explore advanced features.';
const PAGE_KEYWORDS = 'Munda Manager user guide, Necromunda guide, gang management tutorial, campaign management guide, how to use Munda Manager, Necromunda gang builder guide';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  keywords: PAGE_KEYWORDS,
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION_SHORT,
    url: `${defaultUrl}/user-guide`,
    type: 'article',
    siteName: 'Munda Manager',
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION_SHORT,
  },
  alternates: {
    canonical: `${defaultUrl}/user-guide`,
  },
};

export default async function UserGuidePage() {
  const rawGuides = await getUserGuides();
  const guides = {
    [EDITION_N23]: prepareUserGuideContent(rawGuides[EDITION_N23]),
    [EDITION_N26]: prepareUserGuideContent(rawGuides[EDITION_N26]),
  };

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
    "dateModified": "2025-06-01",
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `${defaultUrl}/user-guide`
    },
    "articleSection": "User Guide",
    "keywords": PAGE_KEYWORDS
  };

  return (
    <>
      <Script
        id="user-guide-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData),
        }}
      />
      <main className="flex min-h-screen flex-col items-center">
        <UserGuideContent guides={guides} />
      </main>
    </>
  );
}
