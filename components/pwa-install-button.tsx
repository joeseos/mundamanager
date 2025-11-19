'use client';

import { useEffect, useState } from 'react';
import { FaDownload } from "react-icons/fa";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaInstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [showAndroidInstructions, setShowAndroidInstructions] = useState(false);

  useEffect(() => {
    // Detect iOS
    const checkIOS = () => {
      const userAgent = window.navigator.userAgent.toLowerCase();
      const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
      
      // Also check for iPad on iOS 13+ which may report as Mac
      // Check for touch capability and Mac-like user agent
      const isIPadOS = navigator.maxTouchPoints > 1 && 
                      /macintosh/.test(userAgent) && 
                      !(window as any).MSStream; // Exclude IE/Edge legacy
      
      return isIOSDevice || isIPadOS;
    };

    // Detect Android
    const checkAndroid = () => {
      const userAgent = window.navigator.userAgent.toLowerCase();
      return /android/.test(userAgent);
    };

    const ios = checkIOS();
    const android = checkAndroid();
    setIsIOS(ios);
    setIsAndroid(android);

    // Check if app is already installed
    const checkIfInstalled = () => {
      // Method 1: Check display-mode media query (works for most browsers)
      // When installed as PWA, the display-mode is 'standalone' or 'fullscreen'
      const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || 
                               window.matchMedia('(display-mode: fullscreen)').matches;
      
      // Method 2: iOS-specific check
      // iOS Safari sets navigator.standalone to true when PWA is installed
      const isIOSStandalone = ios && (window.navigator as any).standalone === true;

      return isStandaloneMode || isIOSStandalone;
    };

    const installed = checkIfInstalled();
    if (installed) {
      setIsInstalled(true);
      return;
    }


    // On iOS, show the button if not installed (user can see instructions)
    if (ios) {
      setIsInstallable(true);
      return;
    }

    // For development: show button on localhost for testing (Chrome/Edge only)
    const isLocalhost = window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1' ||
                       window.location.hostname.startsWith('192.168.') ||
                       window.location.hostname.endsWith('.local');
    
    // Listen for the beforeinstallprompt event (Android/Desktop)
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      
      // Save the event so it can be triggered later
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);
      setIsInstallable(true);
    };

    // Listen for app installed event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // On localhost, show button after a short delay if beforeinstallprompt hasn't fired
    // This helps with testing, but the button won't work if the event never fires
    let timeout: NodeJS.Timeout | null = null;
    if (isLocalhost) {
      timeout = setTimeout(() => {
        // Force show for testing purposes on localhost
        // The button will appear but won't trigger install if beforeinstallprompt never fired
        setIsInstallable(true);
      }, 1000);
    }

    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    // For iOS, show instructions
    if (isIOS) {
      setShowIOSInstructions(true);
      return;
    }

    // For Android, if no prompt available, show manual instructions
    if (!deferredPrompt) {
      if (isAndroid) {
        setShowAndroidInstructions(true);
      }
      return;
    }

    // For Android/Desktop, trigger the install prompt
    await deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;

    // Clear the deferred prompt
    setDeferredPrompt(null);
    setIsInstallable(false);

    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }
  };

  // Don't render if already installed
  if (isInstalled) {
    return null;
  }

  // Don't render if not installable (only applies to non-iOS)
  if (!isIOS && !isInstallable) {
    return null;
  }

  return (
    <>
      <button
        onClick={handleInstallClick}
        className="flex justify-center items-center px-2 py-1 text-sm rounded-md hover:bg-muted w-full leading-none"
        aria-label="Mobile App"
      >
        <FaDownload className="mr-1 size-5" />
        Mobile App
      </button>
      
      {showIOSInstructions && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowIOSInstructions(false)}
        >
          <div 
            className="bg-card border rounded-lg p-6 max-w-md w-full shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">Add to Home Screen</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm mb-4">
              <li>Tap the Share button <span className="inline-block">📤</span> at the bottom of the screen</li>
              <li>Scroll down and tap &quot;Add to Home Screen&quot;</li>
              <li>Tap &quot;Add&quot; in the top right corner</li>
            </ol>
            <button
              onClick={() => setShowIOSInstructions(false)}
              className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {showAndroidInstructions && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowAndroidInstructions(false)}
        >
          <div 
            className="bg-card border rounded-lg p-4 max-w-md w-full shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">Install App</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm mb-4">
              <li>Tap the menu button <span className="inline-block">⋮</span> (three dots) of your browser</li>
              <li>Select "Install app" or "Add to Home screen"</li>
              <li>Follow the prompts to complete installation</li>
            </ol>
            <div className="text-xs text-muted-foreground mb-4">
              Note: If you don't see the install option, this browser may not support Progressive Web App. Try accessing this site from another browser.
            </div>
            <button
              onClick={() => setShowAndroidInstructions(false)}
              className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

