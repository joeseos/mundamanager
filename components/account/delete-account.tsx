'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Modal from '@/components/ui/modal';
import { deleteAccountAction } from '@/app/actions/user';
import { createClient } from '@/utils/supabase/client';
import TurnstileWidget, { type TurnstileHandle } from '@/components/turnstile-widget';

interface DeleteAccountProps {
  ownedCampaigns: { id: string; campaign_name: string | null }[];
}

export default function DeleteAccount({ ownedCampaigns }: DeleteAccountProps) {
  const [showModal, setShowModal] = useState(false);
  const [password, setPassword] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);
  // Keeps the button disabled while the page redirects after a delete.
  const [deleted, setDeleted] = useState(false);

  const handleDelete = async () => {
    const formData = new FormData(formRef.current ?? undefined);
    const result = await deleteAccountAction(formData);
    if (!result.success || !('redirectTo' in result)) {
      toast.error(result.error || 'Failed to delete account');
      // A submitted token was consumed, so a retry needs a fresh one.
      if (formData.get('cf-turnstile-response')) turnstileRef.current?.reset();
      return false;
    }

    setDeleted(true);

    // Drop the browser client's in-memory session, like signing out does.
    try {
      await createClient().auth.signOut({ scope: 'local' });
    } catch (error) {
      console.error('Error clearing local session after account delete:', error);
    }

    window.location.assign(result.redirectTo);
    return false;
  };

  if (ownedCampaigns.length > 0) {
    return (
      <div className="space-y-2 text-sm">
        <p>
          You are the Owner of these campaigns. Hand each one over to an Arbitrator or delete it before you can delete your account:
        </p>
        <ul className="list-disc pl-5">
          {ownedCampaigns.map((campaign) => (
            <li key={campaign.id}>
              <Link href={`/campaigns/${campaign.id}`} className="underline hover:text-red-800">
                {campaign.campaign_name}
              </Link>
            </li>
          ))}
        </ul>
        <Button variant="destructive" disabled>
          Delete Account
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button variant="destructive" onClick={() => setShowModal(true)}>
        Delete Account
      </Button>

      {showModal && (
        <Modal
          title="Delete Account"
          content={
            <div className="space-y-4">
              <p>
                This permanently deletes your account, your gangs and your custom content, and removes you from every campaign.
              </p>
              <p className="text-sm">
                Custom content you shared into campaigns is also removed from other players&apos; gangs. Your forum posts stay, without your name.
              </p>
              <p className="text-sm text-red-600">
                This action cannot be undone.
              </p>
              <form ref={formRef} className="space-y-2" onSubmit={(e) => e.preventDefault()}>
                <label htmlFor="delete-account-password" className="block text-sm font-medium">
                  Enter your password to confirm:
                </label>
                <Input
                  id="delete-account-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full"
                />
                <div className="flex justify-center">
                  <TurnstileWidget ref={turnstileRef} />
                </div>
              </form>
            </div>
          }
          onClose={() => {
            setShowModal(false);
            setPassword('');
          }}
          onConfirm={handleDelete}
          confirmText="Delete Account"
          confirmDisabled={!password || deleted}
        />
      )}
    </>
  );
}
