'use client';

import { useState, useEffect } from 'react';
import { CustomFighterType } from '@/types/fighter';
import { CustomEquipment } from '@/types/equipment';
import { toast } from 'sonner';
import Modal from '@/components/ui/modal';
import { Checkbox } from '@/components/ui/checkbox';
import { shareCustomFighter, shareCustomEquipment, shareCustomGangType, shareCustomTradingPost, shareCollection } from '@/app/actions/customise/custom-share';
import { CustomGangType } from '@/app/actions/customise/custom-gang-types';
import { CustomTradingPost } from '@/app/actions/customise/custom-trading-posts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/utils/supabase/client';
import type { UserCampaign } from '@/types/campaign';

// custom_shared columns that hold a shareable item id.
type ShareColumn =
  | 'custom_fighter_type_id'
  | 'custom_equipment_id'
  | 'custom_gang_type_id'
  | 'custom_trading_post_id'
  | 'custom_collection_id';

interface ShareToCampaignsModalProps {
  itemId: string;
  itemName: string;
  column: ShareColumn;
  queryKind: string;          // discriminator for the shared-campaigns query key
  noun: string;               // e.g. "Custom fighter", "Collection" — used in toasts
  title: string;
  helper: string;
  confirmLabel: string;       // e.g. "Share Fighter"
  applyVerb?: string;         // default "Sharing"
  emptyHint: string;          // sentence shown when the user arbitrates no campaigns
  idPrefix: string;           // checkbox id prefix
  invalidateKeys?: string[][];
  share: (campaignIds: string[]) => Promise<{ success: boolean; error?: string }>;
  userCampaigns: UserCampaign[];
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * Shared "apply to campaigns" modal used by every custom asset (fighter, equipment,
 * gang type, trading post, collection). Loads the campaigns the item is currently shared to,
 * lets the arbitrator toggle the set, and persists via the supplied `share` action.
 */
function ShareToCampaignsModal({
  itemId,
  itemName,
  column,
  queryKind,
  noun,
  title,
  helper,
  confirmLabel,
  applyVerb = 'Sharing',
  emptyHint,
  idPrefix,
  invalidateKeys = [],
  share,
  userCampaigns,
  onClose,
  onSuccess,
}: ShareToCampaignsModalProps) {
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const queryClient = useQueryClient();
  const sharedQueryKey = ['customSharedCampaigns', queryKind, itemId];

  const { data: sharedCampaignIds = [], isLoading, isSuccess, error: fetchError } = useQuery({
    queryKey: sharedQueryKey,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('custom_shared')
        .select('campaign_id')
        .eq(column, itemId);
      if (error) throw error;
      return Array.from(new Set((data || []).map(share => share.campaign_id)));
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    if (isSuccess) setSelectedCampaigns(sharedCampaignIds);
  }, [isSuccess, sharedCampaignIds]);

  useEffect(() => {
    if (fetchError) toast.error('Failed to load shared campaigns');
  }, [fetchError]);

  const shareMutation = useMutation({
    mutationFn: (campaignIds: string[]) => share(campaignIds),
    onSuccess: (result, campaignIds) => {
      if (result.success) {
        toast.success(campaignIds.length > 0
          ? `${noun} shared to ${campaignIds.length} campaign${campaignIds.length !== 1 ? 's' : ''}`
          : `${noun} unshared from all campaigns`);
        for (const key of invalidateKeys) queryClient.invalidateQueries({ queryKey: key });
        queryClient.invalidateQueries({ queryKey: sharedQueryKey });
        onSuccess?.();
        onClose();
      } else {
        toast.error(result.error || `Failed to share ${noun.toLowerCase()}`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || `Failed to share ${noun.toLowerCase()}`);
    },
  });

  const handleToggleCampaign = (campaignId: string) => {
    setSelectedCampaigns(prev =>
      prev.includes(campaignId) ? prev.filter(id => id !== campaignId) : [...prev, campaignId]
    );
  };

  return (
    <Modal
      title={title}
      helper={helper}
      onClose={onClose}
      onConfirm={() => { shareMutation.mutate(selectedCampaigns); return true; }}
      confirmText={shareMutation.isPending ? 'Sharing...' : confirmLabel}
      confirmDisabled={shareMutation.isPending || isLoading}
      width="md"
    >
      <div className="space-y-4">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : userCampaigns.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>You're not part of any campaigns yet.</p>
            <p className="text-sm mt-2">{emptyHint}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground mb-4">
              {applyVerb} <strong>{itemName}</strong> to campaigns:
            </p>
            {userCampaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="flex items-start space-x-3 p-3 border rounded-md hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  id={`${idPrefix}-${campaign.id}`}
                  checked={selectedCampaigns.includes(campaign.id)}
                  onCheckedChange={() => handleToggleCampaign(campaign.id)}
                  className="mt-0.5"
                />
                <label htmlFor={`${idPrefix}-${campaign.id}`} className="flex-1 cursor-pointer">
                  <div className="font-medium">{campaign.campaign_name}</div>
                  {campaign.status && (
                    <div className="text-sm text-muted-foreground">Status: {campaign.status}</div>
                  )}
                </label>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

interface ShareCustomFighterModalProps {
  fighter: CustomFighterType;
  userId: string;
  userCampaigns: UserCampaign[];
  onClose: () => void;
  onSuccess?: () => void;
}

export function ShareCustomFighterModal({ fighter, userCampaigns, onClose, onSuccess }: ShareCustomFighterModalProps) {
  return (
    <ShareToCampaignsModal
      itemId={fighter.id}
      itemName={fighter.fighter_type}
      column="custom_fighter_type_id"
      queryKind="fighter"
      noun="Custom fighter"
      title="Share Custom Fighter"
      helper="Select campaigns to share this custom fighter with"
      confirmLabel="Share Fighter"
      emptyHint="You need to be an arbitrator of a campaign to share custom fighters to it."
      idPrefix="campaign"
      invalidateKeys={[['customFighters']]}
      share={(ids) => shareCustomFighter(fighter.id, ids)}
      userCampaigns={userCampaigns}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}

interface ShareCustomEquipmentModalProps {
  equipment: CustomEquipment;
  userCampaigns: UserCampaign[];
  onClose: () => void;
  onSuccess?: () => void;
}

export function ShareCustomEquipmentModal({ equipment, userCampaigns, onClose, onSuccess }: ShareCustomEquipmentModalProps) {
  return (
    <ShareToCampaignsModal
      itemId={equipment.id}
      itemName={equipment.equipment_name}
      column="custom_equipment_id"
      queryKind="equipment"
      noun="Custom equipment"
      title="Share Custom Equipment"
      helper="Select campaigns to share this custom equipment with"
      confirmLabel="Share Equipment"
      emptyHint="You need to be an arbitrator of a campaign to share custom equipment to it."
      idPrefix="equip-campaign"
      invalidateKeys={[['customEquipment']]}
      share={(ids) => shareCustomEquipment(equipment.id, ids)}
      userCampaigns={userCampaigns}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}

interface ShareCustomGangTypeModalProps {
  gangType: CustomGangType;
  userCampaigns: UserCampaign[];
  onClose: () => void;
  onSuccess?: () => void;
}

export function ShareCustomGangTypeModal({ gangType, userCampaigns, onClose, onSuccess }: ShareCustomGangTypeModalProps) {
  return (
    <ShareToCampaignsModal
      itemId={gangType.id}
      itemName={gangType.gang_type}
      column="custom_gang_type_id"
      queryKind="gangType"
      noun="Custom gang type"
      title="Share Custom Gang Type"
      helper="Select campaigns to share this custom gang type with. Custom fighters and skills belonging to this gang type will also be shared."
      confirmLabel="Share Gang Type"
      emptyHint="You need to be an arbitrator of a campaign to share custom gang types to it."
      idPrefix="gangtype-campaign"
      invalidateKeys={[['customGangTypes']]}
      share={(ids) => shareCustomGangType(gangType.id, ids)}
      userCampaigns={userCampaigns}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}

interface ShareCustomTradingPostModalProps {
  tradingPost: CustomTradingPost;
  userCampaigns: UserCampaign[];
  onClose: () => void;
  onSuccess?: () => void;
}

export function ShareCustomTradingPostModal({ tradingPost, userCampaigns, onClose, onSuccess }: ShareCustomTradingPostModalProps) {
  return (
    <ShareToCampaignsModal
      itemId={tradingPost.id}
      itemName={tradingPost.custom_trading_post_name}
      column="custom_trading_post_id"
      queryKind="tradingPost"
      noun="Custom trading post"
      title="Share Custom Trading Post"
      helper="Select campaigns to share this custom trading post with"
      confirmLabel="Share Trading Post"
      emptyHint="You need to be an arbitrator of a campaign to share custom trading posts to it."
      idPrefix="tradingpost-campaign"
      invalidateKeys={[['customTradingPosts']]}
      share={(ids) => shareCustomTradingPost(tradingPost.id, ids)}
      userCampaigns={userCampaigns}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}

interface ShareCustomCollectionModalProps {
  collection: { id: string; name: string };
  userCampaigns: UserCampaign[];
  onClose: () => void;
  onSuccess?: () => void;
}

export function ShareCustomCollectionModal({ collection, userCampaigns, onClose, onSuccess }: ShareCustomCollectionModalProps) {
  return (
    <ShareToCampaignsModal
      itemId={collection.id}
      itemName={collection.name}
      column="custom_collection_id"
      queryKind="collection"
      noun="Collection"
      title="Share Collection"
      helper="Apply this collection to campaigns you arbitrate. All items in the collection (and any custom fighters and skills they reference) will be shared to the campaign."
      confirmLabel="Share Collection"
      applyVerb="Applying"
      emptyHint="You need to be an arbitrator of a campaign to apply collections to it."
      idPrefix="collection-campaign"
      invalidateKeys={[['customCollections']]}
      share={(ids) => shareCollection(collection.id, ids)}
      userCampaigns={userCampaigns}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}
