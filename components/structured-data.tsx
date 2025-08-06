import Script from 'next/script';

interface StructuredDataProps {
  type: 'website' | 'organization' | 'webpage';
  data: any;
}

export default function StructuredData({ type, data }: StructuredDataProps) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": type,
    ...data
  };

  return (
    <Script
      id="structured-data"
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(structuredData),
      }}
    />
  );
}

export function WebsiteStructuredData() {
  return (
    <StructuredData
      type="website"
      data={{
        name: "Munda Manager",
        description: "Gang & Campaign management tool for Necromunda",
        url: "https://www.mundamanager.com",
        potentialAction: {
          "@type": "SearchAction",
          target: "https://www.mundamanager.com/search?q={search_term_string}",
          "query-input": "required name=search_term_string"
        }
      }}
    />
  );
}

export function OrganizationStructuredData() {
  return (
    <StructuredData
      type="organization"
      data={{
        name: "Munda Manager",
        description: "Gang & Campaign management tool for Necromunda",
        url: "https://www.mundamanager.com",
        logo: "https://www.mundamanager.com/images/favicon-192x192.png",
        sameAs: [
          "https://discord.gg/ZWXXqd5NUt",
          "https://www.patreon.com/c/mundamanager"
        ]
      }}
    />
  );
} 