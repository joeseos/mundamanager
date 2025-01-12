"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useCampaigns } from '@/contexts/CampaignsContext'
import { createClient } from "@/utils/supabase/client"
import { toast } from "@/components/ui/use-toast"

interface CampaignType {
  id: string;
  campaign_type_name: string;
}

interface CreateCampaignProps {
  initialCampaignTypes: CampaignType[] | null;
}

export default function CreateCampaign({ initialCampaignTypes }: CreateCampaignProps) {
  const { refreshCampaigns } = useCampaigns();
  const [campaignName, setCampaignName] = useState("")
  const [campaignType, setCampaignType] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [campaignTypes, setCampaignTypes] = useState<CampaignType[]>(initialCampaignTypes || [])
  const supabase = createClient()

  const handleCreateCampaign = async () => {
    if (!campaignName || !campaignType) {
      setError('Campaign name and type are required')
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('User not authenticated')

      const { data, error: rpcError } = await supabase
        .rpc('create_campaign', {
          p_campaign_type_id: campaignType,
          p_campaign_name: campaignName,
          p_user_id: user.id
        })

      if (rpcError) throw rpcError

      console.log('Campaign created:', data)
      setCampaignName("")
      setCampaignType("")
      await refreshCampaigns()
    } catch (err) {
      console.error('Error creating campaign:', err)
      setError('Failed to create campaign. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="bg-white shadow-md rounded-lg p-4 md:p-6">
      <h2 className="text-2xl font-bold mb-4">Create a New Campaign</h2>
      <div className="space-y-4">
        <div>
          <label htmlFor="campaign-name" className="block text-sm font-medium text-gray-700 mb-1">
            Campaign Name
          </label>
          <Input
            id="campaign-name"
            type="text"
            placeholder="Enter campaign name"
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="campaign-type" className="block text-sm font-medium text-gray-700 mb-1">
            Campaign Type
          </label>
          <select
            id="campaign-type"
            value={campaignType}
            onChange={(e) => setCampaignType(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Select campaign type</option>
            {campaignTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.campaign_type_name}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <Button onClick={handleCreateCampaign} className="w-full" disabled={isLoading}>
          {isLoading ? 'Creating...' : 'Create Campaign'}
        </Button>
      </div>
    </div>
  )
} 