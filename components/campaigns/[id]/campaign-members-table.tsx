'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/utils/supabase/client"
import { useToast } from "@/components/ui/use-toast"
import Modal from "@/components/ui/modal"
import Link from 'next/link'
import { useMutation, useQuery } from '@tanstack/react-query'
import { 
  addGangToCampaign, 
  removeMemberFromCampaign, 
  removeGangFromCampaign, 
  updateMemberRole 
} from "@/app/actions/campaigns/[id]/campaign-members"
import { updateGangAllegiance } from "@/app/actions/campaigns/[id]/campaign-allegiances"
import { LuTrash2, LuPencil } from 'react-icons/lu'
import { MdLocalPolice, MdOutlineLocalPolice } from "react-icons/md"
import { HiUser } from "react-icons/hi2";

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
    campaign_gang_id: string;
    campaign_member_id?: string;
    status: string | null;
    id: string;              // gang's actual UUID
    name: string;
    gang_type: string;
    gang_colour: string;
    rating?: number;
    wealth?: number;
    reputation?: number;
    exploration_points?: number | null;
    meat?: number | null;
    scavenging_rolls?: number | null;
    power?: number | null;
    sustenance?: number | null;
    salvage?: number | null;
    territory_count?: number;
    allegiance?: {
      id: string;
      name: string;
      is_custom: boolean;
    } | null;
  }[];
  index?: number;
}

interface Gang {
  id: string;
  name: string;
  gang_type: string;
  gang_colour: string | null;
  rating?: number;
  wealth?: number;
  reputation?: number;
  exploration_points?: number | null;
  meat?: number | null;
  scavenging_rolls?: number | null;
  power?: number | null;
  sustenance?: number | null;
  salvage?: number | null;
  isInCampaign?: boolean;
}

type GangWithCampaignCheck = {
  id: string;
  name: string;
  gang_type: string;      // Database column name
  gang_colour: string | null;  // Database column name
  rating?: number;
  wealth?: number;
  reputation?: number;
  exploration_points?: number | null;
  meat?: number | null;
  scavenging_rolls?: number | null;
  power?: number | null;
  sustenance?: number | null;
  salvage?: number | null;
  campaign_gangs?: Array<{ gang_id: string }>;
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
    removedMemberId?: string; 
    removedGangIds?: string[];
    updatedMember?: Member;
  }) => void;
  isCampaignAdmin: boolean;
  isCampaignOwner: boolean;
  hasExplorationPoints?: boolean;
  hasMeat?: boolean;
  hasScavengingRolls?: boolean;
  initialAllegiances?: Array<{ id: string; allegiance_name: string; is_custom: boolean }>;
}

const formatRole = (role: MemberRole | undefined) => {
  switch (role) {
    case 'OWNER':
      return <MdOutlineLocalPolice className="h-4 w-4" title="Owner" />;
    case 'ARBITRATOR':
      return <MdLocalPolice className="h-4 w-4" title="Arbitrator (Click to change role)" />;
    case 'MEMBER':
      return <HiUser className="h-4 w-4" title="Member (Click to change role)" />;
    default:
      return <HiUser className="h-4 w-4" title="Member (Click to change role)" />;
  }
};

export default function MembersTable({
  campaignId,
  isAdmin,
  members,
  userId,
  onMemberUpdate,
  isCampaignAdmin,
  isCampaignOwner,
  hasExplorationPoints = false,
  hasMeat = false,
  hasScavengingRolls = false,
  initialAllegiances = []
}: MembersTableProps) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [showGangModal, setShowGangModal] = useState(false)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [selectedMemberIndex, setSelectedMemberIndex] = useState<number | undefined>(undefined)
  const [userGangs, setUserGangs] = useState<Gang[]>([])
  const [selectedGang, setSelectedGang] = useState<Gang | null>(null)
  const [selectedAllegiance, setSelectedAllegiance] = useState<{ id: string; is_custom: boolean } | null>(null)
  const [showRemoveGangModal, setShowRemoveGangModal] = useState(false)
  const [gangToRemove, setGangToRemove] = useState<GangToRemove | null>(null)
  const [showRoleModal, setShowRoleModal] = useState(false)
  const [roleChange, setRoleChange] = useState<{ memberId: string; username: string; currentRole: MemberRole; newRole: MemberRole } | null>(null)
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null)
  const [showRemoveMemberModal, setShowRemoveMemberModal] = useState(false)
  
  // Sorting state
  const [sortField, setSortField] = useState<string>('rating')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  
  // Allegiance state
  const [editingAllegiance, setEditingAllegiance] = useState<{ gangId: string; memberIndex: number } | null>(null)
  
  const supabase = createClient()
  const { toast } = useToast()
  
  // Fetch allegiances using TanStack Query
  // Shares the same query key as campaign-allegiances-actions to see optimistic updates
  const { data: availableAllegiances = initialAllegiances } = useQuery({
    queryKey: ['campaign-allegiances', campaignId],
    queryFn: async () => {
      const response = await fetch(`/api/campaigns/${campaignId}/allegiances`)
      if (!response.ok) {
        throw new Error('Failed to fetch allegiances')
      }
      return response.json() as Promise<Array<{ id: string; allegiance_name: string; is_custom: boolean }>>
    },
    initialData: initialAllegiances, // Use server-provided data as initial data
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,  // 10 minutes
  })

  useEffect(() => {
    setCurrentUserId(userId || null);
  }, [userId]);

  useEffect(() => {
    if (selectedMember) {
      // Selected member tracking for modals
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
    
    // Sort based on the selected field and direction
    return membersWithCorrectIndices.sort((a, b) => {
      let aValue: any;
      let bValue: any;
      
      switch (sortField) {
        case 'gang':
          aValue = a.gangs[0]?.name || '';
          bValue = b.gangs[0]?.name || '';
          break;
        case 'type':
          aValue = a.gangs[0]?.gang_type || '';
          bValue = b.gangs[0]?.gang_type || '';
          break;
        case 'player':
          aValue = a.profile.username || '';
          bValue = b.profile.username || '';
          break;
        case 'rating':
          aValue = a.gangs[0]?.rating ?? -1;
          bValue = b.gangs[0]?.rating ?? -1;
          break;
        case 'wealth':
          aValue = a.gangs[0]?.wealth ?? -1;
          bValue = b.gangs[0]?.wealth ?? -1;
          break;
        case 'reputation':
          aValue = a.gangs[0]?.reputation ?? -1;
          bValue = b.gangs[0]?.reputation ?? -1;
          break;
        case 'exploration_points':
          aValue = a.gangs[0]?.exploration_points ?? -1;
          bValue = b.gangs[0]?.exploration_points ?? -1;
          break;
        case 'meat':
          aValue = a.gangs[0]?.meat ?? -1;
          bValue = b.gangs[0]?.meat ?? -1;
          break;
        case 'scavenging_rolls':
          aValue = a.gangs[0]?.scavenging_rolls ?? -1;
          bValue = b.gangs[0]?.scavenging_rolls ?? -1;
          break;
        case 'territory_count':
          aValue = a.gangs[0]?.territory_count ?? -1;
          bValue = b.gangs[0]?.territory_count ?? -1;
          break;
        case 'allegiance':
          aValue = a.gangs[0]?.allegiance?.name || '';
          bValue = b.gangs[0]?.allegiance?.name || '';
          break;
        default:
          aValue = a.gangs[0]?.rating ?? -1;
          bValue = b.gangs[0]?.rating ?? -1;
      }
      
       // Handle string comparison
       if (typeof aValue === 'string' && typeof bValue === 'string') {
         const comparison = aValue.localeCompare(bValue);
         return sortDirection === 'asc' ? comparison : -comparison;
       }
      
      // Handle number comparison
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [members, sortField, sortDirection]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      // Set default direction based on field type
      const numericalFields = ['rating', 'wealth', 'reputation', 'exploration_points', 'meat', 'scavenging_rolls', 'territory_count'];
      setSortDirection(numericalFields.includes(field) ? 'desc' : 'asc');
    }
  };

  const fetchUserGangs = async (userId: string) => {
    try {
      // Single optimized query with LEFT JOIN to check campaign membership
      const { data: gangs, error } = await supabase
        .from('gangs')
        .select(`
          id, 
          name, 
          gang_type, 
          gang_colour, 
          rating, 
          wealth, 
          reputation, 
          exploration_points, 
          meat, 
          scavenging_rolls, 
          power, 
          sustenance, 
          salvage,
          campaign_gangs(gang_id)
        `)
        .eq('user_id', userId)
        .returns<GangWithCampaignCheck[]>();

      if (error) throw error;

      // Transform data to include isInCampaign flag and map database column names to clean field names
      const gangsWithAvailability = gangs?.map(gang => {
        // If campaign_gangs array exists and has entries, the gang is in a campaign
        const isInCampaign = Array.isArray(gang.campaign_gangs) && gang.campaign_gangs.length > 0;

        // Remove the campaign_gangs join data and map database column names
        const { campaign_gangs, gang_type, gang_colour, ...gangData } = gang;

        return {
          ...gangData,
          gang_type,
          gang_colour,
          isInCampaign
        };
      }) || [];

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
    setSelectedMember(member);
    
    await fetchUserGangs(member.user_id);
    setShowGangModal(true);
  };

  // TanStack Query mutation for adding gang with optimistic updates
  const addGangMutation = useMutation({
    mutationFn: async (variables: { 
      gangId: string; 
      userId: string; 
      campaignMemberId?: string; 
      gangData: Gang;
      allegianceId?: string | null;
      isCustomAllegiance?: boolean;
    }) => {
      const result = await addGangToCampaign({
        campaignId,
        gangId: variables.gangId,
        userId: variables.userId,
        campaignMemberId: variables.campaignMemberId,
        allegianceId: variables.allegianceId,
        isCustomAllegiance: variables.isCustomAllegiance
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to add gang to campaign');
      }
      return result;
    },
    onMutate: async (variables) => {
      // Use variables.gangData instead of closure to avoid stale data
      const { gangData } = variables;

      // Get allegiance data if provided
      const allegianceData = variables.allegianceId && availableAllegiances.length > 0
        ? availableAllegiances.find(a => a.id === variables.allegianceId)
        : null;

      // Create optimistic gang object using all available data from variables
      const optimisticGang = {
        campaign_gang_id: crypto.randomUUID(), // Use crypto.randomUUID() for better uniqueness
        id: variables.gangId,
        name: gangData.name,
        gang_type: gangData.gang_type,
        gang_colour: gangData.gang_colour || '#000000',
        status: null,
        rating: gangData.rating || 0,
        wealth: gangData.wealth || 0,
        reputation: gangData.reputation || 0,
        exploration_points: gangData.exploration_points ?? undefined,
        meat: gangData.meat ?? undefined,
        scavenging_rolls: gangData.scavenging_rolls ?? undefined,
        power: gangData.power ?? undefined,
        sustenance: gangData.sustenance ?? undefined,
        salvage: gangData.salvage ?? undefined,
        territory_count: 0, // Will be updated when server responds
        allegiance: allegianceData ? {
          id: allegianceData.id,
          name: allegianceData.allegiance_name,
          is_custom: allegianceData.is_custom
        } : null
      };

      // Find the member index in the members array
      const memberIndex = members.findIndex(m => m.user_id === variables.userId);
      if (memberIndex === -1) return {};

      // Create updated member with the new gang
      const updatedMember = {
        ...members[memberIndex],
        gangs: [...(members[memberIndex].gangs || []), optimisticGang]
      };

      // Pass optimistic update to parent
      onMemberUpdate({ updatedMember });

      return { 
        previousMembers: members,
        gangName: gangData.name,
        updatedMember
      };
    },
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    onSuccess: (result, variables, context) => {
      // Update the optimistic gang with the real campaign_gang_id from server
      const realId = result.data?.id;
      if (realId && context?.updatedMember?.gangs) {
        const updatedGangs = context.updatedMember.gangs.map(gang =>
          gang.id === variables.gangId
            ? { ...gang, campaign_gang_id: realId }
            : gang
        );
        onMemberUpdate({
          updatedMember: {
            ...context.updatedMember,
            gangs: updatedGangs
          }
        });
      }

      toast({
        description: `Added ${context?.gangName} to the campaign`
      });

      // Close modal
      setShowGangModal(false);
      setSelectedGang(null);
      setSelectedAllegiance(null);
      setSelectedMember(null);
    },
    onError: (error, variables, context) => {
      // Rollback optimistic update
      if (context?.previousMembers) {
        // Find the previous member state
        const previousMember = context.previousMembers.find(m => m.user_id === variables.userId);
        if (previousMember) {
          onMemberUpdate({ updatedMember: previousMember });
        }
      }
      
      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "Failed to add gang"
      });
    }
  });

  const handleAddGang = async () => {
    if (!selectedGang || !selectedMember) {
      console.error("Missing selectedGang or selectedMember");
      return false;
    }

    // Pass all gang data through variables to avoid stale closure
    addGangMutation.mutate({
      gangId: selectedGang.id,
      userId: selectedMember.user_id,
      campaignMemberId: selectedMember.id,
      gangData: selectedGang,
      allegianceId: selectedAllegiance?.id || null,
      isCustomAllegiance: selectedAllegiance?.is_custom || false
    });
    
    return true;
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

      // Trigger refresh to get updated data from cache
      onMemberUpdate({});
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
    // Allow users to remove themselves, or campaign owners/arbitrators to remove others
    const isRemovingSelf = memberToRemove.user_id === currentUserId;
    if (!isRemovingSelf && !isCampaignOwner && !isCampaignAdmin) {
      toast({
        variant: "destructive",
        description: "You don't have permission to remove other members"
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
          removedMemberId: memberToRemove.id,
          removedGangIds: memberToRemove.gangs.map(g => g.id)
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

  // TanStack Query mutation for removing gang with optimistic updates
  const removeGangMutation = useMutation({
    mutationFn: async (variables: { 
      campaignId: string;
      gangId: string; 
      memberId: string; 
      memberIndex?: number; 
      campaignGangId?: string;
      gangName: string;
    }) => {
      const result = await removeGangFromCampaign({
        campaignId: variables.campaignId,
        gangId: variables.gangId,
        memberId: variables.memberId,
        memberIndex: variables.memberIndex,
        campaignGangId: variables.campaignGangId
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to remove gang from campaign');
      }
      return result;
    },
    onMutate: async (variables) => {
      // Store previous state for rollback
      const previousMembers = [...members];
      
      // Optimistically remove gang from members
      onMemberUpdate({
        removedGangIds: [variables.gangId]
      });

      return { 
        previousMembers,
        gangName: variables.gangName
      };
    },
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    onSuccess: (result, variables, context) => {
      toast({
        description: `Removed ${context?.gangName} from the campaign`
      });
      
      // Close modal
      setShowRemoveGangModal(false);
      setGangToRemove(null);
    },
    onError: (error, variables, context) => {
      // Rollback optimistic update by refreshing data
      onMemberUpdate({});
      
      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "Failed to remove gang"
      });
    }
  });

  const handleRemoveGang = async () => {
    if (!gangToRemove) return false;

    removeGangMutation.mutate({
      campaignId,
      gangId: gangToRemove.gangId,
      memberId: gangToRemove.memberId,
      memberIndex: gangToRemove.memberIndex,
      campaignGangId: gangToRemove.id,
      gangName: gangToRemove.gangName
    });
    
    return true;
  };

  const gangModalContent = useMemo(() => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Select a gang to add to the campaign:</p>
      <div className="space-y-2">
        {[...userGangs].sort((a, b) => a.name.localeCompare(b.name)).map(gang => (
          <button
            key={gang.id}
            onClick={() => !gang.isInCampaign && setSelectedGang(gang)}
            disabled={gang.isInCampaign}
            className={`w-full p-3 text-left border rounded-lg transition-colors ${
              gang.isInCampaign 
                ? 'bg-muted cursor-not-allowed' 
                : selectedGang?.id === gang.id 
                  ? 'border-black bg-muted' 
                  : 'hover:border-gray-400'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">{gang.name}</span>
                <span className="text-sm text-muted-foreground ml-2">{gang.gang_type || "-"}</span>
              </div>
              {gang.isInCampaign && (
                <span className="text-xs text-muted-foreground">Already in a campaign.</span>
              )}
            </div>
          </button>
        ))}
      </div>
      {userGangs.length === 0 && (
        <p className="text-sm text-muted-foreground text-center">No gangs available for this player.</p>
      )}
      {selectedGang && !selectedGang.isInCampaign && availableAllegiances.length > 0 && (
        <div className="space-y-2 pt-2 border-t">
          <label className="text-sm font-medium">Allegiance (optional):</label>
          <select
            className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-black"
            value={selectedAllegiance?.id || ''}
            onChange={(e) => {
              const selectedId = e.target.value || null;
              const allegiance = availableAllegiances.find(a => a.id === selectedId);
              setSelectedAllegiance(allegiance ? { id: allegiance.id, is_custom: allegiance.is_custom } : null);
            }}
          >
            <option value="">No Allegiance</option>
            {availableAllegiances.map(allegiance => (
              <option key={allegiance.id} value={allegiance.id}>
                {allegiance.allegiance_name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  ), [userGangs, selectedGang, availableAllegiances, selectedAllegiance]);

  const roleModalContent = useMemo(() => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Are you sure you want to change <span className="font-bold">{roleChange?.username}</span>'s role from {' '}
        <span className="font-bold">{roleChange?.currentRole}</span> to {' '}
        <span className="font-bold">{roleChange?.newRole}</span>?
      </p>
    </div>
  ), [roleChange]);

  const removeMemberModalContent = useMemo(() => {
    const isRemovingSelf = memberToRemove?.user_id === currentUserId;
    return (
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Are you sure you want to {isRemovingSelf ? 'leave' : 'remove'} {isRemovingSelf ? '' : <strong>{memberToRemove?.profile?.username || 'Unknown User'}</strong>} {isRemovingSelf ? 'this' : 'from this'} campaign?
          {memberToRemove?.gangs[0] && (
            <p className="mt-2 text-red-600">
              This will also remove {isRemovingSelf ? 'your' : 'their'} gang <strong>{memberToRemove.gangs[0].name}</strong> from the campaign.
            </p>
          )}
        </div>
        {memberToRemove?.role === 'OWNER' && members.filter(m => m.role === 'OWNER').length <= 1 && (
          <p className="text-sm text-red-600 font-medium mt-2">
            Action blocked: the campaign Owner cannot be removed.
          </p>
        )}
      </div>
    );
  }, [memberToRemove, members, currentUserId]);

  const removeGangModalContent = useMemo(() => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Are you sure you want to remove <strong>{gangToRemove?.gangName}</strong> from this campaign?
      </p>
    </div>
  ), [gangToRemove]);

  // Handler for updating gang allegiance with proper immutability
  const handleAllegianceChange = async (gangId: string, allegianceId: string | null, isCustom: boolean, memberIndex: number) => {
    // Store previous state for rollback
    const previousMembers = members.map(member => ({
      ...member,
      gangs: member.gangs.map(gang => ({ ...gang }))
    }));

    // Find the member and gang that need updating
    const memberIndexToUpdate = members.findIndex(member => 
      member.gangs.some(g => g.id === gangId)
    );

    if (memberIndexToUpdate === -1) {
      // Gang not found, just refresh
      onMemberUpdate({});
      setEditingAllegiance(null);
      return;
    }

    const memberToUpdate = members[memberIndexToUpdate];
    
    // Get the allegiance data if provided
    const allegianceData = allegianceId 
      ? availableAllegiances.find(a => a.id === allegianceId)
      : null;

    // Create updated member with immutable updates
    // Use map() to ensure we create new objects at every level
    // Explicitly preserve the member id to ensure proper matching in parent component
    const updatedMember: Member = {
      ...memberToUpdate,
      id: memberToUpdate.id, // Explicitly preserve member id for parent component matching
      gangs: memberToUpdate.gangs.map(gang => {
        // Only update the specific gang that matches gangId
        if (gang.id === gangId) {
          return {
            ...gang,
            allegiance: allegianceData 
              ? {
                  id: allegianceData.id,
                  name: allegianceData.allegiance_name,
                  is_custom: allegianceData.is_custom
                }
              : null
          };
        }
        // Return other gangs unchanged (but still create new object for immutability)
        return { ...gang };
      })
    };

    // Optimistic update: apply changes immediately
    onMemberUpdate({ updatedMember });
    setEditingAllegiance(null);

    try {
      // Then make the server call
      const result = await updateGangAllegiance({
        gangId,
        campaignId,
        allegianceId,
        isCustom
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to update allegiance');
      }

      // Server call succeeded - the optimistic update was correct
      // Cache invalidation will ensure fresh data on next render
      toast({
        description: "Allegiance updated successfully"
      });
    } catch (error) {
      console.error('Error updating allegiance:', error);
      
      // Rollback: restore previous state
      // Find the previous member state
      const previousMember = previousMembers.find(member => 
        member.gangs.some(g => g.id === gangId)
      );
      
      if (previousMember) {
        onMemberUpdate({ updatedMember: previousMember });
      } else {
        // If we can't find the previous state, trigger a full refresh
        onMemberUpdate({});
      }

      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "Failed to update allegiance"
      });
    }
  };

  // Check if user can edit allegiance for a gang
  const canEditAllegiance = (member: Member) => {
    // Gang owner can edit their own gang's allegiance
    if (member.user_id === currentUserId) return true;
    // Arbitrators and owners can edit any gang's allegiance
    if (isCampaignAdmin || isCampaignOwner) return true;
    return false;
  };

  return (
    <div>
      <div className="hidden md:block overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted border-b">
              <th 
                className="px-4 py-2 text-left font-medium max-w-[8rem] cursor-pointer hover:bg-muted transition-colors select-none"
                onClick={() => handleSort('gang')}
              >
                <div className="flex items-center gap-1">
                  Gang
                  {sortField === 'gang' && (
                    <span className="text-muted-foreground">
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              </th>
              <th 
                className="px-2 py-2 text-left font-medium max-w-[5rem] cursor-pointer hover:bg-muted transition-colors select-none"
                onClick={() => handleSort('type')}
              >
                <div className="flex items-center gap-1">
                  Type
                  {sortField === 'type' && (
                    <span className="text-muted-foreground">
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              </th>
              <th 
                className="px-3 py-2 text-left font-medium max-w-[6rem] cursor-pointer hover:bg-muted transition-colors select-none"
                onClick={() => handleSort('player')}
              >
                <div className="flex items-center gap-1">
                  Player
                  {sortField === 'player' && (
                    <span className="text-muted-foreground">
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              </th>
              {availableAllegiances.length > 0 && (
                <th 
                  className="px-4 py-2 text-left font-medium max-w-[8rem] cursor-pointer hover:bg-muted transition-colors select-none"
                  onClick={() => handleSort('allegiance')}
                >
                  <div className="flex items-center gap-1">
                    Allegiance
                    {sortField === 'allegiance' && (
                      <span className="text-muted-foreground">
                        {sortDirection === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
              )}
              <th
                className="px-2 py-2 text-right font-medium max-w-[2rem] cursor-pointer hover:bg-muted transition-colors select-none"
                onClick={() => handleSort('rating')}
              >
                <div className="flex items-center justify-end gap-1">
                  Rating
                  {sortField === 'rating' && (
                    <span className="text-muted-foreground">
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              </th>
              <th
                className="px-2 py-2 text-right font-medium max-w-[2rem] cursor-pointer hover:bg-muted transition-colors select-none"
                onClick={() => handleSort('wealth')}
              >
                <div className="flex items-center justify-end gap-1">
                  Wealth
                  {sortField === 'wealth' && (
                    <span className="text-muted-foreground">
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              </th>
              <th
                className="px-2 py-2 text-right font-medium max-w-[2rem] cursor-pointer hover:bg-muted transition-colors select-none"
                onClick={() => handleSort('reputation')}
                title="Reputation"
              >
                <div className="flex items-center justify-end gap-1">
                  Rep.
                  {sortField === 'reputation' && (
                    <span className="text-muted-foreground">
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              </th>
              <th 
                className="px-2 py-2 text-right font-medium max-w-[2rem] cursor-pointer hover:bg-muted transition-colors select-none"
                onClick={() => handleSort('territory_count')}
                title="Territories"
              >
                <div className="flex items-center justify-end gap-1">
                  Terr.
                  {sortField === 'territory_count' && (
                    <span className="text-muted-foreground">
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              </th>
              {hasExplorationPoints && (
                <th 
                  className="px-2 py-2 text-right font-medium max-w-[2rem] cursor-pointer hover:bg-muted transition-colors select-none"
                  onClick={() => handleSort('exploration_points')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Expl.
                    {sortField === 'exploration_points' && (
                      <span className="text-muted-foreground">
                        {sortDirection === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
              )}
              {hasMeat && (
                <th 
                  className="px-2 py-2 text-right font-medium max-w-[2rem] cursor-pointer hover:bg-muted transition-colors select-none"
                  onClick={() => handleSort('meat')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Meat
                    {sortField === 'meat' && (
                      <span className="text-muted-foreground">
                        {sortDirection === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
              )}
              {hasScavengingRolls && (
                <th 
                  className="px-2 py-2 text-right font-medium max-w-[2rem] cursor-pointer hover:bg-muted transition-colors select-none"
                  onClick={() => handleSort('scavenging_rolls')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Scav.
                    {sortField === 'scavenging_rolls' && (
                      <span className="text-muted-foreground">
                        {sortDirection === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
              )}
              {(isAdmin || sortedMembers.some(member => member.user_id === currentUserId)) && <th className="px-2 py-2 text-right font-medium max-w-[2.5rem]">Action</th>}
            </tr>
          </thead>
          <tbody>
            {sortedMembers.map((member, index) => (
              <tr key={`${member.user_id}-${index}`} className="border-b last:border-0">
                <td className="px-2 py-2 max-w-[8rem]">
                  {member.gangs[0]?.name ? (
                    <div className="flex items-center gap-1">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted"
                        style={{
                          color: member.gangs[0]?.gang_colour || '#000000'
                        }}
                      >
                        <Link
                          href={`/gang/${member.gangs[0].id}`}
                          prefetch={false}
                          className="hover:text-muted-foreground transition-colors"
                        >
                          {member.gangs[0].name}
                        </Link>
                        {(currentUserId === member.user_id || isAdmin) && (
                          <button
                            onClick={() => {
                              setGangToRemove({
                                memberId: member.user_id,
                                gangId: member.gangs[0].id,
                                gangName: member.gangs[0].name,
                                memberIndex: member.index,
                                id: member.gangs[0].campaign_gang_id
                              });
                              setShowRemoveGangModal(true);
                            }}
                            className="ml-1.5 text-gray-400 hover:text-muted-foreground"
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
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-950 text-green-800 hover:bg-green-200 transition-colors"
                        >
                          {currentUserId === member.user_id ? 'Add your gang' : 'Add gang'}
                        </button>
                      ) : (
                        <span className="text-muted-foreground">No gang selected.</span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-2 py-2 max-w-[5rem]">
                  <span className="text-muted-foreground">
                    {member.gangs[0]?.gang_type || "-"}
                  </span>
                </td>
                <td className="px-2 py-2 max-w-[6rem]">
                  <div className="flex items-center gap-2">
                    {isAdmin && member.user_id !== currentUserId && member.role && member.role !== 'OWNER' ? (
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
                        className="inline-flex items-center px-0.5 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground hover:bg-secondary transition-colors group"
                      >
                        {formatRole(member.role)}

                      </button>
                    ) : (
                      <span className="inline-flex items-center px-0.5 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground">
                        {formatRole(member.role)}
                      </span>
                    )}
                    <span className="text-xs font-medium">{member.profile.username}</span>
                  </div>
                </td>
                {availableAllegiances.length > 0 && (
                  <td className="px-2 py-2 max-w-[8rem]">
                    {member.gangs[0]?.id ? (
                      editingAllegiance?.gangId === member.gangs[0].id ? (
                        <select
                          className="w-full px-2 py-1 text-xs rounded-md border border-border bg-muted focus:outline-none focus:ring-2 focus:ring-black"
                          value={member.gangs[0]?.allegiance?.id || ''}
                          onChange={(e) => {
                            const selectedId = e.target.value || null;
                            const selectedAllegiance = availableAllegiances.find(a => a.id === selectedId);
                            handleAllegianceChange(
                              member.gangs[0].id,
                              selectedId,
                              selectedAllegiance?.is_custom || false,
                              index
                            );
                          }}
                          onBlur={() => setEditingAllegiance(null)}
                          autoFocus
                        >
                          <option value="">No Allegiance</option>
                          {availableAllegiances.map(allegiance => (
                            <option key={allegiance.id} value={allegiance.id}>
                              {allegiance.allegiance_name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="flex items-center gap-1">
                          {member.gangs[0]?.allegiance?.name ? (
                            <Badge 
                              variant="outline" 
                              className={`text-xs flex items-center gap-1 ${canEditAllegiance(member) ? 'cursor-pointer hover:bg-muted group' : ''}`}
                              onClick={canEditAllegiance(member) ? () => setEditingAllegiance({ gangId: member.gangs[0].id, memberIndex: index }) : undefined}
                              title={canEditAllegiance(member) ? "Edit allegiance" : undefined}
                            >
                              {member.gangs[0].allegiance.name}
                              {canEditAllegiance(member) && (
                                <LuPencil className="size-3 text-gray-400 group-hover:text-muted-foreground" />
                              )}
                            </Badge>
                          ) : (
                            <Badge 
                              variant="outline" 
                              className={`text-xs flex items-center gap-1 ${canEditAllegiance(member) ? 'cursor-pointer hover:bg-muted group' : ''}`}
                              onClick={canEditAllegiance(member) ? () => setEditingAllegiance({ gangId: member.gangs[0].id, memberIndex: index }) : undefined}
                              title={canEditAllegiance(member) ? "Edit allegiance" : undefined}
                            >
                              {canEditAllegiance(member) && (
                                <LuPencil className="size-3 text-gray-400 group-hover:text-muted-foreground" />
                              )}
                            </Badge>
                          )}
                        </div>
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </td>
                )}
                <td className="px-2 py-2 text-right max-w-[2rem]">
                  <span className="text-muted-foreground">
                    {member.gangs[0]?.rating || "-"}
                  </span>
                </td>
                <td className="px-2 py-2 text-right max-w-[3rem]">
                  <span className="text-muted-foreground">
                    {member.gangs[0]?.wealth ?? "-"}
                  </span>
                </td>
                <td className="px-2 py-2 text-right max-w-[3rem]">
                  <span className="text-muted-foreground">
                    {member.gangs[0]?.reputation ?? "-"}
                  </span>
                </td>
                <td className="px-2 py-2 text-right max-w-[3rem]">
                  <span className="text-muted-foreground">
                    {member.gangs[0]?.territory_count ?? "-"}
                  </span>
                </td>
                {hasExplorationPoints && (
                  <td className="px-2 py-2 text-right max-w-[3rem]">
                    <span className="text-muted-foreground">
                      {member.gangs[0]?.exploration_points ?? "-"}
                    </span>
                  </td>
                )}
                {hasMeat && (
                  <td className="px-2 py-2 text-right max-w-[3rem]">
                    <span className="text-muted-foreground">
                      {member.gangs[0]?.meat ?? "-"}
                    </span>
                  </td>
                )}
                {hasScavengingRolls && (
                  <td className="px-2 py-2 text-right max-w-[3rem]">
                    <span className="text-muted-foreground">
                      {member.gangs[0]?.scavenging_rolls ?? "-"}
                    </span>
                  </td>
                )}
                {(isAdmin || member.user_id === currentUserId) && (
                  <td className="px-2 py-2 text-right max-w-[2.5rem]">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => {
                        setMemberToRemove({...member, index});
                        setShowRemoveMemberModal(true);
                      }}
                      disabled={member.role === 'OWNER' && members.filter(m => m.role === 'OWNER').length <= 1}
                    >
                      <LuTrash2 className="h-4 w-4" />
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
          <div key={`${member.user_id}-${index}`} className="bg-card rounded-lg border p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                {member.gangs[0]?.name ? (
                  <div className="flex items-center gap-1">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-small font-semibold bg-muted"
                      style={{ color: member.gangs[0]?.gang_colour || '#000000' }}
                    >
                      <Link
                        href={`/gang/${member.gangs[0].id}`}
                        prefetch={false}
                        className="hover:text-muted-foreground transition-colors"
                      >
                        {member.gangs[0].name}
                      </Link>
                      {(currentUserId === member.user_id || isAdmin) && (
                        <button
                          onClick={() => {
                            setGangToRemove({
                              memberId: member.user_id,
                              gangId: member.gangs[0].id,
                              gangName: member.gangs[0].name,
                              memberIndex: member.index,
                              id: member.gangs[0].campaign_gang_id
                            });
                            setShowRemoveGangModal(true);
                          }}
                          className="ml-1.5 text-gray-400 hover:text-muted-foreground"
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
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-950 text-green-800 hover:bg-green-200 transition-colors"
                      >
                        {currentUserId === member.user_id ? 'Add your gang' : 'Add gang'}
                      </button>
                    ) : (
                      <span className="text-sm text-muted-foreground">No gang selected.</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground text-base">Player</span>
                <div className="flex items-center gap-2 text-sm text-base">
                  {isAdmin && member.user_id !== currentUserId && member.role && member.role !== 'OWNER' ? (
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
                      className="inline-flex items-center px-0.5 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground hover:bg-secondary transition-colors group"
                    >
                      {formatRole(member.role)}
                    </button>
                  ) : (
                    <span className="inline-flex items-center px-0.5 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground">
                      {formatRole(member.role)}
                    </span>
                  )}
                  {member.profile.username}
                </div>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Type</span>
              <span className="text-sm text-muted-foreground">
                {member.gangs[0]?.gang_type || "-"}
              </span>
            </div>
            {availableAllegiances.length > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Allegiance</span>
                {member.gangs[0]?.id ? (
                  editingAllegiance?.gangId === member.gangs[0].id ? (
                    <select
                      className="px-2 py-1 text-sm rounded-md border border-border bg-muted focus:outline-none focus:ring-2 focus:ring-black"
                      value={member.gangs[0]?.allegiance?.id || ''}
                      onChange={(e) => {
                        const selectedId = e.target.value || null;
                        const selectedAllegiance = availableAllegiances.find(a => a.id === selectedId);
                        handleAllegianceChange(
                          member.gangs[0].id,
                          selectedId,
                          selectedAllegiance?.is_custom || false,
                          index
                        );
                      }}
                      onBlur={() => setEditingAllegiance(null)}
                      autoFocus
                    >
                      <option value="">No Allegiance</option>
                      {availableAllegiances.map(allegiance => (
                        <option key={allegiance.id} value={allegiance.id}>
                          {allegiance.allegiance_name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex items-center gap-1">
                      {member.gangs[0]?.allegiance?.name ? (
                        <Badge 
                          variant="outline" 
                          className={`text-sm flex items-center gap-1 ${canEditAllegiance(member) ? 'cursor-pointer hover:bg-muted group' : ''}`}
                          onClick={canEditAllegiance(member) ? () => setEditingAllegiance({ gangId: member.gangs[0].id, memberIndex: index }) : undefined}
                          title={canEditAllegiance(member) ? "Edit allegiance" : undefined}
                        >
                          {member.gangs[0].allegiance.name}
                          {canEditAllegiance(member) && (
                            <LuPencil className="size-3 text-gray-400 group-hover:text-muted-foreground" />
                          )}
                        </Badge>
                      ) : (
                        <Badge 
                          variant="outline" 
                          className={`text-sm flex items-center gap-1 ${canEditAllegiance(member) ? 'cursor-pointer hover:bg-muted group' : ''}`}
                          onClick={canEditAllegiance(member) ? () => setEditingAllegiance({ gangId: member.gangs[0].id, memberIndex: index }) : undefined}
                          title={canEditAllegiance(member) ? "Edit allegiance" : undefined}
                        >
                          {canEditAllegiance(member) && (
                            <LuPencil className="size-3 text-gray-400 group-hover:text-muted-foreground" />
                          )}
                        </Badge>
                      )}
                    </div>
                  )
                ) : (
                  <span className="text-sm text-muted-foreground">-</span>
                )}
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Rating</span>
              <span className="text-sm text-muted-foreground">
                {member.gangs[0]?.rating || "-"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Wealth</span>
              <span className="text-sm text-muted-foreground">
                {member.gangs[0]?.wealth ?? "-"}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Reputation</span>
              <span className="text-sm text-muted-foreground">
                {member.gangs[0]?.reputation ?? "-"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Territories</span>
              <span className="text-sm text-muted-foreground">
                {member.gangs[0]?.territory_count ?? "-"}
              </span>
            </div>
            {hasExplorationPoints && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Exploration Points</span>
                <span className="text-sm text-muted-foreground">
                  {member.gangs[0]?.exploration_points ?? "-"}
                </span>
              </div>
            )}
            {hasMeat && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Meat</span>
                <span className="text-sm text-muted-foreground">
                  {member.gangs[0]?.meat ?? "-"}
                </span>
              </div>
            )}
            {hasScavengingRolls && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Scavenging Rolls</span>
                <span className="text-sm text-muted-foreground">
                  {member.gangs[0]?.scavenging_rolls ?? "-"}
                </span>
              </div>
            )}
            {(isAdmin || member.user_id === currentUserId) && (
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
                  <LuTrash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
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
            setSelectedAllegiance(null);
            setSelectedMember(null);
          }}
          onConfirm={handleAddGang}
          confirmText="Add Gang"
          confirmDisabled={!selectedGang || addGangMutation.isPending}
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
          confirmDisabled={removeGangMutation.isPending}
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
          title={memberToRemove?.user_id === currentUserId ? "Leave Campaign" : "Remove Player from Campaign"}
          content={removeMemberModalContent}
          onClose={() => {
            setShowRemoveMemberModal(false);
            setMemberToRemove(null);
          }}
          onConfirm={handleRemoveMember}
          confirmText={memberToRemove?.user_id === currentUserId ? "Leave Campaign" : "Remove Player"}
          confirmDisabled={false}
        />
      )}
    </div>
  );
} 