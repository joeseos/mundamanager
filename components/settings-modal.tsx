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
import { Settings, LogOut, User, Bell, Swords, Flag, Info, Menu } from 'lucide-react';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { createClient } from "@/utils/supabase/client";
import Link from 'next/link';

interface SettingsModalProps {
  user: SupabaseUser;
  isAdmin?: boolean;
}

export default function SettingsModal({ user, isAdmin }: SettingsModalProps) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);

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
      <DropdownMenuContent 
        align="end" 
        className="w-56"
        sideOffset={8}
        collisionPadding={20}
      >
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
            <Swords className="mr-2 h-4 w-4" />
            Gangs
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild onClick={handleLinkClick}>
          <Link href="/campaigns" className="w-full cursor-pointer">
            <Flag className="mr-2 h-4 w-4" />
            Campaigns
          </Link>
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
    </DropdownMenu>
  );
} 