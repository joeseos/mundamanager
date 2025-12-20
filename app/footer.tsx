import Link from 'next/link';
import Image from 'next/image';
import { FaDiscord, FaPatreon, FaGithub, FaInstagram } from "react-icons/fa6";

const SITE_DESCRIPTION = "Gang & Campaign management tool for Necromunda";

export default function Footer() {
  return (
    <footer className="bg-background border-t border-border shadow-md print:hidden">
      <div className="max-w-5xl mx-auto pl-6 pr-[10px] md:px-[10px] py-6">
        <div className="flex flex-col md:flex-row gap-8 md:gap-12">
          {/* Brand Section */}
          <div className="flex flex-col gap-2 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Image
                src="/images/favicon-36x36.png"
                alt="Munda Manager"
                width={36}
                height={36}
              />
              <span className="text-lg font-bold">Munda Manager</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {SITE_DESCRIPTION}
            </p>
            <p className="text-sm text-muted-foreground font-medium">
              By the Community, for the Community
            </p>
          </div>

          {/* Resources Section */}
          <nav className="flex flex-col gap-2" aria-label="Footer navigation">
            <h3 className="text-sm font-semibold mb-1">Resources</h3>
            <div className="flex flex-col gap-2">
              <Link href="/user-guide" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                User Guide
              </Link>
              <Link href="/api-access" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                API Access
              </Link>
              <Link href="/contributors" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Contributors
              </Link>
            </div>
          </nav>

          {/* Info Section */}
          <nav className="flex flex-col gap-2" aria-label="Information">
            <h3 className="text-sm font-semibold mb-1">Info</h3>
            <div className="flex flex-col gap-2">
              <Link href="/about" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                About
              </Link>
              <Link href="/contact" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Contact
              </Link>
              <Link href="/join-the-team" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Join the Team
              </Link>
            </div>
          </nav>

          {/* Social Icons Section */}
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold mb-1">Follow Us</h3>
            <div className="flex gap-4">
              <a
                href="https://discord.gg/ZWXXqd5NUt"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
                aria-label="Join our Discord server"
              >
                <FaDiscord className="h-5 w-5" />
              </a>
              <a
                href="https://www.instagram.com/mundamanager"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
                aria-label="Follow us on Instagram"
              >
                <FaInstagram className="h-5 w-5" />
              </a>
              <a
                href="https://www.patreon.com/c/mundamanager"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
                aria-label="Support us on Patreon"
              >
                <FaPatreon className="h-5 w-5" />
              </a>
              <a
                href="https://github.com/joeseos/mundamanager"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
                aria-label="View our GitHub repository"
              >
                <FaGithub className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>
        
        {/* Copyright Section */}
        <div className="border-t border-border mt-8 pt-6">
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-xs text-muted-foreground">
            <span>© {new Date().getFullYear()} Munda Manager</span>
            <span className="text-muted-foreground">/</span>
            <Link href="/terms" className="text-muted-foreground hover:text-primary transition-colors">
              Terms
            </Link>
            <span className="text-muted-foreground">/</span>
            <Link href="/privacy-policy" className="text-muted-foreground hover:text-primary transition-colors">
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

