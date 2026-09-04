'use client';

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { AvailabilityPicker, parseAvailability, combineAvailability } from '@/components/ui/availability-picker';
import { toast } from 'sonner';
import { FighterType } from "@/types/fighter";
import { WeaponProfileInput, emptyWeaponProfile, EquipmentGrants, EquipmentAvailability, EquipmentOriginAvailability, EquipmentVariantAvailability, FighterTypeEquipmentGrant, GangAdjustedCost, GangOriginAdjustedCost } from "@/types/equipment";
import { HiX } from "react-icons/hi";
import { getFighterSubtypeSortRank } from "@/utils/fighterSubtypeRank";
import { gangOriginRank } from "@/utils/gangOriginRank";
import { gangVariantRank } from "@/utils/gangVariantRank";
import { AdminFighterEffects } from "./admin-fighter-effects";
import { EditionSelect, useEditions, editionSlugOf } from '@/components/edition-select';
import { hasLethalityStatline, hasTradePoints } from '@/types/edition';
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
  onSubmit?: () => void;
}

const EQUIPMENT_TYPES = ['wargear', 'weapon', 'vehicle_upgrade'] as const;
type EquipmentType = typeof EQUIPMENT_TYPES[number];

interface GangOriginOption {
  id: string;
  origin_name: string;
}

const fighterTypeLabel = (ft: FighterType) => {
  const suffix = [ft.fighter_variant, ft.fighter_specialisations?.specialisation_name]
    .filter(Boolean)
    .map(n => ` - ${n}`)
    .join('');
  return `${ft.gang_type} - ${ft.fighter_type} (${ft.fighter_subtypes?.join(', ')})${suffix}`;
};

const grantKey = (grant: FighterTypeEquipmentGrant) =>
  [grant.fighter_type_id, grant.gang_origin_id, grant.gang_variant_id, grant.fighter_subtype]
    .map(part => part ?? '')
    .join('|');

/** Gang-origin <option>s grouped by the category gangOriginRank implies. */
function GangOriginOptions({ origins }: { origins: GangOriginOption[] }) {
  const groups = [...origins]
    .sort((a, b) =>
      (gangOriginRank[a.origin_name.toLowerCase()] ?? Infinity)
      - (gangOriginRank[b.origin_name.toLowerCase()] ?? Infinity)
    )
    .reduce((acc, origin) => {
      const rank = gangOriginRank[origin.origin_name.toLowerCase()] ?? Infinity;
      const label = rank <= 19 ? 'Prefecture'
        : rank <= 39 ? 'Ancestry'
        : rank <= 59 ? 'Tribe'
        : 'Misc.';
      (acc[label] ||= []).push(origin);
      return acc;
    }, {} as Record<string, GangOriginOption[]>);

  return (
    <>
      {Object.entries(groups).map(([label, group]) => (
        <optgroup key={label} label={label}>
          {group.map((origin) => (
            <option key={origin.id} value={origin.id}>
              {origin.origin_name}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

/** Gang-variant <option>s ordered by gangVariantRank. */
function GangVariantOptions({ variants }: { variants: Array<{ id: string; variant: string }> }) {
  return (
    <>
      {[...variants]
        .sort((a, b) =>
          (gangVariantRank[a.variant.toLowerCase()] ?? Infinity)
          - (gangVariantRank[b.variant.toLowerCase()] ?? Infinity)
        )
        .map((variant) => (
          <option key={variant.id} value={variant.id}>
            {variant.variant}
          </option>
        ))}
    </>
  );
}

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

export function AdminEditEquipmentModal({ onClose, onSubmit }: AdminEditEquipmentModalProps) {
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
  const [allEquipment, setAllEquipment] = useState<Array<{id: string, equipment_name: string, edition_id?: string | null, cost?: number}>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [weaponProfiles, setWeaponProfiles] = useState<WeaponProfileInput[]>([emptyWeaponProfile(1)]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [fighterTypes, setFighterTypes] = useState<FighterType[]>([]);
  const [fighterTypeGrants, setFighterTypeGrants] = useState<FighterTypeEquipmentGrant[]>([]);
  const [showScopedGrantDialog, setShowScopedGrantDialog] = useState(false);
  const [scopedGrantFighterType, setScopedGrantFighterType] = useState('');
  const [scopedGrantOrigin, setScopedGrantOrigin] = useState('');
  const [scopedGrantVariant, setScopedGrantVariant] = useState('');
  const [scopedGrantSubtype, setScopedGrantSubtype] = useState('');
  const [showAdjustedCostDialog, setShowAdjustedCostDialog] = useState(false);
  const [selectedGangType, setSelectedGangType] = useState("");
  const [adjustedCostValue, setAdjustedCostValue] = useState("");
  const [gangAdjustedCosts, setGangAdjustedCosts] = useState<GangAdjustedCost[]>([]);
  const [showOriginAdjustedCostDialog, setShowOriginAdjustedCostDialog] = useState(false);
  const [selectedAdjustedCostGangOrigin, setSelectedAdjustedCostGangOrigin] = useState("");
  const [originAdjustedCostValue, setOriginAdjustedCostValue] = useState("");
  const [gangOriginAdjustedCosts, setGangOriginAdjustedCosts] = useState<GangOriginAdjustedCost[]>([]);
  const [showAvailabilityDialog, setShowAvailabilityDialog] = useState(false);
  const [selectedAvailabilityGangType, setSelectedAvailabilityGangType] = useState("");
  const [availValueLetter, setAvailValueLetter] = useState('');
  const [availValueNumber, setAvailValueNumber] = useState(6);
  const [availExclusive, setAvailExclusive] = useState(false);
  const [equipmentAvailabilities, setEquipmentAvailabilities] = useState<EquipmentAvailability[]>([]);
  const [showOriginAvailabilityDialog, setShowOriginAvailabilityDialog] = useState(false);
  const [selectedAvailabilityGangOrigin, setSelectedAvailabilityGangOrigin] = useState("");
  const [originAvailValueLetter, setOriginAvailValueLetter] = useState('');
  const [originAvailValueNumber, setOriginAvailValueNumber] = useState(6);
  const [equipmentOriginAvailabilities, setEquipmentOriginAvailabilities] = useState<EquipmentOriginAvailability[]>([]);
  const [showVariantAvailabilityDialog, setShowVariantAvailabilityDialog] = useState(false);
  const [selectedAvailabilityGangVariant, setSelectedAvailabilityGangVariant] = useState("");
  const [variantAvailValueLetter, setVariantAvailValueLetter] = useState('');
  const [variantAvailValueNumber, setVariantAvailValueNumber] = useState(6);
  const [equipmentVariantAvailabilities, setEquipmentVariantAvailabilities] = useState<EquipmentVariantAvailability[]>([]);
  const [fighterEffects, setFighterEffects] = useState<any[]>([]);
  const [fighterEffectCategories, setFighterEffectCategories] = useState<any[]>([]);
  const [selectedTradingPosts, setSelectedTradingPosts] = useState<string[]>([]);
  const [tradingPostTypes, setTradingPostTypes] = useState<Array<{id: string, trading_post_name: string, edition_id?: string | null}>>([]);

  

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
      setEquipmentVariantAvailabilities([]);
      setSelectedTradingPosts([]);
      setFighterTypeGrants([]);
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

      if (equipmentDetails.all_equipment) {
        setAllEquipment(equipmentDetails.all_equipment);
      }

      if (equipmentDetails.gang_adjusted_costs) {
        setGangAdjustedCosts(equipmentDetails.gang_adjusted_costs.map((d: any) => ({
          gang_type: d.gang_type,
          gang_type_id: d.gang_type_id,
          adjusted_cost: d.adjusted_cost
        })));
      }

      if (equipmentDetails.gang_origin_adjusted_costs) {
        setGangOriginAdjustedCosts(equipmentDetails.gang_origin_adjusted_costs.map((d: any) => ({
          origin_name: d.origin_name,
          gang_origin_id: d.gang_origin_id,
          adjusted_cost: d.adjusted_cost
        })));
      }

      if (equipmentDetails.equipment_availabilities) {
        setEquipmentAvailabilities(equipmentDetails.equipment_availabilities.map((a: any) => ({
          gang_type: a.gang_type,
          gang_type_id: a.gang_type_id,
          availability: a.availability,
          exclusive: a.exclusive ?? false
        })));
      }

      if (equipmentDetails.equipment_origin_availabilities) {
        setEquipmentOriginAvailabilities(equipmentDetails.equipment_origin_availabilities.map((a: any) => ({
          origin_name: a.origin_name,
          gang_origin_id: a.gang_origin_id,
          availability: a.availability
        })));
      }

      if (equipmentDetails.equipment_variant_availabilities) {
        setEquipmentVariantAvailabilities(equipmentDetails.equipment_variant_availabilities.map((a: any) => ({
          variant: a.variant,
          gang_variant_id: a.gang_variant_id,
          availability: a.availability
        })));
      }

      if (equipmentDetails.trading_post_associations) {
        setSelectedTradingPosts(equipmentDetails.trading_post_associations);
      }

      if (equipmentDetails.trading_post_types) {
        setTradingPostTypes(equipmentDetails.trading_post_types);
      }

      if (equipmentDetails.fighter_effects) {
        setFighterEffects(equipmentDetails.fighter_effects);
      }

      if (equipmentDetails.fighter_effect_categories) {
        setFighterEffectCategories(equipmentDetails.fighter_effect_categories);
      }

      if (equipmentDetails.all_fighter_types) {
        setFighterTypes(equipmentDetails.all_fighter_types);
      }

      if (equipmentDetails.fighter_types_with_equipment) {
        setFighterTypeGrants(equipmentDetails.fighter_types_with_equipment.map((ft: any) => ({
          fighter_type_id: ft.fighter_type_id ?? null,
          gang_origin_id: ft.gang_origin_id ?? null,
          gang_variant_id: ft.gang_variant_id ?? null,
          fighter_subtype: ft.fighter_subtype ?? null
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

  const filteredAllEquipment = useMemo(
    () => editionId ? allEquipment.filter(e => e.edition_id === editionId) : allEquipment,
    [allEquipment, editionId]
  );

  const { data: gangTypeOptions = [], isLoading: isGangTypesLoading } = useQuery<Array<{gang_type_id: string, gang_type: string, edition_id?: string | null}>>({
    queryKey: ['admin-gang-types'],
    queryFn: async () => {
      const response = await fetch('/api/admin/gang-types');
      if (!response.ok) throw new Error('Failed to fetch gang types');
      return response.json();
    },
    enabled: showAdjustedCostDialog || showAvailabilityDialog,
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
    enabled: !!selectedEquipmentId || showOriginAvailabilityDialog || showOriginAdjustedCostDialog,
    staleTime: 5 * 60 * 1000,
  });

  const { data: gangVariantList = [] } = useQuery<Array<{id: string, variant: string, edition_id?: string | null}>>({
    queryKey: ['admin-gang-variants'],
    queryFn: async () => {
      const response = await fetch('/api/gang-variant-types');
      if (!response.ok) throw new Error('Failed to fetch gang variants');
      return response.json();
    },
    // Also needed unopened, to label scoped grants
    enabled: !!selectedEquipmentId || showVariantAvailabilityDialog,
    staleTime: 5 * 60 * 1000,
  });

  // Origin and variant names repeat across editions under different ids
  const filteredGangOrigins = useMemo(
    () => editionId ? gangOriginList.filter(origin => origin.edition_id === editionId) : gangOriginList,
    [gangOriginList, editionId]
  );

  const filteredGangVariants = useMemo(
    () => editionId ? gangVariantList.filter(variant => variant.edition_id === editionId) : gangVariantList,
    [gangVariantList, editionId]
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

  const handleEditionChange = (newEditionId: string) => {
    setEditionId(newEditionId);
    const newSlug = editionSlugOf(editions, newEditionId);
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
    // Gang types are edition-scoped; clear any in-progress Cost-per-Gang pick
    setSelectedGangType('');
    // Origin/variant/subtype picks are edition-scoped too; drop in-progress ones
    setSelectedAdjustedCostGangOrigin('');
    setSelectedAvailabilityGangOrigin('');
    setSelectedAvailabilityGangVariant('');
    setScopedGrantFighterType('');
    setScopedGrantSubtype('');
    setScopedGrantOrigin('');
    setScopedGrantVariant('');
    // Drop trading posts / fighter types that belong to another edition
    if (newEditionId) {
      setSelectedTradingPosts(prev =>
        prev.filter(id => {
          const tp = tradingPostTypes.find(t => t.id === id);
          return !tp || tp.edition_id === newEditionId;
        })
      );
      // fighter_subtype is not judged: it is stored by name, and names repeat per edition
      setFighterTypeGrants(prev =>
        prev.filter(grant => {
          const ft = fighterTypes.find(f => f.id === grant.fighter_type_id);
          if (ft && ft.edition_id !== newEditionId) return false;
          const origin = gangOriginList.find(o => o.id === grant.gang_origin_id);
          if (origin && origin.edition_id !== newEditionId) return false;
          const variant = gangVariantList.find(v => v.id === grant.gang_variant_id);
          if (variant && variant.edition_id !== newEditionId) return false;
          return true;
        })
      );
      // Cost per Gang is keyed on a gang type, which is edition-scoped too
      setGangAdjustedCosts(prev =>
        prev.filter(cost => {
          const gt = gangTypeOptions.find(g => g.gang_type_id === cost.gang_type_id);
          return !gt || gt.edition_id === newEditionId;
        })
      );
      // Origin- and variant-scoped rows are edition-scoped as well
      setGangOriginAdjustedCosts(prev =>
        prev.filter(cost => {
          const origin = gangOriginList.find(o => o.id === cost.gang_origin_id);
          return !origin || origin.edition_id === newEditionId;
        })
      );
      setEquipmentOriginAvailabilities(prev =>
        prev.filter(avail => {
          const origin = gangOriginList.find(o => o.id === avail.gang_origin_id);
          return !origin || origin.edition_id === newEditionId;
        })
      );
      setEquipmentVariantAvailabilities(prev =>
        prev.filter(avail => {
          const variant = gangVariantList.find(v => v.id === avail.gang_variant_id);
          return !variant || variant.edition_id === newEditionId;
        })
      );
    }
    // N26 uses Trade Points instead of Availability; drop stale N23 rows
    if (hasTradePoints(newSlug)) {
      setShowAvailabilityDialog(false);
      setSelectedAvailabilityGangType('');
      setAvailValueLetter('');
      setAvailValueNumber(6);
      setAvailExclusive(false);
      setEquipmentAvailabilities([]);
      setShowOriginAvailabilityDialog(false);
      setSelectedAvailabilityGangOrigin('');
      setOriginAvailValueLetter('');
      setOriginAvailValueNumber(6);
      setEquipmentOriginAvailabilities([]);
      setShowVariantAvailabilityDialog(false);
      setSelectedAvailabilityGangVariant('');
      setVariantAvailValueLetter('');
      setVariantAvailValueNumber(6);
      setEquipmentVariantAvailabilities([]);
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
    const newProfiles = [...weaponProfiles];
    newProfiles[index] = {
      ...newProfiles[index],
      [field]: value
    };
    setWeaponProfiles(newProfiles);
  };

  const addProfile = () => {
    setWeaponProfiles([
      ...weaponProfiles,
      emptyWeaponProfile(weaponProfiles.length + 1)
    ]);
  };

  const removeProfile = (index: number) => {
    setWeaponProfiles(weaponProfiles.filter((_, i) => i !== index));
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
        equipment_variant_availabilities: showAvailability
          ? equipmentVariantAvailabilities.map(a => ({
              gang_variant_id: a.gang_variant_id,
              availability: a.availability
            }))
          : [],
        fighter_effects: fighterEffects
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

      // Update trading post associations
      if (selectedTradingPosts.length > 0 || selectedTradingPosts.length === 0) {
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
      }

      toast.success("Equipment updated successfully");

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-equipment-list'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-equipment-details'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-equipment-categories'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-weapons'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-gang-types'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-gang-origins'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-gang-variants'] }),
      ]);

      if (onSubmit) {
        onSubmit();
      }
      onClose();
    } catch (error) {
      console.error('Error updating equipment:', error);
      toast.error('Failed to update equipment');
    } finally {
      setIsSubmitting(false);
    }
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
                onChange={(e) => setSelectedEquipmentId(e.target.value)}
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
                  disabled={!selectedEquipmentId}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Equipment Category *
                </label>
                <select
                  value={equipmentCategory}
                  onChange={(e) => setEquipmentCategory(e.target.value)}
                  className={`w-full p-2 border rounded-md ${!selectedEquipmentId ? 'bg-muted cursor-not-allowed' : ''}`}
                  disabled={!selectedEquipmentId}
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
                  onChange={(e) => {
                    const newType = e.target.value as EquipmentType;
                    setEquipmentType(newType);
                  }}
                  className={`w-full p-2 border rounded-md ${!selectedEquipmentId ? 'bg-muted cursor-not-allowed' : ''}`}
                  disabled={!selectedEquipmentId}
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
                  disabled={!selectedEquipmentId}
                />
              </div>

              {showAvailability && (
                <AvailabilityPicker
                  label="Availability (TP default) *"
                  letter={availLetter}
                  number={availNumber}
                  onLetterChange={(v) => setAvailLetter(v as 'C' | 'R' | 'E' | 'I' | 'S')}
                  onNumberChange={setAvailNumber}
                  disabled={!selectedEquipmentId}
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
                    disabled={!selectedEquipmentId}
                  />
                </div>
              )}

              {equipmentType !== 'vehicle_upgrade' && (
                <div className="col-span-1">
                  <label className="flex items-start space-x-2">
                    <Checkbox
                      checked={coreEquipment}
                      onCheckedChange={(checked) => setCoreEquipment(checked === true)}
                      className="mt-1"
                    />
                    <div>
                      <span className="text-sm font-medium text-muted-foreground">Exclusive to a single Fighter</span>
                      <p className="text-sm text-muted-foreground mt-1">
                        I.e. the &apos;Canine jaws&apos; of the Hacked Cyber-mastiff (Exotic Beast).
                      </p>
                    </div>
                  </label>
                </div>
              )}

              <div className="col-span-1">
                <label className="flex items-start space-x-2">
                  <Checkbox
                    checked={isEditable}
                    onCheckedChange={(checked) => setIsEditable(checked === true)}
                    className="mt-1"
                  />
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Editable After Purchase</span>
                    <p className="text-sm text-muted-foreground mt-1">
                      Allows adding/removing effects on this equipment after purchase.
                    </p>
                  </div>
                </label>
              </div>

              <div className="col-span-1">
                <label className="flex items-start space-x-2">
                  <Checkbox
                    checked={isConsumable}
                    onCheckedChange={(checked) => setIsConsumable(checked === true)}
                    className="mt-1"
                  />
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Consumable</span>
                    <p className="text-sm text-muted-foreground mt-1">
                      Can be consumed by the fighter (e.g. chem-alchemy, Limited ammo).
                    </p>
                  </div>
                </label>
              </div>

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
                        const value = e.target.value as "" | "fixed" | "single_select" | "multiple_select";
                        if (value === '') {
                          setGrantsEquipment(null);
                        } else {
                          setGrantsEquipment({
                            selection_type: value,
                            max_selections: value === 'multiple_select' ? 2 : undefined,
                            options: grantsEquipment?.options || []
                          });
                        }
                      }}
                      className="w-full p-2 border rounded-md max-w-xs"
                      disabled={!selectedEquipmentId}
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
                        disabled={!selectedEquipmentId}
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
                          onClick={() => {
                            setGrantsEquipment({
                              ...grantsEquipment,
                              options: [...grantsEquipment.options, { equipment_id: '', additional_cost: 0 }]
                            });
                          }}
                          disabled={!selectedEquipmentId}
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
                            onChange={(e) => {
                              const newOptions = [...grantsEquipment.options];
                              newOptions[index] = { ...newOptions[index], equipment_id: e.target.value };
                              setGrantsEquipment({ ...grantsEquipment, options: newOptions });
                            }}
                            className="flex-1 min-w-0 p-2 border rounded-md"
                            disabled={!selectedEquipmentId}
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
                                onChange={(e) => {
                                  const newOptions = [...grantsEquipment.options];
                                  newOptions[index] = {
                                    ...newOptions[index],
                                    additional_cost: parseInt(e.target.value) || 0
                                  };
                                  setGrantsEquipment({ ...grantsEquipment, options: newOptions });
                                }}
                                className="w-24"
                                placeholder="E.g. 130"
                                disabled={!selectedEquipmentId}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const newOptions = grantsEquipment.options.filter((_, i) => i !== index);
                                setGrantsEquipment({ ...grantsEquipment, options: newOptions });
                              }}
                              className="hover:text-red-500 focus:outline-hidden p-1"
                              disabled={!selectedEquipmentId}
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
                    {/* Cost per Gang */}
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-1">
                        Cost per Gang
                      </label>
                      <Button
                        onClick={() => setShowAdjustedCostDialog(true)}
                        variant="outline"
                        size="sm"
                        className="mb-2"
                      >
                        Add Gang
                      </Button>

                      {gangAdjustedCosts.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {gangAdjustedCosts.map((adjusted_cost, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-muted"
                            >
                              <span>{adjusted_cost.gang_type} ({adjusted_cost.adjusted_cost} credits)</span>
                              <button
                                onClick={() => setGangAdjustedCosts(prev =>
                                  prev.filter((_, i) => i !== index)
                                )}
                                className="hover:text-red-500 focus:outline-hidden"
                              >
                                <HiX className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {showAdjustedCostDialog && (
                        <Modal
                          title="Cost per Gang"
                          helper="Select a gang and enter the adjusted cost"
                          onClose={() => {
                            setShowAdjustedCostDialog(false);
                            setSelectedGangType("");
                            setAdjustedCostValue("");
                          }}
                          onConfirm={() => {
                            if (selectedGangType && adjustedCostValue) {
                              const adjusted_cost = parseInt(adjustedCostValue);
                              if (adjusted_cost >= 0) {
                                const selectedGang = gangTypeOptions.find(g => g.gang_type_id === selectedGangType);
                                if (selectedGang) {
                                  setGangAdjustedCosts(prev => [
                                    ...prev,
                                    {
                                      gang_type: selectedGang.gang_type,
                                      gang_type_id: selectedGang.gang_type_id,
                                      adjusted_cost
                                    }
                                  ]);
                                  setShowAdjustedCostDialog(false);
                                  setSelectedGangType("");
                                  setAdjustedCostValue("");
                                }
                              }
                            }
                          }}
                          confirmText="Save"
                          confirmDisabled={
                            isGangTypesLoading ||
                            !selectedGangType ||
                            !adjustedCostValue ||
                            parseInt(adjustedCostValue) < 0
                          }
                          width="sm"
                        >
                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium mb-1">Gang Type</label>
                              <select
                                value={selectedGangType}
                                onChange={(e) => {
                                  const selected = gangTypeOptions.find(g => g.gang_type_id === e.target.value);
                                  if (selected) {
                                    setSelectedGangType(e.target.value);
                                  }
                                }}
                                className="w-full p-2 border rounded-md"
                                disabled={isGangTypesLoading}
                              >
                                <option key="default" value="">Select a Gang Type</option>
                                {isGangTypesLoading ? (
                                  <option>Loading...</option>
                                ) : (
                                  filteredGangTypes.map((gang) => (
                                    <option key={gang.gang_type_id} value={gang.gang_type_id}>
                                      {gang.gang_type}
                                    </option>
                                  ))
                                )}
                              </select>
                            </div>

                            <div>
                              <label className="block text-sm font-medium mb-1">Adjusted Cost</label>
                              <Input
                                type="number"
                                value={adjustedCostValue}
                                onChange={(e) => setAdjustedCostValue(e.target.value)}
                                placeholder="E.g. 120"
                                min="0"
                                onKeyDown={(e) => {
                                  if (e.key === '-') {
                                    e.preventDefault();
                                  }
                                }}
                              />
                            </div>
                          </div>
                        </Modal>
                      )}
                    </div>

                    {/* Availability per Gang — N23 only (N26 uses Trade Points) */}
                    {showAvailability && (
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-1">
                        Availability per Gang
                      </label>
                      <Button
                        onClick={() => setShowAvailabilityDialog(true)}
                        variant="outline"
                        size="sm"
                        className="mb-2"
                      >
                        Add Gang
                      </Button>

                      {equipmentAvailabilities.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {equipmentAvailabilities.map((avail, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-muted"
                            >
                              <span>{avail.gang_type} ({[avail.availability ? `Availability: ${avail.availability}` : null, avail.exclusive ? 'Exclusive' : null].filter(Boolean).join(', ')})</span>
                              <button
                                onClick={() => setEquipmentAvailabilities(prev =>
                                  prev.filter((_, i) => i !== index)
                                )}
                                className="hover:text-red-500 focus:outline-hidden"
                                disabled={!selectedEquipmentId}
                              >
                                <HiX className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {showAvailabilityDialog && (
                        <Modal
                          title="Availability per Gang"
                          helper="Select a gang and enter an availability value"
                          onClose={() => {
                            setShowAvailabilityDialog(false);
                            setSelectedAvailabilityGangType("");
                            setAvailValueLetter('');
                            setAvailValueNumber(6);
                            setAvailExclusive(false);
                          }}
                          onConfirm={() => {
                            const combined = combineAvailability(availValueLetter, availValueNumber);
                            if (selectedAvailabilityGangType && (combined || availExclusive)) {
                              const selectedGang = gangTypeOptions.find(g => g.gang_type_id === selectedAvailabilityGangType);
                              if (selectedGang) {
                                setEquipmentAvailabilities(prev => [
                                  ...prev,
                                  {
                                    gang_type: selectedGang.gang_type,
                                    gang_type_id: selectedGang.gang_type_id,
                                    availability: combined,
                                    exclusive: availExclusive
                                  }
                                ]);
                                setShowAvailabilityDialog(false);
                                setSelectedAvailabilityGangType("");
                                setAvailValueLetter('');
                                setAvailValueNumber(6);
                                setAvailExclusive(false);
                              }
                            }
                          }}
                          confirmText="Save"
                          confirmDisabled={
                            isGangTypesLoading ||
                            !selectedAvailabilityGangType ||
                            (!availValueLetter && !availExclusive)
                          }
                          width="sm"
                        >
                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium mb-1">Gang Type</label>
                              <select
                                value={selectedAvailabilityGangType}
                                onChange={(e) => {
                                  const selected = gangTypeOptions.find(g => g.gang_type_id === e.target.value);
                                  if (selected) {
                                    setSelectedAvailabilityGangType(e.target.value);
                                  }
                                }}
                                className="w-full p-2 border rounded-md"
                                disabled={isGangTypesLoading}
                              >
                                <option key="default" value="">Select a Gang Type</option>
                                {isGangTypesLoading ? (
                                  <option>Loading...</option>
                                ) : (
                                  filteredGangTypes.map((gang) => (
                                    <option key={gang.gang_type_id} value={gang.gang_type_id}>
                                      {gang.gang_type}
                                    </option>
                                  ))
                                )}
                              </select>
                            </div>

                            <AvailabilityPicker
                              label="Availability"
                              letter={availValueLetter}
                              number={availValueNumber}
                              onLetterChange={setAvailValueLetter}
                              onNumberChange={setAvailValueNumber}
                              allowEmpty
                            />

                            <label className="flex items-start space-x-2">
                              <Checkbox
                                checked={availExclusive}
                                onCheckedChange={(checked) => setAvailExclusive(checked === true)}
                                className="mt-1"
                              />
                              <div>
                                <span className="text-sm font-medium text-muted-foreground">Available only to this gang</span>
                                <p className="text-sm text-muted-foreground mt-1">
                                  Limits this item&apos;s Trading Post visibility to only the gangs flagged here. Flag several gangs to make it available to each of them.
                                </p>
                              </div>
                            </label>
                          </div>
                        </Modal>
                      )}
                    </div>
                    )}

                    {/* Cost per Gang Origin */}
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-1">
                        Cost per Gang Origin
                      </label>
                      <Button
                        onClick={() => setShowOriginAdjustedCostDialog(true)}
                        variant="outline"
                        size="sm"
                        className="mb-2"
                        // Nothing to add once the catalog is loaded and has no origins here
                        disabled={gangOriginList.length > 0 && filteredGangOrigins.length === 0}
                      >
                        Add Origin
                      </Button>

                      {gangOriginAdjustedCosts.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {gangOriginAdjustedCosts.map((adjusted_cost, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-muted"
                            >
                              <span>{adjusted_cost.origin_name} ({adjusted_cost.adjusted_cost} credits)</span>
                              <button
                                onClick={() => setGangOriginAdjustedCosts(prev =>
                                  prev.filter((_, i) => i !== index)
                                )}
                                className="hover:text-red-500 focus:outline-hidden"
                              >
                                <HiX className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {showOriginAdjustedCostDialog && (
                        <Modal
                          title="Cost per Gang Origin"
                          helper="Select a gang origin and enter the adjusted cost"
                          onClose={() => {
                            setShowOriginAdjustedCostDialog(false);
                            setSelectedAdjustedCostGangOrigin("");
                            setOriginAdjustedCostValue("");
                          }}
                          onConfirm={() => {
                            if (selectedAdjustedCostGangOrigin && originAdjustedCostValue) {
                              const adjusted_cost = parseInt(originAdjustedCostValue);
                              if (adjusted_cost >= 0) {
                                const selectedOrigin = gangOriginList.find(g => g.id === selectedAdjustedCostGangOrigin);
                                if (selectedOrigin) {
                                  setGangOriginAdjustedCosts(prev => [
                                    ...prev,
                                    {
                                      origin_name: selectedOrigin.origin_name,
                                      gang_origin_id: selectedOrigin.id,
                                      adjusted_cost
                                    }
                                  ]);
                                  setShowOriginAdjustedCostDialog(false);
                                  setSelectedAdjustedCostGangOrigin("");
                                  setOriginAdjustedCostValue("");
                                }
                              }
                            }
                          }}
                          confirmText="Save"
                          confirmDisabled={
                            !selectedAdjustedCostGangOrigin ||
                            !originAdjustedCostValue ||
                            parseInt(originAdjustedCostValue) < 0
                          }
                          width="sm"
                        >
                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium mb-1">Gang Origin</label>
                              <select
                                value={selectedAdjustedCostGangOrigin}
                                onChange={(e) => {
                                  const selected = gangOriginList.find(g => g.id === e.target.value);
                                  if (selected) {
                                    setSelectedAdjustedCostGangOrigin(e.target.value);
                                  }
                                }}
                                className="w-full p-2 border rounded-md"
                              >
                                <option key="default" value="">Select a Gang Origin</option>
                                <GangOriginOptions origins={filteredGangOrigins} />
                              </select>
                            </div>

                            <div>
                              <label className="block text-sm font-medium mb-1">Adjusted Cost</label>
                              <Input
                                type="number"
                                value={originAdjustedCostValue}
                                onChange={(e) => setOriginAdjustedCostValue(e.target.value)}
                                placeholder="E.g. 120"
                                min="0"
                                onKeyDown={(e) => {
                                  if (e.key === '-') {
                                    e.preventDefault();
                                  }
                                }}
                              />
                            </div>
                          </div>
                        </Modal>
                      )}
                    </div>

                    {/* Availability per Gang Origin — N23 only */}
                    {showAvailability && (
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-1">
                        Availability per Gang Origin
                      </label>
                      <Button
                        onClick={() => setShowOriginAvailabilityDialog(true)}
                        variant="outline"
                        size="sm"
                        className="mb-2"
                      >
                        Add Origin
                      </Button>

                      {equipmentOriginAvailabilities.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {equipmentOriginAvailabilities.map((avail, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-muted"
                            >
                              <span>{avail.origin_name} (Availability: {avail.availability})</span>
                              <button
                                onClick={() => setEquipmentOriginAvailabilities(prev =>
                                  prev.filter((_, i) => i !== index)
                                )}
                                className="hover:text-red-500 focus:outline-hidden"
                                disabled={!selectedEquipmentId}
                              >
                                <HiX className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {showOriginAvailabilityDialog && (
                        <Modal
                          title="Availability per Gang Origin"
                          helper="Select a gang origin and enter an availability value"
                          onClose={() => {
                            setShowOriginAvailabilityDialog(false);
                            setSelectedAvailabilityGangOrigin("");
                            setOriginAvailValueLetter('');
                            setOriginAvailValueNumber(6);
                          }}
                          onConfirm={() => {
                            const combined = combineAvailability(originAvailValueLetter, originAvailValueNumber);
                            if (selectedAvailabilityGangOrigin && combined) {
                              const selectedOrigin = gangOriginList.find(g => g.id === selectedAvailabilityGangOrigin);
                              if (selectedOrigin) {
                                setEquipmentOriginAvailabilities(prev => [
                                  ...prev,
                                  {
                                    origin_name: selectedOrigin.origin_name,
                                    gang_origin_id: selectedOrigin.id,
                                    availability: combined
                                  }
                                ]);
                                setShowOriginAvailabilityDialog(false);
                                setSelectedAvailabilityGangOrigin("");
                                setOriginAvailValueLetter('');
                                setOriginAvailValueNumber(6);
                              }
                            }
                          }}
                          confirmText="Save"
                          confirmDisabled={
                            !selectedAvailabilityGangOrigin ||
                            !originAvailValueLetter
                          }
                          width="sm"
                        >
                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium mb-1">Gang Origin</label>
                              <select
                                value={selectedAvailabilityGangOrigin}
                                onChange={(e) => {
                                  const selected = gangOriginList.find(g => g.id === e.target.value);
                                  if (selected) {
                                    setSelectedAvailabilityGangOrigin(e.target.value);
                                  }
                                }}
                                className="w-full p-2 border rounded-md"
                              >
                                <option key="default" value="">Select a Gang Origin</option>
                                <GangOriginOptions origins={filteredGangOrigins} />
                              </select>
                            </div>

                            <AvailabilityPicker
                              label="Availability"
                              letter={originAvailValueLetter}
                              number={originAvailValueNumber}
                              onLetterChange={setOriginAvailValueLetter}
                              onNumberChange={setOriginAvailValueNumber}
                              allowEmpty
                            />
                          </div>
                        </Modal>
                      )}
                    </div>
                    )}

                    {/* Availability per Gang Variant — N23 only */}
                    {showAvailability && (
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-1">
                        Availability per Gang Variant
                      </label>
                      <Button
                        onClick={() => setShowVariantAvailabilityDialog(true)}
                        variant="outline"
                        size="sm"
                        className="mb-2"
                      >
                        Add Variant
                      </Button>

                      {equipmentVariantAvailabilities.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {equipmentVariantAvailabilities.map((avail, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-muted"
                            >
                              <span>{avail.variant} (Availability: {avail.availability})</span>
                              <button
                                onClick={() => setEquipmentVariantAvailabilities(prev =>
                                  prev.filter((_, i) => i !== index)
                                )}
                                className="hover:text-red-500 focus:outline-hidden"
                                disabled={!selectedEquipmentId}
                              >
                                <HiX className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {showVariantAvailabilityDialog && (
                        <Modal
                          title="Availability per Gang Variant"
                          helper="Select a gang variant and enter an availability value"
                          onClose={() => {
                            setShowVariantAvailabilityDialog(false);
                            setSelectedAvailabilityGangVariant("");
                            setVariantAvailValueLetter('');
                            setVariantAvailValueNumber(6);
                          }}
                          onConfirm={() => {
                            const combined = combineAvailability(variantAvailValueLetter, variantAvailValueNumber);
                            if (selectedAvailabilityGangVariant && combined) {
                              const alreadyExists = equipmentVariantAvailabilities.some(
                                a => a.gang_variant_id === selectedAvailabilityGangVariant
                              );
                              if (alreadyExists) {
                                toast.error('This variant already has an availability set');
                                return false;
                              }

                              const selectedVariant = gangVariantList.find(g => g.id === selectedAvailabilityGangVariant);
                              if (selectedVariant) {
                                setEquipmentVariantAvailabilities(prev => [
                                  ...prev,
                                  {
                                    variant: selectedVariant.variant,
                                    gang_variant_id: selectedVariant.id,
                                    availability: combined
                                  }
                                ]);
                                setShowVariantAvailabilityDialog(false);
                                setSelectedAvailabilityGangVariant("");
                                setVariantAvailValueLetter('');
                                setVariantAvailValueNumber(6);
                              }
                            }
                          }}
                          confirmText="Save"
                          confirmDisabled={
                            !selectedAvailabilityGangVariant ||
                            !variantAvailValueLetter
                          }
                          width="sm"
                        >
                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium mb-1">Gang Variant</label>
                              <select
                                value={selectedAvailabilityGangVariant}
                                onChange={(e) => {
                                  const selected = gangVariantList.find(g => g.id === e.target.value);
                                  if (selected) {
                                    setSelectedAvailabilityGangVariant(e.target.value);
                                  }
                                }}
                                className="w-full p-2 border rounded-md"
                              >
                                <option key="default" value="">Select a Gang Variant</option>
                                <GangVariantOptions variants={filteredGangVariants} />
                              </select>
                            </div>

                            <AvailabilityPicker
                              label="Availability"
                              letter={variantAvailValueLetter}
                              number={variantAvailValueNumber}
                              onLetterChange={setVariantAvailValueLetter}
                              onNumberChange={setVariantAvailValueNumber}
                              allowEmpty
                            />
                          </div>
                        </Modal>
                      )}
                    </div>
                    )}
                  </div>
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
                    disabled={!selectedEquipmentId}
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
                          { fighter_type_id: value, gang_origin_id: null, gang_variant_id: null, fighter_subtype: null }
                        ]);
                      }
                      e.target.value = "";
                    }}
                    className="w-full p-2 border rounded-md"
                    disabled={!selectedEquipmentId}
                  >
                    <option value="">Select fighter type to add</option>
                    {filteredFighterTypes
                      .filter(ft => !fighterTypeGrants.some(
                        g => g.fighter_type_id === ft.id
                          && !g.gang_origin_id && !g.gang_variant_id && !g.fighter_subtype
                      ))
                      .map((ft) => (
                        <option key={ft.id} value={ft.id}>
                          {fighterTypeLabel(ft)}
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
                        grant.gang_variant_id
                          ? `Variant: ${gangVariantList.find(v => v.id === grant.gang_variant_id)?.variant ?? '…'}`
                          : null,
                        grant.fighter_subtype ? `Subtype: ${grant.fighter_subtype}` : null
                      ].filter(Boolean).join(', ');

                      return (
                        <div
                          key={grantKey(grant)}
                          className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-muted"
                        >
                          <span>{ft ? fighterTypeLabel(ft) : 'Any fighter type'}{scope && ` — ${scope}`}</span>
                          <button
                            type="button"
                            onClick={() => setFighterTypeGrants(
                              fighterTypeGrants.filter(g => grantKey(g) !== grantKey(grant))
                            )}
                            className="hover:text-red-500 focus:outline-hidden"
                            disabled={!selectedEquipmentId}
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
                      helper="Narrow a grant to a gang origin, variant and/or fighter subtype. Leave Fighter Type as Any for a subtype rule spanning every gang."
                      onClose={() => {
                        setShowScopedGrantDialog(false);
                        setScopedGrantFighterType("");
                        setScopedGrantOrigin("");
                        setScopedGrantVariant("");
                        setScopedGrantSubtype("");
                      }}
                      onConfirm={() => {
                        const grant: FighterTypeEquipmentGrant = {
                          fighter_type_id: scopedGrantFighterType || null,
                          gang_origin_id: scopedGrantOrigin || null,
                          gang_variant_id: scopedGrantVariant || null,
                          fighter_subtype: scopedGrantSubtype || null
                        };
                        if (fighterTypeGrants.some(g => grantKey(g) === grantKey(grant))) {
                          toast.error('That combination is already on the list');
                          return false;
                        }
                        setFighterTypeGrants([...fighterTypeGrants, grant]);
                        setShowScopedGrantDialog(false);
                        setScopedGrantFighterType("");
                        setScopedGrantOrigin("");
                        setScopedGrantVariant("");
                        setScopedGrantSubtype("");
                      }}
                      confirmText="Save"
                      confirmDisabled={
                        // Needs an identity, and a scope the dropdown can't already give
                        (!scopedGrantFighterType && !scopedGrantSubtype)
                        || (!scopedGrantOrigin && !scopedGrantVariant && !scopedGrantSubtype)
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
                                {fighterTypeLabel(ft)}
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
                          <label className="block text-sm font-medium mb-1">Gang Variant</label>
                          <select
                            value={scopedGrantVariant}
                            onChange={(e) => setScopedGrantVariant(e.target.value)}
                            className="w-full p-2 border rounded-md"
                          >
                            <option key="default" value="">Any Gang Variant</option>
                            <GangVariantOptions variants={filteredGangVariants} />
                          </select>
                        </div>
                      </div>
                    </Modal>
                  )}
                </div>
              )}

              {/* Trading Post Section - Add this above Fighter Effects */}
              {selectedEquipmentId && (
                <AdminTradingPost
                  equipmentId={selectedEquipmentId}
                  selectedTradingPosts={selectedTradingPosts}
                  setSelectedTradingPosts={setSelectedTradingPosts}
                  tradingPostTypes={tradingPostTypes}
                  editionId={editionId}
                  disabled={!selectedEquipmentId}
                />
              )}

              {/* Fighter Effects Section */}
              {selectedEquipmentId && (
                <div className="col-span-3">
                  <AdminFighterEffects
                    equipmentId={selectedEquipmentId}
                    editionId={editionId}
                    fighterEffects={fighterEffects}
                    fighterEffectCategories={fighterEffectCategories}
                    onUpdate={() => {
                      // No toast needed as effects show directly in UI
                    }}
                    onChange={(effects) => {
                      setFighterEffects(effects);
                    }}
                  />
                </div>
              )}

              {/* Weapon Profiles Section */}
              {equipmentType === 'weapon' && (
                <div className="col-span-3 space-y-4">
                  <div className="flex justify-between items-center sticky top-0 bg-card py-2">
                    <h4 className="text-lg font-semibold">Weapon Profiles</h4>
                    <Button
                      onClick={addProfile}
                      variant="outline"
                      size="sm"
                      disabled={!selectedEquipmentId}
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
                              onClick={() => removeProfile(index)}
                              disabled={!selectedEquipmentId}
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
                              disabled={!selectedEquipmentId}
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
                              disabled={!selectedEquipmentId}
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
                            disabled={!selectedEquipmentId}
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
                          disabled={!selectedEquipmentId}
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
                              disabled={!selectedEquipmentId}
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