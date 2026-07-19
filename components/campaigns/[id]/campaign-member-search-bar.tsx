'use client'

import { useState } from 'react'
import { createClient } from "@/utils/supabase/client"
import { toast } from 'sonner';
import { addMemberToCampaign } from "@/app/actions/campaigns/[id]/campaign-members"
import UserSearchBar, { type UserSearchResult } from '@/components/shared/user-search-bar'

type MemberRole = 'OWNER' | 'ARBITRATOR' | 'MEMBER';

interface Member {
  id?: string;
  user_id: string;
  username: string;
  role: MemberRole;
  status: string | null;
  invited_at: string;
  joined_at: string | null;
  invited_by: string;
  profile: {
    id: string;
    username: string;
    updated_at: string;
    user_role: string;
  };
  gangs: {
    id: string;
    gang_id: string;
    gang_name: string;
    status: string | null;
    rating?: number;
  }[];
}

interface MemberSearchBarProps {
  campaignId: string;
  campaignMembers: Member[];
  onMemberAdd: (member: Member) => void;
  disabled?: boolean;
}

export default function MemberSearchBar({
  campaignId,
  campaignMembers: _campaignMembers,
  onMemberAdd,
  disabled = false
}: MemberSearchBarProps) {
  const [isAdding, setIsAdding] = useState(false)
  const supabase = createClient()

  const handleAddMember = async (user: UserSearchResult) => {
    setIsAdding(true)
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (!authUser) {
        throw new Error('Not authenticated');
      }

      // ✅ Use server action with proper cache invalidation
      const result = await addMemberToCampaign({
        campaignId,
        userId: user.id,
        role: 'MEMBER',
        invitedBy: authUser.id
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      console.log("Member added successfully:", result.data);

      // Create member object for local state update (allow existing members to be added again)
      const newMember: Member = {
        id: result.data?.id,
        user_id: user.id,
        username: user.username,
        role: 'MEMBER',
        status: null,
        invited_at: new Date().toISOString(),
        joined_at: null,
        invited_by: '',
        profile: {
          id: user.id,
          username: user.username,
          updated_at: new Date().toISOString(),
          user_role: 'user'
        },
        gangs: []  // Start with an empty gangs array for the new instance
      };

      onMemberAdd(newMember);
      toast.success(`Added ${user.username} to the campaign`);
    } catch (error) {
      console.error('Error adding member to campaign:', error);
      toast.error("Failed to add member to campaign");
    } finally {
      setIsAdding(false)
    }
  };

  return (
    <div className="mb-4">
      <UserSearchBar
        placeholder="Search players by their username"
        onSelect={handleAddMember}
        disabled={disabled || isAdding}
      />
    </div>
  )
}
