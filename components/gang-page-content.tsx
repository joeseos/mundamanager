'use client';

import { useState, useCallback } from 'react';
import { useRouteEvents } from '@/hooks/useRouteEvents';
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
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleFighterDeleted = useCallback((fighterId: string) => {
    // Optimistically update the fighters list
    setFighters(prev => prev.filter(f => f.id !== fighterId));
  }, []);

  // Refresh data only if needed (e.g., after error recovery)
  const refreshData = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const response = await fetch(
        'https://iojoritxhpijprgkjfre.supabase.co/rest/v1/rpc/get_gang_details',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
          },
          body: JSON.stringify({
            "p_gang_id": processedData.id
          })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to refresh gang details');
      }

      const [gangData] = await response.json();
      const processedData = await processGangData(gangData);
      setFighters(processedData.fighters);
    } catch (error) {
      console.error('Error refreshing gang data:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [processedData.id]);

  return (
    <div className="container max-w-5xl w-full space-y-4">
      {isRefreshing && (
        <div className="w-full h-1 bg-gray-200">
          <div className="h-1 bg-primary animate-pulse"></div>
        </div>
      )}
      <Gang
        {...processedData}
        initialFighters={fighters}
        onFighterDeleted={handleFighterDeleted}
        fighterTypes={processedData.fighterTypes}
        campaigns={processedData.campaigns}
      />
    </div>
  );
} 