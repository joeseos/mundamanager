'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from "@/components/ui/button"
import { createClient } from "@/utils/supabase/client"
import { useToast } from "@/components/ui/use-toast"
import Modal from "@/components/modal"

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

interface Gang {
  id: string;
  name: string;
  gang_type: string;
  isInCampaign?: boolean;
}

interface MembersTableProps {
  campaignId: string;
  isAdmin: boolean;
  members: Member[];
  onMemberUpdate: () => void;
}

const formatRole = (role: MemberRole | undefined) => {
  switch (role) {
    case 'OWNER':
      return 'Owner';
    case 'ARBITRATOR':
      return 'Arbitrator';
    case 'MEMBER':
      return 'Member';
    default:
      return 'Member';
  }
};

export default function MembersTable({
  campaignId,
  isAdmin,
  members,
  onMemberUpdate
}: MembersTableProps) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [showGangModal, setShowGangModal] = useState(false)
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [userGangs, setUserGangs] = useState<Gang[]>([])
  const [selectedGang, setSelectedGang] = useState<Gang | null>(null)
  const [showRemoveGangModal, setShowRemoveGangModal] = useState(false)
  const [gangToRemove, setGangToRemove] = useState<{ memberId: string; gangId: string; gangName: string } | null>(null)
  const [showRoleModal, setShowRoleModal] = useState(false)
  const [roleChange, setRoleChange] = useState<{ memberId: string; username: string; currentRole: MemberRole; newRole: MemberRole } | null>(null)
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null)
  const [showRemoveMemberModal, setShowRemoveMemberModal] = useState(false)
  
  const supabase = createClient()
  const { toast } = useToast()

  // Only fetch current user ID
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    };
    getCurrentUser();
  }, []);

  // Use memoized sorting instead of re-fetching
  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      const ratingA = a.gangs[0]?.rating ?? -1;
      const ratingB = b.gangs[0]?.rating ?? -1;
      return ratingB - ratingA;
    });
  }, [members]);

  // Gang management functions
  const fetchUserGangs = async (userId: string) => {
    try {
      const { data: gangs, error } = await supabase
        .from('gangs')
        .select('id, name, gang_type')
        .eq('user_id', userId);

      if (error) throw error;

      const { data: campaignGangs, error: campaignError } = await supabase
        .from('campaign_gangs')
        .select('gang_id');

      if (campaignError) throw campaignError;

      const takenGangIds = new Set(campaignGangs?.map(cg => cg.gang_id) || []);
      const gangsWithAvailability = gangs?.map(gang => ({
        ...gang,
        isInCampaign: takenGangIds.has(gang.id)
      })) || [];

      setUserGangs(gangsWithAvailability);
    } catch (error) {
      console.error('Error fetching gangs:', error);
      toast({
        variant: "destructive",
        description: "Failed to load gangs"
      });
    }
  };

  const handleGangClick = async (memberId: string) => {
    setSelectedMemberId(memberId);
    await fetchUserGangs(memberId);
    setShowGangModal(true);
  };

  const handleAddGang = async () => {
    if (!selectedGang || !selectedMemberId) return false;

    try {
      const { error } = await supabase
        .from('campaign_gangs')
        .insert({
          campaign_id: campaignId,
          gang_id: selectedGang.id,
          user_id: selectedMemberId
        });

      if (error) throw error;

      onMemberUpdate();
      toast({
        description: `Added ${selectedGang.name} to the campaign`
      });
      setShowGangModal(false);
      setSelectedGang(null);
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

  // Role management
  const handleRoleChange = async () => {
    if (!roleChange) return false;

    try {
      const response = await fetch('/api/campaigns/campaign-members', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          campaignId,
          userId: roleChange.memberId,
          newRole: roleChange.newRole
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update role');
      }

      onMemberUpdate();
      toast({
        description: `Updated ${roleChange.username}'s role to ${roleChange.newRole}`
      });
      return true;
    } catch (error) {
      console.error('Error updating role:', error);
      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "Failed to update role"
      });
      return false;
    }
  };

  // Member removal
  const handleRemoveMember = async () => {
    if (!memberToRemove) return false;

    try {
      // First, get all gangs owned by the member in this campaign
      const { data: userGangs } = await supabase
        .from('campaign_gangs')
        .select('gang_id')
        .eq('campaign_id', campaignId)
        .eq('user_id', memberToRemove.user_id);

      if (userGangs && userGangs.length > 0) {
        const gangIds = userGangs.map(g => g.gang_id);

        // Update territories to remove gang control
        const { error: territoryError } = await supabase
          .from('campaign_territories')
          .update({ gang_id: null })
          .eq('campaign_id', campaignId)
          .in('gang_id', gangIds);

        if (territoryError) throw territoryError;

        // Remove gangs from campaign
        const { error: gangError } = await supabase
          .from('campaign_gangs')
          .delete()
          .eq('campaign_id', campaignId)
          .eq('user_id', memberToRemove.user_id);

        if (gangError) throw gangError;
      }

      // Remove the member
      const { error } = await supabase
        .from('campaign_members')
        .delete()
        .eq('campaign_id', campaignId)
        .eq('user_id', memberToRemove.user_id);

      if (error) throw error;

      onMemberUpdate();
      toast({
        description: `Removed ${memberToRemove.profile.username} from the campaign`
      });
      return true;
    } catch (error) {
      console.error('Error removing member:', error);
      toast({
        variant: "destructive",
        description: "Failed to remove member"
      });
      return false;
    }
  };

  // Gang removal
  const handleRemoveGang = async () => {
    if (!gangToRemove) return false;

    try {
      const { error } = await supabase
        .from('campaign_gangs')
        .delete()
        .eq('campaign_id', campaignId)
        .eq('gang_id', gangToRemove.gangId);

      if (error) throw error;

      onMemberUpdate();
      toast({
        description: `Removed ${gangToRemove.gangName} from the campaign`
      });
      setShowRemoveGangModal(false);
      setGangToRemove(null);
      return true;
    } catch (error) {
      console.error('Error removing gang:', error);
      toast({
        variant: "destructive",
        description: "Failed to remove gang"
      });
      return false;
    }
  };

  // Modal content memos
  const gangModalContent = useMemo(() => (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Select a gang to add to the campaign:</p>
      <div className="space-y-2">
        {userGangs.map(gang => (
          <button
            key={gang.id}
            onClick={() => !gang.isInCampaign && setSelectedGang(gang)}
            disabled={gang.isInCampaign}
            className={`w-full p-3 text-left border rounded-lg transition-colors ${
              gang.isInCampaign 
                ? 'bg-gray-50 cursor-not-allowed' 
                : selectedGang?.id === gang.id 
                  ? 'border-black bg-gray-50' 
                  : 'hover:border-gray-400'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">{gang.name}</span>
                <span className="text-sm text-gray-500 ml-2">{gang.gang_type}</span>
              </div>
              {gang.isInCampaign && (
                <span className="text-xs text-gray-500">Already in campaign</span>
              )}
            </div>
          </button>
        ))}
      </div>
      {userGangs.length === 0 && (
        <p className="text-sm text-gray-500 text-center">No gangs available to add</p>
      )}
    </div>
  ), [userGangs, selectedGang]);

  const roleModalContent = useMemo(() => (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Are you sure you want to change <span className="font-medium">{roleChange?.username}</span>'s role from{' '}
        <span className="font-medium">{roleChange?.currentRole}</span> to{' '}
        <span className="font-medium">{roleChange?.newRole}</span>?
      </p>
    </div>
  ), [roleChange]);

  const removeMemberModalContent = useMemo(() => (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Are you sure you want to remove <span className="font-medium">{memberToRemove?.profile.username}</span> from this campaign?
        {memberToRemove?.gangs[0] && (
          <span className="block mt-2 text-red-600">
            This will also remove their gang "{memberToRemove.gangs[0].gang_name}" from the campaign.
          </span>
        )}
      </p>
    </div>
  ), [memberToRemove]);

  const removeGangModalContent = useMemo(() => (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Are you sure you want to remove <span className="font-medium">{gangToRemove?.gangName}</span> from this campaign?
      </p>
    </div>
  ), [gangToRemove]);

  return (
    <div>
      {/* Table for md and larger screens */}
      <div className="hidden md:block overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="px-4 py-2 text-left font-medium">Member</th>
              <th className="px-4 py-2 text-left font-medium">Role</th>
              <th className="px-4 py-2 text-left font-medium">Gang</th>
              <th className="px-4 py-2 text-left font-medium">Rating</th>
              {isAdmin && <th className="px-4 py-2 text-right"></th>}
            </tr>
          </thead>
          <tbody>
            {sortedMembers.map(member => (
              <tr key={member.user_id} className="border-b last:border-0">
                <td className="px-4 py-2">
                  <span className="font-medium">{member.profile.username}</span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    {isAdmin && member.user_id !== currentUserId ? (
                      <button
                        onClick={() => {
                          setRoleChange({
                            memberId: member.user_id,
                            username: member.profile.username,
                            currentRole: member.role || 'MEMBER',
                            newRole: member.role === 'ARBITRATOR' ? 'MEMBER' : 'ARBITRATOR'
                          });
                          setShowRoleModal(true);
                        }}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 transition-colors group"
                      >
                        {formatRole(member.role)}
                        <svg 
                          className="ml-1 h-4 w-4 text-gray-500 group-hover:text-gray-700" 
                          fill="none" 
                          viewBox="0 0 24 24" 
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {formatRole(member.role)}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2">
                  {member.gangs[0]?.gang_name ? (
                    <div className="flex items-center gap-1">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 transition-colors group">
                          {(isAdmin) && (
                          <button //Admin View Campain Member Gang Button
                            onClick={() => {
                              window.open("http:///www.mundamanager.com/gang/" + member.gangs[0].gang_id)
                              //this will need work becuase Im assuming we dont want a hyperlink in the code but rather a more elegant solution 
                            }}
                          >
                            {member.gangs[0].gang_name}
                          </button>
                        )}
                        {(currentUserId === member.user_id || isAdmin) && (
                          <button
                            onClick={() => {
                              setGangToRemove({
                                memberId: member.user_id,
                                gangId: member.gangs[0].gang_id,
                                gangName: member.gangs[0].gang_name
                              });
                              setShowRemoveGangModal(true);
                            }}
                            className="ml-1.5 text-gray-400 hover:text-gray-600"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center">
                      {(currentUserId === member.user_id || isAdmin) ? (
                        <button
                          onClick={() => handleGangClick(member.user_id)}
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 hover:bg-green-200 transition-colors"
                        >
                          {currentUserId === member.user_id ? 'Add your gang' : 'Add gang'}
                        </button>
                      ) : (
                        <span className="text-gray-500">No gang selected</span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2">
                  <span className="text-gray-500">
                    {member.gangs[0]?.rating || "-"}
                  </span>
                </td>
                {isAdmin && (
                  <td className="px-4 py-2 text-right">
                    <Button
                      variant="destructive"
                      size="sm"
                      className="text-xs px-1.5 h-6"
                      onClick={() => {
                        setMemberToRemove(member);
                        setShowRemoveMemberModal(true);
                      }}
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
        {sortedMembers.map(member => (
          <div key={member.user_id} className="bg-white rounded-lg border p-4">
            <div className="flex justify-between items-start mb-2">
              <span className="font-medium text-base">{member.profile.username}</span>
              {isAdmin && member.user_id !== currentUserId ? (
                <button
                  onClick={() => {
                    setRoleChange({
                      memberId: member.user_id,
                      username: member.profile.username,
                      currentRole: member.role || 'MEMBER',
                      newRole: member.role === 'ARBITRATOR' ? 'MEMBER' : 'ARBITRATOR'
                    });
                    setShowRoleModal(true);
                  }}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 transition-colors group"
                >
                  {formatRole(member.role)}
                  <svg 
                    className="ml-1 h-4 w-4 text-gray-500 group-hover:text-gray-700" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              ) : (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                  {formatRole(member.role)}
                </span>
              )}
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Gang</span>
                <div>
                  {member.gangs[0]?.gang_name ? (
                    <div className="flex items-center gap-1">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {member.gangs[0].gang_name}
                        {(currentUserId === member.user_id || isAdmin) && (
                          <button
                            onClick={() => {
                              setGangToRemove({
                                memberId: member.user_id,
                                gangId: member.gangs[0].gang_id,
                                gangName: member.gangs[0].gang_name
                              });
                              setShowRemoveGangModal(true);
                            }}
                            className="ml-1.5 text-gray-400 hover:text-gray-600"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center">
                      {(currentUserId === member.user_id || isAdmin) ? (
                        <button
                          onClick={() => handleGangClick(member.user_id)}
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 hover:bg-green-200 transition-colors"
                        >
                          {currentUserId === member.user_id ? 'Add your gang' : 'Add gang'}
                        </button>
                      ) : (
                        <span className="text-sm text-gray-500">No gang selected</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Rating</span>
                <span className="text-sm text-gray-500">
                  {member.gangs[0]?.rating || "-"}
                </span>
              </div>

              {isAdmin && (
                <div className="flex justify-end mt-3">
                  <Button
                    //variant="destructive"
                    size="sm"
                    className="text-xs px-1.5 h-6"
                    onClick={() => {
                      window.open("http:///www.mundamanager.com/gang/" + member.gangs[0].gang_id)
                    }}
                  >
                    View Gang
                  </Button>
                </div>
              )}

              {isAdmin && (
                <div className="flex justify-end mt-3">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="text-xs px-1.5 h-6"
                    onClick={() => {
                      setMemberToRemove(member);
                      setShowRemoveMemberModal(true);
                    }}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modals */}
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

      {showRemoveGangModal && (
        <Modal
          title="Remove Gang from Campaign"
          content={removeGangModalContent}
          onClose={() => {
            setShowRemoveGangModal(false);
            setGangToRemove(null);
          }}
          onConfirm={handleRemoveGang}
          confirmText="Remove Gang"
          confirmDisabled={false}
        />
      )}

      {showRoleModal && (
        <Modal
          title="Change Member Role"
          content={roleModalContent}
          onClose={() => {
            setShowRoleModal(false);
            setRoleChange(null);
          }}
          onConfirm={handleRoleChange}
          confirmText="Change Role"
          confirmDisabled={false}
        />
      )}

      {showRemoveMemberModal && (
        <Modal
          title="Remove Member from Campaign"
          content={removeMemberModalContent}
          onClose={() => {
            setShowRemoveMemberModal(false);
            setMemberToRemove(null);
          }}
          onConfirm={handleRemoveMember}
          confirmText="Remove Member"
          confirmDisabled={false}
        />
      )}
    </div>
  );
} 