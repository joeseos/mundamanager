'use client';

import { useState, useCallback } from 'react';
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
  const [gangData, setGangData] = useState<GangDataState>({
    processedData: initialGangData,
    stash: initialGangData.stash || [],
    onStashUpdate: () => {},
    onVehicleUpdate: () => {},
    onFighterUpdate: () => {}
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
      
      // If fighter now has a vehicle that it didn't have before
      if (updatedFighter.vehicles?.length && (!prevFighter?.vehicles || prevFighter.vehicles.length === 0)) {
        // Add the vehicle's cost to the rating - we know it's a VehicleProps
        const vehicleCost = (updatedFighter.vehicles[0] as unknown as VehicleProps).cost || 0;
        ratingChange += vehicleCost;
        console.log(`Adding vehicle cost ${vehicleCost} to rating`);
      } 
      // If fighter had a vehicle but no longer does
      else if ((!updatedFighter.vehicles || updatedFighter.vehicles.length === 0) && prevFighter?.vehicles?.length) {
        // Subtract the vehicle's cost from the rating
        const vehicleCost = (prevFighter.vehicles[0] as unknown as VehicleProps).cost || 0;
        ratingChange -= vehicleCost;
        console.log(`Removing vehicle cost ${vehicleCost} from rating`);
      }
      // If fighter had a vehicle and still has one, but it's different
      else if (updatedFighter.vehicles?.length && prevFighter?.vehicles?.length && 
               updatedFighter.vehicles[0].id !== prevFighter.vehicles[0].id) {
        // Remove old vehicle cost and add new vehicle cost
        const prevVehicleCost = (prevFighter.vehicles[0] as unknown as VehicleProps).cost || 0;
        const newVehicleCost = (updatedFighter.vehicles[0] as unknown as VehicleProps).cost || 0;
        ratingChange -= prevVehicleCost;
        ratingChange += newVehicleCost;
        console.log(`Changing vehicle cost from ${prevVehicleCost} to ${newVehicleCost}, net change: ${newVehicleCost - prevVehicleCost}`);
      }

      // Calculate rating change from credit changes (when equipment is moved from stash)
      if (prevFighter && updatedFighter.credits !== prevFighter.credits) {
        const creditChange = updatedFighter.credits - prevFighter.credits;
        ratingChange += creditChange;
        console.log(`Fighter credits changed from ${prevFighter.credits} to ${updatedFighter.credits}, rating change: ${creditChange}`);
      }

      // Calculate the new rating
      const newRating = prev.processedData.rating + ratingChange;
      console.log(`Updated rating: ${newRating} (was ${prev.processedData.rating}, change: ${ratingChange})`);

      return {
        ...prev,
        processedData: {
          ...prev.processedData,
          fighters: prev.processedData.fighters.map(fighter =>
            fighter.id === updatedFighter.id ? updatedFighter : fighter
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
      
      console.log(`Adding fighter ${newFighter.fighter_name} - Cost: ${cost}, Fighter Credits: ${newFighter.credits}, New Gang Credits: ${updatedCredits}, New Rating: ${updatedRating}, Position: ${newPosition}`);

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
    setGangData((prev: GangDataState) => ({
      ...prev,
      processedData: {
        ...prev.processedData,
        vehicles: [...prev.processedData.vehicles, newVehicle]
      }
    }));
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
            onStashUpdate={gangData.onStashUpdate}
            onVehicleAdd={handleVehicleAdd}
            onFighterAdd={handleFighterAdd}
            onGangCreditsUpdate={handleGangCreditsUpdate}
            onGangRatingUpdate={handleGangRatingUpdate}
            user_id={gangData.processedData.user_id}
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
          fighters={gangData.processedData.fighters || []}
          gangId={gangId}
          onVehicleUpdate={handleVehicleUpdate}
          onFighterUpdate={handleFighterUpdate}
          userPermissions={userPermissions}
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