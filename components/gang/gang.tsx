'use client';

import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { FighterProps } from '@/types/fighter';
import { useToast } from "@/components/ui/use-toast";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { StashItem, ResourceUpdate } from '@/types/gang';
import { VehicleProps } from '@/types/vehicle';
import Image from 'next/image';
import { DraggableFighters } from './draggable-fighters';
import { GiAncientRuins } from "react-icons/gi";
import AddFighter from './add-fighter';
import GangAdditions from './gang-additions';
import AddVehicle from './add-vehicle';
import PrintModal from "@/components/print-modal";
import { FiPrinter, FiShare2, FiCamera } from 'react-icons/fi';
import { LuLogs } from "react-icons/lu";
import { useShare } from '@/hooks/use-share';
import html2canvas from 'html2canvas';
import GangLogs from './gang-logs';
import { ViewModeDropdown } from './ViewModeDropdown';
import GangEditModal from './gang-edit-modal';
import { UserPermissions } from '@/types/user-permissions';
import { updateGangPositioning } from '@/app/actions/update-gang-positioning';
import { FaRegCopy } from 'react-icons/fa';
import CopyGangModal from './copy-gang-modal';
import { Tooltip } from 'react-tooltip';
import { fighterClassRank } from '@/utils/fighterClassRank';
import { GangImageEditModal } from './gang-image-edit-modal';
import { PatreonSupporterIcon } from "@/components/ui/patreon-supporter-icon";
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';


interface GangProps {
  id: string;
  name: string;
  gang_type_id: string;
  gang_type?: string;
  gang_type_image_url: string;
  image_url?: string;
  default_gang_image?: number | null;
  gang_type_default_image_urls?: string[];
  gang_colour: string | null;
  credits: number | null;
  reputation: number | null;
  meat: number | null;
  scavenging_rolls: number | null;
  exploration_points: number | null;
  power: number | null;
  sustenance: number | null;
  salvage: number | null;
  rating: number | null;
  wealth?: number | null;
  alignment: string;
  alliance_id: string;
  alliance_name: string;
  gang_affiliation_id: string | null;
  gang_affiliation_name: string;
  gang_type_has_affiliation: boolean;
  gang_origin_id?: string | null;
  gang_origin_name?: string;
  gang_origin_category_name?: string;
  gang_type_has_origin?: boolean;
  created_at: string | Date | null;
  last_updated: string | Date | null;
  initialFighters: FighterProps[];
  additionalButtons?: React.ReactNode;
  campaigns?: {
    campaign_id: string;
    campaign_gang_id: string;
    campaign_name: string;
    role: string | null;
    status: string | null;
    // Legacy flags - kept for backward compatibility
    has_meat: boolean;
    has_exploration_points: boolean;
    has_scavenging_rolls: boolean;
    has_power: boolean;
    has_sustenance: boolean;
    has_salvage: boolean;
    territories: {
      id: string;
      created_at: string;
      territory_id: string;
      territory_name: string;
      ruined: boolean | null;
      }[];
    allegiance?: {
      id: string;
      name: string;
    } | null;
    // Normalised resources from campaign_gang_resources
    resources?: Array<{
      resource_id: string;
      resource_name: string;
      quantity: number;
      is_custom: boolean;
    }>;
  }[];
  note?: string;
  stash: StashItem[];
  onVehicleAdd?: (newVehicle: VehicleProps) => void;
  onFighterAdd?: (newFighter: FighterProps, cost: number) => void;
  onGangCreditsUpdate?: (newCredits: number) => void;
  onGangWealthUpdate?: (newWealth: number) => void;
  positioning: Record<number, string>;
  gang_variants: Array<{id: string, variant: string}> | null;
  vehicles?: VehicleProps[];
  userPermissions?: UserPermissions;
  username?: string;
  patreon_tier_id?: string;
  patreon_tier_title?: string;
  patron_status?: string;
  user_id?: string;
  hidden: boolean;
}

export default function Gang({
  id,
  name: initialName,
  gang_type_id,
  gang_type,
  gang_type_image_url,
  image_url,
  default_gang_image,
  gang_type_default_image_urls,
  gang_colour: initialGangColour,
  credits: initialCredits,
  reputation: initialReputation,
  meat: initialMeat,
  scavenging_rolls: initialScavengingRolls,
  exploration_points: initialExplorationPoints,
  power: initialPower,
  sustenance: initialSustenance,
  salvage: initialSalvage,
  rating: initialRating,
  wealth: initialWealth,
  alignment: initialAlignment,
  alliance_id: initialAllianceId,
  alliance_name: initialAllianceName,
  gang_affiliation_id,
  gang_affiliation_name,
  gang_type_has_affiliation,
  gang_origin_id,
  gang_origin_name,
  gang_origin_category_name,
  gang_type_has_origin,
  created_at,
  last_updated: initialLastUpdated,
  initialFighters = [],
  additionalButtons,
  campaigns,
  note,
  stash,
  onVehicleAdd,
  onFighterAdd,
  onGangCreditsUpdate,
  onGangWealthUpdate,
  positioning,
  gang_variants,
  vehicles,
  userPermissions,
  username,
  patreon_tier_id,
  patreon_tier_title,
  patron_status,
  user_id,
  hidden: initialHidden,
}: GangProps) {
  const safeGangVariant = gang_variants ?? [];
  const { toast } = useToast();
  
  const { shareUrl } = useShare();
  const gangContentRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(initialName)
  const [credits, setCredits] = useState(initialCredits ?? 0)
  const [reputation, setReputation] = useState(initialReputation ?? 0)
  // Legacy resource states - kept for backward compatibility during transition
  const [meat, setMeat] = useState(initialMeat ?? 0)
  const [scavengingRolls, setScavengingRolls] = useState(initialScavengingRolls ?? 0)
  const [explorationPoints, setExplorationPoints] = useState(initialExplorationPoints ?? 0)
  const [power, setPower] = useState(initialPower ?? 0)
  const [sustenance, setSustenance] = useState(initialSustenance ?? 0)
  const [salvage, setSalvage] = useState(initialSalvage ?? 0)
  // Dynamic resources from normalised tables
  const [campaignResources, setCampaignResources] = useState<Array<{
    resource_id: string;
    resource_name: string;
    quantity: number;
    is_custom: boolean;
  }>>(campaigns?.[0]?.resources || [])
  const [rating, setRating] = useState<number>(initialRating ?? 0)
  const [wealth, setWealth] = useState<number>(initialWealth ?? 0)
  const [lastUpdated, setLastUpdated] = useState(initialLastUpdated)
  const [gangColour, setGangColour] = useState<string>(initialGangColour ?? '')
  const [fighters, setFighters] = useState<FighterProps[]>(initialFighters);
  const [alignment, setAlignment] = useState(initialAlignment);
  const [allianceId, setAllianceId] = useState<string | null>(initialAllianceId);
  const [allianceName, setAllianceName] = useState(initialAllianceName);
  const [gangAffiliationId, setGangAffiliationId] = useState<string | null>(gang_affiliation_id);
  const [gangAffiliationName, setGangAffiliationName] = useState(gang_affiliation_name);
  const [gangOriginId, setGangOriginId] = useState<string | null>(gang_origin_id || null);
  const [gangOriginName, setGangOriginName] = useState(gang_origin_name || '');
  const [gangOriginCategoryName, setGangOriginCategoryName] = useState(gang_origin_category_name || '');
  const [hidden, setHidden] = useState(initialHidden);
  // Track allegiance for optimistic updates
  // Use undefined to indicate "not yet set" vs null which means "explicitly cleared"
  const [currentAllegiance, setCurrentAllegiance] = useState<{ id: string; name: string } | null | undefined>(
    campaigns?.[0]?.allegiance ?? undefined
  );
  const queryClient = useQueryClient();
  
  // Create updated campaigns prop with optimistic allegiance and resources
  const campaignsWithOptimisticData = useMemo(() => {
    if (!campaigns || campaigns.length === 0) return campaigns;
    return campaigns.map((campaign, index) => {
      if (index === 0) {
        // Use optimistic allegiance if set, otherwise fall back to prop
        const allegiance = currentAllegiance !== undefined ? currentAllegiance : campaign.allegiance;
        // Use current resources state for optimistic updates
        return {
          ...campaign,
          allegiance,
          resources: campaignResources
        };
      }
      return campaign;
    });
  }, [campaigns, currentAllegiance, campaignResources]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddFighterModal, setShowAddFighterModal] = useState(false);
  const [showAddVehicleModal, setShowAddVehicleModal] = useState(false);
  const [positions, setPositions] = useState<Record<number, string>>(positioning);
  const [showGangAdditionsModal, setShowGangAdditionsModal] = useState(false);
  const [gangIsVariant, setGangIsVariant] = useState(safeGangVariant.length > 0);
  const [gangVariants, setGangVariants] = useState<Array<{id: string, variant: string}>>(safeGangVariant);
  const [availableVariants, setAvailableVariants] = useState<Array<{id: string, variant: string}>>([]);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [currentGangImageUrl, setCurrentGangImageUrl] = useState(image_url);
  const [currentDefaultGangImage, setCurrentDefaultGangImage] = useState<number | null | undefined>(default_gang_image);
  // Page view mode - default to 'normal' to avoid hydration mismatch
  const [viewMode, setViewMode] = useState<'normal' | 'small' | 'medium' | 'large'>('normal');
  const isFirstRender = useRef(true);

  // Get campaign ID if gang is in a campaign
  const campaignId = campaigns?.[0]?.campaign_id;


  // Load from localStorage on mount
  useEffect(() => {
    const savedViewMode = localStorage.getItem('gang_view_mode') as 'normal' | 'small' | 'medium' | 'large';
    if (savedViewMode && savedViewMode !== viewMode) {
      setViewMode(savedViewMode);
    }
  }, []);

  // Sync fighters state with prop changes from parent
  useEffect(() => {
    setFighters(initialFighters);
  }, [initialFighters]);

  // Sync credits state with prop changes from parent
  useEffect(() => {
    setCredits(initialCredits ?? 0);
  }, [initialCredits]);

  // Sync rating state with prop changes from parent
  useEffect(() => {
    setRating(initialRating ?? 0);
  }, [initialRating]);

  // Sync wealth state with prop changes from parent
  useEffect(() => {
    setWealth(initialWealth ?? 0);
  }, [initialWealth]);

  // Sync default_gang_image state with prop changes from parent
  useEffect(() => {
    setCurrentDefaultGangImage(default_gang_image);
  }, [default_gang_image]);

  // Sync allegiance state with prop changes from parent
  // Only sync if we haven't made an optimistic update (currentAllegiance is undefined)
  useEffect(() => {
    if (currentAllegiance === undefined) {
      setCurrentAllegiance(campaigns?.[0]?.allegiance ?? null);
    }
  }, [campaigns, currentAllegiance]);

  // Calculate the total value of unassigned vehicles including equipment
  const unassignedVehiclesValue = useMemo(() => {
    if (!vehicles || vehicles.length === 0) return 0;
    return vehicles.reduce((total, vehicle) => {
      const baseCost = vehicle.cost || 0;
      const equipmentCost = (vehicle as any).total_equipment_cost || 0;
      return total + baseCost + equipmentCost;
    }, 0);
  }, [vehicles]);

  // Calculate the total value of the Stash
  const totalStashValue = stash.reduce((total, item) => total + (item.cost || 0), 0);

  // Filter out killed, enslaved, or retired fighters for gang size and composition
  const activeFighters = useMemo(() => {
    return fighters.filter(fighter => 
      !fighter.killed && !fighter.enslaved && !fighter.retired && !fighter.captured
    );
  }, [fighters]);

  // Fighters composition for tooltip: group by fighter_type and fighter_class
  const fighterTypeClassCounts = useMemo(() => {
    const counts = new Map<string, { label: string; count: number; classKey: string }>();
    for (const fighter of activeFighters) {
      const typeLabel = fighter.fighter_type || 'Unknown Type';
      const classLabel = fighter.fighter_class || 'Unknown Class';
      const key = `${typeLabel} (${classLabel})`;
      const classKey = (fighter.fighter_class || 'unknown').toLowerCase();
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, { label: key, count: 1, classKey });
      }
    }
    return Array.from(counts.values()).sort((a, b) => {
      const rankA = fighterClassRank[a.classKey] ?? Infinity;
      const rankB = fighterClassRank[b.classKey] ?? Infinity;
      if (rankA !== rankB) return rankA - rankB;
      return a.label.localeCompare(b.label);
    });
  }, [activeFighters]);

  const escapeHtml = (unsafe: string): string =>
    unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const fightersTooltipHtml = useMemo(() => {
    const title = '<div style="font-weight:600;margin-bottom:6px;font-size:14px;">Gang Composition</div>';
    if (fighterTypeClassCounts.length === 0) {
      return `${title}<div>No fighters</div>`;
    }
    const rows = fighterTypeClassCounts
      .map(({ label, count }) =>
        `<div style="display:flex;justify-content:space-between;gap:12px;">` +
          `<span>${escapeHtml(label)}</span>` +
          `<span>${count}</span>` +
        `</div>`
      )
      .join('');
    const total = fighterTypeClassCounts.reduce((sum, item) => sum + item.count, 0);
    const footer =
      `<div style=\"border-top:1px solid #333;margin-top:4px;padding-top:4px;display:flex;justify-content:space-between;gap:12px;\">` +
        `<span>Total :</span>` +
        `<span>${total}</span>` +
      `</div>`;
    return `${title}${rows}${footer}`;
  }, [fighterTypeClassCounts]);

  // Wealth breakdown tooltip HTML
  const wealthTooltipHtml = useMemo(() => {
    const title = '<div style="font-weight:600;margin-bottom:6px;font-size:14px;">Wealth Breakdown</div>';
    const rows = [
      { label: 'Gang Rating', value: rating },
      { label: 'Credits', value: credits },
      { label: 'Stash', value: totalStashValue },
      { label: 'Vehicles (without crew)', value: unassignedVehiclesValue },
    ]
      .map(({ label, value }) =>
        `<div style="display:flex;justify-content:space-between;gap:12px;">` +
          `<span>${escapeHtml(label)}</span>` +
          `<span>${value}</span>` +
        `</div>`
      )
      .join('');
    const total = credits + totalStashValue + unassignedVehiclesValue + rating;
    const footer =
      `<div style="border-top:1px solid #333;margin-top:4px;padding-top:4px;display:flex;justify-content:space-between;gap:12px;">` +
        `<span>Total :</span>` +
        `<span>${total}</span>` +
      `</div>`;
    return `${title}${rows}${footer}`;
  }, [credits, totalStashValue, unassignedVehiclesValue, rating]);


  // Save to localStorage and update DOM (skip first render)
  useEffect(() => {
    const wrapper = document.getElementById('main-content-wrapper');
    if (wrapper) {
      if (viewMode !== 'normal') {
        wrapper.classList.remove('max-w-5xl');
        wrapper.classList.add('max-w-none');
      } else {
        wrapper.classList.remove('max-w-none');
        wrapper.classList.add('max-w-5xl');
      }
    }

    // Skip saving on first render to avoid overwriting localStorage
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    localStorage.setItem('gang_view_mode', viewMode);
  }, [viewMode]);

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    console.error('Failed to load image:', e.currentTarget.src);
    e.currentTarget.src = "https://res.cloudinary.com/dle0tkpbl/image/upload/v1732965431/default-gang_image.jpg";
  };

  // Helper function to get the default image URL
  const getDefaultImageUrl = useCallback((): string | null => {
    // If custom image exists, use it
    if (currentGangImageUrl) {
      return currentGangImageUrl;
    }
    
    // If currentDefaultGangImage is set and gang_type_default_image_urls exists and index is valid
    if (currentDefaultGangImage !== null && currentDefaultGangImage !== undefined && 
        gang_type_default_image_urls && 
        Array.isArray(gang_type_default_image_urls) &&
        currentDefaultGangImage >= 0 && 
        currentDefaultGangImage < gang_type_default_image_urls.length) {
      return gang_type_default_image_urls[currentDefaultGangImage];
    }
    
    // No valid image found
    return null;
  }, [currentGangImageUrl, currentDefaultGangImage, gang_type_default_image_urls]);

  const formatDate = useCallback((date: string | Date | null) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  // Screenshot with html2canvas
  const handleScreenshot = async () => {
    if (!gangContentRef.current) return;

    await document.fonts.ready;

    const canvas = await html2canvas(gangContentRef.current, {
      scale: 1.3,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#000000', // for JPEG
    });

    const now = new Date();
    const datePart = formatDate(now);
    const timePart = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
    const filename = `${datePart}_${timePart}_${name.replace(/\s+/g, '_')}-MundaManager.jpg`;

    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/jpeg', 0.85); // quality (0–1)
    link.click();
  };


  // Handle gang updates from the edit modal
  // TanStack Query mutation for gang updates with optimistic updates
  const updateGangMutation = useMutation({
    mutationFn: async (updates: any) => {
      const { updateGang } = await import('@/app/actions/update-gang');
      const result = await updateGang({
        gang_id: id,
        ...updates
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to update gang');
      }
      return result;
    },
    onMutate: async (updates) => {
      // Snapshot previous values for rollback
      const snapshot = {
        name, credits, wealth, alignment, allianceId, allianceName,
        gangAffiliationId, gangAffiliationName, gangOriginId, gangOriginName,
        reputation, meat, scavengingRolls, explorationPoints, power, sustenance, salvage,
        gangVariants: [...gangVariants], gangIsVariant, gangColour, hidden,
        campaignResources: [...campaignResources]
      };

      // Apply optimistic updates
      if (updates.name !== undefined) setName(updates.name);
      if (updates.alignment !== undefined) setAlignment(updates.alignment);
      if (updates.gang_colour !== undefined) setGangColour(updates.gang_colour);
      if (updates.hidden !== undefined) setHidden(updates.hidden);

      if (updates.credits !== undefined && updates.credits_operation) {
        const creditsDelta = updates.credits_operation === 'add' ? updates.credits : -updates.credits;
        const newCredits = snapshot.credits + creditsDelta;
        setCredits(newCredits);
        setWealth(snapshot.wealth + creditsDelta);
        onGangCreditsUpdate?.(newCredits);
      }

      if (updates.alliance_id !== undefined) {
        setAllianceId(updates.alliance_id);
        // Use provided alliance name from modal for optimistic update
        if (updates.alliance_name !== undefined) {
          setAllianceName(updates.alliance_name);
        }
      }

      if (updates.gang_affiliation_id !== undefined) {
        setGangAffiliationId(updates.gang_affiliation_id);
        // Use provided affiliation name from modal for optimistic update
        if (updates.gang_affiliation_name !== undefined) {
          setGangAffiliationName(updates.gang_affiliation_name);
        }
      }

      if (updates.gang_origin_id !== undefined) {
        setGangOriginId(updates.gang_origin_id);
        setGangOriginName(updates.gang_origin_name || '');
      }

      if (updates.reputation !== undefined && updates.reputation_operation) {
        setReputation(snapshot.reputation + (updates.reputation_operation === 'add' ? updates.reputation : -updates.reputation));
      }

      if (updates.meat !== undefined && updates.meat_operation) {
        setMeat(snapshot.meat + (updates.meat_operation === 'add' ? updates.meat : -updates.meat));
      }

      if (updates.scavenging_rolls !== undefined && updates.scavenging_rolls_operation) {
        setScavengingRolls(snapshot.scavengingRolls + (updates.scavenging_rolls_operation === 'add' ? updates.scavenging_rolls : -updates.scavenging_rolls));
      }

      if (updates.exploration_points !== undefined && updates.exploration_points_operation) {
        setExplorationPoints(snapshot.explorationPoints + (updates.exploration_points_operation === 'add' ? updates.exploration_points : -updates.exploration_points));
      }

      if (updates.power !== undefined && updates.power_operation) {
        setPower(snapshot.power + (updates.power_operation === 'add' ? updates.power : -updates.power));
      }

      if (updates.sustenance !== undefined && updates.sustenance_operation) {
        setSustenance(snapshot.sustenance + (updates.sustenance_operation === 'add' ? updates.sustenance : -updates.sustenance));
      }

      if (updates.salvage !== undefined && updates.salvage_operation) {
        setSalvage(snapshot.salvage + (updates.salvage_operation === 'add' ? updates.salvage : -updates.salvage));
      }

      if (updates.gang_variants !== undefined) {
        const newVariants = updates.gang_variants.map((variantId: string) =>
          availableVariants.find(v => v.id === variantId) ||
          gangVariants.find(v => v.id === variantId) ||
          { id: variantId, variant: 'Unknown' }
        );
        setGangVariants(newVariants);
        setGangIsVariant(newVariants.length > 0);
      }

      return { snapshot };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.snapshot) {
        const s = context.snapshot;
        setName(s.name);
        setCredits(s.credits);
        setWealth(s.wealth);
        onGangCreditsUpdate?.(s.credits);
        setAlignment(s.alignment);
        setAllianceId(s.allianceId);
        setAllianceName(s.allianceName);
        setGangAffiliationId(s.gangAffiliationId);
        setGangAffiliationName(s.gangAffiliationName);
        setGangOriginId(s.gangOriginId);
        setGangOriginName(s.gangOriginName);
        setReputation(s.reputation);
        setMeat(s.meat);
        setScavengingRolls(s.scavengingRolls);
        setExplorationPoints(s.explorationPoints);
        setPower(s.power);
        setSustenance(s.sustenance);
        setSalvage(s.salvage);
        setGangVariants(s.gangVariants);
        setGangIsVariant(s.gangIsVariant);
        setGangColour(s.gangColour);
        setHidden(s.hidden);
        setCampaignResources(s.campaignResources);
      }

      // Show error toast
      console.error('Error updating gang:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update gang';
      toast({
        variant: "destructive",
        description: errorMessage
      });
    },
    onSuccess: (result, variables) => {
      // Sync with server response
      if (result.data) {
        setLastUpdated(result.data.last_updated);
        if (result.data.alliance_name) setAllianceName(result.data.alliance_name);
        if (result.data.gang_affiliation_name !== undefined) setGangAffiliationName(result.data.gang_affiliation_name);
        // Only update variants if they were actually changed in the request
        if (variables.gang_variants !== undefined && result.data.gang_variants) {
          setGangVariants(result.data.gang_variants);
          setGangIsVariant(result.data.gang_variants.length > 0);
        }
      }

      // Show success toast
      toast({
        description: "Gang updated successfully"
      });
    }
  });

  // TanStack Query mutation for resource updates with optimistic updates
  const updateResourceMutation = useMutation({
    mutationFn: async (resourceUpdates: Array<{
      campaign_gang_id: string;
      resource_id: string;
      resource_name: string;
      is_custom: boolean;
      quantity_delta: number;
    }>) => {
      const { updateGang } = await import('@/app/actions/update-gang');
      if (resourceUpdates.length === 0) return { success: true };
      
      const campaignGangId = resourceUpdates[0].campaign_gang_id;
      const resources = resourceUpdates.map(r => ({
        resource_id: r.resource_id,
        resource_name: r.resource_name,
        is_custom: r.is_custom,
        quantity_delta: r.quantity_delta
      }));
      
      return updateGang({
        gang_id: id,
        campaign_gang_id: campaignGangId,
        resources
      });
    },
    onMutate: async (resourceUpdates) => {
      // Snapshot previous resources for rollback
      const snapshot = { campaignResources: [...campaignResources] };

      // Apply optimistic updates
      const updatedResources = campaignResources.map(resource => {
        const update = resourceUpdates.find(u => u.resource_id === resource.resource_id);
        if (update) {
          return {
            ...resource,
            quantity: resource.quantity + update.quantity_delta
          };
        }
        return resource;
      });
      setCampaignResources(updatedResources);

      return { snapshot };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.snapshot) {
        setCampaignResources(context.snapshot.campaignResources);
      }
      console.error('Error updating resources:', error);
      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : 'Failed to update resources'
      });
    },
    onSuccess: () => {
      toast({
        description: "Resources updated successfully"
      });
    }
  });

  const handleGangUpdate = async (updates: any): Promise<boolean> => {
    try {
      // Extract allegiance-related fields (stored in campaign_gangs table, not gangs table)
      const { campaign_id, campaign_allegiance_id, campaign_allegiance_is_custom, ...gangUpdates } = updates;
      
      // Snapshot previous allegiance for rollback
      const previousAllegiance = currentAllegiance;
      
      // Handle allegiance update separately if present
      if (campaign_id && campaign_allegiance_id !== undefined) {
        // Optimistic update: find the allegiance name from available allegiances
        // We'll fetch it from the cache or use a placeholder
        // Optimistic update: find the allegiance name from cached allegiances
        if (campaign_allegiance_id === null) {
          // Setting to null - clear allegiance
          setCurrentAllegiance(null);
        } else {
          // Try to get the name from TanStack Query cache
          const cachedAllegiances = queryClient.getQueryData<Array<{ id: string; allegiance_name: string; is_custom: boolean }>>(
            ['campaign-allegiances', campaign_id]
          );
          
          if (cachedAllegiances) {
            const foundAllegiance = cachedAllegiances.find((a: { id: string; allegiance_name: string; is_custom: boolean }) => a.id === campaign_allegiance_id);
            if (foundAllegiance) {
              setCurrentAllegiance({ id: campaign_allegiance_id, name: foundAllegiance.allegiance_name });
            } else {
              // If not found in cache, use a placeholder
              setCurrentAllegiance({ id: campaign_allegiance_id, name: 'Loading...' });
            }
          } else {
            // If not in cache, use a placeholder
            setCurrentAllegiance({ id: campaign_allegiance_id, name: 'Loading...' });
          }
        }
        
        try {
          const { updateGangAllegiance } = await import('@/app/actions/campaigns/[id]/campaign-allegiances');
          const allegianceResult = await updateGangAllegiance({
            gangId: id,
            campaignId: campaign_id,
            allegianceId: campaign_allegiance_id,
            isCustom: campaign_allegiance_is_custom || false
          });
          
          if (!allegianceResult.success) {
            // Rollback on error
            setCurrentAllegiance(previousAllegiance);
            throw new Error(allegianceResult.error || 'Failed to update allegiance');
          }
          
          // If success, keep the optimistic update (it should already be correct from cache)
          // If it was a placeholder, it will be corrected when the page refreshes or cache updates
          if (campaign_allegiance_id === null) {
            setCurrentAllegiance(null);
          }
        } catch (error) {
          // Rollback on error
          setCurrentAllegiance(previousAllegiance);
          throw error;
        }
      }
      
      // Handle resource updates if present
      if (updates.resourceUpdates && updates.resourceUpdates.length > 0) {
        const campaignGangId = campaigns?.[0]?.campaign_gang_id;
        if (campaignGangId) {
          const resourceUpdatesWithCampaignGang = updates.resourceUpdates.map((r: ResourceUpdate) => {
            // Look up resource_name from campaignResources
            const resource = campaignResources.find(cr => cr.resource_id === r.resource_id);
            return {
              campaign_gang_id: campaignGangId,
              resource_id: r.resource_id,
              resource_name: resource?.resource_name || r.resource_name || 'Unknown Resource',
              is_custom: r.is_custom,
              quantity_delta: r.quantity_delta
            };
          });
          await updateResourceMutation.mutateAsync(resourceUpdatesWithCampaignGang);
        }
        // Remove resourceUpdates from gangUpdates since they're handled separately
        delete gangUpdates.resourceUpdates;
      }
      
      // Update gang fields (only if there are any non-allegiance updates)
      if (Object.keys(gangUpdates).length > 0) {
        await updateGangMutation.mutateAsync(gangUpdates);
      }
      
      return true;
    } catch (error) {
      console.error('Error updating gang:', error);
      throw error;
    }
  };

  const handleAddFighterClick = () => {
    setShowAddFighterModal(true);
  };


  const handleGangAdditionsModalOpen = () => {
    setShowGangAdditionsModal(true);
  };

  // Add the handler for when a fighter is added
  const handleFighterAdded = (newFighter: FighterProps, cost: number) => {
    if (onFighterAdd) {
      // Use the parent callback - this will handle all state updates
      onFighterAdd(newFighter, cost);
    } else {
      // Fallback to local state management if no callback provided
      setFighters(prev => [...prev, newFighter]);
      setCredits(prev => prev - cost); // Deduct what was actually paid
      setRating(prev => prev + newFighter.credits); // Add the fighter's rating cost
    }
  };


  const handleEditModalOpen = async () => {
    // Fetch variants BEFORE opening modal (like the original)
    try {
      const response = await fetch('/api/gang_variant_types');
      if (!response.ok) throw new Error('Failed to fetch variants');
      const data = await response.json();
      setAvailableVariants(data);
    } catch (error) {
      console.error('Error fetching variants:', error);
      toast({
        description: 'Failed to load variants',
        variant: "destructive"
      });
    }
    
    setShowEditModal(true); // Only open AFTER variants are ready
  };


  const handleAddVehicleModalOpen = () => {
    setShowAddVehicleModal(true);
  };

  const handleVehicleAdded = (newVehicle: VehicleProps) => {
    // Update credits using payment_cost (what the user actually paid)
    const paymentCost = newVehicle.payment_cost !== undefined ? newVehicle.payment_cost : newVehicle.cost;
    setCredits(prev => prev - paymentCost);
    
    // Note: Unassigned vehicles don't contribute to gang rating yet
    // They'll contribute to the rating when assigned to a fighter
    // No need to update the rating here
    
    // Pass the new vehicle up to the parent
    if (onVehicleAdd) {
      onVehicleAdd(newVehicle);
    }
  };

  const handleGangImageClick = () => {
    if (userPermissions?.canEdit) {
      setShowImageModal(true);
    }
  };

  const handleGangImageUpdate = (newImageUrl: string, newDefaultImageIndex?: number | null) => {
    if (newDefaultImageIndex !== undefined) {
      // Updating default image index
      setCurrentGangImageUrl(undefined); // Clear custom image URL
      setCurrentDefaultGangImage(newDefaultImageIndex); // Update default image index
    } else {
      // Updating custom image URL
      setCurrentGangImageUrl(newImageUrl || undefined);
      // If setting a custom image, clear the default image index
      if (newImageUrl) {
        setCurrentDefaultGangImage(null);
      }
    }
  };

  const handlePositionsUpdate = async (newPositions: Record<number, string>) => {
    try {
      const result = await updateGangPositioning({
        gangId: id,
        positions: newPositions
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to update positions');
      }
      
      // Update the positions state
      setPositions(newPositions);
      
      // Also ensure our fighters array is ordered according to the positions
      if (fighters.length > 0) {
        const orderedFighters = Object.values(newPositions).map(
          fighterId => fighters.find(f => f.id === fighterId)
        ).filter(Boolean) as FighterProps[];
        
        // Update any fighters not included in positions
        const unpositionedFighters = fighters.filter(
          f => !Object.values(newPositions).includes(f.id)
        );
        
        setFighters([...orderedFighters, ...unpositionedFighters]);
      }
    } catch (error) {
      console.error('Error updating positions:', error);
      toast({
        title: "Error",
        description: "Failed to update fighter positions",
        variant: "destructive"
      });
    }
  };

  // Add function to handle fighters reordering
  const handleFightersReorder = (newFighters: FighterProps[]) => {
    setFighters(newFighters);
  };

  return (
    <div
      ref={gangContentRef}
      className={`space-y-4 print:space-y-[5px] ${viewMode !== 'normal' ? 'w-full max-w-full' : ''}`}
    >
      <div className="print:flex space-y-4 justify-center print:justify-start print:space-y-0">
        <div id="gang_card" className="bg-card shadow-md rounded-lg p-4 flex items-start gap-6 print:print-fighter-card print:border-2 print:border-black">
          {/* Left Section: Gang Image */}
          <div className="hidden sm:flex relative size-[200px] md:size-[250px] mt-1 shrink-0 items-center justify-center print:hidden">
            {getDefaultImageUrl() ? (
              <Image
                src={getDefaultImageUrl()!}
                alt={name}
                width={180}
                height={180}
                className="size-[145px] md:size-[180px] absolute rounded-full object-cover mt-1 z-10"
                priority={false}
                quality={100}
                onError={handleImageError}
              />
            ) : (
              <div className="absolute size-[180px] rounded-full bg-secondary z-10 flex items-center justify-center">
                {name.charAt(0)}
              </div>
            )}
			      <div className={`absolute z-20 size-[200px] md:size-[250px] ${userPermissions?.canEdit ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
			        onClick={handleGangImageClick}
			      >
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
          </div>

          {/* Right Section: Content */}
          <div className="flex-grow w-full">
            <div className="flex justify-between items-start mb-1">
              <h2 className="text-xl md:text-2xl font-bold">{name}</h2>
              <div className="flex gap-2 print:hidden">

                {/* View Mode Dropdown - only show on desktop */}
                <ViewModeDropdown
                  viewMode={viewMode}
                  setViewMode={setViewMode}
                  className="hidden sm:block max-w-[120px] md:max-w-full md:w-full"
                />

                <div className="flex gap-2">
                  {additionalButtons}
                  <Button
                    onClick={handleEditModalOpen}
                    disabled={!userPermissions?.canEdit}
                    className="bg-neutral-900 text-white hover:bg-gray-800 print:hidden disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Edit
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-end -mr-[10px] mb-1">
              {/* View Mode Dropdown - show on mobile */}
              <div className="sm:hidden w-auto print:hidden mr-auto">
                <ViewModeDropdown
                  viewMode={viewMode}
                  setViewMode={setViewMode}
                  className="sm:hidden w-auto mr-auto"
                />
              </div>

              {/* Copy button */}
              <Button
                onClick={() => setShowCopyModal(true)}
                variant="ghost"
                size="icon"
                className="print:hidden"
                title="Copy Gang"
              >
                <FaRegCopy className="w-5 h-5" />
              </Button>

              {/* Gang Logs button */}
              <Button
                onClick={() => setShowLogsModal(true)}
                variant="ghost"
                size="icon"
                className="print:hidden"
                title="View Gang Logs"
              >
                <LuLogs className="w-[23px] h-[23px]" />
              </Button>

              {/* Screenshot button */}
              <Button
                onClick={handleScreenshot}
                variant="ghost"
                size="icon"
                className="print:hidden"
                title="Take Screenshot"
              >
                <FiCamera className="w-5 h-5" />
              </Button>

              {/* Share button */}
              <Button
                onClick={() => shareUrl(name)}
                variant="ghost"
                size="icon"
                className="print:hidden"
                title="Share Gang"
              >
                <FiShare2 className="w-5 h-5" />
              </Button>

              {/* Print button */}
              <Button
                onClick={() => setShowPrintModal(true)}
                variant="ghost"
                size="icon"
                className="print:hidden"
                title="Print Options"
              >
                <FiPrinter className="w-5 h-5" />
              </Button>
            </div>

            <div className="flex flex-col gap-2 mb-4">
              {/* Owner */}
              <div className="text-muted-foreground">
                {username && (
                  <div className="flex items-center gap-1 text-sm mt-1">
                    Owner: 
                      <Link href={`/user/${user_id}`}>
                        <Badge variant="outline" className="flex items-center gap-1 hover:bg-accent transition-colors">
                          {patreon_tier_id && (
                            <PatreonSupporterIcon
                              patreonTierId={patreon_tier_id}
                              patreonTierTitle={patreon_tier_title}
                            />
                          )}
                          {username}
                        </Badge>
                      </Link>
                  </div>
                )}
              </div>

              {/* Gang Attributes */}
              <div className="text-muted-foreground">
                <div className="text-muted-foreground text-sm mb-1">
                  <div className="flex flex-wrap gap-x-2 gap-y-1">
                    {/* Gang Type */}
                    <div className="flex items-center gap-1">
                      Type: <Badge variant="secondary">{gang_type}</Badge>
                    </div>
                    {gang_type_has_origin && gang_origin_name && (<div className="flex items-center gap-1">
                      {gangOriginCategoryName}: <Badge variant="secondary">{gang_origin_name}</Badge>
                    </div>)}
                    {/* Gang Variants */}
                    {gangVariants.length > 0 && gangIsVariant && !(gangVariants.length === 1 && gangVariants[0].variant === 'Outlaw') && (
                      <div className="flex items-center gap-1">
                        Variants:
                        {gangVariants
                          .filter((variant) => variant.variant !== 'Outlaw')
                          .map((variant) => (
                            <Badge key={variant.id} variant="secondary">
                              {variant.variant}
                            </Badge>
                          ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Affiliation */}
                {gang_type_has_affiliation && gangAffiliationName && (
                <div className="text-muted-foreground text-sm mb-1">
                  <div className="flex flex-wrap gap-x-2 gap-y-1">
                    <div className="flex items-center gap-1">
                      Affiliation: <Badge variant="secondary">{gangAffiliationName}</Badge>
                    </div>
                  </div>
                </div>
                )}

                {/* Alignment, Alliance */}
                <div className="text-muted-foreground text-sm">
                  <div className="flex flex-wrap gap-x-2 gap-y-1">
                    {/* Alignment */}
                    <div className="flex items-center gap-1 text-sm">
                      Alignment:
                      <Badge variant="secondary">{alignment}</Badge>
                    </div>
                    {/* Alliance */}
                    {allianceId && allianceName && (
                      <div className="flex items-center gap-1 text-sm">
                        Alliance:
                        <Badge variant="secondary">{allianceName}</Badge>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Campaign Attributes */}
              {campaigns?.[0] && (
                <div className="text-muted-foreground">
                  <div className="flex flex-wrap gap-x-2 gap-y-1">
                    {/* Campaign Name */}
                      <div className="flex items-center gap-1 text-sm">
                        Campaign: <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                          <Link 
                            href={`/campaigns/${campaigns[0].campaign_id}`} 
                            className="flex items-center"
                            data-tooltip-id={`campaign-name-tooltip-${id}`}
                            data-tooltip-content={campaigns[0].campaign_name.length > 30 ? campaigns[0].campaign_name : undefined}
                          >
                            {campaigns[0].campaign_name.length > 30 
                              ? `${campaigns[0].campaign_name.substring(0, 30)}...` 
                              : campaigns[0].campaign_name}
                          </Link>
                        </Badge>
                      </div>
                    {/* Allegiance */}
                    {currentAllegiance !== null && (currentAllegiance || campaigns?.[0]?.allegiance) && (
                      <div className="flex items-center gap-1 text-sm">
                        Allegiance:
                        <Badge variant="secondary">{(currentAllegiance || campaigns?.[0]?.allegiance)?.name}</Badge>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-2">
              <div className="grid grid-cols-2 md:gap-x-20 gap-x-10 text-sm">

                {/* 1st Column */}
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rating:</span>
                    <span className="font-semibold">{rating != null ? rating : 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Credits:</span>
                    <span className="font-semibold">{credits != null ? credits : 0}</span>
                  </div>
                  <div
                    className="flex justify-between cursor-help"
                    data-tooltip-id="wealth-breakdown-tooltip"
                    data-tooltip-html={wealthTooltipHtml}
                  >
                    <span className="text-muted-foreground">Wealth:</span>
                    <span className="font-semibold">{wealth ?? 0}</span>
                  </div>
                </div>

                {/* 2nd Column */}
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reputation:</span>
                    <span className="font-semibold">{reputation != null ? reputation : 0}</span>
                  </div>
                  {/* Dynamic Campaign Resources */}
                  {campaignResources.map((resource) => (
                    <div key={resource.resource_id} className="flex justify-between">
                      <span className="text-muted-foreground">
                        {resource.resource_name.length > 12 
                          ? `${resource.resource_name.substring(0, 10)}...` 
                          : resource.resource_name}:
                      </span>
                      <span className="font-semibold">{resource.quantity}</span>
                    </div>
                  ))}
                  {/* Gang Composition */}
                  <div
                    className="flex justify-between cursor-help"
                    data-tooltip-id="gang-composition-tooltip"
                    data-tooltip-html={fightersTooltipHtml}
                  >
                    <span className="text-muted-foreground">Gang Size:</span>
                    <span className="font-semibold">{activeFighters.length}</span>
                  </div>
                </div>

              </div>
            </div>
            <div className="mt-3 flex flex-row item-center justify-between text-xs text-muted-foreground">
              <span>Created: {formatDate(created_at)}</span>
              <span>Last Updated: {formatDate(lastUpdated)}</span>
            </div>
            <div className="mt-2 flex flex-wrap sm:justify-end justify-center gap-2">
              <Button
                onClick={handleAddFighterClick}
                disabled={!userPermissions?.canEdit}
                className="bg-neutral-900 text-white w-full min-w-[135px] sm:w-auto hover:bg-gray-800 print:hidden disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Fighter
              </Button>
              <Button
                onClick={handleAddVehicleModalOpen}
                disabled={!userPermissions?.canEdit}
                className="bg-neutral-900 text-white flex-1 min-w-[135px] sm:flex-none hover:bg-gray-800 print:hidden disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Vehicle
              </Button>
              <Button
                onClick={handleGangAdditionsModalOpen}
                disabled={!userPermissions?.canEdit}
                className="bg-neutral-900 text-white flex-1 min-w-[135px] sm:flex-none hover:bg-gray-800 print:hidden disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Gang Additions
              </Button>
            </div>
          </div>

          {showPrintModal && (
            <PrintModal gangId={id} onClose={() => setShowPrintModal(false)} />
          )}

          <GangEditModal
            isOpen={showEditModal}
            onClose={() => setShowEditModal(false)}
            gangId={id}
            gangName={name}
            credits={credits}
            reputation={reputation}
            meat={meat}
            scavengingRolls={scavengingRolls}
            explorationPoints={explorationPoints}
            power={power}
            isGangOwner={userPermissions?.isOwner}
            isAdmin={userPermissions?.isAdmin}
            sustenance={sustenance}
            salvage={salvage}
            alignment={alignment}
            allianceId={allianceId}
            allianceName={allianceName}
            gangColour={gangColour}
            gangVariants={gangVariants}
            availableVariants={availableVariants}
            gangAffiliationId={gangAffiliationId}
            gangAffiliationName={gangAffiliationName}
            gangTypeHasAffiliation={gang_type_has_affiliation}
            gangOriginId={gangOriginId}
            gangOriginName={gangOriginName}
            gangOriginCategoryName={gangOriginCategoryName}
            gangTypeHasOrigin={gang_type_has_origin || false}
            hidden={hidden}
            campaigns={campaignsWithOptimisticData}
            onSave={handleGangUpdate}
          />

          {showAddFighterModal && (
            <AddFighter
              showModal={showAddFighterModal}
              setShowModal={setShowAddFighterModal}
              gangId={id}
              gangTypeId={gang_type_id}
              initialCredits={credits}
              onFighterAdded={handleFighterAdded}
              gangVariants={gangVariants}
              gangAffiliationId={gangAffiliationId}
            />
          )}

          {showAddVehicleModal && (
            <AddVehicle
              showModal={showAddVehicleModal}
              setShowModal={setShowAddVehicleModal}
              gangId={id}
              initialCredits={credits}
              onVehicleAdd={handleVehicleAdded}
              onGangCreditsUpdate={onGangCreditsUpdate}
              onGangWealthUpdate={onGangWealthUpdate}
            />
          )}

          {showGangAdditionsModal && (
            <GangAdditions
              showModal={showGangAdditionsModal}
              setShowModal={setShowGangAdditionsModal}
              gangId={id}
              gangTypeId={gang_type_id}
              initialCredits={credits}
              onFighterAdded={handleFighterAdded}
              gangAffiliationId={gangAffiliationId}
            />
          )}

          <GangLogs
            gangId={id}
            isOpen={showLogsModal}
            onClose={() => setShowLogsModal(false)}
          />
          <CopyGangModal
            gangId={id}
            currentName={name}
            isOpen={showCopyModal}
            onClose={() => setShowCopyModal(false)}
          />
          <GangImageEditModal
            isOpen={showImageModal}
            onClose={() => setShowImageModal(false)}
            currentImageUrl={currentGangImageUrl}
            gangId={id}
            onImageUpdate={handleGangImageUpdate}
            defaultImageUrl={getDefaultImageUrl() || undefined}
            defaultImageUrls={gang_type_default_image_urls}
            currentDefaultImageIndex={currentDefaultGangImage}
          />
          <Tooltip
            id="gang-composition-tooltip"
            place="top"
            className="!bg-neutral-900 !text-white !text-xs !z-[2000]"
            delayHide={100}
            clickable={true}
            style={{
              padding: '6px',
              maxWidth: '24rem'
            }}
          />
          <Tooltip
            id="wealth-breakdown-tooltip"
            place="top"
            className="!bg-neutral-900 !text-white !text-xs !z-[2000]"
            delayHide={100}
            clickable={true}
            style={{
              padding: '6px',
              maxWidth: '24rem'
            }}
          />
        </div>

        <div id="gang_card_additional_details" className="hidden print:block bg-card shadow-md rounded-lg p-4 flex items-start gap-6 print:print-fighter-card print:border-2 print:border-black truncate">
          <div className="flex-grow w-full">
            <div className="flex justify-between items-start mb-1">
              <h2 className="text-xl font-bold">Additional Details</h2>
            </div>

            <div className="text-muted-foreground mb-4">
              <div className="flex flex-wrap gap-4">
                {campaigns && campaigns[0]?.territories.length > 0 && (
                  <div className="flex gap-1 items-center text-sm flex-wrap">
                    Territories:
                    {[...campaigns[0]?.territories]
                      .sort((a, b) => a.territory_name.localeCompare(b.territory_name))
                      .map((territory) => (
                        <Badge
                          key={territory.id}
                          variant="secondary"
                          className="cursor-pointer hover:bg-secondary flex items-center gap-1"
                        >
                          {territory.territory_name}
                          {territory.ruined && <GiAncientRuins className="text-red-500" />}
                        </Badge>
                      ))}
                  </div>
                )}
              </div>
              {stash && stash.length > 0 && (
                <div className="flex flex-wrap gap-1 items-center text-sm mt-2">
                  <span>Stash:</span>
                  {stash
                    .slice() // Create a shallow copy to avoid mutating the original array
                    .sort((a, b) => (a.equipment_name ?? "").localeCompare(b.equipment_name ?? "")) // Ensure values are always strings
                    .map((item) => (
                      <Badge key={item.id} variant="outline" className="cursor-pointer hover:bg-secondary">
                        {item.equipment_name} ({item.cost} credits)
                      </Badge>
                  ))}
                </div>
              )}
              {note && (
                <div className="gap-1 text-sm mt-2">
                  Notes:
                  <div className="gap-1 text-sm">
                    <div 
                      className="prose prose-sm max-w-none text-wrap"
                      dangerouslySetInnerHTML={{ __html: note }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className={`print:visible ${viewMode !== 'normal' ? 'w-full flex flex-wrap gap-2 justify-center items-start px-0 print:gap-0' : ''}`}>
        {(() => {
          // Filter out exotic beasts whose granting equipment is in stash
          const visibleFighters = useMemo(() => {
            return fighters.filter(fighter => {
              // Hide exotic beasts whose granting equipment is in stash
              if (fighter.fighter_class?.toLowerCase() === 'exotic beast' && fighter.beast_equipment_stashed) {
                return false;
              }
              return true;
            });
          }, [fighters]);

          return visibleFighters.length > 0 ? (
          <DraggableFighters
              fighters={visibleFighters}
            onPositionsUpdate={handlePositionsUpdate}
            onFightersReorder={handleFightersReorder}
            initialPositions={positions}
            viewMode={viewMode}
            userPermissions={userPermissions}
          />
        ) : (
          <div className="text-white italic text-center">No fighters added yet.</div>
          );
        })()}
      </div>
    </div>
  );
}

interface StatItemProps {
  label: string;
  value: number | string | null;
  isEditing: boolean;
  editedValue: string;
  onChange: (value: string) => void;
  type?: 'number' | 'select';
  options?: string[];
}

function StatItem({
  label,
  value,
  isEditing,
  editedValue,
  onChange,
  type = 'number',
  options = []
}: StatItemProps) {
  return (
    <div>
      <p className="text-muted-foreground text-sm truncate">{label}:</p>
      {isEditing ? (
        type === 'select' ? (
          <select
            value={editedValue}
            onChange={(e) => onChange(e.target.value)}
            className="w-full p-2 border rounded font-semibold"
          >
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          <Input
            type="number"
            value={editedValue}
            onChange={(e) => onChange(e.target.value)}
            className="font-semibold w-full"
          />
        )
      ) : (
        <p className="font-semibold">
          {value != null ? value : 0}
        </p>
      )}
    </div>
  );
}
