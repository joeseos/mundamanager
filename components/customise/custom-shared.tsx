'use client';

import { useState, useEffect } from 'react';
import { CustomFighterType } from '@/types/fighter';
import { CustomEquipment } from '@/types/equipment';
import { toast } from 'sonner';
import Modal from '@/components/ui/modal';
import { Checkbox } from '@/components/ui/checkbox';
import { shareCustomFighter, shareCustomEquipment } from '@/app/actions/customise/custom-share';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/utils/supabase/client';

export interface UserCampaign {
  id: string;
  campaign_name: string;
  status: string | null;
}

interface ShareCustomFighterModalProps {
  fighter: CustomFighterType;
  userId: string;
  userCampaigns: UserCampaign[];
  onClose: () => void;
  onSuccess?: () => void;
}

export function ShareCustomFighterModal({
  fighter,
  userId,
  userCampaigns,
  onClose,
  onSuccess
}: ShareCustomFighterModalProps) {
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  
  const queryClient = useQueryClient();

  // Fetch shared campaigns using TanStack Query
  const { data: sharedCampaignIds = [], isLoading, isSuccess, error: fetchError } = useQuery({
    queryKey: ['customSharedCampaigns', 'fighter', fighter.id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('custom_shared')
        .select('campaign_id')
        .eq('custom_fighter_type_id', fighter.id);

      if (error) throw error;
      return data?.map(share => share.campaign_id) || [];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Sync fetched data to selectedCampaigns state when query succeeds
  useEffect(() => {
    if (isSuccess) {
      setSelectedCampaigns(sharedCampaignIds);
    }
  }, [isSuccess, sharedCampaignIds]);

  // Show error toast if fetch failed
  useEffect(() => {
    if (fetchError) {
      toast.error('Failed to load shared campaigns');
    }
  }, [fetchError]);

  // TanStack Query mutation for sharing custom fighters
  const shareFighterMutation = useMutation({
    mutationFn: (campaignIds: string[]) => shareCustomFighter(fighter.id, campaignIds),
    onSuccess: (result, campaignIds) => {
      if (result.success) {
        toast.success(campaignIds.length > 0
            ? `Custom fighter shared to ${campaignIds.length} campaign${campaignIds.length !== 1 ? 's' : ''}`
            : 'Custom fighter unshared from all campaigns');
        queryClient.invalidateQueries({ queryKey: ['customFighters'] });
        queryClient.invalidateQueries({ queryKey: ['customSharedCampaigns', 'fighter', fighter.id] });
        onSuccess?.();
        onClose();
      } else {
        toast.error(result.error || 'Failed to share custom fighter');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to share custom fighter');
    }
  });

  const handleToggleCampaign = (campaignId: string) => {
    setSelectedCampaigns(prev => {
      if (prev.includes(campaignId)) {
        return prev.filter(id => id !== campaignId);
      } else {
        return [...prev, campaignId];
      }
    });
  };

  const handleSubmit = () => {
    shareFighterMutation.mutate(selectedCampaigns);
    return true;
  };

  return (
    <Modal
      title="Share Custom Fighter"
      helper="Select campaigns to share this custom fighter with"
      onClose={onClose}
      onConfirm={handleSubmit}
      confirmText={shareFighterMutation.isPending ? 'Sharing...' : 'Share Fighter'}
      confirmDisabled={shareFighterMutation.isPending || isLoading}
      width="md"
    >
      <div className="space-y-4">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading...
          </div>
        ) : userCampaigns.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>You're not part of any campaigns yet.</p>
            <p className="text-sm mt-2">You need to be an arbitrator of a campaign to share custom fighters to it.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground mb-4">
              Sharing <strong>{fighter.fighter_type}</strong> to campaigns:
            </p>
            {userCampaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="flex items-start space-x-3 p-3 border rounded-md hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  id={`campaign-${campaign.id}`}
                  checked={selectedCampaigns.includes(campaign.id)}
                  onCheckedChange={() => handleToggleCampaign(campaign.id)}
                  className="mt-0.5"
                />
                <label
                  htmlFor={`campaign-${campaign.id}`}
                  className="flex-1 cursor-pointer"
                >
                  <div className="font-medium">{campaign.campaign_name}</div>
                  {campaign.status && (
                    <div className="text-sm text-muted-foreground">
                      Status: {campaign.status}
                    </div>
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

interface ShareCustomEquipmentModalProps {
  equipment: CustomEquipment;
  userCampaigns: UserCampaign[];
  onClose: () => void;
  onSuccess?: () => void;
}

export function ShareCustomEquipmentModal({
  equipment,
  userCampaigns,
  onClose,
  onSuccess
}: ShareCustomEquipmentModalProps) {
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  
  const queryClient = useQueryClient();

  // Fetch shared campaigns using TanStack Query
  const { data: sharedCampaignIds = [], isLoading, isSuccess, error: fetchError } = useQuery({
    queryKey: ['customSharedCampaigns', 'equipment', equipment.id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('custom_shared')
        .select('campaign_id')
        .eq('custom_equipment_id', equipment.id);

      if (error) throw error;
      return data?.map(share => share.campaign_id) || [];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Sync fetched data to selectedCampaigns state when query succeeds
  useEffect(() => {
    if (isSuccess) {
      setSelectedCampaigns(sharedCampaignIds);
    }
  }, [isSuccess, sharedCampaignIds]);

  // Show error toast if fetch failed
  useEffect(() => {
    if (fetchError) {
      toast.error('Failed to load shared campaigns');
    }
  }, [fetchError]);

  // TanStack Query mutation for sharing custom equipment
  const shareEquipmentMutation = useMutation({
    mutationFn: (campaignIds: string[]) => shareCustomEquipment(equipment.id, campaignIds),
    onSuccess: (result, campaignIds) => {
      if (result.success) {
        toast.success(campaignIds.length > 0
            ? `Custom equipment shared to ${campaignIds.length} campaign${campaignIds.length !== 1 ? 's' : ''}`
            : 'Custom equipment unshared from all campaigns');
        queryClient.invalidateQueries({ queryKey: ['customEquipment'] });
        queryClient.invalidateQueries({ queryKey: ['customSharedCampaigns', 'equipment', equipment.id] });
        onSuccess?.();
        onClose();
      } else {
        toast.error(result.error || 'Failed to share custom equipment');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to share custom equipment');
    }
  });

  const handleToggleCampaign = (campaignId: string) => {
    setSelectedCampaigns(prev => {
      if (prev.includes(campaignId)) {
        return prev.filter(id => id !== campaignId);
      } else {
        return [...prev, campaignId];
      }
    });
  };

  const handleSubmit = () => {
    shareEquipmentMutation.mutate(selectedCampaigns);
    return true;
  };

  return (
    <Modal
      title="Share Custom Equipment"
      helper="Select campaigns to share this custom equipment with"
      onClose={onClose}
      onConfirm={handleSubmit}
      confirmText={shareEquipmentMutation.isPending ? 'Sharing...' : 'Share Equipment'}
      confirmDisabled={shareEquipmentMutation.isPending || isLoading}
      width="md"
    >
      <div className="space-y-4">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading...
          </div>
        ) : userCampaigns.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>You're not part of any campaigns yet.</p>
            <p className="text-sm mt-2">You need to be an arbitrator of a campaign to share custom equipment to it.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground mb-4">
              Sharing <strong>{equipment.equipment_name}</strong> to campaigns:
            </p>
            {userCampaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="flex items-start space-x-3 p-3 border rounded-md hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  id={`equip-campaign-${campaign.id}`}
                  checked={selectedCampaigns.includes(campaign.id)}
                  onCheckedChange={() => handleToggleCampaign(campaign.id)}
                  className="mt-0.5"
                />
                <label
                  htmlFor={`equip-campaign-${campaign.id}`}
                  className="flex-1 cursor-pointer"
                >
                  <div className="font-medium">{campaign.campaign_name}</div>
                  {campaign.status && (
                    <div className="text-sm text-muted-foreground">
                      Status: {campaign.status}
                    </div>
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
