'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ThemeProviderProps } from 'next-themes';

// Single source for the provider and the pre-paint script. attribute "class"
// matches Tailwind: dark mode is a `dark` class on <html>, and a missing
// saved value uses defaultTheme (system follows prefers-color-scheme).
const themeConfig = {
  attribute: 'class',
  defaultTheme: 'system',
  enableSystem: true,
  disableTransitionOnChange: true,
  storageKey: 'mundamanager-theme',
} as const satisfies Pick<
  ThemeProviderProps,
  'attribute' | 'defaultTheme' | 'enableSystem' | 'disableTransitionOnChange' | 'storageKey'
>;

// Runs from the server HTML before first paint. On the client, React 19
// refuses to execute <script> inside a component and logs a console error
// whenever it has to create the tag (client navigations, refresh). A
// non-JavaScript type makes React treat the tag as data, so the warning
// goes away and the script is not run a second time.
const clientScriptProps =
  typeof window === 'undefined' ? {} : { type: 'application/json' as const };

const THEME_BOOT_SCRIPT = `(function(){try{var theme=localStorage.getItem(${JSON.stringify(themeConfig.storageKey)})||${JSON.stringify(themeConfig.defaultTheme)};var isDark=theme==="dark"||(${themeConfig.enableSystem}&&theme==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var currentClass=document.documentElement.className;document.documentElement.className=currentClass+(isDark?" dark":"");}catch(_){}})();`;

export function ThemeBootScript() {
  return (
    <script
      id="theme-boot"
      suppressHydrationWarning
      {...clientScriptProps}
      dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }}
    />
  );
}

export function ClientThemeProvider({ children, scriptProps, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      {...props}
      {...themeConfig}
      scriptProps={{
        ...scriptProps,
        ...clientScriptProps,
      }}
    >
      {children}
    </NextThemesProvider>
  );
}
