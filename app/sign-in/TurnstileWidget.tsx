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
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Get sitekey once at component initialization
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

  useEffect(() => {
    // Define callback for Turnstile
    window.onloadTurnstileCallback = function() {
      if (!window.turnstile) {
        console.error('Turnstile not available after callback');
        return;
      }
      
      console.log('Turnstile loaded, ready to render');
      // Note: We don't need to explicitly render here as we're using implicit rendering
    };
    
    return () => {
      // Cleanup - nothing specific needed for implicit rendering
    };
  }, []);

  return (
    <div className="w-full">
      {/* Use implicit rendering as recommended by Cloudflare */}
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback"
        strategy="afterInteractive"
      />
      
      <div 
        ref={containerRef}
        className="cf-turnstile" 
        data-sitekey={siteKey}
        data-theme="dark"
        data-callback="onTurnstileSuccess"
        data-error-callback="onTurnstileError"
      ></div>
      
      {process.env.NODE_ENV === 'development' && !siteKey && (
        <div className="text-amber-500 text-sm mt-2">
          Note: NEXT_PUBLIC_TURNSTILE_SITE_KEY environment variable is not set
        </div>
      )}
      
      {/* Add global callbacks for Turnstile */}
      <Script id="turnstile-callbacks" strategy="afterInteractive">
        {`
          window.onTurnstileSuccess = function(token) {
            console.log("Turnstile verification successful");
            const form = document.querySelector('form');
            if (form) {
              let tokenInput = form.querySelector('input[name="cf-turnstile-response"]');
              if (!tokenInput) {
                tokenInput = document.createElement('input');
                tokenInput.type = 'hidden';
                tokenInput.name = 'cf-turnstile-response';
                form.appendChild(tokenInput);
              }
              tokenInput.value = token;
            }
          };
          
          window.onTurnstileError = function(error) {
            console.error("Turnstile error:", error);
          };
        `}
      </Script>
    </div>
  );
}
