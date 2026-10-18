import { TAGS } from '@/utils/cache-tags';
import 'server-only';

import { sql } from 'drizzle-orm';
import { getAppDb } from '@/utils/db/client';
import type { UserPermissions, CampaignPermissions } from '@/types/user-permissions';
import type { CampaignRole } from '@/types/user-permissions';
import { unstable_cache } from 'next/cache';

export interface CheckPermissionResult {
  is_admin: boolean;
  campaign_role: CampaignRole | null;
}

/**
 * The check_permission SQL function's verdict for userId. It takes the user as an
 * argument rather than reading the session, so it runs over the direct connection.
 */
async function queryPermission(
  userId: string,
  campaignId: string | null,
  gangId: string | null
): Promise<CheckPermissionResult> {
  const [row] = await getAppDb().execute<{ result: CheckPermissionResult }>(
    sql`select public.check_permission(${userId}::uuid, ${campaignId}::uuid, ${gangId}::uuid) as result`
  );
  return row.result;
}

export async function checkPermission(
  userId: string,
  opts: { campaignId?: string | null; gangId?: string | null } = {}
): Promise<CheckPermissionResult> {
  try {
    return await queryPermission(userId, opts.campaignId ?? null, opts.gangId ?? null);
  } catch (error) {
    console.error('Error in check_permission:', error);
    return { is_admin: false, campaign_role: null };
  }
}

export async function checkPermissionCached(
  userId: string,
  gangId: string,
  gangOwnerId: string | null
): Promise<UserPermissions> {
  // Settled outside the cache so an owner keeps canEdit even if the query or cache is broken.
  const withOwnership = (permissions: UserPermissions): UserPermissions =>
    gangOwnerId !== null && gangOwnerId === userId
      ? { ...permissions, isOwner: true, canEdit: true, canDelete: true }
      : permissions;

  try {
    const permissions = await unstable_cache(
      // A failed query must throw: unstable_cache persists a returned deny, and
      // revalidate: false makes it permanent.
      async (uid: string, gid: string, ownerId: string | null) =>
        deriveGangPermissions(uid, ownerId, await queryPermission(uid, null, gid)),
      [`check-permission-${userId}-${gangId}`],
      {
        tags: [
          TAGS.permission(userId, gangId),
          TAGS.userPermissions(userId),
        ],
        revalidate: false,
      }
    )(userId, gangId, gangOwnerId);

    return withOwnership(permissions);
  } catch (err) {
    console.error('checkPermissionCached failed, falling back to an uncached check:', err);
    const result = await checkPermission(userId, { gangId });
    return withOwnership(deriveGangPermissions(userId, gangOwnerId, result));
  }
}

export function isArbitrator(result: CheckPermissionResult): boolean {
  return result.is_admin || result.campaign_role === 'OWNER' || result.campaign_role === 'ARBITRATOR';
}

export function deriveGangPermissions(
  userId: string,
  gangOwnerId: string | null,
  result: CheckPermissionResult
): UserPermissions {
  const isOwner = gangOwnerId === userId;
  const hasAuthority = isOwner || isArbitrator(result);

  return {
    isOwner,
    isAdmin: result.is_admin,
    canEdit: hasAuthority,
    canDelete: hasAuthority,
    canView: true,
    userId,
  };
}

export function deriveCampaignPermissions(
  userId: string,
  result: CheckPermissionResult
): CampaignPermissions {
  const { is_admin: isAdmin, campaign_role: campaignRole } = result;

  if (!campaignRole && !isAdmin) {
    return getDefaultCampaignPermissions(userId);
  }

  const isOwner = campaignRole === 'OWNER';
  const isArb = campaignRole === 'ARBITRATOR';
  const isMember = campaignRole === 'MEMBER';

  const hasOwnerPermissions = isOwner || isAdmin;
  const hasArbitratorPermissions = isArb || hasOwnerPermissions;
  const hasMemberPermissions = isMember || hasArbitratorPermissions;

  return {
    isOwner,
    isAdmin,
    canEdit: hasArbitratorPermissions,
    canDelete: hasOwnerPermissions,
    canView: true,
    userId,
    isArbitrator: isArb,
    isMember,
    canEditCampaign: hasArbitratorPermissions,
    canDeleteCampaign: hasOwnerPermissions,
    canManageMembers: hasArbitratorPermissions,
    canManageTerritories: hasArbitratorPermissions,
    canEditTerritories: hasMemberPermissions,
    canDeleteTerritories: hasArbitratorPermissions,
    canClaimTerritories: hasMemberPermissions,
    canAddBattleLogs: hasMemberPermissions,
    canEditBattleLogs: hasArbitratorPermissions,
    campaignRole,
  };
}

function getDefaultCampaignPermissions(userId: string): CampaignPermissions {
  return {
    isOwner: false,
    isAdmin: false,
    canEdit: false,
    canDelete: false,
    canView: true,
    userId,
    isArbitrator: false,
    isMember: false,
    canEditCampaign: false,
    canDeleteCampaign: false,
    canManageMembers: false,
    canManageTerritories: false,
    canEditTerritories: false,
    canDeleteTerritories: false,
    canClaimTerritories: false,
    canAddBattleLogs: false,
    canEditBattleLogs: false,
    campaignRole: null,
  };
}

export async function checkCampaignArbitrator(
  userId: string,
  campaignId: string | null
): Promise<boolean> {
  if (!campaignId) {
    const result = await checkPermission(userId);
    return result.is_admin;
  }
  const result = await checkPermission(userId, { campaignId });
  return isArbitrator(result);
}

export async function checkCampaignPermissions(
  userId: string,
  campaignId: string
): Promise<CampaignPermissions> {
  const result = await checkPermission(userId, { campaignId });
  return deriveCampaignPermissions(userId, result);
}

export async function canViewHiddenGang(
  userId: string,
  gangId: string,
  gangOwnerId: string,
  isHidden: boolean
): Promise<boolean> {
  if (!isHidden) return true;
  if (gangOwnerId === userId) return true;
  const result = await checkPermission(userId, { gangId });
  return isArbitrator(result);
} 
