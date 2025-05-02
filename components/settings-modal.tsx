'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User as SupabaseUser } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { createClient } from "@/utils/supabase/client";
import Link from 'next/link';
import Modal from "@/components/modal";
import { Input } from "@/components/ui/input";

// Icons
import { Settings, LogOut, User, Bell, Info, Menu } from 'lucide-react';
import { FaUsers } from "react-icons/fa6";
import { FiMap, FiPrinter } from "react-icons/fi";

interface SettingsModalProps {
  user: SupabaseUser;
  isAdmin?: boolean;
}

export default function SettingsModal({ user, isAdmin }: SettingsModalProps) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printOptions, setPrintOptions] = useState({
    includeGangCard: true,
    includeAdditionalDetails: true,
    includeInactiveFighters: true,
    includeRecoveryFighters: true,
  });

  const printModalContent = (
    <div className="space-y-4">
      <div className="block text-sm font-medium text-gray-700">Include the following:</div>

      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="includeGangCard"
          checked={printOptions.includeGangCard}
          onChange={(e) =>
            setPrintOptions(prev => ({ ...prev, includeGangCard: e.target.checked }))
          }
        />
        <label htmlFor="includeGangCard" className="text-sm">
          Gang Card
        </label>
      </div>

      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="includeAdditionalDetails"
          checked={printOptions.includeAdditionalDetails}
          onChange={(e) =>
            setPrintOptions(prev => ({ ...prev, includeAdditionalDetails: e.target.checked }))
          }
        />
        <label htmlFor="includeAdditionalDetails" className="text-sm">
          Additional Details (Territories, Stash, Notes)
        </label>
      </div>

      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="includeInactiveFighters"
          checked={printOptions.includeInactiveFighters}
          onChange={(e) =>
            setPrintOptions(prev => ({ ...prev, includeInactiveFighters: e.target.checked }))
          }
        />
        <label htmlFor="includeInactiveFighters" className="text-sm">
          Inactive Fighters
        </label>
      </div>

      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="includeRecoveryFighters"
          checked={printOptions.includeRecoveryFighters}
          onChange={(e) =>
            setPrintOptions(prev => ({ ...prev, includeRecoveryFighters: e.target.checked }))
          }
        />
        <label htmlFor="includeRecoveryFighters" className="text-sm">
          Fighters in Recovery
        </label>
      </div>
    </div>
  );

  const handleLogout = async () => {
    setOpen(false);
    await supabase.auth.signOut();
    router.push('/sign-in');
    router.refresh();
  };

  const handleDummyClick = () => {
    setOpen(false);
    console.log('Feature coming soon...');
  };

  const handleLinkClick = () => {
    setOpen(false);
  };

  const disableLinksForPrint = () => {
    document.querySelectorAll('a').forEach(link => {
      link.setAttribute('data-href', link.getAttribute('href') || '');
      link.removeAttribute('href');
    });
  };

  const restoreLinksAfterPrint = () => {
    document.querySelectorAll('a').forEach(link => {
      const originalHref = link.getAttribute('data-href');
      if (originalHref) {
        link.setAttribute('href', originalHref);
        link.removeAttribute('data-href');
      }
    });
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="hover:bg-primary hover:text-white data-[state=open]:bg-primary data-[state=open]:text-white rounded-full focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 focus:ring-0 focus:ring-offset-0"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56" sideOffset={8} collisionPadding={20}>
        <div className="px-2 py-1.5 text-sm text-gray-500">
          Signed in as:<br />
          <span className="font-medium text-gray-900">{user.email}</span>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild onClick={handleLinkClick}>
          <Link href="/profile" className="w-full cursor-pointer">
            <User className="mr-2 h-4 w-4" />
            Profile
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={handleDummyClick}>
          <Bell className="mr-2 h-4 w-4" />
          Notifications
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild onClick={handleLinkClick}>
          <Link href="/" className="w-full cursor-pointer">
            <FaUsers className="mr-2 h-4 w-4" />
            Gangs
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild onClick={handleLinkClick}>
          <Link href="/campaigns" className="w-full cursor-pointer">
            <FiMap className="mr-2 h-4 w-4" />
            Campaigns
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild onClick={() => {
          setOpen(false);
          setShowPrintModal(true);
        }}>
          <div className="w-full cursor-pointer">
            <FiPrinter className="mr-2 h-4 w-4" />
            Print
          </div>
        </DropdownMenuItem>

        <DropdownMenuItem asChild onClick={handleLinkClick}>
          <Link href="/about" className="w-full cursor-pointer">
            <Info className="mr-2 h-4 w-4" />
            About
          </Link>
        </DropdownMenuItem>

        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild onClick={handleLinkClick}>
              <Link href="/admin" className="w-full cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                Admin
              </Link>
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={handleLogout}
          className="text-red-500 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900 dark:hover:text-red-400"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>

      {showPrintModal && (
        <Modal
          title="Print Options"
          helper="The options below apply only when printing a Gang page."
          content={printModalContent}
          onClose={() => setShowPrintModal(false)}
          onConfirm={() => {
            setShowPrintModal(false);

            const gangCard = document.getElementById('gang_card');
            const details = document.getElementById('gang_card_additional_details');
            const inactiveFighters = document.querySelectorAll('[id^="is_inactive"]');
            const recoveryFighters = document.querySelectorAll('[id^="is_recovery"]');

            if (gangCard) gangCard.style.display = printOptions.includeGangCard ? '' : 'none';
            if (details) details.style.display = printOptions.includeAdditionalDetails ? '' : 'none';

            inactiveFighters.forEach(el => {
              (el as HTMLElement).style.display = printOptions.includeInactiveFighters ? '' : 'none';
            });
            recoveryFighters.forEach(el => {
              (el as HTMLElement).style.display = printOptions.includeRecoveryFighters ? '' : 'none';
            });

            disableLinksForPrint();

            // Delay print slightly to let DOM update
            setTimeout(() => {
              window.print();

              restoreLinksAfterPrint();

              // Reset visibility after printing
              if (gangCard) gangCard.style.display = '';
              if (details) details.style.display = '';
              inactiveFighters.forEach(el => {
                (el as HTMLElement).style.display = '';
              });
              recoveryFighters.forEach(el => {
                (el as HTMLElement).style.display = '';
              });
            }, 100);
          }}
          confirmText="Print"
        />
      )}
    </DropdownMenu>
  );
}