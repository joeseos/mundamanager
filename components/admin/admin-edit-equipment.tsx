'use client';

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { AvailabilityPicker, parseAvailability, combineAvailability } from '@/components/ui/availability-picker';
import { toast } from 'sonner';
import { FighterType } from "@/types/fighter";
import { WeaponProfileInput, emptyWeaponProfile, EquipmentGrants, EquipmentGrantOption, EquipmentAvailability, EquipmentOriginAvailability, EquipmentSubtypeAvailability, GangAdjustedCost, GangOriginAdjustedCost } from "@/types/equipment";
import { CountLimit, FighterTypeGrant } from "@/types/fighter-type";
import { HiX } from "react-icons/hi";
import { getFighterSubtypeSortRank } from "@/utils/fighterSubtypeRank";
import { CountLimitsEditor, GangOriginOptions, GangSubtypeOptions } from "./gang-scope-options";
import { AdminFighterEffects } from "./admin-fighter-effects";
import { EditionSelect, useEditions, editionSlugOf } from '@/components/edition-select';
import { hasLethalityStatline, hasTradePoints } from '@/types/edition';
import { formatFighterSubtypeDisplay } from '@/utils/fighterSubtypeDisplay';
import { isValidTradePoints } from '@/utils/campaigns/resources';
import { WeaponProfileFields } from '@/components/ui/weapon-profile-fields';
import { AdminTradingPost } from "./admin-trading-post";
import { LuTrash2 } from 'react-icons/lu';
import Modal from "@/components/ui/modal";

interface EquipmentCategory {
  id: string;
  category_name: string;
  edition_id?: string | null;
}

interface AdminEditEquipmentModalProps {
  onClose: () => void;
}

const EQUIPMENT_TYPES = ['wargear', 'weapon', 'vehicle_upgrade'] as const;
type EquipmentType = typeof EQUIPMENT_TYPES[number];

// Stable fallback, so memos over the details' lists don't rerun every render
const NO_ROWS: never[] = [];

type ScopeDialog = 'gangCost' | 'gangAvailability' | 'originCost' | 'originAvailability' | 'subtypeAvailability';

// Omits excluded, as fighter_type_equipment_fighter_scope_uidx does, so a grant and a deny for
// one scope collide.
const grantKey = (grant: FighterTypeGrant) =>
  [grant.fighter_type_id, grant.gang_origin_id, grant.gang_subtype_id, grant.fighter_subtype]
    .map(part => part ?? '')
    .join('|');

const fighterTypeLabel = (ft: FighterType, editionSlug?: string | null) => {
  const suffix = [ft.fighter_variant, ft.fighter_specialisations?.specialisation_name]
    .filter(Boolean)
    .map(n => ` - ${n}`)
    .join('');
  return `${ft.gang_type} - ${ft.fighter_type} (${formatFighterSubtypeDisplay(ft.fighter_subtypes, editionSlug)})${suffix}`;
};

/** Blank grant options only when the target is found with a confirmed different edition. */
function sanitizeGrantsOptionsForEdition(
  grants: EquipmentGrants,
  catalog: Array<{ id: string; edition_id?: string | null }>,
  editionId: string
): EquipmentGrants {
  // Empty catalog can't confirm a mismatch (e.g. fetch failure) — leave options alone
  if (!catalog.length) return grants;

  return {
    ...grants,
    options: (grants.options || []).map(option => {
      if (!option.equipment_id) return option;
      const granted = catalog.find(e => e.id === option.equipment_id);
      // Same posture as weapon_group_id: only blank when found AND editions conflict
      if (
        granted &&
        editionId &&
        granted.edition_id &&
        granted.edition_id !== editionId
      ) {
        return { ...option, equipment_id: '' };
      }
      return option;
    }),
  };
}

interface Equipment {
  id: string;
  equipment_name: string;
  availability: string;
  cost: number;
  trade_points?: string;
  variants: string;
  equipment_category: string;
  equipment_type: EquipmentType;
  core_equipment: boolean;
  edition_id?: string | null;
  weapon_profiles?: WeaponProfileInput[];
  fighter_types?: string[];
  gang_adjusted_costs?: GangAdjustedCost[];
  equipment_availabilities?: EquipmentAvailability[];
}

export function AdminEditEquipmentModal({ onClose }: AdminEditEquipmentModalProps) {
  const queryClient = useQueryClient();
  const [selectedEquipmentId, setSelectedEquipmentId] = useState('');
  const [equipmentName, setEquipmentName] = useState('');
  const [availLetter, setAvailLetter] = useState<'C' | 'R' | 'E' | 'I' | 'S'>('C');
  const [availNumber, setAvailNumber] = useState(6);
  const [cost, setCost] = useState('');
  const [tradePoints, setTradePoints] = useState('0');
  const [variants, setVariants] = useState('');
  const [equipmentCategory, setEquipmentCategory] = useState('');
  const [equipmentType, setEquipmentType] = useState<EquipmentType | ''>('');
  const [editionId, setEditionId] = useState('');
  const [coreEquipment, setCoreEquipment] = useState(false);
  const [isEditable, setIsEditable] = useState(false);
  const [isConsumable, setIsConsumable] = useState(false);
  const [grantsEquipment, setGrantsEquipment] = useState<EquipmentGrants | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [weaponProfiles, setWeaponProfiles] = useState<WeaponProfileInput[]>([emptyWeaponProfile(1)]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [fighterTypeGrants, setFighterTypeGrants] = useState<FighterTypeGrant[]>([]);
  const [showScopedGrantDialog, setShowScopedGrantDialog] = useState(false);
  const [scopedGrantFighterType, setScopedGrantFighterType] = useState('');
  const [scopedGrantOrigin, setScopedGrantOrigin] = useState('');
  const [scopedGrantGangSubtype, setScopedGrantGangSubtype] = useState('');
  const [scopedGrantSubtype, setScopedGrantSubtype] = useState('');
  const [scopedGrantExcluded, setScopedGrantExcluded] = useState(false);
  // null until loaded, so a failed load leaves the stored limits alone.
  const [countLimits, setCountLimits] = useState<CountLimit[] | null>(null);
  const [gangAdjustedCosts, setGangAdjustedCosts] = useState<GangAdjustedCost[]>([]);
  const [gangOriginAdjustedCosts, setGangOriginAdjustedCosts] = useState<GangOriginAdjustedCost[]>([]);
  const [equipmentAvailabilities, setEquipmentAvailabilities] = useState<EquipmentAvailability[]>([]);
  const [equipmentOriginAvailabilities, setEquipmentOriginAvailabilities] = useState<EquipmentOriginAvailability[]>([]);
  const [equipmentSubtypeAvailabilities, setEquipmentSubtypeAvailabilities] = useState<EquipmentSubtypeAvailability[]>([]);
  // One per-gang dialog is open at a time, so they share one draft
  const [scopeDialog, setScopeDialog] = useState<ScopeDialog | null>(null);
  const [draftScopeId, setDraftScopeId] = useState('');
  const [draftCost, setDraftCost] = useState('');
  const [draftAvailLetter, setDraftAvailLetter] = useState('');
  const [draftAvailNumber, setDraftAvailNumber] = useState(6);
  const [draftExclusive, setDraftExclusive] = useState(false);
  const [fighterEffects, setFighterEffects] = useState<any[]>([]);
  const [selectedTradingPosts, setSelectedTradingPosts] = useState<string[]>([]);

  const { data: equipmentList = [] } = useQuery<Equipment[]>({
    queryKey: ['admin-equipment-list', categoryFilter],
    queryFn: async () => {
      const response = await fetch(`/api/admin/equipment?equipment_category=${encodeURIComponent(categoryFilter)}`);
      if (!response.ok) throw new Error('Failed to fetch equipment');
      return response.json();
    },
    enabled: !!categoryFilter,
    staleTime: 5 * 60 * 1000,
  });

  const { data: categories = [] } = useQuery<EquipmentCategory[]>({
    queryKey: ['admin-equipment-categories'],
    queryFn: async () => {
      const response = await fetch('/api/admin/equipment/categories');
      if (!response.ok) throw new Error('Failed to fetch categories');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // Edition is the top-level filter: only equipment/categories of the chosen
  // edition are offered for editing, and the saved row keeps that edition
  const filteredCategories = useMemo(
    () => editionId ? categories.filter(category => category.edition_id === editionId) : categories,
    [categories, editionId]
  );

  const filteredEquipmentList = useMemo(
    () => editionId ? equipmentList.filter(item => item.edition_id === editionId) : equipmentList,
    [equipmentList, editionId]
  );

  const { data: editions = [] } = useEditions();
  const editionSlug = editionSlugOf(editions, editionId);
  const showTradePoints = hasTradePoints(editionSlug);
  const showAvailability = !showTradePoints;
  // N26 weapons are described with SR/LR/Str/AP/Lethality; N23 with Rng, Acc,
  // Str, AP, D and Am. Only the stats the selected edition uses are offered.
  const usesLethality = hasLethalityStatline(editionSlug);

  const { data: equipmentDetails, isLoading: isEquipmentDetailsLoading } = useQuery<any>({
    queryKey: ['admin-equipment-details', selectedEquipmentId],
    queryFn: async () => {
      const response = await fetch(`/api/admin/equipment?id=${selectedEquipmentId}`);
      if (!response.ok) throw new Error('Failed to fetch equipment details');
      return response.json();
    },
    enabled: !!selectedEquipmentId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const [prevSyncKey, setPrevSyncKey] = useState<string | null>(null);
  const syncKey = selectedEquipmentId
    ? (equipmentDetails ? `${selectedEquipmentId}:${JSON.stringify(equipmentDetails)}` : null)
    : 'empty';

  if (syncKey !== null && syncKey !== prevSyncKey) {
    setPrevSyncKey(syncKey);

    if (!selectedEquipmentId) {
      setEquipmentName('');
      setAvailLetter('C');
      setAvailNumber(6);
      setCost('');
      setTradePoints('0');
      setVariants('');
      setEquipmentType('');
      setCoreEquipment(false);
      setIsEditable(false);
      setIsConsumable(false);
      setGrantsEquipment(null);
      setWeaponProfiles([emptyWeaponProfile(1)]);
      setGangAdjustedCosts([]);
      setGangOriginAdjustedCosts([]);
      setEquipmentAvailabilities([]);
      setEquipmentOriginAvailabilities([]);
      setEquipmentSubtypeAvailabilities([]);
      setSelectedTradingPosts([]);
      setFighterTypeGrants([]);
      setCountLimits(null);
    } else if (equipmentDetails) {
      setEquipmentName(equipmentDetails.equipment_name);
      const parsed = parseAvailability(equipmentDetails.availability);
      setAvailLetter((parsed.letter || 'C') as 'C' | 'R' | 'E' | 'I' | 'S');
      setAvailNumber(parsed.number);
      setCost(equipmentDetails.cost?.toString() || '');
      setTradePoints(
        equipmentDetails.trade_points != null
          ? String(equipmentDetails.trade_points)
          : '0'
      );
      setVariants(equipmentDetails.variants || '');
      setEquipmentCategory(equipmentDetails.equipment_category_id);
      setEquipmentType(equipmentDetails.equipment_type);
      setEditionId(equipmentDetails.edition_id ?? '');
      setCoreEquipment(equipmentDetails.core_equipment || false);
      setIsEditable(equipmentDetails.is_editable || false);
      setIsConsumable(equipmentDetails.is_consumable || false);

      if (equipmentDetails.grants_equipment) {
        setGrantsEquipment(
          sanitizeGrantsOptionsForEdition(
            equipmentDetails.grants_equipment,
            equipmentDetails.all_equipment || [],
            equipmentDetails.edition_id ?? ''
          )
        );
      }

      if (equipmentDetails.gang_adjusted_costs) setGangAdjustedCosts(equipmentDetails.gang_adjusted_costs);
      if (equipmentDetails.gang_origin_adjusted_costs) setGangOriginAdjustedCosts(equipmentDetails.gang_origin_adjusted_costs);
      if (equipmentDetails.equipment_availabilities) {
        setEquipmentAvailabilities(equipmentDetails.equipment_availabilities.map((a: EquipmentAvailability) => ({
          ...a,
          exclusive: a.exclusive ?? false
        })));
      }
      if (equipmentDetails.equipment_origin_availabilities) setEquipmentOriginAvailabilities(equipmentDetails.equipment_origin_availabilities);
      if (equipmentDetails.equipment_subtype_availabilities) setEquipmentSubtypeAvailabilities(equipmentDetails.equipment_subtype_availabilities);
      if (equipmentDetails.trading_post_associations) setSelectedTradingPosts(equipmentDetails.trading_post_associations);
      if (equipmentDetails.fighter_effects) setFighterEffects(equipmentDetails.fighter_effects);

      setCountLimits(Array.isArray(equipmentDetails.count_limits) ? equipmentDetails.count_limits : null);

      if (equipmentDetails.fighter_types_with_equipment) {
        setFighterTypeGrants(equipmentDetails.fighter_types_with_equipment.map((ft: any): FighterTypeGrant => ({
          fighter_type_id: ft.fighter_type_id ?? null,
          // Always null: scopeToFighterTypeGrants reads only rows this screen owns
          gang_type_id: null,
          gang_origin_id: ft.gang_origin_id ?? null,
          gang_subtype_id: ft.gang_subtype_id ?? null,
          fighter_subtype: ft.fighter_subtype ?? null,
          excluded: ft.excluded ?? false
        })));
      }

      if (equipmentDetails.weapon_profiles && equipmentDetails.weapon_profiles.length > 0) {
        // lethality is NULL on every pre-N26 profile; the inputs are controlled
        setWeaponProfiles(equipmentDetails.weapon_profiles.map((profile: WeaponProfileInput) => ({
          ...profile,
          lethality: profile.lethality ?? ''
        })));
      } else if (equipmentDetails.equipment_type === 'weapon') {
        setWeaponProfiles([emptyWeaponProfile(1)]);
      }
    }
  }

  const { data: weapons = [], isLoading: isWeaponsLoading } = useQuery<Array<{
    id: string;
    equipment_name: string;
    edition_id?: string | null;
    equipment_type?: string;
  }>>({
    queryKey: ['admin-weapons'],
    queryFn: async () => {
      const response = await fetch('/api/admin/equipment?equipment_type=weapon');
      if (!response.ok) throw new Error('Failed to fetch weapons');
      return response.json();
    },
    enabled: !!selectedEquipmentId && equipmentType === 'weapon',
    staleTime: 5 * 60 * 1000,
  });

  const filteredWeapons = useMemo(
    () => editionId ? weapons.filter(weapon => weapon.edition_id === editionId) : weapons,
    [weapons, editionId]
  );

  // Read-only lists that come with the details
  const allEquipment: Array<{ id: string, equipment_name: string, edition_id?: string | null }> = equipmentDetails?.all_equipment ?? NO_ROWS;
  const fighterTypes: FighterType[] = equipmentDetails?.all_fighter_types ?? NO_ROWS;
  const tradingPostTypes: Array<{ id: string, trading_post_name: string, edition_id?: string | null }> = equipmentDetails?.trading_post_types ?? NO_ROWS;

  const filteredAllEquipment = useMemo(
    () => editionId ? allEquipment.filter(e => e.edition_id === editionId) : allEquipment,
    [allEquipment, editionId]
  );

  const { data: gangTypeOptions = [], isLoading: isGangTypesLoading } = useQuery<Array<{id: string, gang_type: string, edition_id?: string | null}>>({
    queryKey: ['admin-gang-types'],
    queryFn: async () => {
      const response = await fetch('/api/admin/gang-types');
      if (!response.ok) throw new Error('Failed to fetch gang types');
      return response.json();
    },
    // Also needed unopened, to label count limits
    enabled: !!selectedEquipmentId,
    staleTime: 5 * 60 * 1000,
  });

  const filteredGangTypes = useMemo(
    () => editionId ? gangTypeOptions.filter(type => type.edition_id === editionId) : gangTypeOptions,
    [gangTypeOptions, editionId]
  );

  const filteredFighterTypes = useMemo(
    () => (editionId ? fighterTypes.filter(ft => ft.edition_id === editionId) : [...fighterTypes])
      .sort((a, b) => {
        const gangCompare = a.gang_type.localeCompare(b.gang_type);
        if (gangCompare !== 0) return gangCompare;
        // Subtype priority is per fighter type's own edition
        const subtypeCompare =
          getFighterSubtypeSortRank(a.fighter_subtypes, editionSlugOf(editions, a.edition_id))
          - getFighterSubtypeSortRank(b.fighter_subtypes, editionSlugOf(editions, b.edition_id));
        if (subtypeCompare !== 0) return subtypeCompare;
        return a.fighter_type.localeCompare(b.fighter_type);
      }),
    [fighterTypes, editionId, editions]
  );

  const { data: gangOriginList = [] } = useQuery<Array<{id: string, origin_name: string, category_name: string, edition_id?: string | null}>>({
    queryKey: ['admin-gang-origins'],
    queryFn: async () => {
      const response = await fetch('/api/admin/gang-origins');
      if (!response.ok) throw new Error('Failed to fetch gang origins');
      return response.json();
    },
    // Also needed unopened, to label scoped grants
    enabled: !!selectedEquipmentId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: gangSubtypeList = [] } = useQuery<Array<{id: string, subtype: string, edition_id?: string | null, edition_slug?: string | null}>>({
    queryKey: ['gang-subtype-types'],
    queryFn: async () => {
      const response = await fetch('/api/gang-subtype-types');
      if (!response.ok) throw new Error('Failed to fetch gang subtypes');
      return response.json();
    },
    // Also needed unopened, to label scoped grants
    enabled: !!selectedEquipmentId,
    staleTime: 5 * 60 * 1000,
  });

  // Origin and subtype names repeat across editions under different ids
  const filteredGangOrigins = useMemo(
    () => editionId ? gangOriginList.filter(origin => origin.edition_id === editionId) : gangOriginList,
    [gangOriginList, editionId]
  );

  const filteredGangSubtypes = useMemo(
    () => editionId ? gangSubtypeList.filter(subtype => subtype.edition_id === editionId) : gangSubtypeList,
    [gangSubtypeList, editionId]
  );

  const { data: fighterSubtypeList = [] } = useQuery<Array<{id: string, subtype_name: string, edition_id?: string | null}>>({
    queryKey: ['admin-fighter-subtypes'],
    queryFn: async () => {
      const response = await fetch('/api/admin/fighter-subtypes');
      if (!response.ok) throw new Error('Failed to fetch fighter subtypes');
      return response.json();
    },
    enabled: !!selectedEquipmentId,
    staleTime: 5 * 60 * 1000,
  });

  // Subtypes are stored on the grant by name, but the names are per edition
  const filteredFighterSubtypes = useMemo(
    () => (editionId ? fighterSubtypeList.filter(s => s.edition_id === editionId) : [...fighterSubtypeList])
      .sort((a, b) =>
        getFighterSubtypeSortRank([a.subtype_name], editionSlugOf(editions, a.edition_id))
        - getFighterSubtypeSortRank([b.subtype_name], editionSlugOf(editions, b.edition_id))
      ),
    [fighterSubtypeList, editionId, editions]
  );

  const closeScopedGrantDialog = () => {
    setShowScopedGrantDialog(false);
    setScopedGrantFighterType("");
    setScopedGrantOrigin("");
    setScopedGrantGangSubtype("");
    setScopedGrantSubtype("");
    setScopedGrantExcluded(false);
  };

  const closeScopeDialog = () => {
    setScopeDialog(null);
    setDraftScopeId('');
    setDraftCost('');
    setDraftAvailLetter('');
    setDraftAvailNumber(6);
    setDraftExclusive(false);
  };

  const handleEditionChange = (newEditionId: string) => {
    setEditionId(newEditionId);
    // Kept when it is not in the list, or the list can't confirm another edition
    const inNewEdition = (list: Array<{ id: string, edition_id?: string | null }>, id?: string | null) => {
      const item = list.find(entry => entry.id === id);
      return !item || item.edition_id === newEditionId;
    };
    if (newEditionId && selectedEquipmentId) {
      const selected = equipmentList.find(item => item.id === selectedEquipmentId);
      if (selected && selected.edition_id !== newEditionId) {
        setSelectedEquipmentId('');
      }
    }
    if (categoryFilter && newEditionId) {
      // categoryFilter is a name; the same name can exist per edition
      const stillValid = categories.some(
        category => category.category_name === categoryFilter && category.edition_id === newEditionId
      );
      if (!stillValid) {
        setCategoryFilter('');
        setSelectedEquipmentId('');
      }
    }
    if (equipmentCategory) {
      const selected = categories.find(category => category.id === equipmentCategory);
      if (selected && newEditionId && selected.edition_id !== newEditionId) {
        setEquipmentCategory('');
      }
    }
    // Gang type/origin/subtype and fighter picks are edition-scoped; drop in-progress ones
    closeScopeDialog();
    setScopedGrantFighterType('');
    setScopedGrantSubtype('');
    setScopedGrantOrigin('');
    setScopedGrantGangSubtype('');
    // Drop trading posts / fighter types that belong to another edition
    if (newEditionId) {
      setSelectedTradingPosts(prev => prev.filter(id => inNewEdition(tradingPostTypes, id)));
      // fighter_subtype is not judged: it is stored by name, and names repeat per edition
      setFighterTypeGrants(prev =>
        prev.filter(grant => {
          const ft = fighterTypes.find(f => f.id === grant.fighter_type_id);
          if (ft && ft.edition_id !== newEditionId) return false;
          const origin = gangOriginList.find(o => o.id === grant.gang_origin_id);
          if (origin && origin.edition_id !== newEditionId) return false;
          const subtype = gangSubtypeList.find(v => v.id === grant.gang_subtype_id);
          if (subtype && subtype.edition_id !== newEditionId) return false;
          return true;
        })
      );
      setCountLimits(prev => prev?.filter(limit =>
        inNewEdition(fighterTypes, limit.for_fighter_type_id)
        && inNewEdition(gangTypeOptions, limit.gang_type_id)
        && inNewEdition(gangOriginList, limit.gang_origin_id)
        && inNewEdition(gangSubtypeList, limit.gang_subtype_id)
      ) ?? null);
      // Cost per Gang and the origin- and subtype-scoped rows are edition-scoped too
      setGangAdjustedCosts(prev => prev.filter(cost => inNewEdition(gangTypeOptions, cost.gang_type_id)));
      setGangOriginAdjustedCosts(prev => prev.filter(cost => inNewEdition(gangOriginList, cost.gang_origin_id)));
      setEquipmentOriginAvailabilities(prev => prev.filter(avail => inNewEdition(gangOriginList, avail.gang_origin_id)));
      setEquipmentSubtypeAvailabilities(prev => prev.filter(avail => inNewEdition(gangSubtypeList, avail.gang_subtype_id)));
    }
    // N26 uses Trade Points instead of Availability; drop stale N23 rows
    if (hasTradePoints(editionSlugOf(editions, newEditionId))) {
      setEquipmentAvailabilities([]);
      setEquipmentOriginAvailabilities([]);
      setEquipmentSubtypeAvailabilities([]);
    }
    // Weapon Group parents are edition-scoped; drop a cross-edition pick
    if (newEditionId) {
      setWeaponProfiles(profiles => profiles.map(profile => {
        if (!profile.weapon_group_id) return profile;
        const parent = weapons.find(w => w.id === profile.weapon_group_id);
        if (parent && parent.edition_id !== newEditionId) {
          return { ...profile, weapon_group_id: null };
        }
        return profile;
      }));
      // Grants options are edition-scoped; blank confirmed cross-edition picks
      setGrantsEquipment(current =>
        current ? sanitizeGrantsOptionsForEdition(current, allEquipment, newEditionId) : current
      );
    }
  };

  const isLoading = isEquipmentDetailsLoading || isWeaponsLoading || isSubmitting;

  const handleProfileChange = (index: number, field: keyof WeaponProfileInput, value: string | number | boolean) => {
    setWeaponProfiles(profiles => profiles.map((profile, i) => i === index ? { ...profile, [field]: value } : profile));
  };

  const updateGrantOption = (index: number, patch: Partial<EquipmentGrantOption>) => {
    setGrantsEquipment(current => current && {
      ...current,
      options: current.options.map((option, i) => i === index ? { ...option, ...patch } : option)
    });
  };

  const handleSubmit = async () => {
    if (!categoryFilter || !selectedEquipmentId || !equipmentName || !cost || !equipmentCategory || !equipmentType) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (showTradePoints && !isValidTradePoints(tradePoints)) {
      toast.error("Trade Points must be a number or E");
      return;
    }

    setIsSubmitting(true);
    try {
      // First get the category name
      const selectedCategory = categories.find(cat => cat.id === equipmentCategory);
      if (!selectedCategory) {
        throw new Error('Invalid category selected');
      }

      // Validate and normalize grants_equipment - treat empty options as no grants.
      // An option with no equipment picked is dropped: a blank equipment_id can never
      // be granted, and it is not a uuid, so anything casting it downstream breaks.
      const grantsEquipmentOptions = (grantsEquipment?.options || []).filter(
        option => Boolean(option.equipment_id)
      );
      const normalizedGrantsEquipment = grantsEquipment && grantsEquipmentOptions.length
        ? { ...grantsEquipment, options: grantsEquipmentOptions }
        : null;

      const requestBody = {
        equipment_name: equipmentName,
        // When Availability is hidden (N26), keep the loaded value — do not clear it.
        availability: showAvailability
          ? combineAvailability(availLetter, availNumber)
          : (equipmentDetails?.availability ?? 'C'),
        cost: parseInt(cost),
        trade_points: showTradePoints ? tradePoints.trim().toUpperCase() : '0',
        variants,
        equipment_category: selectedCategory.category_name,
        equipment_category_id: equipmentCategory,
        equipment_type: equipmentType,
        core_equipment: coreEquipment,
        edition_id: editionId || null,
        is_editable: isEditable,
        is_consumable: isConsumable,
        grants_equipment: normalizedGrantsEquipment,
        ...(equipmentType === 'weapon' ? { 
          weapon_profiles: weaponProfiles.map(profile => ({
            ...profile,
            weapon_group_id: profile.weapon_group_id || selectedEquipmentId
          }))
        } : {}),
        fighter_type_grants: fighterTypeGrants,
        gang_adjusted_costs: gangAdjustedCosts.map(d => ({
          gang_type_id: d.gang_type_id,
          adjusted_cost: d.adjusted_cost
        })),
        gang_origin_adjusted_costs: gangOriginAdjustedCosts.map(d => ({
          gang_origin_id: d.gang_origin_id,
          adjusted_cost: d.adjusted_cost
        })),
        equipment_availabilities: showAvailability
          ? equipmentAvailabilities.map(a => ({
              gang_type_id: a.gang_type_id,
              availability: a.availability,
              exclusive: a.exclusive
            }))
          : [],
        equipment_origin_availabilities: showAvailability
          ? equipmentOriginAvailabilities.map(a => ({
              gang_origin_id: a.gang_origin_id,
              availability: a.availability
            }))
          : [],
        equipment_subtype_availabilities: showAvailability
          ? equipmentSubtypeAvailabilities.map(a => ({
              gang_subtype_id: a.gang_subtype_id,
              availability: a.availability
            }))
          : [],
        fighter_effects: fighterEffects,
        ...(countLimits ? { count_limits: countLimits } : {})
      };

      const response = await fetch(`/api/admin/equipment?id=${selectedEquipmentId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error('Failed to update equipment');
      }

      const tradingPostResponse = await fetch('/api/admin/equipment/trading-posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          equipment_id: selectedEquipmentId,
          trading_post_ids: selectedTradingPosts
        })
      });

      if (!tradingPostResponse.ok) {
        console.error('Failed to update trading post associations');
        // Don't fail the whole operation for this
      }

      toast.success("Equipment updated successfully");

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-equipment-list'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-equipment-details'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-equipment-categories'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-weapons'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-gang-types'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-gang-origins'] }),
        queryClient.invalidateQueries({ queryKey: ['gang-subtype-types'] }),
      ]);
    } catch (error) {
      console.error('Error updating equipment:', error);
      toast.error('Failed to update equipment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const removeAt = (index: number) => <T,>(prev: T[]) => prev.filter((_, i) => i !== index);
  const gangTypeSelectOptions = isGangTypesLoading
    ? <option>Loading...</option>
    : filteredGangTypes.map((gang) => <option key={gang.id} value={gang.id}>{gang.gang_type}</option>);
  const originSelectOptions = <GangOriginOptions origins={filteredGangOrigins} />;

  // The per-gang cost and availability sections, in display order. onAdd returns false to keep the dialog open.
  const scopeSections: Array<{
    dialog: ScopeDialog;
    kind: 'cost' | 'availability';
    title: string;
    helper: string;
    addLabel: string;
    addDisabled?: boolean;
    scopeLabel: string;
    scopeOptions: React.ReactNode;
    loading?: boolean;
    chips: string[];
    onRemove: (index: number) => void;
    onAdd: (adjustedCost: number, availability: string | null) => boolean | void;
  }> = [
    {
      dialog: 'gangCost',
      kind: 'cost',
      title: 'Cost per Gang',
      helper: 'Select a gang and enter the adjusted cost',
      addLabel: 'Add Gang',
      scopeLabel: 'Gang Type',
      scopeOptions: gangTypeSelectOptions,
      loading: isGangTypesLoading,
      chips: gangAdjustedCosts.map(c => `${c.gang_type} (${c.adjusted_cost} credits)`),
      onRemove: index => setGangAdjustedCosts(removeAt(index)),
      onAdd: (adjusted_cost) => {
        const gang = gangTypeOptions.find(g => g.id === draftScopeId);
        if (gang) setGangAdjustedCosts(prev => [...prev, { gang_type: gang.gang_type, gang_type_id: gang.id, adjusted_cost }]);
      },
    },
    {
      dialog: 'gangAvailability',
      kind: 'availability',
      title: 'Availability per Gang',
      helper: 'Select a gang and enter an availability value',
      addLabel: 'Add Gang',
      scopeLabel: 'Gang Type',
      scopeOptions: gangTypeSelectOptions,
      loading: isGangTypesLoading,
      chips: equipmentAvailabilities.map(a => `${a.gang_type} (${[
        a.availability ? `Availability: ${a.availability}` : null,
        a.exclusive ? 'Exclusive' : null
      ].filter(Boolean).join(', ')})`),
      onRemove: index => setEquipmentAvailabilities(removeAt(index)),
      onAdd: (_, availability) => {
        const gang = gangTypeOptions.find(g => g.id === draftScopeId);
        if (gang) {
          setEquipmentAvailabilities(prev => [
            ...prev,
            { gang_type: gang.gang_type, gang_type_id: gang.id, availability, exclusive: draftExclusive }
          ]);
        }
      },
    },
    {
      dialog: 'originCost',
      kind: 'cost',
      title: 'Cost per Gang Origin',
      helper: 'Select a gang origin and enter the adjusted cost',
      addLabel: 'Add Origin',
      // Unlike the Availability sections this one renders in every
      // edition, so it can be the one with no origins left to add
      addDisabled: gangOriginList.length > 0 && filteredGangOrigins.length === 0,
      scopeLabel: 'Gang Origin',
      scopeOptions: originSelectOptions,
      chips: gangOriginAdjustedCosts.map(c => `${c.origin_name} (${c.adjusted_cost} credits)`),
      onRemove: index => setGangOriginAdjustedCosts(removeAt(index)),
      onAdd: (adjusted_cost) => {
        const origin = gangOriginList.find(o => o.id === draftScopeId);
        if (origin) setGangOriginAdjustedCosts(prev => [...prev, { origin_name: origin.origin_name, gang_origin_id: origin.id, adjusted_cost }]);
      },
    },
    {
      dialog: 'originAvailability',
      kind: 'availability',
      title: 'Availability per Gang Origin',
      helper: 'Select a gang origin and enter an availability value',
      addLabel: 'Add Origin',
      scopeLabel: 'Gang Origin',
      scopeOptions: originSelectOptions,
      chips: equipmentOriginAvailabilities.map(a => `${a.origin_name} (Availability: ${a.availability})`),
      onRemove: index => setEquipmentOriginAvailabilities(removeAt(index)),
      onAdd: (_, availability) => {
        const origin = gangOriginList.find(o => o.id === draftScopeId);
        if (origin && availability) setEquipmentOriginAvailabilities(prev => [...prev, { origin_name: origin.origin_name, gang_origin_id: origin.id, availability }]);
      },
    },
    {
      dialog: 'subtypeAvailability',
      kind: 'availability',
      title: 'Availability per Gang Subtype',
      helper: 'Select a gang subtype and enter an availability value',
      addLabel: 'Add Subtype',
      scopeLabel: 'Gang Subtype',
      scopeOptions: <GangSubtypeOptions subtypes={filteredGangSubtypes} editionSlug={editionSlug} />,
      chips: equipmentSubtypeAvailabilities.map(a => `${a.subtype} (Availability: ${a.availability})`),
      onRemove: index => setEquipmentSubtypeAvailabilities(removeAt(index)),
      onAdd: (_, availability) => {
        if (equipmentSubtypeAvailabilities.some(a => a.gang_subtype_id === draftScopeId)) {
          toast.error('This subtype already has an availability set');
          return false;
        }
        const subtype = gangSubtypeList.find(v => v.id === draftScopeId);
        if (subtype && availability) setEquipmentSubtypeAvailabilities(prev => [...prev, { subtype: subtype.subtype, gang_subtype_id: subtype.id, availability }]);
      },
    },
  ];
  // Availability is N23 only (N26 uses Trade Points)
  const visibleScopeSections = scopeSections.filter(section => showAvailability || section.kind === 'cost');
  const openScopeSection = scopeSections.find(section => section.dialog === scopeDialog);

  // The Modal closes itself afterwards unless this returns false
  const confirmScopeDialog = () => {
    if (!openScopeSection || !draftScopeId) return;
    const adjustedCost = parseInt(draftCost);
    const availability = combineAvailability(draftAvailLetter, draftAvailNumber);
    const valid = openScopeSection.kind === 'cost' ? adjustedCost >= 0 : Boolean(availability || draftExclusive);
    if (valid) return openScopeSection.onAdd(adjustedCost, availability);
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 dark:bg-neutral-700/50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card rounded-lg shadow-xl w-full max-w-5xl min-h-0 max-h-svh overflow-y-auto flex flex-col">
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <div>
            <h3 className="text-xl md:text-2xl font-bold text-foreground">Edit Equipment</h3>
            <p className="text-sm text-muted-foreground">Fields marked with * are required.</p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-muted-foreground text-xl"
          >
            ×
          </button>
        </div>

        <div className="px-[10px] py-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-3">
              <EditionSelect value={editionId} onChange={handleEditionChange} defaultToCurrent />
            </div>

            <div className="col-span-3">
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Select Category *
              </label>
              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setSelectedEquipmentId('');
                }}
                className="w-full p-2 border rounded-md"
              >
                <option value="">Select a category</option>
                {filteredCategories.map((category) => (
                  <option key={category.id} value={category.category_name}>
                    {category.category_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-3 mb-4 border-b pb-6">
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Select Equipment to Edit *
              </label>
              <select
                value={selectedEquipmentId}
                onChange={(e) => {
                  setSelectedEquipmentId(e.target.value);
                  // Cleared here, not just on load: a failed load would otherwise leave the
                  // previous item's limits in state and save them against this one. The sync key
                  // is cleared too, so an item already in the cache is synced again.
                  setCountLimits(null);
                  setPrevSyncKey(null);
                }}
                className={`w-full p-2 border rounded-md ${!categoryFilter ? 'bg-muted cursor-not-allowed' : ''}`}
                disabled={!categoryFilter}
              >
                <option value="">Select equipment</option>
                {[...filteredEquipmentList]
                  .sort((a, b) => a.equipment_name.localeCompare(b.equipment_name))
                  .map((item: Equipment) => (
                    <option key={item.id} value={item.id}>
                      {item.equipment_name}
                    </option>
                  ))}
              </select>
            </div>

            {selectedEquipmentId && !isLoading && (
              <>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Equipment Name *
                </label>
                <Input
                  type="text"
                  value={equipmentName}
                  onChange={(e) => setEquipmentName(e.target.value)}
                  placeholder="E.g. Bolt pistol, Combat knife"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Equipment Category *
                </label>
                <select
                  value={equipmentCategory}
                  onChange={(e) => setEquipmentCategory(e.target.value)}
                  className="w-full p-2 border rounded-md"
                >
                  <option value="">Select category</option>
                  {filteredCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.category_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Equipment Type *
                </label>
                <select
                  value={equipmentType}
                  onChange={(e) => setEquipmentType(e.target.value as EquipmentType)}
                  className="w-full p-2 border rounded-md"
                >
                  <option value="">Select equipment type</option>
                  {EQUIPMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type === 'vehicle_upgrade'
                        ? 'Vehicle Upgrade'
                        : type.charAt(0).toUpperCase() + type.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Cost (TP default) *
                </label>
                <Input
                  type="number"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="E.g. 130"
                />
              </div>

              {showAvailability && (
                <AvailabilityPicker
                  label="Availability (TP default) *"
                  letter={availLetter}
                  number={availNumber}
                  onLetterChange={(v) => setAvailLetter(v as 'C' | 'R' | 'E' | 'I' | 'S')}
                  onNumberChange={setAvailNumber}
                />
              )}

              {showTradePoints && (
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Trade Points *
                  </label>
                  <Input
                    type="text"
                    value={tradePoints}
                    onChange={(e) => setTradePoints(e.target.value)}
                    placeholder="2 or E"
                  />
                </div>
              )}

              {[
                {
                  label: 'Exclusive to a single Fighter',
                  description: "I.e. the 'Canine jaws' of the Hacked Cyber-mastiff (Exotic Beast).",
                  checked: coreEquipment,
                  onChange: setCoreEquipment,
                  hidden: equipmentType === 'vehicle_upgrade',
                },
                {
                  label: 'Editable After Purchase',
                  description: 'Allows adding/removing effects on this equipment after purchase.',
                  checked: isEditable,
                  onChange: setIsEditable,
                },
                {
                  label: 'Consumable',
                  description: 'Can be consumed by the fighter (e.g. chem-alchemy, Limited ammo).',
                  checked: isConsumable,
                  onChange: setIsConsumable,
                },
              ].filter(flag => !flag.hidden).map(flag => (
                <div key={flag.label} className="col-span-1">
                  <label className="flex items-start space-x-2">
                    <Checkbox
                      checked={flag.checked}
                      onCheckedChange={(checked) => flag.onChange(checked === true)}
                      className="mt-1"
                    />
                    <div>
                      <span className="text-sm font-medium text-muted-foreground">{flag.label}</span>
                      <p className="text-sm text-muted-foreground mt-1">{flag.description}</p>
                    </div>
                  </label>
                </div>
              ))}

              {equipmentType !== 'vehicle_upgrade' && (
                <div className="col-span-3">
                  <label className="block text-sm font-medium text-muted-foreground mb-2">
                    Grants Equipment
                  </label>
                  <p className="text-sm text-muted-foreground mb-3">
                    Configure equipment automatically granted or selectable when this item is purchased.
                  </p>

                  {/* Selection Type */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                      Selection Type
                    </label>
                    <select
                      value={grantsEquipment?.selection_type || ''}
                      onChange={(e) => {
                        const value = e.target.value as "" | EquipmentGrants['selection_type'];
                        setGrantsEquipment(value ? {
                          selection_type: value,
                          max_selections: value === 'multiple_select' ? 2 : undefined,
                          options: grantsEquipment?.options || []
                        } : null);
                      }}
                      className="w-full p-2 border rounded-md max-w-xs"
                    >
                      <option value="">None</option>
                      <option value="fixed">Fixed (auto-granted)</option>
                      <option value="single_select">Single Select (user picks one)</option>
                      <option value="multiple_select">Multiple Select (user picks several)</option>
                    </select>
                  </div>

                  {/* Max Selections (only for multiple_select) */}
                  {grantsEquipment?.selection_type === 'multiple_select' && (
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-muted-foreground mb-1">
                        Max Selections
                      </label>
                      <Input
                        type="number"
                        min="1"
                        value={grantsEquipment.max_selections || ''}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setGrantsEquipment({
                            ...grantsEquipment,
                            max_selections: isNaN(val) ? undefined : val
                          });
                        }}
                        className="w-24"
                        placeholder="e.g. 2"
                      />
                    </div>
                  )}

                  {/* Options List */}
                  {grantsEquipment && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="block text-sm font-medium text-muted-foreground">
                          Equipment Options
                        </label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setGrantsEquipment({
                            ...grantsEquipment,
                            options: [...grantsEquipment.options, { equipment_id: '', additional_cost: 0 }]
                          })}
                        >
                          Add Option
                        </Button>
                      </div>

                      {grantsEquipment.options.length === 0 && (
                        <p className="text-sm text-muted-foreground italic">
                          No equipment options configured. Click &quot;Add Option&quot; to add one.
                        </p>
                      )}

                      {grantsEquipment.options.map((option, index) => (
                        <div key={index} className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 bg-card rounded-sm border">
                          <select
                            value={option.equipment_id}
                            onChange={(e) => updateGrantOption(index, { equipment_id: e.target.value })}
                            className="flex-1 min-w-0 p-2 border rounded-md"
                          >
                            <option value="">Select equipment...</option>
                            {filteredAllEquipment
                              .filter(e => e.id !== selectedEquipmentId)
                              .sort((a, b) => a.equipment_name.localeCompare(b.equipment_name))
                              .map((equip) => (
                                <option key={equip.id} value={equip.id}>
                                  {equip.equipment_name}
                                </option>
                              ))}
                          </select>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              <span className="text-sm text-muted-foreground">Cost:</span>
                              <Input
                                type="number"
                                value={option.additional_cost}
                                onChange={(e) => updateGrantOption(index, { additional_cost: parseInt(e.target.value) || 0 })}
                                className="w-24"
                                placeholder="E.g. 130"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => setGrantsEquipment({
                                ...grantsEquipment,
                                options: grantsEquipment.options.filter((_, i) => i !== index)
                              })}
                              className="hover:text-red-500 focus:outline-hidden p-1"
                            >
                              <HiX className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Gang costs and availability (responsive grid: 1 col mobile, 2 col tablet, 3 col desktop) */}
              {equipmentType !== 'vehicle_upgrade' && (
                <div className="col-span-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {visibleScopeSections.map((section) => (
                      <div key={section.dialog}>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">
                          {section.title}
                        </label>
                        <Button
                          onClick={() => setScopeDialog(section.dialog)}
                          variant="outline"
                          size="sm"
                          className="mb-2"
                          disabled={section.addDisabled}
                        >
                          {section.addLabel}
                        </Button>

                        {section.chips.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {section.chips.map((chip, index) => (
                              <div
                                key={index}
                                className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-muted"
                              >
                                <span>{chip}</span>
                                <button
                                  onClick={() => section.onRemove(index)}
                                  className="hover:text-red-500 focus:outline-hidden"
                                >
                                  <HiX className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {openScopeSection && (
                    <Modal
                      title={openScopeSection.title}
                      helper={openScopeSection.helper}
                      onClose={closeScopeDialog}
                      onConfirm={confirmScopeDialog}
                      confirmText="Save"
                      confirmDisabled={
                        !draftScopeId
                        || openScopeSection.loading
                        || (openScopeSection.kind === 'cost'
                          ? !draftCost || parseInt(draftCost) < 0
                          : !draftAvailLetter && !draftExclusive)
                      }
                      width="sm"
                    >
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium mb-1">{openScopeSection.scopeLabel}</label>
                          <select
                            value={draftScopeId}
                            onChange={(e) => {
                              if (e.target.value) setDraftScopeId(e.target.value);
                            }}
                            className="w-full p-2 border rounded-md"
                            disabled={openScopeSection.loading}
                          >
                            <option key="default" value="">Select a {openScopeSection.scopeLabel}</option>
                            {openScopeSection.scopeOptions}
                          </select>
                        </div>

                        {openScopeSection.kind === 'cost' ? (
                          <div>
                            <label className="block text-sm font-medium mb-1">Adjusted Cost</label>
                            <Input
                              type="number"
                              value={draftCost}
                              onChange={(e) => setDraftCost(e.target.value)}
                              placeholder="E.g. 120"
                              min="0"
                              onKeyDown={(e) => {
                                if (e.key === '-') {
                                  e.preventDefault();
                                }
                              }}
                            />
                          </div>
                        ) : (
                          <AvailabilityPicker
                            label="Availability"
                            letter={draftAvailLetter}
                            number={draftAvailNumber}
                            onLetterChange={setDraftAvailLetter}
                            onNumberChange={setDraftAvailNumber}
                            allowEmpty
                          />
                        )}

                        {openScopeSection.dialog === 'gangAvailability' && (
                          <label className="flex items-start space-x-2">
                            <Checkbox
                              checked={draftExclusive}
                              onCheckedChange={(checked) => setDraftExclusive(checked === true)}
                              className="mt-1"
                            />
                            <div>
                              <span className="text-sm font-medium text-muted-foreground">Available only to this gang</span>
                              <p className="text-sm text-muted-foreground mt-1">
                                Limits this item&apos;s Trading Post visibility to only the gangs flagged here. Flag several gangs to make it available to each of them.
                              </p>
                            </div>
                          </label>
                        )}
                      </div>
                    </Modal>
                  )}
                </div>
              )}

              {/* Move Fighter Types with this Equipment to its own row */}
              {equipmentType !== 'vehicle_upgrade' && (
                <div className="col-span-3">
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Fighter Types with this Equipment
                  </label>
                  <Button
                    onClick={() => setShowScopedGrantDialog(true)}
                    variant="outline"
                    size="sm"
                    className="mb-2"
                  >
                    Add Scoped
                  </Button>
                  <select
                    value=""
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value) {
                        setFighterTypeGrants([
                          ...fighterTypeGrants,
                          { fighter_type_id: value, gang_type_id: null, gang_origin_id: null, gang_subtype_id: null, fighter_subtype: null, excluded: false }
                        ]);
                      }
                      e.target.value = "";
                    }}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="">Select fighter type to add</option>
                    {filteredFighterTypes
                      .filter(ft => !fighterTypeGrants.some(
                        g => g.fighter_type_id === ft.id
                          && !g.gang_origin_id && !g.gang_subtype_id && !g.fighter_subtype
                      ))
                      .map((ft) => (
                        <option key={ft.id} value={ft.id}>
                          {fighterTypeLabel(ft, editionSlugOf(editions, ft.edition_id))}
                        </option>
                      ))}
                  </select>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {fighterTypeGrants.map((grant) => {
                      const ft = grant.fighter_type_id
                        ? fighterTypes.find(f => f.id === grant.fighter_type_id)
                        : null;
                      if (grant.fighter_type_id && !ft) return null;

                      const scope = [
                        grant.gang_origin_id
                          ? `Origin: ${gangOriginList.find(o => o.id === grant.gang_origin_id)?.origin_name ?? '…'}`
                          : null,
                        grant.gang_subtype_id
                          ? `Gang subtype: ${gangSubtypeList.find(v => v.id === grant.gang_subtype_id)?.subtype ?? '…'}`
                          : null,
                        grant.fighter_subtype ? `Subtype: ${grant.fighter_subtype}` : null
                      ].filter(Boolean).join(', ');

                      return (
                        <div
                          key={grantKey(grant)}
                          className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-muted"
                        >
                          <span>{grant.excluded && 'Deny: '}{ft ? fighterTypeLabel(ft, editionSlugOf(editions, ft.edition_id)) : 'Any fighter type'}{scope && ` — ${scope}`}</span>
                          <button
                            type="button"
                            onClick={() => setFighterTypeGrants(
                              fighterTypeGrants.filter(g => grantKey(g) !== grantKey(grant))
                            )}
                            className="hover:text-red-500 focus:outline-hidden"
                          >
                            <HiX className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {showScopedGrantDialog && (
                    <Modal
                      title="Scoped Equipment List Entry"
                      helper="Narrow a grant or deny to a gang origin, gang subtype and/or fighter subtype. Leave Fighter Type as Any for a subtype rule spanning every gang."
                      onClose={closeScopedGrantDialog}
                      onConfirm={() => {
                        const grant: FighterTypeGrant = {
                          fighter_type_id: scopedGrantFighterType || null,
                          gang_type_id: null,
                          gang_origin_id: scopedGrantOrigin || null,
                          gang_subtype_id: scopedGrantGangSubtype || null,
                          fighter_subtype: scopedGrantSubtype || null,
                          excluded: scopedGrantExcluded
                        };
                        if (fighterTypeGrants.some(g => grantKey(g) === grantKey(grant))) {
                          toast.error('That combination is already on the list');
                          return false;
                        }
                        setFighterTypeGrants([...fighterTypeGrants, grant]);
                        closeScopedGrantDialog();
                      }}
                      confirmText="Save"
                      confirmDisabled={
                        // A grant needs a fighter, and a scope the quick-add can't already give.
                        (!scopedGrantExcluded && (
                          (!scopedGrantFighterType && !scopedGrantSubtype)
                          || (!scopedGrantOrigin && !scopedGrantGangSubtype && !scopedGrantSubtype)
                        ))
                        // A deny needs no fighter, but an all-null one would strip it everywhere.
                        || (scopedGrantExcluded
                            && !scopedGrantFighterType && !scopedGrantSubtype
                            && !scopedGrantOrigin && !scopedGrantGangSubtype)
                      }
                      width="sm"
                    >
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium mb-1">Fighter Type</label>
                          <select
                            value={scopedGrantFighterType}
                            onChange={(e) => setScopedGrantFighterType(e.target.value)}
                            className="w-full p-2 border rounded-md"
                          >
                            <option key="default" value="">Any Fighter Type</option>
                            {filteredFighterTypes.map((ft) => (
                              <option key={ft.id} value={ft.id}>
                                {fighterTypeLabel(ft, editionSlugOf(editions, ft.edition_id))}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-1">Fighter Subtype</label>
                          <select
                            value={scopedGrantSubtype}
                            onChange={(e) => setScopedGrantSubtype(e.target.value)}
                            className="w-full p-2 border rounded-md"
                          >
                            <option key="default" value="">Any Fighter Subtype</option>
                            {filteredFighterSubtypes.map((subtype) => (
                              <option key={subtype.id} value={subtype.subtype_name}>
                                {subtype.subtype_name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-1">Gang Origin</label>
                          <select
                            value={scopedGrantOrigin}
                            onChange={(e) => setScopedGrantOrigin(e.target.value)}
                            className="w-full p-2 border rounded-md"
                          >
                            <option key="default" value="">Any Gang Origin</option>
                            <GangOriginOptions origins={filteredGangOrigins} />
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-1">Gang Subtype</label>
                          <select
                            value={scopedGrantGangSubtype}
                            onChange={(e) => setScopedGrantGangSubtype(e.target.value)}
                            className="w-full p-2 border rounded-md"
                          >
                            <option key="default" value="">Any Gang Subtype</option>
                            <GangSubtypeOptions subtypes={filteredGangSubtypes} editionSlug={editionSlug} />
                          </select>
                        </div>

                        <label className="flex items-start space-x-2">
                          <Checkbox
                            checked={scopedGrantExcluded}
                            onCheckedChange={(checked) => setScopedGrantExcluded(checked === true)}
                            className="mt-1"
                          />
                          <div>
                            <span className="text-sm font-medium text-muted-foreground">Deny</span>
                            <p className="text-sm text-muted-foreground mt-1">
                              Removes this item from the Equipment List of matching fighters instead
                              of granting it, overriding any other row that grants it. Equipment List
                              only — it does not gate Trading Post access.
                            </p>
                          </div>
                        </label>
                      </div>
                    </Modal>
                  )}
                </div>
              )}

              <CountLimitsEditor
                limits={countLimits}
                onChange={setCountLimits}
                disabled={!selectedEquipmentId}
                helper="How many of this item a gang may have. Leave the scope on Any for every gang; the most specific matching limit wins."
                labelLists={{ gangTypes: gangTypeOptions, origins: gangOriginList, subtypes: gangSubtypeList }}
                selectLists={{ gangTypes: filteredGangTypes, origins: filteredGangOrigins, subtypes: filteredGangSubtypes, editionSlug }}
                fighterTypeOptions={filteredFighterTypes.map(ft => ({
                  id: ft.id,
                  label: fighterTypeLabel(ft, editionSlugOf(editions, ft.edition_id)),
                }))}
              />

              <AdminTradingPost
                equipmentId={selectedEquipmentId}
                selectedTradingPosts={selectedTradingPosts}
                setSelectedTradingPosts={setSelectedTradingPosts}
                tradingPostTypes={tradingPostTypes}
                editionId={editionId}
              />

              <div className="col-span-3">
                <AdminFighterEffects
                  equipmentId={selectedEquipmentId}
                  editionId={editionId}
                  fighterEffects={fighterEffects}
                  fighterEffectCategories={equipmentDetails?.fighter_effect_categories ?? NO_ROWS}
                  onChange={setFighterEffects}
                />
              </div>

              {/* Weapon Profiles Section */}
              {equipmentType === 'weapon' && (
                <div className="col-span-3 space-y-4">
                  <div className="flex justify-between items-center sticky top-0 bg-card py-2">
                    <h4 className="text-lg font-semibold">Weapon Profiles</h4>
                    <Button
                      onClick={() => setWeaponProfiles(profiles => [...profiles, emptyWeaponProfile(profiles.length + 1)])}
                      variant="outline"
                      size="sm"
                    >
                      Add Profile
                    </Button>
                  </div>

                  <div className="space-y-4 rounded-lg border border-border p-4">
                    {weaponProfiles.map((profile, index) => (
                      <div key={`profile-${index}`} className="border p-4 rounded-lg space-y-4 bg-card">
                        <div className="flex justify-between items-center">
                          <h5 className="font-medium">Profile {index + 1}</h5>
                          {index > 0 && (
                            <Button
                              variant="destructive"
                              className="h-8 w-8 p-0"
                              onClick={() => setWeaponProfiles(profiles => profiles.filter((_, i) => i !== index))}
                            >
                              <LuTrash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>

                        {/* Profile Name and Sorting */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
                          <div className="col-span-2">
                            <label className="block text-sm font-medium text-muted-foreground mb-1">
                              Profile Name
                            </label>
                            <Input
                              value={profile.profile_name}
                              onChange={(e) => handleProfileChange(index, 'profile_name', e.target.value)}
                              placeholder="e.g. Standard, Rapid Fire"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-muted-foreground mb-1">
                              Sort Order
                            </label>
                            <Input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={profile.sort_order || ''}
                              onChange={(e) => {
                                const value = e.target.value.replace(/[^0-9]/g, '');
                                handleProfileChange(index, 'sort_order', parseInt(value) || 0);
                              }}
                              placeholder="#"
                            />
                          </div>
                        </div>

                        {/* Weapon Group */}
                        <div className="col-span-3">
                          <label className="block text-sm font-medium text-muted-foreground mb-1">
                            Weapon Group
                          </label>
                          <p className="text-sm text-muted-foreground mt-1">
                            Attach this profile to an existing weapon, or leave it as is to use with this weapon.
                          </p>
                          <select
                            value={
                              profile.weapon_group_id && profile.weapon_group_id !== selectedEquipmentId
                                ? profile.weapon_group_id
                                : ''
                            }
                            onChange={(e) => handleProfileChange(index, 'weapon_group_id', e.target.value)}
                            className="w-full p-2 border rounded-md"
                          >
                            <option value="">Use This Weapon (Default)</option>
                            {filteredWeapons
                              .filter(w => w.id !== selectedEquipmentId)
                              .map((weapon) => (
                                <option key={weapon.id} value={weapon.id}>
                                  {weapon.equipment_name}
                                </option>
                            ))}
                          </select>
                        </div>

                        {/* Weapon Characteristics */}
                        <WeaponProfileFields
                          profile={profile}
                          index={index}
                          onChange={handleProfileChange}
                          usesLethality={usesLethality}
                        />
                        <div>
                          <div className="col-span-3">
                            <label className="block text-sm font-medium text-muted-foreground mb-1">
                              Traits
                            </label>
                            <Input
                              value={profile.traits}
                              onChange={(e) => handleProfileChange(index, 'traits', e.target.value)}
                              placeholder="Comma-separated list of traits"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          </div>
        </div>

        <div className="border-t px-[10px] py-2 flex justify-end gap-2 bg-card rounded-b-lg">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!categoryFilter || !selectedEquipmentId || !equipmentName || !cost || !availLetter || !equipmentCategory || !equipmentType || isLoading}
            className="bg-neutral-900 text-white rounded-sm hover:bg-gray-800"
          >
            {isLoading ? 'Updating...' : 'Update Equipment'}
          </Button>
        </div>
      </div>
    </div>
  );
} 