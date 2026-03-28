"use client"

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Campaign } from '@/app/lib/get-user-campaigns'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { toggleFavourite } from '@/app/actions/toggle-favourite'
import { reorderFavourites } from '@/app/actions/reorder-favourites'
import { toast } from 'sonner'
import { useDndSensorsConfig } from '@/hooks/use-dnd-sensors'
import { CampaignCardContent, SortableCampaignCard } from '@/components/home/campaign-card'

interface CampaignsTabProps {
  campaigns: Campaign[];
}

export function CampaignsTab({ campaigns }: CampaignsTabProps) {
  const [localCampaigns, setLocalCampaigns] = useState<Campaign[]>(campaigns);
  const [isMounted, setIsMounted] = useState(false);
  const sensors = useDndSensorsConfig();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    setLocalCampaigns(campaigns);
  }, [campaigns]);

  const favouriteCampaigns = useMemo(
    () => [...localCampaigns]
      .filter(c => c.is_favourite)
      .sort((a, b) => (a.favourite_order ?? 0) - (b.favourite_order ?? 0)),
    [localCampaigns]
  );

  const nonFavouriteCampaigns = useMemo(
    () => [...localCampaigns]
      .filter(c => !c.is_favourite)
      .sort((a, b) => {
        const dateA = new Date(a.updated_at || a.created_at).getTime();
        const dateB = new Date(b.updated_at || b.created_at).getTime();
        return dateB - dateA;
      }),
    [localCampaigns]
  );

  const handleToggleCampaignFavourite = useCallback(async (campaignMemberId: string, isFavourite: boolean) => {
    const previousCampaigns = localCampaigns;

    setLocalCampaigns(prev => {
      if (isFavourite) {
        const currentMaxOrder = Math.max(-1, ...prev.filter(c => c.is_favourite).map(c => c.favourite_order ?? -1));
        return prev.map(c =>
          c.campaign_member_id === campaignMemberId ? { ...c, is_favourite: true, favourite_order: currentMaxOrder + 1 } : c
        );
      }
      return prev.map(c =>
        c.campaign_member_id === campaignMemberId ? { ...c, is_favourite: false, favourite_order: null } : c
      );
    });

    const result = await toggleFavourite({ type: 'campaign', id: campaignMemberId, is_favourite: isFavourite });
    if (!result.success) {
      setLocalCampaigns(previousCampaigns);
      toast.error(result.error || 'Failed to update favourite');
    }
  }, [localCampaigns]);

  const handleCampaignDragEnd = useCallback(async (event: { active: { id: string | number }; over: { id: string | number } | null }) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = favouriteCampaigns.findIndex(c => c.campaign_member_id === active.id);
    const newIndex = favouriteCampaigns.findIndex(c => c.campaign_member_id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(favouriteCampaigns, oldIndex, newIndex);
    const newMemberIds = reordered.map(c => c.campaign_member_id);

    setLocalCampaigns(prev => {
      const updated = [...prev];
      for (let i = 0; i < newMemberIds.length; i++) {
        const idx = updated.findIndex(c => c.campaign_member_id === newMemberIds[i]);
        if (idx !== -1) {
          updated[idx] = { ...updated[idx], favourite_order: i };
        }
      }
      return updated;
    });

    const result = await reorderFavourites({ type: 'campaign', ids: newMemberIds });
    if (!result.success) {
      toast.error(result.error || 'Failed to reorder favourites');
    }
  }, [favouriteCampaigns]);

  return (
    <div className="bg-card shadow-md rounded-lg p-4">
      <h2 className="text-xl md:text-2xl font-bold mb-4">Campaigns</h2>
      {localCampaigns.length === 0 ? (
        <p className="text-center text-muted-foreground">No campaigns created yet.</p>
      ) : (
        <div className="space-y-3">
          {favouriteCampaigns.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Favourites</h3>
              {isMounted ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleCampaignDragEnd}
                >
                  <SortableContext
                    items={favouriteCampaigns.map(c => c.campaign_member_id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul className="space-y-3">
                      {favouriteCampaigns.map(campaign => (
                        <SortableCampaignCard
                          key={campaign.campaign_member_id}
                          campaign={campaign}
                          onToggleFavourite={handleToggleCampaignFavourite}
                        />
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
              ) : (
                <ul className="space-y-3">
                  {favouriteCampaigns.map(campaign => (
                    <li key={campaign.campaign_member_id}>
                      <CampaignCardContent
                        campaign={campaign}
                        onToggleFavourite={handleToggleCampaignFavourite}
                      />
                    </li>
                  ))}
                </ul>
              )}
              {nonFavouriteCampaigns.length > 0 && (
                <hr className="border-border my-4" />
              )}
            </>
          )}

          {nonFavouriteCampaigns.length > 0 && (
            <ul className="space-y-3">
              {nonFavouriteCampaigns.map(campaign => (
                <li key={campaign.campaign_member_id}>
                  <CampaignCardContent
                    campaign={campaign}
                    onToggleFavourite={handleToggleCampaignFavourite}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
