import Link from 'next/link';
import { Metadata } from 'next';
import Script from 'next/script';
import { FaRegCopy } from 'react-icons/fa';
import { LuLogs } from 'react-icons/lu';
import { FiCamera, FiShare2, FiPrinter, FiMenu } from 'react-icons/fi';

const defaultUrl = process.env.NODE_ENV === 'development'
  ? "http://localhost:3000"
  : "https://www.mundamanager.com";

// SEO constants - edit these to update all metadata
const PAGE_TITLE = 'User Guide - How to Use Munda Manager';
const PAGE_DESCRIPTION = 'Complete user guide for Munda Manager. Learn how to create gangs, manage fighters, run campaigns, use custom assets, and explore advanced features like Chem-Alchemy and Gene-Smithing for Necromunda.';
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

export default function UserGuidePage() {
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
      <div className="container ml-[10px] mr-[10px] max-w-4xl w-full space-y-4">
        <div className="bg-card shadow-md rounded-lg p-4">
          <h1 className="text-2xl md:text-2xl font-bold mb-4">
            User Guide: How to Use Munda Manager
          </h1>
          
          <div className="mb-8">
            <p className="text-muted-foreground mb-2">
              Welcome to the Munda Manager user guide! This comprehensive guide will help you make the most of all the features available in Munda Manager. Whether you're creating your first gang, managing a campaign, or exploring advanced mechanics, you'll find detailed instructions and helpful tips below.
            </p>
          </div>

          {/* Table of contents */}
          <div className="mb-12">
            <h2 className="text-xl font-semibold text-foreground mb-2">Contents</h2>
            <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
              <li><a href="#installing-as-an-app" className="underline hover:text-red-800">Installing the Mobile App</a></li>
              <li>
                <a href="#gangs" className="underline hover:text-red-800">Gangs</a>
                <ul className="list-disc marker:text-red-800 pl-6 mt-2 space-y-1">
                  <li><a href="#gang-card-presentation" className="underline hover:text-red-800">Gang Card Presentation</a></li>
                  <li><a href="#reorder-fighter-cards" className="underline hover:text-red-800">Reorder Fighter Cards</a></li>
                  <li><a href="#gang-notes" className="underline hover:text-red-800">Gang Notes</a></li>
                  <li><a href="#house-escher-chem-alchemy" className="underline hover:text-red-800">House Escher: Chem-Alchemy</a></li>
                  <li><a href="#house-goliath-gene-smithing" className="underline hover:text-red-800">House Goliath: Gene-Smithing</a></li>
                  <li><a href="#spyre-hunting-party-spyres-rig-upgrades" className="underline hover:text-red-800">Spyre Hunting Party: Spyres Rig Upgrades</a></li>
                  <li><a href="#venator-gang-legacy-outcast-gang-affiliation" className="underline hover:text-red-800">Venator: Gang Legacy & Outcast Gang Affiliation</a></li>
                  <li><a href="#outcast-elevating-a-fighter-to-leader" className="underline hover:text-red-800">Outcast: Elevating a fighter to Leader</a></li>
                  <li><a href="#palanite-enforcers-selecting-a-prefecture" className="underline hover:text-red-800">Palanite Enforcers: Selecting a Prefecture</a></li>
                  <li><a href="#wasteland-crusading-corrupted-or-infested-gangs" className="underline hover:text-red-800">Wasteland, Crusading, Corrupted or Infested gangs</a></li>
                </ul>
              </li>
              <li>
                <a href="#fighters" className="underline hover:text-red-800">Fighters</a>
                <ul className="list-disc marker:text-red-800 pl-6 mt-2 space-y-1">
                  <li><a href="#promotion-to-specialist" className="underline hover:text-red-800">Promotion to Specialist</a></li>
                </ul>
              </li>
              <li>
                <a href="#campaigns" className="underline hover:text-red-800">Campaigns</a>
                <ul className="list-disc marker:text-red-800 pl-6 mt-2 space-y-1">
                  <li><a href="#add-a-new-gang-player-to-a-campaign" className="underline hover:text-red-800">Add a new Gang/Player to a campaign</a></li>
                </ul>
              </li>
              <li>
                <a href="#custom-assets" className="underline hover:text-red-800">Custom Assets</a>
                <ul className="list-disc marker:text-red-800 pl-6 mt-2 space-y-1">
                  <li><a href="#custom-equipment" className="underline hover:text-red-800">Custom Equipment</a></li>
                  <li><a href="#custom-fighters" className="underline hover:text-red-800">Custom Fighters</a></li>
                </ul>
              </li>
            </ul>
          </div>

          {/* Main content */}
          <div className="space-y-6">
            <section id="installing-as-an-app" className="scroll-mt-24">
              <h2 className="text-2xl font-semibold text-foreground mb-1">Installing the Mobile App</h2>
              <p className="text-muted-foreground mb-2">
              On many types of phones you have this option in the website's hamburger menu <FiMenu className="inline h-4 w-4 mx-1 text-foreground" /> located at the top right of the page. Using it will set up a website with embedded access which behaves just like an App on your phone.
              </p>
              <div className="my-4 flex justify-center">
                <img
                  src="https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/user-guide/add-app-to-home-screen.webp"
                  alt="Screenshot showing how to add Munda Manager to home screen on mobile device using the browser hamburger menu"
                  className="rounded-lg"
                  style={{ maxWidth: '100%', height: 'auto' }}
                />
              </div>
            </section>

            <section id="gangs" className="scroll-mt-24">
              <h2 className="text-2xl font-semibold text-foreground mb-1">Gangs</h2>

              <h3 id="gang-card-presentation" className="text-lg font-semibold text-foreground mt-6 mb-1 scroll-mt-24">Gang Card Presentation</h3>
                <div className="my-4 flex justify-center">
                  <img
                    src="https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/user-guide/gang-card-presentation.webp"
                    alt="Munda Manager gang card interface showing view options, edit button, feature icons (clone, logs, capture, share, print), gang image, and gang addition options"
                    className="rounded-lg"
                    style={{ maxWidth: '100%', height: 'auto' }}
                  />
                </div>
                <ol className="list-decimal pl-6 space-y-2 mt-4 marker:text-red-800">
                  <li className="text-muted-foreground"><strong className="text-foreground">View:</strong> You can change how Fighter cards are displayed by changing the View. This allows you to have a grid of fighter cards and display more fighters on a bigger screen.</li>
                  <li className="text-muted-foreground"><strong className="text-foreground">Edit Button:</strong> This is where you can edit the different settings of your gang: Name, Resources, Alliance etc.</li>
                  <li className="text-muted-foreground"><strong className="text-foreground">Feature Icons:</strong> In order, <span className="inline-flex items-center gap-1"><FaRegCopy className="w-4 h-4" /> Copy Gang</span>, <span className="inline-flex items-center gap-1"><LuLogs className="w-4 h-4" /> Show Logs</span>, <span className="inline-flex items-center gap-1"><FiCamera className="w-4 h-4" /> Take Screenshot</span>, <span className="inline-flex items-center gap-1"><FiShare2 className="w-4 h-4" /> Share Gang</span>, <span className="inline-flex items-center gap-1"><FiPrinter className="w-4 h-4" /> Print Options</span>.</li>
                  <li className="text-muted-foreground"><strong className="text-foreground">Gang Image:</strong> You can change your gang image by clicking on it.</li>
                  <li className="text-muted-foreground"><strong className="text-foreground">Gang Additions:</strong> This is where you can add Hangers-on, Brutes and Hired Guns.</li>
                </ol>

              <h3 id="reorder-fighter-cards" className="text-lg font-semibold text-foreground mt-6 mb-1 scroll-mt-24">Reorder Fighter Cards</h3>
                <div className="my-4 flex justify-center">
                  <img
                    src="https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/user-guide/reorder-fighter-cards.webp"
                    alt="Demonstration of drag and drop functionality to reorder fighter cards in Munda Manager gang view"
                    className="rounded-lg"
                    style={{ maxWidth: '100%', height: 'auto' }}
                  />
                </div>
                <p className="text-muted-foreground mb-2">
                  In the gang view, you can drag and drop fighter cards to reorder them by long click or long touch. If it doesn't drag, you haven't pressed long enough!
                </p>

              <h3 id="gang-notes" className="text-lg font-semibold text-foreground mt-6 mb-1 scroll-mt-24">Gang Notes</h3>
                <p className="text-muted-foreground mb-2">
                  You've got access to a rich text editor to manage your gang notes on the Notes tab.
                </p>
                <div className="my-4 flex justify-center">
                  <img
                    src="https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/user-guide/gang-notes.webp"
                    alt="Rich text editor interface for managing gang notes and background stories in Munda Manager"
                    className="rounded-lg"
                    style={{ maxWidth: '100%', height: 'auto' }}
                  />
                </div>
                <p className="text-muted-foreground mb-2">
                  This also provides a space to write down your elaborate gang background story!
                </p>

              <h3 id="house-escher-chem-alchemy" className="text-lg font-semibold text-foreground mt-6 mb-1 scroll-mt-24">House Escher: Chem-Alchemy</h3>
                <p className="text-muted-foreground mb-2">
                  For Escher gangs, Munda Manager supports Chem-Alchemy. You can create custom chems in the Stash and click on the Chem-Alchemy button.
                </p>
                <div className="my-4 flex justify-center">
                  <img
                    src="https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/user-guide/chem-alchemy.webp"
                    alt="House Escher Chem-Alchemy feature in Munda Manager showing custom chem creation and management interface"
                    className="rounded-lg"
                    style={{ maxWidth: '100%', height: 'auto' }}
                  />
                </div>

              <h3 id="house-goliath-gene-smithing" className="text-lg font-semibold text-foreground mt-6 mb-1 scroll-mt-24">House Goliath: Gene-Smithing</h3>
                <p className="text-muted-foreground mb-2">
                  For Goliath gangs, Gene-Smithing is available as Equipment in the Fighter's equipment list. Beware that Munda Manager does not limit your selections and you are expected to familiarize yourself with their selection rules.
                </p>

              <h3 id="spyre-hunting-party-spyres-rig-upgrades" className="text-lg font-semibold text-foreground mt-6 mb-1 scroll-mt-24">Spyre Hunting Party: Spyres Rig Upgrades</h3>
                <p className="text-muted-foreground mb-2">
                  For Spyrer gangs, Rig upgrades are treated as equipment as well. Their rig prices reflect the <strong className="text-foreground">+20</strong> Cost increase incorrect when rolling on the power-table. You can simply discard the previous Tier and add the higher tier for 0 cost, but leave the base rating enabled.
                </p>

              <h3 id="venator-gang-legacy-outcast-gang-affiliation" className="text-lg font-semibold text-foreground mt-6 mb-1 scroll-mt-24">Venator: Gang Legacy & Outcast Gang Affiliation</h3>
                <p className="text-muted-foreground mb-2">
                  Venators fighters can have their Gang Legacy set up in the <strong className="text-foreground">Edit Fighter</strong> window.
                </p>
                <p className="text-muted-foreground mb-2">
                  For Outcast, this is a setting that is determined for the whole gang, hence, it's available in the <strong className="text-foreground">Edit Gang</strong> window.
                </p>
                <p className="text-muted-foreground mb-2">
                  During creation you're allowed to purchase Weapons and Wargear from your Gang legacy. You can enable the visibility by enabling the switch on the right as below.
                </p>
                <div className="my-4 flex justify-center">
                  <img
                    src="https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/user-guide/venator-gang-legacy.webp"
                    alt="Venator gang legacy settings interface showing how to enable visibility of legacy weapons and wargear during gang creation"
                    className="rounded-lg"
                    style={{ maxWidth: '100%', height: 'auto' }}
                  />
                </div>

              <h3 id="outcast-elevating-a-fighter-to-leader" className="text-lg font-semibold text-foreground mt-6 mb-1 scroll-mt-24">Outcast: Elevating a fighter to Leader</h3>
                <p className="text-muted-foreground mb-2">
                  This feature is not yet available. For now, you can create an Outcast gang and then, use the Add Gang Addition button on the Gang page, to add the profile of a fighter you want. Later on, we plan on making a dedicated feature for it.
                </p>

              <h3 id="palanite-enforcers-selecting-a-prefecture" className="text-lg font-semibold text-foreground mt-6 mb-1 scroll-mt-24">Palanite Enforcers: Selecting a Prefecture</h3>
                <p className="text-muted-foreground mb-2">
                  The Prefecture can be selected either during Gang Creation or after Creation via the Edit Gang option. Selecting any of them will extend the options as they're detailed in the books.
                </p>

              <h3 id="wasteland-crusading-corrupted-or-infested-gangs" className="text-lg font-semibold text-foreground mt-6 mb-1 scroll-mt-24">Wasteland, Crusading, Corrupted or Infested gangs</h3>
                <div className="my-4 flex justify-center">
                  <img
                    src="https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/user-guide/gang-variants.webp"
                    alt="Gang variants selection interface in Munda Manager showing options for Wasteland, Crusading, Corrupted, and Infested gang types"
                    className="rounded-lg"
                    style={{ maxWidth: '100%', height: 'auto' }}
                  />
                </div>
                <p className="text-muted-foreground mb-2">
                  You can set the one or more gang variants of your gang by going into the <strong className="text-foreground">Edit Gang</strong> window if you forgot to do it on Gang Creation. At the bottom of it, you'll see the different variants available. Some Gang Variants unlock extra fighters in the Add Fighter menu. For example, Secundan Incursion adds Spyrers, while Corrupted and Infested gangs gain their own options.
                </p>
                <p className="text-muted-foreground mb-2">
                  This is also the spot where you can mark your gang as a Skirmish gang.
                </p>
            </section>

            <section id="fighters" className="scroll-mt-24">
              <h2 className="text-2xl font-semibold text-foreground mb-1">Fighters</h2>

              <h3 id="promotion-to-specialist" className="text-lg font-semibold text-foreground mt-6 mb-1 scroll-mt-24">Promotion to Specialist</h3>
                <div className="my-4 flex justify-center">
                  <img
                    src="https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/user-guide/promotion-to-specialist.webp"
                    alt="Fighter edit interface in Munda Manager showing how to change fighter class to Specialist"
                    className="rounded-lg"
                    style={{ maxWidth: '100%', height: 'auto' }}
                  />
                </div>
                <p className="text-muted-foreground mb-2">
                  You can promote fighters to a Specialist on the Fighter detailed view, then, click Edit at the top of the page and change their class to Specialist.
                </p>
            </section>

            <section id="campaigns" className="scroll-mt-24">
              <h2 className="text-2xl font-semibold text-foreground mb-1">Campaigns</h2>

              <h3 id="add-a-new-gang-player-to-a-campaign" className="text-lg font-semibold text-foreground mt-6 mb-1 scroll-mt-24">Add a new Gang/Player to a campaign</h3>
                <div className="my-4 flex justify-center">
                  <img
                    src="https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/user-guide/add-new-gang-player-to-a-campaign.webp"
                    alt="Campaign management interface showing how to add players and their gangs to a Necromunda campaign in Munda Manager"
                    className="rounded-lg"
                    style={{ maxWidth: '100%', height: 'auto' }}
                  />
                </div>
                <p className="text-muted-foreground mb-2">
                  To add a gang to a campaign, first add the gang owner as a player. You can then select from their available gangs. Repeat the process to add more gangs from the same player.
                </p>
            </section>

            <section id="custom-assets" className="scroll-mt-24">
              <h2 className="text-2xl font-semibold text-foreground mb-1">Custom Assets</h2>
              <p className="text-muted-foreground mb-2">
                You can create your own Equipment, Fighters and Territories in the Custom Assets tab available on the home page. More will be added in the future, like Skills, Skill sets and Trading Posts.
              </p>
              <div className="my-4 flex justify-center">
                <img
                  src="https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/user-guide/custom-assets.webp"
                  alt="Custom Assets tab interface in Munda Manager showing options to create custom equipment, fighters, and territories"
                  className="rounded-lg"
                  style={{ maxWidth: '100%', height: 'auto' }}
                />
              </div>

              <h3 id="custom-equipment" className="text-lg font-semibold text-foreground mt-6 mb-1 scroll-mt-24">Custom Equipment</h3>
                <p className="text-muted-foreground mb-2">
                  A specific mention is made for the more special weapons where the profiles only contain stats. In this case, leave your first profile blank apart from the Weapon name and create a Second, Third profile to contain the stats. (Also note the option to re-order them)
                </p>
                <p className="text-muted-foreground mb-2">For example this:</p>
                <div className="my-4 flex justify-center">
                  <img
                    src="https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/user-guide/custom-equipment.webp"
                    alt="Custom equipment creation form in Munda Manager showing how to set up weapon profiles with multiple stat profiles"
                    className="rounded-lg"
                    style={{ maxWidth: '100%', height: 'auto' }}
                  />
                </div>
                <p className="text-muted-foreground mb-2">Will result in:</p>
                <div className="my-4 flex justify-center">
                  <img
                    src="https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/user-guide/custom-equipment-weapon-table.webp"
                    alt="Resulting weapon table display showing custom equipment with multiple profiles in Munda Manager"
                    className="rounded-lg"
                    style={{ maxWidth: '100%', height: 'auto' }}
                  />
                </div>

              <h3 id="custom-fighters" className="text-lg font-semibold text-foreground mt-6 mb-1 scroll-mt-24">Custom Fighters</h3>
                <p className="text-muted-foreground mb-2">
                  Your other option is to make Custom Fighters. When completing their profile they can be shared to a Campaign by the Campaign Arbitrator or owner. Depending on your specific Gang Type selection your players will then be able to see these Custom Fighters by ticking this checkbox:
                </p>
                <div className="my-4 flex justify-center">
                  <img
                    src="https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/user-guide/custom-fighters.webp"
                    alt="Custom fighters checkbox option in campaign settings allowing players to use custom fighter types created by the arbitrator"
                    className="rounded-lg"
                    style={{ maxWidth: '100%', height: 'auto' }}
                  />
                </div>
            </section>
          </div>
        </div>
      </div>
    </main>
    </>
  );
}

