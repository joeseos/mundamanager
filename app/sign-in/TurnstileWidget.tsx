'use client';

import { useEffect, useRef } from 'react';

// Only declare the window interface extension once
declare global {
  interface Window {
    turnstile: any;
  }
}

export default function TurnstileWidget() {
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const scriptLoadedRef = useRef(false);
  
  // Get sitekey once at component initialization
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

  // Function to render the Turnstile widget explicitly
  const renderWidget = () => {
    if (!window.turnstile || !widgetRef.current) return;
    
    // Clear any existing widget first
    if (widgetIdRef.current) {
      try {
        window.turnstile.remove(widgetIdRef.current);
      } catch (e) {
        console.error('Error removing existing Turnstile widget:', e);
      }
      widgetIdRef.current = null;
    }
    
    // Render a new widget
    try {
      console.log('Rendering Turnstile widget explicitly');
      widgetIdRef.current = window.turnstile.render(widgetRef.current, {
        sitekey: siteKey,
        theme: 'dark',
        callback: function(token: string) {
          console.log("Turnstile verification successful");
          const form = document.querySelector('form');
          if (form) {
            let tokenInput = form.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null;
            if (!tokenInput) {
              tokenInput = document.createElement('input') as HTMLInputElement;
              tokenInput.type = 'hidden';
              tokenInput.name = 'cf-turnstile-response';
              form.appendChild(tokenInput);
            }
            tokenInput.value = token;
          }
        },
        'error-callback': function(error: any) {
          console.error("Turnstile error:", error);
        }
      });
    } catch (e) {
      console.error('Error rendering Turnstile widget:', e);
    }
  };

  useEffect(() => {
    // Skip if no site key
    if (!siteKey) {
      console.log('No Turnstile site key provided');
      return;
    }

    // Check if script is already loaded
    const existingScript = document.querySelector('script[src*="turnstile"]');
    if (existingScript || scriptLoadedRef.current) {
      console.log('Turnstile script already loaded');
      // If window.turnstile is available, render immediately
      if (window.turnstile) {
        renderWidget();
      } else {
        // Use a more efficient approach - check once after a short delay
        const timeoutId = setTimeout(() => {
          if (window.turnstile) {
            renderWidget();
          }
        }, 200);
        
        return () => clearTimeout(timeoutId);
      }
      return;
    }
    
    // Create and load the script
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      console.log('Turnstile script loaded');
      scriptLoadedRef.current = true;
      
      // Render immediately after script loads
      if (window.turnstile) {
        renderWidget();
      } else {
        // Fallback: try once more after a short delay
        setTimeout(() => {
          if (window.turnstile) {
            renderWidget();
          }
        }, 100);
      }
    };
    
    script.onerror = (e) => {
      console.error('Error loading Turnstile script:', e);
    };
    
    document.head.appendChild(script);
    
    // Cleanup function
    return () => {
      if (window.turnstile && widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (e) {
          console.error('Error removing Turnstile widget on unmount:', e);
        }
      }
    };
  }, []); // Empty dependency array - run only once

  return (
    <div className="w-full">
      <div ref={widgetRef} className="turnstile-widget"></div>
      
      {process.env.NODE_ENV === 'development' && !siteKey && (
        <div className="text-amber-500 text-sm mt-2">
          Note: NEXT_PUBLIC_TURNSTILE_SITE_KEY environment variable is not set
        </div>
      )}
    </div>
  );
} 