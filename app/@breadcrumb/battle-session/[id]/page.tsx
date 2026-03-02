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
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("battle_sessions")
    .select("campaign_id")
    .eq("id", id)
    .single();

  let campaignName: string | null = null;
  if (session?.campaign_id) {
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("campaign_name")
      .eq("id", session.campaign_id)
      .single();
    campaignName = campaign?.campaign_name ?? null;
  }

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

            {session?.campaign_id && campaignName ? (
              <>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link
                      href="/?tab=campaigns"
                      className="text-muted-foreground hover:text-primary"
                      aria-label="Navigate to Campaigns"
                    >
                      Campaigns
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="text-gray-400" aria-hidden="true">
                  /
                </BreadcrumbSeparator>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link
                      href={`/campaigns/${session.campaign_id}`}
                      className="text-muted-foreground hover:text-primary"
                      aria-label={`Navigate to ${campaignName}`}
                    >
                      {campaignName}
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="text-gray-400" aria-hidden="true">
                  /
                </BreadcrumbSeparator>
              </>
            ) : (
              <>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link
                      href="/battle-session"
                      className="text-muted-foreground hover:text-primary"
                      aria-label="Navigate to Battle Sessions"
                    >
                      Battle Sessions
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="text-gray-400" aria-hidden="true">
                  /
                </BreadcrumbSeparator>
              </>
            )}

            <BreadcrumbItem>
              <BreadcrumbPage
                className="text-foreground font-medium items-center whitespace-nowrap leading-none"
                aria-current="page"
              >
                Battle Session
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </div>
  );
}
