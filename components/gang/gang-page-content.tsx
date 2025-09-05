'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { FighterProps } from "@/types/fighter";
import { FighterType } from "@/types/fighter-type";
import Gang from "@/components/gang/gang";
import Tabs from "@/components/tabs";
import GangInventory from "@/components/gang/stash-tab";
import { GangNotes } from "@/components/gang/notes-tab";
import GangTerritories from "@/components/gang/campaign-tab";
import GangVehicles from "@/components/gang/vehicles-tab";
import { StashItem } from '@/types/gang';
import { VehicleProps } from '@/types/vehicle';
import { UserPermissions } from '@/types/user-permissions';
import { FaUsers, FaBox, FaTruckMoving } from 'react-icons/fa';
import { FiMap } from 'react-icons/fi';
import { LuClipboard } from 'react-icons/lu';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/app/lib/queries/keys';

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
    gang_type_id: string;
    gang_type: string;
    gang_type_image_url: string;
    gang_colour: string;
    credits: number;
    reputation: number;
    meat: number;
    scavenging_rolls: number;
    exploration_points: number;
    rating: number;
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
    positioning: Record<number, string>;
    campaigns: any[];
    gang_variants: Array<{id: string, variant: string}>;
    username?: string;
  };
  stash: StashItem[];
  onStashUpdate: (newStash: StashItem[]) => void;
  onVehicleUpdate: (newVehicles: VehicleProps[]) => void;
  onFighterUpdate: (updatedFighter: FighterProps) => void;
}

export default function GangPageContent({ 
  initialGangData, 
  gangId, 
  userId,
  userPermissions 
}: GangPageContentProps) {
  const queryClient = useQueryClient();
  
  // Use SSR-provided positioning as the single source of truth for initial render
  const positioning = useMemo(() => initialGangData.positioning || {}, [initialGangData.positioning]);
  
  // For now, we'll use the initial fighters data and rely on cache invalidation
  // to keep it synchronized. This avoids the Rules of Hooks violation.
  // The cache invalidation in handleFighterUpdate will ensure synchronization.
  const fighters = useMemo(() => {
    // Use initial fighters data, which will be updated via cache invalidation
    return initialGangData.fighters || [];
  }, [initialGangData.fighters]);
  
  const [gangData, setGangData] = useState<GangDataState>({
    processedData: {
      ...initialGangData,
      fighters,
      positioning
    },
    stash: initialGangData.stash || [],
    onStashUpdate: () => {},
    onVehicleUpdate: () => {},
    onFighterUpdate: () => {}
  });

  // Update gang data when fighters change from individual queries
  useEffect(() => {
    setGangData(prev => ({
      ...prev,
      processedData: {
        ...prev.processedData,
        fighters,
        positioning
      }
    }));
  }, [fighters, positioning]);

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

  const handleFighterUpdate = useCallback((updatedFighter: FighterProps, skipRatingUpdate?: boolean) => {
    // 🎯 SURGICAL CACHE INVALIDATION - Only invalidate the specific fighter's data
    // This automatically updates both gang page and fighter page since they use the same cache keys!
    queryClient.invalidateQueries({ queryKey: queryKeys.fighters.detail(updatedFighter.id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.fighters.equipment(updatedFighter.id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.fighters.skills(updatedFighter.id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.fighters.effects(updatedFighter.id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.fighters.vehicles(updatedFighter.id) });
    
    // Only invalidate gang data that depends on this fighter's changes
    if (!skipRatingUpdate) {
      queryClient.invalidateQueries({ queryKey: queryKeys.gangs.rating(gangId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.gangs.credits(gangId) });
    }
    
    // Note: Local state will be updated automatically via useEffect when cache invalidation
    // triggers refetch of individual fighter queries. No manual state updates needed!
  }, [queryClient, gangId]);

  const handleFighterAdd = useCallback((newFighter: FighterProps, cost: number) => {
    setGangData((prev: GangDataState) => {
      // Add the new fighter to the fighters array
      const updatedFighters = [...prev.processedData.fighters, newFighter];
      
      // Update gang credits by subtracting the cost
      const updatedCredits = prev.processedData.credits - cost;
      
      // Update gang rating by adding the fighter's cost
      const updatedRating = prev.processedData.rating + newFighter.credits;
      
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

  // Update the gang data callbacks
  gangData.onStashUpdate = handleStashUpdate;
  gangData.onVehicleUpdate = handleVehicleUpdate;
  gangData.onFighterUpdate = handleFighterUpdate;

  return (
    <div>
      <Tabs tabTitles={['Gang', 'Stash', 'Vehicles', 'Campaign', 'Notes']}
         tabIcons={[
           <FaUsers key="users" />,
           <FaBox key="box" />,
           <FaTruckMoving key="car" />,
           <FiMap key="map" />,
           <LuClipboard key="note" />
         ]}
        >
        <div className="container max-w-full w-full space-y-4 print:print-fighters">
          <Gang
            {...gangData.processedData}
            initialFighters={gangData.processedData.fighters}
            stash={gangData.stash}
            onVehicleAdd={handleVehicleAdd}
            onFighterAdd={handleFighterAdd}
            onGangCreditsUpdate={handleGangCreditsUpdate}
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
          gangTypeId={gangData.processedData.gang_type_id}
          gangId={gangId}
          gangCredits={gangData.processedData.credits}
          onGangCreditsUpdate={handleGangCreditsUpdate}
          onGangRatingUpdate={handleGangRatingUpdate}
          userPermissions={userPermissions}
        />
        <GangVehicles
          vehicles={gangData.processedData.vehicles || []}
          fighters={gangData.processedData.fighters}
          gangId={gangId}
          onVehicleUpdate={handleVehicleUpdate}
          onFighterUpdate={handleFighterUpdate}
          userPermissions={userPermissions}
          onGangCreditsUpdate={handleGangCreditsUpdate}
          onGangRatingUpdate={handleGangRatingUpdate}
        />
        <div className="bg-white shadow-md rounded-lg p-4">
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
          onNoteUpdate={handleNoteUpdate}
          onNoteBackstoryUpdate={handleNoteBackstoryUpdate}
          userPermissions={userPermissions}
        />
      </Tabs>
    </div>
  );
} 