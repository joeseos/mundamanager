import Link from 'next/link';
import { Metadata } from 'next';
import Script from 'next/script';
import { FaDiscord, FaPatreon, FaGithub, FaInstagram } from "react-icons/fa6";

const defaultUrl = process.env.NODE_ENV === 'development'
  ? "http://localhost:3000"
  : "https://www.mundamanager.com";

const PAGE_TITLE = 'Contact Us - Munda Manager';
const PAGE_DESCRIPTION = 'Get in touch with the Munda Manager team. Find our Discord, social media, and other ways to contact us for support, feedback, or questions.';
const PAGE_DESCRIPTION_SHORT = 'Get in touch with the Munda Manager team. Find our Discord, social media, and contact information.';
const PAGE_KEYWORDS = 'Munda Manager contact, support, feedback, Discord, help';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  keywords: PAGE_KEYWORDS,
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION_SHORT,
    url: `${defaultUrl}/contact`,
    type: 'article',
    siteName: 'Munda Manager',
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION_SHORT,
  },
  alternates: {
    canonical: `${defaultUrl}/contact`,
  },
};

export default function ContactPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
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
      "@id": `${defaultUrl}/contact`
    },
    "keywords": PAGE_KEYWORDS
  };

  return (
    <>
      <Script
        id="contact-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData),
        }}
      />
      <main className="flex min-h-screen flex-col items-center">
        <div className="container ml-[10px] mr-[10px] max-w-4xl w-full space-y-4">
          <div className="bg-card shadow-md rounded-lg p-4">
            <h1 className="text-2xl md:text-2xl font-bold mb-4">
              Contact Us
            </h1>
            
            <div className="mb-8">
              <p className="text-muted-foreground mb-2">
                We'd love to hear from you! Whether you have questions, feedback, bug reports, or just want to say hello, there are several ways to get in touch with the Munda Manager team.
              </p>
            </div>

            <div className="space-y-6">
              <section id="discord" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">Discord Community</h2>
                <p className="text-muted-foreground mb-4">
                  The best way to reach us and connect with the community is through our Discord server. Join us for:
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2 mb-4">
                  <li className="text-muted-foreground">Real-time support and help</li>
                  <li className="text-muted-foreground">Feature requests and feedback</li>
                  <li className="text-muted-foreground">Bug reports and technical issues</li>
                  <li className="text-muted-foreground">Community discussions about Necromunda</li>
                  <li className="text-muted-foreground">Updates and announcements</li>
                </ul>
                <a
                  href="https://discord.gg/ZWXXqd5NUt"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-primary hover:text-red-800 transition-colors font-medium"
                >
                  <FaDiscord className="h-5 w-5" />
                  Join our Discord Server
                </a>
              </section>

              <section id="social-media" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">Social Media</h2>
                <p className="text-muted-foreground mb-4">
                  Follow us on social media to stay updated with the latest news, features, and community highlights:
                </p>
                <div className="flex flex-wrap gap-4">
                  <a
                    href="https://www.instagram.com/mundamanager"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-primary hover:text-red-800 transition-colors"
                  >
                    <FaInstagram className="h-5 w-5" />
                    Instagram
                  </a>
                  <a
                    href="https://www.patreon.com/c/mundamanager"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-primary hover:text-red-800 transition-colors"
                  >
                    <FaPatreon className="h-5 w-5" />
                    Patreon
                  </a>
                  <a
                    href="https://github.com/joeseos/mundamanager"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-primary hover:text-red-800 transition-colors"
                  >
                    <FaGithub className="h-5 w-5" />
                    GitHub
                  </a>
                </div>
              </section>

              <section id="support" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">Support & Help</h2>
                <p className="text-muted-foreground mb-2">
                  For technical support, bug reports, or feature requests:
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                  <li className="text-muted-foreground">Join our <a href="https://discord.gg/ZWXXqd5NUt" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-800">Discord server</a> and post in the support channel</li>
                  <li className="text-muted-foreground">Check out our <Link href="/user-guide" className="underline hover:text-red-800">User Guide</Link> for detailed instructions on using Munda Manager</li>
                </ul>
              </section>

              <section id="feedback" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">Feedback & Suggestions</h2>
                <p className="text-muted-foreground mb-2">
                  Your feedback is invaluable to us! We're always looking to improve Munda Manager based on community input. Share your ideas:
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                  <li className="text-muted-foreground">Post feature requests in our <a href="https://discord.gg/ZWXXqd5NUt" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-800">Discord server</a></li>
                  <li className="text-muted-foreground">Share your thoughts on our social media channels</li>
                </ul>
              </section>

              <section id="contributing" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">Contributing</h2>
                <p className="text-muted-foreground mb-2">
                  Munda Manager is a community-driven project! If you're interested in contributing:
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                  <li className="text-muted-foreground">Check out our <Link href="/join-the-team" className="underline hover:text-red-800">Join the Team</Link> page for more information</li>
                  <li className="text-muted-foreground">Visit our <a href="https://github.com/joeseos/mundamanager" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-800">GitHub repository</a> to get familiar with the codebase</li>
                  <li className="text-muted-foreground">Join our <a href="https://discord.gg/ZWXXqd5NUt" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-800">Discord server</a> to discuss contribution opportunities</li>
                </ul>
              </section>

              <section id="response-time" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">Response Time</h2>
                <p className="text-muted-foreground mb-2">
                  We're a volunteer-driven community project with an international team and community scattered around the world, which means we're usually available 24/7. Response times may vary but we'll reply as quickly as possible in our Discord server, typically within a few hours to a day. For urgent issues, please mention it in your message.
                </p>
              </section>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

