import { FaUsers, FaCogs, FaCoins, FaDice, FaCog, FaUsersCog } from "react-icons/fa";
import { LuSwords } from "react-icons/lu";
import { FiMap } from "react-icons/fi";
import { MdOutlineCurrencyExchange } from "react-icons/md";
import Link from "next/link";

export default function WhatIsMundaManager() {
  const features = [
    {
      icon: <FaUsers className="h-6 w-6" />,
      title: "Gang Builder",
      description: "Create and manage all gang types, including Crusading, Infested, Corrupted, and Wasteland variants, with their unique mechanics and rules."
    },
    {
      icon: <LuSwords className="h-6 w-6" />,
      title: "Fighter Tracking",
      description: "Track each fighter’s stats, skills, equipment, advancements, and injuries, and personalise them with custom portraits and backstories."
    },
    {
      icon: <FiMap className="h-6 w-6" />,
      title: "Campaign Management",
      description: "Manage campaign territories, record detailed battle reports, have multiple Arbitrators, and write down your campaign story and house rules."
    },
    {
      icon: <MdOutlineCurrencyExchange className="h-6 w-6" />,
      title: "Equipment Lists & Trading Posts",
      description: "Access an exhaustive equipment database, manage your gang's stash, and handle Trading Post interactions."
    },
    {
      icon: <FaCoins className="h-6 w-6" />,
      title: "Resource Tracking",
      description: "Track credits, reputation, and other gang and campaign resources with detailed logging and history."
    },
    {
      icon: <FaCogs className="h-6 w-6" />,
      title: "Advanced Gang Mechanics",
      description: "Use Chem-Alchemy, Gene-smithing, Archaeo-Cyberteknika for your gangs, or bring your gang to the Ash Wastes with our vehicle support."
    }
  ];

  return (
    <div className="space-y-6">
      <section>
        <p className="text-muted-foreground mb-4">
        Munda Manager is a complete gang and campaign management tool for Necromunda. It takes the pain out of 
        tracking your fighters, equipment, and credits, so you can focus on building the gang list you want and 
        getting it to the table.
        </p>
        <p className="text-muted-foreground">
        Whether you're an Arbitrator running a full campaign or a player juggling multiple gangs, 
        Munda Manager gives you the tools to keep everything organised and running smoothly.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Gang & Campaign Management Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {features.map((feature, index) => (
            <div key={index} className="flex items-start space-x-3 p-4 bg-muted rounded-lg">
              <div className="text-red-800 mt-1">
                {feature.icon}
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Ideal for Necromunda Players & Arbitrators</h2>
        <div className="space-y-3">
          <div className="flex items-center space-x-3">
            <FaDice className="h-5 w-5 text-red-800" />
            <span className="text-muted-foreground">Players who enjoy gang management but want it to be fast and frustration-free</span>
          </div>
          <div className="flex items-center space-x-3">
            <FaUsersCog className="h-5 w-5 text-red-800" />
            <span className="text-muted-foreground">Campaign Arbitrators organising official and homebrew campaigns</span>
          </div>
          <div className="flex items-center space-x-3">
            <FaCog className="h-5 w-5 text-red-800" />
            <span className="text-muted-foreground">Players who want flexibility in how they manage their gangs</span>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Why Choose Munda Manager?</h2>
        <div className="space-y-3">
          <div className="flex items-start space-x-3">
            <div className="w-2 h-2 bg-red-800 rounded-full mt-2 flex-shrink-0"></div>
            <p className="text-muted-foreground">
              <strong>Advanced Features:</strong> Vehicle rules, custom equipment creation, gang mechanics like Chem-Alchemy and Gene-smithing, plus comprehensive campaign management with battle logs and territory tracking.
            </p>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-2 h-2 bg-red-800 rounded-full mt-2 flex-shrink-0"></div>
            <p className="text-muted-foreground">
              <strong>User-Friendly:</strong> Intuitive interface designed for Necromunda players, the website is accessible on any device without installation, optimised for desktop and mobile, with print-ready options for your gang.
            </p>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-2 h-2 bg-red-800 rounded-full mt-2 flex-shrink-0"></div>
            <p className="text-muted-foreground">
              <strong>Accurate:</strong> Faithfully implements official Necromunda rules and mechanics while still allowing flexibility for house rules.
            </p>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-2 h-2 bg-red-800 rounded-full mt-2 flex-shrink-0"></div>
            <p className="text-muted-foreground">
              <strong>Community-Driven:</strong> Free, open-source project built by a dedicated team of community volunteers, with regular updates and features shaped by player feedback.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-blue-50 p-4 rounded-lg">
        <h2 className="text-lg font-semibold mb-2 text-blue-900">Ready to Get Started?</h2>
        <p className="text-blue-800">
          <Link href="/sign-up" className="text-blue-900 font-semibold underline hover:text-blue-700">
            Sign up
          </Link>{" "}
          now and start managing your gangs and campaigns. Thousands of Necromunda players 
          have already discovered how Munda Manager can enhance their gaming experience!
        </p>
      </section>
    </div>
  );
}