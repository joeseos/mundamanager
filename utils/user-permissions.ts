import 'server-only';

import { createClient } from '@/utils/supabase/server';
import type { UserPermissions, CampaignPermissions } from '@/types/user-permissions';
import type { CampaignRole } from '@/types/user-permissions';
import { unstable_cache } from 'next/cache';
import { TAGS } from '@/utils/cache-tags';
export interface CheckPermissionResult {
  is_admin: boolean;
  campaign_role: CampaignRole | null;
}

export async function checkPermission(
  userId: string,
  opts: { campaignId?: string | null; gangId?: string | null } = {}
): Promise<CheckPermissionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('check_permission', {
    p_user_id: userId,
    p_campaign_id: opts.campaignId ?? null,
    p_gang_id: opts.gangId ?? null,
  });

  if (error) {
    console.error('Error in check_permission RPC:', error);
    return { is_admin: false, campaign_role: null };
  }

  return data as CheckPermissionResult;
}

export async function checkPermissionCached(
  userId: string,
  gangId: string,
  gangOwnerId: string | null
): Promise<UserPermissions> {
  const supabase = await createClient();

  return unstable_cache(
    async (uid: string, gid: string, ownerId: string | null) => {
      try {
        const { data, error } = await supabase.rpc('check_permission', {
          p_user_id: uid,
          p_campaign_id: null,
          p_gang_id: gid,
        });

        if (error) {
          console.error('Error in checkPermissionCached RPC:', error);
          return { isOwner: false, isAdmin: false, canEdit: false, canDelete: false, canView: true, userId: uid };
        }

        return deriveGangPermissions(uid, ownerId, data as CheckPermissionResult);
      } catch (err) {
        console.error('Exception in checkPermissionCached:', err);
        return { isOwner: false, isAdmin: false, canEdit: false, canDelete: false, canView: true, userId: uid };
      }
    },
    [`check-permission-${userId}-${gangId}`],
    {
      tags: [TAGS.permission(userId, gangId)],
      revalidate: false,
    }
  )(userId, gangId, gangOwnerId);
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
