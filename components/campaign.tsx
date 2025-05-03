"use client"

import { useEffect, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import Tabs from '@/components/tabs';
import TerritoryList from '@/components/campaign-territory-list';
import { Button } from '@/components/ui/button';
import Modal from '@/components/modal';
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from 'next/navigation';

// Tab icons
import { FaCity } from "react-icons/fa";
import { FiMap } from "react-icons/fi";
import { LuSwords } from "react-icons/lu";
import { LuClipboard } from "react-icons/lu";

interface CampaignProps {
  id: string;
  campaign_name: string;
  campaign_type: string;
  campaign_type_id: string;
  created_at: string;
  updated_at: string | null;
  has_meat: boolean;
  has_exploration_points: boolean;
  has_scavenging_rolls: boolean;
  onRoleChange?: (role: 'OWNER' | 'ARBITRATOR' | 'MEMBER') => void;
  onUpdate?: (updatedData: {
    campaign_name: string;
    has_meat: boolean;
    has_exploration_points: boolean;
    has_scavenging_rolls: boolean;
    updated_at: string;
  }) => void;
}

export default function Campaign({
  id,
  campaign_name,
  campaign_type,
  campaign_type_id,
  created_at,
  updated_at,
  has_meat,
  has_exploration_points,
  has_scavenging_rolls,
  onRoleChange,
  onUpdate,
}: CampaignProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [userRole, setUserRole] = useState<'OWNER' | 'ARBITRATOR' | 'MEMBER' | null>(null);
  const supabase = createClient();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [campaignName, setCampaignName] = useState(campaign_name);
  const [meatEnabled, setMeatEnabled] = useState(has_meat);
  const [explorationEnabled, setExplorationEnabled] = useState(has_exploration_points);
  const [scavengingEnabled, setScavengingEnabled] = useState(has_scavenging_rolls);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  useEffect(() => {
    const checkUserRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setUserRole(null);
          onRoleChange?.('MEMBER');
          return;
        }

        const { data: memberData, error } = await supabase
          .from('campaign_members')
          .select('role')
          .eq('campaign_id', id)
          .eq('user_id', user.id)
          .single();

        if (error) {
          console.error('Error checking user role:', error);
          setUserRole(null);
          onRoleChange?.('MEMBER');
          return;
        }

        setUserRole(memberData?.role || 'MEMBER');
        onRoleChange?.(memberData?.role || 'MEMBER');
      } catch (error) {
        console.error('Error checking user role:', error);
        setUserRole(null);
        onRoleChange?.('MEMBER');
      }
    };

    checkUserRole();
  }, [id, onRoleChange]);

  const handleSave = async () => {
    try {
      const now = new Date().toISOString();
      
      const { error } = await supabase
        .from('campaigns')
        .update({
          campaign_name: campaignName,
          has_meat: meatEnabled,
          has_exploration_points: explorationEnabled,
          has_scavenging_rolls: scavengingEnabled,
          updated_at: now,
        })
        .eq('id', id);

      if (error) throw error;
      
      onUpdate?.({
        campaign_name: campaignName,
        has_meat: meatEnabled,
        has_exploration_points: explorationEnabled,
        has_scavenging_rolls: scavengingEnabled,
        updated_at: now,
      });
      
      toast({
        description: "Campaign settings updated successfully",
      });
      
      setShowEditModal(false);
      return true;
    } catch (error) {
      console.error('Error updating campaign:', error);
      toast({
        variant: "destructive",
        description: "Failed to update campaign settings",
      });
      return false;
    }
  };

  const handleDeleteCampaign = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        description: "Campaign deleted successfully"
      });

      router.push('/campaigns');
      router.refresh();
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

  // Utility function to get current campaign data for updates
  const getCampaignUpdateData = () => {
    return {
      campaign_name: campaignName,
      has_meat: meatEnabled,
      has_exploration_points: explorationEnabled,
      has_scavenging_rolls: scavengingEnabled,
      updated_at: new Date().toISOString()
    };
  };

  return (
    <div>
      {(userRole === 'OWNER' || userRole === 'ARBITRATOR') ? (
        <Tabs tabTitles={['Campaign', 'Territories', 'Battle Logs', 'Notes']}
           tabIcons={[
             <FiMap key="campaign" />,
             <FaCity  key="territories" />,
             <LuSwords  key="battles" />,
             <LuClipboard key="notes" />
           ]}
          >

          {/* 1st tab */}
          <div className="bg-white shadow-md rounded-lg p-4">
            <div className="flex justify-between items-start mb-2">
              <h1 className="text-xl md:text-2xl font-bold mb-2">{campaign_name}</h1>
              {(userRole === 'OWNER' || userRole === 'ARBITRATOR') && (
                <Button
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 bg-black text-white hover:bg-gray-800"
                  onClick={() => setShowEditModal(true)}
                >
                  Edit
                </Button>
              )}
            </div>
            <h2 className="text-gray-600 text-lg mb-4">{campaign_type}</h2>
            <div className="mt-3 flex flex-row item-center justify-between text-xs text-gray-500">
              <div>
                <span>Created: </span>
                <span>{formatDate(created_at)}</span>
              </div>
              <div>
                <span>Last Updated: </span>
                <span>{formatDate(updated_at)}</span>
              </div>
            </div>
          </div>

          {/* 2nd tab */}
          <div className="bg-white shadow-md rounded-lg p-4">
            <h1 className="text-xl md:text-2xl font-bold mb-4">Territories</h1>
            <div className="flex flex-col gap-6">
              <div>
                <p className="text-gray-600">Add all the territories you want to include in your campaign. You can add each territory multiple times.</p>
              </div>
              <div>
                <TerritoryList
                  isAdmin={userRole === 'OWNER' || userRole === 'ARBITRATOR'}
                  campaignId={id}
                  campaignTypeId={campaign_type_id}
                  onTerritoryAdd={(territory) => {
                    // Call the parent's onUpdate function to trigger a refresh
                    if (onUpdate) {
                      onUpdate({
                        ...getCampaignUpdateData(),
                        updated_at: new Date().toISOString()
                      });
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* 3rd tab */}
          <div className="bg-white shadow-md rounded-lg p-4">
            <h1 className="text-xl md:text-2xl font-bold mb-4">Battle Logs</h1>
            <p className="text-gray-600">See the Campaign tab.</p>
          </div>

          {/* 4th tab */}
          <div className="bg-white shadow-md rounded-lg p-4">
            <h1 className="text-xl md:text-2xl font-bold mb-4">Notes</h1>
            <p className="text-gray-600">Notes content coming soon...</p>
          </div>

        </Tabs>
      ) : (
        <div className="bg-white shadow-md rounded-lg p-4">
          <h1 className="text-xl md:text-2xl font-bold mb-2">{campaign_name}</h1>
          <h2 className="text-gray-600 text-lg mb-4">{campaign_type}</h2>
          <div className="mt-3 flex flex-row item-center justify-between text-xs text-gray-500">
            <div>
              <span>Created: </span>
              <span>{formatDate(created_at)}</span>
            </div>
            <div>
              <span>Last Updated: </span>
              <span>{formatDate(updated_at)}</span>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <Modal
          title="Edit Campaign"
          content={
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Campaign Name</label>
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  className="w-full p-2 border rounded"
                />
              </div>
              <div className="space-y-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={meatEnabled}
                    onChange={(e) => setMeatEnabled(e.target.checked)}
                  />
                  <span>Meat</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={explorationEnabled}
                    onChange={(e) => setExplorationEnabled(e.target.checked)}
                  />
                  <span>Exploration Points</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={scavengingEnabled}
                    onChange={(e) => setScavengingEnabled(e.target.checked)}
                  />
                  <span>Scavenging Rolls</span>
                </label>
              </div>
              {userRole === 'OWNER' && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    setShowEditModal(false);
                    setShowDeleteModal(true);
                  }}
                  className="w-full mt-2"
                >
                  Delete Campaign
                </Button>
              )}
            </div>
          }
          onClose={() => setShowEditModal(false)}
          onConfirm={handleSave}
          confirmText="Save Changes"
        />
      )}

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