"use client"

import { useEffect, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import Tabs from '@/components/tabs';
import TerritoryList from '@/components/territory-list';

interface CampaignProps {
  id: string;
  campaign_name: string;
  campaign_type: string;
  campaign_type_id: string;
  created_at: string;
  updated_at: string | null;
  onRoleChange?: (role: 'OWNER' | 'ARBITRATOR' | 'MEMBER') => void;
}

export default function Campaign({
  id,
  campaign_name,
  campaign_type,
  campaign_type_id,
  created_at,
  updated_at,
  onRoleChange
}: CampaignProps) {
  const [userRole, setUserRole] = useState<'OWNER' | 'ARBITRATOR' | 'MEMBER' | null>(null);
  const supabase = createClient();

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

  return (
    <div>
      {(userRole === 'OWNER' || userRole === 'ARBITRATOR') ? (
        <Tabs tabTitles={['Details', 'Territories', 'Notes']}>
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
    </div>
  );
} 