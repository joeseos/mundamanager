'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '../ui/input';
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import Modal from '@/components/ui/modal';
import { toast } from 'sonner';
import { HexColorPicker } from "react-colorful";
import { groupAlliancesByType } from "@/utils/allianceRank";
import { gangVariantRank } from "@/utils/gangVariantRank";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteGang } from '@/app/actions/delete-gang';
import { hasAlignment, sameEditionForDisplay } from '@/types/edition';
import { isVenatorGang } from '@/utils/venatorSkillAccess';
import { saveVenatorSkillRanks } from '@/app/actions/gang/save-venator-skill-ranks';
import { createClient } from '@/utils/supabase/client';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { useDndSensorsConfig, dragSurfaceProps } from '@/hooks/use-dnd-sensors';
import { buildGroupedSkillSetComboboxOptions } from '@/utils/skillSetComboboxOptions';
import { LuGripVertical, LuX } from 'react-icons/lu';

interface GangUpdates {
  name?: string;
  alignment?: string;
  alliance_id?: string | null;
  alliance_name?: string;
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
}

interface Campaign {
  campaign_id: string;
  campaign_gang_id: string;
  allegiance?: {
    id: string;
    name: string;
  } | null;
}

interface GangEditModalProps {
  // Modal control
  isOpen: boolean;
  onClose: () => void;

  // Gang data
  gangId: string;
  gangName: string;
  editionSlug?: string | null;
  alignment: string;
  allianceId: string | null;
  allianceName: string;
  gangColour: string;
  gangVariants: Array<{id: string, variant: string}>;
  availableVariants: Array<{id: string, variant: string, edition_slug?: string | null}>;
  gangAffiliationId: string | null;
  gangAffiliationName: string;
  gangType?: string | null;
  customGangTypeId?: string | null;
  gangTypeHasAffiliation: boolean;
  gangOriginId: string | null;
  gangOriginName: string;
  gangOriginCategoryName: string;
  gangTypeHasOrigin: boolean;
  hidden: boolean;

  // Campaign features
  campaigns?: Campaign[];

  // Permissions - controls Delete button visibility
  isGangOwner?: boolean;
  isAdmin?: boolean;

  // Callbacks
  onSave: (updates: GangUpdates) => Promise<boolean>;
}

function SortableSkillSetRankRow({
  id,
  rank,
  name,
  onRemove,
}: {
  id: string;
  rank: number;
  name: string;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const surface = dragSurfaceProps(true);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 'auto',
        position: 'relative',
        // Prefer none over dragSurfaceProps' "manipulation" so vertical drags
        // reorder rows instead of scrolling the modal underneath.
        WebkitUserSelect: 'none',
        userSelect: 'none',
        WebkitTouchCallout: 'none',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'none',
      }}
      className={`flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 cursor-grab ${
        isDragging ? 'shadow-md border-rose-700 cursor-grabbing' : ''
      }`}
      aria-label={`Drag to reorder ${name}`}
      onContextMenu={surface.onContextMenu}
      {...attributes}
      {...listeners}
    >
      <span className="inline-flex w-5 shrink-0 items-center justify-center text-sm text-muted-foreground">{rank}</span>
      <span className="shrink-0 p-1 text-muted-foreground" aria-hidden="true">
        <LuGripVertical className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 shrink-0 cursor-pointer touch-auto p-0"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onRemove}
        aria-label={`Remove ${name}`}
      >
        <LuX className="h-4 w-4" />
      </Button>
    </div>
  );
}

/**
 * Gang Edit Modal Component
 * 
 * Extracted from gang.tsx to improve component maintainability.
 * Handles all gang editing functionality including:
 * - Basic gang info (name, visibility)
 * - Alignment and alliance management
 * - Gang variants selection
 * - Colour picker
 * - Campaign allegiance
 */
export default function GangEditModal({
  isOpen,
  onClose,
  gangId,
  gangName,
  editionSlug,
  alignment,
  allianceId,
  allianceName,
  gangColour,
  gangVariants,
  availableVariants,
  gangAffiliationId,
  gangAffiliationName,
  gangType,
  customGangTypeId,
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
  const router = useRouter();

  const editionAvailableVariants = availableVariants.filter(variant =>
    sameEditionForDisplay(variant.edition_slug, editionSlug)
  );
  const showGangVariants = editionAvailableVariants.length > 0;
  const showAlignment = hasAlignment(editionSlug);
  // Mirror admin fighter-type forms: clear alignment when the edition lacks it
  const effectiveAlignment = showAlignment ? alignment : '';

  const isVenator = isVenatorGang(editionSlug, gangType, Boolean(customGangTypeId));

  const { data: skillTypes = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['skill-types', editionSlug, 'strict'],
    enabled: isVenator && !!editionSlug,
    queryFn: async () => {
      const response = await fetch(`/api/skill-types?edition_slug=${editionSlug}&strict_edition=1`);
      if (!response.ok) throw new Error('Failed to load skill types');
      const rows: Array<{ id: string; name: string; is_custom?: boolean }> = await response.json();
      return rows.filter((r) => !r.is_custom).map((r) => ({ id: r.id, name: r.name }));
    },
  });

  const queryClient = useQueryClient();
  const { data: existingRanks = [], isSuccess: existingRanksLoaded } = useQuery<
    Array<{ rank: number; skill_type_id: string }>
  >({
    queryKey: ['gang-skill-set-ranks', gangId],
    enabled: isVenator,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('gang_skill_set_ranks')
        .select('rank, skill_type_id')
        .eq('gang_id', gangId)
        .order('rank');
      if (error) throw error;
      return data ?? [];
    },
  });

  const [ranks, setRanks] = useState<string[]>([]);
  const [showRankChangeConfirm, setShowRankChangeConfirm] = useState(false);
  const rankSensors = useDndSensorsConfig('distance');
  const rankListRef = useRef<HTMLDivElement | null>(null);
  const lockedScrollParentRef = useRef<{
    el: HTMLElement;
    overflowY: string;
    overscrollBehavior: string;
  } | null>(null);

  const unlockRankModalScroll = useCallback(() => {
    const locked = lockedScrollParentRef.current;
    if (!locked) return;
    locked.el.style.overflowY = locked.overflowY;
    locked.el.style.overscrollBehavior = locked.overscrollBehavior;
    lockedScrollParentRef.current = null;
  }, []);

  const lockRankModalScroll = useCallback(() => {
    unlockRankModalScroll();
    let el = rankListRef.current?.parentElement ?? null;
    while (el) {
      const { overflowY } = window.getComputedStyle(el);
      if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
        lockedScrollParentRef.current = {
          el,
          overflowY: el.style.overflowY,
          overscrollBehavior: el.style.overscrollBehavior,
        };
        el.style.overflowY = 'hidden';
        el.style.overscrollBehavior = 'none';
        break;
      }
      el = el.parentElement;
    }
  }, [unlockRankModalScroll]);

  const addRank = useCallback((skillTypeId: string) => {
    if (!skillTypeId) return;
    setRanks((prev) => {
      if (prev.length >= 4 || prev.includes(skillTypeId)) return prev;
      return [...prev, skillTypeId];
    });
  }, []);

  const removeRank = useCallback((skillTypeId: string) => {
    setRanks((prev) => prev.filter((id) => id !== skillTypeId));
  }, []);

  const handleRankDragEnd = useCallback((event: DragEndEvent) => {
    unlockRankModalScroll();
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setRanks((prev) => {
      const oldIndex = prev.findIndex((id) => id === active.id);
      const newIndex = prev.findIndex((id) => id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, [unlockRankModalScroll]);

  const ranksInitializedRef = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      ranksInitializedRef.current = false;
      setShowRankChangeConfirm(false);
      unlockRankModalScroll();
      return;
    }
    if (ranksInitializedRef.current) return;
    if (!existingRanksLoaded) return;
    setRanks(
      [...existingRanks]
        .sort((a, b) => a.rank - b.rank)
        .map((r) => r.skill_type_id),
    );
    ranksInitializedRef.current = true;
  }, [isOpen, existingRanks, existingRanksLoaded, unlockRankModalScroll]);

  // Get campaign ID and current allegiance if gang is in a campaign
  const campaignId = campaigns?.[0]?.campaign_id;
  const currentAllegianceFromCampaign = campaigns?.[0]?.allegiance;
  const effectiveCurrentAllegianceId = currentAllegianceFromCampaign?.id || null;
  
  const [initialValues, setInitialValues] = useState({
    name: gangName,
    alignment: effectiveAlignment,
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
    alignment: effectiveAlignment,
    allianceId: allianceId || '',
    gangColour: gangColour,
    gangIsVariant: gangVariants.length > 0,
    gangVariants: gangVariants,
    gangAffiliationId: gangAffiliationId || '',
    gangOriginId: gangOriginId || '',
    hidden: hidden,
    campaignAllegianceId: effectiveCurrentAllegianceId
  });
  
  // Alliance management state
  const [allianceList, setAllianceList] = useState<Array<{
    id: string;
    alliance_name: string;
    alliance_type?: string | null;
    strong_alliance: string;
    edition_slug?: string | null;
  }>>([]);
  const [allianceListLoaded, setAllianceListLoaded] = useState(false);
  const editionAllianceList = allianceList.filter(alliance =>
    sameEditionForDisplay(alliance.edition_slug, editionSlug)
  );
  
  // Gang affiliation management state
  const [affiliationList, setAffiliationList] = useState<Array<{id: string, name: string}>>([]);
  const [affiliationListLoaded, setAffiliationListLoaded] = useState(false);

  // Gang origin management state
  const [originList, setOriginList] = useState<Array<{id: string, origin_name: string, category_name: string}>>([]);
  const [originListLoaded, setOriginListLoaded] = useState(false);

  // Colour picker modal state
  const [showColourPickerModal, setShowColourPickerModal] = useState(false);

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

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
  
  const resetKey = `${isOpen}-${gangName}-${alignment}-${allianceId}-${gangColour}-${JSON.stringify(gangVariants)}-${gangAffiliationId}-${gangOriginId}-${hidden}-${effectiveCurrentAllegianceId}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    if (isOpen) {
      setInitialValues({
        name: gangName,
        alignment: effectiveAlignment,
        allianceId: allianceId || '',
        gangColour: gangColour,
        gangIsVariant: gangVariants.length > 0,
        gangVariants: gangVariants,
        gangAffiliationId: gangAffiliationId || '',
        gangOriginId: gangOriginId || '',
        hidden: hidden,
        campaignAllegianceId: effectiveCurrentAllegianceId
      });

      setFormState(prev => ({
        ...prev,
        name: gangName,
        alignment: effectiveAlignment,
        allianceId: allianceId || '',
        gangColour: gangColour,
        gangIsVariant: gangVariants.length > 0,
        gangVariants: gangVariants,
        gangAffiliationId: gangAffiliationId || '',
        gangOriginId: gangOriginId || '',
        hidden: hidden,
        campaignAllegianceId: effectiveCurrentAllegianceId
      }));
    }
  }

  const [prevEffectiveAllegianceId, setPrevEffectiveAllegianceId] = useState(effectiveCurrentAllegianceId);
  if (effectiveCurrentAllegianceId !== prevEffectiveAllegianceId) {
    setPrevEffectiveAllegianceId(effectiveCurrentAllegianceId);
    if (isOpen && formState.campaignAllegianceId === initialValues.campaignAllegianceId) {
      setFormState(prev => ({
        ...prev,
        campaignAllegianceId: effectiveCurrentAllegianceId
      }));
    }
  }

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
      toast.error('Failed to load alliances');
    }
  };

  const fetchAffiliations = async () => {
    if (affiliationListLoaded && originListLoaded) return;

    try {
      const response = await fetch('/api/gang-types');
      if (!response.ok) throw new Error('Failed to fetch gang types');
      const data = await response.json();
      
      // Extract all available affiliations from the first gang type of this
      // gang's edition that has them
      if (!affiliationListLoaded) {
        const gangTypeWithAffiliations = data.find((type: any) =>
          sameEditionForDisplay(type.edition_slug, editionSlug)
          && type.available_affiliations && type.available_affiliations.length > 0);
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
      toast.error('Failed to load affiliations/origins');
    }
  };

  const syncGangVariantsWithAlignment = (newAlignment: string, currentVariants: Array<{id: string, variant: string}>) => {
    const outlaw = editionAvailableVariants.find(v => v.variant === 'Outlaw');
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

  const handleDeleteGang = async () => {
    try {
      setIsDeleting(true);

      const result = await deleteGang(gangId);

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete gang');
      }

      toast.success("Gang successfully deleted. You'll be automatically redirected to the home page in a few seconds.");

      router.push('/');
    } catch (error) {
      console.error('Error deleting gang:', error);

      const message = error instanceof Error
        ? error.message
        : 'An unexpected error occurred. Please try again.';

      toast.error("Error", { description: message });
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
      setDeleteConfirmText('');
    }
  };

  const handleSave = async (options?: { skipRankConfirm?: boolean }) => {
    const updates: GangUpdates = {};
    const initial = initialValues;

    // Only include name if changed
    if (formState.name !== initial.name) {
      updates.name = formState.name;
    }

    // Only include alignment if the edition supports it and the value changed
    if (showAlignment && formState.alignment !== initial.alignment) {
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

    if (isVenator) {
      const filled = ranks.filter(Boolean);
      const hadPreviousRanks = existingRanks.length > 0;
      const previousOrdered = [...existingRanks]
        .sort((a, b) => a.rank - b.rank)
        .map((r) => r.skill_type_id);
      const ranksUnchanged =
        filled.length === previousOrdered.length &&
        filled.every((id, i) => id === previousOrdered[i]);

      if (!ranksUnchanged) {
        if (hadPreviousRanks && !options?.skipRankConfirm) {
          setShowRankChangeConfirm(true);
          return false;
        }
        if (filled.length > 0) {
          const payload = filled.map((skill_type_id, i) => ({
            rank: i + 1,
            skill_type_id,
          }));
          const result = await saveVenatorSkillRanks({
            gangId,
            ranks: payload,
          });
          if (!result.ok) {
            toast.error(result.error);
            return false;
          }
          queryClient.setQueryData(['gang-skill-set-ranks', gangId], payload);
          queryClient.invalidateQueries({ queryKey: ['fighter-skill-access'] });
        } else if (hadPreviousRanks) {
          const result = await saveVenatorSkillRanks({ gangId, ranks: [] });
          if (!result.ok) {
            toast.error(result.error);
            return false;
          }
          queryClient.setQueryData(['gang-skill-set-ranks', gangId], []);
          queryClient.invalidateQueries({ queryKey: ['fighter-skill-access'] });
        }
      }
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
        {showAlignment && (
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
        )}

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

      {isVenator && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Venator Skill Access</p>
          <p className="text-sm text-muted-foreground">
            Add four Skill Sets, then drag to rank them. Rank order
            determines skill access for each fighter.
          </p>
          {ranks.length > 0 && (
            <DndContext
              sensors={rankSensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              onDragStart={lockRankModalScroll}
              onDragEnd={handleRankDragEnd}
              onDragCancel={unlockRankModalScroll}
            >
              <SortableContext items={ranks} strategy={verticalListSortingStrategy}>
                <div ref={rankListRef} className="space-y-2" style={{ touchAction: 'none' }}>
                  {ranks.map((skillTypeId, i) => {
                    const skillType = skillTypes.find((s) => s.id === skillTypeId);
                    return (
                      <SortableSkillSetRankRow
                        key={skillTypeId}
                        id={skillTypeId}
                        rank={i + 1}
                        name={skillType?.name ?? 'Unknown Skill Set'}
                        onRemove={() => removeRank(skillTypeId)}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
          {ranks.length < 4 && (
            <Combobox
              key={ranks.join(',')}
              value={undefined}
              onValueChange={(v) => {
                if (v) addRank(v);
              }}
              options={buildGroupedSkillSetComboboxOptions(
                skillTypes,
                editionSlug,
                { excludeIds: new Set(ranks) },
              )}
              placeholder="Add a Skill Set"
              dropdownPlacement="down"
            />
          )}
        </div>
      )}

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

            const options: Array<{ value: string; label: string | React.ReactNode; displayValue?: string; disabled?: boolean }> = [];

            // Add "None" option at the beginning
            options.push({
              value: "",
              label: "None",
              displayValue: "None"
            });

            // Keep a stale/cross-edition current alliance visible so the Combobox can show it
            if (
              formState.allianceId &&
              !editionAllianceList.some(a => a.id === formState.allianceId)
            ) {
              const currentAlliance =
                allianceList.find(a => a.id === formState.allianceId) ||
                (allianceId === formState.allianceId
                  ? { id: allianceId, alliance_name: allianceName }
                  : null);
              if (currentAlliance) {
                options.push({
                  value: currentAlliance.id,
                  label: currentAlliance.alliance_name,
                  displayValue: currentAlliance.alliance_name
                });
              }
            }

            groupAlliancesByType(editionAllianceList, editionSlug).forEach(
              ({ group, alliances: alliancesInGroup }) => {
                // "Other" reads as a heading of its own in this dropdown
                const groupLabel = group === "Other" ? "Other Alliances" : group;

                // Add group header as disabled option
                options.push({
                  value: `header-${groupLabel}`,
                  label: <span className="font-bold">{groupLabel}</span>,
                  displayValue: groupLabel,
                  disabled: true
                });

                // Add alliances in this group
                alliancesInGroup.forEach(alliance => {
                  options.push({
                    value: alliance.id,
                    label: <span className="ml-3">{alliance.alliance_name}</span>,
                    displayValue: alliance.alliance_name
                  });
                });
              }
            );

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

      {showGangVariants && (
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
                  {editionAvailableVariants
                    .filter(v => (gangVariantRank[v.variant.toLowerCase()] ?? Infinity) <= 9)
                    .sort((a, b) =>
                      (gangVariantRank[a.variant.toLowerCase()] ?? Infinity) -
                      (gangVariantRank[b.variant.toLowerCase()] ?? Infinity)
                    )
                    .map((variant) => (
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
                  {editionAvailableVariants
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
          onDelete={(isGangOwner || isAdmin) ? () => setShowDeleteModal(true) : undefined}
          deleteLabel={(isGangOwner || isAdmin) ? 'Delete' : undefined}
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
                  className="w-32 text-center font-mono border rounded-sm p-1 text-sm"
                  maxLength={7}
                  placeholder="#ffffff"
                />
              </div>
              <div className="space-y-1">
                {/* Light theme preview */}
                <div className="flex justify-center">
                  <div className="p-3 bg-white rounded-lg border border-neutral-200 shadow-xs">
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
                  <div className="p-3 bg-black rounded-lg border border-neutral-800 shadow-xs">
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

      {showRankChangeConfirm && (
        <Modal
          title={ranks.length === 0
            ? 'Clear Skill Set ranks?'
            : 'Update Skill Set ranks?'}
          content={
            <p>
              {ranks.length === 0
                ? 'This will remove rank-derived skill access from Venator fighters and reset any custom Skill Set Access on those Skill Sets.'
                : 'This will reset any custom Skill Set Access on individual Venator fighters to match the new ranking.'}
            </p>
          }
          onClose={() => setShowRankChangeConfirm(false)}
          onConfirm={async () => {
            const saved = await handleSave({ skipRankConfirm: true });
            if (saved === false) return false;
            setShowRankChangeConfirm(false);
            return true;
          }}
          confirmText="Continue"
        />
      )}

      {showDeleteModal && (
        <Modal
          title="Delete Gang"
          content={
            <div className="space-y-4">
              <p>
                Are you sure you want to delete the gang <strong>{gangName}</strong>?
              </p>
              <p className="text-sm text-red-600">
                This action cannot be undone.
              </p>
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Type <span className="font-bold">Delete</span> to confirm:
                </p>
                <Input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Delete"
                  className="w-full"
                />
              </div>
              {isDeleting && (
                <p className="text-sm text-amber-500">
                  This action will take a few seconds to complete. You&apos;ll be automatically redirected to the home page once it&apos;s complete.
                </p>
              )}
            </div>
          }
          onClose={() => {
            setShowDeleteModal(false);
            setDeleteConfirmText('');
          }}
          onConfirm={handleDeleteGang}
          confirmText={isDeleting ? 'Deleting...' : 'Delete'}
          confirmDisabled={deleteConfirmText !== 'Delete'}
        />
      )}
    </>
  );
}