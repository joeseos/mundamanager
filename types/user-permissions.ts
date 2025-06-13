export interface UserPermissions {
  isOwner: boolean;
  isAdmin: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canView: boolean;
  userId: string;
}

export type UserRole = 'admin' | 'user' | 'moderator';

export interface UserProfile {
  id: string;
  user_role: UserRole;
} 