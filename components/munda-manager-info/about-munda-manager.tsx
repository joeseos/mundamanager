import type { JSX } from "react";
import Link from "next/link";

type FAQItem = {
  q: string;
  a: string | JSX.Element;
};

export default function AboutMundaManager() {
  const patreonUrl = "https://www.patreon.com/c/mundamanager/membership";
  const buyMeACoffeeUrl = "https://buymeacoffee.com/mundamanager";

  const faqItems: FAQItem[] = [
    {
      q: "Is there a cost to use Munda Manager?",
      a: "Munda Manager is free to use! The goal is to support the community and make it easier for players to manage their gangs and campaigns. However, if you would like to support the development, you can become a Patreon member."
    },
    {
      q: "How can I provide feedback or request features?",
      a: <>Jump on the <a href="https://discord.gg/FrqEWShQd7" className="underline hover:text-red-800" target="_blank" rel="noopener noreferrer">Discord server</a> and let us know what you think! Feature requests, suggestions, and even complaints are all welcome.</>
    },
    {
      q: "Can I report a bug or technical issue?",
      a: <>Absolutely! Head over to <a href="https://discord.gg/FrqEWShQd7" className="underline hover:text-red-800" target="_blank" rel="noopener noreferrer">Discord</a> and drop a message with what's going wrong. We'll get it fixed as soon as we can.</>
    },
    {
      q: "Is my data safe?",
      a: "Your data is stored securely. While gangs and campaigns can be shared publicly, your account information and personal details remain private. We don't sell data, we don't share it, and we don't use it for anything other than making Munda Manager work. Simple as that."
    },
    {
      q: "Can I contribute code or help with development?",
      a: <>Munda Manager is open source! If you're interested in contributing, check out our <Link href="/join-the-team" className="underline hover:text-red-800">Join the Team</Link> page to learn about all the ways you can help. You can also check out the project on <a href="https://github.com" className="underline hover:text-red-800" target="_blank" rel="noopener noreferrer">GitHub</a> or reach out on <a href="https://discord.gg/FrqEWShQd7" className="underline hover:text-red-800" target="_blank" rel="noopener noreferrer">Discord</a>.</>
    }
  ];

  return (
    <div className="space-y-6">
      <section>
        <p className="text-muted-foreground">
          Munda Manager is a fan-created gang and campaign management tool for Necromunda, a tabletop game published by Games Workshop. It's designed to help players keep track of their gang details, fighters, equipment, and campaign progress.
        </p>
        <p className="text-muted-foreground mt-3">
          We built Munda Manager as a modern replacement for the older tools that have been left unmaintained. It started because we were tired of having to use unsupported websites that weren't being updated anymore. They required us to do a lot of work just to make them function properly when managing our gangs and campaigns. We figured other players probably felt the same way, especially those looking for an actively maintained solution, so we built something to make everyone's lives easier.
        </p>
        <p className="text-muted-foreground mt-3">
          Our goal is simple: help you spend less time doing admin work and more time playing Necromunda. Whether you're running a campaign, managing multiple gangs, or just want a better way to track your fighters, Munda Manager is here to help.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">Built by the Community, for the Community</h2>
        <p className="text-muted-foreground">
          Munda Manager has grown thanks to feedback and suggestions from players like you. Features get added based on what the community actually needs, not what looks good on paper. If you've got ideas, bug reports, or just want to chat about Necromunda, join us on{' '}
          <a 
            href="https://discord.gg/FrqEWShQd7"
            className="underline hover:text-red-800"
            target="_blank"
            rel="noopener noreferrer"
          >
            Discord
          </a>. Your input shapes what gets built next.
        </p>
        <p className="text-muted-foreground mt-2">
          Want to see who's helping build Munda Manager? Check out our <Link href="/contributors" className="underline hover:text-red-800">Contributors</Link> page to meet the team. Interested in joining? We'd love to have you! Learn more on our <Link href="/join-the-team" className="underline hover:text-red-800">Join the Team</Link> page.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">Support the Project</h2>
        <p className="text-muted-foreground">
          Munda Manager is completely free to use, and it always will be. If you find it useful and want to help keep it running and improving, you can support development through{' '}
          <a 
            href={patreonUrl}
            className="underline hover:text-red-800"
            target="_blank"
            rel="noopener noreferrer"
          >
            Patreon
          </a>{' '}
          or{' '}
          <a 
            href={buyMeACoffeeUrl}
            className="underline hover:text-red-800"
            target="_blank"
            rel="noopener noreferrer"
          >
            Buy Me a Coffee
          </a>. Every bit helps cover hosting costs and keeps new features coming.
        </p>
        <p className="text-muted-foreground mt-2">
          But honestly? The best way to support the project is to use it, share it with your gaming group, and let us know what you think. That feedback is worth more than any donation.
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