import { LuHouse } from "react-icons/lu";
import { createClient } from "@/utils/supabase/server";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import Link from "next/link";

export default async function BattleSessionBreadcrumb({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id, sessionId } = await params;
  const supabase = await createClient();

  const [{ data: gangData }, { data: session }] = await Promise.all([
    supabase.from("gangs").select("name").eq("id", id).maybeSingle(),
    supabase
      .from("battle_sessions")
      .select("created_at")
      .eq("id", sessionId)
      .maybeSingle(),
  ]);

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
            <BreadcrumbSeparator className="text-gray-400" aria-hidden="true">
              /
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link
                  href={`/gang/${id}`}
                  className="text-muted-foreground hover:text-primary"
                  aria-label={`Navigate to ${gangData?.name || 'Gang'}`}
                >
                  {gangData?.name || 'Gang'}
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="text-gray-400" aria-hidden="true">
              /
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage
                className="text-foreground font-medium items-center whitespace-nowrap leading-none"
                aria-current="page"
              >
                Battle Sessions - {session?.created_at
                  ? new Date(session.created_at).toISOString().slice(0, 10)
                  : 'Battle Session'}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </div>
  );
}
