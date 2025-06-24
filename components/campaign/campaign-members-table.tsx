'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from "@/components/ui/button"
import { createClient } from "@/utils/supabase/client"
import { useToast } from "@/components/ui/use-toast"
import Modal from "@/components/modal"
import Link from 'next/link'
import { 
  addGangToCampaign, 
  removeMemberFromCampaign, 
  removeGangFromCampaign, 
  updateMemberRole 
} from "@/app/actions/campaign-members"

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
    gang_type: string;
    gang_colour: string;
    status: string | null;
    rating?: number;
    reputation?: number;
  }[];
  index?: number;
}

interface Gang {
  id: string;
  name: string;
  gang_type: string;
  isInCampaign?: boolean;
}

interface GangToRemove {
  memberId: string;
  gangId: string;
  gangName: string;
  memberIndex?: number;
  id?: string;
}

interface MembersTableProps {
  campaignId: string;
  isAdmin: boolean;
  members: Member[];
  userId?: string;
  onMemberUpdate: (args: { 
    removedUserId?: string; 
    removedGangIds?: string[];
    updatedMember?: Member;
  }) => void;
  isCampaignAdmin: boolean;
  isCampaignOwner: boolean;
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
  userId,
  onMemberUpdate,
  isCampaignAdmin,
  isCampaignOwner
}: MembersTableProps) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [showGangModal, setShowGangModal] = useState(false)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [selectedMemberIndex, setSelectedMemberIndex] = useState<number | undefined>(undefined)
  const [userGangs, setUserGangs] = useState<Gang[]>([])
  const [selectedGang, setSelectedGang] = useState<Gang | null>(null)
  const [showRemoveGangModal, setShowRemoveGangModal] = useState(false)
  const [gangToRemove, setGangToRemove] = useState<GangToRemove | null>(null)
  const [showRoleModal, setShowRoleModal] = useState(false)
  const [roleChange, setRoleChange] = useState<{ memberId: string; username: string; currentRole: MemberRole; newRole: MemberRole } | null>(null)
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null)
  const [showRemoveMemberModal, setShowRemoveMemberModal] = useState(false)
  
  const supabase = createClient()
  const { toast } = useToast()

  useEffect(() => {
    setCurrentUserId(userId || null);
  }, [userId]);

  useEffect(() => {
    if (selectedMember) {
      console.log("Selected member:", JSON.stringify(selectedMember, null, 2));
      console.log("Member index:", selectedMember.index);
    }
  }, [selectedMember]);

  const sortedMembers = useMemo(() => {
    // Group members by user_id first
    const userGroups: {[key: string]: Member[]} = {};
    
    // Create a map of users and assign correct indices within their group
    members.forEach(member => {
      if (!userGroups[member.user_id]) {
        userGroups[member.user_id] = [];
      }
      userGroups[member.user_id].push(member);
    });
    
    // Now flatten the groups, but maintain indices within groups
    const membersWithCorrectIndices: Member[] = [];
    
    Object.entries(userGroups).forEach(([userId, userMembers]) => {
      userMembers.forEach((member, indexInGroup) => {
        membersWithCorrectIndices.push({
          ...member,
          index: indexInGroup // Assign index relative to the user group
        });
      });
    });
    
    // Sort the complete array as before
    return membersWithCorrectIndices.sort((a, b) => {
      const ratingA = a.gangs[0]?.rating ?? -1;
      const ratingB = b.gangs[0]?.rating ?? -1;
      return ratingB - ratingA;
    });
  }, [members]);

  const fetchUserGangs = async (userId: string) => {
    try {
      const { data: gangs, error } = await supabase
        .from('gangs')
        .select('id, name, gang_type, gang_colour')
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

  const handleGangClick = async (member: Member) => {
    console.log("Gang click - member object:", JSON.stringify(member, null, 2));
    
    setSelectedMember(member);
    
    await fetchUserGangs(member.user_id);
    setShowGangModal(true);
  };

  const handleAddGang = async () => {
    if (!selectedGang || !selectedMember) {
      console.error("Missing selectedGang or selectedMember");
      return false;
    }
    
    console.log("Adding gang to member:", JSON.stringify(selectedMember, null, 2));

    try {
      const result = await addGangToCampaign({
        campaignId,
        gangId: selectedGang.id,
        userId: selectedMember.user_id,
        campaignMemberId: selectedMember.id
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      onMemberUpdate({
        updatedMember: selectedMember
      });
      toast({
        description: `Added ${selectedGang.name} to the campaign`
      });
      
      setShowGangModal(false);
      setSelectedGang(null);
      setSelectedMember(null);
      return true;
    } catch (error) {
      console.error('Error adding gang:', error);
      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "Failed to add gang"
      });
      return false;
    }
  };

  const handleRoleChange = async () => {
    if (!roleChange) return false;
    // Only campaign owners and arbitrators can change roles
    if (!isCampaignOwner && !isCampaignAdmin) {
      toast({
        variant: "destructive",
        description: "You don't have permission to change roles"
      });
      return false;
    }
    try {
      const result = await updateMemberRole({
        campaignId,
        userId: roleChange.memberId,
        newRole: roleChange.newRole
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      onMemberUpdate({
        updatedMember: {
          ...selectedMember!,
          role: roleChange.newRole
        }
      });
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

  const handleRemoveMember = async () => {
    if (!memberToRemove) return false;
    console.log("Removing member:", memberToRemove);
    // Prevent deleting the last owner
    if (memberToRemove.role === 'OWNER') {
      const ownerCount = members.filter(m => m.role === 'OWNER').length;
      // Only block if this is the last OWNER
      if (ownerCount <= 1) {
        toast({
          variant: "destructive",
          description: "Cannot remove the last owner of the campaign"
        });
        return false;
      }
    }
    // Only campaign owners and arbitrators can remove members
    if (!isCampaignOwner && !isCampaignAdmin) {
      toast({
        variant: "destructive",
        description: "You don't have permission to remove members"
      });
      return false;
    }
    try {
      const result = await removeMemberFromCampaign({
        campaignId,
        memberId: memberToRemove.id,
        userId: memberToRemove.user_id,
        memberIndex: memberToRemove.index
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      onMemberUpdate({
        removedUserId: memberToRemove.user_id,
        removedGangIds: memberToRemove.gangs.map(g => g.gang_id)
      });
      toast({
        description: `Removed ${memberToRemove.profile.username} from the campaign`
      });
      return true;
    } catch (error) {
      console.error('Error removing member:', error);
      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "Failed to remove member"
      });
      return false;
    }
  };

  const handleRemoveGang = async () => {
    if (!gangToRemove) return false;
    console.log("Removing gang with details:", gangToRemove);

    try {
      const result = await removeGangFromCampaign({
        campaignId,
        gangId: gangToRemove.gangId,
        memberId: gangToRemove.memberId,
        memberIndex: gangToRemove.memberIndex,
        campaignGangId: gangToRemove.id
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      onMemberUpdate({
        removedGangIds: [gangToRemove.gangId]
      });
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
        description: error instanceof Error ? error.message : "Failed to remove gang"
      });
      return false;
    }
  };

  const gangModalContent = useMemo(() => (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Select a gang to add to the campaign:</p>
      <div className="space-y-2">
        {[...userGangs].sort((a, b) => a.name.localeCompare(b.name)).map(gang => (
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
      {memberToRemove?.role === 'OWNER' && (
        <p className="text-sm text-red-600 font-medium mt-2">
          Warning: Cannot remove the Owner of a campaign.
        </p>
      )}
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
      <div className="hidden md:block overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="px-4 py-2 text-left font-medium max-w-[8rem]">Gang</th>
              <th className="px-2 py-2 text-left font-medium max-w-[3rem]">Player</th>
              <th className="px-2 py-2 text-left font-medium max-w-[3.5rem]">Role</th>
              <th className="px-2 py-2 text-left font-medium">Rating</th>
              <th className="px-2 py-2 text-left font-medium">Reputation</th>
              {isAdmin && <th className="px-2 py-2 text-right"></th>}
            </tr>
          </thead>
          <tbody>
            {sortedMembers.map((member, index) => (
              <tr key={`${member.user_id}-${index}`} className="border-b last:border-0">
                <td className="px-2 py-2 max-w-[8rem]">
                  {member.gangs[0]?.gang_name ? (
                    <div className="flex items-center gap-1">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100"
                        style={{
                          color: member.gangs[0]?.gang_colour || '#000000'
                        }}
                      >
                        <Link
                          href={`/gang/${member.gangs[0].gang_id}`}
                          className="hover:text-gray-600 transition-colors"
                        >
                          {member.gangs[0].gang_name}
                        </Link>
                        {(currentUserId === member.user_id || isAdmin) && (
                          <button
                            onClick={() => {
                              setGangToRemove({
                                memberId: member.user_id,
                                gangId: member.gangs[0].gang_id,
                                gangName: member.gangs[0].gang_name,
                                memberIndex: member.index,
                                id: member.gangs[0].id
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
                          onClick={() => handleGangClick(member)}
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
                <td className="px-2 py-2 max-w-[3rem]">
                  <span className="text-xs font-medium">{member.profile.username}</span>
                </td>
                <td className="px-2 py-2 max-w-[3.5rem]">
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
                <td className="px-2 py-2">
                  <span className="text-gray-500">
                    {member.gangs[0]?.rating || "-"}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <span className="text-gray-500">
                    {member.gangs[0]?.reputation ?? "-"}
                  </span>
                </td>
                {isAdmin && (
                  <td className="px-2 py-2 text-right">
                    <Button
                      variant="destructive"
                      size="sm"
                      className="text-xs px-1.5 h-6"
                      onClick={() => {
                        setMemberToRemove({...member, index});
                        setShowRemoveMemberModal(true);
                      }}
                      disabled={member.role === 'OWNER' && members.filter(m => m.role === 'OWNER').length <= 1}
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

      {/* Mobile rendering */}
      <div className="md:hidden space-y-4">
        {sortedMembers.map((member, index) => (
          <div key={`${member.user_id}-${index}`} className="bg-white rounded-lg border p-4">
            <div className="flex justify-between items-start mb-2">
                <div>
                  {member.gangs[0]?.gang_name ? (
                    <div className="flex items-center gap-1">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-small font-semibold bg-gray-100"
                        style={{ color: member.gangs[0]?.gang_colour || '#000000' }}
                      >
                        <Link
                          href={`/gang/${member.gangs[0].gang_id}`}
                          className="hover:text-gray-600 transition-colors"
                        >
                          {member.gangs[0].gang_name}
                        </Link>
                        {(currentUserId === member.user_id || isAdmin) && (
                          <button
                            onClick={() => {
                              setGangToRemove({
                                memberId: member.user_id,
                                gangId: member.gangs[0].gang_id,
                                gangName: member.gangs[0].gang_name,
                                memberIndex: member.index,
                                id: member.gangs[0].id
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
                          onClick={() => handleGangClick(member)}
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
            
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500 text-base">Player</span>
                <div className="text-sm text-base">
                  {member.profile.username}
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
            </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Rating</span>
                <span className="text-sm text-gray-500">
                  {member.gangs[0]?.rating || "-"}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Reputation</span>
                <span className="text-sm text-gray-500">
                  {member.gangs[0]?.reputation ?? "-"}
                </span>
              </div>

              {isAdmin && (
                <div className="flex justify-end mt-3">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="text-xs px-1.5 h-6"
                    onClick={() => {
                      setMemberToRemove({...member, index});
                      setShowRemoveMemberModal(true);
                    }}
                    disabled={member.role === 'OWNER' && members.filter(m => m.role === 'OWNER').length <= 1}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {showGangModal && (
        <Modal
          title="Add Gang to Campaign"
          content={gangModalContent}
          onClose={() => {
            setShowGangModal(false);
            setSelectedGang(null);
            setSelectedMember(null);
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
          title="Change Player Role"
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
          title="Remove Player from Campaign"
          content={removeMemberModalContent}
          onClose={() => {
            setShowRemoveMemberModal(false);
            setMemberToRemove(null);
          }}
          onConfirm={handleRemoveMember}
          confirmText="Remove Player"
          confirmDisabled={false}
        />
      )}
    </div>
  );
} 