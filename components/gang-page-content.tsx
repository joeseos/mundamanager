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
    campaigns?: {
      campaign_id: string;
      campaign_name: string;
      role: string | null;
      status: string | null;
    }[];
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
        {...processedData}
        initialFighters={fighters}
        fighterTypes={processedData.fighterTypes}
        campaigns={processedData.campaigns}
      />
    </div>
  );
} 