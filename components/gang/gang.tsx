'use client';

import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import DeleteGangButton from "./delete-gang-button";
import { FighterProps } from '@/types/fighter';
import Modal from '@/components/modal';
import { useToast } from "@/components/ui/use-toast";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { StashItem } from '@/types/gang';
import { VehicleProps } from '@/types/vehicle';
import Image from 'next/image';
import { DraggableFighters } from './draggable-fighters';
import { FighterType, EquipmentOption } from '@/types/fighter-type';
import { allianceRank } from "@/utils/allianceRank";
import { fighterClassRank } from "@/utils/fighterClassRank";
import { GiAncientRuins } from "react-icons/gi";
import { gangVariantRank } from "@/utils/gangVariantRank";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import AddFighter from './add-fighter';
import GangAdditions from './gang-additions';
import AddVehicle from './add-vehicle';
import { gangVariantFighterModifiers } from '@/utils/gangVariantMap';
import PrintModal from "@/components/print-modal";
import { FiPrinter, FiShare2, FiCamera } from 'react-icons/fi';
import { useShare } from '@/hooks/use-share';
import html2canvas from 'html2canvas';
import { HexColorPicker } from "react-colorful";

interface VehicleType {
  id: string;
  vehicle_type: string;
  cost: number;
  movement: number;
  front: number;
  side: number;
  rear: number;
  hull_points: number;
  handling: number;
  save: number;
  body_slots: number;
  drive_slots: number;
  engine_slots: number;
  special_rules: string[];
}

interface DefaultEquipmentItem {
  id: string;
  quantity: number;
  equipment_name?: string;
  equipment_category?: string;
}

interface WeaponsSelection {
  options: EquipmentOption[];
  default?: DefaultEquipmentItem[];
  select_type: 'single' | 'multiple' | 'optional';
}

interface EquipmentSelection {
  weapons?: WeaponsSelection;
}

interface GangProps {
  id: string;
  name: string;
  gang_type_id: string;
  gang_type?: string;
  gang_type_image_url: string;
  gang_colour: string | null;
  credits: number | null;
  reputation: number | null;
  meat: number | null;
  exploration_points: number | null;
  rating: number | null;
  alignment: string;
  alliance_id: string;
  alliance_name: string;
  created_at: string | Date | null;
  last_updated: string | Date | null;
  user_id: string;
  initialFighters: FighterProps[];
  initialFighterTypes: FighterType[];
  additionalButtons?: React.ReactNode;
  campaigns?: {
    campaign_id: string;
    campaign_name: string;
    role: string | null;
    status: string | null;
    has_meat: boolean;
    has_exploration_points: boolean;
    territories: {
      id: string;
      created_at: string;
      territory_id: string;
      territory_name: string;
      ruined: boolean | null;
      }[];
  }[];
  note?: string;
  stash: StashItem[];
  onStashUpdate?: (newStash: StashItem[]) => void;
  onFighterDeleted?: (fighterId: string, fighterCost: number) => void;
  onVehicleAdd?: (newVehicle: VehicleProps) => void;
  positioning: Record<number, string>;
  gang_variants: Array<{id: string, variant: string}> | null;
  vehicles?: VehicleProps[];
}

export default function Gang({ 
  id, 
  name: initialName, 
  gang_type_id,
  gang_type,
  gang_type_image_url,
  gang_colour: initialGangColour,
  credits: initialCredits, 
  reputation: initialReputation,
  meat: initialMeat,
  exploration_points: initialExplorationPoints,
  rating: initialRating,
  alignment: initialAlignment,
  alliance_id: initialAllianceId,
  alliance_name: initialAllianceName,
  created_at,
  last_updated: initialLastUpdated,
  user_id,
  initialFighters = [],
  initialFighterTypes = [],
  additionalButtons,
  campaigns,
  note,
  stash,
  onStashUpdate,
  onFighterDeleted,
  onVehicleAdd,
  positioning,
  gang_variants,
  vehicles,
}: GangProps) {
  const safeGangVariant = gang_variants ?? [];
  const { toast } = useToast();
  const { shareUrl } = useShare();
  const gangContentRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(initialName)
  const [credits, setCredits] = useState(initialCredits ?? 0)
  const [reputation, setReputation] = useState(initialReputation ?? 0)
  const [meat, setMeat] = useState(initialMeat ?? 0)
  const [explorationPoints, setExplorationPoints] = useState(initialExplorationPoints ?? 0)
  const [rating, setRating] = useState<number>(initialRating ?? 0)
  const [lastUpdated, setLastUpdated] = useState(initialLastUpdated)
  const [isEditing, setIsEditing] = useState(false)
  const [editedName, setEditedName] = useState(initialName)
  const [gangColour, setGangColour] = useState<string>(initialGangColour ?? '')
  const [editedCredits, setEditedCredits] = useState('');
  const [editedReputation, setEditedReputation] = useState('');
  const [editedMeat, setEditedMeat] = useState((initialMeat ?? 0).toString())
  const [editedExplorationPoints, setEditedExplorationPoints] = useState((initialExplorationPoints ?? 0).toString())
  const [fighters, setFighters] = useState<FighterProps[]>(initialFighters);
  const [alignment, setAlignment] = useState(initialAlignment);
  const [editedAlignment, setEditedAlignment] = useState(initialAlignment);
  const [editedAllianceId, setEditedAllianceId] = useState(initialAllianceId);
  const [editedAllianceName, setEditedAllianceName] = useState(initialAllianceName);
  const [allianceList, setAllianceList] = useState<Array<{id: string, alliance_name: string, strong_alliance: string}>>([]);
  const [allianceListLoaded, setAllianceListLoaded] = useState(false);
  const [allianceId, setAllianceId] = useState<string | null>(initialAllianceId);
  const [allianceName, setAllianceName] = useState(initialAllianceName);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddFighterModal, setShowAddFighterModal] = useState(false);
  const [showAddVehicleModal, setShowAddVehicleModal] = useState(false);
  const [positions, setPositions] = useState<Record<number, string>>(positioning);
  const [showGangAdditionsModal, setShowGangAdditionsModal] = useState(false);
  const [fighterTypes, setFighterTypes] = useState<FighterType[]>(initialFighterTypes);
  const [gangIsVariant, setGangIsVariant] = useState(safeGangVariant.length > 0);
  const [gangVariants, setGangVariants] = useState<Array<{id: string, variant: string}>>(safeGangVariant);
  const [editedGangIsVariant, setEditedGangIsVariant] = useState(safeGangVariant.length > 0);
  const [editedGangVariants, setEditedGangVariants] = useState<Array<{id: string, variant: string}>>(safeGangVariant);
  const [availableVariants, setAvailableVariants] = useState<Array<{id: string, variant: string}>>([]);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showColourPickerModal, setShowColourPickerModal] = useState(false);
  const [editedGangColour, setEditedGangColour] = useState(gangColour);
  // Page view mode
  const [viewMode, setViewMode] = useState<'normal' | 'small' | 'medium' | 'large'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('gang_view_mode') as 'normal' | 'small' | 'medium' | 'large') ?? 'normal';
    }
    return 'normal';
  });

  // Calculate the total value of unassigned vehicles
  const unassignedVehiclesValue = useMemo(() => {
    if (!vehicles || vehicles.length === 0) return 0;
    return vehicles.reduce((total, vehicle) => total + (vehicle.cost || 0), 0);
  }, [vehicles]);

  // Calculate the total value of the Stash
  const totalStashValue = stash.reduce((total, item) => total + (item.cost || 0), 0);


  // view mode
  useEffect(() => {
    // Update main content wrapper size
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

    // Persist view mode in localStorage
    localStorage.setItem('gang_view_mode', viewMode);
  }, [viewMode]);

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    console.error('Failed to load image:', e.currentTarget.src);
    e.currentTarget.src = "https://res.cloudinary.com/dle0tkpbl/image/upload/v1732965431/default-gang_image.jpg";
  };

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

const syncGangVariantsWithAlignment = (newAlignment: string) => {
  const outlaw = availableVariants.find(v => v.variant === 'Outlaw');
  const hasOutlaw = editedGangVariants.some(v => v.variant === 'Outlaw');

  if (newAlignment === 'Outlaw' && outlaw && !hasOutlaw) {
    setEditedGangVariants(prev => [...prev, outlaw]);
  } else if (newAlignment === 'Law Abiding' && hasOutlaw) {
    setEditedGangVariants(prev => prev.filter(v => v.variant !== 'Outlaw'));
  }
};

const handleAlignmentChange = (value: string) => {
  setEditedAlignment(value);
  syncGangVariantsWithAlignment(value);
};

  const handleSave = async () => {
    try {
      const creditsDifference = parseInt(editedCredits) || 0;
      const reputationDifference = parseInt(editedReputation) || 0;

      // Optimistically update the UI before the API request completes
      const prevName = name;
      const prevCredits = credits;
      const prevAlignment = alignment;
      const prevAllianceId = allianceId;
      const prevAllianceName = allianceName;
      const prevReputation = reputation;
      const prevMeat = meat;
      const prevExplorationPoints = explorationPoints;
      const prevGangVariants = [...gangVariants];
      const prevGangIsVariant = gangIsVariant;
      const prevGangColour = gangColour;

      // Update state optimistically
      setName(editedName);
      setCredits(prevCredits + creditsDifference);
      setAlignment(editedAlignment);
      setAllianceId(editedAllianceId === '' ? null : editedAllianceId);
      setAllianceName(allianceList.find(a => a.id === editedAllianceId)?.alliance_name || "");
      setReputation(prevReputation + reputationDifference);
      setMeat(parseInt(editedMeat));
      setExplorationPoints(parseInt(editedExplorationPoints));
      setGangIsVariant(editedGangIsVariant);
      setGangVariants(editedGangVariants);
      setGangColour(editedGangColour);
      fetchFighterTypes(editedGangVariants);

      const response = await fetch(`/api/gangs/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: editedName,
          credits: Math.abs(creditsDifference),
          credits_operation: creditsDifference >= 0 ? 'add' : 'subtract',
          alignment: editedAlignment,
          alliance_id: editedAllianceId === '' ? null : editedAllianceId,
          reputation: Math.abs(reputationDifference),
          reputation_operation: reputationDifference >= 0 ? 'add' : 'subtract',
          meat: parseInt(editedMeat),
          exploration_points: parseInt(editedExplorationPoints),
          gang_variants: editedGangVariants.map(v => v.id),
          gang_colour: editedGangColour,
        }),
      });

      if (!response.ok) {
        // Revert optimistic updates if the request fails
        setName(prevName);
        setCredits(prevCredits);
        setAlignment(prevAlignment);
        setAllianceId(prevAllianceId);
        setAllianceName(prevAllianceName);
        setReputation(prevReputation);
        setMeat(prevMeat);
        setExplorationPoints(prevExplorationPoints);
        setGangIsVariant(prevGangIsVariant);
        setGangVariants(prevGangVariants);
        setGangColour(prevGangColour);
        
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const updatedGang = await response.json();
      
      // Since we've already updated the state optimistically,
      // just need to update last_updated from the response
      setLastUpdated(updatedGang.last_updated);

      toast({
        description: "Gang updated successfully",
        variant: "default"
      });

      setShowEditModal(false);
      setEditedCredits('');
      return false;
    } catch (error) {
      console.error('Error updating gang:', error);
      
      toast({
        title: "Error",
        description: "Failed to update gang. Please try again.",
        variant: "destructive"
      });

      return false;
    }
  };

  const handleAddFighterClick = () => {
    if (fighterTypes.length === 0) {
      fetchFighterTypes();
    }
    setShowAddFighterModal(true);
  };

  const fetchFighterTypes = async (variantList: Array<{ id: string, variant: string }> = gang_variants ?? []) => {
    try {
      // Fetch base Gang fighter types
      const response = await fetch(
        'https://iojoritxhpijprgkjfre.supabase.co/rest/v1/rpc/get_add_fighter_details',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
          },
          body: JSON.stringify({ p_gang_type_id: gang_type_id })
        }
      );

      if (!response.ok) throw new Error('Failed to fetch Gang fighter types');

      let baseData = await response.json();

      // If variantList, fetch Gang Variants fighter types
      for (const variant of variantList) {
        const variantModifier = gangVariantFighterModifiers[variant.id];
        if (!variantModifier) continue;

        if (variantModifier.removeLeaders) {
          baseData = baseData.filter((type: any) => type.fighter_class !== 'Leader');
        }

        const variantResponse = await fetch(
          'https://iojoritxhpijprgkjfre.supabase.co/rest/v1/rpc/get_add_fighter_details',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            },
            body: JSON.stringify({ p_gang_type_id: variantModifier.variantGangTypeId })
          }
        );

        if (!variantResponse.ok) throw new Error(`Failed to fetch fighters for variant ${variant.variant}`);

        const variantData = await variantResponse.json();
        baseData = [...baseData, ...variantData];
      }

      const processedTypes: FighterType[] = baseData
        .map((type: any) => ({
          id: type.id,
          fighter_type_id: type.id,
          fighter_type: type.fighter_type,
          fighter_class: type.fighter_class,
          sub_type: type.sub_type,
          fighter_sub_type_id: type.fighter_sub_type_id,
          cost: type.cost,
          total_cost: type.total_cost,
          equipment_selection: type.equipment_selection,
          default_equipment: type.default_equipment || [],
          special_rules: type.special_rules || []
        }))
        .sort((a: FighterType, b: FighterType) => {
          const rankA = fighterClassRank[a.fighter_class?.toLowerCase() || ""] ?? Infinity;
          const rankB = fighterClassRank[b.fighter_class?.toLowerCase() || ""] ?? Infinity;
          if (rankA !== rankB) return rankA - rankB;
          return (a.fighter_type || "").localeCompare(b.fighter_type || "");
        });

      setFighterTypes(processedTypes);
    } catch (error) {
      console.error('Error fetching fighter types:', error);
      toast({
        description: "Failed to load fighter types",
        variant: "destructive"
      });
    }
  };


  const handleGangAdditionsModalOpen = () => {
    setShowGangAdditionsModal(true);
  };

  // Add the handler for when a fighter is added
  const handleFighterAdded = (newFighter: FighterProps, cost: number) => {
    setFighters(prev => [...prev, newFighter]);
    setCredits(prev => prev - cost); // Deduct what was actually paid
    setRating(prev => prev + newFighter.credits); // Add the fighter's rating cost
  };

  const handleDeleteFighter = async (fighterId: string) => {
    const fighter = fighters.find(f => f.id === fighterId);
    if (!fighter) return;

    try {
      // Optimistically update UI
      const fighterCost = fighter.credits;
      setFighters(prev => prev.filter(f => f.id !== fighterId));
      setRating(prev => prev - fighterCost);
      onFighterDeleted?.(fighterId, fighterCost);
      
      const response = await fetch(`/api/fighters/${fighterId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        // Revert optimistic update if the request fails
        setFighters(prev => [...prev, fighter]);
        setRating(prev => prev + fighterCost);
        throw new Error('Failed to delete fighter');
      }

      toast({
        description: "Fighter deleted successfully",
        variant: "default"
      });
    } catch (error) {
      console.error('Error deleting fighter:', error);
      toast({
        title: "Error",
        description: "Failed to delete fighter. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleEditModalOpen = async () => {
    setEditedName(name);
    setEditedCredits('');
    setEditedAlignment(alignment);
    setEditedReputation('');
    setEditedMeat(meat?.toString() || '0');
    setEditedExplorationPoints(explorationPoints?.toString() || '0');
    setEditedGangIsVariant(gangIsVariant);
    setEditedGangVariants([...gangVariants]);
    
    try {
      // Fetch all available variants
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
    
    setShowEditModal(true);
  };

  const editModalContent = (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">Gang Name</p>
        <Input
          type="text"
          value={editedName}
          onChange={(e) => setEditedName(e.target.value)}
          className="w-full"
          placeholder="Gang name"
        />
      </div>

      <div className="flex flex-row gap-4">
        {/* Alignment Section */}
        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium">Alignment</p>
          <select
            value={editedAlignment || ''}
            onChange={(e) => handleAlignmentChange(e.target.value)}
            className="w-full p-2 border rounded"
          >
            <option value="">Select Alignment</option>
            <option value="Law Abiding">Law Abiding</option>
            <option value="Outlaw">Outlaw</option>
          </select>
        </div>

        {/* Gang Colour Section */}
        <div className="space-y-2">
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm font-medium">Gang Colour</p>
            <div
              className="w-8 h-8 rounded-full border border-black border-2 cursor-pointer"
              style={{ backgroundColor: editedGangColour }}
              title="Click to change colour"
              onClick={() => setShowColourPickerModal(true)}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Credits</p>
        <Input
          type="tel"
          inputMode="url"
          pattern="-?[0-9]+"
          value={editedCredits}
          onChange={(e) => {
            const value = e.target.value;
            setEditedCredits(value);
          }}
          className="flex-1"
          placeholder="Add or remove credits (e.g. 25 or -50)"
        />
        <p className="text-sm text-gray-500">
          Current credits: {credits}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Reputation</p>
        <Input
          type="tel"
          inputMode="url"
          pattern="-?[0-9]+"
          value={editedReputation}
          onChange={(e) => setEditedReputation(e.target.value)}
          className="flex-1"
          placeholder="Add or remove reputation (e.g. 1 or -2)"
        />
        <p className="text-sm text-gray-500">
          Current reputation: {reputation}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Alliance</p>
        <select
          value={editedAllianceId || ""}
          onChange={(e) => setEditedAllianceId(e.target.value)}
          onFocus={fetchAlliances}
          className="w-full p-2 border rounded-md"
        >
          {/* Default "None" option */}
          <option value="">None</option>

          {/* Display alliances after they are loaded */}
          {allianceListLoaded ? (
            Object.entries(
              allianceList
                .sort((a, b) => {
                  const rankA = allianceRank[a.alliance_name.toLowerCase()] ?? Infinity;
                  const rankB = allianceRank[b.alliance_name.toLowerCase()] ?? Infinity;
                  return rankA - rankB;
                })
                .reduce((groups, type) => {
                  const rank = allianceRank[type.alliance_name.toLowerCase()] ?? Infinity;
                  let groupLabel = "Other Alliances"; // Default category for unlisted alliances

                  if (rank <= 9) groupLabel = "Criminal Organisations";
                  else if (rank <= 19) groupLabel = "Merchant Guilds";
                  else if (rank <= 29) groupLabel = "Noble Houses";

                  if (!groups[groupLabel]) groups[groupLabel] = [];
                  groups[groupLabel].push(type);
                  return groups;
                }, {} as Record<string, typeof allianceList>)
            ).map(([groupLabel, allianceList]) => (
              <optgroup key={groupLabel} label={groupLabel}>
                {allianceList.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.alliance_name}
                  </option>
                ))}
              </optgroup>
            ))
          ) : (
            <>
              {initialAllianceId && <option value={initialAllianceId}>{initialAllianceName}</option>}
              <option value="" disabled>Loading Alliances...</option>
            </>
          )}
        </select>
      </div>
      {campaigns?.[0]?.has_meat && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Meat
          </label>
          <Input
            type="tel"
            inputMode="url"
            pattern="-?[0-9]+"
            value={editedMeat}
            onChange={(e) => setEditedMeat(e.target.value)}
          />
        </div>
      )}
      {campaigns?.[0]?.has_exploration_points && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Exploration Points
          </label>
          <Input
            type="tel"
            inputMode="url"
            pattern="-?[0-9]+"
            value={editedExplorationPoints}
            onChange={(e) => setEditedExplorationPoints(e.target.value)}
          />
        </div>
      )}
      <div className="mt-4">
        <div className="flex items-center space-x-2">
          <label htmlFor="variant-toggle" className="text-sm font-medium">
            Gang Variants
          </label>
          <Switch
            id="variant-toggle"
            checked={editedGangIsVariant}
            onCheckedChange={setEditedGangIsVariant}
          />
        </div>

        {editedGangIsVariant && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ">
            {/* Unaffiliated variants */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Unaffiliated</h3>
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
                        <div className="border-t border-gray-300" />
                      )}
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`variant-${variant.id}`}
                          checked={editedGangVariants.some(v => v.id === variant.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setEditedGangVariants(prev => [...prev, variant]);
                            } else {
                              setEditedGangVariants(prev => prev.filter(v => v.id !== variant.id));
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
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Outlaw / Corrupted</h3>
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
                        checked={editedGangVariants.some(v => v.id === variant.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setEditedGangVariants(prev => [...prev, variant]);
                          } else {
                            setEditedGangVariants(prev => prev.filter(v => v.id !== variant.id));
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
      
      <DeleteGangButton gangId={id} />
    </div>
  );

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

  const handlePositionsUpdate = async (newPositions: Record<number, string>) => {
    try {
      console.log('Sending updated positions to API:', newPositions);
      
      const response = await fetch(`/api/gangs/${id}/positioning`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ positions: newPositions }),
      });

      if (!response.ok) {
        throw new Error('Failed to update positions');
      }

      const updatedData = await response.json();
      console.log('API response:', updatedData);
      
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
        <div id="gang_card" className="bg-white shadow-md rounded-lg p-4 flex items-start gap-6 print:print-fighter-card print:border-2 print:border-black">
          {/* Left Section: Illustration */}
          <div className="hidden sm:flex relative w-[200px] h-[200px] md:w-[250px] md:h-[250px] mt-1 flex-shrink-0 items-center justify-center print:hidden">
            {gang_type_image_url ? (
              <Image
                src={gang_type_image_url}
                alt={name}
                width={180}
                height={180}
                className="absolute rounded-full object-cover mt-1 z-10 w-[180px] h-auto"
                priority={false}
                quality={100}
                onError={handleImageError}
              />
            ) : (
              <div className="absolute w-[180px] h-[180px] rounded-full bg-gray-200 z-10 flex items-center justify-center">
                {name.charAt(0)}
              </div>
            )}
            <Image
              src="https://res.cloudinary.com/dle0tkpbl/image/upload/v1747056786/cogwheel-gang-portrait_vbu4c5.webp"
              alt="Cogwheel"
              width={250}
              height={250}
              className="absolute z-20 w-[250px] h-auto"
              priority
              quality={100}
            />
          </div>

          {/* Right Section: Content */}
          <div className="flex-grow w-full">
            <div className="flex justify-between items-start">
              <h2 className="text-xl md:text-2xl font-bold">{name}</h2>
              <div className="flex gap-2 print:hidden">

                {/* View Mode Dropdown */}
                <div className="max-w-[120px] md:max-w-full md:w-full print:hidden">
                  <select
                    id="view-mode-select"
                    value={viewMode}
                    onChange={(e) => setViewMode(e.target.value as 'normal' | 'small' | 'medium' | 'large')}
                    className="w-full p-2 border rounded-md border-gray-300 focus:outline-none focus:ring-2 focus:ring-black"
                  >
                    <option value="normal">Page View</option>
                    <option value="small">Small Cards</option>
                    <option value="medium">Medium Cards</option>
                    <option value="large">Large Cards</option>
                  </select>
                </div>

                <div>
                  {additionalButtons}
                  <button
                    onClick={handleEditModalOpen}
                    className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800 print:hidden"
                  >
                    Edit
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-end -mr-[10px]">
              {/* Sreenshot button */}
              <Button
                onClick={handleScreenshot}
                variant="ghost"
                size="icon"
                className="print:hidden"
                title="Share Gang"
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

            <div className="text-gray-600 mb-4">
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-1 text-sm">
                  Type: <Badge variant="secondary">{gang_type}</Badge>
                </div>
                {campaigns?.[0] && (
                  <div className="flex items-center gap-1 text-sm">
                    Campaign: <Badge variant="outline" className="cursor-pointer hover:bg-secondary">
                      <Link href={`/campaigns/${campaigns[0].campaign_id}`} className="flex items-center">
                        {campaigns[0].campaign_name}
                      </Link>
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            <div className="text-gray-600 mb-4">
              <div className="flex flex-wrap gap-4">
                {gangVariants.length > 0 && gangIsVariant && (
                  <div className="flex items-center gap-1 text-sm">Variants:
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

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-4 mt-2">
              <StatItem
                label="Alignment"
                value={alignment}
                isEditing={isEditing}
                editedValue={editedAlignment}
                onChange={handleAlignmentChange}
                type="select"
                options={['Law Abiding', 'Outlaw']}
              />
              <StatItem
                label="Reputation"
                value={reputation}
                isEditing={isEditing}
                editedValue={editedReputation}
                onChange={setEditedReputation}
              />
              <StatItem
                label="Credits"
                value={credits}
                isEditing={isEditing}
                editedValue={editedCredits}
                onChange={setEditedCredits}
              />
              <StatItem
                label="Rating"
                value={rating}
                isEditing={false}
                editedValue={typeof rating === 'number' ? rating.toString() : '0'}
                onChange={() => {}}
              />
              <StatItem
                label="Wealth"
                value={rating + credits + unassignedVehiclesValue + totalStashValue}
                isEditing={false}
                editedValue={typeof rating === 'number' ? rating.toString() : '0'}
                onChange={() => {}}
              />
              {allianceName && (
                <StatItem
                  label="Alliance"
                  value={allianceName}
                  isEditing={isEditing}
                  editedValue={editedAllianceName}
                  onChange={setEditedAllianceName}
                />
              )}
              {campaigns?.[0]?.has_meat && (
                <StatItem
                  label="Meat"
                  value={meat}
                  isEditing={isEditing}
                  editedValue={editedMeat}
                  onChange={setEditedMeat}
                />
              )}
              {campaigns?.[0]?.has_exploration_points && (
                <StatItem
                  label="Exploration Points"
                  value={explorationPoints}
                  isEditing={isEditing}
                  editedValue={editedExplorationPoints}
                  onChange={setEditedExplorationPoints}
                />
              )}
            </div>
            <div className="mt-3 flex flex-row item-center justify-between text-xs text-gray-500">
              <span>Created: {formatDate(created_at)}</span>
              <span>Last Updated: {formatDate(lastUpdated)}</span>
            </div>
            <div className="mt-2 flex flex-wrap sm:justify-end justify-center gap-2">
              <Button
                onClick={handleAddFighterClick}
                className="bg-black text-white w-full min-w-[135px] sm:w-auto hover:bg-gray-800 print:hidden"
              >
                Add Fighter
              </Button>
              <Button
                onClick={handleAddVehicleModalOpen}
                className="bg-black text-white flex-1 min-w-[135px] sm:flex-none hover:bg-gray-800 print:hidden"
              >
                Add Vehicle
              </Button>
              <Button
                onClick={handleGangAdditionsModalOpen}
                className="bg-black text-white flex-1 min-w-[135px] sm:flex-none hover:bg-gray-800 print:hidden"
              >
                Gang Additions
              </Button>
            </div>
          </div>

          {showPrintModal && (
            <PrintModal gangId={id} onClose={() => setShowPrintModal(false)} />
          )}

          {showEditModal && (
            <Modal
              title="Edit Gang"
              content={editModalContent}
              onClose={() => {
                setShowEditModal(false);
                setEditedCredits('');
              }}
              onConfirm={handleSave}
              confirmText="Save Changes"
            />
          )}

          {showColourPickerModal && (
            <Modal
              title="Select Gang Colour"
              onClose={() => setShowColourPickerModal(false)}
              onConfirm={() => setShowColourPickerModal(false)}
              confirmText="Close"
              content={
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <HexColorPicker color={editedGangColour} onChange={setEditedGangColour} />
                  </div>
                  <div className="flex justify-center">
                    <input
                      type="text"
                      value={editedGangColour}
                      onChange={(e) => {
                        const val = e.target.value;
                        // Allow only valid 7-character hex strings starting with "#"
                        if (/^#([0-9A-Fa-f]{0,6})$/.test(val)) {
                          setEditedGangColour(val);
                        }
                      }}
                      className="w-32 text-center font-mono border rounded p-1 text-sm"
                      maxLength={7}
                      placeholder="#ffffff"
                    />
                  </div>
                </div>
              }
            />
          )}

          {showAddFighterModal && (
            <AddFighter
              showModal={showAddFighterModal}
              setShowModal={setShowAddFighterModal}
              fighterTypes={fighterTypes}
              gangId={id}
              initialCredits={credits}
              onFighterAdded={handleFighterAdded}
            />
          )}

          {showAddVehicleModal && (
            <AddVehicle
              showModal={showAddVehicleModal}
              setShowModal={setShowAddVehicleModal}
              gangId={id}
              initialCredits={credits}
              onVehicleAdd={handleVehicleAdded}
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
            />
          )}
        </div>

        <div id="gang_card_additional_details" className="hidden print:block bg-white shadow-md rounded-lg p-4 flex items-start gap-6 print:print-fighter-card print:border-2 print:border-black truncate">
          <div className="flex-grow w-full">
            <div className="flex justify-between items-start mb-1">
              <h2 className="text-xl font-bold">Additional Details</h2>
            </div>

            <div className="text-gray-600 mb-4">
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
                    <span className="text-black whitespace-pre-wrap">{note}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className={`print:visible ${viewMode !== 'normal' ? 'w-full flex flex-wrap gap-2 justify-center items-start px-0 print:gap-0' : ''}`}>
        {fighters.length > 0 ? (
          <DraggableFighters
            fighters={fighters}
            onPositionsUpdate={handlePositionsUpdate}
            onFightersReorder={handleFightersReorder}
            initialPositions={positions}
            viewMode={viewMode}
          />
        ) : (
          <div className="text-white italic text-center">No fighters available.</div>
        )}
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
      <p className="text-gray-600 text-sm truncate">{label}:</p>
      {isEditing ? (
        type === 'select' ? (
          <select
            value={editedValue}
            onChange={(e) => onChange(e.target.value)}
            className="w-full p-2 border rounded text-base sm:text-lg font-semibold"
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
            className="text-base sm:text-lg font-semibold w-full"
          />
        )
      ) : (
        <p className="text-base sm:text-base font-semibold">
          {value != null ? value : 0}
        </p>
      )}
    </div>
  );
}