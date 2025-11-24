'use client';

import { useState, useCallback, type MouseEvent } from 'react';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User as SupabaseUser } from '@supabase/supabase-js';
import { signOutAction } from "@/app/actions/auth";
import Link from 'next/link';
import { useFetchNotifications } from '@/hooks/use-notifications';
import dynamic from 'next/dynamic';

// Icons
import { Settings, LogOut, User, Info, Menu } from 'lucide-react';
import { FaUsers, FaDiscord, FaPatreon, FaGithub } from "react-icons/fa6";
import { FiMap } from "react-icons/fi";
import { MdOutlineColorLens } from "react-icons/md";
import { TbDiamondFilled } from "react-icons/tb";
import { getPatreonTierColor } from "@/utils/patreon";

// Import the notifications' content component with SSR disabled
const NotificationsContent = dynamic(() => import('./notifications-content'), {
  ssr: false
});

// Export a component for use in server components
export function NotificationsSection({ userId }: { userId: string }) {
  return <NotificationsContent userId={userId} />;
}

interface SettingsModalProps {
  user: SupabaseUser;
  isAdmin?: boolean;
  username?: string;
  patreonTierId?: string;
  patreonTierTitle?: string;
  patronStatus?: string;
}

export default function SettingsModal({ user, isAdmin, username, patreonTierId, patreonTierTitle, patronStatus }: SettingsModalProps) {
  const [open, setOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);

  // Notification handler for all notifications
  const onNotifications = useCallback(
    (newNotifications: any[]) => {
      // No longer needed as we use onUnreadCountChange
    },
    []
  );

  // Handle unread count changes
  const onUnreadCountChange = useCallback((count: number) => {
    setNotificationCount(count);
  }, []);

  // Fetch notifications directly in this component
  useFetchNotifications({
    onNotifications,
    userId: user.id,
    realtime: true,
    onUnreadCountChange,
  });

  const handleLogout = async () => {
    setOpen(false);
    await signOutAction();
  };

  const handleDummyClick = () => {
    setOpen(false);
    console.log('Feature coming soon...');
  };

  const handleLinkClick = () => {
    setOpen(false);
  };

  const createHomeTabHandler = (tab: 'gangs' | 'campaigns' | 'customassets') => (event: MouseEvent<HTMLAnchorElement>) => {
    if (typeof window !== 'undefined' && window.location.pathname === '/') {
      event.preventDefault();
      setOpen(false);
      window.dispatchEvent(
        new CustomEvent<'gangs' | 'campaigns' | 'customassets'>('homeTabSwitch', {
          detail: tab,
        })
      );
    } else {
      handleLinkClick();
    }
  };

  return (
    <div className="relative">
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="hover:bg-neutral-800 hover:text-white data-[state=open]:bg-neutral-800 data-[state=open]:text-white rounded-full focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 focus:ring-0 focus:ring-offset-0"
            aria-label="Open Settings Menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        
        {/* Notification indicator that overlays the menu button */}
        {notificationCount > 0 && (
          <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[0.65rem] text-white z-10">
            {notificationCount > 99 ? '99+' : notificationCount}
          </div>
        )}

        <DropdownMenuContent
          align="end" 
          className="w-56"
          sideOffset={8}
          collisionPadding={20}
        >

          <DropdownMenuItem asChild onClick={handleLinkClick}>
            <Link href={`/user/${user.id}`} className="w-full cursor-pointer">
              <div className="flex items-center gap-1">
                {patreonTierId && (
                  <TbDiamondFilled 
                    size={16} 
                    color={getPatreonTierColor(patreonTierId)}
                    title={patreonTierTitle || `Patreon Tier ${patreonTierId}`}
                  />
                )}
                <span className="text-xl font-medium text-foreground">{username || user.email}</span>
              </div>
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem asChild onClick={handleLinkClick}>
            <Link href="/account" className="w-full cursor-pointer flex items-center">
              <User className="mr-2 h-4 w-4" />
              Account
              {notificationCount > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
                  {notificationCount > 99 ? '99+' : notificationCount}
                </span>
              )}
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem asChild onClick={handleLinkClick}>
            <Link href="/?tab=gangs" onClick={createHomeTabHandler('gangs')} className="w-full cursor-pointer">
              <FaUsers className="mr-2 h-4 w-4" />
              Gangs
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem asChild onClick={handleLinkClick}>
            <Link href="/?tab=campaigns" onClick={createHomeTabHandler('campaigns')} className="w-full cursor-pointer">
              <FiMap className="mr-2 h-4 w-4" />
              Campaigns
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem asChild onClick={handleLinkClick}>
            <Link href="/?tab=customassets" onClick={createHomeTabHandler('customassets')} className="w-full cursor-pointer">
              <MdOutlineColorLens className="mr-2 h-4 w-4" />
              Custom Assets
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem asChild onClick={handleLinkClick}>
            <Link href="/about" className="w-full cursor-pointer">
              <Info className="mr-2 h-4 w-4" />
              About
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <div className="pb-1">
            <div className="flex gap-2">
              <a href="https://discord.gg/ZWXXqd5NUt" target="_blank" rel="noopener noreferrer" onClick={handleLinkClick} className="flex justify-center items-center px-2 py-1 text-sm rounded-md hover:bg-muted">
                <FaDiscord className="h-4 w-4" />

              </a>
              <a href="https://www.patreon.com/c/mundamanager" target="_blank" rel="noopener noreferrer" onClick={handleLinkClick} className="flex justify-center items-center px-2 py-1 text-sm rounded-md hover:bg-muted">
                <FaPatreon className="h-4 w-4" />

              </a>

              <a href="https://github.com/joeseos/mundamanager" target="_blank" rel="noopener noreferrer" onClick={handleLinkClick} className="flex justify-center items-center px-2 py-1 text-sm rounded-md hover:bg-muted">
                <FaGithub className="h-4 w-4" />

              </a>
            </div>
          </div>

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
      </DropdownMenu>
    </div>
  );
}