'use client';

import { useEffect, useRef } from 'react';
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

  const renderTurnstile = () => {
    if (containerRef.current && window.turnstile) {
      if (widgetId.current) {
        window.turnstile.remove(widgetId.current);
      }
      
      try {
        if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
          throw new Error('Turnstile site key is not defined');
        }
        
        console.log('Rendering Turnstile with sitekey:', process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
        widgetId.current = window.turnstile.render(containerRef.current, {
          sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
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
          'error-callback': function(error: Error) {
            console.error('Turnstile error:', error);
          }
        });
        console.log('Turnstile rendered with ID:', widgetId.current);
      } catch (err) {
        console.error('Error rendering Turnstile:', err);
      }
    }
  };

  useEffect(() => {
    window.onloadTurnstileCallback = renderTurnstile;

    // Render Turnstile when the component mounts
    if (window.turnstile) {
      renderTurnstile();
    }

    // Clean up function
    return () => {
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
      }
    };
  }, []);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        async
        defer
        onLoad={() => {
          console.log('Turnstile script loaded');
          window.onloadTurnstileCallback && window.onloadTurnstileCallback();
        }}
        onError={() => {
          console.error('Failed to load Turnstile script');
        }}
      />
      <div ref={containerRef} className="cf-turnstile" data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}></div>
    </>
  );
}
