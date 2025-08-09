"use client"

import Image from 'next/image'
import type { Campaign } from '@/app/lib/get-user-campaigns'

interface MyCampaignsProps {
  campaigns: Campaign[];
}

export default function MyCampaigns({ campaigns }: MyCampaignsProps) {
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    console.error('Failed to load image:', e.currentTarget.src);
    e.currentTarget.src = "https://res.cloudinary.com/dle0tkpbl/image/upload/v1735682275/IMG_6113_odsp7l.jpg";
  };

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
    <div className="bg-white shadow-md rounded-lg p-3 md:p-6">
      <h2 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">Your Campaigns</h2>
      {sortedCampaigns.length === 0 ? (
        <p className="text-center text-gray-500">No campaigns created yet.</p>
      ) : (
        <ul className="space-y-3">
          {sortedCampaigns.map((campaign) => (
            <li key={campaign.campaign_member_id}>
              <a href={`/campaigns/${campaign.id}`} className="flex items-center p-2 md:p-4 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors duration-200">
                <div className="relative w-[80px] md:w-20 h-[80px] md:h-20 mr-3 md:mr-4 flex-shrink-0 flex items-center justify-center">
                  {campaign.image_url ? (
                    <Image
                      src={campaign.image_url}
                      alt={campaign.campaign_name}
                      width={60}
                      height={60}
                      className="absolute rounded-full object-cover z-10 w-auto h-auto scale-90 bg-gray-200"
                      priority={false}
                      onError={handleImageError}
                    />
                  ) : (
                    <Image
                      src="https://res.cloudinary.com/dle0tkpbl/image/upload/v1735682275/IMG_6113_odsp7l.jpg"
                      alt="Default Campaign"
                      width={60}
                      height={60}
                      className="absolute rounded-full object-cover z-10 w-auto h-auto scale-90 bg-gray-200"
                      priority={false}
                    />
                  )}
                  <Image
                    src="https://res.cloudinary.com/dle0tkpbl/image/upload/v1747056786/cogwheel-gang-portrait_vbu4c5.webp"
                    alt=""
                    width={80}
                    height={80}
                    className="absolute z-20 scale-110"
                    priority
                    sizes="80px, 80px"
                  />
                </div>
                <div className="flex-grow min-w-0">
                  <h3 className="text-lg md:text-xl font-medium text-black truncate">{campaign.campaign_name}</h3>
                  <div className="text-sm md:text-base text-gray-600">
                    <span className="truncate block">{campaign.campaign_type}</span>
                    {campaign.user_gangs && campaign.user_gangs.length > 0 && (
                      <span>
                        {campaign.user_gangs.length === 1
                          ? 'Your Gang: '
                          : 'Your Gangs: '}
                        {campaign.user_gangs
                          .slice() // copy to avoid mutating original
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map(gang => gang.name)
                          .join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
} 