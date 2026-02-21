"use client"

import React, { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"

import { createClient } from "@/utils/supabase/client"
import { SubmitButton } from "./submit-button"
import { toast } from 'sonner';
import { gangListRank } from "@/utils/gangListRank"
import { gangVariantRank } from "@/utils/gangVariantRank"
import { createGang } from "@/app/actions/create-gang"
import { useRouter } from "next/navigation"
import { useSearchParams } from "next/navigation"
import Image from 'next/image'
import { LuChevronLeft, LuChevronRight } from "react-icons/lu"
import { DefaultImageEntry, normaliseDefaultImageUrls } from '@/types/gang'

type Gang = {
  id: string;
  name: string;
  gang_type: string;
  gang_type_id: string;
  image_url: string;
  credits: number;
  reputation: number;
  meat: number | null;
  exploration_points: number | null;
  rating: number | null;
  created_at: string;
  last_updated: string;
};

type GangType = {
  gang_type_id: string;
  gang_type: string;
  alignment: string;
  image_url?: string;
  default_image_urls?: DefaultImageEntry[];
  affiliation: boolean;
  available_affiliations: Array<{
    id: string;
    name: string;
  }>;
  gang_origin_category_id?: string;
  available_origins: Array<{
    id: string;
    origin_name: string;
    category_name: string;
  }>;
};

type GangVariant = {
  id: string;
  variant: string;
};

interface CreateGangModalProps {
  onClose: () => void;
}

// Default image index to display (0 = Silhouette image, 1 = Gang image by Djidiouf)
const DEFAULT_IMAGE_INDEX = 1;

// Button component that opens the modal
export function CreateGangButton() {
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
        Create Gang
      </Button>

      {showModal && (
        <CreateGangModal
          onClose={handleClose}
        />
      )}
    </>
  );
}

// Modal component
export function CreateGangModal({ onClose }: CreateGangModalProps) {
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const [gangTypes, setGangTypes] = useState<GangType[]>([]);
  const [gangName, setGangName] = useState("")
  const [gangType, setGangType] = useState("")
  const [selectedAffiliation, setSelectedAffiliation] = useState("")
  const [selectedOrigin, setSelectedOrigin] = useState("")
  const [credits, setCredits] = useState("1000")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoadingGangTypes, setIsLoadingGangTypes] = useState(false);
  const [gangTypeImageArrays, setGangTypeImageArrays] = useState<Record<string, DefaultImageEntry[]>>({});
  
  // Gang variants state
  const [availableVariants, setAvailableVariants] = useState<GangVariant[]>([]);
  const [isLoadingVariants, setIsLoadingVariants] = useState(false);
  const [selectedVariants, setSelectedVariants] = useState<GangVariant[]>([]);
  const [showVariants, setShowVariants] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(DEFAULT_IMAGE_INDEX);

  useEffect(() => {
    const fetchGangTypes = async () => {
      if (gangTypes.length === 0 && !isLoadingGangTypes) {
        setIsLoadingGangTypes(true);
        try {
          const response = await fetch('/api/gang-types');
          if (!response.ok) {
            throw new Error('Failed to fetch gang types');
          }
          
          const gangTypesData = await response.json();
          
          // Filter out hidden gang types if needed
          const visibleGangTypes = gangTypesData.filter((type: GangType) => {
            // Add logic to filter hidden types if the API doesn't handle this
            return true; // For now, assume API handles filtering
          });
          
          const imageArrayMap: Record<string, DefaultImageEntry[]> = {};
          visibleGangTypes.forEach((type: GangType) => {
            const normalised = normaliseDefaultImageUrls(type.default_image_urls);
            if (normalised && normalised.length > 0) {
              imageArrayMap[type.gang_type_id] = normalised;
            } else if (type.image_url) {
              imageArrayMap[type.gang_type_id] = [{ url: type.image_url }];
            } else {
              imageArrayMap[type.gang_type_id] = [];
            }
          });
          setGangTypeImageArrays(imageArrayMap);
          setGangTypes(visibleGangTypes);
        } catch (err) {
          console.error('Error fetching gang types:', err);
          setError('Failed to load gang types. Please try again.');
        } finally {
          setIsLoadingGangTypes(false);
        }
      }
    };

    fetchGangTypes();
  }, []);

  // Fetch gang variants when modal opens
  useEffect(() => {
    const fetchVariants = async () => {
      if (availableVariants.length === 0 && !isLoadingVariants) {
        setIsLoadingVariants(true);
        try {
          const response = await fetch('/api/gang_variant_types');
          if (!response.ok) {
            throw new Error('Failed to fetch gang variants');
          }
          const variantsData = await response.json();
          setAvailableVariants(variantsData);
        } catch (err) {
          console.error('Error fetching gang variants:', err);
          // Don't show error toast for variants, just log it
        } finally {
          setIsLoadingVariants(false);
        }
      }
    };

    fetchVariants();
  }, []);

  // Clear affiliation and origin when gang type changes
  useEffect(() => {
    setSelectedAffiliation("");
    setSelectedOrigin("");
    
    // Reset image index to default if current index is out of bounds for the new gang type
    if (gangType) {
      const imageUrls = gangTypeImageArrays[gangType] || [];
      if (imageUrls.length > 0 && currentImageIndex >= imageUrls.length) {
        setCurrentImageIndex(DEFAULT_IMAGE_INDEX);
      }
    }
  }, [gangType, gangTypeImageArrays, currentImageIndex]);

  // Update credits when Wasteland variant is selected/deselected
  useEffect(() => {
    const wastelandVariant = selectedVariants.find(v => v.variant === 'Wasteland');
    if (wastelandVariant) {
      setCredits("1400");
    } else {
      // Only reset to 1000 if it was previously set to 1400 due to Wasteland
      if (credits === "1400") {
        setCredits("1000");
      }
    }
  }, [selectedVariants]);

  // Helper function to check if form is valid
  const isFormValid = () => {
    if (!gangName.trim() || !gangType || isLoading) {
      return false;
    }
    
    // Check if affiliation is required and selected
    const selectedGangType = gangTypes.find(type => type.gang_type_id === gangType);
    if (selectedGangType?.affiliation && !selectedAffiliation) {
      return false;
    }
    
    // Check if credits is a valid number
    const creditsNum = parseInt(credits);
    if (isNaN(creditsNum) || creditsNum < 0) {
      return false;
    }
    
    return true;
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        const activeElement = document.activeElement;
        
        // If we're in an input field and the form isn't valid, let the default behavior happen
        if ((activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA') 
            && !isFormValid()) {
          return;
        }
        
        event.preventDefault();
        // If form is valid, create the gang
        if (isFormValid()) {
          handleCreateGang();
        }
      } else if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, gangName, gangType, selectedAffiliation, credits, isLoading, gangTypes]);

  const handleCreateGang = async () => {
    if (gangName && gangType) {
      setIsLoading(true)
      setError(null)
      try {
        const selectedGangType = gangTypes.find(type => type.gang_type_id === gangType);
        if (!selectedGangType) {
          throw new Error('Invalid gang type selected');
        }

        console.log("Creating gang:", gangName);
        
        // Use the server action to create the gang
        const result = await createGang({
          name: gangName,
          gangTypeId: gangType,
          gangType: selectedGangType.gang_type,
          alignment: selectedGangType.alignment,
          gangAffiliationId: selectedAffiliation || null,
          gangOriginId: selectedOrigin || null,
          credits: parseInt(credits),
          gangVariants: selectedVariants.map(v => v.id),
          defaultGangImage: currentImageIndex
        });

        if (!result.success) {
          throw new Error(result.error || 'Failed to create gang');
        }

        console.log("Gang created successfully");

        // Reset form and close modal first for better UX
        setGangName("")
        setGangType("")
        setSelectedAffiliation("")
        setSelectedOrigin("")
        setCredits("1000")
        setSelectedVariants([])
        setShowVariants(false)
        onClose()
        
        // Check if we're currently on the gangs tab, if not redirect to it
        const currentTab = searchParams.get('tab');
        if (currentTab !== 'gangs') {
          router.push('/?tab=gangs');
        } else {
          // Trigger router refresh to update server state
          router.refresh();
        }
        
        toast.success("Success!", { description: `${gangName} has been created successfully.` });
      } catch (err) {
        console.error('Error creating gang:', err)
        setError('Failed to create gang. Please try again.')
        toast.error("Error", { description: "Failed to create gang. Please try again." });
      } finally {
        setIsLoading(false)
      }
    }
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    console.error('Failed to load image:', e.currentTarget.src);
    e.currentTarget.src = "https://res.cloudinary.com/dle0tkpbl/image/upload/v1732965431/default-gang_image.jpg";
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 dark:bg-neutral-700/50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={handleOverlayClick}
    >
      <div className="bg-card shadow-md rounded-lg p-4 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl md:text-2xl font-bold">Create a New Gang</h2>
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
            <label htmlFor="gang-type" className="block text-sm font-medium text-muted-foreground mb-1">
              Gang Type *
            </label>
            <select
              id="gang-type"
              value={gangType}
              onChange={(e) => setGangType(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Select gang type</option>
              {Object.entries(
                gangTypes
                  .sort((a, b) => {
                    const rankA = gangListRank[a.gang_type.toLowerCase()] ?? Infinity;
                    const rankB = gangListRank[b.gang_type.toLowerCase()] ?? Infinity;
                    return rankA - rankB;
                  })
                  .reduce((groups, type) => {
                    const rank = gangListRank[type.gang_type.toLowerCase()];
                    let category = "Misc."; // Default category if no clear separator

                    if (rank <= 9) category = "House Gangs";
                    else if (rank <= 19) category = "Enforcers";
                    else if (rank <= 29) category = "Cults";
                    else if (rank <= 39) category = "Others & Outsiders";
                    else if (rank <= 49) category = "Underhive Outcasts";

                    if (!groups[category]) groups[category] = [];
                    groups[category].push(type);
                    return groups;
                  }, {} as Record<string, GangType[]>)
              ).map(([category, types]) => (
                types.length > 0 ? (
                  <optgroup key={category} label={category}>
                    {types.map((type) => (
                      <option key={type.gang_type_id} value={type.gang_type_id}>
                        {type.gang_type}
                      </option>
                    ))}
                  </optgroup>
                ) : null
              ))}
            </select>
          </div>
          
          {/* Conditional Affiliation Dropdown - moved to be right after Gang Type */}
          {(() => {
            const selectedGangType = gangTypes.find(type => type.gang_type_id === gangType);
            return selectedGangType?.affiliation ? (
              <div>
                <label htmlFor="gang-affiliation" className="block text-sm font-medium text-muted-foreground mb-1">
                  Gang Affiliation *
                </label>
                <select
                  id="gang-affiliation"
                  value={selectedAffiliation}
                  onChange={(e) => setSelectedAffiliation(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-border focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select gang affiliation</option>
                  {selectedGangType.available_affiliations.map((affiliation) => (
                    <option key={affiliation.id} value={affiliation.id}>
                      {affiliation.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null;
          })()}

          {/* Conditional Gang Origin Dropdown */}
          {(() => {
            const selectedGangType = gangTypes.find(type => type.gang_type_id === gangType);
            return selectedGangType?.gang_origin_category_id && selectedGangType.available_origins?.length > 0 ? (
              <div>
                <label htmlFor="gang-origin" className="block text-sm font-medium text-muted-foreground mb-1">
                  {selectedGangType.available_origins[0]?.category_name || 'Gang Origin'}
                </label>
                <select
                  id="gang-origin"
                  value={selectedOrigin}
                  onChange={(e) => setSelectedOrigin(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-border focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">None</option>
                  {selectedGangType.available_origins
                    .sort((a, b) => a.origin_name.localeCompare(b.origin_name))
                    .map((origin) => (
                      <option key={origin.id} value={origin.id}>
                        {origin.origin_name}
                      </option>
                    ))}
                </select>
              </div>
            ) : null;
          })()}

          {/* Gang Variants Section */}
          <div className="mt-4">
            <div className="flex items-center space-x-2">
              <label htmlFor="variant-toggle" className="text-sm font-medium">
                Gang Variants
              </label>
              <Switch
                id="variant-toggle"
                checked={showVariants}
                onCheckedChange={setShowVariants}
              />
            </div>

            {showVariants && (
              <div className="grid grid-cols-2 gap-4 mt-2">
                {/* Unaffiliated variants */}
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground mb-1">Unaffiliated</h3>
                  <div className="flex flex-col gap-2">
                    {availableVariants
                      .filter(v => (gangVariantRank[v.variant.toLowerCase()] ?? Infinity) <= 9)
                      .sort((a, b) =>
                        (gangVariantRank[a.variant.toLowerCase()] ?? Infinity) -
                        (gangVariantRank[b.variant.toLowerCase()] ?? Infinity)
                      )
                      .map((variant, index, arr) => (
                        <React.Fragment key={variant.id}>
                          {/* Insert separator before 'skirmish' */}
                          {variant.variant.toLowerCase() === "skirmish" && (
                            <div className="border-t border-border" />
                          )}
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id={`variant-${variant.id}`}
                              checked={selectedVariants.some(v => v.id === variant.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedVariants(prev => [...prev, variant]);
                                } else {
                                  setSelectedVariants(prev => prev.filter(v => v.id !== variant.id));
                                }
                              }}
                            />
                            <label htmlFor={`variant-${variant.id}`} className="text-sm cursor-pointer">
                              {variant.variant}
                            </label>
                          </div>
                        </React.Fragment>
                      ))}
                  </div>
                </div>

                {/* Outlaw/Corrupted variants*/}
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground mb-1">Outlaw / Corrupted</h3>
                  <div className="flex flex-col gap-2">
                    {availableVariants
                      .filter(v => (gangVariantRank[v.variant.toLowerCase()] ?? -1) >= 10)
                      .sort((a, b) =>
                        (gangVariantRank[a.variant.toLowerCase()] ?? Infinity) -
                        (gangVariantRank[b.variant.toLowerCase()] ?? Infinity)
                      )
                      .map(variant => (
                        <div key={variant.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`variant-${variant.id}`}
                            checked={selectedVariants.some(v => v.id === variant.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedVariants(prev => [...prev, variant]);
                              } else {
                                setSelectedVariants(prev => prev.filter(v => v.id !== variant.id));
                              }
                            }}
                          />
                          <label htmlFor={`variant-${variant.id}`} className="text-sm cursor-pointer">
                            {variant.variant}
                          </label>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Starting Credits Input */}
          <div>
            <label htmlFor="gang-credits" className="block text-sm font-medium text-muted-foreground mb-1">
              Starting Credits
            </label>
            <Input
              id="gang-credits"
              type="number"
              min="0"
              placeholder="1000"
              value={credits}
              onChange={(e) => setCredits(e.target.value)}
            />
          </div>

          {/* Gang Image Display */}
          {gangType && (() => {
            const selectedGangType = gangTypes.find(type => type.gang_type_id === gangType);
            const imageEntries = gangTypeImageArrays[gangType] || [];
            const gangTypeName = selectedGangType?.gang_type || '';
            const currentEntry = imageEntries.length > 0 && currentImageIndex < imageEntries.length
              ? imageEntries[currentImageIndex]
              : null;
            const displayImageUrl = currentEntry?.url ?? null;
            const displayCredit = currentEntry?.credit;
            const hasMultipleImages = imageEntries.length > 1;
            
            const handlePreviousImage = () => {
              if (imageEntries.length > 0) {
                setCurrentImageIndex((prev) => (prev === 0 ? imageEntries.length - 1 : prev - 1));
              }
            };
            
            const handleNextImage = () => {
              if (imageEntries.length > 0) {
                setCurrentImageIndex((prev) => (prev === imageEntries.length - 1 ? 0 : prev + 1));
              }
            };
            
            return (
              <>
                <div className="flex justify-center my-4">
                  <div className="flex relative size-[200px] md:size-[250px] shrink-0 items-center justify-center">
                    {/* Left Arrow */}
                    {hasMultipleImages && (
                      <button
                        onClick={handlePreviousImage}
                        className="absolute -left-12 z-30 p-2 rounded-full bg-card/80 hover:bg-card border border-border shadow-md transition-colors"
                        aria-label="Previous gang image"
                      >
                        <LuChevronLeft className="w-5 h-5" />
                      </button>
                    )}
                    
                    {displayImageUrl ? (
                      <Image
                        src={displayImageUrl}
                        alt={gangTypeName}
                        width={180}
                        height={180}
                        className="size-[145px] md:size-[180px] absolute rounded-full object-cover mt-1 z-10"
                        priority={false}
                        quality={100}
                        onError={handleImageError}
                      />
                    ) : (
                      <div className="absolute size-[180px] rounded-full bg-secondary z-10 flex items-center justify-center">
                        {gangTypeName.charAt(0)}
                      </div>
                    )}
                    <div className="absolute z-20 size-[200px] md:size-[250px]">
                      <Image
                        src="https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/cogwheel-gang-portrait_vbu4c5.webp"
                        alt="Cogwheel"
                        width={250}
                        height={250}
                        className="absolute z-20"
                        priority
                        quality={100}
                      />
                    </div>
                    
                    {/* Right Arrow */}
                    {hasMultipleImages && (
                      <button
                        onClick={handleNextImage}
                        className="absolute -right-12 z-30 p-2 rounded-full bg-card/80 hover:bg-card border border-border shadow-md transition-colors"
                        aria-label="Next gang image"
                      >
                        <LuChevronRight className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
                {displayCredit ? (
                  <p className="text-xs italic text-center text-muted-foreground mt-1">
                    Illustration by{' '}
                    <a href={displayCredit.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                      {displayCredit.name}
                    </a>
                    {displayCredit.suffix && ` ${displayCredit.suffix}`}
                  </p>
                ) : (
                  <p className="text-xs mt-1">&nbsp;</p>
                )}
              </>
            );
          })()}
          <p className="text-xs text-center text-muted-foreground">You'll be able to upload a custom image once your gang is created.</p>

          {/* Gang Name Input */}
          <div>
            <label htmlFor="gang-name" className="block text-sm font-medium text-muted-foreground mb-1">
              Gang Name *
            </label>
            <Input
              id="gang-name"
              type="text"
              placeholder="Enter gang name"
              value={gangName}
              onChange={(e) => setGangName(e.target.value)}
            />
          </div>
          
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <SubmitButton 
            onClick={handleCreateGang} 
            className="w-full" 
            disabled={!isFormValid()}
            pendingText="Creating..."
          >
            Create Gang
          </SubmitButton>
        </div>
      </div>
    </div>
  )
} 