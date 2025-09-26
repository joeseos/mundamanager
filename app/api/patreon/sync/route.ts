import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createAuthClient } from "@/utils/supabase/server";
import { checkAdmin } from "@/utils/auth";

/**
 * Rate limiting storage (in production, use Redis or database)
 */
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

/**
 * TypeScript interfaces for Patreon API data structures
 */
interface PatreonTier {
  id: string;
  type: 'tier';
  attributes: {
    title: string;
    discord_role_ids?: string[];
  };
}

interface PatreonMember {
  id: string;
  type: 'member';
  attributes: {
    full_name: string;
    email: string;
    patron_status: 'active_patron' | 'former_patron' | 'declined_patron';
  };
  relationships: {
    currently_entitled_tiers: {
      data: Array<{ id: string; type: 'tier' }>;
    };
    user: {
      data: { id: string; type: 'user' };
    };
  };
}

interface PatreonCampaignResponse {
  data: PatreonMember[];
  included?: PatreonTier[];
  links?: {
    next?: string;
  };
}

interface DatabaseUserData {
  patreonUserId: string;
  patronStatus: string;
  tierTitle: string | null;
  tierId: string | null;
  discordRoles: string[] | null;
}

/**
 * Create service role Supabase client for admin operations
 */
function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}

/**
 * Check rate limiting for sync endpoint (2 requests per minute)
 * @param userId - User ID for rate limiting
 * @returns boolean indicating if request is allowed
 */
function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 2;

  const userLimit = rateLimitMap.get(userId);

  if (!userLimit || now > userLimit.resetTime) {
    // Reset or create new limit window
    rateLimitMap.set(userId, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (userLimit.count >= maxRequests) {
    return false;
  }

  userLimit.count++;
  return true;
}

/**
 * Fetch all members from Patreon campaign
 * @returns Array of all campaign members with their tiers
 */
async function fetchAllCampaignMembers(): Promise<{ members: PatreonMember[]; tiers: PatreonTier[] }> {
  const accessToken = process.env.PATREON_CREATOR_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error('PATREON_CREATOR_ACCESS_TOKEN is not configured');
  }

  const baseUrl = 'https://www.patreon.com/api/oauth2/v2/campaigns';
  let allMembers: PatreonMember[] = [];
  let allTiers: PatreonTier[] = [];
  let nextUrl: string | null = null;

  try {
    // First, get campaign info to get the campaign ID
    const campaignResponse = await fetch(baseUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!campaignResponse.ok) {
      throw new Error(`Failed to fetch campaign info: ${campaignResponse.status}`);
    }

    const campaignData = await campaignResponse.json();
    const campaignId = campaignData.data[0]?.id;

    if (!campaignId) {
      throw new Error('No campaign found');
    }

    // Now fetch all members for this campaign
    nextUrl = `${baseUrl}/${campaignId}/members?include=currently_entitled_tiers,user&fields%5Bmember%5D=full_name,email,patron_status&fields%5Btier%5D=title,discord_role_ids&fields%5Buser%5D=email`;

    while (nextUrl) {
      console.log(`Fetching members from: ${nextUrl}`);

      const response = await fetch(nextUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch members: ${response.status} ${response.statusText}`);
      }

      const data: PatreonCampaignResponse = await response.json();

      // Add members to collection
      if (data.data) {
        allMembers.push(...data.data);
      }

      // Add tiers to collection (deduplicate by ID)
      if (data.included) {
        const newTiers = data.included.filter(item => item.type === 'tier') as PatreonTier[];
        newTiers.forEach(tier => {
          if (!allTiers.find(existingTier => existingTier.id === tier.id)) {
            allTiers.push(tier);
          }
        });
      }

      // Check for next page
      nextUrl = data.links?.next || null;

      // Add a small delay to respect rate limits
      if (nextUrl) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`Fetched ${allMembers.length} members and ${allTiers.length} tiers`);
    return { members: allMembers, tiers: allTiers };

  } catch (error) {
    console.error('Error fetching campaign members:', error);
    throw error;
  }
}

/**
 * Cache for all Supabase users to avoid repeated API calls
 */
let allSupabaseUsersCache: Map<string, { id: string; email: string }> | null = null;

/**
 * Fetch all Supabase users once and cache them
 */
async function getAllSupabaseUsers(): Promise<Map<string, { id: string; email: string }>> {
  if (allSupabaseUsersCache) {
    return allSupabaseUsersCache;
  }

  const supabase = createServiceRoleClient();
  const userMap = new Map<string, { id: string; email: string }>();

  try {
    // Fetch all users with pagination
    let page = 1;
    let hasMore = true;
    let totalUsers = 0;

    while (hasMore) {
      const { data: users, error: listError } = await supabase.auth.admin.listUsers({
        page,
        perPage: 1000 // Maximum allowed
      });

      if (listError) {
        console.log(`Error fetching users on page ${page}: ${listError.message}`);
        break;
      }

      if (users?.users && users.users.length > 0) {
        users.users.forEach(user => {
          if (user.email) {
            userMap.set(user.email.toLowerCase(), { id: user.id, email: user.email });
          }
        });
        totalUsers += users.users.length;

        // Check if there are more pages
        hasMore = users.users.length === 1000;
        page++;
      } else {
        hasMore = false;
      }
    }

    console.log(`Cached ${totalUsers} users for matching`);
    allSupabaseUsersCache = userMap;
    return userMap;

  } catch (error) {
    console.log(`❌ Failed to fetch Supabase users: ${error}`);
    return userMap;
  }
}

/**
 * Match Patreon user to existing profile by email
 * @param patreonEmail - Email from Patreon API
 * @param patreonUserId - Patreon user ID for fallback matching
 * @param usersMap - Pre-fetched map of all Supabase users
 * @returns User profile or null if not found
 */
async function matchPatreonToUser(patreonEmail: string, patreonUserId: string, usersMap: Map<string, { id: string; email: string }>) {
  const supabase = createServiceRoleClient();

  // Method 1: Try email match first (most reliable)
  if (patreonEmail) {
    const emailLower = patreonEmail.toLowerCase();
    const matchingUser = usersMap.get(emailLower);

    if (matchingUser) {
      // Now get the profile using the auth user ID
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', matchingUser.id)
        .single();

      if (!profileError && profile) {
        console.log(`Email match: ${patreonEmail} -> ${profile.username || 'N/A'}`);
        return profile;
      }
    }
  }

  // Method 2: Fallback to patreon_user_id for existing patrons
  if (patreonUserId) {
    const { data: existingUser, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('patreon_user_id', patreonUserId)
      .single();

    if (!error && existingUser) {
      return existingUser;
    }
  }

  return null;
}

/**
 * Update user's Patreon data in the database
 * @param userId - Database user ID
 * @param patreonData - Patreon data to update
 * @returns boolean indicating success
 */
async function updateUserPatreonData(userId: string, patreonData: DatabaseUserData): Promise<boolean> {
  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from('profiles')
    .update({
      patreon_user_id: patreonData.patreonUserId,
      patron_status: patreonData.patronStatus,
      patreon_tier_title: patreonData.tierTitle,
      patreon_tier_id: patreonData.tierId,
      patreon_discord_role_ids: patreonData.discordRoles,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId);

  if (error) {
    console.error('Error updating user Patreon data:', error);
    return false;
  }

  return true;
}

/**
 * Clear user's Patreon data when they're no longer a patron
 * @param userId - Database user ID
 * @param patronStatus - New patron status (or null to clear completely)
 * @returns boolean indicating success
 */
async function clearUserPatreonData(userId: string, patronStatus: string | null = null): Promise<boolean> {
  const supabase = createServiceRoleClient();

  const updateData: any = {
    patreon_tier_title: null,
    patreon_tier_id: null,
    patreon_discord_role_ids: null,
    updated_at: new Date().toISOString()
  };

  if (patronStatus) {
    updateData.patron_status = patronStatus;
  } else {
    // Completely clear all Patreon data
    updateData.patreon_user_id = null;
    updateData.patron_status = null;
  }

  const { error } = await supabase
    .from('profiles')
    .update(updateData)
    .eq('id', userId);

  if (error) {
    console.error('Error clearing user Patreon data:', error);
    return false;
  }

  return true;
}

/**
 * Sync all Patreon data to database
 * @param members - Array of Patreon members
 * @param tiers - Array of Patreon tiers
 * @returns Sync statistics
 */
async function syncPatreonData(members: PatreonMember[], tiers: PatreonTier[]) {
  let updated = 0;
  let created = 0;
  let cleared = 0;
  let skipped = 0;

  const usersMap = await getAllSupabaseUsers();

  const activePatreonUserIds = new Set<string>();

  // Process each member
  for (const member of members) {
    try {
      const patreonEmail = member.attributes.email;
      const patreonUserId = member.relationships.user.data.id;
      const patronStatus = member.attributes.patron_status;

      // Track active patrons
      if (patronStatus === 'active_patron') {
        activePatreonUserIds.add(patreonUserId);
      }

      // Find matching user using the cached users map
      const user = await matchPatreonToUser(patreonEmail, patreonUserId, usersMap);
      if (!user) {
        console.log(`❌ No matching user found for Patreon email: ${patreonEmail}, user ID: ${patreonUserId}, full name: ${member.attributes.full_name}`);
        skipped++;
        continue;
      }

      if (patronStatus === 'active_patron') {
        // Get current tier information
        const currentTierIds = member.relationships.currently_entitled_tiers.data.map(t => t.id);
        const currentTier = tiers.find(tier => currentTierIds.includes(tier.id));

        const patreonData: DatabaseUserData = {
          patreonUserId: patreonUserId,
          patronStatus: patronStatus,
          tierTitle: currentTier?.attributes.title || null,
          tierId: currentTier?.id || null,
          discordRoles: currentTier?.attributes.discord_role_ids || null
        };

        const success = await updateUserPatreonData(user.id, patreonData);
        if (success) {
          updated++;
        }
      } else if (patronStatus === 'former_patron' || patronStatus === 'declined_patron') {
        // Clear tier data but keep the status
        const success = await clearUserPatreonData(user.id, patronStatus);
        if (success) {
          cleared++;
        }
      }
    } catch (error) {
      console.error(`Error processing member ${member.id}:`, error);
      skipped++;
    }
  }

  // Clear data for users who are no longer active patrons
  const supabase = createServiceRoleClient();
  const { data: existingPatrons } = await supabase
    .from('profiles')
    .select('id, patreon_user_id')
    .not('patreon_user_id', 'is', null);

  if (existingPatrons) {
    for (const patron of existingPatrons) {
      if (patron.patreon_user_id && !activePatreonUserIds.has(patron.patreon_user_id)) {
        const success = await clearUserPatreonData(patron.id);
        if (success) {
          cleared++;
        }
      }
    }
  }

  console.log(`✅ Sync completed: ${updated} updated, ${created} created, ${cleared} cleared, ${skipped} skipped`);
  return { updated, created, cleared, skipped };
}


/**
 * Handle manual Patreon sync POST requests
 */
export async function POST(request: NextRequest) {
  try {
    // Check for admin service key bypass
    const adminKey = request.headers.get('x-admin-key');
    let userId: string;

    if (adminKey === process.env.ADMIN_SERVICE_KEY) {
      // Service key auth - use a fixed admin user ID for rate limiting
      userId = 'admin-service';
    } else {
      // Check for basic auth (username/password) or bearer token
      const authHeader = request.headers.get('authorization');
      let supabase;
      let user;

      if (authHeader?.startsWith('Basic ')) {
        // Handle basic auth
        const base64Credentials = authHeader.replace('Basic ', '');
        const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
        const [email, password] = credentials.split(':');

        if (!email || !password) {
          return NextResponse.json({ error: 'Invalid basic auth format' }, { status: 401 });
        }

        supabase = createServiceRoleClient();
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (authError || !authData.user) {
          return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }
        user = authData.user;
      } else if (authHeader?.startsWith('Bearer ')) {
        // Handle bearer token
        const bearerToken = authHeader.replace('Bearer ', '');
        supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            global: {
              headers: {
                Authorization: `Bearer ${bearerToken}`
              }
            }
          }
        );
        const { data: { user: tokenUser }, error } = await supabase.auth.getUser();
        if (error || !tokenUser) {
          return NextResponse.json({ error: 'Invalid bearer token (possibly expired)' }, { status: 401 });
        }
        user = tokenUser;
      } else {
        // Fallback to cookie-based auth
        supabase = await createAuthClient();
        const { data: { user: cookieUser } } = await supabase.auth.getUser();
        if (!cookieUser) {
          return NextResponse.json({ error: 'Unauthorized - No valid auth method found' }, { status: 401 });
        }
        user = cookieUser;
      }

      // Check admin role
      const isAdmin = await checkAdmin(supabase);
      if (!isAdmin) {
        return NextResponse.json({ error: 'Unauthorized - Admin role required' }, { status: 401 });
      }

      userId = user.id;
    }

    // Check rate limiting
    if (!checkRateLimit(userId)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Maximum 2 requests per minute.' },
        { status: 429 }
      );
    }

    // Fetch all campaign members
    const { members, tiers } = await fetchAllCampaignMembers();

    // Sync data to database
    const stats = await syncPatreonData(members, tiers);


    return NextResponse.json({
      success: true,
      message: 'Patreon data synced successfully',
      stats: {
        membersProcessed: members.length,
        tiersFound: tiers.length,
        ...stats
      }
    });

  } catch (error) {
    console.error('Error during manual Patreon sync:', error);
    return NextResponse.json({
      error: 'Sync failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * Handle GET requests (return sync status or info)
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication using standard cookie-based auth (like other admin endpoints)
    const supabase = await createAuthClient();
    const isAdmin = await checkAdmin(supabase);

    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get current patron statistics
    const serviceSupabase = createServiceRoleClient();
    const { data: patronStats } = await serviceSupabase
      .from('profiles')
      .select('patron_status')
      .not('patron_status', 'is', null);

    const stats = {
      totalPatrons: patronStats?.length || 0,
      activePatrons: patronStats?.filter(p => p.patron_status === 'active_patron').length || 0,
      formerPatrons: patronStats?.filter(p => p.patron_status === 'former_patron').length || 0,
      declinedPatrons: patronStats?.filter(p => p.patron_status === 'declined_patron').length || 0,
    };

    return NextResponse.json({
      message: 'Patreon sync endpoint',
      description: 'POST to this endpoint to manually sync Patreon data',
      rateLimit: '2 requests per minute',
      currentStats: stats
    });

  } catch (error) {
    console.error('Error getting sync status:', error);
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 });
  }
}