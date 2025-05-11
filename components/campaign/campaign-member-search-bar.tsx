'use client'

import { useState, useEffect } from 'react'
import { Input } from "@/components/ui/input"
import { createClient } from "@/utils/supabase/client"
import { useToast } from "@/components/ui/use-toast"

type MemberRole = 'OWNER' | 'ARBITRATOR' | 'MEMBER';

interface Member {
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
  disabled = false
}: MemberSearchBarProps) {
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Member[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const supabase = createClient()
  const { toast } = useToast()

  // Search functionality
  useEffect(() => {
    const searchUsers = async () => {
      if (query.trim() === '') {
        setSearchResults([])
        return
      }

      setIsLoading(true)
      try {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, username')
          .ilike('username', `%${query}%`)
          .limit(5);

        if (profilesError) throw profilesError;

        // Transform profile data to Member type
        const transformedResults: Member[] = (profilesData || []).map(profile => ({
          user_id: profile.id,
          username: profile.username,
          role: 'MEMBER',
          status: null,
          invited_at: new Date().toISOString(),
          joined_at: null,
          invited_by: '',
          profile: {
            id: profile.id,
            username: profile.username,
            updated_at: new Date().toISOString(),
            user_role: 'user'
          },
          gangs: []
        }));

        // Filter out users that are already members
        const filteredResults = transformedResults.filter(
          profile => !campaignMembers.some(member => member.user_id === profile.user_id)
        );

        setSearchResults(filteredResults);
      } catch (error) {
        console.error('Error searching users:', error);
        setSearchResults([]);
      } finally {
        setIsLoading(false);
      }
    };

    const debounceTimer = setTimeout(searchUsers, 300);
    return () => clearTimeout(debounceTimer);
  }, [query, campaignMembers]);

  const handleAddMember = async (member: Member) => {
    setIsAdding(true)
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Not authenticated');
      }

      const { error } = await supabase
        .from('campaign_members')
        .insert({
          campaign_id: campaignId,
          user_id: member.user_id,
          role: 'MEMBER',
          invited_at: new Date().toISOString(),
          invited_by: user.id
        });

      if (error) throw error;

      onMemberAdd(member);
      toast({
        description: `Added ${member.username} to the campaign`
      });
      setQuery('');
      setSearchResults([]);
    } catch (error) {
      console.error('Error adding member to campaign:', error);
      toast({
        variant: "destructive",
        description: "Failed to add member to campaign"
      });
    } finally {
      setIsAdding(false)
    }
  };

  // Only search for new members, use existing data for filtering
  const searchUsers = async (query: string) => {
    if (query.trim() === '') return [];
    
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username')
      .ilike('username', `%${query}%`)
      .limit(5);

    // Filter out existing members using the provided campaignMembers
    return profilesData?.filter(profile => 
      !campaignMembers.some(member => member.user_id === profile.id)
    ) || [];
  };

  return (
    <div className="relative mb-4">
      <Input
        type="text"
        placeholder="Search to add member"
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
            {searchResults.map(profile => (
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
  )
} 