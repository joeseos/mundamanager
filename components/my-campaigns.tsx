"use client"

import Link from 'next/link'
import { useCampaigns } from '@/contexts/CampaignsContext'

export default function MyCampaigns() {
  const { campaigns, isLoading, error } = useCampaigns();

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  if (isLoading) return <div className="text-center text-white">Loading campaigns...</div>
  if (error) return <div className="text-center text-red-500">{error}</div>

  return (
    <div className="bg-white shadow-md rounded-lg p-4">
      <h2 className="text-xl md:text-2xl font-bold mb-4">Your Campaigns</h2>
      {campaigns.length === 0 ? (
        <p className="text-center text-gray-500">No campaigns created yet.</p>
      ) : (
        <ul className="space-y-2">
          {campaigns.map((campaign) => (
            <li key={campaign.id}>
              <Link href={`/campaigns/${campaign.id}`} className="flex items-center p-3 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors duration-200">
                <div className="flex-grow">
                  <span className="font-medium text-black">{campaign.campaign_name}</span>
                  <div className="text-sm text-gray-600">
                    Type: {campaign.campaign_type} | Created: {formatDate(campaign.created_at)}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
} 