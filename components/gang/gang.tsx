'use client';

import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { FighterProps } from '@/types/fighter';
import { useToast } from "@/components/ui/use-toast";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { StashItem } from '@/types/gang';
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
  scavenging_rolls: number | null;
  exploration_points: number | null;
  rating: number | null;
  alignment: string;
  alliance_id: string;
  alliance_name: string;
  created_at: string | Date | null;
  last_updated: string | Date | null;
  initialFighters: FighterProps[];
  additionalButtons?: React.ReactNode;
  campaigns?: {
    campaign_id: string;
    campaign_name: string;
    role: string | null;
    status: string | null;
    has_meat: boolean;
    has_exploration_points: boolean;
    has_scavenging_rolls: boolean;
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
  onVehicleAdd?: (newVehicle: VehicleProps) => void;
  onFighterAdd?: (newFighter: FighterProps, cost: number) => void;
  onGangCreditsUpdate?: (newCredits: number) => void;
  positioning: Record<number, string>;
  gang_variants: Array<{id: string, variant: string}> | null;
  vehicles?: VehicleProps[];
  userPermissions?: UserPermissions;
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
  scavenging_rolls: initialScavengingRolls,
  exploration_points: initialExplorationPoints,
  rating: initialRating,
  alignment: initialAlignment,
  alliance_id: initialAllianceId,
  alliance_name: initialAllianceName,
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
  positioning,
  gang_variants,
  vehicles,
  userPermissions,
}: GangProps) {
  const safeGangVariant = gang_variants ?? [];
  const { toast } = useToast();
  const { shareUrl } = useShare();
  const gangContentRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(initialName)
  const [credits, setCredits] = useState(initialCredits ?? 0)
  const [reputation, setReputation] = useState(initialReputation ?? 0)
  const [meat, setMeat] = useState(initialMeat ?? 0)
  const [scavengingRolls, setScavengingRolls] = useState(initialScavengingRolls ?? 0)
  const [explorationPoints, setExplorationPoints] = useState(initialExplorationPoints ?? 0)
  const [rating, setRating] = useState<number>(initialRating ?? 0)
  const [lastUpdated, setLastUpdated] = useState(initialLastUpdated)
  const [gangColour, setGangColour] = useState<string>(initialGangColour ?? '')
  const [fighters, setFighters] = useState<FighterProps[]>(initialFighters);
  const [alignment, setAlignment] = useState(initialAlignment);
  const [allianceId, setAllianceId] = useState<string | null>(initialAllianceId);
  const [allianceName, setAllianceName] = useState(initialAllianceName);
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
  // Page view mode
  const [viewMode, setViewMode] = useState<'normal' | 'small' | 'medium' | 'large'>('normal');

  // Initialize view mode from localStorage after component mounts
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedViewMode = localStorage.getItem('gang_view_mode') as 'normal' | 'small' | 'medium' | 'large';
      if (savedViewMode) {
        setViewMode(savedViewMode);
      }
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


  // Handle gang updates from the edit modal
  const handleGangUpdate = async (updates: any): Promise<boolean> => {
    try {
      // Store previous values for optimistic updates
      const prevName = name;
      const prevCredits = credits;
      const prevAlignment = alignment;
      const prevAllianceId = allianceId;
      const prevAllianceName = allianceName;
      const prevReputation = reputation;
      const prevMeat = meat;
      const prevScavengingRolls = scavengingRolls;
      const prevExplorationPoints = explorationPoints;
      const prevGangVariants = [...gangVariants];
      const prevGangIsVariant = gangIsVariant;
      const prevGangColour = gangColour;

      // Apply optimistic updates
      setName(updates.name);
      const newCredits = prevCredits + (updates.credits_operation === 'add' ? updates.credits : -updates.credits);
      setCredits(newCredits);
      // Update parent component's credits state
      onGangCreditsUpdate?.(newCredits);
      setAlignment(updates.alignment);
      setAllianceId(updates.alliance_id);
      setAllianceName(updates.alliance_id ? '' : ''); // Will be updated from response
      setReputation(prevReputation + (updates.reputation_operation === 'add' ? updates.reputation : -updates.reputation));
      setMeat(updates.meat);
      setScavengingRolls(updates.scavenging_rolls);
      setExplorationPoints(updates.exploration_points);
      setGangColour(updates.gang_colour);
      
      // Handle gang variants
      const newVariants = updates.gang_variants.map((variantId: string) => 
        gangVariants.find(v => v.id === variantId) || { id: variantId, variant: 'Unknown' }
      );
      setGangVariants(newVariants);
      setGangIsVariant(newVariants.length > 0);

      // Use server action instead of fetch
      const { updateGang } = await import('@/app/actions/update-gang');
      const result = await updateGang({
        gang_id: id,
        ...updates
      });

      if (!result.success) {
        // Revert optimistic updates if the request fails
        setName(prevName);
        setCredits(prevCredits);
        // Revert parent component's credits state
        onGangCreditsUpdate?.(prevCredits);
        setAlignment(prevAlignment);
        setAllianceId(prevAllianceId);
        setAllianceName(prevAllianceName);
        setReputation(prevReputation);
        setMeat(prevMeat);
        setScavengingRolls(prevScavengingRolls);
        setExplorationPoints(prevExplorationPoints);
        setGangIsVariant(prevGangIsVariant);
        setGangVariants(prevGangVariants);
        setGangColour(prevGangColour);
        
        throw new Error(result.error || 'Failed to update gang');
      }

      // Update from server response
      if (result.data) {
        setLastUpdated(result.data.last_updated);
        
        // Update alliance name if alliance was changed
        if (result.data.alliance_name) {
          setAllianceName(result.data.alliance_name);
        }
        
        // Update gang variants from server response
        if (result.data.gang_variants) {
          setGangVariants(result.data.gang_variants);
          setGangIsVariant(result.data.gang_variants.length > 0);
        }
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
                    className="bg-black text-white hover:bg-gray-800 print:hidden disabled:opacity-50 disabled:cursor-not-allowed"
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

              {/* Copy button (left of logs) */}
              <Button
                onClick={() => setShowCopyModal(true)}
                variant="ghost"
                size="icon"
                className="print:hidden"
                title="Copy Gang"
              >
                <FaRegCopy className="w-5 h-5" />
              </Button>

              {/* Logs button */}
              <Button
                onClick={() => setShowLogsModal(true)}
                variant="ghost"
                size="icon"
                className="print:hidden"
                title="Show Logs"
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

            <div className="text-gray-600 text-sm mb-1">
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1">
                  Type: <Badge variant="secondary">{gang_type}</Badge>
                </div>
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
            <div className="text-gray-600 text-sm mb-1">
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-1 text-sm">
                  Alignment:
                  <Badge variant="secondary">{alignment}</Badge>
                </div>
                <div className="flex items-center gap-1 text-sm">
                  Alliance:
                  <Badge variant="secondary">{allianceName}</Badge>
                </div>
              </div>
            </div>
            <div className="text-gray-600 mb-4">
              <div className="flex flex-wrap gap-4">
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

            <div className="mt-2">
              <div className="grid grid-cols-3 gap-4 text-sm">

                {/* 1st Column */}
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Credits:</span>
                    <span className="font-semibold">{credits != null ? credits : 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Rating:</span>
                    <span className="font-semibold">{rating != null ? rating : 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Wealth:</span>
                    <span className="font-semibold">{rating + credits + unassignedVehiclesValue + totalStashValue}</span>
                  </div>
                </div>

                {/* 2nd Column */}
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Reputation:</span>
                    <span className="font-semibold">{reputation != null ? reputation : 0}</span>
                  </div>
                </div>

                {/* 3rd Column */}
                <div className="space-y-2">
                  {campaigns?.[0]?.has_exploration_points && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 hidden sm:inline">Exploration Points:</span>
                      <span className="text-gray-600 inline sm:hidden">Exp. Points:</span>
                      <span className="font-semibold">{explorationPoints != null ? explorationPoints : 0}</span>
                    </div>
                  )}
                  {campaigns?.[0]?.has_meat && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Meat:</span>
                      <span className="font-semibold">{meat != null ? meat : 0}</span>
                    </div>
                  )}
                  {campaigns?.[0]?.has_scavenging_rolls && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 hidden sm:inline">Scavenging Rolls:</span>
                      <span className="text-gray-600 inline sm:hidden">Scav. Rolls:</span>
                      <span className="font-semibold">{scavengingRolls != null ? scavengingRolls : 0}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-row item-center justify-between text-xs text-gray-500">
              <span>Created: {formatDate(created_at)}</span>
              <span>Last Updated: {formatDate(lastUpdated)}</span>
            </div>
            <div className="mt-2 flex flex-wrap sm:justify-end justify-center gap-2">
              <Button
                onClick={handleAddFighterClick}
                disabled={!userPermissions?.canEdit}
                className="bg-black text-white w-full min-w-[135px] sm:w-auto hover:bg-gray-800 print:hidden disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Fighter
              </Button>
              <Button
                onClick={handleAddVehicleModalOpen}
                disabled={!userPermissions?.canEdit}
                className="bg-black text-white flex-1 min-w-[135px] sm:flex-none hover:bg-gray-800 print:hidden disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Vehicle
              </Button>
              <Button
                onClick={handleGangAdditionsModalOpen}
                disabled={!userPermissions?.canEdit}
                className="bg-black text-white flex-1 min-w-[135px] sm:flex-none hover:bg-gray-800 print:hidden disabled:opacity-50 disabled:cursor-not-allowed"
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
            alignment={alignment}
            allianceId={allianceId}
            allianceName={allianceName}
            gangColour={gangColour}
            gangVariants={gangVariants}
            availableVariants={availableVariants}
            campaigns={campaigns}
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
                    <div 
                      className="prose prose-sm max-w-none"
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
              if (fighter.fighter_class === 'exotic beast' && fighter.beast_equipment_stashed) {
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
          <div className="text-white italic text-center">No fighters available.</div>
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
      <p className="text-gray-600 text-sm truncate">{label}:</p>
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