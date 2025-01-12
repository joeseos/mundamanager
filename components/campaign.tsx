"use client"

import { useEffect, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import Tabs from '@/components/tabs';
import TerritoryList from '@/components/territory-list';

interface CampaignProps {
  id: string;
  campaign_name: string;
  campaign_type: string;
  created_at: string;
  updated_at: string | null;
  onRoleChange?: (role: 'OWNER' | 'ARBITRATOR' | 'MEMBER') => void;
}

export default function Campaign({
  id,
  campaign_name,
  campaign_type,
  created_at,
  updated_at,
  onRoleChange
}: CampaignProps) {
  const [userRole, setUserRole] = useState<'OWNER' | 'ARBITRATOR' | 'MEMBER' | null>(null);
  const supabase = createClient();

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

  // Format date consistently for both server and client
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not yet updated';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'UTC' // Ensure consistent timezone handling
    });
  };

  return (
    <div>
      {(userRole === 'OWNER' || userRole === 'ARBITRATOR') ? (
        <Tabs>
          <div className="bg-white shadow-md rounded-lg p-4 md:p-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">{campaign_name}</h1>
              </div>
              <h2 className="text-gray-600 text-lg">{campaign_type}</h2>
              
              <h2 className="text-xl font-semibold">Campaign Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-md">
                <div>
                  <p className="text-gray-600">Type</p>
                  <p className="font-medium">{campaign_type}</p>
                </div>
                <div>
                  <p className="text-gray-600">Created</p>
                  <p className="font-medium">{formatDate(created_at)}</p>
                </div>
                <div>
                  <p className="text-gray-600">Updated</p>
                  <p className="font-medium">{formatDate(updated_at)}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white shadow-md rounded-lg p-4 md:p-6">
            <h2 className="text-xl font-semibold mb-4">Territories</h2>
            <TerritoryList isAdmin={userRole === 'OWNER' || userRole === 'ARBITRATOR'} campaignId={id} />
          </div>
          <div className="bg-white shadow-md rounded-lg p-4 md:p-6">
            <h2 className="text-xl font-semibold mb-4">Notes</h2>
            <p className="text-gray-600">Notes content coming soon...</p>
          </div>
        </Tabs>
      ) : (
        <div className="bg-white shadow-md rounded-lg p-4 md:p-6">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold">{campaign_name}</h1>
            </div>
            <h2 className="text-gray-600 text-lg">{campaign_type}</h2>
            
            <h2 className="text-xl font-semibold">Campaign Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-md">
              <div>
                <p className="text-gray-600">Type</p>
                <p className="font-medium">{campaign_type}</p>
              </div>
              <div>
                <p className="text-gray-600">Created</p>
                <p className="font-medium">{formatDate(created_at)}</p>
              </div>
              <div>
                <p className="text-gray-600">Updated</p>
                <p className="font-medium">{formatDate(updated_at)}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 