'use client';

import { useEffect, useRef, useState } from 'react';

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
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isRenderedRef = useRef(false);
  
  const [hasError, setHasError] = useState(false);
  
  // Get sitekey once at component initialization
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

  // Simple function to render the widget
  const renderWidget = () => {
    if (!window.turnstile || !widgetRef.current || isRenderedRef.current) {
      return false;
    }

    try {
      console.log('Rendering Turnstile widget');
      const widgetId = window.turnstile.render(widgetRef.current, {
        sitekey: siteKey,
        theme: 'dark',
        callback: function(token: string) {
          console.log("Turnstile verification successful");
          setHasError(false);
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
          setHasError(true);
        }
      });
      
      widgetIdRef.current = widgetId;
      isRenderedRef.current = true;
      setHasError(false);
      console.log('Turnstile widget rendered successfully');
      return true;
    } catch (e) {
      console.error('Error rendering Turnstile widget:', e);
      setHasError(true);
      return false;
    }
  };

  // Function to attempt rendering with simple retry
  const attemptRender = () => {
    if (isRenderedRef.current) {
      return; // Already rendered
    }

    if (window.turnstile && widgetRef.current) {
      const success = renderWidget();
      if (!success) {
        // Retry after a short delay
        timeoutRef.current = setTimeout(() => {
          attemptRender();
        }, 500);
      }
    } else {
      // Wait for API to be available
      timeoutRef.current = setTimeout(() => {
        attemptRender();
      }, 200);
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
      attemptRender();
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
      attemptRender();
    };
    
    script.onerror = (e) => {
      console.error('Error loading Turnstile script:', e);
      setHasError(true);
    };
    
    document.head.appendChild(script);
    
    // Cleanup function
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
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
      <div className="flex justify-center">
        <div ref={widgetRef} className="turnstile-widget"></div>
      </div>
      
      {/* Error state */}
      {hasError && (
        <div className="p-4 border border-red-300 rounded-md bg-red-50 dark:bg-red-900/20 dark:border-red-600 mt-2">
          <div className="flex items-center space-x-2">
            <div className="text-red-600 dark:text-red-400">⚠️</div>
            <div className="text-sm text-red-600 dark:text-red-400">
              Security verification failed to load. Please refresh the page and try again.
            </div>
          </div>
        </div>
      )}
      
      {process.env.NODE_ENV === 'development' && !siteKey && (
        <div className="text-amber-500 text-sm mt-2 text-center">
          Note: NEXT_PUBLIC_TURNSTILE_SITE_KEY environment variable is not set
        </div>
      )}
    </div>
  );
}