import { createClient } from '@/utils/supabase/server';
import type { UserPermissions, CampaignPermissions } from '@/types/user-permissions';
import { getClaims } from '@/utils/auth';

export async function computeGangPermissions(
  userId: string,
  gangOwnerId: string,
  gangCampaignIds: string[]
): Promise<UserPermissions> {
  const supabase = await createClient();
  const claims = await getClaims(supabase);

  const isAdmin = claims?.profile?.user_role === 'admin' || false;
  const isOwner = gangOwnerId === userId;

  const gangCampaignIdSet = new Set(gangCampaignIds);
  const hasArbPermission = (claims?.campaignRoles ?? []).some(
    cr => gangCampaignIdSet.has(cr.id) && (cr.role === 'OWNER' || cr.role === 'ARBITRATOR')
  );

  const canEdit = isOwner || isAdmin || hasArbPermission;

  return {
    isOwner,
    isAdmin,
    canEdit,
    canDelete: canEdit,
    canView: true,
    userId,
  };
}

export async function computeGangPermissionsByGangId(
  userId: string,
  gangId: string
): Promise<UserPermissions> {
  const supabase = await createClient();

  const [{ data: gang }, { data: campaignGangs }] = await Promise.all([
    supabase.from('gangs').select('user_id').eq('id', gangId).single(),
    supabase.from('campaign_gangs').select('campaign_id').eq('gang_id', gangId).eq('status', 'ACCEPTED'),
  ]);

  const gangOwnerId = gang?.user_id ?? '';
  const gangCampaignIds = (campaignGangs || []).map((cg: { campaign_id: string }) => cg.campaign_id);

  return computeGangPermissions(userId, gangOwnerId, gangCampaignIds);
}

export async function canViewHiddenGang(
  userId: string,
  gangOwnerId: string,
  gangCampaignIds: string[],
  isHidden: boolean
): Promise<boolean> {
  if (!isHidden) return true;

  const permissions = await computeGangPermissions(userId, gangOwnerId, gangCampaignIds);
  return permissions.isOwner || permissions.isAdmin || permissions.canEdit;
}

export async function isCampaignArbitrator(
  userId: string,
  campaignId: string | null
): Promise<boolean> {
  const supabase = await createClient();
  const claims = await getClaims(supabase);
  if (!claims) return false;

  if (claims.profile?.user_role === 'admin') return true;
  if (!campaignId) return false;

  const match = claims.campaignRoles.find(cr => cr.id === campaignId);
  return match?.role === 'OWNER' || match?.role === 'ARBITRATOR';
}

export async function getCampaignPermissions(
  userId: string,
  campaignId: string
): Promise<CampaignPermissions> {
  const supabase = await createClient();
  const claims = await getClaims(supabase);

  const isAdmin = claims?.profile?.user_role === 'admin' || false;
  const match = claims?.campaignRoles.find(cr => cr.id === campaignId);
  const campaignRole = (match?.role as 'OWNER' | 'ARBITRATOR' | 'MEMBER') ?? null;

  if (!campaignRole && !isAdmin) {
    return defaultCampaignPermissions(userId);
  }

  const isOwner = campaignRole === 'OWNER';
  const isArbitrator = campaignRole === 'ARBITRATOR';
  const isMember = campaignRole === 'MEMBER';

  const hasOwnerPermissions = isOwner || isAdmin;
  const hasArbitratorPermissions = isArbitrator || hasOwnerPermissions;
  const hasMemberPermissions = isMember || hasArbitratorPermissions;

  return {
    isOwner,
    isAdmin,
    canEdit: hasArbitratorPermissions,
    canDelete: hasOwnerPermissions,
    canView: true,
    userId,
    isArbitrator,
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

function defaultCampaignPermissions(userId: string): CampaignPermissions {
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