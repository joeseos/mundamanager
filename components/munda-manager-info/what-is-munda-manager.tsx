import { FaUsers, FaCogs, FaCoins, FaDice, FaCog, FaUsersCog } from "react-icons/fa";
import { LuSwords } from "react-icons/lu";
import { FiMap } from "react-icons/fi";
import { MdOutlineCurrencyExchange } from "react-icons/md";
import Link from "next/link";

export default function WhatIsMundaManager() {
  const features = [
    {
      icon: <FaUsers className="h-6 w-6" />,
      title: "Gang Management",
      description: "Create and manage all gang types, including Crusading, Infested, Corrupted, and Wasteland variants, with their unique mechanics and rules."
    },
    {
      icon: <LuSwords className="h-6 w-6" />,
      title: "Fighter Tracking",
      description: "Track individual fighter stats, skills, injuries, and equipment with comprehensive advancement systems."
    },
    {
      icon: <FiMap className="h-6 w-6" />,
      title: "Campaign Support",
      description: "Manage campaign territories, record detailed battle reports, have multiple Arbitrators, and write down your campaign story and house rules."
    },
    {
      icon: <MdOutlineCurrencyExchange className="h-6 w-6" />,
      title: "Equipment Lists & Trading Posts",
      description: "Access an exhaustive equipment database, manage gang stashes, and handle Trading Post interactions."
    },
    {
      icon: <FaCoins className="h-6 w-6" />,
      title: "Resource Management",
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
        <p className="text-gray-700 mb-4">
        Munda Manager is a complete gang and campaign management tool for Necromunda. It takes the pain out of 
        tracking your fighters, gear, and credits, so you can focus on building the gang list you want and 
        getting it to the table.
        </p>
        <p className="text-gray-700">
        Whether you're an Arbitrator running a full campaign or a player juggling multiple gangs, 
        Munda Manager gives you the tools to keep everything organised and running smoothly.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {features.map((feature, index) => (
            <div key={index} className="flex items-start space-x-3 p-4 bg-gray-50 rounded-lg">
              <div className="text-red-800 mt-1">
                {feature.icon}
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">{feature.title}</h3>
                <p className="text-gray-700 text-sm">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Perfect For:</h2>
        <div className="space-y-3">
          <div className="flex items-center space-x-3">
            <FaDice className="h-5 w-5 text-red-800" />
            <span className="text-gray-700">Players who enjoy gang management but want it to be fast and frustration-free</span>
          </div>
          <div className="flex items-center space-x-3">
            <FaUsersCog className="h-5 w-5 text-red-800" />
            <span className="text-gray-700">Campaign Arbitrators organising official and homebrew campaigns</span>
          </div>
          <div className="flex items-center space-x-3">
            <FaCog className="h-5 w-5 text-red-800" />
            <span className="text-gray-700">Players who want flexibility in how they manage their gangs</span>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Why Choose Munda Manager?</h2>
        <div className="space-y-3">
          <div className="flex items-start space-x-3">
            <div className="w-2 h-2 bg-red-800 rounded-full mt-2 flex-shrink-0"></div>
            <p className="text-gray-700">
              <strong>Advanced Features:</strong> Vehicle rules, custom equipment creation, gang mechanics like Chem-Alchemy and Gene-smithing, plus comprehensive campaign management with battle logs and territory tracking.
            </p>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-2 h-2 bg-red-800 rounded-full mt-2 flex-shrink-0"></div>
            <p className="text-gray-700">
              <strong>User-Friendly:</strong> Intuitive interface designed specifically for Necromunda players, with mobile support for on-the-go access and layouts optimised for clear, printer-friendly gang sheets.
            </p>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-2 h-2 bg-red-800 rounded-full mt-2 flex-shrink-0"></div>
            <p className="text-gray-700">
              <strong>Accurate:</strong> Faithfully implements official Necromunda rules and mechanics while still allowing flexibility for house rules.
            </p>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-2 h-2 bg-red-800 rounded-full mt-2 flex-shrink-0"></div>
            <p className="text-gray-700">
              <strong>Community-Driven:</strong> Open-source project built by a dedicated team of community volunteers, with regular updates and features shaped by player feedback.
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