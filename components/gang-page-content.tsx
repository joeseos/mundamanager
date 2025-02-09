'use client';

import { useState, useCallback } from 'react';
import Gang from "@/components/gang";
import { FighterProps } from '@/types/fighter';
import { FighterType } from '@/types/fighter-type';
import { StashItem } from '@/types/gang';
import { VehicleProps } from '@/types/vehicle';

interface GangPageContentProps {
  processedData: {
    id: string;
    name: string;
    gang_type_id: string;
    gang_type: string;
    gang_type_image_url: string;
    credits: number;
    reputation: number;
    meat: number;
    exploration_points: number;
    rating: number;
    alignment: string;
    created_at: string;
    last_updated: string;
    user_id: string;
    fighters: FighterProps[];
    fighterTypes: FighterType[];
    campaigns?: {
      campaign_id: string;
      campaign_name: string;
      role: string | null;
      status: string | null;
    }[];
    stash: StashItem[];
    positioning: Record<number, string>;
  };
  gangData: {
    stash: StashItem[];
    onStashUpdate?: (newStash: StashItem[]) => void;
    onVehicleAdd?: (newVehicle: VehicleProps) => void;
  };
}

export default function GangPageContent({ processedData, gangData }: GangPageContentProps) {
  const [fighters, setFighters] = useState<FighterProps[]>(processedData.fighters || []);
  const [rating, setRating] = useState(processedData.rating);
  
  const handleFighterDeleted = useCallback((fighterId: string, fighterCost: number) => {
    // Optimistically update fighters list and rating
    setFighters(prev => prev.filter(f => f.id !== fighterId));
    setRating(prev => prev - fighterCost);
  }, []);

  return (
    <div className="container max-w-5xl w-full space-y-4 print:print-fighters">
      <Gang
        {...processedData}
        rating={rating}
        initialFighters={fighters}
        fighterTypes={processedData.fighterTypes}
        campaigns={processedData.campaigns}
        stash={processedData.stash || []}
        onStashUpdate={gangData.onStashUpdate}
        onFighterDeleted={handleFighterDeleted}
        onVehicleAdd={gangData.onVehicleAdd}
      />
    </div>
  );
} 