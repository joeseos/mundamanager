"use client"

import React, { useState, useEffect, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Combobox } from "@/components/ui/combobox"

import { SubmitButton } from "./submit-button"
import { toast } from 'sonner';
import { getGangListRank } from "@/utils/gangListRank"
import { getGangSubtypeRank } from "@/utils/gangSubtypeRank"
import { gangVariantsFor, hasParentGangType } from "@/utils/gangTypeVariants"
import { createGang } from "@/app/actions/create-gang"
import { useRouter } from "next/navigation"
import { useSearchParams } from "next/navigation"
import { CreateGangPortraitPicker } from '@/components/gang/create-gang-portrait-picker'
import { useGangPortraits } from '@/hooks/use-gang-portraits'
import {
  catalogueSlotForGangType,
  defaultPortraitForSlot,
} from '@/utils/gang-portraits'
import { EditionToggle } from '@/components/home/edition-toggle'
import { useHomeEdition } from '@/hooks/use-home-edition'
import { sameEditionForDisplay } from '@/types/edition'
import { normaliseDefaultImageUrls, preferredDefaultGangImageIndex } from '@/types/gang'

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
  id: string;
  gang_type: string;
  alignment: string;
  image_url?: string;
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
  parent_gang_type_id?: string | null;
  default_image_urls?: unknown[] | null;
  is_custom?: boolean;
  edition_slug?: string | null;
};

type GangSubtype = {
  id: string;
  subtype: string;
  edition_slug?: string | null;
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
  const { editionSlug, setEditionSlug } = useHomeEdition();
  const [gangTypes, setGangTypes] = useState<GangType[]>([]);
  const [gangName, setGangName] = useState("")
  const [gangType, setGangType] = useState("")
  // Resolved catalog id used on create: null = Standard (root), string = variant child id.
  const [gangVariantId, setGangVariantId] = useState<string | null>(null)
  const [selectedAffiliation, setSelectedAffiliation] = useState("")
  const [selectedOrigin, setSelectedOrigin] = useState("")
  const [credits, setCredits] = useState("1000")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoadingGangTypes, setIsLoadingGangTypes] = useState(false);
  const { portraits, status: portraitsStatus, retry: retryPortraits } = useGangPortraits();
  
  // Gang subtypes state
  const [availableSubtypes, setAvailableSubtypes] = useState<GangSubtype[]>([]);
  const [isLoadingSubtypes, setIsLoadingSubtypes] = useState(false);
  const [selectedSubtypes, setSelectedSubtypes] = useState<GangSubtype[]>([]);
  const [showSubtypes, setShowSubtypes] = useState(false);

  const editionGangTypes = useMemo(
    () => gangTypes.filter(type => sameEditionForDisplay(type.edition_slug, editionSlug)),
    [gangTypes, editionSlug]
  );

  const editionSubtypes = useMemo(
    () => availableSubtypes.filter(subtype => sameEditionForDisplay(subtype.edition_slug, editionSlug)),
    [availableSubtypes, editionSlug]
  );

  const gangSubtypeRank = useMemo(() => getGangSubtypeRank(editionSlug), [editionSlug]);

  const selectedRootGangType = useMemo(
    () => editionGangTypes.find(type => type.id === gangType),
    [editionGangTypes, gangType]
  );

  const gangVariantOptions = useMemo(
    () => (selectedRootGangType ? gangVariantsFor(selectedRootGangType, editionGangTypes) : []),
    [selectedRootGangType, editionGangTypes]
  );

  // null gangVariantId means Standard: resolve to the root gang type id.
  const resolvedGangTypeId = gangVariantId ?? gangType;

  const resolvedGangType = useMemo(
    () => gangTypes.find(type => type.id === resolvedGangTypeId),
    [gangTypes, resolvedGangTypeId]
  );

  const catalogueSlot = useMemo(() => {
    if (!resolvedGangType) return null;
    const parent = resolvedGangType.parent_gang_type_id
      ? gangTypes.find(type => type.id === resolvedGangType.parent_gang_type_id) ?? null
      : null;
    return catalogueSlotForGangType(resolvedGangType, parent?.gang_type ?? null);
  }, [resolvedGangType, gangTypes]);

  const defaultPortraitId = useMemo(
    () => defaultPortraitForSlot(portraits, catalogueSlot)?.id ?? null,
    [portraits, catalogueSlot]
  );

  const [selectedPortraitId, setSelectedPortraitId] = useState<string | null>(null);
  const [pinnedGangTypeId, setPinnedGangTypeId] = useState(resolvedGangTypeId);
  if (resolvedGangTypeId !== pinnedGangTypeId) {
    setPinnedGangTypeId(resolvedGangTypeId);
    setSelectedPortraitId(defaultPortraitId);
  } else if (
    selectedPortraitId === null &&
    defaultPortraitId &&
    !resolvedGangType?.is_custom
  ) {
    setSelectedPortraitId(defaultPortraitId);
  }

  const gangTypeOptions = useMemo(() => {
    const gangListRank = getGangListRank(editionSlug);
    const options: Array<{
      value: string;
      label: string | React.ReactNode;
      displayValue?: string;
      disabled?: boolean;
    }> = [];

    const categoryOrder = [
      "House Gangs",
      "Enforcers",
      "Cults",
      "Others & Outsiders",
      "Underhive Outcasts",
      "Misc.",
    ];

    const systemGroups = editionGangTypes
      .filter(t => !t.is_custom && !hasParentGangType(t))
      .sort((a, b) => {
        const rankA = gangListRank[a.gang_type.toLowerCase()] ?? Infinity;
        const rankB = gangListRank[b.gang_type.toLowerCase()] ?? Infinity;
        return rankA - rankB;
      })
      .reduce((groups, type) => {
        const rank = gangListRank[type.gang_type.toLowerCase()] ?? Infinity;
        let category = "Misc.";

        if (rank <= 9) category = "House Gangs";
        else if (rank <= 19) category = "Enforcers";
        else if (rank <= 29) category = "Cults";
        else if (rank <= 39) category = "Others & Outsiders";
        else if (rank <= 49) category = "Underhive Outcasts";

        if (!groups[category]) groups[category] = [];
        groups[category].push(type);
        return groups;
      }, {} as Record<string, GangType[]>);

    for (const category of categoryOrder) {
      const types = systemGroups[category];
      if (!types?.length) continue;
      options.push({
        value: `header-${category}`,
        label: <span className="font-bold">{category}</span>,
        displayValue: category,
        disabled: true,
      });
      for (const type of types) {
        options.push({
          value: type.id,
          label: <span className="ml-3">{type.gang_type}</span>,
          displayValue: type.gang_type,
        });
      }
    }

    const customTypes = editionGangTypes
      .filter(t => t.is_custom)
      .sort((a, b) => a.gang_type.localeCompare(b.gang_type));

    if (customTypes.length > 0) {
      options.push({
        value: "header-Custom",
        label: <span className="font-bold">Custom</span>,
        displayValue: "Custom",
        disabled: true,
      });
      for (const type of customTypes) {
        options.push({
          value: type.id,
          label: <span className="ml-3">{type.gang_type}</span>,
          displayValue: type.gang_type,
        });
      }
    }

    return options;
  }, [editionGangTypes, editionSlug]);

  // Clear selections that no longer belong to the active edition
  const [prevEditionSlug, setPrevEditionSlug] = useState(editionSlug);
  if (editionSlug !== prevEditionSlug) {
    setPrevEditionSlug(editionSlug);
    if (gangType && !editionGangTypes.some(type => type.id === gangType)) {
      setGangType("");
      setGangVariantId(null);
      setSelectedAffiliation("");
      setSelectedOrigin("");
    }
    setSelectedSubtypes(prev =>
      prev.filter(subtype => sameEditionForDisplay(subtype.edition_slug, editionSlug))
    );
    // Edition with no subtype types: hide the switch and clear the toggle
    if (!availableSubtypes.some(subtype => sameEditionForDisplay(subtype.edition_slug, editionSlug))) {
      setShowSubtypes(false);
    }
  }

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
  }, [gangTypes.length, isLoadingGangTypes]);

  // Fetch gang subtypes when modal opens
  useEffect(() => {
    const fetchSubtypes = async () => {
      if (availableSubtypes.length === 0 && !isLoadingSubtypes) {
        setIsLoadingSubtypes(true);
        try {
          const response = await fetch('/api/gang-subtype-types');
          if (!response.ok) {
            throw new Error('Failed to fetch gang subtypes');
          }
          const subtypesData = await response.json();
          setAvailableSubtypes(subtypesData);
        } catch (err) {
          console.error('Error fetching gang subtypes:', err);
          // Don't show error toast for subtypes, just log it
        } finally {
          setIsLoadingSubtypes(false);
        }
      }
    };

    fetchSubtypes();
  }, [availableSubtypes.length, isLoadingSubtypes]);

  // Clear affiliation, origin, and gang variant when gang type (root) changes
  const [prevGangType, setPrevGangType] = useState(gangType);
  if (gangType !== prevGangType) {
    setPrevGangType(gangType);
    setSelectedAffiliation("");
    setSelectedOrigin("");
    setGangVariantId(null);
  }

  // Update credits when Wasteland subtype is selected/deselected
  const [prevSelectedSubtypes, setPrevSelectedSubtypes] = useState(selectedSubtypes);
  if (selectedSubtypes !== prevSelectedSubtypes) {
    setPrevSelectedSubtypes(selectedSubtypes);
    const wastelandSubtype = selectedSubtypes.find(v => v.subtype === 'Wasteland');
    if (wastelandSubtype) {
      setCredits("1400");
    } else {
      if (credits === "1400") {
        setCredits("1000");
      }
    }
  }

  // Helper function to check if form is valid
  const isFormValid = () => {
    if (!gangName.trim() || !gangType || isLoading) {
      return false;
    }
    
    // Check if affiliation is required and selected
    if (resolvedGangType?.affiliation && !selectedAffiliation) {
      return false;
    }

    // Official types need a loaded catalogue. A failed fetch must not create a gang with no image.
    if (catalogueSlot && portraitsStatus !== 'ready') {
      return false;
    }
    
    // Check if credits is a valid number
    const creditsNum = parseInt(credits);
    if (isNaN(creditsNum) || creditsNum < 0) {
      return false;
    }
    
    return true;
  };

  const handleCreateGang = async () => {
    if (gangName && gangType) {
      setIsLoading(true)
      setError(null)
      try {
        const selectedGangType = resolvedGangType;
        if (!selectedGangType) {
          throw new Error('Invalid gang type selected');
        }

        console.log("Creating gang:", gangName);
        
        // Use the server action to create the gang
        const result = await createGang({
          name: gangName,
          gangTypeId: selectedGangType.is_custom ? '' : selectedGangType.id,
          customGangTypeId: selectedGangType.is_custom ? selectedGangType.id : undefined,
          gangType: selectedGangType.gang_type,
          alignment: selectedGangType.alignment,
          gangAffiliationId: selectedAffiliation || null,
          gangOriginId: selectedOrigin || null,
          credits: parseInt(credits),
          gangSubtypes: selectedSubtypes.map(v => v.id),
          gangPortraitId: selectedPortraitId,
          defaultGangImage: selectedPortraitId
            ? null
            : preferredDefaultGangImageIndex(
                normaliseDefaultImageUrls(selectedGangType.default_image_urls)
              ),
        });

        if (!result.success) {
          throw new Error(result.error || 'Failed to create gang');
        }

        console.log("Gang created successfully");

        // Reset form and close modal first for better UX
        setGangName("")
        setGangType("")
        setGangVariantId(null)
        setSelectedAffiliation("")
        setSelectedOrigin("")
        setCredits("1000")
        setSelectedSubtypes([])
        setShowSubtypes(false)
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

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      const activeElement = document.activeElement;
      const target = event.target as HTMLElement | null;
      // Gallery buttons are portaled outside this modal. Enter must activate them, not create the gang.
      if (target?.closest('button, [data-portrait-picker]')) {
        return;
      }

      if ((activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA')
          && !isFormValid()) {
        return;
      }

      event.preventDefault();
      if (isFormValid()) {
        handleCreateGang();
      }
    } else if (event.key === 'Escape') {
      onClose();
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 dark:bg-neutral-700/50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={handleOverlayClick}
      onKeyDown={handleKeyDown}
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
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Edition *
            </label>
            <EditionToggle value={editionSlug} onChange={setEditionSlug} />
          </div>
          <div>
            <label htmlFor="gang-type" className="block text-sm font-medium text-muted-foreground mb-1">
              Gang Type *
            </label>
            <Combobox
              id="gang-type"
              options={gangTypeOptions}
              value={gangType}
              onValueChange={setGangType}
              placeholder="Select gang type"
              disabled={isLoadingGangTypes}
            />
          </div>

          {gangVariantOptions.length > 0 && (
            <div>
              <span className="block text-sm font-medium text-muted-foreground mb-1">
                Gang Variant
              </span>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="gang-variant-standard"
                      name="gang-variant"
                      checked={gangVariantId === null}
                      onChange={() => setGangVariantId(null)}
                      className="h-4 w-4 text-foreground focus:ring-black border-border"
                    />
                    <label htmlFor="gang-variant-standard" className="text-sm cursor-pointer">
                      Standard
                    </label>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {gangVariantOptions.map((variant) => (
                    <div key={variant.id} className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id={`gang-variant-${variant.id}`}
                        name="gang-variant"
                        checked={gangVariantId === variant.id}
                        onChange={() => setGangVariantId(variant.id)}
                        className="h-4 w-4 text-foreground focus:ring-black border-border"
                      />
                      <label
                        htmlFor={`gang-variant-${variant.id}`}
                        className="text-sm cursor-pointer"
                      >
                        {variant.gang_type}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          {/* Conditional Affiliation Dropdown - moved to be right after Gang Type */}
          {resolvedGangType?.affiliation ? (
            <div>
              <label htmlFor="gang-affiliation" className="block text-sm font-medium text-muted-foreground mb-1">
                Gang Affiliation *
              </label>
              <select
                id="gang-affiliation"
                value={selectedAffiliation}
                onChange={(e) => setSelectedAffiliation(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-border focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select gang affiliation</option>
                {resolvedGangType.available_affiliations.map((affiliation) => (
                  <option key={affiliation.id} value={affiliation.id}>
                    {affiliation.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {/* Conditional Gang Origin Dropdown */}
          {resolvedGangType?.gang_origin_category_id && resolvedGangType.available_origins?.length > 0 ? (
            <div>
              <label htmlFor="gang-origin" className="block text-sm font-medium text-muted-foreground mb-1">
                {resolvedGangType.available_origins[0]?.category_name || 'Gang Origin'}
              </label>
              <select
                id="gang-origin"
                value={selectedOrigin}
                onChange={(e) => setSelectedOrigin(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-border focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">None</option>
                {resolvedGangType.available_origins
                  .sort((a, b) => a.origin_name.localeCompare(b.origin_name))
                  .map((origin) => (
                    <option key={origin.id} value={origin.id}>
                      {origin.origin_name}
                    </option>
                  ))}
              </select>
            </div>
          ) : null}

          {/* Gang Subtypes Section — only when the edition has subtype types */}
          {editionSubtypes.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center space-x-2">
                <label htmlFor="subtype-toggle" className="text-sm font-medium text-muted-foreground">
                  Gang Subtypes
                </label>
                <Switch
                  id="subtype-toggle"
                  checked={showSubtypes}
                  onCheckedChange={setShowSubtypes}
                />
              </div>

              {showSubtypes && (
                <div className="grid grid-cols-2 gap-4 mt-2">
                  {/* Unaffiliated subtypes */}
                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground mb-1">Unaffiliated</h3>
                    <div className="flex flex-col gap-2">
                      {editionSubtypes
                        .filter(v => (gangSubtypeRank[v.subtype.toLowerCase()] ?? Infinity) <= 9)
                        .sort((a, b) =>
                          (gangSubtypeRank[a.subtype.toLowerCase()] ?? Infinity) -
                          (gangSubtypeRank[b.subtype.toLowerCase()] ?? Infinity)
                        )
                        .map((subtype) => (
                          <React.Fragment key={subtype.id}>
                            {/* Insert separator before 'skirmish' */}
                            {subtype.subtype.toLowerCase() === "skirmish" && (
                              <div className="border-t border-border" />
                            )}
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id={`subtype-${subtype.id}`}
                                checked={selectedSubtypes.some(v => v.id === subtype.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedSubtypes(prev => [...prev, subtype]);
                                  } else {
                                    setSelectedSubtypes(prev => prev.filter(v => v.id !== subtype.id));
                                  }
                                }}
                              />
                              <label htmlFor={`subtype-${subtype.id}`} className="text-sm cursor-pointer">
                                {subtype.subtype}
                              </label>
                            </div>
                          </React.Fragment>
                        ))}
                    </div>
                  </div>

                  {/* Outlaw/Corrupted subtypes*/}
                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground mb-1">Outlaw / Corrupted</h3>
                    <div className="flex flex-col gap-2">
                      {editionSubtypes
                        .filter(v => (gangSubtypeRank[v.subtype.toLowerCase()] ?? -1) >= 10)
                        .sort((a, b) =>
                          (gangSubtypeRank[a.subtype.toLowerCase()] ?? Infinity) -
                          (gangSubtypeRank[b.subtype.toLowerCase()] ?? Infinity)
                        )
                        .map(subtype => (
                          <div key={subtype.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`subtype-${subtype.id}`}
                              checked={selectedSubtypes.some(v => v.id === subtype.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedSubtypes(prev => [...prev, subtype]);
                                } else {
                                  setSelectedSubtypes(prev => prev.filter(v => v.id !== subtype.id));
                                }
                              }}
                            />
                            <label htmlFor={`subtype-${subtype.id}`} className="text-sm cursor-pointer">
                              {subtype.subtype}
                            </label>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

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

          {gangType && (
            <CreateGangPortraitPicker
              portraits={portraits}
              catalogueSlot={catalogueSlot}
              selectedPortraitId={selectedPortraitId}
              gangTypeName={resolvedGangType?.gang_type || ''}
              onSelect={setSelectedPortraitId}
              catalogueLoadFailed={Boolean(catalogueSlot) && portraitsStatus === 'error'}
              onRetryCatalogue={retryPortraits}
            />
          )}
          <p className="text-xs text-center text-muted-foreground">You&apos;ll be able to upload a custom image once your gang is created.</p>

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