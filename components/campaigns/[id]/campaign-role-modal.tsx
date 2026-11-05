'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import Modal from '@/components/ui/modal'
import { updateMemberRole } from '@/app/actions/campaigns/[id]/campaign-members'
import type { CampaignRole } from '@/types/campaign'

export interface RoleChangeTarget {
  memberId: string;
  username: string;
  currentRole: CampaignRole;
}

interface CampaignRoleModalProps {
  campaignId: string;
  target: RoleChangeTarget;
  /** The campaign Owner (or a site admin) may hand the Owner role to an Arbitrator. */
  canTransferOwnership: boolean;
  onClose: () => void;
  onRoleChange: (userId: string, newRole: CampaignRole) => void;
}

export default function CampaignRoleModal({
  campaignId,
  target,
  canTransferOwnership,
  onClose,
  onRoleChange
}: CampaignRoleModalProps) {
  const roleOptions: CampaignRole[] = target.currentRole === 'MEMBER'
    ? ['ARBITRATOR']
    : canTransferOwnership ? ['MEMBER', 'OWNER'] : ['MEMBER'];
  const [newRole, setNewRole] = useState<CampaignRole>(roleOptions[0]);
  const isTransfer = newRole === 'OWNER';

  const handleConfirm = async () => {
    const result = await updateMemberRole({
      campaignId,
      userId: target.memberId,
      newRole,
      previousRole: target.currentRole
    }).catch((error) => {
      console.error('Error updating role:', error);
      return null;
    });

    if (!result?.success) {
      toast.error(result?.error ?? 'Failed to update role');
      return false;
    }

    onRoleChange(target.memberId, newRole);
    toast.success(isTransfer
      ? `${target.username} is now the campaign Owner`
      : `Updated ${target.username}'s role to ${newRole}`);
    return true;
  };

  return (
    <Modal
      title="Change Player Role"
      content={
        <div className="space-y-4 text-sm text-muted-foreground">
          {roleOptions.length === 1 ? (
            <p>
              Are you sure you want to change <span className="font-bold">{target.username}</span>&apos;s role from{' '}
              <span className="font-bold">{target.currentRole}</span> to{' '}
              <span className="font-bold">{newRole}</span>?
            </p>
          ) : (
            <>
              <p>
                Change <span className="font-bold">{target.username}</span>&apos;s role from{' '}
                <span className="font-bold">{target.currentRole}</span> to:
              </p>
              <div className="space-y-2">
                {roleOptions.map(role => (
                  <label key={role} className="flex items-center gap-2 cursor-pointer text-foreground">
                    <input
                      type="radio"
                      name="member-role"
                      checked={newRole === role}
                      onChange={() => setNewRole(role)}
                      className="h-4 w-4"
                    />
                    {role}
                  </label>
                ))}
              </div>
              {isTransfer && (
                <p className="text-red-600">
                  The campaign can only have one Owner. The current Owner will become an Arbitrator.
                </p>
              )}
            </>
          )}
        </div>
      }
      onClose={onClose}
      onConfirm={handleConfirm}
      confirmText={isTransfer ? 'Transfer Ownership' : 'Change Role'}
    />
  );
}
