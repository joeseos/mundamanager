import { useState, useEffect, useMemo } from 'react';
import { Input } from "@/components/ui/input";
import Modal from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Checkbox } from "@/components/ui/checkbox";
import { HiX } from "react-icons/hi";
import { ImInfo } from "react-icons/im";
import { fighterClassRank } from '@/utils/fighterClassRank';

// Determines the target class for promotion based on current class
const PROMOTION_MAP: Record<string, string> = {
  'Ganger': 'Specialist',
  'Juve': 'Specialist',
  'Prospect': 'Champion',
  'Champion': 'Leader',
  'Specialist': 'Champion',
  'Exotic Beast': 'Exotic Beast Specialist',
  'Exotic Beast Specialist': 'Champion',
};

const EXOTIC_BEAST_SPECIALIST_CLASS_ID = '38598144-0f38-43c5-9a07-512106b9fc9e';
const EXOTIC_BEAST_SPECIALIST_CLASS_NAME = 'Exotic Beast Specialist';

const normalizeSpecialRule = (rule: string) => rule.replace(/^"|"$/g, '');

function normalizeSpecialRules(rules: (string | unknown)[]): string[] {
  return rules
    .map((r) => (typeof r === 'string' ? normalizeSpecialRule(r) : String(r)))
    .filter(Boolean);
}

type PromotionFighterType = FighterPromotionModalProps['fighterTypes'][number];

function sortPromotionFighterTypes(types: PromotionFighterType[]): PromotionFighterType[] {
  return [...types].sort((a, b) => {
    const classRankA = fighterClassRank[a.fighter_class.toLowerCase()] ?? Infinity;
    const classRankB = fighterClassRank[b.fighter_class.toLowerCase()] ?? Infinity;
    if (classRankA !== classRankB) return classRankA - classRankB;

    const typeCompare = a.fighter_type.localeCompare(b.fighter_type);
    if (typeCompare !== 0) return typeCompare;

    return (a.sub_type?.sub_type_name || '').localeCompare(b.sub_type?.sub_type_name || '');
  });
}

function formatPromotionFighterTypeLabel(ft: PromotionFighterType): string {
  const base = `${ft.fighter_type} (${ft.fighter_class})`;
  return ft.sub_type?.sub_type_name ? `${base}, ${ft.sub_type.sub_type_name}` : base;
}

interface FighterPromotionModalProps {
  currentClass: string;
  currentSpecialRules: string[];
  currentFighterType?: string;
  currentFighterTypeId?: string;
  currentFighterSubTypeId?: string;
  fighterTypes: Array<{
    id: string;
    fighter_type: string;
    fighter_class: string;
    fighter_class_id?: string;
    special_rules?: string[];
    total_cost: number;
    sub_type?: { id: string; sub_type_name: string } | null;
  }>;
  isOpen: boolean;
  onClose: () => void;
  /** When true, shows guidance to use Add Advancement for XP-based promotion. */
  showXpPromotionHint?: boolean;
  onPromoted: (data: {
    fighter_type: string;
    fighter_type_id: string;
    fighter_class: string;
    fighter_class_id: string;
    special_rules: string[];
  }) => void;
}

export function FighterPromotionModal({
  currentClass,
  currentSpecialRules,
  currentFighterType,
  currentFighterTypeId,
  currentFighterSubTypeId,
  fighterTypes,
  isOpen,
  onClose,
  showXpPromotionHint = false,
  onPromoted,
}: FighterPromotionModalProps) {
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [newSpecialRules, setNewSpecialRules] = useState<string[]>([]);
  const [newRuleInput, setNewRuleInput] = useState('');
  const [includeAllGangFighterTypes, setIncludeAllGangFighterTypes] = useState(false);

  const targetClass = PROMOTION_MAP[currentClass] || '';
  const isExoticBeast = currentClass === 'Exotic Beast';

  // Fighter types matching the standard promotion target class
  const eligibleTypes = useMemo(() => {
    if (isExoticBeast || !targetClass) return [];
    return sortPromotionFighterTypes(
      fighterTypes.filter(ft => ft.fighter_class === targetClass)
    );
  }, [fighterTypes, targetClass, isExoticBeast]);

  // Types shown in the combobox: eligible only, or all gang types when expanded
  const displayTypes = useMemo(() => {
    if (isExoticBeast) return [];
    if (includeAllGangFighterTypes) {
      return sortPromotionFighterTypes(fighterTypes);
    }
    return eligibleTypes;
  }, [fighterTypes, eligibleTypes, isExoticBeast, includeAllGangFighterTypes]);

  const selectedType = displayTypes.find(ft => ft.id === selectedTypeId);

  const resolvedCurrentSubTypeId = useMemo(() => {
    if (currentFighterSubTypeId) return currentFighterSubTypeId;
    if (!currentFighterTypeId) return '';
    return fighterTypes.find(ft => ft.id === currentFighterTypeId)?.sub_type?.id ?? '';
  }, [currentFighterSubTypeId, currentFighterTypeId, fighterTypes]);

  const fighterTypeComboboxOptions = useMemo(
    () =>
      displayTypes.map((ft) => {
        const labelText = formatPromotionFighterTypeLabel(ft);
        const optionSubTypeId = ft.sub_type?.id ?? '';
        const isDifferentSubType =
          Boolean(resolvedCurrentSubTypeId) && optionSubTypeId !== resolvedCurrentSubTypeId;
        const isIneligibleForPromotion =
          includeAllGangFighterTypes && Boolean(targetClass) && ft.fighter_class !== targetClass;
        const useMutedStyle = isDifferentSubType || isIneligibleForPromotion;

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
    [displayTypes, resolvedCurrentSubTypeId, includeAllGangFighterTypes, targetClass]
  );

  const normalizedCurrentSpecialRules = useMemo(
    () => normalizeSpecialRules(currentSpecialRules),
    [currentSpecialRules]
  );

  // Reset state on each open, pre-select the first eligible type
  useEffect(() => {
    if (isOpen) {
      if (isExoticBeast) {
        setSelectedTypeId('');
        setIncludeAllGangFighterTypes(false);
        setNewSpecialRules(normalizeSpecialRules(currentSpecialRules));
        setNewRuleInput('');
      } else {
        setIncludeAllGangFighterTypes(false);
        const firstType = eligibleTypes.length > 0 ? eligibleTypes[0] : null;
        setSelectedTypeId(firstType?.id || '');
        setNewSpecialRules(
          firstType?.special_rules ? normalizeSpecialRules(firstType.special_rules) : []
        );
        setNewRuleInput('');
      }
    }
  }, [isOpen, eligibleTypes, isExoticBeast, currentSpecialRules]);

  const handleIncludeAllGangFighterTypesChange = (checked: boolean) => {
    setIncludeAllGangFighterTypes(checked);
    const types = checked
      ? sortPromotionFighterTypes(fighterTypes)
      : eligibleTypes;
    const firstType = types.length > 0 ? types[0] : null;
    setSelectedTypeId(firstType?.id || '');
    setNewSpecialRules(
      firstType?.special_rules ? normalizeSpecialRules(firstType.special_rules) : []
    );
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
    if (isExoticBeast) {
      onPromoted({
        fighter_type: currentFighterType || '',
        fighter_type_id: currentFighterTypeId || '',
        fighter_class: EXOTIC_BEAST_SPECIALIST_CLASS_NAME,
        fighter_class_id: EXOTIC_BEAST_SPECIALIST_CLASS_ID,
        special_rules: newSpecialRules,
      });
      return;
    }
    if (!selectedType) return;
    onPromoted({
      fighter_type: selectedType.fighter_type,
      fighter_type_id: selectedType.id,
      fighter_class: selectedType.fighter_class,
      fighter_class_id: selectedType.fighter_class_id || '',
      special_rules: newSpecialRules,
    });
  };

  if (!isOpen) return null;

  return (
    <Modal
      title="Promote Fighter"
      width="sm"
      onClose={onClose}
      onConfirm={handleConfirm}
      confirmText="Confirm Promotion"
      confirmDisabled={!isExoticBeast && !selectedType}
      content={
        <div className="space-y-6">
          {isExoticBeast ? (
            /* Exotic Beast simplified promotion UI */
            <div>
              <p className="text-sm">
                This fighter will be promoted to <strong>{EXOTIC_BEAST_SPECIALIST_CLASS_NAME}</strong>.
              </p>
            </div>
          ) : (
            /* Standard fighter type selection dropdown */
            <>
              {showXpPromotionHint && (
                <div className="mb-4">
                  <p className="text-sm mb-2 text-amber-500">
                    To promote a fighter using XP, click Add Advancement on the Fighter page.
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
                      : `No eligible ${targetClass || 'promotion'} Fighter Types available.`}
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
                    <ImInfo />
                    <div className="absolute bottom-full mb-2 hidden group-hover:block bg-black text-white text-xs p-2 rounded-sm w-64 -left-36">
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
              {isExoticBeast ? 'Special Rules' : 'Special Rules to be Added'}
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
