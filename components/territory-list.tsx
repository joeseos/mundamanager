'use client'

import { useEffect, useState } from 'react'
import { useToast } from "@/components/ui/use-toast"

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
}

export default function TerritoryList({ isAdmin, campaignId }: TerritoryListProps) {
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [campaignTypes, setCampaignTypes] = useState<CampaignType[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedTerritories, setSelectedTerritories] = useState<string[]>([]);
  const [campaignTerritories, setCampaignTerritories] = useState<CampaignTerritory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const loadCampaignTypes = async () => {
      try {
        const response = await fetch('/api/campaigns/campaign-types');
        const data = await response.json();
        
        if (!response.ok) throw new Error('Failed to fetch campaign types');

        setCampaignTypes(data);
        setSelectedTypes(data.map((type: CampaignType) => type.campaign_type_id));
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
        setSelectedTerritories(data.map((t: CampaignTerritory) => t.territory_id));
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

  const handleTerritoryToggle = (territoryId: string) => {
    setSelectedTerritories(prev => 
      prev.includes(territoryId)
        ? prev.filter(id => id !== territoryId)
        : [...prev, territoryId]
    );
  };

  const handleSave = async () => {
    if (!campaignId) {
      toast({
        variant: "destructive",
        description: "Campaign ID is missing"
      });
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/territories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          territoryIds: selectedTerritories
        }),
      });

      if (!response.ok) throw new Error('Failed to save territories');

      toast({
        description: "Territories saved successfully",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        description: "Failed to save territories"
      });
    } finally {
      setIsSaving(false);
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
        {isAdmin && (
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full sm:w-auto px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Territories'}
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="w-12 px-4 py-2"></th>
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
                    <td className="w-12 px-4 py-2">
                      <input
                        type="checkbox"
                        checked={selectedTerritories.includes(territory.id)}
                        onChange={() => handleTerritoryToggle(territory.id)}
                        className="rounded border-gray-300 text-black focus:ring-black"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <span className="font-medium">{territory.territory_name}</span>
                      {isCampaignTerritory && (
                        <span className="ml-2 text-xs text-gray-500">(Added to campaign)</span>
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