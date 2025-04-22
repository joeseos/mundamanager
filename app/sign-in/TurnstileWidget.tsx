'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';

declare global {
  interface Window {
    turnstile: any;
    onloadTurnstileCallback: () => void;
  }
}

export default function TurnstileWidget() {
  const widgetId = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Get sitekey once at component initialization to avoid issues
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

  const renderTurnstile = () => {
    if (!containerRef.current || !window.turnstile) {
      return;
    }
    
    // Clean up previous widget if it exists
    if (widgetId.current) {
      try {
        window.turnstile.remove(widgetId.current);
      } catch (e) {
        console.error('Error removing previous Turnstile widget:', e);
      }
    }
      
    try {
      if (!siteKey) {
        setError('Turnstile site key is not configured');
        console.error('Turnstile site key is not defined');
        return;
      }
      
      console.log('Rendering Turnstile with sitekey');
      widgetId.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: 'dark',
        callback: function(token: string) {
          console.log('Turnstile token generated');
          const form = containerRef.current?.closest('form');
          if (form) {
            let tokenInput = form.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null;
            if (!tokenInput) {
              tokenInput = document.createElement('input');
              tokenInput.type = 'hidden';
              tokenInput.name = 'cf-turnstile-response';
              form.appendChild(tokenInput);
            }
            tokenInput.value = token;
          } else {
            console.error('Form not found');
          }
        },
        'error-callback': function(error: any) {
          console.error('Turnstile error:', error);
          setError('Verification challenge error');
        }
      });
      console.log('Turnstile rendered with ID:', widgetId.current);
    } catch (err) {
      console.error('Error rendering Turnstile:', err);
      setError('Failed to load verification challenge');
    }
  };

  useEffect(() => {
    // Set up global callback for when turnstile script loads
    window.onloadTurnstileCallback = () => {
      setScriptLoaded(true);
      renderTurnstile();
    };

    // If turnstile is already loaded when component mounts
    if (window.turnstile) {
      setScriptLoaded(true);
      renderTurnstile();
    }

    // Clean up function
    return () => {
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch (e) {
          console.error('Error during cleanup:', e);
        }
      }
    };
  }, []);

  // Render again if script becomes available later
  useEffect(() => {
    if (scriptLoaded) {
      renderTurnstile();
    }
  }, [scriptLoaded]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => {
          console.log('Turnstile script loaded');
          window.onloadTurnstileCallback && window.onloadTurnstileCallback();
        }}
        onError={() => {
          console.error('Failed to load Turnstile script');
          setError('Failed to load verification challenge');
        }}
      />
      <div ref={containerRef} className="cf-turnstile"></div>
      {error && <div className="text-red-500 text-sm mt-2">{error}</div>}
      
      {process.env.NODE_ENV === 'development' && !siteKey && (
        <div className="text-amber-500 text-sm mt-2">
          Note: NEXT_PUBLIC_TURNSTILE_SITE_KEY environment variable is not set
        </div>
      )}
    </>
  );
}
