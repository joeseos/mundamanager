'use client'

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import Modal from "@/components/ui/modal";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import { deleteCampaign } from "@/app/actions/campaigns/[id]/campaign-settings";
import { ImInfo } from "react-icons/im";
import { Tooltip } from 'react-tooltip';
import { tradingPostRank } from "@/utils/tradingPostRank";

interface TradingPostType {
  id: string;
  trading_post_name: string;
}

interface EditCampaignModalProps {
  isOpen: boolean;
  campaignData: {
    id: string;
    campaign_name: string;
    description: string;
    has_meat: boolean;
    has_exploration_points: boolean;
    has_scavenging_rolls: boolean;
    has_power: boolean;
    has_sustenance: boolean;
    has_salvage: boolean;
    status: string | null;
    trading_posts: string[];
  };
  onClose: () => void;
  onSave: (updatedData: {
    campaign_name: string;
    description: string;
    has_meat: boolean;
    has_exploration_points: boolean;
    has_scavenging_rolls: boolean;
    has_power: boolean;
    has_sustenance: boolean;
    has_salvage: boolean;
    trading_posts: string[];
    status: string;
  }) => Promise<boolean>;
  isOwner: boolean;
  tradingPostTypes?: TradingPostType[];
}

export default function CampaignEditModal({
  isOpen,
  campaignData,
  onClose,
  onSave,
  isOwner,
  tradingPostTypes = [],
}: EditCampaignModalProps) {
  // Local state for form values - initialized from props
  const [formValues, setFormValues] = useState({
    campaignName: campaignData.campaign_name,
    description: campaignData.description ?? '',
    meatEnabled: campaignData.has_meat ?? false,
    explorationEnabled: campaignData.has_exploration_points ?? false,
    scavengingEnabled: campaignData.has_scavenging_rolls ?? false,
    powerEnabled: campaignData.has_power ?? false,
    sustenanceEnabled: campaignData.has_sustenance ?? false,
    salvageEnabled: campaignData.has_salvage ?? false,
    status: campaignData.status || 'Active',
    tradingPosts: campaignData.trading_posts || [],
  });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const { toast } = useToast();
  const router = useRouter();

  // Reset form values when campaign data changes or when modal opens
  useEffect(() => {
    setFormValues({
      campaignName: campaignData.campaign_name,
      description: campaignData.description ?? '',
      meatEnabled: campaignData.has_meat ?? false,
      explorationEnabled: campaignData.has_exploration_points ?? false,
      scavengingEnabled: campaignData.has_scavenging_rolls ?? false,
      powerEnabled: campaignData.has_power ?? false,
      sustenanceEnabled: campaignData.has_sustenance ?? false,
      salvageEnabled: campaignData.has_salvage ?? false,
      status: campaignData.status || 'Active',
      tradingPosts: campaignData.trading_posts || [],
    });
    setCharCount((campaignData.description ?? '').length);
  }, [campaignData]);


  // Handler for form submission
  const handleSubmit = async () => {
    const result = await onSave({
      campaign_name: formValues.campaignName,
      description: formValues.description,
      has_meat: formValues.meatEnabled,
      has_exploration_points: formValues.explorationEnabled,
      has_scavenging_rolls: formValues.scavengingEnabled,
      has_power: formValues.powerEnabled,
      has_sustenance: formValues.sustenanceEnabled,
      has_salvage: formValues.salvageEnabled,
      trading_posts: formValues.tradingPosts,
      status: formValues.status,
    });
    return result;
  };

  const handleTradingPostToggle = (tradingPostId: string, enabled: boolean) => {
    setFormValues(prev => {
      const current = prev.tradingPosts || [];
      if (enabled) {
        if (current.includes(tradingPostId)) return prev;
        return {
          ...prev,
          tradingPosts: [...current, tradingPostId]
        };
      }
      return {
        ...prev,
        tradingPosts: current.filter(id => id !== tradingPostId)
      };
    });
  };

  // Handle campaign deletion
  const handleDeleteCampaign = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteCampaign(campaignData.id);

      if (!result.success) {
        throw new Error(result.error);
      }

      toast({
        description: "Campaign deleted successfully"
      });

      router.push('/?tab=campaigns');
      return true;
    } catch (error) {
      console.error('Error deleting campaign:', error);
      toast({
        variant: "destructive",
        description: "Failed to delete campaign"
      });
      return false;
    } finally {
      setIsDeleting(false);
    }
  };

  // Don't render anything if modal is not open
  if (!isOpen) return null;

  return (
    <div>
      <Modal
        title="Edit Campaign"
        content={
          <div className="space-y-4">
            {/* Campaign Name */}
            <div>
              <label className="block text-sm font-medium mb-1">Campaign Name</label>
              <input
                type="text"
                value={formValues.campaignName}
                onChange={(e) => setFormValues(prev => ({
                  ...prev,
                  campaignName: e.target.value
                }))}
                className="w-full p-2 border rounded"
              />
            </div>

            {/* Campaign Status */}
            <div>
              <label className="block text-sm font-medium mb-1">Campaign Status</label>
              <Combobox
                options={[
                  { value: "Active", label: "Active" },
                  { value: "Closed", label: "Closed" }
                ]}
                value={formValues.status}
                onValueChange={(value) => setFormValues(prev => ({
                  ...prev,
                  status: value
                }))}
                placeholder="Select campaign status"
                className="w-full"
              />
            </div>

            {/* Resources */}
            <div className="space-y-2 text-sm font-medium mb-1">
              <div className="flex items-center space-x-2">
                <span>Resources</span>
                <span
                  className="relative cursor-pointer text-muted-foreground hover:text-foreground"
                  data-tooltip-id="resources-tooltip"
                  data-tooltip-html={
                    'Exploration Points: Underhells campaign.<br/>Meat and Scavenging Rolls: Uprising campaign.'
                  }
                >
                  <ImInfo />
                </span>
              </div>
              <label className="flex items-center space-x-2">
                <Checkbox
                  checked={formValues.explorationEnabled}
                  onCheckedChange={(checked) => setFormValues(prev => ({
                    ...prev,
                    explorationEnabled: checked === true
                  }))}
                />
                <span>Exploration Points</span>
              </label>
              
              <label className="flex items-center space-x-2">
                <Checkbox
                  checked={formValues.meatEnabled}
                  onCheckedChange={(checked) => setFormValues(prev => ({
                    ...prev,
                    meatEnabled: checked === true
                  }))}
                />
                <span>Meat</span>
              </label>

              <label className="flex items-center space-x-2">
                <Checkbox
                  checked={formValues.scavengingEnabled}
                  onCheckedChange={(checked) => setFormValues(prev => ({
                    ...prev,
                    scavengingEnabled: checked === true
                  }))}
                />
                <span>Scavenging Rolls</span>
              </label>

              <label className="flex items-center space-x-2">
                <Checkbox
                  checked={formValues.powerEnabled}
                  onCheckedChange={(checked) => setFormValues(prev => ({
                    ...prev,
                    powerEnabled: checked === true
                  }))}
                />
                <span>Power</span>
              </label>

              <label className="flex items-center space-x-2">
                <Checkbox
                  checked={formValues.sustenanceEnabled}
                  onCheckedChange={(checked) => setFormValues(prev => ({
                    ...prev,
                    sustenanceEnabled: checked === true
                  }))}
                />
                <span>Sustenance</span>
              </label>

              <label className="flex items-center space-x-2">
                <Checkbox
                  checked={formValues.salvageEnabled}
                  onCheckedChange={(checked) => setFormValues(prev => ({
                    ...prev,
                    salvageEnabled: checked === true
                  }))}
                />
                <span>Salvage</span>
              </label>
            </div>

            {/* Trading Posts */}
            <div className="space-y-2 text-sm font-medium mb-1">
              <label className="flex items-center justify-between text-sm font-medium">
                <div className="flex items-center space-x-2">
                  <span>Authorised Trading Posts</span>
                  <span
                    className="relative cursor-pointer text-muted-foreground hover:text-foreground"
                    data-tooltip-id="resources-tooltip"
                    data-tooltip-html={
                      'Only selected Trading Posts are available for gangs taking part in this campaign when buying equipment. However, this does not prevent players to access the Unrestricted list options.'
                    }
                  >
                    <ImInfo />
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formValues.tradingPosts.length} selected
                </span>
              </label>
              {tradingPostTypes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No trading posts available. Add trading post types in the admin section first.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {tradingPostTypes
                    .sort((a, b) => {
                      const rankA = tradingPostRank[a.trading_post_name.toLowerCase()] ?? Infinity;
                      const rankB = tradingPostRank[b.trading_post_name.toLowerCase()] ?? Infinity;
                      return rankA - rankB;
                    })
                    .map((type, index, arr) => {
                      const currentRank = tradingPostRank[type.trading_post_name.toLowerCase()] ?? Infinity;
                      const prevRank = index > 0 
                        ? (tradingPostRank[arr[index - 1].trading_post_name.toLowerCase()] ?? Infinity)
                        : null;
                      
                      // Add divider between rank <= 2 and rank >= 11
                      const shouldAddDivider = prevRank !== null && prevRank <= 2 && currentRank >= 11;
                      
                      return (
                        <React.Fragment key={type.id}>
                          {shouldAddDivider && (
                            <div className="col-span-full border-t border-border" />
                          )}
                          <label 
                            htmlFor={`trading-post-${type.id}`} 
                            className="flex items-center space-x-2 cursor-pointer"
                          >
                            <Checkbox
                              id={`trading-post-${type.id}`}
                              checked={formValues.tradingPosts.includes(type.id)}
                              onCheckedChange={(checked) => handleTradingPostToggle(type.id, checked === true)}
                            />
                            <span className="text-xs">{type.trading_post_name}</span>
                          </label>
                        </React.Fragment>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="flex justify-between items-center text-sm font-medium mb-1">
                <span>Description</span>
                <span className={`text-sm ${charCount > 1500 ? 'text-red-500' : 'text-muted-foreground'}`}>
                  {charCount}/1500 characters
                </span>
              </label>
              <textarea
                value={formValues.description}
                onChange={(e) => {
                  const value = e.target.value;
                  setFormValues(prev => ({
                    ...prev,
                    description: value
                  }));
                  setCharCount(value.length); // ✅ update the count
                }}
                className="w-full p-2 border rounded min-h-[200px]"
                placeholder="Enter campaign description..."
              />

            </div>

            {isOwner && (
              <Button
                variant="destructive"
                onClick={() => setShowDeleteModal(true)}
                className="w-full"
              >
                Delete Campaign
              </Button>
            )}
          </div>
        }
        onClose={onClose}
        onConfirm={handleSubmit}
        confirmText="Save Changes"
        confirmDisabled={charCount > 1500}
      />

      {/* Campaign Delete Confirmation Modal */}
      {showDeleteModal && (
        <Modal
          title="Delete Campaign"
          content={
            <div>
              <p>Are you sure you want to permanently delete this campaign?</p>
              <br />
              <p>This action cannot be undone and will permanently delete all campaign data, including territories, members, and gang assignments.</p>
            </div>
          }
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handleDeleteCampaign}
          confirmText="Delete Campaign"
          confirmDisabled={isDeleting}
        />
      )}
      <Tooltip
        id="resources-tooltip"
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
