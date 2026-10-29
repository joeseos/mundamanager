'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LuSquarePen } from 'react-icons/lu';
import { toast } from 'sonner';
import Modal from '@/components/ui/modal';
import { List } from '@/components/ui/list';
import UserSearchBar, { type UserSearchResult } from '@/components/shared/user-search-bar';
import { useClaims } from '@/hooks/use-claims';
import { USER_ROLES, type UserRole } from '@/types/user-permissions';

type RoleHolder = UserSearchResult & { user_role: UserRole };

const ROLE_LABELS: Record<UserRole, string> = { user: 'User', moderator: 'Moderator', admin: 'Admin' };
const TEAMS = ['admin', 'moderator'] as const;
const ROLES_QUERY_KEY = ['admin-user-roles'];

async function fetchRoleHolders(): Promise<RoleHolder[]> {
  const response = await fetch('/api/admin/user-roles');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to load user roles');
  return data;
}

export function AdminUserRolesModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { userId, loading: claimsLoading } = useClaims();
  const { data: roleHolders = [], isLoading, isError, isSuccess } = useQuery({
    queryKey: ROLES_QUERY_KEY,
    queryFn: fetchRoleHolders,
  });
  const [editing, setEditing] = useState<RoleHolder | null>(null);
  const [role, setRole] = useState<UserRole>('user');

  const startEditing = (user: RoleHolder) => {
    setEditing(user);
    setRole(user.user_role);
  };

  const handleSave = async () => {
    if (!editing) return false;
    try {
      const response = await fetch('/api/admin/user-roles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: editing.id, role }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update user role');

      await queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
      toast.success(`${editing.username} is now ${role === 'admin' ? 'an' : 'a'} ${ROLE_LABELS[role]}`);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update user role');
      return false;
    }
  };

  return (
    <Modal
      title="User Roles"
      helper="See who is on the Admin and Moderator teams, and change a user's role."
      onClose={onClose}
      width="2xl"
    >
      <UserSearchBar
        placeholder="Search a user to edit their role"
        disabled={!isSuccess || claimsLoading}
        excludeIds={userId ? [userId] : []}
        onSelect={(user) =>
          startEditing({
            ...user,
            user_role: roleHolders.find((holder) => holder.id === user.id)?.user_role ?? 'user',
          })
        }
      />

      {TEAMS.map((team) => (
        <List
          key={team}
          title={`${ROLE_LABELS[team]} Team`}
          items={roleHolders.filter((holder) => holder.user_role === team)}
          columns={[
            {
              key: 'username',
              label: 'Username',
              render: (username: string, holder: RoleHolder) => (
                <Link href={`/user/${holder.id}`} prefetch={false} className="hover:underline">
                  {username}
                </Link>
              ),
            },
          ]}
          actions={[
            {
              icon: <LuSquarePen className="h-4 w-4" />,
              title: 'Edit user role',
              variant: 'outline',
              onClick: startEditing,
              disabled: (holder: RoleHolder) => holder.id === userId,
            },
          ]}
          isLoading={isLoading}
          emptyMessage={isError ? 'Failed to load user roles.' : `No ${ROLE_LABELS[team].toLowerCase()}s.`}
        />
      ))}

      {editing && (
        <Modal
          title="Edit user role"
          helper={editing.username}
          content={
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full p-2 border rounded-md"
            >
              {USER_ROLES.map((value) => (
                <option key={value} value={value}>
                  {ROLE_LABELS[value]}
                </option>
              ))}
            </select>
          }
          onClose={() => setEditing(null)}
          onConfirm={handleSave}
          confirmText="Save"
          confirmDisabled={role === editing.user_role}
          width="sm"
        />
      )}
    </Modal>
  );
}
