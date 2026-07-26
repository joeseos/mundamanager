import Link from 'next/link';
import { Metadata } from 'next';
import Script from 'next/script';

const defaultUrl = process.env.NODE_ENV === 'development'
  ? "http://localhost:3000"
  : "https://www.mundamanager.com";

// Update this by hand whenever the policy text changes. It is the date users
// are told the policy last changed, so it must not float with the current date.
const LAST_UPDATED = '2026-07-26';

const PRIVACY_EMAIL = 'mundamanager@proton.me';

const PAGE_TITLE = 'Privacy Policy - Munda Manager';
const PAGE_DESCRIPTION = 'Privacy Policy for Munda Manager. What personal data we collect, why we process it, who we share it with, and the rights you have under the GDPR.';
const PAGE_DESCRIPTION_SHORT = 'What personal data Munda Manager collects, why, and the rights you have over it.';
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
    "dateModified": LAST_UPDATED,
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
                Last updated: {LAST_UPDATED}
              </p>
              <p className="text-muted-foreground mb-2">
                Munda Manager is a free, community-run tool for managing Necromunda gangs and campaigns. To give you an account and keep your gangs where you left them, we have to store some information about you. This policy sets out exactly what that is, why we hold it, who else gets to see it, and what you can make us do about it.
              </p>
              <p className="text-muted-foreground mb-2">
                It is written to meet the requirements of the EU General Data Protection Regulation (GDPR) and the UK GDPR. We apply the same standard to everyone who uses the Service, wherever you happen to live.
              </p>
            </div>

            <div className="space-y-6">
              <section id="who-we-are" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">1. Who We Are</h2>
                <p className="text-muted-foreground mb-2">
                  Munda Manager is operated by the Munda Manager Team (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;), a volunteer group of hobbyists. We are the data controller for the personal data described in this policy, which means we decide what is collected and what happens to it.
                </p>
                <p className="text-muted-foreground mb-2">
                  For anything to do with privacy or your data, email us at <a href={`mailto:${PRIVACY_EMAIL}`} className="underline hover:text-red-800">{PRIVACY_EMAIL}</a>. That address is the fastest route for the requests described in section 8, and it is the one we monitor for them. You can also reach us through our <Link href="/contact" className="underline hover:text-red-800">Contact page</Link> or our <a href="https://discord.gg/ZWXXqd5NUt" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-800">Discord server</a> for general questions.
                </p>
              </section>

              <section id="information-we-collect" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">2. What We Collect</h2>

                <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">2.1 Account information</h3>
                <p className="text-muted-foreground mb-2">
                  When you register we collect:
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                  <li className="text-muted-foreground">Your email address. We use it to verify your account, to let you reset a forgotten password, and to send the notifications described in section 2.4.</li>
                  <li className="text-muted-foreground">A username, which is shown to other users. It does not have to be your real name, and we would rather it was not.</li>
                  <li className="text-muted-foreground">Your password, which is salted and hashed by our authentication provider. It is never stored in a form we or anyone else can read, and we cannot recover it for you.</li>
                  <li className="text-muted-foreground">The dates your account was created and last updated.</li>
                </ul>
                <p className="text-muted-foreground mb-2 mt-2">
                  We do not ask for your real name, address, date of birth, or payment details, because the Service does not need them.
                </p>

                <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">2.2 Content you create</h3>
                <p className="text-muted-foreground mb-2">
                  Everything you build in the app is stored against your account: gangs, fighters, vehicles, equipment, campaigns, territories, battle logs, custom fighter types and equipment, and any notes you write. Most of this is game data rather than personal data, but it is linked to you, so it falls under this policy and under your rights in section 8.
                </p>

                <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">2.3 Images you upload</h3>
                <p className="text-muted-foreground mb-2">
                  Fighter portraits, gang images, campaign maps and images embedded in notes are stored in our file storage. Photographs of painted miniatures are the usual case, but if you upload a picture containing a person, that image is personal data too and we will delete it on request. Images uploaded but never saved to a gang or campaign are treated as drafts and deleted automatically about an hour later.
                </p>

                <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">2.4 Notifications and email preferences</h3>
                <p className="text-muted-foreground mb-2">
                  We store in-app notifications (campaign invites, gang invites, friend requests, campaign join requests) along with who sent them and who received them. These expire automatically after 30 days.
                </p>
                <p className="text-muted-foreground mb-2">
                  We also send some of these as emails, and we keep a delivery record for each one so we can tell whether it arrived and retry it if it failed. Your per-notification email preferences are stored against your account, and every email carries an unsubscribe link. We do not send marketing email, and there is no newsletter to be added to.
                </p>

                <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">2.5 Technical and log data</h3>
                <p className="text-muted-foreground mb-2">
                  Our hosting and database providers record standard server logs when you use the Service, which include your IP address, browser user agent, the pages or API endpoints you requested, and the time of the request. We use these to investigate errors, abuse and security incidents. When you sign in, Cloudflare Turnstile also processes your IP address and browser characteristics to check that you are not a bot.
                </p>
                <p className="text-muted-foreground mb-2">
                  We do not run any analytics, advertising or tracking software. There is no Google Analytics, no advertising pixel, no session recording, and no third-party script following you between sites. We could not tell you which pages are most popular, because we do not measure it.
                </p>

                <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">2.6 Patreon supporter status</h3>
                <p className="text-muted-foreground mb-2">
                  If you support us on Patreon, we periodically retrieve the list of current supporters from Patreon&apos;s API and match it against registered accounts by email address so we can show a supporter badge and unlock supporter features. From that we store your Patreon user ID, your patron status, and your tier. We do not receive or store your payment details at any point, and no payment ever passes through Munda Manager. If you would rather we did not link your Patreon account, email us and we will exclude you.
                </p>

                <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">2.7 Discord</h3>
                <p className="text-muted-foreground mb-2">
                  A campaign owner or arbitrator can connect a campaign to a Discord channel. If they do, we store the Discord server and channel ID against the campaign, and battle results from that campaign are posted into the channel automatically. What gets posted is game data such as gang names and battle outcomes. Connecting Discord is optional and off by default, but note that the decision belongs to whoever runs the campaign, not to each individual member.
                </p>
              </section>

              <section id="legal-basis" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">3. Why We Process It, and Our Legal Basis</h2>
                <p className="text-muted-foreground mb-2">
                  Under Article 6 of the GDPR we need a lawful basis for each thing we do with your data. Ours are:
                </p>
                <div className="overflow-x-auto mt-4 mb-2">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left font-semibold text-foreground py-2 pr-4 align-top">What we do</th>
                        <th className="text-left font-semibold text-foreground py-2 pr-4 align-top">Data used</th>
                        <th className="text-left font-semibold text-foreground py-2 align-top">Lawful basis</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border">
                        <td className="text-muted-foreground py-2 pr-4 align-top">Create your account, sign you in, let you reset your password</td>
                        <td className="text-muted-foreground py-2 pr-4 align-top">Email, username, password hash</td>
                        <td className="text-muted-foreground py-2 align-top">Performance of a contract, Art. 6(1)(b)</td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="text-muted-foreground py-2 pr-4 align-top">Store and display your gangs, fighters and campaigns</td>
                        <td className="text-muted-foreground py-2 pr-4 align-top">Content you create, images</td>
                        <td className="text-muted-foreground py-2 align-top">Performance of a contract, Art. 6(1)(b)</td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="text-muted-foreground py-2 pr-4 align-top">Invites, friend requests and the emails that go with them</td>
                        <td className="text-muted-foreground py-2 pr-4 align-top">Username, email, notification records</td>
                        <td className="text-muted-foreground py-2 align-top">Performance of a contract, Art. 6(1)(b). You can switch the emails off.</td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="text-muted-foreground py-2 pr-4 align-top">Keep the Service up, block bots and abuse, investigate faults</td>
                        <td className="text-muted-foreground py-2 pr-4 align-top">IP address, user agent, server logs</td>
                        <td className="text-muted-foreground py-2 align-top">Legitimate interests, Art. 6(1)(f): running a free service securely and stopping automated abuse</td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="text-muted-foreground py-2 pr-4 align-top">Recognise Patreon supporters</td>
                        <td className="text-muted-foreground py-2 pr-4 align-top">Email, Patreon ID and tier</td>
                        <td className="text-muted-foreground py-2 align-top">Legitimate interests, Art. 6(1)(f): giving supporters what they signed up for</td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="text-muted-foreground py-2 pr-4 align-top">Post campaign battle results to a connected Discord channel</td>
                        <td className="text-muted-foreground py-2 pr-4 align-top">Gang names, battle data</td>
                        <td className="text-muted-foreground py-2 align-top">Legitimate interests, Art. 6(1)(f): a feature campaign organisers ask for</td>
                      </tr>
                      <tr>
                        <td className="text-muted-foreground py-2 pr-4 align-top">Respond to legal requests and keep records where the law requires</td>
                        <td className="text-muted-foreground py-2 pr-4 align-top">Whatever is relevant</td>
                        <td className="text-muted-foreground py-2 align-top">Legal obligation, Art. 6(1)(c)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-muted-foreground mb-2 mt-4">
                  Where we rely on legitimate interests, we have weighed our interest against your privacy and concluded that the processing is limited, expected, and does not override your rights. You can object to any of it under section 8, and we will stop unless we have compelling grounds not to.
                </p>
                <p className="text-muted-foreground mb-2">
                  We do not ask you to consent to anything as a condition of using the Service, so there is no cookie banner to click through. See section 9 for why.
                </p>
              </section>

              <section id="data-sharing" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">4. Who We Share It With</h2>
                <p className="text-muted-foreground mb-2">
                  We do not sell your personal data, and we do not share it with advertisers or data brokers. We could not make money from it even if we wanted to, and we do not want to.
                </p>
                <p className="text-muted-foreground mb-2">
                  We do rely on a small number of service providers to run the Service. Each of them processes data on our instructions under a data processing agreement:
                </p>
                <div className="overflow-x-auto mt-4 mb-2">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left font-semibold text-foreground py-2 pr-4 align-top">Provider</th>
                        <th className="text-left font-semibold text-foreground py-2 pr-4 align-top">What they do for us</th>
                        <th className="text-left font-semibold text-foreground py-2 align-top">What they handle</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border">
                        <td className="text-muted-foreground py-2 pr-4 align-top">Supabase</td>
                        <td className="text-muted-foreground py-2 pr-4 align-top">Database, authentication and file storage</td>
                        <td className="text-muted-foreground py-2 align-top">Everything in section 2 except server logs</td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="text-muted-foreground py-2 pr-4 align-top">Vercel</td>
                        <td className="text-muted-foreground py-2 pr-4 align-top">Hosting and content delivery for the website</td>
                        <td className="text-muted-foreground py-2 align-top">Request logs, IP addresses</td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="text-muted-foreground py-2 pr-4 align-top">Amazon Web Services (SES)</td>
                        <td className="text-muted-foreground py-2 pr-4 align-top">Sending notification emails</td>
                        <td className="text-muted-foreground py-2 align-top">Your email address and the contents of those emails</td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="text-muted-foreground py-2 pr-4 align-top">Cloudflare</td>
                        <td className="text-muted-foreground py-2 pr-4 align-top">Turnstile bot protection on the sign-in form</td>
                        <td className="text-muted-foreground py-2 align-top">IP address and browser characteristics at sign-in</td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="text-muted-foreground py-2 pr-4 align-top">Patreon</td>
                        <td className="text-muted-foreground py-2 pr-4 align-top">Supporter status, if you are a supporter</td>
                        <td className="text-muted-foreground py-2 align-top">Supporter email, name and tier, sent to us by Patreon</td>
                      </tr>
                      <tr>
                        <td className="text-muted-foreground py-2 pr-4 align-top">Discord</td>
                        <td className="text-muted-foreground py-2 pr-4 align-top">Posting battle results, where a campaign has connected a channel</td>
                        <td className="text-muted-foreground py-2 align-top">Gang names and battle outcomes</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-muted-foreground mb-2 mt-4">
                  Beyond that, we will disclose data if we are legally required to, or where we need to in order to establish or defend a legal claim, or to protect someone&apos;s safety. If we are ever compelled to hand over your data we will tell you, unless we are legally barred from doing so.
                </p>
              </section>

              <section id="what-others-see" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">5. What Other Users Can See</h2>
                <p className="text-muted-foreground mb-2">
                  This part is worth reading carefully, because it is the most likely way your information reaches someone else.
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                  <li className="text-muted-foreground">Your username is visible to other members of any campaign you join, to anyone you send or accept a friend request from, and to any signed-in user who searches for it. Pick one you are comfortable being seen.</li>
                  <li className="text-muted-foreground">Gangs and campaigns you share are visible to the people you share them with, including the fighters, images and notes inside them.</li>
                  <li className="text-muted-foreground">Campaign data is available through a public API endpoint. Anyone who has a campaign&apos;s ID can retrieve that campaign&apos;s data as JSON or XML without signing in, and that data includes the usernames of the campaign&apos;s members. This is deliberate, so that people can build spreadsheets and companion tools, and it is described on our <Link href="/api-access" className="underline hover:text-red-800">API Access page</Link>. Campaign IDs are long random values and are not listed anywhere, but treat a campaign ID as shareable rather than secret.</li>
                  <li className="text-muted-foreground">Your email address is never shown to other users, never included in the API output, and never posted to Discord.</li>
                </ul>
              </section>

              <section id="where-stored" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">6. Where Your Data Is Stored</h2>
                <p className="text-muted-foreground mb-2">
                  Our database, authentication system and file storage are hosted in the United States (AWS region us-east-1, Northern Virginia). Notification emails are sent through Amazon SES in the same region. Our web hosting is provided by Vercel, whose network is global.
                </p>
                <p className="text-muted-foreground mb-2">
                  If you are in the European Economic Area or the United Kingdom, this means your personal data is transferred outside it. We rely on the following safeguards under Chapter V of the GDPR:
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                  <li className="text-muted-foreground">The European Commission&apos;s Standard Contractual Clauses, together with the UK International Data Transfer Addendum, which form part of our agreements with our providers.</li>
                  <li className="text-muted-foreground">The EU-US Data Privacy Framework, where the provider in question is certified under it.</li>
                </ul>
                <p className="text-muted-foreground mb-2 mt-4">
                  We should be straightforward about the limits of this. These safeguards are the standard mechanisms available, and they are what the law asks for, but they do not put US data entirely beyond the reach of US authorities. We think that risk is proportionate for a hobby project holding game data and email addresses. If you disagree, the honest answer is not to create an account, and if you already have one we will delete it on request.
                </p>
                <p className="text-muted-foreground mb-2">
                  Earlier versions of this policy said that by using the Service you consented to these transfers. That was the wrong way to describe it, and we have corrected it. Consent is not the basis we rely on for transfers, and withdrawing it would not have been a meaningful option while continuing to use the Service.
                </p>
              </section>

              <section id="data-retention" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">7. How Long We Keep It</h2>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                  <li className="text-muted-foreground"><strong className="text-foreground">Account and content:</strong> for as long as your account exists. We do not currently delete dormant accounts, on the basis that a campaign you left half-finished three years ago is probably still worth keeping.</li>
                  <li className="text-muted-foreground"><strong className="text-foreground">After you ask us to delete your account:</strong> within 30 days.</li>
                  <li className="text-muted-foreground"><strong className="text-foreground">Notifications:</strong> 30 days, then deleted automatically.</li>
                  <li className="text-muted-foreground"><strong className="text-foreground">Unsaved draft images:</strong> around one hour, then deleted automatically.</li>
                  <li className="text-muted-foreground"><strong className="text-foreground">Email delivery records:</strong> kept while we need them to diagnose delivery problems, then removed. They are not used for anything else.</li>
                  <li className="text-muted-foreground"><strong className="text-foreground">Server logs:</strong> retained by our hosting providers for their standard periods, typically a matter of days to a few weeks, and not copied anywhere by us.</li>
                </ul>
                <p className="text-muted-foreground mb-2 mt-4">
                  One thing to be aware of: content you contributed to a shared campaign may remain visible to that campaign after your account is gone, in the same way that a battle report someone else wrote does not disappear when you leave. Where that happens we detach it from your account rather than keep it linked to you. Tell us if you want something specific removed and we will deal with it.
                </p>
              </section>

              <section id="your-rights" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">8. Your Rights</h2>
                <p className="text-muted-foreground mb-2">
                  If you are in the EEA or the UK you have the rights below. We extend them to everyone who uses Munda Manager, regardless of where you are, because maintaining two standards would be more work than doing it properly once.
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                  <li className="text-muted-foreground"><strong className="text-foreground">Access:</strong> ask what we hold about you and get a copy of it.</li>
                  <li className="text-muted-foreground"><strong className="text-foreground">Rectification:</strong> have anything inaccurate corrected. Your username and email address can be changed yourself from the <Link href="/account" className="underline hover:text-red-800">Account page</Link>.</li>
                  <li className="text-muted-foreground"><strong className="text-foreground">Erasure:</strong> have your account and data deleted. There is no self-service delete button in the app yet, so email us and we will do it manually within 30 days.</li>
                  <li className="text-muted-foreground"><strong className="text-foreground">Portability:</strong> receive your data in a structured, machine-readable format. Campaign data is already available as JSON or XML from the API, and we will export the rest on request.</li>
                  <li className="text-muted-foreground"><strong className="text-foreground">Restriction:</strong> ask us to stop processing your data while a dispute about it is sorted out.</li>
                  <li className="text-muted-foreground"><strong className="text-foreground">Objection:</strong> object to any processing we base on legitimate interests, listed in the table in section 3.</li>
                  <li className="text-muted-foreground"><strong className="text-foreground">Withdraw consent:</strong> where we ever rely on consent, withdraw it at any time without affecting what was done beforehand.</li>
                </ul>
                <p className="text-muted-foreground mb-2 mt-4">
                  Email <a href={`mailto:${PRIVACY_EMAIL}`} className="underline hover:text-red-800">{PRIVACY_EMAIL}</a> from the address on your account and tell us what you want. We will respond within one month. If your request is unusually complicated we may take up to two further months, in which case we will tell you within the first month and explain why. There is no charge.
                </p>
                <p className="text-muted-foreground mb-2">
                  We may need to confirm you are who you say you are before we act, particularly for deletion or a request for a copy of your data. Being able to receive email at the account address is normally enough.
                </p>

                <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">8.1 Complaints</h3>
                <p className="text-muted-foreground mb-2">
                  If you think we have handled your data badly, please tell us first, since most problems are quicker to fix directly. You also have the right to complain to a data protection authority without going through us. In the EEA that is the supervisory authority in the country where you live, work, or where you believe the problem occurred; the full list is published by the <a href="https://www.edpb.europa.eu/about-edpb/about-edpb/members_en" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-800">European Data Protection Board</a>. In the UK it is the <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-800">Information Commissioner&apos;s Office</a>.
                </p>
              </section>

              <section id="cookies" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">9. Cookies and Local Storage</h2>
                <p className="text-muted-foreground mb-2">
                  We set cookies for one purpose: keeping you signed in. These are session and refresh tokens issued by our authentication provider. Block them and you will not be able to log in, but nothing else about the site depends on them.
                </p>
                <p className="text-muted-foreground mb-2">
                  We also use your browser&apos;s local storage to remember interface preferences, such as your light or dark theme and whether you last viewed a gang as a list or as cards. That data stays on your device, is never sent to us, and you can clear it from your browser settings whenever you like.
                </p>
                <p className="text-muted-foreground mb-2">
                  Cloudflare Turnstile may set a short-lived cookie on the sign-in page as part of its bot check.
                </p>
                <p className="text-muted-foreground mb-2">
                  There are no advertising cookies, no analytics cookies, and nothing that follows you to other sites. This is why you have not been asked to accept anything: under the ePrivacy rules, storage that is strictly necessary to provide a service you have asked for does not require consent, and we do not use any other kind.
                </p>
              </section>

              <section id="data-security" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">10. Security</h2>
                <p className="text-muted-foreground mb-2">
                  We take appropriate technical and organisational measures to protect your data, including:
                </p>
                <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                  <li className="text-muted-foreground">TLS encryption for all traffic to the site, and encryption at rest for the database and file storage.</li>
                  <li className="text-muted-foreground">Row-level security policies in the database, so that queries are constrained to the data your account is entitled to see rather than relying on the application to filter it.</li>
                  <li className="text-muted-foreground">Passwords stored only as salted hashes, handled by our authentication provider.</li>
                  <li className="text-muted-foreground">Bot protection on the sign-in form and rate limiting on sensitive endpoints.</li>
                  <li className="text-muted-foreground">Administrative access restricted to the small number of people who maintain the Service.</li>
                </ul>
                <p className="text-muted-foreground mb-2 mt-4">
                  We are a volunteer project, not a company with a security team, and it would be dishonest to imply otherwise. We build carefully and we take reports seriously, but no system is perfectly secure. Please do not store anything in Munda Manager that would genuinely harm you if it leaked. If you find a vulnerability, email us at <a href={`mailto:${PRIVACY_EMAIL}`} className="underline hover:text-red-800">{PRIVACY_EMAIL}</a> rather than posting it publicly, and we will fix it as quickly as we can.
                </p>
                <p className="text-muted-foreground mb-2">
                  If a breach occurs that is likely to put your rights at risk, we will report it to the relevant supervisory authority within 72 hours of becoming aware of it and tell you directly where the GDPR requires us to.
                </p>
              </section>

              <section id="automated-decisions" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">11. Automated Decision-Making</h2>
                <p className="text-muted-foreground mb-2">
                  We do not profile you and we do not make automated decisions that produce legal or similarly significant effects. The only automated check in the system is the bot test at sign-in, which decides whether a login attempt looks like a script. If it wrongly blocks you, contact us and a human will sort it out.
                </p>
              </section>

              <section id="children" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">12. Children</h2>
                <p className="text-muted-foreground mb-2">
                  Munda Manager is not intended for children under 16, and we do not knowingly collect data from them. Some EU member states set this threshold lower, at 13, in which case the local age applies. If you are a parent or guardian and believe your child has registered, email us and we will delete the account.
                </p>
              </section>

              <section id="changes" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">13. Changes to This Policy</h2>
                <p className="text-muted-foreground mb-2">
                  We will update this policy when what we do with your data changes. The date at the top always reflects the last substantive change. If a change materially affects you, for example if we started using a new category of data or a new provider, we will announce it on our Discord server and in the app rather than quietly editing the page.
                </p>
              </section>

              <section id="contact" className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-foreground mb-1">14. Contact</h2>
                <p className="text-muted-foreground mb-2">
                  Privacy questions and requests: <a href={`mailto:${PRIVACY_EMAIL}`} className="underline hover:text-red-800">{PRIVACY_EMAIL}</a>.
                </p>
                <p className="text-muted-foreground mb-2">
                  Anything else: our <Link href="/contact" className="underline hover:text-red-800">Contact page</Link> or our <a href="https://discord.gg/ZWXXqd5NUt" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-800">Discord server</a>.
                </p>
              </section>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
