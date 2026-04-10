'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner';
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox";
import { campaignRank } from '@/utils/campaigns/campaignRank';
import { addTerritoryToCampaign, createCustomCampaignTerritory } from "@/app/actions/campaigns/[id]/campaign-territories";
import { ImInfo } from "react-icons/im";
import { Tooltip } from 'react-tooltip';

interface Territory {
  id: string;
  territory_name: string;
  campaign_type_id: string | null;
  territory_id?: string | null;
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
  const [campaignTerritories, setCampaignTerritories] = useState<CampaignTerritory[]>(existingCampaignTerritories);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState<string | null>(null);
  const [newTerritoryName, setNewTerritoryName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    setSelectedTypes([campaignTypeId]);
  }, [campaignTypeId]);

  useEffect(() => {
    setIsLoading(false);
  }, []);

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
      const result = await addTerritoryToCampaign({
        campaignId,
        territoryId: territory.territory_id || territory.id,
        territoryName: territory.territory_name
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      const newTerritory = {
        territory_id: territory.territory_id || territory.id,
        territory_name: territory.territory_name
      };

      setCampaignTerritories(prev => [...prev, newTerritory]);

      if (onTerritoryAdd) {
        onTerritoryAdd(newTerritory);
      }

      toast.success(`Added ${territory.territory_name} to campaign`);
    } catch (error) {
      console.error('Error adding territory:', error);
      toast.error("Failed to add territory");
    } finally {
      setIsAdding(null);
    }
  };

  const handleCreateCustomTerritory = async () => {
    if (!newTerritoryName.trim()) return;

    setIsCreating(true);
    try {
      const result = await createCustomCampaignTerritory({
        campaignId,
        territoryName: newTerritoryName.trim()
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      const newTerritory = {
        territory_id: null,
        territory_name: newTerritoryName.trim()
      };

      setCampaignTerritories(prev => [...prev, newTerritory]);

      if (onTerritoryAdd) {
        onTerritoryAdd(newTerritory);
      }

      toast.success(`Created custom territory "${newTerritoryName.trim()}"`);
      setNewTerritoryName('');
    } catch (error) {
      console.error('Error creating custom territory:', error);
      toast.error(error instanceof Error ? error.message : "Failed to create custom territory");
    } finally {
      setIsCreating(false);
    }
  };

  const filteredTerritories = allTerritories
    .filter(territory => {
      if (territory.campaign_type_id && selectedTypes.includes(territory.campaign_type_id)) {
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

  const allFilteredTerritories = filteredTerritories;

  const getTerritoryCount = (territory: Territory) => {
    return existingCampaignTerritories.filter(existing => {
      if (existing.territory_id === territory.territory_id) {
        return true;
      }
      return false;
    }).length;
  };

  if (isLoading) {
    return <div className="text-center py-1">Loading Territories...</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium flex items-center space-x-2 text-muted-foreground mb-2">
            <span>Campaign Type Territories</span>
          <span
            className="relative cursor-pointer text-muted-foreground hover:text-foreground"
            data-tooltip-id="territories-types-tooltip"
            data-tooltip-html={
              'Select the campaign types that you want to add territories for.'
            }
          >
            <ImInfo />
          </span>
        </h3>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mx-auto">
            {[...campaignTypes]
              .filter(type => type.campaign_type_name.toLowerCase() !== 'custom')
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
      </div>

      {/* Custom Territory creation */}
      {isAdmin && (
        <div>
          <div className="flex space-x-2">
            <Input
              type="text"
              value={newTerritoryName}
              onChange={(e) => setNewTerritoryName(e.target.value)}
              placeholder="Add a custom Territory (max 70 characters)"
              maxLength={70}
              className="flex-grow text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreateCustomTerritory();
                }
              }}
            />
            <Button
              onClick={handleCreateCustomTerritory}
              type="button"
              disabled={!newTerritoryName.trim() || isCreating}
            >
              Add
            </Button>
          </div>
        </div>
      )}

      {allFilteredTerritories.length > 0 ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted border-b">
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
                    <td className="w-3/4 px-1 py-2 text-muted-foreground">{typeName}</td>
                    <td className="w-1/4 px-2 py-2 text-center">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        territoryCount > 0 
                          ? 'bg-blue-100 text-blue-800' 
                          : 'bg-muted text-muted-foreground'
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
        <div className="text-center py-8 text-muted-foreground italic">
          No Territories found for the selected options.
        </div>
      )}
      
      <Tooltip
        id="territories-types-tooltip"
        place="top"
        className="!bg-neutral-900 !text-white !text-xs !z-[2000]"
        delayHide={100}
        clickable={true}
        style={{
          padding: '6px',
          maxWidth: '20rem'
        }}
      />
    </div>
  );
}