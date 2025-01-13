'use client'

import { useEffect, useState } from 'react'
import { useToast } from "@/components/ui/use-toast"
import { Button } from "@/components/ui/button"
import { createClient } from '@/utils/supabase/client'

interface Territory {
  id: string;
  territory_name: string;
  campaign_type_id: string;
}

interface CampaignType {
  campaign_type_id: string;
  campaign_type: string;
}

interface CampaignTerritory {
  territory_id: string;
  territory_name: string;
}

interface TerritoryListProps {
  isAdmin: boolean;
  campaignId: string;
  campaignTypeId: string;
}

export default function TerritoryList({ isAdmin, campaignId, campaignTypeId }: TerritoryListProps) {
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [campaignTypes, setCampaignTypes] = useState<CampaignType[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([campaignTypeId]);
  const [campaignTerritories, setCampaignTerritories] = useState<CampaignTerritory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState<string | null>(null);
  const { toast } = useToast();
  const supabase = createClient();

  useEffect(() => {
    setSelectedTypes([campaignTypeId]);
  }, [campaignTypeId]);

  useEffect(() => {
    const loadCampaignTypes = async () => {
      try {
        const response = await fetch('/api/campaigns/campaign-types');
        const data = await response.json();
        
        if (!response.ok) throw new Error('Failed to fetch campaign types');

        setCampaignTypes(data);
      } catch (error) {
        toast({
          variant: "destructive",
          description: "Failed to load campaign types"
        });
      }
    };

    loadCampaignTypes();
  }, []);

  useEffect(() => {
    const loadTerritories = async () => {
      try {
        const response = await fetch('/api/campaigns/territories');
        const data = await response.json();
        
        if (!response.ok) throw new Error('Failed to fetch territories');

        setTerritories(data);
      } catch (error) {
        toast({
          variant: "destructive",
          description: "Failed to load territories"
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadTerritories();
  }, []);

  useEffect(() => {
    const loadCampaignTerritories = async () => {
      if (!campaignId) return;

      try {
        const response = await fetch(`/api/campaigns/${campaignId}/territories`);
        const data = await response.json();
        
        if (!response.ok) throw new Error('Failed to fetch campaign territories');

        setCampaignTerritories(data);
      } catch (error) {
        toast({
          variant: "destructive",
          description: "Failed to load campaign territories"
        });
      }
    };

    loadCampaignTerritories();
  }, [campaignId]);

  const handleTypeToggle = (typeId: string) => {
    setSelectedTypes(prev => 
      prev.includes(typeId) 
        ? prev.filter(id => id !== typeId)
        : [...prev, typeId]
    );
  };

  const handleAddTerritory = async (territoryId: string, territoryName: string) => {
    setIsAdding(territoryId);
    try {
      const { error } = await supabase
        .from('campaign_territories')
        .insert([{
          campaign_id: campaignId,
          territory_id: territoryId,
          territory_name: territoryName
        }]);

      if (error) throw error;

      // Update local state
      setCampaignTerritories(prev => [...prev, {
        territory_id: territoryId,
        territory_name: territoryName
      }]);

      toast({
        description: `Added ${territoryName} to campaign`
      });
    } catch (error) {
      console.error('Error adding territory:', error);
      toast({
        variant: "destructive",
        description: "Failed to add territory"
      });
    } finally {
      setIsAdding(null);
    }
  };

  const filteredTerritories = territories.filter(territory => 
    selectedTypes.includes(territory.campaign_type_id)
  );

  if (isLoading) {
    return <div className="text-center py-4">Loading territories...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div className="flex flex-wrap gap-4">
          {campaignTypes.map((type) => (
            <label 
              key={type.campaign_type_id} 
              className="flex items-center gap-2 cursor-pointer hover:text-gray-700"
            >
              <input
                type="checkbox"
                checked={selectedTypes.includes(type.campaign_type_id)}
                onChange={() => handleTypeToggle(type.campaign_type_id)}
                className="rounded border-gray-300 text-black focus:ring-black"
              />
              <span className="text-sm">{type.campaign_type}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="w-16 px-4 py-2"></th>
              <th className="px-4 py-2 text-left font-medium">Territory</th>
            </tr>
          </thead>
          <tbody>
            {filteredTerritories.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-4 py-2 text-gray-500 text-center">No territories found</td>
              </tr>
            ) : (
              filteredTerritories.map((territory) => {
                const isCampaignTerritory = campaignTerritories.some(
                  ct => ct.territory_id === territory.id
                );
                
                return (
                  <tr key={territory.id} className="border-b last:border-0">
                    <td className="px-4 py-1.5 align-middle truncate">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium whitespace-nowrap">{territory.territory_name}</span>
                        {isCampaignTerritory && (
                          <span className="text-xs text-gray-500 shrink-0">(Added to campaign)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-1.5 text-right align-middle shrink-0">
                      {!isCampaignTerritory && (
                        <Button
                          onClick={() => handleAddTerritory(territory.id, territory.territory_name)}
                          size="sm"
                          disabled={isAdding === territory.id}
                          className="text-xs px-1.5 h-6 bg-black hover:bg-gray-800 text-white"
                        >
                          {isAdding === territory.id ? 'Adding...' : 'Add'}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
} 