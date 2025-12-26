import Link from 'next/link';
import Image from 'next/image';
import { Metadata } from 'next';
import Script from 'next/script';
import { LuExternalLink, LuShirt, LuCoffee, LuSmartphone, LuSkull } from "react-icons/lu";
import { Button } from "@/components/ui/button";

const defaultUrl = process.env.NODE_ENV === 'development'
  ? "http://localhost:3000"
  : "https://www.mundamanager.com";

// SEO constants - edit these to update all metadata
const PAGE_TITLE = 'Merch Store - Munda Manager Merchandise';
const PAGE_DESCRIPTION = 'Show your support for Munda Manager with official merchandise! Browse our Redbubble store for t-shirts, stickers, mugs, and more featuring unique Necromunda-inspired designs.';
const PAGE_DESCRIPTION_SHORT = 'Munda Manager merchandise on Redbubble. T-shirts, stickers, mugs, and more for Necromunda fans.';
const PAGE_KEYWORDS = 'Munda Manager merch, Necromunda merchandise, wargaming t-shirts, tabletop gaming stickers, Munda Manager shop, underhive merchandise';

const REDBUBBLE_STORE_URL = 'https://www.redbubble.com/people/MundaManager';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  keywords: PAGE_KEYWORDS,
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION_SHORT,
    url: `${defaultUrl}/merch`,
    type: 'website',
    siteName: 'Munda Manager',
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION_SHORT,
  },
  alternates: {
    canonical: `${defaultUrl}/merch`,
  },
};

export default function MerchPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": PAGE_TITLE,
    "description": PAGE_DESCRIPTION,
    "publisher": {
      "@type": "Organization",
      "name": "Munda Manager",
      "logo": {
        "@type": "ImageObject",
        "url": `${defaultUrl}/images/favicon-192x192.png`
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `${defaultUrl}/merch`
    },
    "keywords": PAGE_KEYWORDS
  };

  const products = [
    {
      name: 'Munda Manager - Logo and Name Oversized T-Shirt',
      url: 'https://www.redbubble.com/i/t-shirt/Munda-Manager-Logo-and-Name-by-MundaManager/176762687.74GE1',
      image: 'https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/merch/work-176762687-oversized-t-shirt.webp',
    },
    {
      name: 'Munda Manager Logo Skull Premium T-Shirt',
      url: 'https://www.redbubble.com/i/t-shirt/Munda-Manager-Logo-Skull-by-MundaManager/176759657.D00NU',
      image: 'https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/merch/work-176759657-premium-t-shirt.webp',
    },
    {
      name: 'Munda Manager Logo Boxy T-Shirt',
      url: 'https://www.redbubble.com/i/t-shirt/Munda-Manager-Logo-by-MundaManager/173675550.LPB90',
      image: 'https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/merch/work-173675550-boxy-t-shirt.webp',
    },
    {
      name: 'Munda Manager - Est. 999.M41 Lightweight Hoodie',
      url: 'https://www.redbubble.com/i/hoodie/Munda-Manager-Est-999-M41-by-MundaManager/176763813.O6XP1',
      image: 'https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/merch/work-176763813-lightweight-hoodie.webp',
    },
    {
      name: 'Munda Manager - Spiral Notebook',
      url: 'https://www.redbubble.com/i/notebook/Munda-Manager-Recording-since-999-M41-by-MundaManager/176763963.WX3NH',
      image: 'https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/merch/work-176763963-spiral-notebook.webp',
    },
    {
      name: 'Munda Manager, Forged in the Underhive Mouse Pad',
      url: 'https://www.redbubble.com/i/mouse-pad/Munda-Manager-Forged-in-the-Underhive-by-MundaManager/176763765.G1FH6',
      image: 'https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/merch/work-176763765-mouse-pad.webp',
    },
    {
      name: 'Munda Manager Transparent Logo Sticker',
      url: 'https://www.redbubble.com/i/sticker/Munda-Manager-Logo-by-MundaManager/173675550.O9UDB',
      image: 'https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/merch/work-173675550-transparent-sticker.webp',
    },
    {
      name: 'Munda Manager Coffee Mug',
      url: 'https://www.redbubble.com/i/mug/Munda-Manager-Logo-and-Name-by-MundaManager/176762687.9Q0AD',
      image: 'https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/merch/work-176762687-classic-mug.webp',
    },
  ];

  const productCategories = [
    {
      icon: LuShirt,
      title: 'Apparel',
      description: 'T-shirts, hoodies, and more to rep your favorite gang and campaign manager at your next gaming session.',
    },
    {
      icon: LuSkull,
      title: 'Stickers',
      description: 'Deck out your laptop, dice box, or miniature case with Munda Manager stickers.',
    },
    {
      icon: LuCoffee,
      title: 'Drinkware',
      description: 'Mugs and coasters to keep you caffeinated during those long hobby sessions.',
    },
    {
      icon: LuSmartphone,
      title: 'Accessories',
      description: 'Phone cases, notebooks, and other accessories featuring our unique designs.',
    },
  ];

  return (
    <>
      <Script
        id="merch-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData),
        }}
      />
      <main className="flex min-h-screen flex-col items-center">
        <div className="container ml-[10px] mr-[10px] max-w-4xl w-full space-y-4">
          <div className="bg-card shadow-md rounded-lg p-4">
            <h1 className="text-2xl md:text-2xl font-bold mb-4">
              Munda Manager Merchandise
            </h1>
            
            <div className="mb-8">
              <p className="text-muted-foreground mb-4">
                You enjoy using Munda Manager? Now you can show your support with our <strong className="text-foreground">Munda Manager merchandise</strong>!
                We've set up a shop on Redbubble featuring a range of products with our distinct logo and text inspired by the grim darkness of the Underhive.
              </p>
              <p className="text-muted-foreground mb-6">
                Every purchase helps support the continued development of Munda Manager and keeps the servers running. Plus, you'll look great at your next gaming session!
              </p>
              
              <div className="flex justify-center">
                <a
                  href={REDBUBBLE_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button className="gap-2 bg-red-800 hover:bg-red-700 text-white">
                    <LuExternalLink className="h-4 w-4" />
                    Visit Our Redbubble Store
                  </Button>
                </a>
              </div>
            </div>

            <div className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">Featured Products</h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {products.map((product) => (
                  <div
                    key={product.url}
                    className="bg-muted rounded-lg overflow-hidden hover:border-red-800 transition-colors flex flex-col"
                  >
                    <a
                      href={product.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group"
                    >
                      <div className="aspect-[3/4] relative bg-muted">
                        <Image
                          src={product.image}
                          alt={product.name}
                          fill
                          className="object-cover group-hover:scale-110 transition-transform"
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                        />
                      </div>
                      <div className="p-3">
                        <h3 className="text-sm font-semibold text-foreground line-clamp-2 group-hover:text-red-800 transition-colors">
                          {product.name}
                        </h3>
                      </div>
                    </a>
                    <div className="p-3 pt-0 mt-auto">
                      <a
                        href={product.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block w-full"
                      >
                        <Button className="w-full gap-2 bg-red-800 hover:bg-red-700 text-white text-sm">
                          <LuExternalLink className="h-3 w-3" />
                          Buy Now
                        </Button>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">What's Available</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {productCategories.map((category) => (
                  <div 
                    key={category.title}
                    className="bg-muted rounded-lg p-4"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <category.icon className="h-6 w-6 text-red-800" />
                      <h3 className="text-lg font-semibold text-foreground">{category.title}</h3>
                    </div>
                    <p className="text-muted-foreground text-sm">
                      {category.description}
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex justify-center mt-6">
                <a
                  href={REDBUBBLE_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button className="gap-2 bg-red-800 hover:bg-red-700 text-white">
                    <LuExternalLink className="h-4 w-4" />
                    View Full Catalogue
                  </Button>
                </a>
              </div>
            </div>

            <div className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-2">Why Redbubble?</h2>
              <p className="text-muted-foreground mb-4">
                We went with Redbubble because it makes it easy for us to offer merchandise without having to manage inventory or shipping ourselves. Here's what that means for you:
              </p>
              <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                <li className="text-muted-foreground">
                  <strong className="text-foreground">Print on demand:</strong> Items are made when you order them, reducing waste while allowing us to offer a wide range of products.
                </li>
                <li className="text-muted-foreground">
                  <strong className="text-foreground">Worldwide shipping:</strong> No matter where your campaign takes place, Redbubble can ship to you.
                </li>
                <li className="text-muted-foreground">
                  <strong className="text-foreground">Easy returns:</strong> If something isn't right with your order, Redbubble handles returns directly.
                </li>
                <li className="text-muted-foreground">
                  <strong className="text-foreground">Secure Payments:</strong> Safe and secure checkout process is provided by Redbubble.
                </li>
              </ul>
            </div>

            <div className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-2">Support Munda Manager</h2>
              <p className="text-muted-foreground mb-4">
                Purchasing merchandise is a great way to support the project while getting something cool in return. If you'd like to support us in other ways, consider:
              </p>
              <ul className="list-disc marker:text-red-800 pl-6 space-y-2">
                <li className="text-muted-foreground">
                  <strong className="text-foreground">Becoming a Patron:</strong> Join our{' '}
                  <a 
                    href="https://www.patreon.com/c/mundamanager" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="underline hover:text-red-800"
                  >
                    Patreon
                  </a>{' '}
                  for exclusive benefits and early access to new features.
                </li>
                <li className="text-muted-foreground">
                  <strong className="text-foreground">Spreading the word:</strong> Tell your gaming group about Munda Manager!
                </li>
                <li className="text-muted-foreground">
                  <strong className="text-foreground">Contributing:</strong> Check out our{' '}
                  <Link href="/contributors" className="underline hover:text-red-800">
                    contributors page
                  </Link>{' '}
                  to see how you can help improve the app.
                </li>
              </ul>
            </div>

            <div className="mt-8">
              <h2 className="text-2xl font-semibold text-foreground mb-1">Questions?</h2>
              <p className="text-muted-foreground mb-2">
                If you have questions about merchandise, want to suggest new designs, or have any issues with your order, please reach out through our{' '}
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
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

