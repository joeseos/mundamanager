import { createClient } from '@/utils/supabase/server';
import type { UserPermissions, UserProfile } from '@/types/user-permissions';

export class PermissionService {
  /**
   * Fetches user profile from database to check their role
   * @param userId - The user's ID
   * @returns UserProfile with role information (admin, user, moderator)
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
   * Determines user permissions for a specific fighter
   * 
   * Permission Logic:
   * - isOwner: User owns the gang that the fighter belongs to
   * - isAdmin: User has 'admin' role in their profile
   * - canEdit: User is either the gang owner OR an admin
   * - canDelete: User is either the gang owner OR an admin  
   * - canView: Everyone can view fighters (set to true)
   * 
   * @param userId - The current user's ID
   * @param fighterId - The fighter's ID we're checking permissions for
   * @returns UserPermissions object with all permission flags
   */
  async getFighterPermissions(
    userId: string, 
    fighterId: string
  ): Promise<UserPermissions> {
    const supabase = await createClient();
    
    // First, get which gang this fighter belongs to
    const { data: fighter } = await supabase
      .from('fighters')
      .select('gang_id')
      .eq('id', fighterId)
      .single();

    // If fighter has no gang, user gets default permissions (view only)
    if (!fighter?.gang_id) {
      return this.getDefaultPermissions(userId);
    }

    // Check both user role and gang ownership in parallel for efficiency
    const [profile, gangOwnerId] = await Promise.all([
      this.getUserProfile(userId),
      this.getGangOwnership(fighter.gang_id)
    ]);

    // Determine permission flags
    const isAdmin = profile?.user_role === 'admin'; // User has admin role
    const isOwner = gangOwnerId === userId; // User owns the gang this fighter belongs to

    return {
      isOwner,
      isAdmin,
      canEdit: isOwner || isAdmin, // Gang owners can edit their fighters, admins can edit any fighter
      canDelete: isOwner || isAdmin, // Gang owners can delete their fighters, admins can delete any fighter
      canView: true, // Everyone can view fighter details
      userId
    };
  }

  /**
   * Determines user permissions for a specific gang
   * 
   * Permission Logic:
   * - isOwner: User created/owns this specific gang
   * - isAdmin: User has 'admin' role in their profile
   * - canEdit: User is either the gang owner OR an admin
   * - canDelete: User is either the gang owner OR an admin
   * - canView: Everyone can view gangs (set to true)
   * 
   * @param userId - The current user's ID  
   * @param gangId - The gang's ID we're checking permissions for
   * @returns UserPermissions object with all permission flags
   */
  async getGangPermissions(
    userId: string, 
    gangId: string
  ): Promise<UserPermissions> {
    // Check both user role and gang ownership in parallel for efficiency
    const [profile, gangOwnerId] = await Promise.all([
      this.getUserProfile(userId),
      this.getGangOwnership(gangId)
    ]);

    // Determine permission flags
    const isAdmin = profile?.user_role === 'admin'; // User has admin role
    const isOwner = gangOwnerId === userId; // User owns this specific gang

    return {
      isOwner,
      isAdmin,
      canEdit: isOwner || isAdmin, // Gang owners can edit their own gang, admins can edit any gang
      canDelete: isOwner || isAdmin, // Gang owners can delete their own gang, admins can delete any gang
      canView: true, // Everyone can view gang details
      userId
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
}

/**
 * Permission Hierarchy Summary:
 * 
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
 * 3. REGULAR USERS:
 *    - Can only view gangs and fighters
 *    - No edit or delete permissions
 *    - Read-only access
 */ 