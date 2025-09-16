import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

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

interface PatreonWebhookPayload {
  data: PatreonMember;
  included?: PatreonTier[];
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
 * Verify webhook signature using HMAC-MD5
 * @param payload - Raw request payload
 * @param signature - Signature from request headers
 * @returns boolean indicating if signature is valid
 */
function verifyWebhookSignature(payload: string, signature: string): boolean {
  const webhookSecret = process.env.PATREON_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('PATREON_WEBHOOK_SECRET is not configured');
    return false;
  }

  const expectedSignature = crypto
    .createHmac('md5', webhookSecret)
    .update(payload)
    .digest('hex');

  try {
    // Ensure both signatures are the same length for comparison
    if (signature.length !== expectedSignature.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      new Uint8Array(Buffer.from(signature, 'hex')),
      new Uint8Array(Buffer.from(expectedSignature, 'hex'))
    );
  } catch (error) {
    console.error('Error comparing webhook signatures:', error);
    return false;
  }
}

/**
 * Match Patreon user to existing profile by email using admin auth
 * @param patreonEmail - Email from Patreon webhook
 * @param patreonUserId - Patreon user ID for fallback matching
 * @returns User profile or null if not found
 */
async function matchPatreonToUser(patreonEmail: string, patreonUserId: string) {
  const supabase = createServiceRoleClient();

  if (patreonEmail) {
    try {
      const { data: users, error: listError } = await supabase.auth.admin.listUsers();

      if (!listError && users?.users) {
        const matchingUser = users.users.find(user =>
          user.email?.toLowerCase() === patreonEmail.toLowerCase()
        );

        if (matchingUser) {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', matchingUser.id)
            .single();

          if (!profileError && profile) {
            return profile;
          }
        }
      }
    } catch (adminError) {
      console.error(`Webhook admin auth query failed for ${patreonEmail}:`, adminError);
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
 * @param patronStatus - New patron status
 * @returns boolean indicating success
 */
async function clearUserPatreonData(userId: string, patronStatus: string): Promise<boolean> {
  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from('profiles')
    .update({
      patron_status: patronStatus,
      patreon_tier_title: null,
      patreon_tier_id: null,
      patreon_discord_role_ids: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId);

  if (error) {
    console.error('Error clearing user Patreon data:', error);
    return false;
  }

  return true;
}

/**
 * Process Patreon webhook data and update user profile
 * @param webhookData - Parsed webhook payload
 * @returns boolean indicating success
 */
async function processPatreonWebhook(webhookData: PatreonWebhookPayload): Promise<boolean> {
  const member = webhookData.data;
  const tiers = webhookData.included?.filter(item => item.type === 'tier') || [];

  // Extract member data
  const patreonEmail = member.attributes.email;
  const patreonUserId = member.relationships.user.data.id;
  const patronStatus = member.attributes.patron_status;

  // Find matching user
  const user = await matchPatreonToUser(patreonEmail, patreonUserId);
  if (!user) {
      return true; // Not an error - just no match
  }

  // Handle different patron statuses
  if (patronStatus === 'active_patron') {
    // Get current tier information
    const currentTierIds = member.relationships.currently_entitled_tiers.data.map(t => t.id);
    const currentTier = tiers.find(tier => currentTierIds.includes(tier.id));

    const patreonData: DatabaseUserData = {
      patreonUserId: member.id,
      patronStatus: patronStatus,
      tierTitle: currentTier?.attributes.title || null,
      tierId: currentTier?.id || null,
      discordRoles: currentTier?.attributes.discord_role_ids || null
    };

    return await updateUserPatreonData(user.id, patreonData);
  } else if (patronStatus === 'former_patron' || patronStatus === 'declined_patron') {
    // Clear tier data but keep the status for record keeping
    return await clearUserPatreonData(user.id, patronStatus);
  }

  return false;
}

/**
 * Handle Patreon webhook POST requests
 */
export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const body = await request.text();
    const signature = request.headers.get('x-patreon-signature');

    if (!signature) {
      console.error('Missing Patreon signature header');
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }

    // Verify webhook signature
    if (!verifyWebhookSignature(body, signature)) {
      console.error('Invalid webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse webhook payload
    let webhookData: PatreonWebhookPayload;
    try {
      webhookData = JSON.parse(body);
    } catch (error) {
      console.error('Error parsing webhook JSON:', error);
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Validate required fields
    if (!webhookData.data || !webhookData.data.attributes) {
      console.error('Invalid webhook payload structure');
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Process the webhook
    const success = await processPatreonWebhook(webhookData);

    if (!success) {
      return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Unexpected error processing Patreon webhook:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Handle non-POST requests
 */
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}