import { createClient } from '@/utils/supabase/server';
import type { UserPermissions, UserProfile, CampaignPermissions } from '@/types/user-permissions';
import { unstable_cache } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';

export class PermissionService {
  /**
   * Fetches user profile from database to check their role
   * @param userId - The user's ID
   * @returns UserProfile with role information (admin, user)
   */
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    const supabase = await createClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, user_role')
      .eq('id', userId)
      .single();

    return profile;
  }

  /**
   * Gets the owner ID of a specific gang
   * @param gangId - The gang's ID
   * @returns The user ID of the gang owner, or null if not found
   */
  async getGangOwnership(gangId: string): Promise<string | null> {
    const supabase = await createClient();
    const { data: gang } = await supabase
      .from('gangs')
      .select('user_id')
      .eq('id', gangId)
      .single();

    return gang?.user_id || null;
  }

  /**
   * Gets the user's highest role across all campaigns that a gang belongs to
   * @param userId - The user's ID
   * @param gangId - The gang's ID
   * @returns The user's highest role across campaigns, or null if not a member
   */
  async getUserRoleInGangCampaigns(userId: string, gangId: string): Promise<'OWNER' | 'ARBITRATOR' | 'MEMBER' | null> {
    const supabase = await createClient();
    
    // First get campaign IDs for this gang
    const { data: campaignGangs, error: campaignGangsError } = await supabase
      .from('campaign_gangs')
      .select('campaign_id')
      .eq('gang_id', gangId);

    if (campaignGangsError || !campaignGangs || campaignGangs.length === 0) {
      return null;
    }

    const campaignIds = campaignGangs.map(cg => cg.campaign_id);

    // Then get user's roles in those campaigns
    const { data: userRoles, error } = await supabase
      .from('campaign_members')
      .select('role')
      .eq('user_id', userId)
      .in('campaign_id', campaignIds);

    if (error || !userRoles || userRoles.length === 0) {
      return null;
    }

    // Return the highest role across all campaigns
    // Role hierarchy: OWNER > ARBITRATOR > MEMBER
    const roles = userRoles.map(r => r.role);
    
    if (roles.includes('OWNER')) {
      return 'OWNER';
    } else if (roles.includes('ARBITRATOR')) {
      return 'ARBITRATOR';
    } else if (roles.includes('MEMBER')) {
      return 'MEMBER';
    }
    
    return null;
  }

  /**
   * Gets the user's role in a specific campaign
   * @param userId - The user's ID
   * @param campaignId - The campaign's ID
   * @returns The user's role in the campaign, or null if not a member
   */
  async getCampaignRole(userId: string, campaignId: string): Promise<'OWNER' | 'ARBITRATOR' | 'MEMBER' | null> {
    const supabase = await createClient();
    
    // Use select without .single() since users can have multiple entries (different gangs)
    const { data: members, error } = await supabase
      .from('campaign_members')
      .select('role')
      .eq('user_id', userId)
      .eq('campaign_id', campaignId);

    if (error || !members || members.length === 0) {
      return null;
    }

    // If user has multiple entries (multiple gangs), return the highest role
    // Role hierarchy: OWNER > ARBITRATOR > MEMBER
    const roles = members.map(m => m.role);
    
    if (roles.includes('OWNER')) {
      return 'OWNER';
    } else if (roles.includes('ARBITRATOR')) {
      return 'ARBITRATOR';
    } else if (roles.includes('MEMBER')) {
      return 'MEMBER';
    }
    
    return null;
  }

  /**
   * Check if a user can view a hidden gang
   *
   * Permission Logic:
   * - Gang is not hidden: everyone can view
   * - Gang is hidden: only owner, admin, or campaign owner/arbitrator can view
   *
   * @param userId - The current user's ID
   * @param gangId - The gang's ID
   * @param isHidden - Whether the gang is hidden
   * @returns boolean indicating if user can view the hidden gang
   */
  async canViewHiddenGang(
    userId: string,
    gangId: string,
    isHidden: boolean
  ): Promise<boolean> {
    // If gang is not hidden, everyone can view
    if (!isHidden) {
      return true;
    }

    // Get user permissions for this gang
    const permissions = await this.getGangPermissions(userId, gangId);

    // Allow viewing if user is owner, admin, or has campaign permissions
    return permissions.isOwner || permissions.isAdmin || permissions.canEdit;
  }

  /**
   * Determines user permissions for a specific gang
   *
   * Permission Logic:
   * - isOwner: User created/owns this specific gang
   * - isAdmin: User has 'admin' role in their profile
   * - canEdit: User is either the gang owner OR an admin OR campaign owner/arbitrator
   * - canDelete: User is either the gang owner OR an admin OR campaign owner/arbitrator
   * - canView: Everyone can view gangs (set to true)
   *
   * Performance: Uses cached RPC call - reduces 3 uncached queries to 1 cached RPC call
   *
   * @param userId - The current user's ID
   * @param gangId - The gang's ID we're checking permissions for
   * @returns UserPermissions object with all permission flags
   */
  async getGangPermissions(
    userId: string,
    gangId: string
  ): Promise<UserPermissions> {
    const supabase = await createClient();

    return unstable_cache(
      async () => {
        try {
          const { data, error } = await supabase
            .rpc('get_gang_permissions', {
              p_user_id: userId,
              p_gang_id: gangId
            });

          if (error) {
            console.error('Error fetching gang permissions:', error);
            return this.getDefaultPermissions(userId);
          }

          // RPC returns JSON, parse it to UserPermissions
          return data as UserPermissions;
        } catch (err) {
          console.error('Exception in getGangPermissions:', err);
          return this.getDefaultPermissions(userId);
        }
      },
      [`gang-permissions-${userId}-${gangId}`],
      {
        tags: [CACHE_TAGS.USER_GANG_PERMISSIONS(userId, gangId)],
        revalidate: false // Event-driven invalidation only
      }
    )();
  }

  /**
   * Determines user permissions for a specific campaign
   * 
   * Permission Logic:
   * 1. APP ADMIN = same permissions as campaign owner (full control)
   * 2. CAMPAIGN OWNER = full control and should see all buttons and edit everything
   * 3. ARBITRATOR = same as Owner, but cannot delete a campaign  
   * 4. MEMBER = can add battle logs and manage territories
   * 5. NON-MEMBER = read-only access (similar to 'user' role in gang/fighter system)
   * 
   * @param userId - The current user's ID
   * @param campaignId - The campaign's ID we're checking permissions for
   * @returns CampaignPermissions object with all permission flags
   */
  async getCampaignPermissions(
    userId: string, 
    campaignId: string
  ): Promise<CampaignPermissions> {
    // Check both user profile and campaign role in parallel
    const [userProfile, campaignRole] = await Promise.all([
      this.getUserProfile(userId),
      this.getCampaignRole(userId, campaignId)
    ]);

    // Check if user is an app admin
    const isAdmin = userProfile?.user_role === 'admin';

    // If user is not a member of the campaign and not an app admin, they get read-only access
    if (!campaignRole && !isAdmin) {
      return this.getDefaultCampaignPermissions(userId);
    }

    // Determine permission flags based on role
    const isOwner = campaignRole === 'OWNER';
    const isArbitrator = campaignRole === 'ARBITRATOR';
    const isMember = campaignRole === 'MEMBER';

    // App admins get same permissions as campaign owners
    const hasOwnerPermissions = isOwner || isAdmin;
    const hasArbitratorPermissions = isArbitrator || hasOwnerPermissions;
    const hasMemberPermissions = isMember || hasArbitratorPermissions;

    return {
      // Base UserPermissions
      isOwner,
      isAdmin,
      canEdit: hasArbitratorPermissions,
      canDelete: hasOwnerPermissions,
      canView: true,
      userId,
      
      // Campaign-specific permissions
      isArbitrator,
      isMember,
      canEditCampaign: hasArbitratorPermissions,              // Owner + Arbitrator + App Admin can edit campaign settings
      canDeleteCampaign: hasOwnerPermissions,                 // Only Owner + App Admin can delete campaign
      canManageMembers: hasArbitratorPermissions,             // Owner + Arbitrator + App Admin can add/remove members
      canManageTerritories: hasArbitratorPermissions,         // Only Owner + Arbitrator + App Admin can manage territories
      canEditTerritories: hasMemberPermissions,               // All members + higher roles can edit territories
      canDeleteTerritories: hasArbitratorPermissions,         // Only Owner + Arbitrator + App Admin can delete territories
      canClaimTerritories: hasMemberPermissions,              // All members + higher roles can claim territories
      canAddBattleLogs: hasMemberPermissions,                 // All members + higher roles can add battle logs
      canEditBattleLogs: hasArbitratorPermissions,            // Only Owner + Arbitrator + App Admin can edit battle logs
      campaignRole
    };
  }

  /**
   * Returns default permissions for users with no special access
   * Used when:
   * - Fighter has no associated gang
   * - User has no ownership or admin privileges
   * - Fallback for error cases
   * 
   * @param userId - The current user's ID
   * @returns UserPermissions with only view access granted
   */
  private getDefaultPermissions(userId: string): UserPermissions {
    return {
      isOwner: false,        // User doesn't own the resource
      isAdmin: false,        // User is not an admin
      canEdit: false,        // No edit permissions
      canDelete: false,      // No delete permissions  
      canView: true,         // Everyone gets view access
      userId
    };
  }

  /**
   * Returns default campaign permissions for users with no campaign access
   * Used when:
   * - User is not a member of the campaign and not an app admin
   * - Similar to 'user' role in gang/fighter system - read-only access
   * 
   * @param userId - The current user's ID
   * @returns CampaignPermissions with only view access granted (like regular 'user' role)
   */
  private getDefaultCampaignPermissions(userId: string): CampaignPermissions {
    return {
      // Base UserPermissions - same as regular 'user' role
      isOwner: false,
      isAdmin: false,
      canEdit: false,
      canDelete: false,
      canView: true,          // Everyone can view campaigns (read-only)
      userId,
      
      // Campaign-specific permissions - all false except view
      isArbitrator: false,
      isMember: false,
      canEditCampaign: false,
      canDeleteCampaign: false,
      canManageMembers: false,
      canManageTerritories: false,
      canEditTerritories: false,
      canDeleteTerritories: false,
      canClaimTerritories: false,  // Non-members cannot claim territories
      canAddBattleLogs: false,    // Non-members cannot add battle logs
      canEditBattleLogs: false,
      campaignRole: null
    };
  }
}

/**
 * Permission Hierarchy Summary:
 * 
 * GANG/FIGHTER PERMISSIONS:
 * 1. ADMINS (user_role = 'admin'):
 *    - Can edit/delete ANY gang or fighter
 *    - Override all ownership restrictions
 *    - System-wide permissions
 * 
 * 2. GANG OWNERS (gangs.user_id = userId):
 *    - Can edit/delete their own gang
 *    - Can edit/delete fighters that belong to their gang
 *    - Limited to their own resources
 * 
 * 3. REGULAR USERS (user_role = 'user'):
 *    - Can only view gangs and fighters
 *    - No edit or delete permissions
 *    - Read-only access
 * 
 * CAMPAIGN PERMISSIONS:
 * 1. APP ADMIN (user_role = 'admin'):
 *    - Same permissions as campaign owner
 *    - Can edit/delete ANY campaign
 *    - Override all campaign role restrictions
 *    - System-wide permissions
 * 
 * 2. CAMPAIGN OWNER:
 *    - Full control over their campaign
 *    - Can edit campaign settings
 *    - Can delete campaign
 *    - Can manage members and territories
 *    - Can add and edit battle logs
 * 
 * 3. ARBITRATOR:
 *    - Same as Owner except cannot delete campaign
 *    - Can edit campaign settings
 *    - Can manage members and territories
 *    - Can delete territories
 *    - Can add and edit battle logs
 * 
 * 4. MEMBER:
 *    - Can add battle logs and claim territories
 *    - Can edit territories (set ruined/default status)
 *    - Cannot edit campaign, manage members, or delete territories
 *    - Read-only access to everything else
 * 
 * 5. NON-MEMBER:
 *    - Read-only access to campaign (like regular 'user' role)
 *    - Cannot add battle logs or interact with campaign
 */ 