'use client'

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import Modal from "@/components/ui/modal";
import { toast } from 'sonner';
import { useRouter } from "next/navigation";
import { deleteCampaign } from "@/app/actions/campaigns/[id]/campaign-settings";
import { ImInfo } from "react-icons/im";
import { Tooltip } from 'react-tooltip';
import { tradingPostRank } from "@/utils/tradingPostRank";
import CampaignAllegiancesActions from "@/components/campaigns/[id]/campaign-allegiances-actions";
import CampaignResourcesActions from "@/components/campaigns/[id]/campaign-resources-actions";
import { Badge } from "@/components/ui/badge";

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
    status: string | null;
    trading_posts: string[];
    campaign_type_name?: string;
    campaign_type_id?: string;
  };
  onClose: () => void;
  onSave: (updatedData: {
    campaign_name: string;
    description: string;
    trading_posts: string[];
    status: string;
  }) => Promise<boolean>;
  isOwner: boolean;
  isArbitrator?: boolean;
  isAdmin?: boolean;
  tradingPostTypes?: TradingPostType[];
  campaignAllegiances?: Array<{ id: string; allegiance_name: string; is_custom: boolean }>;
  onAllegiancesChange?: () => void;
  onMembersUpdate?: (allegianceId: string) => void;
  onAllegianceRenamed?: (allegianceId: string, newName: string) => void;
  predefinedAllegiances?: Array<{ id: string; allegiance_name: string }>;
  campaignResources?: Array<{ id: string; resource_name: string; is_custom: boolean }>;
  onResourcesChange?: () => void;
  predefinedResources?: Array<{ id: string; resource_name: string }>;
}

export default function CampaignEditModal({
  isOpen,
  campaignData,
  onClose,
  onSave,
  isOwner,
  isArbitrator = false,
  isAdmin = false,
  tradingPostTypes = [],
  campaignAllegiances = [],
  onAllegiancesChange,
  onMembersUpdate,
  onAllegianceRenamed,
  predefinedAllegiances = [],
  campaignResources = [],
  onResourcesChange,
  predefinedResources = [],
}: EditCampaignModalProps) {
  // Local state for form values - initialized from props
  const [formValues, setFormValues] = useState({
    campaignName: campaignData.campaign_name,
    description: campaignData.description ?? '',
    status: campaignData.status || 'Active',
    tradingPosts: campaignData.trading_posts || [],
  });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const [confirmText, setConfirmText] = useState('');
  
  const router = useRouter();

  // Reset form values when campaign data changes or when modal opens
  useEffect(() => {
    setFormValues({
      campaignName: campaignData.campaign_name,
      description: campaignData.description ?? '',
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

      toast.success("Campaign deleted successfully");

      router.push('/?tab=campaigns');
      return true;
    } catch (error) {
      console.error('Error deleting campaign:', error);
      toast.error("Failed to delete campaign");
      return false;
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
      setConfirmText('');
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

            {/* Resources Section */}
            <div>
              <h3 className="text-sm font-medium flex items-center space-x-2">
                <span>Resources</span>
                  <span
                    className="relative cursor-pointer text-muted-foreground hover:text-foreground"
                    data-tooltip-id="resources-tooltip"
                    data-tooltip-html={
                      'Resources are campaign-specific currencies that gangs can accumulate. Predefined resources come from the campaign type (e.g., Exploration Points for Underhells, Meat and Scavenging Rolls for Uprising). Campaign owners and arbitrators can also add custom resources.'
                    }
                  >
                    <ImInfo />
                  </span>
              </h3>
              {/* Default Resources Section (for non-custom campaigns) */}
              {predefinedResources.length > 0 && campaignData.campaign_type_name !== 'Custom' && (
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  <span className="text-xs text-muted-foreground">Default:</span>
                  {predefinedResources.map((resource: { id: string; resource_name: string }) => (
                    <Badge key={resource.id} variant="secondary">
                      {resource.resource_name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Custom Resources Management Section */}
            {(isOwner || isArbitrator || isAdmin) && (
              <div>
                <CampaignResourcesActions
                  campaignId={campaignData.id}
                  isCustomCampaign={campaignData.campaign_type_name === 'Custom'}
                  canManage={true}
                  initialResources={campaignResources.filter(r => r.is_custom)}
                  onResourcesChange={onResourcesChange}
                />
              </div>
            )}

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

            {/* Allegiances Section */}
            <div>
              <h3 className="text-sm font-medium flex items-center space-x-2">
                <span>Allegiances</span>
                  <span
                    className="relative cursor-pointer text-muted-foreground hover:text-foreground"
                    data-tooltip-id="resources-tooltip"
                    data-tooltip-html={
                      'Allegiances represent which side or faction a gang chooses to align with in a campaign. Some campaigns feature opposed forces (such as Imperial House vs House Aranthus, or Order vs Chaos), and while gangs may start Unaligned, they will eventually need to choose a side as the campaign progresses.<br/><br/>When adding a gang to a campaign, an allegiance can be selected for the gang directly. Players can edit their own gang\'s allegiance, and arbitrators can update the allegiance of every gang in a campaign.'
                    }
                  >
                    <ImInfo />
                  </span>
              </h3>
              {/* Default Allegiances Section (for non-custom campaigns) */}
              {predefinedAllegiances.length > 0 && campaignData.campaign_type_name !== 'Custom' && (
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  <span className="text-xs text-muted-foreground">Default:</span>
                  {predefinedAllegiances.map((allegiance: { id: string; allegiance_name: string }) => (
                    <Badge key={allegiance.id} variant="secondary">
                      {allegiance.allegiance_name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Custom Allegiances Management Section */}
            {(isOwner || isArbitrator || isAdmin) && (
              <div>
                <CampaignAllegiancesActions
                  campaignId={campaignData.id}
                  isCustomCampaign={campaignData.campaign_type_name === 'Custom'}
                  canManage={true}
                  initialAllegiances={campaignAllegiances.filter(a => a.is_custom)}
                  onAllegiancesChange={onAllegiancesChange}
                  onMembersUpdate={onMembersUpdate}
                  onAllegianceRenamed={onAllegianceRenamed}
                />
              </div>
            )}

            {/* Description */}
            <div>
              <label className="flex justify-between items-center text-sm font-medium mb-1">
                <div className="flex items-center space-x-2">
                  <span>Description</span>
                  <span
                    className="relative cursor-pointer text-muted-foreground hover:text-foreground"
                    data-tooltip-id="resources-tooltip"
                    data-tooltip-html={
                      'The campaign description is displayed on the campaign page, providing information about the campaign to all participants. This description appears below the campaign header and is visible to all members of the campaign.'
                    }
                  >
                    <ImInfo />
                  </span>
                </div>
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
                  setCharCount(value.length);
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
            <div className="space-y-4">
              <p>
                Are you sure you want to permanently delete the campaign <strong>{campaignData.campaign_name}</strong>?
              </p>
              <p className="text-sm text-red-600">
                This action cannot be undone and will permanently delete all campaign data, including territories, members, and gang assignments.
              </p>
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Type <span className="font-bold">Delete</span> to confirm:
                </p>
                <Input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Delete"
                  className="w-full"
                />
              </div>
            </div>
          }
          onClose={() => {
            setShowDeleteModal(false);
            setConfirmText('');
          }}
          onConfirm={handleDeleteCampaign}
          confirmText="Delete Campaign"
          confirmDisabled={confirmText !== 'Delete' || isDeleting}
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
