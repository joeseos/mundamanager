"use client"

import Link from 'next/link'

interface Campaign {
  id: string;
  campaign_member_id: string;
  campaign_name: string;
  campaign_type: string;
  campaign_type_id: string;
  created_at: string;
  updated_at: string;
  role?: string;
  status?: string;
}

interface MyCampaignsProps {
  campaigns: Campaign[];
}

export default function MyCampaigns({ campaigns }: MyCampaignsProps) {
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  // Sort by most recent of updated_at (fallback to created_at)
  const sortedCampaigns = [...campaigns].sort((a, b) => {
    const dateA = new Date(a.updated_at || a.created_at).getTime();
    const dateB = new Date(b.updated_at || b.created_at).getTime();
    return dateB - dateA;
  });

  return (
    <div className="bg-white shadow-md rounded-lg p-4">
      <h2 className="text-xl md:text-2xl font-bold mb-4">Your Campaigns</h2>
      {campaigns.length === 0 ? (
        <p className="text-center text-gray-500">No campaigns created yet.</p>
      ) : (
        <ul className="space-y-2">
          {sortedCampaigns.map((campaign) => (
            <li key={campaign.campaign_member_id}>
              <Link href={`/campaigns/${campaign.id}`} className="flex items-center p-3 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors duration-200">
                <div className="flex-grow">
                  <span className="font-medium text-black">{campaign.campaign_name}</span>
                  <div className="text-sm text-gray-600">
                    {campaign.campaign_type} | Created: {formatDate(campaign.created_at)} — Last Updated: {formatDate(campaign.updated_at)}
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