import { useState, useMemo } from 'react';
import { Input } from "@/components/ui/input";
import Modal from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Checkbox } from "@/components/ui/checkbox";
import { HiX } from "react-icons/hi";
import { ImInfo } from "react-icons/im";
import { getFighterSubtypeSortRank } from '@/utils/fighterSubtypeRank';
import {
  hasChampionLeaderTypePromotion,
  hasGangerChampionKeepTypePromotion,
  hasProspectSpecialisationPromotion,
} from '@/types/edition';
import {
  N26_CHAMPION_PROMOTION_SKILL_NAME,
  N26_PROSPECT_PROMOTION_CREDITS,
  N26_PROSPECT_SPECIALISATIONS,
  buildN26ChampionLeaderPromotionSubtypes,
  buildN26GangerChampionPromotionSubtypes,
  buildN26ProspectPromotionSubtypes,
} from '@/utils/keepTypePromotionN26';

// Determines the target subtype for promotion based on current subtype
const PROMOTION_MAP: Record<string, string> = {
  'Ganger': 'Specialist',
  'Juve': 'Specialist',
  'Prospect': 'Champion',
  'Champion': 'Leader',
  'Specialist': 'Champion',
  'Exotic Beast': 'Exotic Beast Specialist',
  'Exotic Beast Specialist': 'Champion',
};

const EXOTIC_BEAST_SPECIALIST_SUBTYPE_NAME = 'Exotic Beast Specialist';

const normalizeSpecialRule = (rule: string) => rule.replace(/^"|"$/g, '');

function normalizeSpecialRules(rules: (string | unknown)[]): string[] {
  return rules
    .map((r) => (typeof r === 'string' ? normalizeSpecialRule(r) : String(r)))
    .filter(Boolean);
}

/** First subtype that has a promotion target — not blindly subtypes[0]. */
function promotionSourceSubtype(subtypes: string[], fallback: string): string {
  for (const subtype of subtypes) {
    if (subtype in PROMOTION_MAP) return subtype;
  }
  return fallback;
}

type PromotionFighterType = FighterPromotionModalProps['fighterTypes'][number];

function sortPromotionFighterTypes(
  types: PromotionFighterType[],
  editionSlug?: string | null
): PromotionFighterType[] {
  return [...types].sort((a, b) => {
    const subtypeRankA = getFighterSubtypeSortRank(a.fighter_subtypes, editionSlug);
    const subtypeRankB = getFighterSubtypeSortRank(b.fighter_subtypes, editionSlug);
    if (subtypeRankA !== subtypeRankB) return subtypeRankA - subtypeRankB;

    const typeCompare = a.fighter_type.localeCompare(b.fighter_type);
    if (typeCompare !== 0) return typeCompare;

    return (a.specialisation?.specialisation_name || '').localeCompare(b.specialisation?.specialisation_name || '');
  });
}

function formatPromotionFighterTypeLabel(ft: PromotionFighterType): string {
  const base = `${ft.fighter_type} (${ft.fighter_subtypes.join(', ')})`;
  return ft.specialisation?.specialisation_name ? `${base}, ${ft.specialisation.specialisation_name}` : base;
}

export type FighterPromotionResult = {
  fighter_type: string;
  fighter_type_id: string;
  fighter_subtypes: string[];
  special_rules: string[];
  fighter_specialisation?: string | null;
  fighter_specialisation_id?: string | null;
  /** N26 promotion recipes with skill grants. */
  kind?: 'n26_prospect' | 'n26_ganger_champion' | 'n26_champion_leader';
  credits_increase?: number;
};

function promotionSpecialisationFields(
  type?: { specialisation?: { id: string; specialisation_name: string } | null } | null
): Pick<FighterPromotionResult, 'fighter_specialisation' | 'fighter_specialisation_id'> {
  return {
    fighter_specialisation: type?.specialisation?.specialisation_name ?? null,
    fighter_specialisation_id: type?.specialisation?.id ?? null,
  };
}

interface FighterPromotionModalProps {
  currentSubtype: string;
  currentSubtypes?: string[];
  currentSpecialRules: string[];
  currentFighterType?: string;
  currentFighterTypeId?: string;
  currentFighterSpecialisationId?: string;
  fighterTypes: Array<{
    id: string;
    fighter_type: string;
    special_rules?: string[];
    fighter_subtypes: string[];
    total_cost: number;
    specialisation?: { id: string; specialisation_name: string } | null;
  }>;
  editionSlug?: string | null;
  isOpen: boolean;
  onClose: () => void;
  /** When true, shows guidance to use Add Advancement for XP-based promotion. */
  showXpPromotionHint?: boolean;
  onPromoted: (data: FighterPromotionResult) => void;
}

export function FighterPromotionModal({
  currentSubtype,
  currentSubtypes,
  currentSpecialRules,
  currentFighterType,
  currentFighterTypeId,
  currentFighterSpecialisationId,
  fighterTypes,
  editionSlug = null,
  isOpen,
  onClose,
  showXpPromotionHint = false,
  onPromoted,
}: FighterPromotionModalProps) {
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [selectedSpecialisationId, setSelectedSpecialisationId] = useState('');
  const [newSpecialRules, setNewSpecialRules] = useState<string[]>([]);
  const [newRuleInput, setNewRuleInput] = useState('');
  const [includeAllGangFighterTypes, setIncludeAllGangFighterTypes] = useState(false);

  const resolvedSubtypes = currentSubtypes?.length ? currentSubtypes : (currentSubtype ? [currentSubtype] : []);
  const isN26ProspectPromotion =
    hasProspectSpecialisationPromotion(editionSlug) &&
    resolvedSubtypes.includes('Prospect');
  const isN26GangerChampionPromotion =
    !isN26ProspectPromotion &&
    hasGangerChampionKeepTypePromotion(editionSlug) &&
    resolvedSubtypes.includes('Ganger') &&
    !resolvedSubtypes.includes('Champion');
  const isN26ChampionLeaderPromotion =
    !isN26ProspectPromotion &&
    !isN26GangerChampionPromotion &&
    hasChampionLeaderTypePromotion(editionSlug) &&
    resolvedSubtypes.includes('Champion') &&
    !resolvedSubtypes.includes('Leader');
  const sourceSubtype = promotionSourceSubtype(resolvedSubtypes, currentSubtype);
  // Specialist+Champion would otherwise map Specialist→Champion; force Leader for this path.
  const targetSubtype = isN26ChampionLeaderPromotion
    ? 'Leader'
    : (PROMOTION_MAP[sourceSubtype] || '');
  const isExoticBeast = resolvedSubtypes.includes('Exotic Beast') || currentSubtype === 'Exotic Beast';
  const isSimplifiedPath = isExoticBeast || isN26ProspectPromotion || isN26GangerChampionPromotion;

  const n26ProspectSubtypes = useMemo(
    () => buildN26ProspectPromotionSubtypes(
      currentSubtypes?.length ? currentSubtypes : (currentSubtype ? [currentSubtype] : [])
    ),
    [currentSubtypes, currentSubtype]
  );

  const n26GangerChampionSubtypes = useMemo(
    () => buildN26GangerChampionPromotionSubtypes(
      currentSubtypes?.length ? currentSubtypes : (currentSubtype ? [currentSubtype] : [])
    ),
    [currentSubtypes, currentSubtype]
  );

  const n26ChampionLeaderSubtypes = useMemo(
    () => buildN26ChampionLeaderPromotionSubtypes(
      currentSubtypes?.length ? currentSubtypes : (currentSubtype ? [currentSubtype] : [])
    ),
    [currentSubtypes, currentSubtype]
  );

  const specialisationComboboxOptions = useMemo(
    () =>
      N26_PROSPECT_SPECIALISATIONS.map((s) => ({
        value: s.id,
        label: s.name,
        displayValue: s.name,
      })),
    []
  );

  // Fighter types matching the standard promotion target subtype
  const eligibleTypes = useMemo(() => {
    if (isSimplifiedPath || !targetSubtype) return [];
    return sortPromotionFighterTypes(
      fighterTypes.filter(ft => ft.fighter_subtypes.includes(targetSubtype)),
      editionSlug
    );
  }, [fighterTypes, targetSubtype, isSimplifiedPath, editionSlug]);

  // Types shown in the combobox: eligible only, or all gang types when expanded
  const displayTypes = useMemo(() => {
    if (isSimplifiedPath) return [];
    if (includeAllGangFighterTypes) {
      return sortPromotionFighterTypes(fighterTypes, editionSlug);
    }
    return eligibleTypes;
  }, [fighterTypes, eligibleTypes, isSimplifiedPath, includeAllGangFighterTypes, editionSlug]);

  const selectedType = displayTypes.find(ft => ft.id === selectedTypeId);
  const selectedSpecialisation = N26_PROSPECT_SPECIALISATIONS.find(
    (s) => s.id === selectedSpecialisationId
  );

  const resolvedCurrentSpecialisationId = useMemo(() => {
    if (currentFighterSpecialisationId) return currentFighterSpecialisationId;
    if (!currentFighterTypeId) return '';
    return fighterTypes.find(ft => ft.id === currentFighterTypeId)?.specialisation?.id ?? '';
  }, [currentFighterSpecialisationId, currentFighterTypeId, fighterTypes]);

  const fighterTypeComboboxOptions = useMemo(
    () =>
      displayTypes.map((ft) => {
        const labelText = formatPromotionFighterTypeLabel(ft);
        const optionSpecialisationId = ft.specialisation?.id ?? '';
        // Champion→Leader clears specialisation; do not mute Leaders for mismatch.
        const isDifferentSpecialisation =
          !isN26ChampionLeaderPromotion &&
          Boolean(resolvedCurrentSpecialisationId) &&
          optionSpecialisationId !== resolvedCurrentSpecialisationId;
        const isIneligibleForPromotion =
          includeAllGangFighterTypes && Boolean(targetSubtype) && !ft.fighter_subtypes.includes(targetSubtype);
        const useMutedStyle = isDifferentSpecialisation || isIneligibleForPromotion;

        return {
          value: ft.id,
          label: useMutedStyle ? (
            <span className="italic text-neutral-400">{labelText}</span>
          ) : (
            labelText
          ),
          displayValue: labelText,
        };
      }),
    [
      displayTypes,
      resolvedCurrentSpecialisationId,
      includeAllGangFighterTypes,
      targetSubtype,
      isN26ChampionLeaderPromotion,
    ]
  );

  const normalizedCurrentSpecialRules = useMemo(
    () => normalizeSpecialRules(currentSpecialRules),
    [currentSpecialRules]
  );

  // Reset state on each open, pre-select the first eligible type
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen && !prevIsOpen) {
    if (isSimplifiedPath) {
      setSelectedTypeId('');
      setSelectedSpecialisationId('');
      setIncludeAllGangFighterTypes(false);
      setNewSpecialRules(normalizeSpecialRules(currentSpecialRules));
      setNewRuleInput('');
    } else {
      setIncludeAllGangFighterTypes(false);
      setSelectedTypeId('');
      setSelectedSpecialisationId('');
      setNewSpecialRules([]);
      setNewRuleInput('');
    }
  }
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
  }

  const handleIncludeAllGangFighterTypesChange = (checked: boolean) => {
    setIncludeAllGangFighterTypes(checked);
    setSelectedTypeId('');
    setNewSpecialRules([]);
  };

  // When selection changes, update new special rules from the selected type
  const handleTypeChange = (typeId: string) => {
    setSelectedTypeId(typeId);
    const type = displayTypes.find(ft => ft.id === typeId);
    setNewSpecialRules(type?.special_rules ? normalizeSpecialRules(type.special_rules) : []);
  };

  const handleAddRule = () => {
    const trimmed = newRuleInput.trim();
    if (!trimmed) return;
    if (newSpecialRules.includes(trimmed)) {
      setNewRuleInput('');
      return;
    }
    setNewSpecialRules(prev => [...prev, trimmed]);
    setNewRuleInput('');
  };

  const handleRemoveRule = (ruleToRemove: string) => {
    setNewSpecialRules(prev => prev.filter(rule => rule !== ruleToRemove));
  };

  const handleConfirm = () => {
    if (isN26ProspectPromotion) {
      if (!selectedSpecialisation) return;
      onPromoted({
        kind: 'n26_prospect',
        fighter_type: currentFighterType || '',
        fighter_type_id: currentFighterTypeId || '',
        fighter_subtypes: n26ProspectSubtypes,
        special_rules: newSpecialRules,
        fighter_specialisation: selectedSpecialisation.name,
        fighter_specialisation_id: selectedSpecialisation.id,
        credits_increase: N26_PROSPECT_PROMOTION_CREDITS,
      });
      return;
    }
    if (isN26GangerChampionPromotion) {
      // Omit specialisation fields so optimistic UI does not clear an existing one.
      onPromoted({
        kind: 'n26_ganger_champion',
        fighter_type: currentFighterType || '',
        fighter_type_id: currentFighterTypeId || '',
        fighter_subtypes: n26GangerChampionSubtypes,
        special_rules: newSpecialRules,
      });
      return;
    }
    if (isN26ChampionLeaderPromotion) {
      if (!selectedType) return;
      // Omit specialisation fields so optimistic UI does not clear an existing one.
      onPromoted({
        kind: 'n26_champion_leader',
        fighter_type: selectedType.fighter_type,
        fighter_type_id: selectedType.id,
        fighter_subtypes: n26ChampionLeaderSubtypes,
        special_rules: newSpecialRules,
      });
      return;
    }
    if (isExoticBeast) {
      const currentType = fighterTypes.find((ft) => ft.id === currentFighterTypeId);
      onPromoted({
        fighter_type: currentFighterType || '',
        fighter_type_id: currentFighterTypeId || '',
        fighter_subtypes: [EXOTIC_BEAST_SPECIALIST_SUBTYPE_NAME],
        special_rules: newSpecialRules,
        ...promotionSpecialisationFields(currentType),
      });
      return;
    }
    if (!selectedType) return;
    onPromoted({
      fighter_type: selectedType.fighter_type,
      fighter_type_id: selectedType.id,
      fighter_subtypes: selectedType.fighter_subtypes,
      special_rules: newSpecialRules,
      ...promotionSpecialisationFields(selectedType),
    });
  };

  const confirmDisabled = isN26ProspectPromotion
    ? !selectedSpecialisation
    : !isExoticBeast && !isN26GangerChampionPromotion && !selectedType;

  if (!isOpen) return null;

  return (
    <Modal
      title="Promote Fighter"
      width="sm"
      onClose={onClose}
      onConfirm={handleConfirm}
      confirmText="Confirm Promotion"
      confirmDisabled={confirmDisabled}
      content={
        <div className="space-y-6">
          {isN26ProspectPromotion ? (
            <div className="space-y-4">
              <p className="text-sm">
                This fighter will remain a <strong>{currentFighterType || 'Prospect'}</strong>,
                lose the <strong>Prospect</strong> subtype, and gain{' '}
                <strong>Ganger</strong> and <strong>Specialist</strong>.
                Rating increases by <strong>{N26_PROSPECT_PROMOTION_CREDITS}</strong>.
              </p>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Specialisation
                </label>
                <Combobox
                  value={selectedSpecialisationId}
                  onValueChange={setSelectedSpecialisationId}
                  placeholder="Select a Specialisation"
                  options={specialisationComboboxOptions}
                  dropdownPlacement="down"
                />
                {selectedSpecialisation && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Grants skill: {selectedSpecialisation.skillName}
                  </p>
                )}
              </div>
            </div>
          ) : isN26GangerChampionPromotion ? (
            <div>
              <p className="text-sm">
                This fighter will remain a <strong>{currentFighterType || 'Ganger'}</strong>,
                lose the <strong>Ganger</strong> subtype, and gain <strong>Champion</strong>.
                Grants skill: <strong>{N26_CHAMPION_PROMOTION_SKILL_NAME}</strong>.
                Rating is unchanged.
              </p>
            </div>
          ) : isExoticBeast ? (
            /* Exotic Beast simplified promotion UI */
            <div>
              <p className="text-sm">
                This fighter will be promoted to <strong>{EXOTIC_BEAST_SPECIALIST_SUBTYPE_NAME}</strong>.
              </p>
            </div>
          ) : (
            /* Standard fighter type selection dropdown */
            <>
              {isN26ChampionLeaderPromotion && (
                <p className="text-sm">
                  Select a <strong>Leader</strong> fighter type. Subtypes{' '}
                  <strong>Loner</strong>, <strong>Champion</strong>, <strong>Ganger</strong>, and{' '}
                  <strong>Prospect</strong> are removed; <strong>Leader</strong> is added.
                  Grants skill: <strong>{N26_CHAMPION_PROMOTION_SKILL_NAME}</strong> if not already known.
                  Rating is unchanged.
                </p>
              )}
              {showXpPromotionHint && !isN26ChampionLeaderPromotion && (
                <div className="mb-4">
                  <p className="text-sm mb-2 text-amber-500">
                    To promote a fighter using XP, use the Add Advancement button on the Fighter page.
                  </p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Promote to Fighter Type
                </label>
                {displayTypes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {includeAllGangFighterTypes
                      ? 'No Fighter Types available for this gang.'
                      : `No eligible ${targetSubtype || 'promotion'} Fighter Types available.`}
                  </p>
                ) : (
                  <Combobox
                    value={selectedTypeId}
                    onValueChange={handleTypeChange}
                    placeholder="Select a Fighter Type"
                    options={fighterTypeComboboxOptions}
                    dropdownPlacement="down"
                  />
                )}
                <div className="flex items-center space-x-2 mt-2">
                  <Checkbox
                    id="include-all-gang-fighter-types"
                    checked={includeAllGangFighterTypes}
                    onCheckedChange={(checked) => {
                      handleIncludeAllGangFighterTypesChange(checked as boolean);
                    }}
                  />
                  <label
                    htmlFor="include-all-gang-fighter-types"
                    className="text-sm font-medium text-muted-foreground cursor-pointer"
                  >
                    Include all Gang Fighter Types
                  </label>
                  <div className="relative group">
                    <ImInfo tabIndex={0} className="outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded-sm" />
                    <div className="absolute bottom-full mb-2 hidden group-hover:block group-focus-within:block bg-black text-white text-xs p-2 rounded-sm w-64 -left-36 z-50">
                      When enabled, all Fighter Types available to this gang will be shown, not just those normally eligible for promotion.
                    </div>
                  </div>
                </div>
              </div>

              {/* Current Special Rules (read-only) */}
              {normalizedCurrentSpecialRules.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                  Special Rules to be Removed
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {normalizedCurrentSpecialRules.map((rule, index) => (
                      <div
                        key={index}
                        className="bg-muted px-3 py-1 rounded-full text-sm"
                      >
                        {rule}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Special Rules (editable) */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {isSimplifiedPath ? 'Special Rules' : 'Special Rules to be Added'}
            </label>
            <div className="flex space-x-2 mb-2">
              <Input
                type="text"
                value={newRuleInput}
                onChange={(e) => setNewRuleInput(e.target.value)}
                placeholder="Add a Special Rule"
                className="grow"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddRule();
                  }
                }}
              />
              <Button onClick={handleAddRule} type="button">
                Add
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 mt-2">
              {newSpecialRules.map((rule, index) => (
                <div
                  key={index}
                  className="bg-muted px-3 py-1 rounded-full flex items-center text-sm"
                >
                  <span>{rule}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveRule(rule)}
                    className="ml-2 text-muted-foreground hover:text-muted-foreground focus:outline-hidden"
                  >
                    <HiX size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      }
    />
  );
}
