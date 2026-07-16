import { Suspense } from "react";
import UnsubscribeClient from "@/components/unsubscribe-client";

// Public confirmation page for one-click email unsubscribe links.
//
// This page is statically generated (ISR), never server-rendered per request: the
// unsubscribe token is read on the CLIENT (useSearchParams) and the actual mutation is
// performed by the /api/email/unsubscribe route. That keeps the page session-less
// and cacheable while the write stays in a dynamic handler (a mutation can't be ISR).
export const revalidate = 86400;

export const metadata = {
  title: "Unsubscribe · Munda Manager",
  robots: { index: false, follow: false },
};

export default function UnsubscribePage() {
  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container max-w-lg w-full mt-10 px-4">
        <div className="bg-card shadow-md rounded-lg p-6">
          <h1 className="text-xl font-bold mb-3">Email notifications</h1>
          <Suspense
            fallback={
              <p className="text-sm text-muted-foreground">
                Updating your preferences…
              </p>
            }
          >
            <UnsubscribeClient />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
