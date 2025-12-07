import Link from 'next/link';
import { Metadata } from 'next';
import Script from 'next/script';
import { Badge } from '@/components/ui/badge';
import { TbDiamondFilled } from 'react-icons/tb';
import { getPatreonTierConfig } from '@/utils/patreon';
import { PatreonSupporterIcon } from '@/components/ui/patreon-supporter-icon';
import { createClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';

const defaultUrl = process.env.NODE_ENV === 'development'
  ? "http://localhost:3000"
  : "https://www.mundamanager.com";

const PAGE_TITLE = 'Contributors - Munda Manager';
const PAGE_DESCRIPTION = 'Meet the contributors behind Munda Manager. Discover who helps make this community tool possible.';
const PAGE_DESCRIPTION_SHORT = 'Meet the contributors behind Munda Manager. Discover developers, content creators, community members, and backers who help make this community tool possible.';
const PAGE_KEYWORDS = 'Munda Manager contributors, developers, content creators, backers, team, community';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  keywords: PAGE_KEYWORDS,
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION_SHORT,
    url: `${defaultUrl}/contributors`,
    type: 'article',
    siteName: 'Munda Manager',
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION_SHORT,
  },
  alternates: {
    canonical: `${defaultUrl}/contributors`,
  },
};

type PatreonSupporter = {
  username: string;
  patreon_tier_id: string;
  patreon_tier_title?: string;
};

export default async function ContributorsPage() {
  // Fetch Patreon supporters with cache tag
  const getCachedPatreonSupporters = unstable_cache(
    async () => {
      // Use anon key for static generation (RLS controls access)
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      
      const { data: patreonSupporters } = await supabase
        .from('profiles')
        .select('username, patreon_tier_id, patreon_tier_title')
        .not('patreon_tier_id', 'is', null)
        .eq('patron_status', 'active_patron')
        .order('patreon_tier_id', { ascending: false })
        .order('username', { ascending: true });
      
      return patreonSupporters;
    },
    ['global-patreon-supporters'],
    {
      tags: [CACHE_TAGS.GLOBAL_PATREON_SUPPORTERS()]
    }
  );

  const patreonSupporters: PatreonSupporter[] = await getCachedPatreonSupporters() || [];
  const tierConfig = getPatreonTierConfig();

  // Contributor data
  type Contributor = {
    name: string;
    link?: string;
  };

  const coreTeam: Contributor[] = [
    { name: "joesoes" },
    { name: "Djidiouf", link: "https://www.ashenquarter.com" },
    { name: "Tizdale" },
  ];

  const ongoingContributors: Contributor[] = [
    { name: "YukiTheSnowFox" },
    { name: "T_H_E_S_E_U_S" },
    { name: "Professor Bleep Bloop" },
    { name: "HiveScum Wonka" },
  ];

  const pastContributors: Contributor[] = [
    { name: "LeperColony" },
    { name: "Steady" },
    { name: "GenFailure" },
    { name: "Pyriand" },
    { name: "HochuChaya" },
    { name: "TheJosh" },
  ];

  const contentCreators: Contributor[] = [
    //{ name: "Rokksville", link: "https://www.instagram.com/rokksville" },
    //{ name: "Wellywood", link: "https://www.youtube.com/@wellywoodwargaming" },
    //{ name: "MiniWarGaming", link: "https://www.youtube.com/miniwargaming" },
  ];

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
      "@id": `${defaultUrl}/contributors`
    },
    "articleSection": "Community",
    "keywords": PAGE_KEYWORDS
  };

  return (
    <>
      <Script
        id="contributors-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData),
        }}
      />
      <main className="flex min-h-screen flex-col items-center">
        <div className="container ml-[10px] mr-[10px] max-w-4xl w-full space-y-4">
          <div className="bg-card shadow-md rounded-lg p-4">
            <h1 className="text-2xl md:text-2xl font-bold mb-4">
              Contributors
            </h1>
            
            <div className="mb-8">
              <p className="text-muted-foreground mb-2">
                Munda Manager is made possible by a dedicated community of developers, designers, content creators, backers, and passionate Necromunda players. This page recognises those who contribute to the project.
              </p>
            </div>

            <div className="space-y-6">
              <section id="core-team" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">Core Team</h2>
                <p className="text-muted-foreground mb-2">
                  The core team members who lead development and maintain Munda Manager:
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2 mb-4">
                  <li className="text-muted-foreground">Project maintenance and leadership</li>
                  <li className="text-muted-foreground">Technical architecture and decision-making</li>
                  <li className="text-muted-foreground">Community management and coordination</li>
                </ul>
                <div className="flex flex-wrap gap-2 mb-4">
                  {coreTeam.map((member, index) => (
                    member.link ? (
                      <a
                        key={index}
                        href={member.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:opacity-80 transition-opacity"
                      >
                        <Badge variant="outline">{member.name}</Badge>
                      </a>
                    ) : (
                      <Badge key={index} variant="outline">{member.name}</Badge>
                    )
                  ))}
                </div>
              </section>

              <section id="contributors" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">Team Members</h2>
                <p className="text-muted-foreground mb-2">
                  Munda Manager would not be what it is today without our fantastic team members who keep the project moving forward through work such as:
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2 mb-4">
                  <li className="text-muted-foreground">Code contributions and bug fixes</li>
                  <li className="text-muted-foreground">Feature implementations</li>
                  <li className="text-muted-foreground">Documentation improvements</li>
                  <li className="text-muted-foreground">Design and UX enhancements</li>
                  <li className="text-muted-foreground">Testing and quality assurance</li>
                  <li className="text-muted-foreground">Community support and help</li>
                </ul>
                
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-foreground mb-2">Ongoing Contributors</h3>
                  <div className="flex flex-wrap gap-2">
                    {ongoingContributors.map((contributor, index) => (
                      contributor.link ? (
                        <a
                          key={index}
                          href={contributor.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:opacity-80 transition-opacity"
                        >
                          <Badge variant="outline">{contributor.name}</Badge>
                        </a>
                      ) : (
                        <Badge key={index} variant="outline">{contributor.name}</Badge>
                      )
                    ))}
                  </div>
                </div>

                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-foreground mb-2">Past Contributors</h3>
                  <div className="flex flex-wrap gap-2">
                    {pastContributors.map((contributor, index) => (
                      contributor.link ? (
                        <a
                          key={index}
                          href={contributor.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:opacity-80 transition-opacity"
                        >
                          <Badge variant="outline">{contributor.name}</Badge>
                        </a>
                      ) : (
                        <Badge key={index} variant="outline">{contributor.name}</Badge>
                      )
                    ))}
                  </div>
                </div>

                <p className="text-muted-foreground mb-2 mt-4">
                  Learn more about contributing on our <Link href="/join-the-team" className="underline hover:text-red-800">Join the Team</Link> page.
                </p>
              </section>

              <section id="community" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">Patreon Supporters</h2>
                <p className="text-muted-foreground mb-2">
                  Special thanks to our amazing Patreon supporters who help keep Munda Manager running!
                </p>
                <p className="text-muted-foreground mb-2">
                  <a href="https://www.patreon.com/c/mundamanager" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-800">Support us on Patreon</a> to join them.
                </p>
                {patreonSupporters.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    {tierConfig.map((tier) => {
                      const tierSupporters = patreonSupporters.filter(supporter => supporter.patreon_tier_id === tier.id);
                      return (
                        <div key={tier.id} className="space-y-2">
                          <h3 className="font-semibold text-lg flex items-center gap-2">
                            <TbDiamondFilled size={20} color={tier.color} />
                            {tier.name}
                          </h3>
                          <div className="flex flex-wrap gap-1">
                            {tierSupporters.length === 0 ? (
                              <p className="text-muted-foreground text-sm italic">No supporters yet</p>
                            ) : (
                              tierSupporters.map((supporter, index) => (
                                <Badge key={index} variant="outline" className="flex items-center gap-1">
                                  <PatreonSupporterIcon
                                    patreonTierId={supporter.patreon_tier_id}
                                    patreonTierTitle={supporter.patreon_tier_title}
                                  />
                                  {supporter.username}
                                </Badge>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section id="content-creators" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">Content Creator Partners</h2>
                <p className="text-muted-foreground mb-2">
                  We partner with content creators to bring Munda Manager to the Necromunda community. Our partners help spread the word and create valuable resources featuring Munda Manager:
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2 mb-4">
                  <li className="text-muted-foreground">Tutorial videos and guides</li>
                  <li className="text-muted-foreground">Battle reports</li>
                  <li className="text-muted-foreground">Blog posts and articles</li>
                  <li className="text-muted-foreground">Social media content and promotion</li>
                </ul>
                <div className="flex flex-wrap gap-2 mb-4">
                  {contentCreators.map((creator, index) => (
                    creator.link ? (
                      <a
                        key={index}
                        href={creator.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:opacity-80 transition-opacity"
                      >
                        <Badge variant="outline">{creator.name}</Badge>
                      </a>
                    ) : (
                      <Badge key={index} variant="outline">{creator.name}</Badge>
                    )
                  ))}
                </div>
                <p className="text-muted-foreground mb-2 mt-4">
                  Interested in partnering with us? We'd love to collaborate! <Link href="/contact" className="underline hover:text-red-800">Contact us</Link> to discuss partnership opportunities.
                </p>
              </section>

              <section id="acknowledgments" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">Special Acknowledgements</h2>
                <p className="text-muted-foreground mb-2">
                  Munda Manager is built on the foundation of the Necromunda community and various open-source projects. We'd like to acknowledge:
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                  <li className="text-muted-foreground">The entire Necromunda community for their passion and support</li>
                  <li className="text-muted-foreground">Games Workshop for creating the Necromunda game system</li>
                  <li className="text-muted-foreground">Open-source libraries and frameworks that power Munda Manager</li>
                  <li className="text-muted-foreground">Early adopters and beta testers who provided crucial feedback</li>
                </ul>
              </section>

              <section id="contact" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">Get in Touch</h2>
                <p className="text-muted-foreground mb-2">
                  If you have questions about contributing, please <Link href="/contact" className="underline hover:text-red-800">contact us</Link> or join our <a href="https://discord.gg/ZWXXqd5NUt" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-800">Discord server</a>.
                </p>
              </section>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

