'use client';

import { useState, useCallback } from 'react';
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
import { useFetchNotifications } from '@/hooks/use-notifications';
import dynamic from 'next/dynamic';

// Icons
import { Settings, LogOut, User, Info, Menu } from 'lucide-react';
import { FaUsers, FaDiscord, FaPatreon, FaGithub } from "react-icons/fa6";
import { FiMap } from "react-icons/fi";
import { MdOutlineColorLens } from "react-icons/md";

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
}

export default function SettingsModal({ user, isAdmin, username }: SettingsModalProps) {
  const router = useRouter();
  const supabase = createClient();
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

  return (
    <div className="relative">
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
          <div className="px-2 py-1.5 text-sm text-gray-500">

            <span className="text-xl font-medium text-gray-900">{username || user.email}</span>
          </div>

          <DropdownMenuSeparator />

          <DropdownMenuItem asChild onClick={handleLinkClick}>
            <Link href="/profile" className="w-full cursor-pointer flex items-center">
              <User className="mr-2 h-4 w-4" />
              Profile
              {notificationCount > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
                  {notificationCount > 99 ? '99+' : notificationCount}
                </span>
              )}
            </Link>
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

          <DropdownMenuItem asChild onClick={handleLinkClick}>
            <Link href="/customise" className="w-full cursor-pointer">
              <MdOutlineColorLens className="mr-2 h-4 w-4" />
              Customise
            </Link>
          </DropdownMenuItem>

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