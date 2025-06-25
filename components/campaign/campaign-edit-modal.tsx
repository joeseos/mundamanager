'use client'

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import Modal from "@/components/modal";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import { deleteCampaign } from "@/app/actions/campaign-settings";

interface EditCampaignModalProps {
  isOpen: boolean;
  campaignData: {
    id: string;
    campaign_name: string;
    description: string;
    has_meat: boolean;
    has_exploration_points: boolean;
    has_scavenging_rolls: boolean;
  };
  onClose: () => void;
  onSave: (updatedData: {
    campaign_name: string;
    description: string;
    has_meat: boolean;
    has_exploration_points: boolean;
    has_scavenging_rolls: boolean;
  }) => Promise<boolean>;
  isOwner: boolean;
}

export default function CampaignEditModal({
  isOpen,
  campaignData,
  onClose,
  onSave,
  isOwner,
}: EditCampaignModalProps) {
  // Local state for form values - initialized from props
  const [formValues, setFormValues] = useState({
    campaignName: campaignData.campaign_name,
    description: campaignData.description ?? '',
    meatEnabled: campaignData.has_meat,
    explorationEnabled: campaignData.has_exploration_points,
    scavengingEnabled: campaignData.has_scavenging_rolls,
  });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const { toast } = useToast();
  const supabase = createClient();
  const router = useRouter();

  // Reset form values when campaign data changes or when modal opens
  useEffect(() => {
    setFormValues({
      campaignName: campaignData.campaign_name,
      description: campaignData.description ?? '',
      meatEnabled: campaignData.has_meat,
      explorationEnabled: campaignData.has_exploration_points,
      scavengingEnabled: campaignData.has_scavenging_rolls,
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
    });
    return result;
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

      router.push('/campaigns');
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
            <div className="space-y-2">
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
                  checked={formValues.scavengingEnabled}
                  onCheckedChange={(checked) => setFormValues(prev => ({
                    ...prev,
                    scavengingEnabled: checked === true
                  }))}
                />
                <span>Scavenging Rolls</span>
              </label>
            </div>

            <div>
              <label className="flex justify-between items-center text-sm font-medium mb-1">
                <span>Description</span>
                <span className={`text-sm ${charCount > 1500 ? 'text-red-500' : 'text-gray-500'}`}>
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
                className="w-full mt-2"
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
              <p>Are you sure you want to delete this campaign?</p>
              <br />
              <p>This action cannot be undone and will remove all campaign data including territories, members, and gang assignments.</p>
            </div>
          }
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handleDeleteCampaign}
          confirmText="Delete Campaign"
          confirmDisabled={isDeleting}
        />
      )}
    </div>
  );
} 