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
  campaign_type_id: string | null;
  is_custom?: boolean;
  territory_id?: string | null;
  custom_territory_id?: string | null;
}

interface CampaignType {
  id: string;
  campaign_type_name: string;
}

interface CampaignTerritory {
  territory_id: string | null;
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
  const [showCustomTerritories, setShowCustomTerritories] = useState<boolean>(false);
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

  const handleAddTerritory = async (territory: Territory) => {
    setIsAdding(territory.id);
    try {
      // ✅ Use server action with proper cache invalidation
      const result = await addTerritoryToCampaign({
        campaignId,
        territoryId: territory.is_custom ? undefined : territory.territory_id || territory.id,
        customTerritoryId: territory.is_custom ? territory.custom_territory_id || territory.id : undefined,
        territoryName: territory.territory_name,
        isCustom: territory.is_custom
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      // Create a new territory object
      const newTerritory = {
        territory_id: territory.is_custom ? null : (territory.territory_id || territory.id),
        territory_name: territory.territory_name
      };

      // Update local state
      setCampaignTerritories(prev => [...prev, newTerritory]);

      // Notify parent component
      if (onTerritoryAdd) {
        onTerritoryAdd(newTerritory);
      }

      toast({
        description: `Added ${territory.territory_name} to campaign`
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
    .filter(territory => {
      // Handle custom territories
      if (territory.is_custom) {
        // Only include custom territories if the Custom checkbox is checked
        if (!showCustomTerritories) return false;
        
        // If custom territory has a specific campaign type, check if it's selected
        if (territory.campaign_type_id) {
          return selectedTypes.includes(territory.campaign_type_id);
        }
        
        // Custom territories without a campaign type are always included when Custom is checked
        return true;
      }
      
      // Include regular territories that match the selected campaign types
      // Also include territories with "Custom" campaign type when Custom checkbox is checked
      if (territory.campaign_type_id && selectedTypes.includes(territory.campaign_type_id)) {
        return true;
      }
      
      // Check if this territory has the "Custom" campaign type and Custom checkbox is checked
      const territoryType = campaignTypes.find(ct => ct.id === territory.campaign_type_id);
      if (territoryType?.campaign_type_name.toLowerCase() === 'custom' && showCustomTerritories) {
        return true;
      }
      
      return false;
    })
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

  // All filtered territories should be shown in the same list
  const allFilteredTerritories = filteredTerritories;

  // Function to count how many times a territory has been added to the campaign
  const getTerritoryCount = (territory: Territory) => {
    return existingCampaignTerritories.filter(existing => {
      // For regular territories, match by territory_id
      if (!territory.is_custom && existing.territory_id === territory.territory_id) {
        return true;
      }
      // For custom territories, match by territory_name since custom_territory_id might not be available in existingCampaignTerritories
      if (territory.is_custom && existing.territory_name === territory.territory_name) {
        return true;
      }
      return false;
    }).length;
  };



  if (isLoading) {
    return <div className="text-center py-1">Loading territories...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mx-auto">
          {/* Campaign Types */}
          {[...campaignTypes]
            .filter(type => type.campaign_type_name.toLowerCase() !== 'custom') // Exclude "Custom" campaign type to avoid duplication
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
          
          {/* Custom Territories Checkbox */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="custom-territories"
              checked={showCustomTerritories}
              onCheckedChange={(checked) => setShowCustomTerritories(!!checked)}
            />
            <label htmlFor="custom-territories" className="text-sm cursor-pointer">
              Custom
            </label>
          </div>
        </div>
      </div>

      {/* All Territories */}
      {allFilteredTerritories.length > 0 ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="w-2/4 px-2 md:px-4 py-2 text-left font-medium whitespace-nowrap">Territory</th>
                <th className="w-3/4 px-1 py-2 text-left font-medium whitespace-nowrap">Campaign</th>
                <th className="w-1/4 px-0 py-2 text-center font-medium whitespace-nowrap">Count</th>
                {isAdmin && (
                  <th className="w-1/4 px-2 py-2 text-right font-medium whitespace-nowrap"></th>
                )}
              </tr>
            </thead>
            <tbody>
              {allFilteredTerritories.map((territory) => {
                const type = campaignTypes.find(ct => ct.id === territory.campaign_type_id);
                const typeName = territory.campaign_type_id ? (type?.campaign_type_name ?? 'Unknown') : 'All Types';
                const territoryCount = getTerritoryCount(territory);

                return (
                  <tr key={territory.id} className="border-b last:border-0">
                    <td className="w-2/4 px-2 md:px-4 py-2">
                      <span className="font-medium">{territory.territory_name}</span>
                    </td>
                    <td className="w-3/4 px-1 py-2 text-gray-500">{typeName}</td>
                    <td className="w-1/4 px-2 py-2 text-center">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        territoryCount > 0 
                          ? 'bg-blue-100 text-blue-800' 
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {territoryCount}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="w-1/4 px-2 py-2 text-right">
                        <Button
                          onClick={() => handleAddTerritory(territory)}
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
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500 italic">
          No territories found for the selected options.
        </div>
      )}
    </div>
  );
} 