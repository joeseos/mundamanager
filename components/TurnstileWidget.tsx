'use client';

import { Turnstile } from 'next-turnstile';
import { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';

interface TurnstileWidgetProps {
  onStatusChange?: (status: 'loading' | 'success' | 'error' | 'expired' | 'required') => void;
  onTokenReceived?: (token: string) => void;
  className?: string;
}

export default function TurnstileWidget({
  onStatusChange,
  onTokenReceived,
  className = ''
}: TurnstileWidgetProps) {
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'expired' | 'required'>('required');
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleStatusChange = (newStatus: typeof status) => {
    setStatus(newStatus);
    onStatusChange?.(newStatus);
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    handleStatusChange('error');
  };

  if (!mounted) {
    return null;
  }

  if (!siteKey) {
    return (
      <div className={`w-full ${className}`}>
        {process.env.NODE_ENV === 'development' && (
          <div className="text-amber-500 text-sm">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} />
              <span>Note: NEXT_PUBLIC_TURNSTILE_SITE_KEY environment variable is not set</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`}>
      {/* Turnstile widget */}
      <div className="turnstile-widget">
        <Turnstile
          siteKey={siteKey}
          theme="dark"
          size="normal"
          retry="auto"
          refreshExpired="auto"
          sandbox={process.env.NODE_ENV === 'development'}
          onLoad={() => {
            handleStatusChange('required');
            setError(null);
          }}
          onVerify={(token) => {
            handleStatusChange('success');
            setError(null);
            onTokenReceived?.(token);

            // Ensure the token is added to the form
            const form = document.querySelector('form');
            if (form) {
              let tokenInput = form.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null;
              if (!tokenInput) {
                tokenInput = document.createElement('input');
                tokenInput.type = 'hidden';
                tokenInput.name = 'cf-turnstile-response';
                form.appendChild(tokenInput);
              }
              tokenInput.value = token;
            }
          }}
          onError={(error) => {
            console.error('Turnstile error:', error);
            handleError('Security check failed. Please try again.');
          }}
          onExpire={() => {
            handleStatusChange('expired');
            setError('Security check expired. Please verify again.');
          }}
        />
      </div>

      {/* Error state */}
      {error && status === 'error' && (
        <div className="flex items-center gap-2 text-red-500 text-sm mt-2">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Development mode notice - matches original styling */}
      {process.env.NODE_ENV === 'development' && !siteKey && (
        <div className="text-amber-500 text-sm mt-2">
          Note: NEXT_PUBLIC_TURNSTILE_SITE_KEY environment variable is not set
        </div>
      )}
    </div>
  );
}