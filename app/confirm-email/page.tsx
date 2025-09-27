'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';

export default function EmailChangeConfirmPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const confirmEmailChange = async () => {
      const token_hash = searchParams.get('token_hash');
      const type = searchParams.get('type');

      if (!token_hash || type !== 'email_change') {
        setStatus('error');
        setMessage('Invalid confirmation link. Please try again.');
        return;
      }

      try {
        const { error } = await supabase.auth.verifyOtp({
          token_hash,
          type: 'email_change',
        });

        if (error) {
          setStatus('error');
          if (error.message.includes('expired')) {
            setMessage('This confirmation link has expired. Please request a new email change.');
          } else if (error.message.includes('already been used')) {
            setMessage('This confirmation link has already been used.');
          } else {
            setMessage('Failed to confirm email change. Please try again.');
          }
        } else {
          setStatus('success');
          setMessage('Your email change has been confirmed successfully!');
        }
      } catch (error) {
        console.error('Error confirming email change:', error);
        setStatus('error');
        setMessage('An unexpected error occurred. Please try again.');
      }
    };

    confirmEmailChange();
  }, [searchParams, supabase.auth]);

  const handleContinue = () => {
    if (status === 'success') {
      router.push('/account');
    } else {
      router.push('/');
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <div className="container max-w-md w-full space-y-6 p-6">
        <div className="bg-card shadow-md rounded-lg p-6 text-center">
          {status === 'loading' && (
            <>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neutral-900 mx-auto mb-4"></div>
              <h2 className="text-xl font-bold mb-2">Confirming Email Change</h2>
              <p className="text-muted-foreground">Please wait while we confirm your email change...</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="text-green-500 text-4xl mb-4">✓</div>
              <h2 className="text-xl font-bold mb-2 text-green-600">Email Change Confirmed</h2>
              <p className="text-muted-foreground mb-4">{message}</p>
              <p className="text-sm text-muted-foreground mb-4">
                Your email address has been successfully updated. You can now use your new email address to sign in.
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="text-red-500 text-4xl mb-4">✕</div>
              <h2 className="text-xl font-bold mb-2 text-red-600">Confirmation Failed</h2>
              <p className="text-muted-foreground mb-4">{message}</p>
              <div className="bg-muted p-3 rounded-md text-sm text-muted-foreground">
                <p><strong>Next steps:</strong></p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Check if you have another confirmation email</li>
                  <li>Try requesting a new email change from your account</li>
                  <li>Contact support if the problem persists</li>
                </ul>
              </div>
            </>
          )}

          <Button
            onClick={handleContinue}
            className="mt-6 w-full bg-neutral-900 hover:bg-gray-800 text-white"
            disabled={status === 'loading'}
          >
            {status === 'success' ? 'Go to Account' : 'Continue'}
          </Button>
        </div>
      </div>
    </main>
  );
}