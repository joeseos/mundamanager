'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Input } from '../ui/input';
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import Modal from '@/components/ui/modal';
import DeleteGangButton from "./delete-gang-button";
import { useToast } from "@/components/ui/use-toast";
import { HexColorPicker } from "react-colorful";
import { allianceRank } from "@/utils/allianceRank";
import { gangVariantRank } from "@/utils/gangVariantRank";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ResourceUpdate } from '@/types/gang';

interface GangUpdates {
  name?: string;
  credits?: number;
  credits_operation?: 'add' | 'subtract';
  alignment?: string;
  alliance_id?: string | null;
  alliance_name?: string;
  reputation?: number;
  reputation_operation?: 'add' | 'subtract';
  // Legacy resource fields - kept for backward compatibility
  meat?: number;
  meat_operation?: 'add' | 'subtract';
  scavenging_rolls?: number;
  scavenging_rolls_operation?: 'add' | 'subtract';
  exploration_points?: number;
  exploration_points_operation?: 'add' | 'subtract';
  power?: number;
  power_operation?: 'add' | 'subtract';
  sustenance?: number;
  sustenance_operation?: 'add' | 'subtract';
  salvage?: number;
  salvage_operation?: 'add' | 'subtract';
  gang_variants?: string[];
  gang_colour?: string;
  gang_affiliation_id?: string | null;
  gang_affiliation_name?: string;
  gang_origin_id?: string | null;
  gang_origin_name?: string;
  hidden?: boolean;
  campaign_allegiance_id?: string | null;
  campaign_allegiance_is_custom?: boolean;
  campaign_id?: string;
  // New resource updates from normalised tables
  resourceUpdates?: ResourceUpdate[];
}

interface CampaignResource {
  resource_id: string;
  resource_name: string;
  quantity: number;
  is_custom: boolean;
}

interface Campaign {
  campaign_id: string;
  campaign_gang_id: string;
  // Legacy flags - kept for backward compatibility
  has_meat: boolean;
  has_scavenging_rolls: boolean;
  has_exploration_points: boolean;
  has_power: boolean;
  has_sustenance: boolean;
  has_salvage: boolean;
  allegiance?: {
    id: string;
    name: string;
  } | null;
  // Normalised resources
  resources?: CampaignResource[];
}

interface GangEditModalProps {
  // Modal control
  isOpen: boolean;
  onClose: () => void;

  // Gang data
  gangId: string;
  gangName: string;
  credits: number;
  reputation: number;
  // Legacy resource props - kept for backward compatibility
  meat: number;
  scavengingRolls: number;
  explorationPoints: number;
  power: number;
  sustenance: number;
  salvage: number;
  alignment: string;
  allianceId: string | null;
  allianceName: string;
  gangColour: string;
  gangVariants: Array<{id: string, variant: string}>;
  availableVariants: Array<{id: string, variant: string}>;
  gangAffiliationId: string | null;
  gangAffiliationName: string;
  gangTypeHasAffiliation: boolean;
  gangOriginId: string | null;
  gangOriginName: string;
  gangOriginCategoryName: string;
  gangTypeHasOrigin: boolean;
  hidden: boolean;

  // Campaign features (includes dynamic resources)
  campaigns?: Campaign[];

  // Permissions - controls Delete button visibility
  isGangOwner?: boolean;
  isAdmin?: boolean;

  // Callbacks
  onSave: (updates: GangUpdates) => Promise<boolean>;
}

/**
 * Gang Edit Modal Component
 * 
 * Extracted from gang.tsx to improve component maintainability.
 * Handles all gang editing functionality including:
 * - Basic gang info (name, credits, reputation)
 * - Alignment and alliance management
 * - Gang variants selection
 * - Colour picker
 * - Campaign-specific resources (meat, scavenging rolls, exploration points)
 */
export default function GangEditModal({
  isOpen,
  onClose,
  gangId,
  gangName,
  credits,
  reputation,
  meat,
  scavengingRolls,
  explorationPoints,
  power,
  sustenance,
  salvage,
  alignment,
  allianceId,
  allianceName,
  gangColour,
  gangVariants,
  availableVariants,
  gangAffiliationId,
  gangAffiliationName,
  gangTypeHasAffiliation,
  gangOriginId,
  gangOriginName,
  gangOriginCategoryName,
  gangTypeHasOrigin,
  hidden,
  campaigns,
  isGangOwner = false,
  isAdmin = false,
  onSave
}: GangEditModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Get campaign ID and current allegiance if gang is in a campaign
  const campaignId = campaigns?.[0]?.campaign_id;
  const currentAllegianceFromCampaign = campaigns?.[0]?.allegiance;
  const effectiveCurrentAllegianceId = currentAllegianceFromCampaign?.id || null;
  
  // Store initial values in ref (doesn't trigger re-renders)
  const initialValuesRef = useRef({
    name: gangName,
    alignment: alignment,
    allianceId: allianceId || '',
    gangColour: gangColour,
    gangIsVariant: gangVariants.length > 0,
    gangVariants: gangVariants,
    gangAffiliationId: gangAffiliationId || '',
    gangOriginId: gangOriginId || '',
    hidden: hidden,
    campaignAllegianceId: effectiveCurrentAllegianceId
  });

  // Single form state object instead of multiple individual states
  const [formState, setFormState] = useState({
    name: gangName,
    credits: '',  // delta inputs start empty
    reputation: '',
    // Legacy resource deltas - kept for backward compatibility
    meat: '',
    scavengingRolls: '',
    explorationPoints: '',
    power: '',
    sustenance: '',
    salvage: '',
    alignment: alignment,
    allianceId: allianceId || '',
    gangColour: gangColour,
    gangIsVariant: gangVariants.length > 0,
    gangVariants: gangVariants,
    gangAffiliationId: gangAffiliationId || '',
    gangOriginId: gangOriginId || '',
    hidden: hidden,
    campaignAllegianceId: effectiveCurrentAllegianceId
  });
  
  // Dynamic resource deltas state - tracks changes for each normalised resource
  // Key: resource_id, Value: delta string (for input field)
  const [resourceDeltas, setResourceDeltas] = useState<Record<string, string>>({});

  // Alliance management state
  const [allianceList, setAllianceList] = useState<Array<{id: string, alliance_name: string, strong_alliance: string}>>([]);
  const [allianceListLoaded, setAllianceListLoaded] = useState(false);
  
  // Gang affiliation management state
  const [affiliationList, setAffiliationList] = useState<Array<{id: string, name: string}>>([]);
  const [affiliationListLoaded, setAffiliationListLoaded] = useState(false);

  // Gang origin management state
  const [originList, setOriginList] = useState<Array<{id: string, origin_name: string, category_name: string}>>([]);
  const [originListLoaded, setOriginListLoaded] = useState(false);

  // Colour picker modal state
  const [showColourPickerModal, setShowColourPickerModal] = useState(false);

  // Fetch allegiances using TanStack Query (shares cache with campaign-members-table)
  // Lazy load: only fetch when user focuses on the field
  const { data: availableAllegiances = [], isLoading: isLoadingAllegiances, refetch: refetchAllegiances } = useQuery({
    queryKey: ['campaign-allegiances', campaignId],
    queryFn: async () => {
      if (!campaignId) return [];
      const response = await fetch(`/api/campaigns/${campaignId}/allegiances`);
      if (!response.ok) {
        throw new Error('Failed to fetch allegiances');
      }
      return response.json() as Promise<Array<{ id: string; allegiance_name: string; is_custom: boolean }>>;
    },
    enabled: false, // Disabled by default - will be fetched on focus
    staleTime: 5 * 60 * 1000, // 5 minutes - data is considered fresh for 5 minutes
    gcTime: 10 * 60 * 1000,  // 10 minutes - cache is kept for 10 minutes
  });
  
  // Initialize form data when modal opens or when allegiance changes
  useEffect(() => {
    if (isOpen) {
      // Update ref with current props
      initialValuesRef.current = {
        name: gangName,
        alignment: alignment,
        allianceId: allianceId || '',
        gangColour: gangColour,
        gangIsVariant: gangVariants.length > 0,
        gangVariants: gangVariants,
        gangAffiliationId: gangAffiliationId || '',
        gangOriginId: gangOriginId || '',
        hidden: hidden,
        campaignAllegianceId: effectiveCurrentAllegianceId
      };
      
      // Reset form state (including allegiance)
      setFormState(prev => ({
        ...prev,
        name: gangName,
        credits: '',
        reputation: '',
        meat: '',
        scavengingRolls: '',
        explorationPoints: '',
        power: '',
        sustenance: '',
        salvage: '',
        alignment: alignment,
        allianceId: allianceId || '',
        gangColour: gangColour,
        gangIsVariant: gangVariants.length > 0,
        gangVariants: gangVariants,
        gangAffiliationId: gangAffiliationId || '',
        gangOriginId: gangOriginId || '',
        hidden: hidden,
        campaignAllegianceId: effectiveCurrentAllegianceId
      }));
      
      // Reset resource deltas
      setResourceDeltas({});
    }
  }, [isOpen, gangName, meat, scavengingRolls, explorationPoints, power, sustenance, salvage, alignment, allianceId, gangColour, gangVariants, gangAffiliationId, gangOriginId, hidden, effectiveCurrentAllegianceId, campaigns]);

  // Sync allegiance when it changes externally (e.g., from optimistic update)
  // Only sync if user hasn't made changes (form state still matches initial)
  // This prevents overwriting user's changes
  useEffect(() => {
    if (isOpen && 
        effectiveCurrentAllegianceId !== formState.campaignAllegianceId &&
        formState.campaignAllegianceId === initialValuesRef.current.campaignAllegianceId) {
      setFormState(prev => ({
        ...prev,
        campaignAllegianceId: effectiveCurrentAllegianceId
      }));
    }
  }, [isOpen, effectiveCurrentAllegianceId]);

  const fetchAlliances = async () => {
    if (allianceListLoaded) return;
    
    try {
      const response = await fetch('/api/alliances');
      if (!response.ok) throw new Error('Failed to fetch alliances');
      const data = await response.json();
      setAllianceList(data);
      setAllianceListLoaded(true);
    } catch (error) {
      console.error('Error fetching alliances:', error);
      toast({
        description: 'Failed to load alliances',
        variant: "destructive"
      });
    }
  };

  const fetchAffiliations = async () => {
    if (affiliationListLoaded && originListLoaded) return;

    try {
      const response = await fetch('/api/gang-types');
      if (!response.ok) throw new Error('Failed to fetch gang types');
      const data = await response.json();
      
      // Extract all available affiliations from the first gang type that has them
      if (!affiliationListLoaded) {
        const gangTypeWithAffiliations = data.find((type: any) => type.available_affiliations && type.available_affiliations.length > 0);
        if (gangTypeWithAffiliations) {
          setAffiliationList(gangTypeWithAffiliations.available_affiliations);
        }
        setAffiliationListLoaded(true);
      }

      // Extract origins that match this gang's category
      if (!originListLoaded) {
        // First try to find gang type with origins matching this gang's category
        let originsForThisGang: any[] = [];

        if (gangOriginCategoryName) {
          // Look for gang type that has origins matching our category
          for (const type of data) {
            if (type.available_origins && type.available_origins.length > 0) {
              const matchingOrigins = type.available_origins.filter((origin: any) =>
                origin.category_name === gangOriginCategoryName
              );
              if (matchingOrigins.length > 0) {
                originsForThisGang = matchingOrigins;
                break;
              }
            }
          }
        }

        // No fallback - if no matching origins found, keep empty list

        setOriginList(originsForThisGang);
        setOriginListLoaded(true);
      }
    } catch (error) {
      console.error('Error fetching affiliations/origins:', error);
      toast({
        description: 'Failed to load affiliations/origins',
        variant: "destructive"
      });
    }
  };

  const syncGangVariantsWithAlignment = (newAlignment: string, currentVariants: Array<{id: string, variant: string}>) => {
    const outlaw = availableVariants.find(v => v.variant === 'Outlaw');
    const hasOutlaw = currentVariants.some(v => v.variant === 'Outlaw');

    if (newAlignment === 'Outlaw' && outlaw && !hasOutlaw) {
      return [...currentVariants, outlaw];
    } else if (newAlignment === 'Law Abiding' && hasOutlaw) {
      return currentVariants.filter(v => v.variant !== 'Outlaw');
    }
    return currentVariants;
  };

  const handleAlignmentChange = (value: string) => {
    const newVariants = syncGangVariantsWithAlignment(value, formState.gangVariants);
    setFormState(prev => ({
      ...prev,
      alignment: value,
      gangVariants: newVariants
    }));
  };

  const handleSave = async () => {
    const updates: GangUpdates = {};
    const initial = initialValuesRef.current;

    // Only include name if changed
    if (formState.name !== initial.name) {
      updates.name = formState.name;
    }

    // Only include alignment if changed
    if (formState.alignment !== initial.alignment) {
      updates.alignment = formState.alignment;
    }

    // Only include alliance if changed
    if (formState.allianceId !== initial.allianceId) {
      updates.alliance_id = formState.allianceId === '' ? null : formState.allianceId;
      // Include alliance name for optimistic update (server will also fetch it for validation)
      if (formState.allianceId === '') {
        updates.alliance_name = '';
      } else {
        const alliance = allianceList.find(a => a.id === formState.allianceId);
        updates.alliance_name = alliance?.alliance_name || '';
      }
    }

    // Only include gang colour if changed
    if (formState.gangColour !== initial.gangColour) {
      updates.gang_colour = formState.gangColour;
    }

    // Only include gang affiliation if changed
    if (formState.gangAffiliationId !== initial.gangAffiliationId) {
      updates.gang_affiliation_id = formState.gangAffiliationId === '' ? null : formState.gangAffiliationId;
      // Include affiliation name for optimistic update (server will also fetch it for validation)
      if (formState.gangAffiliationId === '') {
        updates.gang_affiliation_name = '';
      } else {
        const affiliation = affiliationList.find(a => a.id === formState.gangAffiliationId);
        updates.gang_affiliation_name = affiliation?.name || '';
      }
    }

    // Only include gang origin if changed
    if (formState.gangOriginId !== initial.gangOriginId) {
      updates.gang_origin_id = formState.gangOriginId === '' ? null : formState.gangOriginId;
      updates.gang_origin_name = formState.gangOriginId === '' ? '' :
        originList.find(origin => origin.id === formState.gangOriginId)?.origin_name || '';
    }

    // Only include hidden if changed
    if (formState.hidden !== initial.hidden) {
      updates.hidden = formState.hidden;
    }

    // Only include campaign allegiance if changed
    if (formState.campaignAllegianceId !== initial.campaignAllegianceId && campaignId) {
      updates.campaign_id = campaignId;
      updates.campaign_allegiance_id = formState.campaignAllegianceId;
      // Determine if allegiance is custom by checking availableAllegiances
      const selectedAllegiance = availableAllegiances.find(a => a.id === formState.campaignAllegianceId);
      updates.campaign_allegiance_is_custom = selectedAllegiance?.is_custom || false;
    }

    // Only include gang variants if changed (bidirectional check)
    const variantsChanged = formState.gangVariants.length !== initial.gangVariants.length ||
      formState.gangVariants.some(v => !initial.gangVariants.some(iv => iv.id === v.id)) ||
      initial.gangVariants.some(v => !formState.gangVariants.some(fv => fv.id === v.id));
    if (variantsChanged) {
      updates.gang_variants = formState.gangVariants.map(v => v.id);
    }

    // Handle resource deltas - only include if non-empty and non-zero
    const creditsDifference = parseInt(formState.credits) || 0;
    if (creditsDifference !== 0) {
      updates.credits = Math.abs(creditsDifference);
      updates.credits_operation = creditsDifference >= 0 ? 'add' : 'subtract';
    }

    const reputationDifference = parseInt(formState.reputation) || 0;
    if (reputationDifference !== 0) {
      updates.reputation = Math.abs(reputationDifference);
      updates.reputation_operation = reputationDifference >= 0 ? 'add' : 'subtract';
    }

    // Handle dynamic resource deltas from normalised tables
    const resourceUpdatesList: ResourceUpdate[] = [];
    const campaignResources = campaigns?.[0]?.resources || [];
    
    for (const resource of campaignResources) {
      const deltaStr = resourceDeltas[resource.resource_id];
      const delta = parseInt(deltaStr) || 0;
      if (delta !== 0) {
        resourceUpdatesList.push({
          resource_id: resource.resource_id,
          is_custom: resource.is_custom,
          quantity_delta: delta
        });
      }
    }
    
    if (resourceUpdatesList.length > 0) {
      updates.resourceUpdates = resourceUpdatesList;
    }

    // Close modal immediately for instant UX (optimistic update will handle UI)
    onClose();

    // Call onSave which triggers TanStack Query mutation with optimistic updates
    // Toast notifications are handled by the mutation in gang.tsx
    onSave(updates);
  };

  const editModalContent = (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">Gang Name</p>
        <Input
          type="text"
          value={formState.name}
          onChange={(e) => setFormState(prev => ({ ...prev, name: e.target.value }))}
          className="w-full"
          placeholder="Gang name"
        />
      </div>

      <div className="flex flex-row gap-4">
        {/* Alignment Section */}
        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium">Alignment</p>
          <Combobox
            options={[
              { value: 'Law Abiding', label: 'Law Abiding' },
              { value: 'Outlaw', label: 'Outlaw' }
            ]}
            value={formState.alignment || undefined}
            onValueChange={(value) => handleAlignmentChange(value || '')}
            placeholder="Select Alignment"
          />
        </div>

        {/* Gang Colour Section */}
        <div className="space-y-2">
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm font-medium">Gang Colour</p>
            <div
              className="w-8 h-8 rounded-full border border-neutral-900 border-2 cursor-pointer"
              style={{ backgroundColor: formState.gangColour }}
              title="Click to change colour"
              onClick={() => setShowColourPickerModal(true)}
            />
          </div>
        </div>
      </div>

      {/* Campaign Allegiance Section */}
      {campaignId && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Campaign Allegiance</p>
          <Combobox
            options={[
              { value: 'none', label: 'No Allegiance' },
              ...availableAllegiances.map(allegiance => ({
                value: allegiance.id,
                label: allegiance.allegiance_name
              })),
              // Include current allegiance in options if it's not in the fetched list
              // This ensures the Combobox can display the current value even if data hasn't loaded yet
              ...(formState.campaignAllegianceId && 
                  currentAllegianceFromCampaign &&
                  !availableAllegiances.some(a => a.id === formState.campaignAllegianceId)
                  ? [{
                      value: currentAllegianceFromCampaign.id,
                      label: currentAllegianceFromCampaign.name
                    }]
                  : [])
            ]}
            value={formState.campaignAllegianceId || undefined}
            onValueChange={(value) => setFormState(prev => ({ 
              ...prev, 
              campaignAllegianceId: value === 'none' ? null : value 
            }))}
            onFocus={() => {
              if (campaignId && !isLoadingAllegiances) {
                refetchAllegiances();
              }
            }}
            placeholder="Select Allegiance..."
          />
        </div>
      )}

      {/* Resources Section */}
      <div className="space-y-4">
        <div>
          <p className="text-base font-medium">Resources</p>
          <p className="text-xs text-muted-foreground mt-1">Add or remove (e.g. 5 or -5)</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-xs font-medium">Credits
              <span className="text-xs text-muted-foreground"> (Current: {credits})</span>
            </p>
            <Input
              type="tel"
              inputMode="url"
              pattern="-?[0-9]+"
              value={formState.credits}
              onChange={(e) => setFormState(prev => ({ ...prev, credits: e.target.value }))}
              className="flex-1"
              placeholder="0"
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium">
              Reputation
              <span className="text-xs text-muted-foreground"> (Current: {reputation})</span>
            </p>
            <Input
              type="tel"
              inputMode="url"
              pattern="-?[0-9]+"
              value={formState.reputation}
              onChange={(e) => setFormState(prev => ({ ...prev, reputation: e.target.value }))}
              className="flex-1"
              placeholder="0"
            />
          </div>

          {/* Dynamic Campaign Resources */}
          {campaigns?.[0]?.resources?.map((resource) => (
            <div key={resource.resource_id} className="space-y-2">
              <p className="text-xs font-medium">
                {resource.resource_name}
                <span className="text-xs text-muted-foreground"> (Current: {resource.quantity})</span>
              </p>
              <Input
                type="tel"
                inputMode="url"
                pattern="-?[0-9]+"
                value={resourceDeltas[resource.resource_id] || ''}
                onChange={(e) => setResourceDeltas(prev => ({
                  ...prev,
                  [resource.resource_id]: e.target.value
                }))}
                className="flex-1"
                placeholder="0"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Gang Visibility</p>
        <div className="flex items-center space-x-2">
          <Switch
            id="hidden"
            checked={formState.hidden}
            onCheckedChange={(checked) => setFormState(prev => ({ ...prev, hidden: checked }))}
          />
          <label htmlFor="hidden" className="text-sm text-muted-foreground cursor-pointer">
            Hide gang from public view (Only you, admins, and campaign owners/arbitrators can see it)
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Alliance</p>
        <Combobox
          value={formState.allianceId || ""}
          onValueChange={(value) => setFormState(prev => ({ ...prev, allianceId: value }))}
          onFocus={fetchAlliances}
          placeholder={allianceListLoaded ? "Select Alliance" : "Select Alliance"}
          options={(() => {
            if (!allianceListLoaded) {
              // Show current selection if available, otherwise empty array
              if (allianceId) {
                return [{
                  value: allianceId,
                  label: allianceName,
                  displayValue: allianceName
                }];
              }
              return [];
            }

            const groupLabelConfig = [
              { label: "Criminal Organisations", maxRank: 9 },
              { label: "Merchant Guilds", maxRank: 19 },
              { label: "Noble Houses", maxRank: 29 },
              { label: "Other Alliances", maxRank: Infinity },
            ];

            const getGroupLabelFromRank = (rank: number): string => {
              for (const entry of groupLabelConfig) {
                if (rank <= entry.maxRank) {
                  return entry.label;
                }
              }
              return "Other Alliances";
            };

            const groupLabelRank: Record<string, number> = Object.fromEntries(
              groupLabelConfig.map((entry, index) => [entry.label, index + 1])
            );

            const groupedAlliances = allianceList.reduce((groups, alliance) => {
              const rank = allianceRank[alliance.alliance_name.toLowerCase()] ?? Infinity;
              const groupLabel = getGroupLabelFromRank(rank);

              if (!groups[groupLabel]) groups[groupLabel] = [];
              groups[groupLabel].push(alliance);
              return groups;
            }, {} as Record<string, typeof allianceList>);

            const options: Array<{ value: string; label: string | React.ReactNode; displayValue?: string; disabled?: boolean }> = [];

            // Add "None" option at the beginning
            options.push({
              value: "",
              label: "None",
              displayValue: "None"
            });

            Object.entries(groupedAlliances)
              .sort(([a], [b]) => {
                const rankA = groupLabelRank[a] ?? 999;
                const rankB = groupLabelRank[b] ?? 999;
                return rankA - rankB;
              })
              .forEach(([groupLabel, allianceList]) => {
                // Add group header as disabled option
                options.push({
                  value: `header-${groupLabel}`,
                  label: <span className="font-bold">{groupLabel}</span>,
                  displayValue: groupLabel,
                  disabled: true
                });

                // Add alliances in this group
                allianceList
                  .sort((a, b) => {
                    const rankA = allianceRank[a.alliance_name.toLowerCase()] ?? Infinity;
                    const rankB = allianceRank[b.alliance_name.toLowerCase()] ?? Infinity;
                    return rankA - rankB;
                  })
                  .forEach(alliance => {
                    options.push({
                      value: alliance.id,
                      label: <span className="ml-3">{alliance.alliance_name}</span>,
                      displayValue: alliance.alliance_name
                    });
                  });
              });

            return options;
          })()}
        />
      </div>

      {/* Gang Affiliation Section - Only show if gang type supports affiliations */}
      {gangTypeHasAffiliation && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Gang Affiliation</p>
          <select
            value={formState.gangAffiliationId || ""}
            onChange={(e) => setFormState(prev => ({ ...prev, gangAffiliationId: e.target.value }))}
            onFocus={fetchAffiliations}
            className="w-full p-2 border rounded-md"
          >
            {/* Default "None" option */}
            <option value="">None</option>

            {/* Display affiliations after they are loaded */}
            {affiliationListLoaded ? (
              affiliationList.map((affiliation) => (
                <option key={affiliation.id} value={affiliation.id}>
                  {affiliation.name}
                </option>
              ))
            ) : (
              <>
                {gangAffiliationId && <option value={gangAffiliationId}>{gangAffiliationName}</option>}
                <option value="" disabled>Loading Affiliations...</option>
              </>
            )}
          </select>
        </div>
      )}

      {/* Gang Origin Section - Only show if gang type supports origins */}
      {gangTypeHasOrigin && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{gangOriginCategoryName || 'Gang Origin'}</p>
          <select
            value={formState.gangOriginId || ""}
            onChange={(e) => setFormState(prev => ({ ...prev, gangOriginId: e.target.value }))}
            onFocus={fetchAffiliations}
            className="w-full p-2 border rounded-md"
          >
            <option value="">None</option>
            {originListLoaded ? (
              originList
                .sort((a, b) => a.origin_name.localeCompare(b.origin_name))
                .map((origin) => (
                  <option key={origin.id} value={origin.id}>
                    {origin.origin_name}
                  </option>
                ))
            ) : (
              <>
                {gangOriginId && <option value={gangOriginId}>{gangOriginName}</option>}
                <option value="" disabled>Loading Origins...</option>
              </>
            )}
          </select>
        </div>
      )}

      <div className="mt-4">
        <div className="flex items-center space-x-2">
          <label htmlFor="variant-toggle" className="text-sm font-medium">
            Gang Variants
          </label>
          <Switch
            id="variant-toggle"
            checked={formState.gangIsVariant}
            onCheckedChange={(checked) => setFormState(prev => ({ ...prev, gangIsVariant: checked }))}
          />
        </div>

        {formState.gangIsVariant && (
          <div className="grid grid-cols-2 gap-4 ">
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
                          checked={formState.gangVariants.some(v => v.id === variant.id)}
                          onCheckedChange={(checked) => {
                            setFormState(prev => ({
                              ...prev,
                              gangVariants: checked
                                ? [...prev.gangVariants, variant]
                                : prev.gangVariants.filter(v => v.id !== variant.id)
                            }));
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
                        checked={formState.gangVariants.some(v => v.id === variant.id)}
                        onCheckedChange={(checked) => {
                          setFormState(prev => ({
                            ...prev,
                            gangVariants: checked
                              ? [...prev.gangVariants, variant]
                              : prev.gangVariants.filter(v => v.id !== variant.id)
                          }));
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

      {/* Only gang owners and admins can delete gangs - not campaign owners/arbitrators */}
      {(isGangOwner || isAdmin) && (
        <DeleteGangButton gangId={gangId} gangName={gangName} />
      )}
    </div>
  );

  return (
    <>
      {isOpen && (
        <Modal
          title="Edit Gang"
          content={editModalContent}
          onClose={onClose}
          onConfirm={handleSave}
          confirmText="Save Changes"
        />
      )}

      {showColourPickerModal && (
        <Modal
          title="Select Gang Colour"
          helper="This sets your gang's appearance in a campaign."
          onClose={() => setShowColourPickerModal(false)}
          onConfirm={() => setShowColourPickerModal(false)}
          confirmText="Close"
          content={
            <div className="space-y-4">
              <div className="flex justify-center">
                <HexColorPicker 
                  color={formState.gangColour} 
                  onChange={(color) => setFormState(prev => ({ ...prev, gangColour: color }))} 
                />
              </div>
              <div className="flex justify-center">
                <input
                  type="text"
                  value={formState.gangColour}
                  onChange={(e) => {
                    const val = e.target.value;
                    // Allow only valid 7-character hex strings starting with "#"
                    if (/^#([0-9A-Fa-f]{0,6})$/.test(val)) {
                      setFormState(prev => ({ ...prev, gangColour: val }));
                    }
                  }}
                  className="w-32 text-center font-mono border rounded p-1 text-sm"
                  maxLength={7}
                  placeholder="#ffffff"
                />
              </div>
              <div className="space-y-1">
                {/* Light theme preview */}
                <div className="flex justify-center">
                  <div className="p-3 bg-white rounded-lg border border-neutral-200 shadow-sm">
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100"
                      style={{ color: formState.gangColour }}
                    >
                      {gangName}
                    </span>
                    <p className="text-xs text-gray-500 mt-1 text-center">Light theme</p>
                  </div>
                </div>

                {/* Dark theme preview */}
                <div className="flex justify-center">
                  <div className="p-3 bg-black rounded-lg border border-neutral-800 shadow-sm">
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-800"
                      style={{ color: formState.gangColour }}
                    >
                      {gangName}
                    </span>
                    <p className="text-xs text-gray-400 mt-1 text-center">Dark theme</p>
                  </div>
                </div>
              </div>
            </div>
          }
        />
      )}
    </>
  );
}