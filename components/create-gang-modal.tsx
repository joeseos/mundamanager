"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

import { createClient } from "@/utils/supabase/client"
import { SubmitButton } from "./submit-button"
import { useToast } from "@/components/ui/use-toast"
import { gangListRank } from "@/utils/gangListRank"
import { createGang } from "@/app/actions/create-gang"
import { useRouter } from "next/navigation"
import { useSearchParams } from "next/navigation"

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
};

interface CreateGangModalProps {
  onClose: () => void;
}

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
        Create New Gang
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
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [gangTypes, setGangTypes] = useState<GangType[]>([]);
  const [gangName, setGangName] = useState("")
  const [gangType, setGangType] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoadingGangTypes, setIsLoadingGangTypes] = useState(false);
  const [gangTypeImages, setGangTypeImages] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchGangTypes = async () => {
      if (gangTypes.length === 0 && !isLoadingGangTypes) {
        setIsLoadingGangTypes(true);
        try {
          const supabase = createClient();
          
          // Also fetch gang type images
          const { data: gangTypesData, error: gangTypesError } = await supabase
            .from('gang_types')
            .select('gang_type_id, gang_type, alignment, image_url')
            .eq('is_hidden', false)
            .order('gang_type');
          
          if (gangTypesError) {
            throw gangTypesError;
          }
          
          // Create a map of gang_type_id to image_url
          const imageMap: Record<string, string> = {};
          gangTypesData.forEach(type => {
            if (type.image_url) {
              imageMap[type.gang_type_id] = type.image_url;
            }
          });
          setGangTypeImages(imageMap);
          setGangTypes(gangTypesData);
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        const activeElement = document.activeElement;
        
        // If we're in an input field and the form isn't valid, let the default behavior happen
        if ((activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA') 
            && (!gangName.trim() || !gangType || isLoading)) {
          return;
        }
        
        event.preventDefault();
        // If form is valid, create the gang
        if (gangName.trim() && gangType && !isLoading) {
          handleCreateGang();
        }
      } else if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, gangName, gangType, isLoading]);

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
          alignment: selectedGangType.alignment
        });

        if (!result.success) {
          throw new Error(result.error || 'Failed to create gang');
        }

        console.log("Gang created successfully");

        // Reset form and close modal first for better UX
        setGangName("")
        setGangType("")
        onClose()
        
        // Check if we're currently on the gangs tab, if not redirect to it
        const currentTab = searchParams.get('tab');
        if (currentTab !== 'gangs') {
          router.push('/?tab=gangs');
        } else {
          // Trigger router refresh to update server state
          router.refresh();
        }

        toast({
          title: "Success!",
          description: `${gangName} has been created successfully.`,
        })
      } catch (err) {
        console.error('Error creating gang:', err)
        setError('Failed to create gang. Please try again.')
        toast({
          title: "Error",
          description: "Failed to create gang. Please try again.",
          variant: "destructive",
        })
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

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={handleOverlayClick}
    >
      <div className="bg-white shadow-md rounded-lg p-4 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl md:text-2xl font-bold">Create a New Gang</h2>
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
            <label htmlFor="gang-type" className="block text-sm font-medium text-gray-700 mb-1">
              Gang Type *
            </label>
            <select
              id="gang-type"
              value={gangType}
              onChange={(e) => setGangType(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
          <div>
            <label htmlFor="gang-name" className="block text-sm font-medium text-gray-700 mb-1">
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
            disabled={isLoading || !gangName.trim() || !gangType}
            pendingText="Creating..."
          >
            Create Gang
          </SubmitButton>
        </div>
      </div>
    </div>
  )
} 