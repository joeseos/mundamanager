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