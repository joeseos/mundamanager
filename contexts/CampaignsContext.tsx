"use client"

import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { createClient } from "@/utils/supabase/client";

type Campaign = {
  id: string;
  campaign_name: string;
  campaign_type: string;
  campaign_type_id: string;
  created_at: string;
};

type CampaignsContextType = {
  campaigns: Campaign[];
  setCampaigns: React.Dispatch<React.SetStateAction<Campaign[]>>;
  isLoading: boolean;
  error: string | null;
  refreshCampaigns: () => Promise<void>;
};

const CampaignsContext = createContext<CampaignsContextType | undefined>(undefined);

export const useCampaigns = () => {
  const context = useContext(CampaignsContext);
  if (!context) {
    throw new Error('useCampaigns must be used within a CampaignsProvider');
  }
  return context;
};

export const CampaignsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const fetchCampaigns = async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error: rpcError } = await supabase
        .rpc('get_user_campaigns', {
          user_id: user.id
        });

      if (rpcError) throw rpcError;

      setCampaigns(data || []);
      setError(null);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      setError('Failed to fetch campaigns');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const refreshCampaigns = async () => {
    await fetchCampaigns();
  };

  return (
    <CampaignsContext.Provider value={{ campaigns, setCampaigns, isLoading, error, refreshCampaigns }}>
      {children}
    </CampaignsContext.Provider>
  );
}; 