import type { JSX } from "react";

type FAQItem = {
  q: string;
  a: string | JSX.Element;
};

export default function AboutMundaManager() {
  const patreonUrl = "https://www.patreon.com/c/mundamanager/membership";
  const buyMeACoffeeUrl = "https://buymeacoffee.com/mundamanager";

  const faqItems: FAQItem[] = [
    {
      q: "What is Munda Manager?",
      a: "Munda Manager is a fan-created tool for managing gangs, fighters, and campaigns in Necromunda, a tabletop game published by Games Workshop. It's designed to help players keep track of their gang details and campaign progress."
    },
    {
      q: "Is there a cost to use Munda Manager?",
      a: "Munda Manager is free to use! The goal is to support the community and make it easier for players to manage their gangs and campaigns. However, if you would like to support the development, you can become a Patreon member."
    },
    {
      q: "How can I provide feedback or request features?",
      a: <>Join the <a href="https://discord.gg/FrqEWShQd7" className="underline hover:text-red-800" target="_blank" rel="noopener noreferrer">Discord server</a> to provide feedback or request features.</>
    },
    {
      q: "Can I report a bug or technical issue?",
      a: <>Yes, please reach out on the <a href="https://discord.gg/FrqEWShQd7" className="underline hover:text-red-800" target="_blank" rel="noopener noreferrer">Discord server</a> with a description of the issue. I'll do my best to address it as soon as possible.</>
    }
  ];

  return (
    <div className="space-y-6">
      <section>
        <p className="text-muted-foreground">
          Munda Manager is a comprehensive gang management tool for Necromunda, helping you keep track of your gangs, fighters, and campaigns.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">Support</h2>
        <p className="text-muted-foreground">
          If you enjoy using Munda Manager and would like to support its development, consider becoming a Patreon member! Your contributions help me continue to improve and expand the tool for the community. You can join my Patreon at:{' '}
          <a 
            href={patreonUrl}
            className="underline hover:text-red-800"
            target="_blank"
            rel="noopener noreferrer"
          >
            patreon.com/mundamanager
          </a>{' '}
          or buy me a coffee at{' '}
          <a 
            href={buyMeACoffeeUrl}
            className="underline hover:text-red-800"
            target="_blank"
            rel="noopener noreferrer"
          >
            buymeacoffee.com/mundamanager
          </a>.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">FAQ</h2>
        <div className="space-y-4">
          {faqItems.map((item, index) => (
            <div key={index}>
              <h3 className="font-semibold text-foreground mb-1">{index + 1}. {item.q}</h3>
              <div className="text-muted-foreground">{item.a}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">Disclaimer</h2>
        <p className="text-muted-foreground text-sm">
          "Mundamanager.com" is an independent fan-made website designed to assist users in playing Necromunda, a game published by Games Workshop Group PLC. This website is not affiliated with, endorsed by, or associated with Games Workshop.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">Copyright Information</h2>
        <p className="text-muted-foreground text-sm">
          Games Workshop, Citadel, Black Library, Forge World, Warhammer, Warhammer 40,000, the 'Aquila' Double-headed Eagle logo, Space Marine, 40K, 40,000, Warhammer Age of Sigmar, Battletome, Stormcast Eternals, Warhammer: The Horus Heresy, the 'winged-hammer' Warhammer logo, White Dwarf, Blood Bowl, Necromunda, Space Hulk, Battlefleet Gothic, Mordheim, Inquisitor, and all associated logos, illustrations, images, names, creatures, races, vehicles, locations, weapons, characters, and the distinctive likenesses thereof are either ® or TM, and/or © Games Workshop Limited, variably registered around the world. All Rights Reserved.
        </p>
        <p className="text-muted-foreground text-sm mt-2">
          Content on Munda Manager is not meant, and does not, constitute a challenge to any rights possessed by any intellectual property holder.
        </p>
      </section>
    </div>
  );
} 