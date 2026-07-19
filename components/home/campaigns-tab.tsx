"use client"

import { useState, useCallback, useMemo, useEffect } from 'react'
import type { Campaign } from '@/app/lib/get-user-campaigns'
import { DragDropProvider, type DragEndEvent } from '@dnd-kit/react'
import { move } from '@dnd-kit/helpers'
import { toggleFavourite } from '@/app/actions/toggle-favourite'
import { reorderFavourites } from '@/app/actions/reorder-favourites'
import { toast } from 'sonner'
import { dndSensors } from '@/utils/dnd-sensors'
import { CampaignCardContent, SortableCampaignCard } from '@/components/home/campaign-card'

interface CampaignsTabProps {
  campaigns: Campaign[];
}

export function CampaignsTab({ campaigns }: CampaignsTabProps) {
  const [localCampaigns, setLocalCampaigns] = useState<Campaign[]>(campaigns);
  const [pendingReorder, setPendingReorder] = useState<string[] | null>(null);

  // Persist from an effect, after the drop's React transition has committed.
  // Dispatching the server action any earlier (even via setTimeout) entangles
  // its pending transition with the drop's, freezing the card until the POST
  // + revalidation round-trip resolves.
  useEffect(() => {
    if (!pendingReorder) return;
    // No reset needed: each drag sets a fresh array, so the effect fires
    // exactly once per reorder via the dependency identity change
    reorderFavourites({ type: 'campaign', ids: pendingReorder }).then(result => {
      if (!result.success) {
        toast.error(result.error || 'Failed to reorder favourites');
      }
    });
  }, [pendingReorder]);

  const [prevCampaigns, setPrevCampaigns] = useState(campaigns);
  if (campaigns !== prevCampaigns) {
    setPrevCampaigns(campaigns);
    setLocalCampaigns(campaigns);
  }

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

  // Must stay synchronous: the drop animation waits for this handler's React
  // transition to settle, so awaiting the server action here freezes the drop
  const handleCampaignDragEnd = useCallback((event: DragEndEvent) => {
    if (event.canceled) return;

    // move() resolves the drop from the event's sortable metadata and
    // returns the same array reference when nothing changed
    const reordered = move(favouriteCampaigns, event);
    if (reordered === favouriteCampaigns) return;
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

    setPendingReorder(newMemberIds);
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
              <DragDropProvider sensors={dndSensors} onDragEnd={handleCampaignDragEnd}>
                <ul className="space-y-3">
                  {favouriteCampaigns.map((campaign, index) => (
                    <SortableCampaignCard
                      key={campaign.campaign_member_id}
                      campaign={campaign}
                      index={index}
                      onToggleFavourite={handleToggleCampaignFavourite}
                    />
                  ))}
                </ul>
              </DragDropProvider>
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
