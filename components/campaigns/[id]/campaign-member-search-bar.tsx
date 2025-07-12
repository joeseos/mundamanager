'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { addMemberToCampaign } from '@/app/actions/campaigns/[id]/campaign-members';

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
  campaignMembers,
  onMemberAdd,
  disabled = false,
}: MemberSearchBarProps) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const supabase = createClient();
  const { toast } = useToast();

  // Search functionality using an API route
  useEffect(() => {
    const searchUsers = async () => {
      if (query.trim() === '') {
        setSearchResults([]);
        return;
      }
      setIsLoading(true);
      try {
        const response = await fetch(
          `/api/search-users?query=${encodeURIComponent(query)}`
        );

        if (!response.ok) {
          throw new Error('Failed to search users');
        }

        const profilesData = await response.json();

        // Transform to Member type (allow existing members to be added again)
        const transformedResults: Member[] = (profilesData || []).map(
          (profile: { id: string; username: string }) => ({
            user_id: profile.id,
            username: profile.username,
            role: 'MEMBER' as MemberRole,
            status: null,
            invited_at: new Date().toISOString(),
            joined_at: null,
            invited_by: '',
            profile: {
              id: profile.id,
              username: profile.username,
              updated_at: new Date().toISOString(),
              user_role: 'user',
            },
            gangs: [],
          })
        );

        setSearchResults(transformedResults);
      } catch (error) {
        console.error('Error searching users:', error);
        setSearchResults([]);
        toast({
          variant: 'destructive',
          description: 'Failed to search users',
        });
      } finally {
        setIsLoading(false);
      }
    };
    const debounceTimer = setTimeout(searchUsers, 300);
    return () => clearTimeout(debounceTimer);
  }, [query, toast]);

  const handleAddMember = async (member: Member) => {
    setIsAdding(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('Not authenticated');
      }

      // ✅ Use server action with proper cache invalidation
      const result = await addMemberToCampaign({
        campaignId,
        userId: member.user_id,
        role: 'MEMBER',
        invitedBy: user.id,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      console.log('Member added successfully:', result.data);

      // Create member object for local state update
      const newMember = {
        ...member,
        id: result.data?.id,
        role: 'MEMBER' as MemberRole,
        gangs: [], // Start with an empty gangs array for the new instance
      };

      onMemberAdd(newMember);
      toast({
        description: `Added ${member.username} to the campaign`,
      });
      setQuery('');
      setSearchResults([]);
    } catch (error) {
      console.error('Error adding member to campaign:', error);
      toast({
        variant: 'destructive',
        description: 'Failed to add member to campaign',
      });
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="relative mb-4">
      <Input
        type="text"
        placeholder="Search users by username"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full"
        disabled={disabled || isAdding}
      />
      {isLoading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      )}
      {searchResults.length > 0 && query && (
        <div className="absolute mt-1 w-full bg-white rounded-lg border shadow-lg z-10">
          <ul className="py-2">
            {searchResults.map((profile) => (
              <li key={profile.user_id}>
                <button
                  onClick={() => handleAddMember(profile)}
                  className="w-full px-4 py-2 text-left hover:bg-gray-100"
                  disabled={isAdding}
                >
                  <span className="font-medium">{profile.username}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
