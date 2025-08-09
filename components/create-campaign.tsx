"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { createCampaign } from "@/app/actions/create-campaign"
import { useToast } from "@/components/ui/use-toast"
import { useRouter, useSearchParams } from 'next/navigation'
import { SubmitButton } from "./submit-button"

interface CampaignType {
  id: string;
  campaign_type_name: string;
}

interface CreateCampaignModalProps {
  onClose: () => void;
  initialCampaignTypes: CampaignType[] | null;
  userId?: string;
}

// Button component that opens the modal
export function CreateCampaignButton({ initialCampaignTypes, userId }: { initialCampaignTypes: CampaignType[] | null; userId?: string }) {
  const [showModal, setShowModal] = useState(false);

  const handleClose = () => {
    setShowModal(false);
  };

  return (
    <>
      <Button 
        onClick={() => setShowModal(true)}
        className="w-full"
      >
        Create Campaign
      </Button>

      {showModal && (
        <CreateCampaignModal
          onClose={handleClose}
          initialCampaignTypes={initialCampaignTypes}
          userId={userId}
        />
      )}
    </>
  );
}

// Modal component
export function CreateCampaignModal({ onClose, initialCampaignTypes, userId }: CreateCampaignModalProps) {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [campaignName, setCampaignName] = useState("")
  const [campaignType, setCampaignType] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [campaignTypes, setCampaignTypes] = useState<CampaignType[]>(initialCampaignTypes || [])

  const isFormValid = campaignName.trim() !== "" && campaignType !== ""

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        const activeElement = document.activeElement;
        
        // If we're in an input field and the form isn't valid, let the default behavior happen
        if ((activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA') 
            && (!campaignName.trim() || !campaignType || isLoading)) {
          return;
        }
        
        event.preventDefault();
        // If form is valid, create the campaign
        if (campaignName.trim() && campaignType && !isLoading) {
          handleCreateCampaign();
        }
      } else if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, campaignName, campaignType, isLoading]);

  const handleCreateCampaign = async () => {
    if (!campaignName || !campaignType) {
      setError('Campaign name and type are required')
      return
    }

    if (!userId) {
      setError('Authentication required')
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const result = await createCampaign({
        name: campaignName.trimEnd(),
        campaignTypeId: campaignType,
      })

      if (!result.success) {
        throw new Error(result.error || 'Failed to create campaign');
      }

      console.log('Campaign created:', result.data)
      
      // Reset form and close modal first for better UX
      setCampaignName("")
      setCampaignType("")
      onClose()
      
      // Check if we're currently on the campaigns tab, if not redirect to it
      const currentTab = searchParams.get('tab');
      if (currentTab !== 'campaigns') {
        router.push('/?tab=campaigns');
      } else {
        // Trigger router refresh to update server state
        router.refresh();
      }
      
      toast({
        title: "Success!",
        description: `${campaignName} has been created successfully.`,
      })
    } catch (err) {
      console.error('Error creating campaign:', err)
      setError('Failed to create campaign. Please try again.')
      toast({
        title: "Error",
        description: "Failed to create campaign. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={handleOverlayClick}
    >
      <div className="bg-white shadow-md rounded-lg p-4 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl md:text-2xl font-bold">Create a New Campaign</h2>
            <p className="text-sm text-gray-500">Fields marked with * are required.</p>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ×
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label htmlFor="campaign-type" className="block text-sm font-medium text-gray-700 mb-1">
              Campaign Type *
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
          <div>
            <label htmlFor="campaign-name" className="block text-sm font-medium text-gray-700 mb-1">
              Campaign Name *
            </label>
            <Input
              id="campaign-name"
              type="text"
              placeholder="Enter campaign name"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <SubmitButton 
            onClick={handleCreateCampaign} 
            className="w-full" 
            disabled={isLoading || !isFormValid}
            pendingText="Creating..."
          >
            Create Campaign
          </SubmitButton>
        </div>
      </div>
    </div>
  )
}

// Keep the original component for backward compatibility
export default function CreateCampaign({ initialCampaignTypes, userId }: { initialCampaignTypes: CampaignType[] | null; userId?: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const [campaignName, setCampaignName] = useState("")
  const [campaignType, setCampaignType] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [campaignTypes, setCampaignTypes] = useState<CampaignType[]>(initialCampaignTypes || [])

  const isFormValid = campaignName.trim() !== "" && campaignType !== ""

  const handleCreateCampaign = async () => {
    if (!campaignName || !campaignType) {
      setError('Campaign name and type are required')
      return
    }

    if (!userId) {
      setError('Authentication required')
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const result = await createCampaign({
        name: campaignName,
        campaignTypeId: campaignType,
      })

      if (!result.success) {
        throw new Error(result.error || 'Failed to create campaign');
      }

      console.log('Campaign created:', result.data)
      setCampaignName("")
      setCampaignType("")
      
      // Trigger router refresh to update server state
      router.refresh();
      
      toast({
        title: "Success!",
        description: `${campaignName} has been created successfully.`,
      })
    } catch (err) {
      console.error('Error creating campaign:', err)
      setError('Failed to create campaign. Please try again.')
      toast({
        title: "Error",
        description: "Failed to create campaign. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="bg-white shadow-md rounded-lg p-4">
      <h2 className="text-xl md:text-2xl font-bold mb-4">Create a New Campaign</h2>
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
        <Button 
          onClick={handleCreateCampaign} 
          className="w-full" 
          disabled={isLoading || !isFormValid}
        >
          {isLoading ? 'Creating...' : 'Create Campaign'}
        </Button>
      </div>
    </div>
  )
} 