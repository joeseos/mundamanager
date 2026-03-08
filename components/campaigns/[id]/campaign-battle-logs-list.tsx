"use client"

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState, useEffect, forwardRef, useImperativeHandle, useMemo, useCallback } from "react";
import { toast } from 'sonner';
import CampaignBattleLogModal from "@/components/campaigns/[id]/campaign-battle-log-modal";
import { BiSolidNotepad } from "react-icons/bi";
import { HiX } from "react-icons/hi";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { deleteBattleLog } from "@/app/actions/campaigns/[id]/battle-logs";
import { updateMemberRole } from "@/app/actions/campaigns/[id]/campaign-members";
import Modal from "@/components/ui/modal";
import Link from "next/link";
import { MdLocalPolice, MdOutlineLocalPolice } from "react-icons/md";
import { HiUser } from "react-icons/hi2";
import { LuTrash2, LuSquarePen } from "react-icons/lu";
import { useMutation } from '@tanstack/react-query';
import { Battle, BattleParticipant, CampaignGang, Territory, Member, Scenario } from '@/types/campaign';
import { Combobox } from "@/components/ui/combobox";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface CampaignBattleLogsTerritory extends Territory {
  default_gang_territory?: boolean;
}

type MemberRole = 'OWNER' | 'ARBITRATOR' | 'MEMBER';

interface CampaignBattleLogsListProps {
  campaignId: string;
  battles: Battle[];
  isAdmin: boolean;
  onBattleAdd: () => void;
  members: Member[];
  territories?: CampaignBattleLogsTerritory[];
  noContainer?: boolean;
  hideAddButton?: boolean;
  userId: string;
  isCampaignOwner?: boolean;
  isCampaignAdmin?: boolean;
}

export interface CampaignBattleLogsListRef {
  openAddModal: () => void;
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

const formatDate = (dateString: string | null) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const CampaignBattleLogsList = forwardRef<CampaignBattleLogsListRef, CampaignBattleLogsListProps>((props, ref) => {
  const {
    campaignId,
    battles,
    isAdmin,
    onBattleAdd,
    members,
    territories = [],
    noContainer = false,
    hideAddButton = false,
    userId,
    isCampaignOwner = false,
    isCampaignAdmin = false,
  } = props;
  
  const [showBattleModal, setShowBattleModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [availableGangs, setAvailableGangs] = useState<CampaignGang[]>([]);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [activeNote, setActiveNote] = useState<string | null>(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [roleChange, setRoleChange] = useState<{ memberId: string; username: string; currentRole: MemberRole; newRole: MemberRole } | null>(null);
  
  const router = useRouter();

  // Use programmatic navigation to avoid Link prefetching
  const handleGangClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>, gangId: string) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    router.push(`/gang/${gangId}`);
  }, [router]);

  // Local state for optimistic updates
  const [localBattles, setLocalBattles] = useState<Battle[]>(battles);

  // Sync with props when they change (from server refresh)
  useEffect(() => {
    setLocalBattles(battles);
  }, [battles]);

  // Filter state
  const [filterCycle, setFilterCycle] = useState<string>('');
  const [filterScenario, setFilterScenario] = useState<string>('');
  const [filterParticipatingGang, setFilterParticipatingGang] = useState<string>('');
  const [filterWinningGang, setFilterWinningGang] = useState<string>('');
  const [filterDraws, setFilterDraws] = useState<boolean>(false);

  // Sorting state
  const [sortField, setSortField] = useState<string>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Standings sort state (separate from battle log sorting)
  const [standingsSortField, setStandingsSortField] = useState<'gang' | 'player' | 'allegiance' | 'victories' | 'defeats' | 'draws'>('victories');
  const [standingsSortDirection, setStandingsSortDirection] = useState<'asc' | 'desc'>('desc');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Map of gang IDs to gang names for lookup
  const [gangNameMap, setGangNameMap] = useState<Map<string, string>>(new Map());
  const [gangColourMap, setGangColourMap] = useState<Map<string, string>>(new Map());

  // State for the selected battle (will be used for edit functionality)
  const [selectedBattle, setSelectedBattle] = useState<Battle | null>(null);
  const [battleToDelete, setBattleToDelete] = useState<Battle | null>(null);

  // Extract unique values for filter options
  const filterOptions = useMemo(() => {
    const cycles = new Set<number>();
    const scenarios = new Set<string>();
    const participatingGangIds = new Set<string>();
    const winningGangIds = new Set<string>();
    let hasDraws = false;

    localBattles.forEach(battle => {
      // Cycles
      if (battle.cycle !== null && battle.cycle !== undefined) {
        cycles.add(battle.cycle);
      }

      // Scenarios
      const scenarioName = battle.scenario || battle.scenario_name;
      if (scenarioName) {
        scenarios.add(scenarioName);
      }

      // Participating gangs
      let participants = battle.participants;
      if (participants && typeof participants === 'string') {
        try {
          participants = JSON.parse(participants);
        } catch (e) {
          participants = [];
        }
      }
      if (participants && Array.isArray(participants)) {
        participants.forEach((p: BattleParticipant) => {
          if (p.gang_id) {
            participatingGangIds.add(p.gang_id);
          }
        });
      }
      // Also check old structure
      if (battle.attacker_id || battle.attacker?.id) {
        const gangId = battle.attacker?.id || battle.attacker_id;
        if (gangId) participatingGangIds.add(gangId);
      }
      if (battle.defender_id || battle.defender?.id) {
        const gangId = battle.defender?.id || battle.defender_id;
        if (gangId) participatingGangIds.add(gangId);
      }

      // Winning gangs
      if (battle.winner_id === null) {
        hasDraws = true;
      } else if (battle.winner_id || battle.winner?.id) {
        const gangId = battle.winner?.id || battle.winner_id;
        if (gangId) winningGangIds.add(gangId);
      }
    });

    return {
      cycles: Array.from(cycles).sort((a, b) => a - b),
      scenarios: Array.from(scenarios).sort(),
      participatingGangIds: Array.from(participatingGangIds),
      winningGangIds: Array.from(winningGangIds),
      hasDraws
    };
  }, [localBattles]);

  // Sort and filter battles
  const sortedAndFilteredBattles = useMemo(() => {
    let filtered = [...localBattles];

    // Apply filters
    if (filterCycle) {
      const cycleNum = parseInt(filterCycle);
      filtered = filtered.filter(battle => battle.cycle === cycleNum);
    }

    if (filterScenario) {
      filtered = filtered.filter(battle => {
        const scenarioName = battle.scenario || battle.scenario_name;
        return scenarioName === filterScenario;
      });
    }

    if (filterParticipatingGang) {
      filtered = filtered.filter(battle => {
        let participants = battle.participants;
        if (participants && typeof participants === 'string') {
          try {
            participants = JSON.parse(participants);
          } catch (e) {
            participants = [];
          }
        }
        if (participants && Array.isArray(participants)) {
          return participants.some((p: BattleParticipant) => p.gang_id === filterParticipatingGang);
        }
        // Also check old structure
        const attackerId = battle.attacker?.id || battle.attacker_id;
        const defenderId = battle.defender?.id || battle.defender_id;
        return attackerId === filterParticipatingGang || defenderId === filterParticipatingGang;
      });
    }

    if (filterWinningGang) {
      filtered = filtered.filter(battle => {
        const winnerId = battle.winner?.id || battle.winner_id;
        return winnerId === filterWinningGang;
      });
    }

    if (filterDraws) {
      filtered = filtered.filter(battle => battle.winner_id === null);
    }

    // Sort based on selected field and direction
    return filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;
      
      switch (sortField) {
        case 'date':
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
          break;
        case 'cycle':
          aValue = a.cycle ?? -1;
          bValue = b.cycle ?? -1;
          break;
        case 'scenario':
          aValue = (a.scenario || a.scenario_name || '').toLowerCase();
          bValue = (b.scenario || b.scenario_name || '').toLowerCase();
          break;
        case 'territory':
          aValue = (a.territory_name || '').toLowerCase();
          bValue = (b.territory_name || '').toLowerCase();
          break;
        case 'winner':
          aValue = (a.winner?.name || '').toLowerCase();
          bValue = (b.winner?.name || '').toLowerCase();
          // Handle draws (null winner_id)
          if (a.winner_id === null) aValue = 'draw';
          if (b.winner_id === null) bValue = 'draw';
          break;
        default:
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
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
  }, [localBattles, filterCycle, filterScenario, filterParticipatingGang, filterWinningGang, filterDraws, sortField, sortDirection]);

  // Handle sorting
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      // Set default direction based on field type
      const numericalFields = ['cycle'];
      const dateFields = ['date'];
      if (dateFields.includes(field)) {
        setSortDirection('desc'); // Newest first for dates
      } else if (numericalFields.includes(field)) {
        setSortDirection('desc'); // Highest first for numbers
      } else {
        setSortDirection('asc'); // A-Z for strings
      }
    }
  };

  // Handle standings column header click for sorting
  const handleStandingsSort = (field: 'gang' | 'player' | 'allegiance' | 'victories' | 'defeats' | 'draws') => {
    if (standingsSortField === field) {
      setStandingsSortDirection(standingsSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setStandingsSortField(field);
      const numericFields = ['victories', 'defeats', 'draws'];
      setStandingsSortDirection(numericFields.includes(field) ? 'desc' : 'asc');
    }
  };

  // Reset pagination when filters or sort change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterCycle, filterScenario, filterParticipatingGang, filterWinningGang, filterDraws, sortField, sortDirection]);

  // Calculate total pages - use filtered battles for pagination
  const totalPages = Math.ceil(sortedAndFilteredBattles.length / itemsPerPage);
  
  // Get current battles for pagination
  const currentBattles = useMemo(() => {
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    return sortedAndFilteredBattles.slice(indexOfFirstItem, indexOfLastItem);
  }, [sortedAndFilteredBattles, currentPage, itemsPerPage]);

  // Check if any filters are active
  const hasActiveFilters = filterCycle || filterScenario || filterParticipatingGang || filterWinningGang || filterDraws;

  // Clear all filters
  const clearFilters = () => {
    setFilterCycle('');
    setFilterScenario('');
    setFilterParticipatingGang('');
    setFilterWinningGang('');
    setFilterDraws(false);
  };
  
  // Pagination navigation
  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };
  
  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  // TanStack Query mutation for deleting battles
  const deleteBattleMutation = useMutation({
    mutationFn: async (battleId: string) => {
      await deleteBattleLog(campaignId, battleId);
    },
    onMutate: async (battleId) => {
      // Optimistically remove the battle using functional update for fresh state
      setLocalBattles((currentBattles) =>
        currentBattles.filter(battle => battle.id !== battleId)
      );

      return { battleId };
    },
    onSuccess: () => {
      toast.success("Battle report deleted successfully");

      // Trigger server refresh after successful delete
      onBattleAdd();
    },
    onError: (error, variables, context) => {
      console.error('Battle deletion failed:', error);

      // Trigger server refresh to get correct state back
      onBattleAdd();

      const errorMessage = error instanceof Error ? error.message : 'Failed to delete battle report';
      toast.error(errorMessage);
    }
  });

  // Callback to handle battle updates from modal - supports both value and updater function
  const handleBattleUpdate = (updatedBattles: Battle[] | ((prevBattles: Battle[]) => Battle[])) => {
    setLocalBattles(updatedBattles);
  };

  // Expose the openAddModal function to parent components
  useImperativeHandle(ref, () => ({
    openAddModal: () => {
      setSelectedBattle(null);
      setShowBattleModal(true);
    }
  }));

  // Extract gangs from members
  useEffect(() => {
    if (members && members.length > 0) {
      // Extract unique gangs from all members
      const gangsMap = new Map<string, CampaignGang>();
      const gangNamesMap = new Map<string, string>();
      const gangColourMap = new Map<string, string>();
      
      members.forEach(member => {
        if (member.gangs && member.gangs.length > 0) {
          member.gangs.forEach(gang => {
            // Create a unique key for each gang instance that includes member instance info
            const gangKey = gang.id;
            
            if (!gangsMap.has(gangKey)) {
              gangsMap.set(gangKey, {
                id: gang.id,
                name: gang.name,
                // Store additional data for reference if needed
                campaign_member_id: member.id || gang.campaign_member_id,
                user_id: member.user_id,
                owner_username: member.profile?.username || member.username || 'Unknown'
              });
              gangNamesMap.set(gang.id, gang.name);
              gangColourMap.set(gang.id, gang.gang_colour || '#000000');
            }
          });
        }
      });
      
      setAvailableGangs(Array.from(gangsMap.values()));
      setGangNameMap(gangNamesMap);
      setGangColourMap(gangColourMap);
    }
  }, [members]);

  // Get gang name by ID - prioritize battle data, fallback to member data
  const getGangName = (gangId: string | undefined, battleGangName?: string): string => {
    if (!gangId) return "Unknown";
    // First try to use the gang name from the battle data itself
    if (battleGangName && battleGangName !== "Unknown") {
      return battleGangName;
    }
    // Fallback to the member-based gang map
    return gangNameMap.get(gangId) || "Unknown";
  };

  const getGangColour = (gangId: string | undefined): string => {
    if (!gangId) return '#000000';
    return gangColourMap.get(gangId) || '#000000';
  };

  // Get gang info by ID for filter labels
  const getGangInfo = (gangId: string): { name: string; owner_username?: string } => {
    const gang = availableGangs.find(g => g.id === gangId);
    if (gang) {
      return {
        name: gang.name,
        owner_username: gang.owner_username
      };
    }
    return {
      name: gangNameMap.get(gangId) || 'Unknown'
    };
  };

  // Check whether a gang participated in a given battle
  const gangParticipatedIn = useCallback((battle: Battle, gangId: string): boolean => {
    let participants = battle.participants;
    if (participants && typeof participants === 'string') {
      try { participants = JSON.parse(participants); } catch { participants = []; }
    }
    if (participants && Array.isArray(participants)) {
      return participants.some((p: BattleParticipant) => p.gang_id === gangId);
    }
    return battle.attacker_id === gangId || battle.defender_id === gangId;
  }, []);

  // Compute gang standings from battles + members
  const gangStandings = useMemo(() => {
    const rows: Array<{
      gangId: string;
      gangName: string;
      gangColour: string;
      playerName: string;
      playerId: string;
      playerRole: MemberRole | undefined;
      allegianceName: string;
      victories: number;
      defeats: number;
      draws: number;
    }> = [];

    members.forEach(member => {
      if (!member.gangs) return;
      member.gangs.forEach(gang => {
        const gangId = gang.id;
        let victories = 0;
        let defeats = 0;
        let draws = 0;

        localBattles.forEach(battle => {
          if (!gangParticipatedIn(battle, gangId)) return;
          if (battle.winner_id === null) {
            draws++;
          } else if (battle.winner_id === gangId) {
            victories++;
          } else {
            defeats++;
          }
        });

        rows.push({
          gangId,
          gangName: gang.name,
          gangColour: gang.gang_colour || '#000000',
          playerName: member.profile?.username || member.username || '',
          playerId: member.user_id,
          playerRole: member.role as MemberRole | undefined,
          allegianceName: gang.allegiance?.name || '',
          victories,
          defeats,
          draws,
        });
      });
    });

    rows.sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (standingsSortField) {
        case 'gang': aVal = a.gangName.toLowerCase(); bVal = b.gangName.toLowerCase(); break;
        case 'player': aVal = a.playerName.toLowerCase(); bVal = b.playerName.toLowerCase(); break;
        case 'allegiance': aVal = a.allegianceName.toLowerCase(); bVal = b.allegianceName.toLowerCase(); break;
        case 'victories': aVal = a.victories; bVal = b.victories; break;
        case 'defeats': aVal = a.defeats; bVal = b.defeats; break;
        case 'draws': aVal = a.draws; bVal = b.draws; break;
        default: aVal = a.victories; bVal = b.victories;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const cmp = aVal.localeCompare(bVal);
        return standingsSortDirection === 'asc' ? cmp : -cmp;
      }

      if (aVal < bVal) return standingsSortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return standingsSortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return rows;
  }, [members, localBattles, standingsSortField, standingsSortDirection, gangParticipatedIn]);

  // Check if user can edit/delete this battle
  const canUserEditBattle = useCallback((battle: Battle): boolean => {
    // Admins can edit any battle
    if (isAdmin) return true;

    // Parse participants if it's a string
    let participants: BattleParticipant[] = [];
    if (battle.participants) {
      if (typeof battle.participants === 'string') {
        try {
          participants = JSON.parse(battle.participants);
        } catch {
          participants = [];
        }
      } else if (Array.isArray(battle.participants)) {
        participants = battle.participants;
      }
    }

    // Check if user owns any participating gang
    return participants.some((p) => {
      if (!p.gang_id) return false;
      const gang = availableGangs.find(g => g.id === p.gang_id);
      return gang?.user_id === userId;
    });
  }, [isAdmin, availableGangs, userId]);

  // Get all gangs with their roles for a battle
  const getGangsWithRoles = (battle: Battle): React.ReactNode => {
    // Parse participants if it's a string
    let participants = battle.participants;
    if (participants && typeof participants === 'string') {
      try {
        participants = JSON.parse(participants);
      } catch (e) {
        console.error('Error parsing participants:', e);
        participants = [];
      }
    }

    // If using the new data structure with participants
    if (participants && Array.isArray(participants) && participants.length > 0) {
      // If no gangs with roles, return None
      if (participants.every(p => !p.gang_id)) {
        return <span className="text-muted-foreground">None</span>;
      }

      // Create a map of gang IDs to gang names from battle data
      const battleGangNames = new Map<string, string>();
      if (battle.attacker?.id && battle.attacker?.name) {
        battleGangNames.set(battle.attacker.id, battle.attacker.name);
      }
      if (battle.defender?.id && battle.defender?.name) {
        battleGangNames.set(battle.defender.id, battle.defender.name);
      }

      participants = [...participants].sort((a, b) => {
        const roleOrder: Record<'attacker' | 'defender' | 'none', number> = { attacker: 0, defender: 1, none: 99 };
        const roleA = roleOrder[a.role] ?? 99;
        const roleB = roleOrder[b.role] ?? 99;

        if (roleA !== roleB) return roleA - roleB;

        const nameA = getGangName(a.gang_id, battleGangNames.get(a.gang_id)).toLowerCase();
        const nameB = getGangName(b.gang_id, battleGangNames.get(b.gang_id)).toLowerCase();
        return nameA.localeCompare(nameB);
      });

      return (
        <div className="space-y-1">
          {participants.map((participant, index) => {
            if (!participant.gang_id) return null;
            
            // Role indicator
            let roleColor = "";
            let roleLetter = "";
            if (participant.role === 'attacker') {
              roleColor = "bg-red-500";
              roleLetter = "A";
            } else if (participant.role === 'defender') {
              roleColor = "bg-blue-500";
              roleLetter = "D";
            }
            
            const gangName = getGangName(participant.gang_id, battleGangNames.get(participant.gang_id));
            
            return (
              <div key={index}>
                <div className="flex items-center space-x-1">
                  <span className={`inline-flex shrink-0 items-center justify-center w-5 h-5 min-w-5 min-h-5 rounded-full ${roleColor} text-white text-[10px] font-bold`}>
                    {roleLetter}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted"
                    style={{ color: getGangColour(participant.gang_id) }}
                  >
                    <a
                      href={`/gang/${participant.gang_id}`}
                      className="hover:text-muted-foreground transition-colors"
                      onClick={(e) => handleGangClick(e, participant.gang_id)}
                    >
                      {gangName}
                    </a>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    
    // Fallback to old data structure
    const gangs = [];
    
    if (battle.attacker_id || battle.attacker?.id) {
      const gangId = battle.attacker?.id || battle.attacker_id;
      const gangName = battle.attacker?.name || getGangName(gangId || "");

      if (gangId) {
        gangs.push({
          id: gangId,
          name: gangName,
          role: 'attacker'
        });
      }
    }

    if (battle.defender_id || battle.defender?.id) {
      const gangId = battle.defender?.id || battle.defender_id;
      const gangName = battle.defender?.name || getGangName(gangId || "");
      
      if (gangId) {
        gangs.push({
          id: gangId,
          name: gangName,
          role: 'defender'
        });
      }
    }
    
    if (gangs.length === 0) {
      return <span className="text-muted-foreground">None</span>;
    }

    gangs.sort((a, b) => {
      const roleOrder = { attacker: 0, defender: 1 };
      const roleA = roleOrder[a.role as 'attacker' | 'defender'] ?? 99;
      const roleB = roleOrder[b.role as 'attacker' | 'defender'] ?? 99;

      if (roleA !== roleB) return roleA - roleB;

      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
    
    return (
      <div className="space-y-1">
        {gangs.map((gang, index) => {
          const roleColor = gang.role === 'attacker' ? 'bg-red-500' : 'bg-blue-500';
          const roleLetter = gang.role === 'attacker' ? 'A' : 'D';
          
          return (
            <div key={index}>
              <div className="flex items-center space-x-1">
                <span className={`inline-flex shrink-0 items-center justify-center w-5 h-5 min-w-5 min-h-5 rounded-full ${roleColor} text-white text-[10px] font-bold`}>
                  {roleLetter}
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground">
                  <a
                    href={`/gang/${gang.id}`}
                    className="hover:text-muted-foreground transition-colors"
                    onClick={(e) => handleGangClick(e, gang.id)}
                  >
                    {gang.name}
                  </a>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Edit battle handler
  const handleEditBattle = (battle: Battle) => {
    // Check if user has permission to edit this battle
    if (!canUserEditBattle(battle)) {
      toast.error("You don't have permission to edit this battle log.");
      return;
    }

    setSelectedBattle(battle);
    setShowBattleModal(true);
  };

  // Delete battle handler
  const handleDeleteBattle = (battle: Battle, e?: React.MouseEvent) => {
    // Prevent any default actions or propagation
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    setBattleToDelete(battle);
    setShowDeleteModal(true);
    return false; // Ensure no further action is taken
  };

  // Confirm delete battle
  const confirmDeleteBattle = async () => {
    if (!battleToDelete) return false;

    // Close modal immediately for instant UX
    setShowDeleteModal(false);
    const battleId = battleToDelete.id;
    setBattleToDelete(null);

    // Fire mutation with optimistic update
    deleteBattleMutation.mutate(battleId);

    return true;
  };

  // Handle modal close
  const handleModalClose = () => {
    setShowBattleModal(false);
    setSelectedBattle(null);
  };

  // Handle delete modal close
  const handleDeleteModalClose = () => {
    setShowDeleteModal(false);
    setBattleToDelete(null);
  };

  // Handle role change confirmation
  const handleRoleChange = async () => {
    if (!roleChange) return false;
    if (!isCampaignOwner && !isCampaignAdmin) {
      toast.error("You don't have permission to change roles");
      return false;
    }
    try {
      const result = await updateMemberRole({
        campaignId,
        userId: roleChange.memberId,
        newRole: roleChange.newRole,
        previousRole: roleChange.currentRole
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      onBattleAdd();
      toast.success(`Updated ${roleChange.username}'s role to ${roleChange.newRole}`);
      setShowRoleModal(false);
      setRoleChange(null);
      return true;
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error(error instanceof Error ? error.message : "Failed to update role");
      return false;
    }
  };

  // The content to render
  const content = (
    <>
      {!noContainer && (
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl md:text-2xl font-bold">Battle Log</h2>
          {!hideAddButton && (
            <Button
              onClick={() => {
                setSelectedBattle(null);
                setShowBattleModal(true);
              }}
              className="bg-neutral-900 hover:bg-gray-800 text-white"
              aria-label="Add battle report"
            >
              Add
            </Button>
          )}
        </div>
      )}
      {noContainer && !hideAddButton && (
        <div className="flex justify-end mb-4">
          <Button
            onClick={() => {
              setSelectedBattle(null);
              setShowBattleModal(true);
            }}
            className="bg-neutral-900 hover:bg-gray-800 text-white"
            aria-label="Add battle report"
          >
            Add
          </Button>
        </div>
      )}

      {/* Filter Section */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Filters</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Cycle Filter */}
          <div className="space-y-1">
            <Label htmlFor="filter-cycle" className="text-xs">Cycle</Label>
            <Combobox
              options={[
                { value: '', label: 'All Cycles' },
                ...filterOptions.cycles.map(cycle => ({
                  value: cycle.toString(),
                  label: `Cycle ${cycle}`
                }))
              ]}
              value={filterCycle}
              onValueChange={setFilterCycle}
              placeholder="All Cycles"
              className="h-9"
            />
          </div>

          {/* Scenario Filter */}
          <div className="space-y-1">
            <Label htmlFor="filter-scenario" className="text-xs">Scenario</Label>
            <Combobox
              options={[
                { value: '', label: 'All Scenarios' },
                ...filterOptions.scenarios.map(scenario => ({
                  value: scenario,
                  label: scenario
                }))
              ]}
              value={filterScenario}
              onValueChange={setFilterScenario}
              placeholder="All Scenarios"
              className="h-9"
            />
          </div>

          {/* Participating Gang Filter */}
          <div className="space-y-1">
            <Label htmlFor="filter-participating" className="text-xs">Participating Gang</Label>
            <Combobox
              options={[
                { value: '', label: 'All Gangs' },
                ...filterOptions.participatingGangIds.map(gangId => {
                  const gangInfo = getGangInfo(gangId);
                  const hasOwner = !!gangInfo.owner_username;
                  const displayValue = hasOwner
                    ? `${gangInfo.name} • ${gangInfo.owner_username}`
                    : gangInfo.name;

                  return {
                    value: gangId,
                    label: hasOwner ? (
                      <span>
                        <span>{gangInfo.name}</span>
                        <span className="text-xs text-muted-foreground"> • {gangInfo.owner_username}</span>
                      </span>
                    ) : gangInfo.name,
                    displayValue,
                  };
                })
              ]}
              value={filterParticipatingGang}
              onValueChange={setFilterParticipatingGang}
              placeholder="All Gangs"
              className="h-9"
            />
          </div>

          {/* Winning Gang Filter */}
          <div className="space-y-1">
            <Label htmlFor="filter-winning" className="text-xs">Winning Gang</Label>
            <Combobox
              options={[
                { value: '', label: 'All Winners' },
                ...filterOptions.winningGangIds.map(gangId => {
                  const gangInfo = getGangInfo(gangId);
                  const hasOwner = !!gangInfo.owner_username;
                  const displayValue = hasOwner
                    ? `${gangInfo.name} • ${gangInfo.owner_username}`
                    : gangInfo.name;

                  return {
                    value: gangId,
                    label: hasOwner ? (
                      <span className="flex items-center gap-1">
                        <span>{gangInfo.name}</span>
                        <span className="text-xs text-muted-foreground">• {gangInfo.owner_username}</span>
                      </span>
                    ) : gangInfo.name,
                    displayValue,
                  };
                })
              ]}
              value={filterWinningGang}
              onValueChange={setFilterWinningGang}
              placeholder="All Winners"
              className="h-9"
            />
          </div>

          {/* Draws Filter */}
          <div className="space-y-1">
            <Label htmlFor="filter-draws" className="text-xs">Show Only Draws</Label>
            <div className="flex items-center space-x-2 h-9">
              <Checkbox
                id="filter-draws"
                checked={filterDraws}
                onCheckedChange={(checked) => setFilterDraws(checked === true)}
              />
              <Label htmlFor="filter-draws" className="text-xs font-normal cursor-pointer">
                Draws only
              </Label>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="leading-[3] text-xs text-muted-foreground">
            {hasActiveFilters 
              ? `Showing ${sortedAndFilteredBattles.length} of ${localBattles.length} battles`
              : `Showing all ${localBattles.length} battles`}
          </span>
          {hasActiveFilters && (
            <Button
              onClick={clearFilters}
              variant="outline"
              size="sm"
            >
              <HiX className="h-3 w-3 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-xs md:text-sm">
          <thead>
            <tr className="bg-muted border-b">
              <th 
                className="p-1 md:p-2 text-left font-medium min-w-[5rem] md:min-w-[6.2rem] cursor-pointer hover:bg-muted transition-colors select-none"
                onClick={() => handleSort('date')}
              >
                <div className="flex items-center gap-1">
                  Date
                  {sortField === 'date' && (
                    <span className="text-muted-foreground">
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              </th>
              <th 
                className="p-1 md:p-2 text-left font-medium min-w-[1rem] cursor-pointer hover:bg-muted transition-colors select-none"
                onClick={() => handleSort('cycle')}
              >
                <div className="flex items-center gap-1">
                  Cycle
                  {sortField === 'cycle' && (
                    <span className="text-muted-foreground">
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              </th>
              <th 
                className="p-1 md:p-2 text-left font-medium max-w-[8rem] cursor-pointer hover:bg-muted transition-colors select-none"
                onClick={() => handleSort('scenario')}
              >
                <div className="flex items-center gap-1">
                  Scenario
                  {sortField === 'scenario' && (
                    <span className="text-muted-foreground">
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              </th>
              <th 
                className="p-1 md:p-2 text-left font-medium cursor-pointer hover:bg-muted transition-colors select-none"
                onClick={() => handleSort('territory')}
              >
                <div className="flex items-center gap-1">
                  Territory
                  {sortField === 'territory' && (
                    <span className="text-muted-foreground">
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              </th>
              <th className="px-7 py-2 text-left font-medium">Gangs</th>
              <th className="px-2 py-2 text-left font-medium">Winner</th>
              <th className="p-1 md:p-2 text-left font-medium">Report</th>
              {(isAdmin || availableGangs.length > 0) && <th className="p-1 md:p-2 text-right font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {sortedAndFilteredBattles.length === 0 ? (
              <tr>
                <td colSpan={(isAdmin || availableGangs.length > 0) ? 8 : 7} className="text-muted-foreground italic text-center">
                  {localBattles.length === 0 
                    ? "No battles recorded yet."
                    : "No battles match the selected filters."}
                </td>
              </tr>
            ) : (
              currentBattles.map((battle) => (
                <tr key={battle.id} className="border-b">
                  <td className="p-1 md:p-2 align-top max-w-[5rem]">
                    {formatDate(battle.created_at)}
                  </td>

                  <td className="p-1 md:p-2 align-top">
                    {battle.cycle || '-'}
                  </td>

                  <td className="p-1 md:p-2 align-top max-w-[8rem]">
                    {battle.scenario || battle.scenario_name || 'N/A'}
                  </td>

                  <td className="p-1 md:p-2 align-top">
                    {battle.territory_name || '-'}
                  </td>

                  <td className="p-1 md:p-2 align-top">
                    {getGangsWithRoles(battle)}
                  </td>

                  <td className="p-1 md:p-2 align-top">
                    {battle.winner?.id ? (
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted"
                        style={{ color: getGangColour(battle.winner.id) }}
                      >
                        <a
                          href={`/gang/${battle.winner.id}`}
                          className="hover:text-muted-foreground transition-colors"
                          onClick={(e) => handleGangClick(e, battle.winner!.id)}
                        >
                          {battle.winner.name || 'Unknown'}
                        </a>
                      </span>
                    ) : battle.winner_id === null ? (
                      <span className="ml-2 text-xs">Draw</span>
                    ) : (
                      <span className="ml-2 text-xs">{battle.winner?.name || 'Unknown'}</span>
                    )}
                  </td>

                  <td className="p-1 md:p-2 align-top">
                    {battle.note && (
                      <button
                        onClick={() => {
                          setActiveNote(battle.note || '');
                          setShowNoteModal(true);
                        }}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="View note"
                      >
                        <BiSolidNotepad className="text-lg" />
                      </button>
                    )}
                  </td>
                  {canUserEditBattle(battle) && (
                    <td className="p-1 md:p-2 align-top text-right">
                      <div className="flex justify-end space-x-2">
                        <Button
                          onClick={() => handleEditBattle(battle)}
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0"
                          aria-label="Edit battle"
                        >
                          <LuSquarePen className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={(e) => handleDeleteBattle(battle, e)}
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          aria-label="Delete battle"
                        >
                          <LuTrash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center mt-4">
          <Button
            onClick={goToPreviousPage}
            disabled={currentPage === 1}
            variant="outline"
            size="sm"
            className="flex items-center gap-1"
          >
            <LuChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="text-sm">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            onClick={goToNextPage}
            disabled={currentPage === totalPages}
            variant="outline"
            size="sm"
            className="flex items-center gap-1"
          >
            Next
            <LuChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Standings Table */}
      <div className="mt-8">
        <h3 className="text-xl md:text-2xl font-bold mb-3">Standings</h3>
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-xs md:text-sm">
            <thead>
              <tr className="bg-muted border-b">
                {(['gang', 'player', 'allegiance', 'victories', 'defeats', 'draws'] as const).map(field => (
                  <th
                    key={field}
                    className={`p-1 md:p-2 text-left font-medium cursor-pointer hover:bg-muted transition-colors select-none whitespace-nowrap ${field === 'gang' ? 'max-w-[12rem]' : ''}`}
                    onClick={() => handleStandingsSort(field)}
                  >
                    <div className="flex items-center gap-1">
                      {field.charAt(0).toUpperCase() + field.slice(1)}
                      {standingsSortField === field && (
                        <span className="text-muted-foreground">
                          {standingsSortDirection === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gangStandings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-muted-foreground italic text-center py-4">
                    No gangs in this campaign
                  </td>
                </tr>
              ) : (
                gangStandings.map(row => (
                  <tr key={row.gangId} className="border-b last:border-0">
                    <td className="p-1 md:p-2 max-w-[12rem]">
                      <span
                        className="inline-block max-w-full px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted"
                        style={{ color: row.gangColour }}
                        title={row.gangName}
                      >
                        <a
                          href={`/gang/${row.gangId}`}
                          className="hover:text-muted-foreground transition-colors block truncate"
                          onClick={(e) => handleGangClick(e, row.gangId)}
                        >
                          {row.gangName}
                        </a>
                      </span>
                    </td>
                    <td className="p-1 md:p-2">
                      <div className="flex items-center gap-2">
                        {(isCampaignOwner || isCampaignAdmin) && row.playerId !== userId && row.playerRole && row.playerRole !== 'OWNER' ? (
                          <button
                            onClick={() => {
                              setRoleChange({
                                memberId: row.playerId,
                                username: row.playerName,
                                currentRole: row.playerRole || 'MEMBER',
                                newRole: row.playerRole === 'ARBITRATOR' ? 'MEMBER' : 'ARBITRATOR'
                              });
                              setShowRoleModal(true);
                            }}
                            className="inline-flex items-center px-0.5 py-0.5 rounded-full text-xs font-medium bg-muted hover:text-muted-foreground transition-colors"
                          >
                            {formatRole(row.playerRole)}
                          </button>
                        ) : (
                          <span className="inline-flex items-center px-0.5 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground">
                            {formatRole(row.playerRole)}
                          </span>
                        )}
                        <Link
                          href={`/user/${row.playerId}`}
                          prefetch={false}
                          className="text-xs font-medium hover:text-muted-foreground transition-colors"
                        >
                          {row.playerName}
                        </Link>
                      </div>
                    </td>
                    <td className="p-1 md:p-2">{row.allegianceName || ''}</td>
                    <td className="p-1 md:p-2 text-green-600 dark:text-green-400 font-medium">{row.victories}</td>
                    <td className="p-1 md:p-2 text-red-600 dark:text-red-400 font-medium">{row.defeats}</td>
                    <td className="p-1 md:p-2 font-medium">{row.draws}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Battle Log Modal for Add/Edit */}
      <CampaignBattleLogModal
        campaignId={campaignId}
        availableGangs={availableGangs}
        territories={territories.map(t => ({
          id: t.id,
          name: t.territory_name,
          controlled_by: t.gang_id || undefined,
          is_custom: t.is_custom,
          territory_id: t.territory_id,
          custom_territory_id: t.custom_territory_id,
          default_gang_territory: t.default_gang_territory
        }))}
        isOpen={showBattleModal}
        onClose={handleModalClose}
        onSuccess={onBattleAdd}
        onBattleUpdate={handleBattleUpdate}
        localBattles={localBattles}
        battleToEdit={selectedBattle}
        userRole={isAdmin ? 'ARBITRATOR' : 'MEMBER'}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <Modal
          title="Delete Battle Report"
          content={
            <div>
              <p className="mb-4">Are you sure you want to delete this battle report?</p>
              {battleToDelete && (
                <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                  <p><span className="font-medium">Date:</span> {formatDate(battleToDelete.created_at)}</p>
                  <p><span className="font-medium">Scenario:</span> {battleToDelete.scenario || battleToDelete.scenario_name || 'N/A'}</p>
                </div>
              )}
              <p className="text-sm text-red-600 mt-4">
                This action cannot be undone.
              </p>
            </div>
          }
          onClose={handleDeleteModalClose}
          onConfirm={confirmDeleteBattle}
          confirmText={deleteBattleMutation.isPending ? "Deleting..." : "Delete"}
          confirmDisabled={deleteBattleMutation.isPending}
        />
      )}
      {showNoteModal && (
        <Modal
          title="Battle Report"
          content={
            <div className="whitespace-pre-wrap text-sm text-foreground">
              {activeNote}
            </div>
          }
          onClose={() => {
            setShowNoteModal(false);
            setActiveNote(null);
          }}
          onConfirm={() => {
            setShowNoteModal(false);
            setActiveNote(null);
          }}
          confirmText="Close"
          hideCancel
        />
      )}
      {showRoleModal && roleChange && (
        <Modal
          title="Change Player Role"
          content={
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to change <span className="font-bold">{roleChange.username}</span>&apos;s role from{' '}
                <span className="font-bold">{roleChange.currentRole}</span> to{' '}
                <span className="font-bold">{roleChange.newRole}</span>?
              </p>
            </div>
          }
          onClose={() => {
            setShowRoleModal(false);
            setRoleChange(null);
          }}
          onConfirm={handleRoleChange}
          confirmText="Change Role"
          confirmDisabled={false}
        />
      )}
    </>
  );

  // Return with or without a container based on prop
  return noContainer ? content : (
    <div className="bg-card shadow-md rounded-lg p-4">
      {content}
    </div>
  );
});

CampaignBattleLogsList.displayName = "CampaignBattleLogsList";

export default CampaignBattleLogsList; 