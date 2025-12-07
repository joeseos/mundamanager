import Link from 'next/link';
import { Metadata } from 'next';
import Script from 'next/script';

const defaultUrl = process.env.NODE_ENV === 'development'
  ? "http://localhost:3000"
  : "https://www.mundamanager.com";

const PAGE_TITLE = 'Join the Team - Munda Manager';
const PAGE_DESCRIPTION = 'Join the Munda Manager team! Learn how you can contribute to this community-driven Necromunda gang and campaign management tool.';
const PAGE_DESCRIPTION_SHORT = 'Join the Munda Manager team! Learn how you can contribute to this community-driven project.';
const PAGE_KEYWORDS = 'Munda Manager contributors, join team, contribute, open source, volunteer';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  keywords: PAGE_KEYWORDS,
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION_SHORT,
    url: `${defaultUrl}/join-the-team`,
    type: 'article',
    siteName: 'Munda Manager',
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION_SHORT,
  },
  alternates: {
    canonical: `${defaultUrl}/join-the-team`,
  },
};

export default function JoinTheTeamPage() {
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
      "@id": `${defaultUrl}/join-the-team`
    },
    "articleSection": "Community",
    "keywords": PAGE_KEYWORDS
  };

  return (
    <>
      <Script
        id="join-the-team-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData),
        }}
      />
      <main className="flex min-h-screen flex-col items-center">
        <div className="container ml-[10px] mr-[10px] max-w-4xl w-full space-y-4">
          <div className="bg-card shadow-md rounded-lg p-4">
            <h1 className="text-2xl md:text-2xl font-bold mb-4">
              Join the Team
            </h1>
            
            <div className="mb-8">
              <p className="text-muted-foreground mb-2">
                Munda Manager is a community-driven project, and we're always looking for passionate individuals to help make it even better! Whether you're a developer, designer, content creator, or just someone who loves Necromunda, there are many ways to contribute.
              </p>
              <p className="text-muted-foreground mb-2">
                We're looking for people who can take ownership, show initiative, and are keen to contribute! <strong className="text-foreground">Some of these tasks can be time-consuming and may need daily attention</strong>, so please keep that in mind. But if you're passionate about Necromunda and active online, you'll fit right in!
              </p>
            </div>

            <div className="space-y-6">
              <section id="why-contribute" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">Why Contribute?</h2>
                <p className="text-muted-foreground mb-2">
                  By contributing to Munda Manager, you're helping build a tool that serves the entire Necromunda community. Your contributions help:
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                  <li className="text-muted-foreground">Make gang and campaign management easier for players worldwide</li>
                  <li className="text-muted-foreground">Shape the future direction of the platform</li>
                  <li className="text-muted-foreground">Build your portfolio and gain experience with modern web technologies</li>
                  <li className="text-muted-foreground">Connect with other passionate Necromunda players and developers</li>
                  <li className="text-muted-foreground">Give back to the community that supports you</li>
                </ul>
              </section>

              <section id="ways-to-contribute" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">Ways to Contribute</h2>
                
                <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">Development</h3>
                <p className="text-muted-foreground mb-2">
                  Help us build and improve Munda Manager's features:
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                  <li className="text-muted-foreground">Fix bugs and improve existing features</li>
                  <li className="text-muted-foreground">Implement new features requested by the community</li>
                  <li className="text-muted-foreground">Improve code quality, performance, and accessibility</li>
                  <li className="text-muted-foreground">Write and improve tests</li>
                  <li className="text-muted-foreground">Review pull requests from other contributors</li>
                </ul>
                <p className="text-muted-foreground mb-2 mt-4">
                  Our tech stack includes Next.js, React, TypeScript, Supabase, and Tailwind CSS. Check out our <a href="https://github.com/joeseos/mundamanager" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-800">GitHub repository</a> to get started.
                </p>

                <h3 className="text-lg font-semibold text-foreground mt-6 mb-2">Design & UX</h3>
                <p className="text-muted-foreground mb-2">
                  Help improve the user experience and visual design:
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                  <li className="text-muted-foreground">Design new features and interfaces</li>
                  <li className="text-muted-foreground">Improve usability and accessibility</li>
                  <li className="text-muted-foreground">Create mockups and prototypes</li>
                  <li className="text-muted-foreground">Provide feedback on existing designs</li>
                </ul>

                <h3 className="text-lg font-semibold text-foreground mt-6 mb-2">Documentation</h3>
                <p className="text-muted-foreground mb-2">
                  Help users understand and use Munda Manager better:
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                  <li className="text-muted-foreground">Update and improve the <Link href="/user-guide" className="underline hover:text-red-800">User Guide</Link></li>
                  <li className="text-muted-foreground">Write code documentation and comments</li>
                  <li className="text-muted-foreground">Create tutorials and guides</li>
                  <li className="text-muted-foreground">Help answer questions in Discord</li>
                </ul>

                <h3 className="text-lg font-semibold text-foreground mt-6 mb-2">Testing & Quality Assurance</h3>
                <p className="text-muted-foreground mb-2">
                  Help ensure Munda Manager works well for everyone:
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                  <li className="text-muted-foreground">Test new features and report bugs</li>
                  <li className="text-muted-foreground">Test on different devices and browsers</li>
                  <li className="text-muted-foreground">Verify game rules accuracy</li>
                  <li className="text-muted-foreground">Provide feedback on new features</li>
                </ul>

                <h3 className="text-lg font-semibold text-foreground mt-6 mb-2">Community & Support</h3>
                <p className="text-muted-foreground mb-2">
                  Help build and support the community:
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                  <li className="text-muted-foreground">Help other users in Discord</li>
                  <li className="text-muted-foreground">Share Munda Manager with others</li>
                  <li className="text-muted-foreground">Organise community events or campaigns</li>
                  <li className="text-muted-foreground">Create content showcasing Munda Manager</li>
                </ul>
              </section>

              <section id="getting-started" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">Getting Started</h2>
                <p className="text-muted-foreground mb-4">
                  Ready to contribute? Here's how to get started:
                </p>
                <ol className="list-decimal pl-6 space-y-2 marker:text-red-800 mb-4">
                  <li className="text-muted-foreground">Fill out our <a href="https://forms.gle/rkkqyqLEdfV6ZTSc7" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-800">application form</a> to tell us what you're interested in helping with</li>
                  <li className="text-muted-foreground">Join our <a href="https://discord.gg/ZWXXqd5NUt" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-800">Discord server</a> and introduce yourself</li>
                  <li className="text-muted-foreground">For developers, check out our <a href="https://github.com/joeseos/mundamanager" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-800">GitHub repository</a> and read the README</li>
                </ol>
              </section>

              <section id="code-of-conduct" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">Code of Conduct</h2>
                <p className="text-muted-foreground mb-2">
                  We're committed to providing a <strong className="text-foreground">welcoming and inclusive</strong> environment for all. We expect all contributors to:
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                  <li className="text-muted-foreground">Be respectful and considerate of others</li>
                  <li className="text-muted-foreground">Welcome newcomers and help them get started</li>
                  <li className="text-muted-foreground">Focus on constructive feedback and collaboration</li>
                  <li className="text-muted-foreground">Respect different viewpoints and experiences</li>
                  <li className="text-muted-foreground">Show empathy towards other community members</li>
                </ul>
              </section>

              <section id="recognition" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">Recognition</h2>
                <p className="text-muted-foreground mb-2">
                  We value all contributions, big and small! Contributors are recognised in:
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                  <li className="text-muted-foreground">GitHub contributor list</li>
                  <li className="text-muted-foreground">Release notes for significant contributions</li>
                  <li className="text-muted-foreground">Our <Link href="/contributors" className="underline hover:text-red-800">Contributors page</Link> for content creators</li>
                  <li className="text-muted-foreground">Community acknowledgements in Discord</li>
                </ul>
              </section>

              <section id="questions" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">Questions?</h2>
                <p className="text-muted-foreground mb-2">
                  If you have questions about contributing, feel free to:
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                  <li className="text-muted-foreground">Ask in our <a href="https://discord.gg/ZWXXqd5NUt" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-800">Discord server</a></li>
                  <li className="text-muted-foreground">Contact us through our <Link href="/contact" className="underline hover:text-red-800">Contact page</Link></li>
                </ul>
              </section>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

