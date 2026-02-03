"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { createCampaign } from "@/app/actions/create-campaign"
import { useToast } from "@/components/ui/use-toast"
import { useRouter, useSearchParams } from 'next/navigation'
import { SubmitButton } from "./submit-button"
import { tradingPostRank } from "@/utils/tradingPostRank"
import { campaignRank } from '@/utils/campaigns/campaignRank'
import { ImInfo } from "react-icons/im"
import { Tooltip } from 'react-tooltip'
import React from "react"

interface CampaignType {
  id: string;
  campaign_type_name: string;
  trading_posts?: string[] | null;
}

interface TradingPostType {
  id: string;
  trading_post_name: string;
}

interface CreateCampaignModalProps {
  onClose: () => void;
  initialCampaignTypes: CampaignType[] | null;
  initialTradingPostTypes: TradingPostType[] | null;
  userId?: string;
}

// Button component that opens the modal
export function CreateCampaignButton({ initialCampaignTypes, initialTradingPostTypes, userId }: { initialCampaignTypes: CampaignType[] | null; initialTradingPostTypes: TradingPostType[] | null; userId?: string }) {
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
          initialTradingPostTypes={initialTradingPostTypes}
          userId={userId}
        />
      )}
    </>
  );
}

// Modal component
export function CreateCampaignModal({ onClose, initialCampaignTypes, initialTradingPostTypes, userId }: CreateCampaignModalProps) {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [campaignName, setCampaignName] = useState("")
  const [campaignType, setCampaignType] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [campaignTypes, setCampaignTypes] = useState<CampaignType[]>(initialCampaignTypes || [])
  const [tradingPostTypes, setTradingPostTypes] = useState<TradingPostType[]>(initialTradingPostTypes || [])
  const [selectedTradingPosts, setSelectedTradingPosts] = useState<string[]>([])

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

  // Auto-select default trading posts when campaign type changes
  useEffect(() => {
    if (campaignType) {
      const selectedCampaignType = campaignTypes.find(type => type.id === campaignType);
      if (selectedCampaignType?.trading_posts && Array.isArray(selectedCampaignType.trading_posts)) {
        setSelectedTradingPosts(selectedCampaignType.trading_posts);
      } else {
        setSelectedTradingPosts([]);
      }
    } else {
      setSelectedTradingPosts([]);
    }
  }, [campaignType, campaignTypes]);

  const handleTradingPostToggle = (tradingPostId: string, enabled: boolean) => {
    setSelectedTradingPosts(prev => {
      if (enabled) {
        if (prev.includes(tradingPostId)) return prev;
        return [...prev, tradingPostId];
      }
      return prev.filter(id => id !== tradingPostId);
    });
  };

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
        trading_posts: selectedTradingPosts,
      })

      if (!result.success) {
        throw new Error(result.error || 'Failed to create campaign');
      }

      console.log('Campaign created:', result.data)
      
      // Reset form and close modal first for better UX
      setCampaignName("")
      setCampaignType("")
      setSelectedTradingPosts([])
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
      className="fixed inset-0 bg-black/50 dark:bg-neutral-700/50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={handleOverlayClick}
    >
      <div className="bg-card shadow-md rounded-lg p-4 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl md:text-2xl font-bold">Create a New Campaign</h2>
            <p className="text-sm text-muted-foreground">Fields marked with * are required.</p>
          </div>
          <button 
            onClick={onClose}
            className="text-muted-foreground hover:text-muted-foreground"
          >
            ×
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label htmlFor="campaign-type" className="block text-sm font-medium text-muted-foreground mb-1">
              Campaign Type *
            </label>
            <select
              id="campaign-type"
              value={campaignType}
              onChange={(e) => setCampaignType(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Select campaign type</option>
              {campaignTypes
                .sort((a, b) => {
                  const typeA = a.campaign_type_name.toLowerCase();
                  const typeB = b.campaign_type_name.toLowerCase();

                  const rankA = campaignRank[typeA] ?? Infinity;
                  const rankB = campaignRank[typeB] ?? Infinity;

                  if (rankA !== rankB) {
                    return rankA - rankB;
                  }

                  return a.campaign_type_name.localeCompare(b.campaign_type_name);
                })
                .map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.campaign_type_name}
                  </option>
                ))}
            </select>
          </div>

          {/* Trading Posts */}
          {tradingPostTypes.length > 0 && (
            <div className="space-y-2 text-sm font-medium mb-1">
              <label className="flex items-center justify-between text-sm font-medium">
                <div className="flex items-center space-x-2">
                  <span>Authorised Trading Posts</span>
                  <span
                    className="relative cursor-pointer text-muted-foreground hover:text-foreground"
                    data-tooltip-id="trading-posts-tooltip"
                    data-tooltip-html={
                      'Only selected Trading Posts are available for gangs taking part in this campaign when buying equipment. However, this does not prevent players to access the Unrestricted list options.'
                    }
                  >
                    <ImInfo />
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {selectedTradingPosts.length} selected
                </span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {tradingPostTypes
                  .sort((a, b) => {
                    const rankA = tradingPostRank[a.trading_post_name.toLowerCase()] ?? Infinity;
                    const rankB = tradingPostRank[b.trading_post_name.toLowerCase()] ?? Infinity;
                    return rankA - rankB;
                  })
                  .map((type, index, arr) => {
                    const currentRank = tradingPostRank[type.trading_post_name.toLowerCase()] ?? Infinity;
                    const prevRank = index > 0 
                      ? (tradingPostRank[arr[index - 1].trading_post_name.toLowerCase()] ?? Infinity)
                      : null;
                    
                    // Add divider between rank <= 2 and rank >= 11
                    const shouldAddDivider = prevRank !== null && prevRank <= 2 && currentRank >= 11;
                    
                    return (
                      <React.Fragment key={type.id}>
                        {shouldAddDivider && (
                          <div className="col-span-full border-t border-border" />
                        )}
                        <label 
                          htmlFor={`trading-post-${type.id}`} 
                          className="flex items-center space-x-2 cursor-pointer"
                        >
                          <Checkbox
                            id={`trading-post-${type.id}`}
                            checked={selectedTradingPosts.includes(type.id)}
                            onCheckedChange={(checked) => handleTradingPostToggle(type.id, checked === true)}
                          />
                          <span className="text-xs">{type.trading_post_name}</span>
                        </label>
                      </React.Fragment>
                    );
                  })}
              </div>
            </div>
          )}

          <div>
            <label htmlFor="campaign-name" className="block text-sm font-medium text-muted-foreground mb-1">
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
      <Tooltip
        id="trading-posts-tooltip"
        place="top"
        className="!bg-neutral-900 !text-white !text-xs !z-[2000]"
        delayHide={100}
        clickable={true}
        style={{
          padding: '6px',
          maxWidth: '20rem'
        }}
      />
    </div>
  )
}
