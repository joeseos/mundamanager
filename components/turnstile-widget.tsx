'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';

// Only declare the window interface extension once
declare global {
  interface Window {
    turnstile: any;
  }
}

export interface TurnstileHandle {
  /** Discard the current token and issue a fresh challenge. */
  reset: () => void;
}

interface TurnstileWidgetProps {
  /** Called with a fresh token, or null whenever the current one stops being usable. */
  onToken: (token: string | null) => void;
  ref?: Ref<TurnstileHandle>;
}

export default function TurnstileWidget({ onToken, ref }: TurnstileWidgetProps) {
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const scriptLoadedRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isRenderedRef = useRef(false);

  const [hasError, setHasError] = useState(false);

  // Get sitekey once at component initialization
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

  // In a ref so turnstile.render()'s callbacks never read a stale closure.
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  // Tokens are single-use and expire after ~300s, so a spent one must be
  // re-issued rather than resubmitted. Stable, so render()'s callbacks can hold it.
  const resetWidget = useCallback(() => {
    onTokenRef.current(null);
    if (window.turnstile && widgetIdRef.current) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch (e) {
        console.error('Error resetting Turnstile widget:', e);
      }
    }
  }, []);

  useImperativeHandle(ref, () => ({ reset: resetWidget }), [resetWidget]);

  // Simple function to render the widget
  const renderWidget = () => {
    if (!window.turnstile || !widgetRef.current || isRenderedRef.current) {
      return false;
    }

    try {
      const widgetId = window.turnstile.render(widgetRef.current, {
        sitekey: siteKey,
        theme: 'dark',
        callback: function(token: string) {
          setHasError(false);
          onTokenRef.current(token);
        },
        'expired-callback': resetWidget,
        'timeout-callback': resetWidget,
        'error-callback': function(error: any) {
          console.error("Turnstile error:", error);
          onTokenRef.current(null);
          setHasError(true);
        }
      });

      widgetIdRef.current = widgetId;
      isRenderedRef.current = true;
      setHasError(false);
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
      return;
    }

    // A bfcache restore carries a token that is already spent or expired.
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        resetWidget();
      }
    };
    window.addEventListener('pageshow', handlePageShow);

    const cleanUp = () => {
      window.removeEventListener('pageshow', handlePageShow);

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

    // Check if script is already loaded
    const existingScript = document.querySelector('script[src*="turnstile"]');
    if (existingScript || scriptLoadedRef.current) {
      attemptRender();
      return cleanUp;
    }

    // Create and load the script
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;

    script.onload = () => {
      scriptLoadedRef.current = true;
      attemptRender();
    };

    script.onerror = (e) => {
      console.error('Error loading Turnstile script:', e);
      setHasError(true);
    };

    document.head.appendChild(script);

    return cleanUp;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
