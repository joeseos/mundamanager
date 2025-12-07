import Link from 'next/link';
import { Metadata } from 'next';
import Script from 'next/script';

const defaultUrl = process.env.NODE_ENV === 'development'
  ? "http://localhost:3000"
  : "https://www.mundamanager.com";

const PAGE_TITLE = 'Privacy Policy - Munda Manager';
const PAGE_DESCRIPTION = 'Privacy Policy for Munda Manager. Learn how we collect, use, and protect your personal information when using our gang and campaign management tool.';
const PAGE_DESCRIPTION_SHORT = 'Privacy Policy for Munda Manager. Learn how we collect, use, and protect your personal information.';
const PAGE_KEYWORDS = 'Munda Manager privacy policy, data protection, privacy, user data, GDPR';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  keywords: PAGE_KEYWORDS,
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION_SHORT,
    url: `${defaultUrl}/privacy-policy`,
    type: 'article',
    siteName: 'Munda Manager',
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION_SHORT,
  },
  alternates: {
    canonical: `${defaultUrl}/privacy-policy`,
  },
};

export default function PrivacyPolicyPage() {
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
      "@id": `${defaultUrl}/privacy-policy`
    },
    "articleSection": "Legal",
    "keywords": PAGE_KEYWORDS
  };

  return (
    <>
      <Script
        id="privacy-policy-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData),
        }}
      />
      <main className="flex min-h-screen flex-col items-center">
        <div className="container ml-[10px] mr-[10px] max-w-4xl w-full space-y-4">
          <div className="bg-card shadow-md rounded-lg p-4">
            <h1 className="text-2xl md:text-2xl font-bold mb-4">
              Privacy Policy
            </h1>
            
            <div className="mb-8">
              <p className="text-sm text-muted-foreground mb-6">
                Last updated: {new Date().toISOString().split('T')[0]}
              </p>
              <p className="text-muted-foreground mb-2">
                At Munda Manager, we are committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service.
              </p>
            </div>

            <div className="space-y-6">
              <section id="information-we-collect" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">1. Information We Collect</h2>
                
                <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">1.1 Account Information</h3>
                <p className="text-muted-foreground mb-2">
                  When you create an account, we collect:
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                  <li className="text-muted-foreground">Email address (for authentication and account recovery)</li>
                  <li className="text-muted-foreground">Username (for display purposes)</li>
                  <li className="text-muted-foreground">Authentication credentials (handled securely by our authentication provider)</li>
                </ul>

                <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">1.2 Content You Create</h3>
                <p className="text-muted-foreground mb-2">
                  We store the content you create through the Service, including:
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                  <li className="text-muted-foreground">Gang data and configurations</li>
                  <li className="text-muted-foreground">Fighter profiles and characteristics</li>
                  <li className="text-muted-foreground">Campaign data</li>
                  <li className="text-muted-foreground">Custom equipment, fighters, and other assets</li>
                  <li className="text-muted-foreground">Notes, images, and other user-generated content</li>
                </ul>

                <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">1.3 Usage Information</h3>
                <p className="text-muted-foreground mb-2">
                  We only collect the following information for security and compliance purposes:
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                  <li className="text-muted-foreground">Log data (IP address, browser type, access times)</li>
                </ul>
              </section>

              <section id="how-we-use-information" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">2. How We Use Your Information</h2>
                <p className="text-muted-foreground mb-2">
                  We use the information we collect to:
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                  <li className="text-muted-foreground">Authenticate your identity and manage your account</li>
                  <li className="text-muted-foreground">Store and display your content (gangs, fighters, campaigns, etc.)</li>
                  <li className="text-muted-foreground">Enable sharing and collaboration features</li>
                  <li className="text-muted-foreground">Detect and prevent fraud, abuse, or security issues</li>
                  <li className="text-muted-foreground">Comply with legal obligations</li>
                </ul>
              </section>

              <section id="data-sharing" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">3. Data Sharing and Disclosure</h2>
                <p className="text-muted-foreground mb-2">
                  We do not sell your personal information. We may share your information only in the following circumstances:
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                  <li className="text-muted-foreground"><strong className="text-foreground">Service Providers:</strong> With trusted third-party service providers who assist us in operating the Service (e.g., hosting and authentication)</li>
                  <li className="text-muted-foreground"><strong className="text-foreground">Legal Requirements:</strong> When required by law or to protect our rights and safety</li>
                </ul>
              </section>

              <section id="data-security" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">4. Data Security</h2>
                <p className="text-muted-foreground mb-2">
                  We implement appropriate technical and organisational measures to protect your information against unauthorised access, alteration, disclosure, or destruction. However, no method of transmission over the Internet or electronic storage is 100% secure, and we cannot guarantee absolute security.
                </p>
                <p className="text-muted-foreground mb-2">
                  Security measures include:
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                  <li className="text-muted-foreground">Encryption of data in transit and at rest</li>
                  <li className="text-muted-foreground">Secure authentication mechanisms</li>
                  <li className="text-muted-foreground">Regular security assessments</li>
                  <li className="text-muted-foreground">Access controls and monitoring</li>
                </ul>
              </section>

              <section id="your-rights" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">5. Your Rights and Choices</h2>
                <p className="text-muted-foreground mb-2">
                  Depending on your location, you may have certain rights regarding your personal information:
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                  <li className="text-muted-foreground"><strong className="text-foreground">Access:</strong> Request access to your personal information</li>
                  <li className="text-muted-foreground"><strong className="text-foreground">Correction:</strong> Request correction of inaccurate information</li>
                  <li className="text-muted-foreground"><strong className="text-foreground">Deletion:</strong> Request deletion of your account and associated data</li>
                  <li className="text-muted-foreground"><strong className="text-foreground">Portability:</strong> Request a copy of your data in a portable format</li>
                  <li className="text-muted-foreground"><strong className="text-foreground">Objection:</strong> Object to certain processing of your information</li>
                </ul>
                <p className="text-muted-foreground mb-2 mt-4">
                  To exercise these rights, please contact us through our <Link href="/contact" className="underline hover:text-red-800">Contact page</Link>.
                </p>
              </section>

              <section id="cookies" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">6. Cookies</h2>
                <p className="text-muted-foreground mb-2">
                  We use cookies solely for authentication purposes to remember your session when you log in to our Service. We do not use cookies to track your activity or for advertising purposes. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent. However, if you do not accept cookies, you may not be able to use some portions of our Service, particularly those that require authentication.
                </p>
              </section>

              <section id="data-retention" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">7. Data Retention</h2>
                <p className="text-muted-foreground mb-2">
                  We retain your personal information for as long as your account is active or as needed to provide you with the Service. If you delete your account, we will delete or anonymize your personal information, except where we are required to retain it for legal purposes.
                </p>
              </section>

              <section id="children" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">8. Children's Privacy</h2>
                <p className="text-muted-foreground mb-2">
                  Our Service is not intended for children under the age of 13. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe your child has provided us with personal information, please contact us so we can delete such information.
                </p>
              </section>

              <section id="international-transfers" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">9. International Data Transfers</h2>
                <p className="text-muted-foreground mb-2">
                  Your information may be transferred to and processed in countries other than your country of residence. These countries may have data protection laws that differ from those in your country. By using the Service, you consent to the transfer of your information to these countries.
                </p>
              </section>

              <section id="changes" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">10. Changes to This Privacy Policy</h2>
                <p className="text-muted-foreground mb-2">
                  We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date. You are advised to review this Privacy Policy periodically for any changes.
                </p>
              </section>

              <section id="contact" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">11. Contact Us</h2>
                <p className="text-muted-foreground mb-2">
                  If you have any questions about this Privacy Policy, please contact us through our <Link href="/contact" className="underline hover:text-red-800">Contact page</Link> or join our <a href="https://discord.gg/ZWXXqd5NUt" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-800">Discord server</a>.
                </p>
              </section>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

