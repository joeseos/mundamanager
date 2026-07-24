'use client';

import { useState, useCallback, useMemo } from 'react';
import { FighterProps } from "@/types/fighter";
import { FighterType } from "@/types/fighter-type";
import Gang from "@/components/gang/gang";
import Tabs from "@/components/tabs";
import GangInventory from "@/components/gang/stash-tab";
import { GangNotes } from "@/components/gang/notes-tab";
import GangTerritories from "@/components/gang/campaign-tab";
import GangVehicles from "@/components/gang/vehicles-tab";
import { StashItem, DefaultImageEntry } from '@/types/gang';
import { VehicleProps } from '@/types/vehicle';
import { UserPermissions } from '@/types/user-permissions';
import { FaUsers, FaBox, FaTruckMoving } from 'react-icons/fa';
import { PiFlagBannerFoldBold } from 'react-icons/pi';
import { LuClipboard, LuSwords } from 'react-icons/lu';
import GangBattleSessions from "@/components/gang/battle-sessions-tab";
import type { BattleSession } from "@/types/battle-session";
import { FighterCardModalsProvider } from "@/components/gang/fighter-card-modals-context";
import { FighterXpModal } from "@/components/fighter/fighter-xp-modal";
import { InjuriesList } from "@/components/fighter/fighter-injury-list";
import { VehicleDamagesList } from "@/components/fighter/vehicle-lasting-damages";
import Modal from "@/components/ui/modal";
import { editFighterStatus } from "@/app/actions/edit-fighter";
import { toast } from 'sonner';
import type { FighterEffect } from '@/types/fighter';
import { hasKilledStatusFlag, countsTowardRating } from '@/utils/fighter-status';

interface GangPageContentProps {
  initialGangData: any; // We'll type this properly based on the processed data structure
  gangId: string;
  userId: string;
  userPermissions: UserPermissions;
}

interface GangDataState {
  processedData: {
    id: string;
    name: string;
    gang_type_id?: string | null;
    custom_gang_type_id?: string | null;
    gang_type: string;
    gang_type_image_url: string;
    image_url?: string;
    default_gang_image?: number | null;
    gang_type_default_image_urls?: DefaultImageEntry[];
    gang_colour: string;
    credits: number;
    reputation: number;
    rating: number;
    wealth: number;
    alignment: string;
    alliance_id: string;
    alliance_name: string;
    gang_affiliation_id: string | null;
    gang_affiliation_name: string;
    gang_type_has_affiliation: boolean;
    created_at: string;
    last_updated: string;
    user_id: string;
    fighters: FighterProps[];
    fighterTypes: FighterType[];
    stash: StashItem[];
    vehicles: VehicleProps[];
    note?: string;
    note_backstory?: string;
    note_private?: string;
    note_private_updated_at?: string;
    positioning: Record<number, string>;
    campaigns: any[];
    gang_variants: Array<{id: string, variant: string}>;
    username?: string;
    patreon_tier_id?: string;
    patreon_tier_title?: string;
    patron_status?: string;
    hidden: boolean;
    battleSessions?: BattleSession[];
  };
  stash: StashItem[];
}

export default function GangPageContent({ 
  initialGangData,
  gangId,
  userPermissions
}: GangPageContentProps) {
  const [gangData, setGangData] = useState<GangDataState>({
    processedData: initialGangData,
    stash: initialGangData.stash || []
  });

  // Move all the callback handlers here from the current page.tsx
  const handleStashUpdate = useCallback((newStash: StashItem[]) => {
    setGangData((prev: GangDataState) => ({
      ...prev,
      processedData: {
        ...prev.processedData,
        stash: newStash
      },
      stash: newStash
    }));
  }, []);

  const handleVehicleUpdate = useCallback((newVehicles: VehicleProps[]) => {
    setGangData((prev: GangDataState) => ({
      ...prev,
      processedData: {
        ...prev.processedData,
        vehicles: newVehicles
      }
    }));
  }, []);

  const handleGangCreditsUpdate = useCallback((newCredits: number) => {
    setGangData((prev: GangDataState) => ({
      ...prev,
      processedData: {
        ...prev.processedData,
        credits: newCredits
      }
    }));
  }, []);

  const handleGangRatingUpdate = useCallback((newRating: number) => {
    setGangData((prev: GangDataState) => ({
      ...prev,
      processedData: {
        ...prev.processedData,
        rating: newRating
      }
    }));
  }, []);

  const handleGangWealthUpdate = useCallback((newWealth: number) => {
    setGangData((prev: GangDataState) => ({
      ...prev,
      processedData: {
        ...prev.processedData,
        wealth: newWealth
      }
    }));
  }, []);

  const handleFighterUpdate = useCallback((updatedFighter: FighterProps, skipRatingUpdate?: boolean) => {
    setGangData((prev: GangDataState) => {
      // If server provided updated rating, use that instead of calculating
      if (skipRatingUpdate) {
        const existingFighter = prev.processedData.fighters.find(f => f.id === updatedFighter.id);
        
        return {
          ...prev,
          processedData: {
            ...prev.processedData,
            fighters: existingFighter 
              ? prev.processedData.fighters.map(fighter =>
                  fighter.id === updatedFighter.id ? updatedFighter : fighter
                )
              : [...prev.processedData.fighters, updatedFighter], // Add new fighter if it doesn't exist
            // Don't modify rating when skipRatingUpdate is true
          }
        };
      }

      // Find the previous version of this fighter to compare
      const prevFighter = prev.processedData.fighters.find(f => f.id === updatedFighter.id);
      
      // If fighter doesn't exist, add it as a new fighter
      if (!prevFighter) {
        return {
          ...prev,
          processedData: {
            ...prev.processedData,
            fighters: [...prev.processedData.fighters, updatedFighter],
            // Don't modify rating for new exotic beasts (they have 0 cost)
          }
        };
      }
      
      // Calculate rating change from vehicle updates
      let ratingChange = 0;
      let nextFighter: FighterProps = { ...updatedFighter };
      let vehicleChanged = false;
      
      // If fighter now has a vehicle that it didn't have before
      if (nextFighter.vehicles?.length && (!prevFighter?.vehicles || prevFighter.vehicles.length === 0)) {
        // Only active fighters contribute to gang rating
        const vehicleCost = (nextFighter.vehicles[0] as unknown as VehicleProps).cost || 0;
        if (countsTowardRating(nextFighter)) {
          ratingChange += vehicleCost;
        }
        // Sync fighter credits
        nextFighter.credits = (prevFighter.credits || 0) + vehicleCost;
        vehicleChanged = true;
      } 
      // If fighter had a vehicle but no longer does
      else if ((!nextFighter.vehicles || nextFighter.vehicles.length === 0) && prevFighter?.vehicles?.length) {
        // Subtract the vehicle's cost from the rating
        const vehicleCost = (prevFighter.vehicles[0] as unknown as VehicleProps).cost || 0;
        ratingChange -= vehicleCost;
        // Sync fighter credits
        nextFighter.credits = (prevFighter.credits || 0) - vehicleCost;
        vehicleChanged = true;
      }
      // If fighter had a vehicle and still has one, but it's different
      else if (nextFighter.vehicles?.length && prevFighter?.vehicles?.length && 
               nextFighter.vehicles[0].id !== prevFighter.vehicles[0].id) {
        // Remove old vehicle cost and add new vehicle cost
        const prevVehicleCost = (prevFighter.vehicles[0] as unknown as VehicleProps).cost || 0;
        const newVehicleCost = (nextFighter.vehicles[0] as unknown as VehicleProps).cost || 0;
        ratingChange -= prevVehicleCost;
        ratingChange += newVehicleCost;
        // Sync fighter credits
        nextFighter.credits = (prevFighter.credits || 0) - prevVehicleCost + newVehicleCost;
        vehicleChanged = true;
      }

      // Calculate rating change from credit changes (when equipment is moved from stash)
      if (!vehicleChanged && prevFighter && nextFighter.credits !== prevFighter.credits) {
        const creditChange = nextFighter.credits - prevFighter.credits;
        ratingChange += creditChange;
      }

      // Calculate the new rating
      const newRating = prev.processedData.rating + ratingChange;

      return {
        ...prev,
        processedData: {
          ...prev.processedData,
          fighters: prev.processedData.fighters.map(fighter =>
            fighter.id === nextFighter.id ? nextFighter : fighter
          ),
          // Update the rating based on vehicle and credit changes
          rating: newRating
        }
      };
    });
  }, []);

  const handleFighterAdd = useCallback((newFighter: FighterProps, cost: number) => {
    setGangData((prev: GangDataState) => {
      // Add the new fighter to the fighters array
      const updatedFighters = [...prev.processedData.fighters, newFighter];

      // Update gang credits by subtracting the cost
      const updatedCredits = prev.processedData.credits - cost;

      // Update gang rating by adding the fighter's cost
      const updatedRating = prev.processedData.rating + newFighter.credits;

      // Update gang wealth: rating increases by newFighter.credits, credits decrease by cost
      const updatedWealth = prev.processedData.wealth + newFighter.credits - cost;

      // Update positioning to include the new fighter
      const currentPositioning = prev.processedData.positioning;
      const maxPosition = Object.keys(currentPositioning).length > 0
        ? Math.max(...Object.keys(currentPositioning).map(Number))
        : -1;
      const newPosition = maxPosition + 1;
      const updatedPositioning = {
        ...currentPositioning,
        [newPosition]: newFighter.id
      };

      return {
        ...prev,
        processedData: {
          ...prev.processedData,
          fighters: updatedFighters,
          credits: updatedCredits,
          rating: updatedRating,
          wealth: updatedWealth,
          positioning: updatedPositioning
        }
      };
    });
  }, []);

  // Rollback handler for optimistic updates - removes temp fighter and restores credits/rating/wealth
  const handleFighterRollback = useCallback((tempFighterId: string, cost: number, ratingCost: number) => {
    setGangData((prev: GangDataState) => {
      // Remove the temp fighter from the fighters array
      const updatedFighters = prev.processedData.fighters.filter(f => f.id !== tempFighterId);

      // Restore gang credits by adding back the cost
      const updatedCredits = prev.processedData.credits + cost;

      // Restore gang rating by subtracting the fighter's rating cost
      const updatedRating = prev.processedData.rating - ratingCost;

      // Restore gang wealth: undo the rating increase and credits decrease
      const updatedWealth = prev.processedData.wealth - ratingCost + cost;

      // Remove from positioning - find and remove the entry with this fighter ID
      const updatedPositioning = { ...prev.processedData.positioning };
      for (const [position, fighterId] of Object.entries(updatedPositioning)) {
        if (fighterId === tempFighterId) {
          delete updatedPositioning[Number(position)];
          break;
        }
      }

      return {
        ...prev,
        processedData: {
          ...prev.processedData,
          fighters: updatedFighters,
          credits: updatedCredits,
          rating: updatedRating,
          wealth: updatedWealth,
          positioning: updatedPositioning
        }
      };
    });
  }, []);

  // Reconcile handler for optimistic updates - replaces temp fighter with real one
  const handleFighterReconcile = useCallback((tempFighterId: string, realFighter: FighterProps) => {
    setGangData((prev: GangDataState) => {
      // Replace the temp fighter with the real one
      const updatedFighters = prev.processedData.fighters.map(f =>
        f.id === tempFighterId ? realFighter : f
      );

      // Update positioning - replace temp ID with real ID
      const updatedPositioning = { ...prev.processedData.positioning };
      for (const [position, fighterId] of Object.entries(updatedPositioning)) {
        if (fighterId === tempFighterId) {
          updatedPositioning[Number(position)] = realFighter.id;
          break;
        }
      }

      return {
        ...prev,
        processedData: {
          ...prev.processedData,
          fighters: updatedFighters,
          positioning: updatedPositioning
        }
      };
    });
  }, []);

  const handleVehicleAdd = useCallback((newVehicle: VehicleProps) => {
    setGangData((prev: GangDataState) => {
      // Keep only unassigned vehicles and dedupe by id when adding
      const combined = [...(prev.processedData.vehicles || []), newVehicle];
      const unassignedOnly = combined.filter((v: any) => !v.assigned_to && !v.fighter_id);
      const deduped = Array.from(new Map(unassignedOnly.map(v => [v.id, v])).values());

      return {
        ...prev,
        processedData: {
          ...prev.processedData,
          vehicles: deduped
          // Do not adjust credits here; AddVehicle now calls onGangCreditsUpdate with server credits
        }
      };
    });
  }, []);

  const handleNoteUpdate = useCallback((updatedNote: string) => {
    setGangData((prev: GangDataState) => ({
      ...prev,
      processedData: {
        ...prev.processedData,
        note: updatedNote
      }
    }));
  }, []);

  const handleNoteBackstoryUpdate = useCallback((updatedNoteBackstory: string) => {
    setGangData((prev: GangDataState) => ({
      ...prev,
      processedData: {
        ...prev.processedData,
        note_backstory: updatedNoteBackstory
      }
    }));
  }, []);

  const handleNotePrivateUpdate = useCallback((updatedNotePrivate: string, updatedAt?: string) => {
    setGangData((prev: GangDataState) => ({
      ...prev,
      processedData: {
        ...prev.processedData,
        note_private: updatedNotePrivate,
        note_private_updated_at: updatedAt ?? prev.processedData.note_private_updated_at,
      }
    }));
  }, []);

  const [xpModalFighter, setXpModalFighter] = useState<FighterProps | null>(null);
  const [injuryModalFighter, setInjuryModalFighter] = useState<FighterProps | null>(null);
  const [injuryModalOpenAddOnMount, setInjuryModalOpenAddOnMount] = useState(false);
  const [vehicleModalFighter, setVehicleModalFighter] = useState<FighterProps | null>(null);
  const [vehicleModalOpenAddOnMount, setVehicleModalOpenAddOnMount] = useState(false);
  const [rescueModalFighter, setRescueModalFighter] = useState<FighterProps | null>(null);
  const [resurrectModalFighter, setResurrectModalFighter] = useState<FighterProps | null>(null);
  const [isResurrectSubmitting, setIsResurrectSubmitting] = useState(false);
  const [openActionMenuFighterId, setOpenActionMenuFighterId] = useState<string | null>(null);

  const removeKilledStatusEffect = (effect: FighterEffect) => {
    const typeSpecificData = effect.type_specific_data && typeof effect.type_specific_data === 'object'
      ? effect.type_specific_data
      : {};

    return !hasKilledStatusFlag(typeSpecificData);
  };

  const openXpModal = useCallback((fighterId: string) => {
    const fighter = gangData.processedData.fighters.find(f => f.id === fighterId) || null;
    setXpModalFighter(fighter);
  }, [gangData.processedData.fighters]);

  const openInjuryModal = useCallback((fighterId: string, options?: { openAddModal?: boolean }) => {
    const fighter = gangData.processedData.fighters.find(f => f.id === fighterId) || null;
    setInjuryModalFighter(fighter);
    setInjuryModalOpenAddOnMount(options?.openAddModal ?? false);
  }, [gangData.processedData.fighters]);

  const openVehicleDamageModal = useCallback((fighterId: string, options?: { openAddModal?: boolean }) => {
    const fighter = gangData.processedData.fighters.find(f => f.id === fighterId) || null;
    // Only set if fighter has a vehicle
    if (fighter && fighter.vehicles && fighter.vehicles.length > 0) {
      setVehicleModalFighter(fighter);
      setVehicleModalOpenAddOnMount(options?.openAddModal ?? false);
    }
  }, [gangData.processedData.fighters]);

  const rescueFighter = useCallback((fighterId: string) => {
    const fighter = gangData.processedData.fighters.find(f => f.id === fighterId);
    if (!fighter?.captured) return;

    if (!userPermissions.canEdit) {
      toast.error('You do not have permission to edit this fighter');
      return;
    }

    setRescueModalFighter(fighter);
  }, [gangData.processedData.fighters, userPermissions.canEdit]);

  const resurrectFighter = useCallback((fighterId: string) => {
    const fighter = gangData.processedData.fighters.find(f => f.id === fighterId);
    if (!fighter?.killed) return;

    if (!userPermissions.canEdit) {
      toast.error('You do not have permission to edit this fighter');
      return;
    }

    setResurrectModalFighter(fighter);
  }, [gangData.processedData.fighters, userPermissions.canEdit]);

  const confirmRescueFighter = useCallback(async () => {
    const fighter = rescueModalFighter;
    if (!fighter?.captured) return true;

    const fighterId = fighter.id;
    setRescueModalFighter(null);

    setGangData(prev => ({
      ...prev,
      processedData: {
        ...prev.processedData,
        fighters: prev.processedData.fighters.map(f =>
          f.id === fighterId
            ? {
                ...f,
                captured: false,
                captured_by_gang_id: null,
                effects: {
                  ...f.effects,
                  injuries: (f.effects?.injuries || []).filter(injury => injury.effect_name !== 'Captured'),
                },
              }
            : f
        ),
      },
    }));

    const result = await editFighterStatus({
      fighter_id: fighterId,
      action: 'rescue',
    });

    if (!result.success) {
      setGangData(prev => ({
        ...prev,
        processedData: {
          ...prev.processedData,
          fighters: prev.processedData.fighters.map(f =>
            f.id === fighterId ? fighter : f
          ),
        },
      }));
      toast.error(result.error || 'Failed to rescue fighter');
      return false;
    }

    toast.success('Fighter has been rescued from captivity');
    return true;
  }, [rescueModalFighter]);

  const confirmResurrectFighter = useCallback(async () => {
    if (isResurrectSubmitting) return false;
    const fighter = resurrectModalFighter;
    if (!fighter?.killed) return true;

    const fighterId = fighter.id;
    setIsResurrectSubmitting(true);

    try {
      setGangData(prev => ({
        ...prev,
        processedData: {
          ...prev.processedData,
          fighters: prev.processedData.fighters.map(f =>
            f.id === fighterId
              ? {
                  ...f,
                  killed: false,
                  effects: {
                    ...f.effects,
                    injuries: (f.effects?.injuries || []).filter(removeKilledStatusEffect),
                    'rig-glitches': (f.effects?.['rig-glitches'] || []).filter(removeKilledStatusEffect),
                  },
                }
              : f
          ),
        },
      }));

      const result = await editFighterStatus({
        fighter_id: fighterId,
        action: 'kill',
      });

      if (!result.success) {
        setGangData(prev => ({
          ...prev,
          processedData: {
            ...prev.processedData,
            fighters: prev.processedData.fighters.map(f =>
              f.id === fighterId ? fighter : f
            ),
          },
        }));
        toast.error(result.error || 'Failed to resurrect fighter');
        return false;
      }

      if (result.data?.gang) {
        setGangData(prev => ({
          ...prev,
          processedData: {
            ...prev.processedData,
            credits: result.data?.gang?.credits ?? prev.processedData.credits,
            rating: result.data?.gang?.rating ?? prev.processedData.rating,
            wealth: result.data?.gang?.wealth ?? prev.processedData.wealth,
          },
        }));
      }

      toast.success('Fighter has been resurrected');
      return true;
    } finally {
      setIsResurrectSubmitting(false);
    }
  }, [isResurrectSubmitting, resurrectModalFighter]);

  const fighterCardModalsValue = useMemo(
    () => ({
      openXpModal,
      openInjuryModal,
      openVehicleDamageModal,
      rescueFighter,
      resurrectFighter,
      openActionMenuFighterId,
      setOpenActionMenuFighterId,
    }),
    [openXpModal, openInjuryModal, openVehicleDamageModal, rescueFighter, resurrectFighter, openActionMenuFighterId, setOpenActionMenuFighterId]
  );

  const gangCampaigns = gangData.processedData.campaigns || [];
  const gangCampaignProps = gangCampaigns.length > 0 ? {
    campaignTradingPostIds: gangCampaigns.find((c: any) => c.trading_posts !== undefined)?.trading_posts || [],
    campaignTradingPostNames: gangCampaigns.find((c: any) => c.trading_posts !== undefined)?.trading_post_names || [],
    campaignCustomTradingPostIds: gangCampaigns.find((c: any) => c.custom_trading_posts !== undefined)?.custom_trading_posts || [],
    campaignCustomTradingPostNames: gangCampaigns.find((c: any) => c.custom_trading_posts !== undefined)?.custom_trading_post_names || [],
    campaignGangId: gangCampaigns[0]?.campaign_gang_id as string | undefined,
    gangCampaignResources: gangCampaigns[0]?.resources,
  } : {};

  return (
    <FighterCardModalsProvider value={fighterCardModalsValue}>
      {/* Fighter card context modals */}
      {xpModalFighter && (
        <FighterXpModal
          isOpen={true}
          fighterId={xpModalFighter.id}
          currentXp={xpModalFighter.xp ?? 0}
          currentTotalXp={xpModalFighter.xp ?? 0}
          currentKills={xpModalFighter.kills ?? 0}
          currentKillCount={xpModalFighter.kill_count ?? 0}
          is_spyrer={xpModalFighter.is_spyrer}
          helperFighterName={xpModalFighter.fighter_name}
          gangId={gangId}
          campaignId={gangCampaigns[0]?.campaign_id}
          onClose={() => setXpModalFighter(null)}
          onXpUpdated={(newXp, _newTotalXp, newKills, newKillCount) => {
            setGangData(prev => ({
              ...prev,
              processedData: {
                ...prev.processedData,
                fighters: prev.processedData.fighters.map(f =>
                  f.id === xpModalFighter.id
                    ? {
                        ...f,
                        xp: newXp,
                        kills: newKills,
                        kill_count: newKillCount,
                      }
                    : f
                ),
              },
            }));
          }}
        />
      )}

      {rescueModalFighter && (
        <Modal
          title="Rescue Fighter"
          content={
            <p>
              Rescue <strong>{rescueModalFighter.fighter_name}</strong> from captivity?
            </p>
          }
          onClose={() => setRescueModalFighter(null)}
          onConfirm={confirmRescueFighter}
          confirmText="Rescue Fighter"
        />
      )}

      {resurrectModalFighter && (
        <Modal
          title="Resurrect Fighter"
          content={
            <p>
              Resurrect <strong>{resurrectModalFighter.fighter_name}</strong>?
            </p>
          }
          onClose={() => setResurrectModalFighter(null)}
          onConfirm={confirmResurrectFighter}
          confirmText="Resurrect Fighter"
          confirmDisabled={isResurrectSubmitting}
        />
      )}

      {injuryModalFighter && (() => {
        // Use latest fighter from gangData so the list reflects optimistic updates (e.g. after adding an injury)
        const currentFighter = gangData.processedData.fighters.find(f => f.id === injuryModalFighter.id) ?? injuryModalFighter;
        const injuryModalTitle = injuryModalOpenAddOnMount
          ? (currentFighter.is_spyrer ? "Add Rig Glitches" : "Add Lasting Injuries")
          : (currentFighter.is_spyrer ? "Rig Glitches" : "Lasting Injuries");
        const fighterCampaigns = (currentFighter.campaigns ?? gangData.processedData.campaigns ?? [])
          .map((campaign: { campaign_id?: string; id?: string }) => ({
            campaign_id: campaign.campaign_id ?? campaign.id,
          }))
          .filter((campaign: { campaign_id?: string }) => Boolean(campaign.campaign_id));
        return (
          <Modal
            title={injuryModalTitle}
            helper={currentFighter.fighter_name}
            onClose={() => {
              setInjuryModalFighter(null);
              setInjuryModalOpenAddOnMount(false);
            }}
            width="md"
          >
            <InjuriesList
              initialOpenAddModal={injuryModalOpenAddOnMount}
              addFormOnly={injuryModalOpenAddOnMount}
              onRequestClose={() => {
                setInjuryModalFighter(null);
                setInjuryModalOpenAddOnMount(false);
              }}
              injuries={[
                ...(currentFighter.effects?.injuries || []),
                ...(currentFighter.effects?.['rig-glitches'] || []),
              ]}
              fighterId={currentFighter.id}
              fighterGangId={gangId}
              fighterCampaigns={fighterCampaigns}
              fighterRecovery={currentFighter.recovery}
              fighterKilled={currentFighter.killed}
              fighterCaptured={currentFighter.captured}
              fighterCapturedByGangId={currentFighter.captured_by_gang_id ?? null}
              userPermissions={userPermissions}
              fighter_class={currentFighter.fighter_class}
              is_spyrer={currentFighter.is_spyrer}
              kill_count={currentFighter.kill_count ?? 0}
              skills={currentFighter.skills || {}}
              fighterWeapons={currentFighter.weapons?.map(w => ({
                id: w.fighter_weapon_id,
                name: w.weapon_name,
                equipment_category: w.equipment_category,
                effect_names: w.effect_names,
              }))}
              onEquipmentEffectUpdate={() => {
                // Equipment-based weapon profile adjustments are handled on the fighter page;
                // for the gang view we rely on server reconciliation.
              }}
              onInjuryUpdate={(updatedInjuries, recoveryStatus, capturedStatus, capturedByGangId, killedStatus) => {
                setGangData(prev => ({
                  ...prev,
                  processedData: {
                    ...prev.processedData,
                    fighters: prev.processedData.fighters.map(f => {
                      if (f.id !== currentFighter.id) return f;

                      const isSpyrer = f.is_spyrer;
                      return {
                        ...f,
                        recovery:
                          recoveryStatus !== undefined ? recoveryStatus : f.recovery,
                        killed:
                          killedStatus !== undefined ? killedStatus : f.killed,
                        captured:
                          capturedStatus !== undefined ? capturedStatus : f.captured,
                        captured_by_gang_id:
                          capturedByGangId !== undefined ? capturedByGangId : f.captured_by_gang_id,
                        effects: {
                          ...f.effects,
                          injuries: isSpyrer ? [] : updatedInjuries,
                          'rig-glitches': isSpyrer
                            ? updatedInjuries
                            : (f.effects?.['rig-glitches'] || []),
                        },
                      };
                    }),
                  },
                }));
              }}
              onSkillsUpdate={(updatedSkills) => {
                setGangData(prev => ({
                  ...prev,
                  processedData: {
                    ...prev.processedData,
                    fighters: prev.processedData.fighters.map(f =>
                      f.id === currentFighter.id ? { ...f, skills: updatedSkills } : f
                    ),
                  },
                }));
              }}
              onKillCountUpdate={(newKillCount) => {
                setGangData(prev => ({
                  ...prev,
                  processedData: {
                    ...prev.processedData,
                    fighters: prev.processedData.fighters.map(f =>
                      f.id === currentFighter.id
                        ? { ...f, kill_count: newKillCount }
                        : f
                    ),
                  },
                }));
              }}
              onGangFinancialsUpdate={(financials) => {
                setGangData(prev => ({
                  ...prev,
                  processedData: {
                    ...prev.processedData,
                    credits: financials.credits,
                    rating: financials.rating,
                    wealth: financials.wealth,
                  },
                }));
              }}
            />
          </Modal>
        );
      })()}

      {vehicleModalFighter && vehicleModalFighter.vehicles && vehicleModalFighter.vehicles[0] && (() => {
        // Use latest fighter/vehicle from gangData so the list reflects optimistic updates
        const currentFighter = gangData.processedData.fighters.find(f => f.id === vehicleModalFighter.id) ?? vehicleModalFighter;
        const currentVehicle = currentFighter.vehicles?.[0];
        if (!currentVehicle) return null;
        const vehicleDamageModalTitle = vehicleModalOpenAddOnMount ? "Add Lasting Damage" : "Vehicle Lasting Damage";
        return (
          <Modal
            title={vehicleDamageModalTitle}
            helper={currentFighter.fighter_name}
            onClose={() => {
              setVehicleModalFighter(null);
              setVehicleModalOpenAddOnMount(false);
            }}
            width="md"
          >
            <VehicleDamagesList
              initialOpenAddModal={vehicleModalOpenAddOnMount}
              addFormOnly={vehicleModalOpenAddOnMount}
              onRequestClose={() => {
                setVehicleModalFighter(null);
                setVehicleModalOpenAddOnMount(false);
              }}
              damages={
                currentVehicle.effects
                  ? currentVehicle.effects["lasting damages"] || []
                  : []
              }
              onDamageUpdate={(updatedDamages) => {
                setGangData(prev => ({
                  ...prev,
                  processedData: {
                    ...prev.processedData,
                    fighters: prev.processedData.fighters.map(f => {
                      if (f.id !== currentFighter.id) return f;

                      if (!f.vehicles || f.vehicles.length === 0) return f;
                      const [firstVehicle, ...restVehicles] = f.vehicles;

                      return {
                        ...f,
                        vehicles: [
                          {
                            ...firstVehicle,
                            effects: {
                              ...(firstVehicle.effects || {}),
                              "lasting damages": updatedDamages,
                            },
                          },
                          ...restVehicles,
                        ],
                      };
                    }),
                  },
                }));
              }}
              fighterId={currentFighter.id}
              vehicleId={currentVehicle.id}
              gangId={gangId}
              vehicle={currentVehicle}
              gangCredits={gangData.processedData.credits}
              onGangCreditsUpdate={handleGangCreditsUpdate}
              userPermissions={userPermissions}
            />
          </Modal>
        );
      })()}

      <div>
      <Tabs tabTitles={['Gang', 'Stash', 'Vehicles', 'Campaign', 'Notes', 'Battles']}
         tabIcons={[
           <FaUsers key="users" />,
           <FaBox key="box" />,
           <FaTruckMoving key="car" />,
           <PiFlagBannerFoldBold key="map" />,
           <LuClipboard key="note" />,
           <LuSwords key="swords" />
         ]}
        >
        <div className="container max-w-full w-full space-y-4 print:print-fighters">
          <Gang
            {...gangData.processedData}
            initialFighters={gangData.processedData.fighters}
            stash={gangData.stash}
            onVehicleAdd={handleVehicleAdd}
            onFighterAdd={handleFighterAdd}
            onFighterRollback={handleFighterRollback}
            onFighterReconcile={handleFighterReconcile}
            onFighterUpdate={handleFighterUpdate}
            onGangCreditsUpdate={handleGangCreditsUpdate}
            onGangWealthUpdate={handleGangWealthUpdate}
            gang_variants={gangData.processedData.gang_variants}
            vehicles={gangData.processedData.vehicles || []}
            userPermissions={userPermissions}
          />
        </div>
        <GangInventory
          stash={gangData.stash}
          fighters={gangData.processedData.fighters}
          title="Stash"
          onStashUpdate={handleStashUpdate}
          onFighterUpdate={handleFighterUpdate}
          vehicles={gangData.processedData.vehicles || []}
          gangTypeId={gangData.processedData.gang_type_id ?? undefined}
          gangId={gangId}
          gangCredits={gangData.processedData.credits}
          onGangCreditsUpdate={handleGangCreditsUpdate}
          onGangRatingUpdate={handleGangRatingUpdate}
          onGangWealthUpdate={handleGangWealthUpdate}
          userPermissions={userPermissions}
          {...gangCampaignProps}
          gangReputation={gangData.processedData.reputation}
          positioning={gangData.processedData.positioning}
        />
        <GangVehicles
          vehicles={gangData.processedData.vehicles || []}
          fighters={gangData.processedData.fighters || []}
          gangId={gangId}
          gangTypeId={gangData.processedData.gang_type_id}
          onVehicleUpdate={handleVehicleUpdate}
          onFighterUpdate={handleFighterUpdate}
          userPermissions={userPermissions}
          onGangCreditsUpdate={handleGangCreditsUpdate}
          onGangRatingUpdate={handleGangRatingUpdate}
          onGangWealthUpdate={handleGangWealthUpdate}
          currentRating={gangData.processedData.rating}
          currentWealth={gangData.processedData.wealth}
          positioning={gangData.processedData.positioning}
        />
        <div className="bg-card shadow-md rounded-lg p-4">
          <h2 className="text-xl md:text-2xl font-bold mb-4">Campaign</h2>
          <GangTerritories 
            gangId={gangId} 
            campaigns={gangData.processedData.campaigns || []} 
          />
        </div>
        <GangNotes
          gangId={gangId}
          initialNote={gangData.processedData.note || ''}
          initialNoteBackstory={gangData.processedData.note_backstory || ''}
          initialNotePrivate={gangData.processedData.note_private || ''}
          initialNotePrivateUpdatedAt={gangData.processedData.note_private_updated_at}
          onNoteUpdate={handleNoteUpdate}
          onNoteBackstoryUpdate={handleNoteBackstoryUpdate}
          onNotePrivateUpdate={handleNotePrivateUpdate}
          userPermissions={userPermissions}
        />
        <GangBattleSessions
          sessions={gangData.processedData.battleSessions || []}
          gangId={gangId}
          gangName={gangData.processedData.name}
          campaignId={(gangData.processedData.campaigns || [])[0]?.campaign_id}
          sessionUrl={(id) => `/gang/${gangId}/battle-session/${id}`}
        />
      </Tabs>
      </div>
    </FighterCardModalsProvider>
  );
} 