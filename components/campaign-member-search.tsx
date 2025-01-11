'use client'

import { useState, useEffect, useMemo } from 'react'
import { Input } from "@/components/ui/input"
import { createClient } from "@/utils/supabase/client"
import { useToast } from "@/components/ui/use-toast"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import Modal from "@/components/modal"

type MemberRole = 'ADMIN' | 'MEMBER';

type Profile = {
  id: string;
  username: string;
  role?: MemberRole;
  invited_at?: string;
  invited_by?: string;
  gang?: {
    id: string;
    name: string;
    gang_type: string;
  } | null;
};

type Gang = {
  id: string;
  name: string;
  gang_type: string;
};

interface MemberSearchProps {
  campaignId: string;
  isAdmin: boolean;
}

const formatRole = (role: MemberRole | undefined) => {
  switch (role) {
    case 'ADMIN':
      return 'Admin';
    case 'MEMBER':
      return 'Member';
    default:
      return 'Member';
  }
};

export default function MemberSearch({ 
  campaignId,
  isAdmin 
}: MemberSearchProps) {
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Profile[]>([])
  const [campaignMembers, setCampaignMembers] = useState<Profile[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const supabase = createClient()
  const { toast } = useToast()
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [showGangModal, setShowGangModal] = useState(false)
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [userGangs, setUserGangs] = useState<Gang[]>([])
  const [selectedGang, setSelectedGang] = useState<Gang | null>(null)

  // Load existing campaign members
  useEffect(() => {
    const loadCampaignMembers = async () => {
      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        
        const { data: membersData, error: membersError } = await supabase
          .from('campaign_members')
          .select('user_id, role, invited_at, invited_by')
          .eq('campaign_id', campaignId);

        console.log('Members data from DB:', membersData); // Debug log

        if (membersError) throw membersError;

        if (!membersData?.length) {
          // If no members exist, add current user as ADMIN
          if (user) {
            const { data: userData } = await supabase
              .from('profiles')
              .select('id, username')
              .eq('id', user.id)
              .single();

            if (userData) {
              const adminMember = {
                ...userData,
                role: 'ADMIN' as MemberRole,
                invited_at: new Date().toISOString()
              };
              
              await supabase
                .from('campaign_members')
                .insert({
                  campaign_id: campaignId,
                  user_id: user.id,
                  role: 'ADMIN',
                  invited_at: new Date().toISOString()
                });

              setCampaignMembers([adminMember]);
            }
          }
          return;
        }

        const userIds = membersData.map(m => m.user_id);
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', userIds);

        if (profilesError) throw profilesError;

        // Combine profile data with member data
        const membersWithRoles = await Promise.all(profilesData?.map(async profile => {
          const memberData = membersData.find(m => m.user_id === profile.id);
          
          // First get the user's gang from campaign_gangs
          const { data: campaignGangData } = await supabase
            .from('campaign_gangs')
            .select('*')
            .eq('campaign_id', campaignId)
            .eq('user_id', profile.id)
            .maybeSingle();

          console.log('Campaign gang data for user', profile.username, ':', campaignGangData);  // More detailed debug log

          let gang = null;
          
          if (campaignGangData) {
            const { data: gangData } = await supabase
              .from('gangs')
              .select(`
                id,
                name,
                gang_type
              `)
              .eq('id', campaignGangData.gang_id)
              .single();

            if (gangData) {
              gang = {
                id: gangData.id,
                name: gangData.name,
                gang_type: gangData.gang_type
              };
            }
          }

          return {
            ...profile,
            role: memberData?.role,
            invited_at: memberData?.invited_at,
            invited_by: memberData?.invited_by,
            gang: gang
          } as Profile;
        }) || []);

        setCampaignMembers(membersWithRoles);
      } catch (error) {
        console.error('Error loading campaign members:', error);
        toast({
          variant: "destructive",
          description: "Failed to load campaign members"
        });
      }
    };

    loadCampaignMembers();
  }, [campaignId, supabase]);

  // Search for users
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

        // Filter out users that are already members
        const filteredResults = (profilesData || []).filter(
          profile => !campaignMembers.some(member => member.id === profile.id)
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

  const handleAddMember = async (profile: Profile) => {
    try {
      // Get the current user (inviter)
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Not authenticated');
      }

      const { error } = await supabase
        .from('campaign_members')
        .insert({
          campaign_id: campaignId,
          user_id: profile.id,
          role: 'MEMBER',
          invited_at: new Date().toISOString(),
          invited_by: user.id  // Add the inviter's ID
        });

      if (error) throw error;

      // Add role and invited_at to the profile before updating state
      const memberWithRole = {
        ...profile,
        role: 'MEMBER' as MemberRole,
        invited_at: new Date().toISOString(),
        invited_by: user.id
      };

      setCampaignMembers([...campaignMembers, memberWithRole]);
      toast({
        description: `Added ${profile.username} to the campaign`
      });
      setQuery('');
      setSearchResults([]);
    } catch (error) {
      console.error('Error adding member to campaign:', error);
      toast({
        variant: "destructive",
        description: "Failed to add member to campaign"
      });
    }
  };

  const handleRemoveMember = async (profile: Profile) => {
    try {
      const { error } = await supabase
        .from('campaign_members')
        .delete()
        .eq('campaign_id', campaignId)
        .eq('user_id', profile.id);

      if (error) throw error;

      setCampaignMembers(campaignMembers.filter(m => m.id !== profile.id));
      toast({
        description: `Removed ${profile.username} from the campaign`
      });
    } catch (error) {
      console.error('Error removing member from campaign:', error);
      toast({
        variant: "destructive",
        description: "Failed to remove member from campaign"
      });
    }
  };

  // Add useEffect to get current user
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    };
    getCurrentUser();
  }, []);

  // Add this function to fetch user's gangs
  const fetchUserGangs = async (userId: string) => {
    const { data: gangs, error } = await supabase
      .from('gangs')
      .select('id, name, gang_type')
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching gangs:', error);
      return;
    }

    setUserGangs(gangs || []);
  };

  // Add this function to handle gang selection
  const handleAddGang = async () => {
    if (!selectedGang || !selectedMemberId) return false;

    try {
      const response = await fetch('/api/campaign-gangs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          campaignId,
          gangId: selectedGang.id,
          userId: selectedMemberId
        }),
      });

      if (!response.ok) throw new Error('Failed to add gang');

      // Update the local state
      setCampaignMembers(members => 
        members.map(member => 
          member.id === selectedMemberId 
            ? { 
                ...member, 
                gang: { 
                  id: selectedGang.id, 
                  name: selectedGang.name,
                  gang_type: selectedGang.gang_type 
                } 
              }
            : member
        )
      );

      toast({
        description: "Gang added successfully"
      });

      return true;
    } catch (error) {
      console.error('Error adding gang:', error);
      toast({
        variant: "destructive",
        description: "Failed to add gang"
      });
      return false;
    }
  };

  // Modify the gang cell to use the modal
  const handleGangClick = async (memberId: string) => {
    setSelectedMemberId(memberId);
    await fetchUserGangs(memberId);
    setShowGangModal(true);
  };

  // Add the modal content
  const gangModalContent = useMemo(() => (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Select a gang to add to the campaign:</p>
      <div className="space-y-2">
        {userGangs.map(gang => (
          <button
            key={gang.id}
            onClick={() => setSelectedGang(gang)}
            className={`w-full p-3 text-left border rounded-lg transition-colors ${
              selectedGang?.id === gang.id 
                ? 'border-black bg-gray-50' 
                : 'hover:border-gray-400'
            }`}
          >
            <div className="font-medium">
              {gang.name}
              <span className="text-gray-500"> - {gang.gang_type}</span>
            </div>
          </button>
        ))}
      </div>
      {userGangs.length === 0 && (
        <p className="text-sm text-gray-500">No gangs available to add</p>
      )}
    </div>
  ), [userGangs, selectedGang]);

  return (
    <div className="w-full">
      {isAdmin && (
        <div className="relative mb-4">
          <Input
            type="text"
            placeholder="Search to add member"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full"
            disabled={isAdding}
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
                  <li key={profile.id}>
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
      )}
      {campaignMembers.length > 0 && (
        <div>
          {/* Table for md and larger screens */}
          <div className="hidden md:block overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-4 py-2 text-left font-medium">Member</th>
                  <th className="px-4 py-2 text-left font-medium">Role</th>
                  <th className="px-4 py-2 text-left font-medium">Gang</th>
                  <th className="px-4 py-2 text-left font-medium">Invited</th>
                  {isAdmin && <th className="px-4 py-2 text-right"></th>}
                </tr>
              </thead>
              <tbody>
                {campaignMembers.map(member => (
                  <tr key={member.id} className="border-b last:border-0">
                    <td className="px-4 py-2">
                      <span className="font-medium">{member.username}</span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-gray-500">{formatRole(member.role)}</span>
                    </td>
                    <td className="px-4 py-2">
                      {member.gang?.name ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {member.gang.name} - {member.gang.gang_type}
                        </span>
                      ) : (
                        <div className="flex items-center">
                          {(currentUserId === member.id || isAdmin) ? (
                            <button
                              onClick={() => handleGangClick(member.id)}
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 hover:bg-green-200 transition-colors"
                            >
                              {currentUserId === member.id ? 'Add your gang' : 'Add gang'}
                            </button>
                          ) : (
                            <span className="text-gray-500">No gang selected</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-gray-500">
                        {member.invited_at && new Date(member.invited_at).toLocaleDateString()}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-2 text-right">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleRemoveMember(member)}
                          className="text-xs px-1.5 h-6"
                        >
                          Remove
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Card layout for mobile */}
          <div className="md:hidden space-y-4">
            {campaignMembers.map(member => (
              <div key={member.id} className="bg-white rounded-lg border p-4">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-medium text-base">{member.username}</span>
                  <span className="text-sm text-gray-500">{formatRole(member.role)}</span>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">Gang</span>
                    <div>
                      {member.gang?.name ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {member.gang.name} - {member.gang.gang_type}
                        </span>
                      ) : (
                        <div className="flex items-center">
                          {(currentUserId === member.id || isAdmin) ? (
                            <button
                              onClick={() => handleGangClick(member.id)}
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 hover:bg-green-200 transition-colors"
                            >
                              {currentUserId === member.id ? 'Add your gang' : 'Add gang'}
                            </button>
                          ) : (
                            <span className="text-sm text-gray-500">No gang selected</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">Invited</span>
                    <span className="text-sm text-gray-500">
                      {member.invited_at && new Date(member.invited_at).toLocaleDateString()}
                    </span>
                  </div>

                  {isAdmin && (
                    <div className="flex justify-end mt-3">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleRemoveMember(member)}
                        className="text-xs px-2 py-1"
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {showGangModal && (
        <Modal
          title="Add Gang to Campaign"
          content={gangModalContent}
          onClose={() => {
            setShowGangModal(false);
            setSelectedGang(null);
            setSelectedMemberId(null);
          }}
          onConfirm={handleAddGang}
          confirmText="Add Gang"
          confirmDisabled={!selectedGang}
        />
      )}
    </div>
  )
} 