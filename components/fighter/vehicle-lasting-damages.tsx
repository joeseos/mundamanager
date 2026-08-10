import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { FighterEffect } from '@/types/fighter';
import { toast } from 'sonner';
import Modal from '../ui/modal';
import { Checkbox } from "@/components/ui/checkbox";
import DiceRoller from '@/components/dice-roller';
import {
  rollNd6Outcome,
  rollD66Outcome,
  vehicleDamageTableFor,
  resolveVehicleDamageFor,
  resolveVehicleDamageRangeByNameFor,
  vehicleRepairModelFor,
  resolveVehicleRepairFromUtil,
} from '@/utils/dice';
import { UserPermissions } from '@/types/user-permissions';
import { LuTrash2 } from 'react-icons/lu';
import { addVehicleDamage, verifyAndLogRolledVehicleDamage } from '@/app/actions/add-vehicle-damage';
import { removeVehicleDamage, repairVehicleDamage } from '@/app/actions/remove-vehicle-damage';
import {
  addFighterInjury,
  deleteFighterInjury,
  verifyAndLogRolledFighterInjury,
} from '@/app/actions/fighter-injury';
import { requiredHatredTarget } from '@/utils/injuryTarget';
import { InjuryHatredTargetPicker } from '@/components/fighter/injury-hatred-target-picker';
import { fetchCampaignGangsAndFighters } from '@/utils/api/fighter-ooa-records';
import type { CampaignGangWithFighters } from '@/types/fighter-ooa-record';
import { hasKilledStatusFlag } from '@/utils/fighter-status';
import { buildGangComboboxOption } from '@/utils/gang-combobox-option';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Combobox } from '@/components/ui/combobox';

interface VehicleDamagesListProps {
  damages: Array<FighterEffect>;
  /** When true, open the Add Lasting Damage modal on mount (e.g. from gang card floating menu) */
  initialOpenAddModal?: boolean;
  /** When true, render only the add form (no list). Use when opening directly from gang card menu. */
  addFormOnly?: boolean;
  /** When addFormOnly, called when user cancels or after successful add (closes parent modal). */
  onRequestClose?: () => void;
  onDamageUpdate: (updatedDamages: FighterEffect[]) => void;
  /**
   * N26 damages set fighter status the way lasting injuries do. Omitted on N23,
   * where the damage sits on the vehicle and the fighter is untouched.
   */
  onFighterStatusUpdate?: (status: {
    recovery?: boolean;
    captured?: boolean;
    capturedByGangId?: string | null;
    killed?: boolean;
  }) => void;
  fighterId: string;
  /**
   * Null on N26, where the vehicle is the fighter and there is no `vehicles` row.
   * The damage then hangs off fighter_effects.fighter_id and goes through the
   * fighter-scoped actions; a non-null id keeps the N23 vehicle-scoped path.
   */
  vehicleId: string | null;
  gangId: string;
  vehicle: any; // Pass the full vehicle object for cost calculation
  gangCredits?: number;
  onGangCreditsUpdate?: (newCredits: number) => void;
  userPermissions: UserPermissions;
  /** Scopes the damage catalog and the D6/D66 table to one ruleset. */
  editionSlug?: string | null;
  /** Campaign membership, for the Hatred (X) and Captured pickers on N26. */
  fighterCampaigns?: Array<{ campaign_id?: string; id?: string }>;
  fighterRecovery?: boolean;
}

type RepairCondition = "Almost like new" | "Quality repairs" | "Superficial Damage";

export function VehicleDamagesList({
  damages = [],
  initialOpenAddModal = false,
  addFormOnly = false,
  onRequestClose,
  onDamageUpdate,
  onFighterStatusUpdate,
  fighterId,
  vehicleId,
  gangId,
  vehicle,
  gangCredits,
  onGangCreditsUpdate,
  userPermissions,
  editionSlug = null,
  fighterCampaigns,
  fighterRecovery = false
}: VehicleDamagesListProps) {
  const [deleteModalData, setDeleteModalData] = useState<{ id: string; name: string } | null>(null);
  const [repairCost, setRepairCost] = useState<number>(0);
  const [repairPercent, setRepairPercent] = useState<0 | 10 | 25>(0);
  const [repairType, setRepairType] = useState<RepairCondition>("Superficial Damage");
  const [isRepairing, setIsRepairing] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedDamageId, setSelectedDamageId] = useState<string>('');
  const [isRepairModalOpen, setIsRepairModalOpen] = useState(false);
  const [selectedRepairTypeId, setSelectedRepairTypeId] = useState<string>('');
  const [damageRollCooldown, setDamageRollCooldown] = useState(false);
  // N26 Chop Shop: damages are removed individually, so selection is by effect row
  // id — two instances of the same damage must be paid for separately.
  const [selectedRepairIds, setSelectedRepairIds] = useState<string[]>([]);
  const [selectedCapturingGangId, setSelectedCapturingGangId] = useState<string>('');
  const [selectedHatredTargetId, setSelectedHatredTargetId] = useState<string>('');
  // First step of the fighter picker only — narrows the list, never submitted.
  const [selectedHatredGangId, setSelectedHatredGangId] = useState<string>('');
  const [campaignGangs, setCampaignGangs] = useState<CampaignGangWithFighters[]>([]);
  const [isFetchingGangs, setIsFetchingGangs] = useState(false);

  const queryClient = useQueryClient();

  // A vehicle with no `vehicles` row is the fighter itself (N26): its damages live
  // on fighter_effects.fighter_id and go through the fighter-scoped actions.
  const isFighterScoped = vehicleId === null;

  const { entries: damageEntries, dice: damageDice } = vehicleDamageTableFor(editionSlug);
  const hasDamageTable = damageEntries.length > 0;
  const repairModel = vehicleRepairModelFor(editionSlug);

  const campaignIds = useMemo(
    () =>
      (fighterCampaigns ?? [])
        .map(campaign => campaign.campaign_id ?? campaign.id)
        .filter((id): id is string => Boolean(id)),
    [fighterCampaigns]
  );

  // N23 rolls a repair quality on D6. N26's Chop Shop has no roll, so this is empty there.
  const repairTypes = useMemo(
    () =>
      repairModel?.kind === 'roll'
        ? repairModel.entries.map((entry) => ({
            id: `repair-${entry.name.toLowerCase().replace(/\s+/g, '-')}`,
            effect_name: entry.name,
            range: entry.range
          }))
        : [],
    [repairModel]
  );

  const logDamageRollMutation = useMutation({
    mutationFn: async (variables: {
      vehicle_id: string | null;
      fighter_id: string;
      gang_id: string;
      damage_type_id: string;
      damage_table: string;
      dice_data: { result: number };
    }) => {
      // verifyAndLogRolledVehicleDamage reads the `vehicles` row, which an N26
      // vehicle does not have; the fighter-scoped logger takes its place.
      const result = variables.vehicle_id
        ? await verifyAndLogRolledVehicleDamage({
            vehicle_id: variables.vehicle_id,
            fighter_id: variables.fighter_id,
            gang_id: variables.gang_id,
            damage_type_id: variables.damage_type_id,
            damage_table: variables.damage_table,
            dice_data: variables.dice_data
          })
        : await verifyAndLogRolledFighterInjury({
            fighter_id: variables.fighter_id,
            injury_type_id: variables.damage_type_id,
            injury_table: variables.damage_table,
            dice_data: variables.dice_data
          });
      if (!result.success) {
        throw new Error(result.error || 'Failed to log vehicle damage roll');
      }
      return result;
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to log vehicle damage roll');
    }
  });

  const logResolvedDamageRollWithCooldown = (damage: { id: string; effect_name: string }, roll: number) => {
    if (damageRollCooldown || logDamageRollMutation.isPending) return;
    setDamageRollCooldown(true);
    logDamageRollMutation.mutate({
      vehicle_id: vehicleId,
      fighter_id: fighterId,
      gang_id: gangId,
      damage_type_id: damage.id,
      damage_table: 'Lasting Damage',
      dice_data: { result: roll }
    });
    setTimeout(() => setDamageRollCooldown(false), 2000);
  };

  const tempIdCounter = useRef(0);

  // TanStack Query mutations
  const addDamageMutation = useMutation({
    /**
     * Two write paths, one normalised result. An N23 damage belongs to a `vehicles`
     * row; an N26 damage belongs to the fighter, so it goes through the ordinary
     * lasting-injury action — which is what puts it on fighter_effects.fighter_id
     * and applies its Recovery / Captured / destroyed flags.
     */
    mutationFn: async (variables: {
      vehicleId: string | null;
      fighterId: string;
      gangId: string;
      damageId: string;
      damageName: string;
      sendToRecovery?: boolean;
      setKilled?: boolean;
      setCaptured?: boolean;
      capturedByGangId?: string | null;
      hatredTargetId?: string;
    }) => {
      if (variables.vehicleId) {
        const result = await addVehicleDamage({
          vehicleId: variables.vehicleId,
          fighterId: variables.fighterId,
          gangId: variables.gangId,
          damageId: variables.damageId,
          damageName: variables.damageName
        });
        if (!result.success || !result.data) {
          throw new Error(result.error || 'Failed to add vehicle damage');
        }
        const row = result.data;
        return {
          effect: {
            id: row.id,
            effect_name: row.effect_name,
            fighter_effect_type_id: row.effect_type?.id,
            fighter_effect_modifiers: row.fighter_effect_modifiers || [],
            type_specific_data: row.type_specific_data,
            created_at: row.created_at || new Date().toISOString()
          } as FighterEffect,
          status: null
        };
      }

      const result = await addFighterInjury({
        fighter_id: variables.fighterId,
        injury_type_id: variables.damageId,
        send_to_recovery: variables.sendToRecovery,
        set_killed: variables.setKilled,
        set_captured: variables.setCaptured,
        captured_by_gang_id: variables.capturedByGangId ?? null,
        hatred_target_id: variables.hatredTargetId ?? null
      });
      if (!result.success || !result.injury) {
        throw new Error(result.error || 'Failed to add lasting damage');
      }
      return {
        effect: result.injury as FighterEffect,
        status: {
          recovery: result.recovery_status,
          captured: result.captured_status,
          capturedByGangId: variables.setCaptured ? (variables.capturedByGangId ?? null) : undefined,
          killed: result.killed_status
        }
      };
    },
    onMutate: async (variables) => {
      // Find the selected damage for optimistic update
      const selectedDamage = availableDamages.find((d: any) => d.id === variables.damageId);
      if (!selectedDamage) return { previousDamages: damages };

      // Create optimistic damage object
      const optimisticDamage: FighterEffect = {
        id: `temp-${++tempIdCounter.current}`,
        effect_name: selectedDamage.effect_name,
        fighter_effect_type_id: variables.damageId,
        fighter_effect_modifiers: selectedDamage.fighter_effect_modifiers || [],
        type_specific_data: selectedDamage.type_specific_data,
        created_at: new Date().toISOString()
      };

      // Store previous state for rollback
      const previousDamages = [...damages];

      // Optimistically update the UI
      const updatedDamages = [...damages, optimisticDamage];
      onDamageUpdate(updatedDamages);

      return { previousDamages, optimisticDamage };
    },
    onSuccess: (result, variables, context) => {
      // Replace optimistic damage with the real one so delete uses the real id
      if (context?.previousDamages && onDamageUpdate) {
        onDamageUpdate([...context.previousDamages, result.effect]);
      }

      // Recovery / Captured / destroyed are fighter statuses, so only the
      // fighter-scoped path produces them.
      if (result.status) {
        onFighterStatusUpdate?.(result.status);
      }

      // Invalidate related queries in the query client
      queryClient.invalidateQueries({ queryKey: ['fighter', variables.fighterId] });
      queryClient.invalidateQueries({ queryKey: ['gang', variables.gangId] });
      queryClient.invalidateQueries({ queryKey: ['vehicle', vehicleId] });

      const statusNotes = [
        result.status?.recovery && 'sent to Recovery',
        result.status?.captured && 'marked as Captured',
        result.status?.killed && 'destroyed'
      ].filter(Boolean);
      toast.success(
        statusNotes.length > 0
          ? `Lasting damage added — vehicle ${statusNotes.join(' and ')}`
          : 'Lasting damage added successfully'
      );

      setSelectedDamageId('');
      setSelectedHatredTargetId('');
      setSelectedHatredGangId('');
      setSelectedCapturingGangId('');
      setIsAddModalOpen(false);
      if (addFormOnly) onRequestClose?.();
    },
    onError: (error, variables, context) => {
      // Rollback optimistic update
      if (context?.previousDamages) {
        onDamageUpdate(context.previousDamages);
      }

      toast.error('Failed to add lasting damage');
    }
  });

  const removeDamageMutation = useMutation({
    // An N26 damage is a fighter effect, so deleting it goes through the injury
    // action — which also reverses a destroyed vehicle's killed status and rating.
    mutationFn: async (variables: { damageId: string; fighterId: string; gangId: string }) =>
      isFighterScoped
        ? await deleteFighterInjury({ fighter_id: variables.fighterId, injury_id: variables.damageId })
        : await removeVehicleDamage(variables),
    onMutate: async (variables) => {
      // Store previous state for rollback
      const previousDamages = [...damages];
      
      // Find the damage being removed for the toast message
      const damageToRemove = damages.find(d => d.id === variables.damageId);
      
      // Optimistically remove the damage
      const updatedDamages = damages.filter((d: FighterEffect) => d.id !== variables.damageId);
      onDamageUpdate(updatedDamages);

      return { previousDamages, damageName: damageToRemove?.effect_name || 'damage' };
    },
    onSuccess: (result, variables, context) => {
      if (!result.success) {
        throw new Error(result.error || 'Failed to remove vehicle damage');
      }

      // Invalidate related queries in the query client
      queryClient.invalidateQueries({ queryKey: ['fighter', variables.fighterId] });
      queryClient.invalidateQueries({ queryKey: ['gang', variables.gangId] });
      queryClient.invalidateQueries({ queryKey: ['vehicle', vehicleId] });

      toast.success(`${context?.damageName} removed successfully`);

      setDeleteModalData(null);
    },
    onError: (error, variables, context) => {
      // Rollback optimistic update
      if (context?.previousDamages) {
        onDamageUpdate(context.previousDamages);
      }

      toast.error('Failed to delete lasting damage');

      setDeleteModalData(null);
    }
  });

  const repairDamageMutation = useMutation({
    mutationFn: repairVehicleDamage,
    onMutate: async (variables) => {
      // Store previous state for rollback
      const previousDamages = [...damages];
      const previousCredits = gangCredits;

      // Remove exactly what was submitted. N23 repairs every damage at once, but
      // the N26 Chop Shop repairs only the ones selected and paid for.
      const repairedIds = new Set(variables.damageIds);
      onDamageUpdate(damages.filter((d: FighterEffect) => !repairedIds.has(d.id)));

      // Optimistically update gang credits
      if (onGangCreditsUpdate && gangCredits !== undefined) {
        onGangCreditsUpdate(gangCredits - variables.repairCost);
      }

      return { previousDamages, previousCredits };
    },
    onSuccess: (result, variables, context) => {
      if (!result.success) {
        throw new Error(result.error || 'Failed to repair vehicle damage');
      }

      toast.success(`Repaired ${variables.damageIds.length} damage(s) for ${variables.repairCost} credits`);

      // "Almost like new" leaving a Persistent Rattle is an N23 repair-roll rule;
      // the N26 Chop Shop leaves nothing behind and has no Persistent Rattle row.
      if (repairModel?.kind === 'roll' && variables.repairType === 'Almost like new') {
        try {
          const match = availableDamages.find((d: any) => d.effect_name === 'Persistent Rattle');
          const damageId = match?.id;
  
          // Call addDamageMutation with the ID directly
          if (damageId) {
            addDamageMutation.mutate({
              vehicleId: variables.vehicleId,
              fighterId,
              gangId,
              damageId: damageId,
              damageName: 'Persistent Rattle'
            });
          } else {
            console.warn('Persistent Rattle damage type not found in availableDamages');
          }
        } catch (error) {
          console.error('Error adding Persistent Rattle:', error);
        }
      }

      // Close repair modal
      setIsRepairModalOpen(false);
      setRepairCost(0);
      setRepairPercent(0);
      setSelectedRepairIds([]);
      setRepairType("Superficial Damage")
    },
    onError: (error, variables, context) => {
      // Rollback optimistic updates
      if (context?.previousDamages) {
        onDamageUpdate(context.previousDamages);
      }
      if (context?.previousCredits !== undefined && onGangCreditsUpdate) {
        onGangCreditsUpdate(context.previousCredits);
      }

      toast.error('Failed to repair lasting damage(s)');

      // Reset repair modal state
      setIsRepairing(null);
    }
  });

  // Helper to check for valid UUID
  function isValidUUID(id: string) {
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id);
  }

  // A single roll (N23 D6) renders as "3"; a band (N26 D66) as "31-46".
  const formatRange = (range: [number, number] | undefined): string => {
    if (!range) return '';
    const [min, max] = range;
    return min === max ? `${min}` : `${min}-${max}`;
  };

  const formatVehicleDamageRange = (damageName: string): string =>
    formatRange(resolveVehicleDamageRangeByNameFor(damageName, editionSlug));

  const formatVehicleRepairRange = (repairName: string): string =>
    formatRange(repairTypes.find((r) => r.effect_name === repairName)?.range);

  /** Lowest roll for a damage name, for sorting the catalog into table order. */
  const damageSortKey = (damageName: string): number =>
    resolveVehicleDamageRangeByNameFor(damageName, editionSlug)?.[0] ?? Number.MAX_SAFE_INTEGER;

  // Fetch available damages using TanStack Query - when add modal or repair modal is opened.
  // The edition is part of the key: effect_name is reused across editions, so one
  // shared cache entry would serve N23's damages to an N26 vehicle.
  const { data: availableDamages = [], isLoading: isLoadingDamages, error: damagesError } = useQuery({
    queryKey: ['vehicle-lasting-damages', editionSlug],
    queryFn: async () => {
      const query = editionSlug ? `?edition_slug=${encodeURIComponent(editionSlug)}` : '';
      const response = await fetch(`/api/vehicles/lasting-damage${query}`);
      if (!response.ok) {
        throw new Error('Failed to fetch lasting damage types');
      }
      return response.json();
    },
    enabled: isAddModalOpen || isRepairModalOpen, // Fetch when either modal is open
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,  // 10 minutes
  });

  const selectedDamage = availableDamages.find((d: any) => d.id === selectedDamageId);
  const selectedHatredTarget = requiredHatredTarget(selectedDamage?.type_specific_data);

  // Gang types are global, so an Eternal Enmity needs no campaign data at all.
  const selectedRequiresCaptured = selectedDamage?.type_specific_data?.captured === 'true';
  const needsCampaignGangPicker =
    isFighterScoped &&
    campaignIds.length > 0 &&
    (selectedRequiresCaptured ||
      selectedHatredTarget === 'gang' ||
      selectedHatredTarget === 'fighter');

  const [prevNeedsCampaignGangPicker, setPrevNeedsCampaignGangPicker] = useState(needsCampaignGangPicker);
  if (needsCampaignGangPicker !== prevNeedsCampaignGangPicker) {
    setPrevNeedsCampaignGangPicker(needsCampaignGangPicker);
    if (!needsCampaignGangPicker) {
      setCampaignGangs([]);
      setSelectedCapturingGangId('');
      setSelectedHatredTargetId('');
      setSelectedHatredGangId('');
    } else {
      setIsFetchingGangs(true);
    }
  }

  useEffect(() => {
    if (!needsCampaignGangPicker) return;

    let cancelled = false;

    const fetchGangs = async () => {
      try {
        const allGangs: CampaignGangWithFighters[] = [];
        const seenIds = new Set<string>();

        const gangResults = await Promise.all(
          campaignIds.map(async (campaignId) => {
            try {
              return await fetchCampaignGangsAndFighters({ campaignId, gangId });
            } catch {
              return [];
            }
          })
        );

        for (const gangs of gangResults) {
          for (const g of gangs) {
            // The helper passes gangId so the vehicle's own gang comes back too.
            if (g.gang_id !== gangId && !seenIds.has(g.gang_id)) {
              seenIds.add(g.gang_id);
              allGangs.push(g);
            }
          }
        }

        if (!cancelled) setCampaignGangs(allGangs);
      } catch (err) {
        console.error('Failed to fetch campaign gangs:', err);
      } finally {
        if (!cancelled) setIsFetchingGangs(false);
      }
    };

    fetchGangs();
    return () => { cancelled = true; };
  }, [needsCampaignGangPicker, campaignIds, gangId]);

  // Show error toast if damages failed to load
  useEffect(() => {
    if (damagesError) {
      toast.error('Failed to load lasting damage types');
    }
  }, [damagesError]);

  const handleOpenModal = useCallback(() => {
    setIsAddModalOpen(true);
  }, []);

  // When opened from gang card floating menu, open the Add modal instead of showing the list first
  const [prevInitialOpenAddModal, setPrevInitialOpenAddModal] = useState(false);
  if (initialOpenAddModal && !prevInitialOpenAddModal) {
    setPrevInitialOpenAddModal(true);
    setIsAddModalOpen(true);
  }

  const handleCloseModal = useCallback(() => {
    setIsAddModalOpen(false);
    setSelectedDamageId('');
  }, []);

  const handleAddDamage = async () => {
    if (!selectedDamageId) {
      toast.error("Please select a lasting damage");
      return false;
    }

    const damage = availableDamages.find((d: any) => d.id === selectedDamageId);
    const damageName = damage?.effect_name || 'Unknown damage';

    // N23 damages are inert catalog rows on the vehicle; only the fighter-scoped
    // path carries statuses and Hatred (X) targets.
    if (!isFighterScoped) {
      addDamageMutation.mutate({ vehicleId, fighterId, gangId, damageId: selectedDamageId, damageName });
      return true;
    }

    const typeSpecificData = damage?.type_specific_data && typeof damage.type_specific_data === 'object'
      ? damage.type_specific_data
      : {};

    const hatredKind = requiredHatredTarget(typeSpecificData);
    // A gang type is global; a gang or fighter target needs campaign opponents,
    // and skirmish play has none to name.
    const hatredSelectable = hatredKind === 'gang_type' || campaignGangs.length > 0;
    if (hatredKind && hatredSelectable && !selectedHatredTargetId) {
      toast.error(`Please select the target for ${damageName}`);
      return false;
    }

    addDamageMutation.mutate({
      vehicleId,
      fighterId,
      gangId,
      damageId: selectedDamageId,
      damageName,
      sendToRecovery: typeSpecificData.recovery === 'true' && !fighterRecovery,
      setKilled: hasKilledStatusFlag(typeSpecificData),
      setCaptured: typeSpecificData.captured === 'true',
      capturedByGangId: selectedCapturingGangId || null,
      hatredTargetId: hatredKind && selectedHatredTargetId ? selectedHatredTargetId : undefined
    });

    return true;
  };

  const handleDeleteDamage = async (damageId: string, damageName: string) => {
    if (!isValidUUID(damageId)) {
      toast.error('Cannot delete a damage that has not been saved to the server.');
      return false;
    }
    
    removeDamageMutation.mutate({
      damageId,
      fighterId,
      gangId
    });

    return true;
  };

  const handleRepairDamage = async () => {
    if (uniqueDamages.length === 0 || gangCredits === undefined) return false;

    // N23 repairs every damage at once; the N26 Chop Shop repairs the selection.
    const candidates = repairModel?.kind === 'per-damage'
      ? uniqueDamages.filter((d: FighterEffect) => selectedRepairIds.includes(d.id))
      : uniqueDamages;

    const damageIdsToRepair = candidates.map((d: FighterEffect) => d.id).filter(isValidUUID);
    if (damageIdsToRepair.length === 0) {
      toast.error(repairModel?.kind === 'per-damage'
        ? 'Select at least one Lasting Damage to repair.'
        : 'No valid damages to repair.');
      return false;
    }

    if (gangCredits < repairCost) {
      toast.error(`Not enough gang credits to repair these damages. Repair cost: ${repairCost}, Available credits: ${gangCredits}`);
      return false;
    }

    repairDamageMutation.mutate({
      damageIds: damageIdsToRepair,
      repairCost,
      // The Chop Shop negotiates no repair quality, so it sends none.
      repairType: repairModel?.kind === 'roll' ? repairType : undefined,
      vehicleId,
      fighterId,
      gangId
    });

    return true;
  };

  // Deduplicate damages by id before rendering to avoid React key warnings
  const uniqueDamages = Array.isArray(damages)
    ? damages.filter((d, idx, arr) => arr.findIndex(x => x.id === d.id) === idx)
    : damages;

  // N26 Chop Shop: a flat cost per selected damage, recomputed as the selection changes.
  const perDamageCost = repairModel?.kind === 'per-damage' ? repairModel.costPerDamage : 0;
  const [prevSelectedRepairCount, setPrevSelectedRepairCount] = useState(selectedRepairIds.length);
  if (repairModel?.kind === 'per-damage' && selectedRepairIds.length !== prevSelectedRepairCount) {
    setPrevSelectedRepairCount(selectedRepairIds.length);
    setRepairCost(selectedRepairIds.length * perDamageCost);
  }

  // N23: a percentage of vehicle cost + upgrades (excluding weapons)
  const [prevRepairModalOpen, setPrevRepairModalOpen] = useState(isRepairModalOpen);
  const [prevRepairPercent, setPrevRepairPercent] = useState(repairPercent);
  const [prevVehicle, setPrevVehicle] = useState(vehicle);
  if (repairModel?.kind === 'roll' &&
      (isRepairModalOpen !== prevRepairModalOpen || repairPercent !== prevRepairPercent || vehicle !== prevVehicle)) {
    setPrevRepairModalOpen(isRepairModalOpen);
    setPrevRepairPercent(repairPercent);
    setPrevVehicle(vehicle);
    if (isRepairModalOpen) {
      if (!vehicle) {
        setRepairCost(0);
      } else {
        const vehicleBaseCost = vehicle.cost || 0;
        const upgrades = (vehicle.equipment || []).filter((eq: any) => eq.equipment_type !== 'weapon');
        const upgradesCost = upgrades.reduce((sum: number, eq: any) => sum + (eq.purchase_cost || 0), 0);
        const total = vehicleBaseCost + upgradesCost;
        let cost = 0;
        if (repairPercent === 10) {
          cost = Math.ceil((total * 0.10) / 5) * 5;
        } else if (repairPercent === 25) {
          cost = Math.ceil((total * 0.25) / 5) * 5;
        }
        setRepairCost(cost);
      }
    }
  }

  const applyRolledDamage = (roll: number) => {
    const entry = resolveVehicleDamageFor(roll, editionSlug);
    if (!entry) return;
    const match = availableDamages.find((d: any) => d.effect_name === entry.name);
    if (!match) return;
    setSelectedDamageId(match.id);
    logResolvedDamageRollWithCooldown(match, roll);
    toast(`Roll ${roll}: ${match.effect_name}`);
  };

  // One add form, rendered both inline (addFormOnly, from the gang card) and inside
  // the Add modal — the roller, the picker and the target pickers must not drift.
  const addDamageForm = (
    <div className="space-y-4">
      <div>
        <DiceRoller
          items={availableDamages}
          ensureItems={undefined}
          getRange={(i: FighterEffect) => {
            const range = resolveVehicleDamageRangeByNameFor((i as any).effect_name, editionSlug);
            return range ? { min: range[0], max: range[1] } : null;
          }}
          getName={(i: FighterEffect) => (i as any).effect_name}
          inline
          rollFn={() => (damageDice === 'd66' ? rollD66Outcome() : rollNd6Outcome(1))}
          resolveNameForRoll={(roll) => resolveVehicleDamageFor(roll, editionSlug)?.name}
          buttonText={damageDice === 'd66' ? 'Roll D66' : 'Roll D6'}
          disabled={
            !userPermissions.canEdit ||
            !hasDamageTable ||
            logDamageRollMutation.isPending ||
            damageRollCooldown
          }
          onRolled={(rolled) => {
            if (rolled.length === 0) return;
            applyRolledDamage(rolled[0].roll);
          }}
          onRoll={applyRolledDamage}
        />
      </div>
      <div className="space-y-2 pt-3 border-t">
        <label htmlFor="damageSelect" className="text-sm font-medium">
          Lasting Damage
        </label>
        <Combobox
          value={selectedDamageId}
          onValueChange={(value) => setSelectedDamageId(value)}
          placeholder={isLoadingDamages && availableDamages.length === 0
            ? "Loading damages..."
            : "Select a Lasting Damage"
          }
          disabled={isLoadingDamages && availableDamages.length === 0}
          options={availableDamages
            .slice()
            .sort((a: any, b: any) => damageSortKey(a.effect_name) - damageSortKey(b.effect_name))
            .map((damage: any) => {
              const range = formatVehicleDamageRange(damage.effect_name);
              const displayText = range ? `${range} ${damage.effect_name}` : damage.effect_name;
              return {
                value: damage.id,
                label: range ? (
                  <>
                    <span className="text-gray-400 inline-block w-11 text-center mr-1">{range}</span>{damage.effect_name}
                  </>
                ) : damage.effect_name,
                displayValue: displayText
              };
            })}
        />
      </div>

      {/* Hatred (X) and Captured targets — fighter-scoped damages only */}
      {isFighterScoped && selectedHatredTarget && (
        <div className="space-y-2 pt-3 border-t">
          <InjuryHatredTargetPicker
            hatredTarget={selectedHatredTarget}
            candidateGangs={campaignGangs}
            isLoadingCandidates={isFetchingGangs}
            isSkirmish={campaignIds.length === 0}
            editionSlug={editionSlug}
            value={selectedHatredTargetId}
            onChange={setSelectedHatredTargetId}
            gangStepValue={selectedHatredGangId}
            onGangStepChange={setSelectedHatredGangId}
          />
        </div>
      )}

      {isFighterScoped && selectedRequiresCaptured && campaignGangs.length > 0 && (
        <div className="space-y-2 pt-3 border-t">
          <label className="text-sm font-medium">Captured by</label>
          <Combobox
            value={selectedCapturingGangId}
            onValueChange={setSelectedCapturingGangId}
            placeholder={isFetchingGangs ? "Loading gangs..." : "Select a Gang"}
            disabled={isFetchingGangs}
            options={campaignGangs
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(gang =>
                buildGangComboboxOption({
                  id: gang.gang_id,
                  name: gang.name,
                  gang_colour: gang.gang_colour,
                  owner_username: gang.owner_username
                })
              )}
          />
        </div>
      )}
    </div>
  );

  // When opened directly from gang card menu, render only the add form (no list, no inner modal)
  if (addFormOnly) {
    return (
      <div className="space-y-4">
        {addDamageForm}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onRequestClose} disabled={addDamageMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleAddDamage()}
            disabled={!selectedDamageId || addDamageMutation.isPending}
            className="bg-neutral-900 hover:bg-gray-800 text-white"
          >
            Add Lasting Damage
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Custom header with both Add and Repair buttons */}
      <div className="mt-6">
        <div className="flex flex-wrap justify-between items-center mb-2">
          <h2 className="text-xl md:text-2xl font-bold">Lasting Damage</h2>
          <div className="flex gap-2">
            <Button
              onClick={() => setIsRepairModalOpen(true)}
              className="bg-card hover:bg-muted text-foreground border border-border"
              disabled={uniqueDamages.length === 0 || !userPermissions.canEdit || !repairModel}
            >
              {repairModel?.kind === 'per-damage' ? 'Chop Shop' : 'Repair'}
            </Button>
            <Button
              onClick={handleOpenModal}
              className="bg-neutral-900 hover:bg-gray-800 text-white"
              disabled={!userPermissions.canEdit || !hasDamageTable}
            >
              Add
            </Button>
          </div>
        </div>

        {/* List component without header */}
        <div>
          <div className="overflow-x-auto">
            <table className="w-full table-auto">
              {(uniqueDamages.length > 0) && (
                <thead>
                  <tr className="bg-muted">
                    <th className="px-1 py-1 text-left" style={{ width: '75%' }}>Name</th>
                    <th className="px-1 py-1 text-right">Action</th>
                  </tr>
                </thead>
              )}
              <tbody>
                {uniqueDamages.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="text-muted-foreground italic text-center py-4">
                      No lasting damage yet.
                    </td>
                  </tr>
                ) : (
                  uniqueDamages
                    .sort((a, b) => {
                      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                      return dateA - dateB;
                    })
                    .map((damage) => (
                      <tr key={damage.id} className="border-t">
                        <td className="px-1 py-1">{damage.effect_name}</td>
                        <td className="px-1 py-1">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => setDeleteModalData({
                                id: damage.id,
                                name: damage.effect_name
                              })}
                              disabled={removeDamageMutation.isPending || !userPermissions.canEdit}
                              className="text-xs px-1.5 h-6"
                              title="Delete"
                            >
                              <LuTrash2 className="h-4 w-4" /> {/* Delete */}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isAddModalOpen && (
        <Modal
          title="Lasting Damage"
          content={addDamageForm}
          onClose={handleCloseModal}
          onConfirm={handleAddDamage}
          confirmText="Add Lasting Damage"
          confirmDisabled={!selectedDamageId || addDamageMutation.isPending}
        />
      )}

      {deleteModalData && (
        <Modal
          title="Delete Lasting Damage"
          content={
            <div>
              <p>Are you sure you want to delete <strong>{deleteModalData.name}</strong>?</p>
              <br />
              <p className="text-sm text-red-600">
                This action cannot be undone.
              </p>
            </div>
          }
          onClose={() => setDeleteModalData(null)}
          onConfirm={() => handleDeleteDamage(deleteModalData.id, deleteModalData.name)}
        />
      )}

      {isRepairModalOpen && (
        <Modal
          title={repairModel?.kind === 'per-damage' ? 'Visit Chop Shop' : 'Repair Damage'}
          headerContent={
            gangCredits !== undefined && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Gang Credits</span>
                <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm">
                  {gangCredits}
                </span>
              </div>
            )
          }
          content={
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  {repairModel?.kind === 'per-damage'
                    ? `Select the Lasting Damage to repair (${perDamageCost} credits each):`
                    : 'The following damages will be repaired:'}
                </label>
                <div className="overflow-x-auto mb-4">
                  <table className="w-full table-auto">
                    <tbody>
                      {uniqueDamages.map((damage: FighterEffect) => (
                        <tr key={damage.id} className="border-t">
                          {repairModel?.kind === 'per-damage' && (
                            <td className="w-8 px-1 py-1">
                              <Checkbox
                                id={`repair-${damage.id}`}
                                checked={selectedRepairIds.includes(damage.id)}
                                onCheckedChange={(checked) =>
                                  setSelectedRepairIds(prev =>
                                    checked
                                      ? [...prev, damage.id]
                                      : prev.filter(id => id !== damage.id)
                                  )
                                }
                              />
                            </td>
                          )}
                          <td className="px-1 py-1">
                            {repairModel?.kind === 'per-damage' ? (
                              <label htmlFor={`repair-${damage.id}`} className="cursor-pointer">
                                {damage.effect_name}
                              </label>
                            ) : (
                              damage.effect_name
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Repair type selection — N23 only; the Chop Shop has no roll */}
                {repairModel?.kind === 'roll' && (
                <div className="space-y-2 pt-3 border-t">
                  <label htmlFor="repairTypeSelect" className="text-sm font-medium">
                    Repair Type
                  </label>
                  <DiceRoller
                    items={repairTypes}
                    getRange={(i: { id: string; effect_name: string; range: [number, number] }) => {
                      const [min, max] = i.range;
                      return { min, max };
                    }}
                    getName={(i: { id: string; effect_name: string }) => i.effect_name}
                    rollFn={() => rollNd6Outcome(1)}
                    resolveNameForRoll={(roll) => {
                      return resolveVehicleRepairFromUtil(roll);
                    }}
                    buttonText="Roll D6"
                    inline
                    disabled={!userPermissions.canEdit}
                    onRolled={(rolled) => {
                      if (rolled.length === 0) return;
                      const roll = rolled[0].roll;
                      const name = resolveVehicleRepairFromUtil(roll);
                      if (name) {
                        const match = repairTypes.find((r) => r.effect_name === name);
                        if (match) {
                          setSelectedRepairTypeId(match.id);
                          setRepairType(name as RepairCondition);
                          if (name === 'Superficial Damage') {
                            setRepairPercent(10);
                          } else {
                            setRepairPercent(25);
                          }
                          toast(`Roll ${roll}: ${name}`);
                        }
                      }
                    }}
                    onRoll={(roll) => {
                      const name = resolveVehicleRepairFromUtil(roll);
                      if (name) {
                        const match = repairTypes.find((r) => r.effect_name === name);
                        if (match) {
                          setSelectedRepairTypeId(match.id);
                          setRepairType(name as RepairCondition);
                          if (name === 'Superficial Damage') {
                            setRepairPercent(10);
                          } else {
                            setRepairPercent(25);
                          }
                          toast(`Roll ${roll}: ${name}`);
                        }
                      }
                    }}
                  />
                  <Combobox
                    value={selectedRepairTypeId}
                    onValueChange={(value) => {
                      setSelectedRepairTypeId(value);
                      const selectedRepair = repairTypes.find((r) => r.id === value);
                      if (selectedRepair) {
                        const selectedType = selectedRepair.effect_name as RepairCondition;
                        setRepairType(selectedType);
                        if (selectedType === 'Superficial Damage') {
                          setRepairPercent(10);
                        } else {
                          setRepairPercent(25);
                        }
                      }
                    }}
                    placeholder="Select a Repair Type"
                    options={repairTypes
                      .slice()
                      .sort((a, b) => {
                        // Sort by range minimum value
                        const minA = a.range[0];
                        const minB = b.range[0];
                        return minA - minB;
                      })
                      .map((repair) => {
                        const range = formatVehicleRepairRange(repair.effect_name);
                        const displayText = range ? `${range} ${repair.effect_name}` : repair.effect_name;
                        return {
                          value: repair.id,
                          label: range ? (
                            <>
                              <span className="text-gray-400 inline-block w-11 text-center mr-1">{range}</span>{repair.effect_name}
                            </>
                          ) : repair.effect_name,
                          displayValue: displayText
                        };
                      })}
                  />
                </div>
                )}
                {/* Calculate vehicle cost + upgrades (excluding weapons) */}
                <div className="mt-4">
                  <div className="flex items-center gap-2">
                    <label htmlFor="repairTotalCost" className="block text-sm font-medium text-muted-foreground">
                      Total Cost
                    </label>
                    <input
                      id="repairTotalCost"
                      type="number"
                      min="0"
                      value={repairCost}
                      onChange={e => setRepairCost(Number(e.target.value))}
                      className="w-24 p-2 border rounded-sm focus:ring-2 focus:ring-black focus:border-black text-base"
                    />
                  </div>
                  {repairModel?.kind === 'per-damage' && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {selectedRepairIds.length} selected at {perDamageCost} credits each. Repeated
                      Lasting Damage must be selected — and paid for — separately.
                    </p>
                  )}
                  {repairModel?.kind === 'roll' && selectedRepairTypeId && (
                    <p className={`mt-2 text-xs ${repairType === 'Almost like new' ? 'text-amber-700' : ''}`}>
                      {repairType === 'Almost like new'
                        ? 'All Lasting Damage will be replaced with a Persistent Rattle.'
                        : 'All Lasting Damage will be repaired.'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          }
          onClose={() => {
            setIsRepairModalOpen(false);
            setSelectedRepairTypeId('');
            setRepairCost(0);
            setRepairPercent(0);
            setSelectedRepairIds([]);
            setRepairType("Superficial Damage");
          }}
          onConfirm={handleRepairDamage}
          confirmText={repairModel?.kind === 'per-damage' ? 'Pay & Repair' : 'Repair'}
          confirmDisabled={
            uniqueDamages.length === 0 ||
            repairDamageMutation.isPending ||
            (repairModel?.kind === 'per-damage' && selectedRepairIds.length === 0)
          }
        />
      )}
    </>
  );
} 