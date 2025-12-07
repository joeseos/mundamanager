import Link from 'next/link';
import { Metadata } from 'next';
import Script from 'next/script';

const defaultUrl = process.env.NODE_ENV === 'development'
  ? "http://localhost:3000"
  : "https://www.mundamanager.com";

const PAGE_TITLE = 'Terms of Service - Munda Manager';
const PAGE_DESCRIPTION = 'Terms of Service for Munda Manager. Read our terms and conditions for using the gang and campaign management tool for Necromunda.';
const PAGE_DESCRIPTION_SHORT = 'Terms of Service for Munda Manager. Read our terms and conditions for using the platform.';
const PAGE_KEYWORDS = 'Munda Manager terms, terms of service, terms and conditions, Necromunda tool terms';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  keywords: PAGE_KEYWORDS,
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION_SHORT,
    url: `${defaultUrl}/terms`,
    type: 'article',
    siteName: 'Munda Manager',
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION_SHORT,
  },
  alternates: {
    canonical: `${defaultUrl}/terms`,
  },
};

export default function TermsPage() {
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
      "@id": `${defaultUrl}/terms`
    },
    "articleSection": "Legal",
    "keywords": PAGE_KEYWORDS
  };

  return (
    <>
      <Script
        id="terms-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData),
        }}
      />
      <main className="flex min-h-screen flex-col items-center">
        <div className="container ml-[10px] mr-[10px] max-w-4xl w-full space-y-4">
          <div className="bg-card shadow-md rounded-lg p-4">
            <h1 className="text-2xl md:text-2xl font-bold mb-4">
              Terms of Service
            </h1>
            
            <div className="mb-8">
              <p className="text-sm text-muted-foreground mb-6">
                Last updated: {new Date().toISOString().split('T')[0]}
              </p>
              <p className="text-muted-foreground mb-2">
                Please read these Terms of Service ("Terms") carefully before using Munda Manager ("the Service") operated by the Munda Manager Team ("us", "we", or "our").
              </p>
            </div>

            <div className="space-y-6">
              <section id="acceptance" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">1. Acceptance of Terms</h2>
                <p className="text-muted-foreground mb-2">
                  By accessing or using Munda Manager, you agree to be bound by these Terms. If you disagree with any part of these terms, then you may not access the Service.
                </p>
              </section>

              <section id="use-of-service" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">2. Use of Service</h2>
                <p className="text-muted-foreground mb-2">
                  Munda Manager is a community-driven tool for managing Necromunda gangs and campaigns. You agree to use the Service only for lawful purposes and in accordance with these Terms.
                </p>
                <p className="text-muted-foreground mb-2">
                  You agree not to:
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                  <li className="text-muted-foreground">Use the Service in any way that violates any applicable laws or regulations</li>
                  <li className="text-muted-foreground">Attempt to gain unauthorised access to any portion of the Service</li>
                  <li className="text-muted-foreground">Interfere with or disrupt the Service or servers connected to the Service</li>
                  <li className="text-muted-foreground">Use the Service to transmit any malicious code or harmful content</li>
                  <li className="text-muted-foreground">Impersonate any person or entity or misrepresent your affiliation with any person or entity</li>
                </ul>
              </section>

              <section id="user-accounts" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">3. User Accounts</h2>
                <p className="text-muted-foreground mb-2">
                  When you create an account with us, you must provide information that is accurate, complete, and current at all times. You are responsible for safeguarding the password and for all activities that occur under your account.
                </p>
                <p className="text-muted-foreground mb-2">
                  You agree not to disclose your password to any third party. You must notify us immediately upon becoming aware of any breach of security or unauthorised use of your account.
                </p>
              </section>

              <section id="content" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">4. User Content</h2>
                <p className="text-muted-foreground mb-2">
                  You retain ownership of any content you create, upload, or share through the Service ("User Content"). By using the Service, you grant us a worldwide, non-exclusive, royalty-free licence to use, store, and display your User Content solely for the purpose of operating and providing the Service.
                </p>
                <p className="text-muted-foreground mb-2">
                  You are solely responsible for your User Content and represent and warrant that:
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                  <li className="text-muted-foreground">You own or have the necessary rights to use and authorise us to use your User Content</li>
                  <li className="text-muted-foreground">Your User Content does not violate any third-party rights, including intellectual property rights</li>
                  <li className="text-muted-foreground">Your User Content complies with all applicable laws and regulations</li>
                </ul>
              </section>

              <section id="intellectual-property" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">5. Intellectual Property</h2>
                <p className="text-muted-foreground mb-2">
                  The Service and its original content, features, and functionality are owned by the Munda Manager Team and are protected by international copyright, trade mark, patent, trade secret, and other intellectual property laws.
                </p>
                <p className="text-muted-foreground mb-2">
                  Necromunda is a trade mark of Games Workshop Limited. Munda Manager is not affiliated with, endorsed by, or sponsored by Games Workshop Limited. This Service is provided for the community's use in managing their Necromunda games and campaigns.
                </p>
              </section>

              <section id="disclaimers" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">6. Disclaimers</h2>
                <p className="text-muted-foreground mb-2">
                  The Service is provided on an "as is" and "as available" basis. We make no warranties, expressed or implied, and hereby disclaim all warranties including, without limitation, implied warranties of merchantability, fitness for a particular purpose, or non-infringement.
                </p>
                <p className="text-muted-foreground mb-2">
                  We do not guarantee that the Service will be available at all times, secure, or error-free. We reserve the right to modify, suspend, or discontinue the Service at any time without prior notice.
                </p>
              </section>

              <section id="limitation-of-liability" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">7. Limitation of Liability</h2>
                <p className="text-muted-foreground mb-2">
                  In no event shall the Munda Manager Team, its contributors, or affiliates be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your use of the Service.
                </p>
              </section>

              <section id="termination" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">8. Termination</h2>
                <p className="text-muted-foreground mb-2">
                  We may terminate or suspend your account and access to the Service immediately, without prior notice or liability, for any reason, including if you breach these Terms.
                </p>
                <p className="text-muted-foreground mb-2">
                  Upon termination, your right to use the Service will cease immediately. All provisions of these Terms which by their nature should survive termination shall survive termination.
                </p>
              </section>

              <section id="changes" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">9. Changes to Terms</h2>
                <p className="text-muted-foreground mb-2">
                  We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material, we will try to provide at least 30 days notice prior to any new terms taking effect.
                </p>
                <p className="text-muted-foreground mb-2">
                  What constitutes a material change will be determined at our sole discretion. By continuing to access or use our Service after those revisions become effective, you agree to be bound by the revised terms.
                </p>
              </section>

              <section id="contact" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">10. Contact Information</h2>
                <p className="text-muted-foreground mb-2">
                  If you have any questions about these Terms, please contact us through our <Link href="/contact" className="underline hover:text-red-800">Contact page</Link> or join our <a href="https://discord.gg/ZWXXqd5NUt" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-800">Discord server</a>.
                </p>
              </section>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

