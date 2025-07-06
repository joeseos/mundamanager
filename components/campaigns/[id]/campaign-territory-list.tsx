'use client'

import { useEffect, useState } from 'react'
import { useToast } from "@/components/ui/use-toast"
import { Button } from "@/components/ui/button"
import { createClient } from '@/utils/supabase/client'
import { Checkbox } from "@/components/ui/checkbox";
import { campaignRank } from '@/utils/campaignRank';
import { addTerritoryToCampaign } from "@/app/actions/campaigns/[id]/campaign-territories";

interface Territory {
  id: string;
  territory_name: string;
  campaign_type_id: string;
}

interface CampaignType {
  id: string;
  campaign_type_name: string;
}

interface CampaignTerritory {
  territory_id: string;
  territory_name: string;
}

interface TerritoryListProps {
  isAdmin: boolean;
  campaignId: string;
  campaignTypeId: string;
  campaignTypes: CampaignType[];
  allTerritories: Territory[];
  existingCampaignTerritories: CampaignTerritory[];
  onTerritoryAdd?: (territory: CampaignTerritory) => void;
}

export default function TerritoryList({ 
  isAdmin, 
  campaignId, 
  campaignTypeId, 
  campaignTypes, 
  allTerritories, 
  existingCampaignTerritories,
  onTerritoryAdd 
}: TerritoryListProps) {
  const [selectedTypes, setSelectedTypes] = useState<string[]>([campaignTypeId]);
  const [campaignTerritories, setCampaignTerritories] = useState<CampaignTerritory[]>(existingCampaignTerritories);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setSelectedTypes([campaignTypeId]);
  }, [campaignTypeId]);

  // Initialize loading state - data comes from props now
  useEffect(() => {
    setIsLoading(false);
  }, []);

  // Update campaign territories when prop changes
  useEffect(() => {
    setCampaignTerritories(existingCampaignTerritories);
  }, [existingCampaignTerritories]);

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
      // ✅ Use server action with proper cache invalidation
      const result = await addTerritoryToCampaign({
        campaignId,
        territoryId,
        territoryName
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      // Create a new territory object
      const newTerritory = {
        territory_id: territoryId,
        territory_name: territoryName
      };

      // Update local state
      setCampaignTerritories(prev => [...prev, newTerritory]);

      // Notify parent component
      if (onTerritoryAdd) {
        onTerritoryAdd(newTerritory);
      }

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

  const filteredTerritories = allTerritories
    .filter(territory => selectedTypes.includes(territory.campaign_type_id))
    .sort((a, b) => {
      const typeA = campaignTypes.find(ct => ct.id === a.campaign_type_id)?.campaign_type_name.toLowerCase() || '';
      const typeB = campaignTypes.find(ct => ct.id === b.campaign_type_id)?.campaign_type_name.toLowerCase() || '';

      const rankA = campaignRank[typeA] ?? Infinity;
      const rankB = campaignRank[typeB] ?? Infinity;

      if (rankA !== rankB) {
        return rankA - rankB;
      }

      return a.territory_name.localeCompare(b.territory_name);
    });



  if (isLoading) {
    return <div className="text-center py-1">Loading territories...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mx-auto">
          {[...campaignTypes]
            .sort((a, b) => {
              const rankA = campaignRank[a.campaign_type_name.toLowerCase()] ?? Infinity;
              const rankB = campaignRank[b.campaign_type_name.toLowerCase()] ?? Infinity;
              return rankA - rankB;
            })
            .map((type) => (
              <div key={type.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`type-${type.id}`}
                  checked={selectedTypes.includes(type.id)}
                  onCheckedChange={() => handleTypeToggle(type.id)}
                />
                <label htmlFor={`type-${type.id}`} className="text-sm cursor-pointer">
                  {type.campaign_type_name}
                </label>
              </div>
            ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="w-2/5 px-4 py-2 text-left font-medium whitespace-nowrap">Territory</th>
              <th className="w-2/5 px-4 py-2 text-left font-medium whitespace-nowrap">Campaign Type</th>
              {isAdmin && (
                <th className="w-1/5 px-4 py-2 text-right font-medium whitespace-nowrap"></th>
              )}
            </tr>
          </thead>
          <tbody>
            {filteredTerritories.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 3 : 2} className="px-4 py-2 text-gray-500 italic text-center">No territories found.</td>
              </tr>
            ) : (
              filteredTerritories.map((territory) => {
                const type = campaignTypes.find(ct => ct.id === territory.campaign_type_id);
                const typeName = type?.campaign_type_name ?? 'Unknown';

                return (
                  <tr key={territory.id} className="border-b last:border-0">
                    <td className="w-2/5 px-4 py-2">
                      <span className="font-medium">{territory.territory_name}</span>
                    </td>
                    <td className="w-2/5 px-4 py-2 text-gray-500">{typeName}</td>
                    {isAdmin && (
                      <td className="w-1/5 px-4 py-2 text-right">
                        <Button
                          onClick={() => handleAddTerritory(territory.id, territory.territory_name)}
                          size="sm"
                          disabled={isAdding === territory.id}
                          className="text-xs px-1.5 h-6"
                        >
                          Add
                        </Button>
                      </td>
                    )}
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