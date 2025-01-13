"use client"

import { useEffect, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import Tabs from '@/components/tabs';
import TerritoryList from '@/components/territory-list';
import { Button } from '@/components/ui/button';
import Modal from '@/components/modal';
import { useToast } from "@/components/ui/use-toast";

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
  const [userRole, setUserRole] = useState<'OWNER' | 'ARBITRATOR' | 'MEMBER' | null>(null);
  const supabase = createClient();
  const [showEditModal, setShowEditModal] = useState(false);
  const [campaignName, setCampaignName] = useState(campaign_name);
  const [meatEnabled, setMeatEnabled] = useState(has_meat);
  const [explorationEnabled, setExplorationEnabled] = useState(has_exploration_points);
  const [scavengingEnabled, setScavengingEnabled] = useState(has_scavenging_rolls);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not yet updated';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'UTC'
    });
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
      const { error } = await supabase
        .from('campaigns')
        .update({
          campaign_name: campaignName,
          has_meat: meatEnabled,
          has_exploration_points: explorationEnabled,
          has_scavenging_rolls: scavengingEnabled,
        })
        .eq('id', id);

      if (error) throw error;
      
      onUpdate?.({
        campaign_name: campaignName,
        has_meat: meatEnabled,
        has_exploration_points: explorationEnabled,
        has_scavenging_rolls: scavengingEnabled,
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

  const editModalContent = (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Campaign Name
        </label>
        <input
          type="text"
          className="w-full px-3 py-2 border rounded-md"
          value={campaignName}
          onChange={(e) => setCampaignName(e.target.value)}
        />
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="rounded border-gray-300"
            checked={meatEnabled}
            onChange={(e) => setMeatEnabled(e.target.checked)}
          />
          <span className="text-sm">Meat</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="rounded border-gray-300"
            checked={explorationEnabled}
            onChange={(e) => setExplorationEnabled(e.target.checked)}
          />
          <span className="text-sm">Exploration Points</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="rounded border-gray-300"
            checked={scavengingEnabled}
            onChange={(e) => setScavengingEnabled(e.target.checked)}
          />
          <span className="text-sm">Scavenging Rolls</span>
        </label>
      </div>
    </div>
  );

  return (
    <div>
      {(userRole === 'OWNER' || userRole === 'ARBITRATOR') ? (
        <Tabs tabTitles={['Details', 'Territories', 'Notes']}>
          <div className="bg-white shadow-md rounded-lg p-4 md:p-6">
            <div className="flex justify-between items-start mb-2">
              <h1 className="text-2xl font-bold mb-2">{campaign_name}</h1>
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
            <div className="flex gap-6 text-sm text-gray-500">
              <div>
                <span>Created: </span>
                <span>{formatDate(created_at)}</span>
              </div>
              <div>
                <span>Updated: </span>
                <span>{formatDate(updated_at)}</span>
              </div>
            </div>
          </div>
          <div className="bg-white shadow-md rounded-lg p-4 md:p-6">
            <h1 className="text-2xl font-bold mb-4">Territories</h1>
            <TerritoryList 
              isAdmin={userRole === 'OWNER' || userRole === 'ARBITRATOR'} 
              campaignId={id}
              campaignTypeId={campaign_type_id}
            />
          </div>
          <div className="bg-white shadow-md rounded-lg p-4 md:p-6">
            <h1 className="text-2xl font-bold mb-4">Notes</h1>
            <p className="text-gray-600">Notes content coming soon...</p>
          </div>
        </Tabs>
      ) : (
        <div className="bg-white shadow-md rounded-lg p-4 md:p-6">
          <h1 className="text-2xl font-bold mb-2">{campaign_name}</h1>
          <h2 className="text-gray-600 text-lg mb-4">{campaign_type}</h2>
          <div className="flex gap-6 text-sm text-gray-500">
            <div>
              <span>Created: </span>
              <span>{formatDate(created_at)}</span>
            </div>
            <div>
              <span>Updated: </span>
              <span>{formatDate(updated_at)}</span>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <Modal
          title="Edit Campaign"
          content={editModalContent}
          onClose={() => setShowEditModal(false)}
          onConfirm={handleSave}
          confirmText="Save Changes"
        />
      )}
    </div>
  );
} 