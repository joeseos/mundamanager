'use client';

import React, { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import CampaignMapGangSummary from '@/components/campaigns/[id]/campaign-map-gang-summary';
import { Combobox } from '@/components/ui/combobox';
import { assignGangToTerritory } from '@/app/actions/campaigns/[id]/campaign-territories';
import { toast } from 'sonner';

const CampaignMapCanvas = dynamic(() => import('@/components/campaigns/[id]/campaign-map-canvas'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[70vh] bg-muted rounded-lg flex items-center justify-center">
      <span className="text-muted-foreground">Loading map...</span>
    </div>
  ),
});

const CampaignMapEditorModal = dynamic(() => import('@/components/campaigns/[id]/campaign-map-editor-modal'), {
  ssr: false,
});

interface Gang {
  id: string;
  name: string;
  gang_type: string;
  gang_colour: string;
  owner_username?: string;
  allegiance?: {
    id: string;
    name: string;
    is_custom: boolean;
  } | null;
}

interface Territory {
  id: string;
  territory_id: string | null;
  territory_name: string;
  playing_card?: string | null;
  description?: string | null;
  gang_id: string | null;
  ruined?: boolean;
  default_gang_territory?: boolean;
  is_custom?: boolean;
  map_object_id?: string | null;
  map_hex_coords?: { x: number; y: number; z: number } | null;
  show_name_on_map?: boolean;
  owning_gangs?: Gang[];
}

interface MapData {
  id: string;
  campaign_id: string;
  background_image_url: string;
  hex_grid_enabled: boolean;
  hex_size: number;
  created_at: string;
  updated_at: string | null;
}

interface MapObject {
  id: string;
  campaign_map_id: string;
  object_type: string;
  geometry: Record<string, unknown>;
  properties: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
}

interface CampaignMapProps {
  campaignId: string;
  mapData: MapData | null;
  mapObjects: MapObject[];
  territories: Territory[];
  members: Array<{
    username?: string;
    profile?: {
      username?: string;
    };
    gangs: Gang[];
  }>;
  canEdit: boolean;
  canClaimTerritories: boolean;
  onRefresh: () => void;
}

export default function CampaignMap({
  campaignId,
  mapData,
  mapObjects,
  territories,
  members,
  canEdit,
  canClaimTerritories,
  onRefresh,
}: CampaignMapProps) {
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  const allGangs = React.useMemo(() => {
    const gangMap = new Map<string, Gang>();
    members.forEach(m => {
      const ownerUsername = m.profile?.username || m.username || 'Unknown';
      m.gangs?.forEach(g => {
        if (!gangMap.has(g.id)) {
          gangMap.set(g.id, {
            id: g.id,
            name: g.name,
            gang_type: g.gang_type,
            gang_colour: g.gang_colour,
            owner_username: ownerUsername,
            allegiance: g.allegiance ?? null,
          });
        }
      });
    });
    return Array.from(gangMap.values());
  }, [members]);

  const selectedTerritory = territories.find(t => t.id === selectedTerritoryId);

  const handleMapObjectClick = useCallback((objectId: string | null, hexCoords?: { x: number; y: number; z: number }) => {
    if (!objectId && !hexCoords) {
      setSelectedTerritoryId(null);
      return;
    }

    const territory = territories.find(t => {
      if (objectId && t.map_object_id === objectId) return true;
      if (hexCoords && t.map_hex_coords &&
          t.map_hex_coords.x === hexCoords.x &&
          t.map_hex_coords.y === hexCoords.y &&
          t.map_hex_coords.z === hexCoords.z) return true;
      return false;
    });

    setSelectedTerritoryId(territory?.id ?? null);
  }, [territories]);

  const handleAssignGang = useCallback(async (gangId: string) => {
    if (!selectedTerritoryId) return;
    setIsAssigning(true);
    try {
      const result = await assignGangToTerritory({
        campaignId,
        territoryId: selectedTerritoryId,
        gangId,
      });
      if (result.success) {
        toast.success('Territory assigned');
        onRefresh();
      } else {
        toast.error(result.error || 'Failed to assign territory');
      }
    } catch {
      toast.error('Failed to assign territory');
    } finally {
      setIsAssigning(false);
    }
  }, [campaignId, selectedTerritoryId, onRefresh]);

  const hasMap = !!mapData;

  return (
    <div className="space-y-4">
      {/* Header with action button */}
      <div className="bg-card shadow-md rounded-lg p-4">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl md:text-2xl font-bold">Map</h2>
          {canEdit && (
            <Button onClick={() => setShowEditorModal(true)}>
              {hasMap ? 'Edit Map' : 'Create'}
            </Button>
          )}
        </div>

        {!hasMap && (
          <p className="text-muted-foreground">
            No map has been created for this campaign yet.
            {canEdit && ' Click Create to set up a campaign map.'}
          </p>
        )}
        {/* Map canvas */}
        {hasMap && (
          <div className="border shadow-md rounded-lg overflow-hidden isolate">
            <CampaignMapCanvas
              mapData={mapData}
              mapObjects={mapObjects}
              territories={territories}
              allGangs={allGangs}
              onObjectClick={handleMapObjectClick}
              selectedTerritoryId={selectedTerritoryId}
            />
          </div>
        )}

        {/* Territory ownership combobox */}
        {hasMap && selectedTerritory && canClaimTerritories && (
          <div className="mt-2">
            <h3 className="text-sm font-medium mb-2">
              Assign <span className="font-bold">{selectedTerritory.playing_card ? `${selectedTerritory.playing_card} ` : ''}{selectedTerritory.territory_name}</span> to:
            </h3>
            <Combobox
              options={allGangs.map(g => ({
                value: g.id,
                label: (
                  <>
                    {g.name}
                    {g.owner_username && (
                      <span className="text-xs text-muted-foreground"> • {g.owner_username}</span>
                    )}
                  </>
                ),
                displayValue: g.owner_username ? `${g.name} • ${g.owner_username}` : g.name,
              }))}
              value={selectedTerritory.gang_id ?? ''}
              onValueChange={handleAssignGang}
              placeholder="Select a gang..."
              disabled={isAssigning}
              clearable
            />
          </div>
        )}
      </div>

      {/* Gang summary */}
      {hasMap && (
        <CampaignMapGangSummary
          territories={territories}
          allGangs={allGangs}
        />
      )}

      {/* Editor modal */}
      {showEditorModal && (
        <CampaignMapEditorModal
          campaignId={campaignId}
          mapData={mapData}
          mapObjects={mapObjects}
          territories={territories}
          allGangs={allGangs}
          onClose={() => setShowEditorModal(false)}
          onSave={() => {
            setShowEditorModal(false);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}
