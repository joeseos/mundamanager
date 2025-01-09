"use client"

interface CampaignProps {
  id: string;
  campaign_name: string;
  campaign_type: string;
  campaign_type_id: string;
  created_at: string;
  updated_at?: string | null;
}

export default function Campaign({
  campaign_name,
  campaign_type,
  created_at,
  updated_at
}: CampaignProps) {
  // Format date consistently
  const formatDate = (date: string | null | undefined) => {
    if (!date) return 'Not yet updated';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  return (
    <div className="bg-white shadow-md rounded-lg p-4 md:p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">{campaign_name}</h1>
          <p className="text-gray-600">{campaign_type}</p>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-2">Campaign Details</h2>
          <div className="bg-gray-50 p-4 rounded-md">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600">Type</p>
                <p className="font-medium">{campaign_type}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Created</p>
                <p className="font-medium">{formatDate(created_at)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Updated</p>
                <p className="font-medium">{formatDate(updated_at)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 