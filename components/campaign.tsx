"use client"

interface CampaignProps {
  id: string;
  campaign_name: string;
  campaign_type: string;
  created_at: string;
  updated_at: string | null;
}

export default function Campaign({
  id,
  campaign_name,
  campaign_type,
  created_at,
  updated_at
}: CampaignProps) {
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
    <div className="bg-white shadow-md rounded-lg p-4 md:p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">{campaign_name}</h1>
        <button
          className="bg-black text-white px-4 py-2 rounded-md hover:bg-gray-800 transition-colors"
        >
          Edit
        </button>
      </div>
      <h2 className="text-gray-600 text-lg mb-6">{campaign_type}</h2>
      
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Campaign Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-md">
          <div>
            <p className="text-gray-600">Type</p>
            <p className="font-medium">{campaign_type}</p>
          </div>
          <div>
            <p className="text-gray-600">Created</p>
            <p className="font-medium">
              {formatDate(created_at)}
            </p>
          </div>
          <div>
            <p className="text-gray-600">Updated</p>
            <p className="font-medium">
              {formatDate(updated_at)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
} 