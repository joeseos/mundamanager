'use client';

import { useState } from 'react';
import Gang from "@/components/gang";
import { FighterProps } from '@/types/fighter';
import { FighterType } from '@/types/fighter-type';

interface GangPageContentProps {
  processedData: {
    id: string;
    name: string;
    gang_type_id: string;
    gang_type: string;
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
  };
  gangData: {
    [key: string]: any;
  };
}

export default function GangPageContent({ processedData, gangData }: GangPageContentProps) {
  const [fighters, setFighters] = useState<FighterProps[]>(processedData.fighters || []);

  return (
    <div className="container max-w-5xl w-full space-y-4">
      <Gang
        id={processedData.id}
        name={processedData.name}
        gang_type_id={processedData.gang_type_id}
        gang_type={processedData.gang_type}
        credits={processedData.credits}
        reputation={processedData.reputation}
        meat={processedData.meat}
        exploration_points={processedData.exploration_points}
        rating={processedData.rating}
        alignment={processedData.alignment}
        created_at={processedData.created_at}
        last_updated={processedData.last_updated}
        user_id={processedData.user_id}
        initialFighters={fighters}
        fighterTypes={processedData.fighterTypes}
      />
    </div>
  );
} 