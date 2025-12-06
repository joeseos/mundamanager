import { getUserCount } from '@/app/lib/get-stats-user';
import { getGangCount } from '@/app/lib/get-stats-gang';
import { getCampaignCount } from '@/app/lib/get-stats-campaign';
import WhatIsMundaManager from './what-is-munda-manager';

/**
 * Server component wrapper for WhatIsMundaManager that fetches all stats
 * 
 * Use this in server components instead of the base component to automatically
 * fetch and display user, gang, and campaign counts.
 * 
 * Example:
 * ```tsx
 * import WhatIsMundaManagerServer from '@/components/munda-manager-info/what-is-munda-manager-server';
 * 
 * export default async function MyServerPage() {
 *   return <WhatIsMundaManagerServer />;
 * }
 * ```
 */
export default async function WhatIsMundaManagerServer() {
  const [userCount, gangCount, campaignCount] = await Promise.all([
    getUserCount(),
    getGangCount(),
    getCampaignCount()
  ]);
  
  return <WhatIsMundaManager userCount={userCount} gangCount={gangCount} campaignCount={campaignCount} />;
}

