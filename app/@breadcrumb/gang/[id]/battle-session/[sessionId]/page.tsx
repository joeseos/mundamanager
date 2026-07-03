import { LuHouse } from "react-icons/lu";
import { getGangBasic } from "@/app/lib/shared/gang-data";
import { getBattleSessionCached } from "@/app/lib/battle-sessions/get-battle-session-data";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import Link from "next/link";

export function BattleSessionBreadcrumbLayout({
  parentLinks,
  sessionDate,
}: {
  parentLinks: { href: string; label: string }[];
  sessionDate: string | null;
}) {
  return (
    <div
      className="w-full fixed top-14 z-40 bg-card border-b border-neutral-800 print:hidden"
      role="navigation"
      aria-label="Breadcrumb"
      data-scroll-ignore="true"
    >
      <div className="w-full">
        <Breadcrumb className="h-10 flex items-center px-4 leading-[0.5rem]">
          <BreadcrumbList aria-label="Breadcrumb navigation">
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link
                  href="/"
                  className="text-muted-foreground hover:text-primary flex items-center"
                  aria-label="Home"
                >
                  <span aria-hidden="true">
                    <LuHouse className="h-4 w-4" />
                  </span>
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {parentLinks.map((link) => [
              <BreadcrumbSeparator key={`sep-${link.href}`} className="text-gray-400" aria-hidden="true">
                /
              </BreadcrumbSeparator>,
              <BreadcrumbItem key={link.href}>
                <BreadcrumbLink asChild>
                  <Link
                    href={link.href}
                    className="text-muted-foreground hover:text-primary"
                    aria-label={`Navigate to ${link.label}`}
                  >
                    {link.label}
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>,
            ])}
            <BreadcrumbSeparator className="text-gray-400" aria-hidden="true">
              /
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage
                className="text-foreground font-medium items-center whitespace-nowrap leading-none"
                aria-current="page"
              >
                Battle Sessions - {sessionDate || 'Battle Session'}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </div>
  );
}

export default async function BattleSessionBreadcrumb({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id, sessionId } = await params;
  // Cached reads. A breadcrumb must never throw: degrade to fallback labels on any error.
  const [gangData, session] = await Promise.all([
    getGangBasic(id).catch(() => null),
    getBattleSessionCached(sessionId).catch(() => null),
  ]);

  return (
    <BattleSessionBreadcrumbLayout
      parentLinks={[{ href: `/gang/${id}`, label: gangData?.name || 'Gang' }]}
      sessionDate={session?.created_at ? new Date(session.created_at).toISOString().slice(0, 10) : null}
    />
  );
}
