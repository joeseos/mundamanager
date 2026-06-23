export interface UserPermissions {
  isOwner: boolean;
  isAdmin: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canView: boolean;
  userId: string;
}

// Add campaign-specific permissions interface
export interface CampaignPermissions extends UserPermissions {
  isArbitrator: boolean;
  isMember: boolean;
  canEditCampaign: boolean;
  canDeleteCampaign: boolean;
  canManageMembers: boolean;
  canManageTerritories: boolean;
  canEditTerritories: boolean;
  canDeleteTerritories: boolean;
  canClaimTerritories: boolean;
  canAddBattleLogs: boolean;
  canEditBattleLogs: boolean;
  campaignRole: 'OWNER' | 'ARBITRATOR' | 'MEMBER' | null;
}

export type UserRole = 'admin' | 'user';
export type CampaignRole = 'OWNER' | 'ARBITRATOR' | 'MEMBER';

export interface UserProfile {
  id: string;
  user_role: UserRole;
}

export interface CampaignMember {
  user_id: string;
  role: CampaignRole;
  status: string | null;
}

// Display-only profile data from JWT. Do NOT use for access control — use DB checks (checkAdmin, is_admin, is_arb).
export interface UserProfileClaims {
  user_role: string;
  username: string | null;
  patreon_tier_id: string | null;
  patreon_tier_title: string | null;
  patron_status: string | null;
} 