import { useState, useEffect, useMemo } from 'react';
import { Input } from "@/components/ui/input";
import Modal from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { HiX } from "react-icons/hi";

// Determines the target class for promotion based on current class
const PROMOTION_MAP: Record<string, string> = {
  'Ganger': 'Specialist',
  'Juve': 'Specialist',
  'Prospect': 'Champion',
  'Exotic Beast': 'Exotic Beast Specialist',
};

const EXOTIC_BEAST_SPECIALIST_CLASS_ID = '38598144-0f38-43c5-9a07-512106b9fc9e';
const EXOTIC_BEAST_SPECIALIST_CLASS_NAME = 'Exotic Beast Specialist';

interface FighterPromotionModalProps {
  currentClass: string;
  currentSpecialRules: string[];
  currentFighterType?: string;
  currentFighterTypeId?: string;
  fighterTypes: Array<{
    id: string;
    fighter_type: string;
    fighter_class: string;
    fighter_class_id?: string;
    special_rules?: string[];
    total_cost: number;
  }>;
  isOpen: boolean;
  onClose: () => void;
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
  fighterTypes,
  isOpen,
  onClose,
  onPromoted,
}: FighterPromotionModalProps) {
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [newSpecialRules, setNewSpecialRules] = useState<string[]>([]);
  const [newRuleInput, setNewRuleInput] = useState('');

  const targetClass = PROMOTION_MAP[currentClass] || '';
  const isExoticBeast = currentClass === 'Exotic Beast';

  // Filter fighter types to only those matching the target promotion class
  const eligibleTypes = useMemo(() => {
    if (isExoticBeast || !targetClass) return [];
    return fighterTypes.filter(ft => ft.fighter_class === targetClass);
  }, [fighterTypes, targetClass, isExoticBeast]);

  const selectedType = eligibleTypes.find(ft => ft.id === selectedTypeId);

  // Reset state on each open, pre-select the first eligible type
  useEffect(() => {
    if (isOpen) {
      if (isExoticBeast) {
        setSelectedTypeId('');
        setNewSpecialRules([...currentSpecialRules]);
        setNewRuleInput('');
      } else {
        const eligible = targetClass
          ? fighterTypes.filter(ft => ft.fighter_class === targetClass)
          : [];
        const firstType = eligible.length > 0 ? eligible[0] : null;
        setSelectedTypeId(firstType?.id || '');
        setNewSpecialRules(firstType?.special_rules ? [...firstType.special_rules] : []);
        setNewRuleInput('');
      }
    }
  }, [isOpen, targetClass, fighterTypes, isExoticBeast, currentSpecialRules]);

  // When selection changes, update new special rules from the selected type
  const handleTypeChange = (typeId: string) => {
    setSelectedTypeId(typeId);
    const type = eligibleTypes.find(ft => ft.id === typeId);
    setNewSpecialRules(type?.special_rules ? [...type.special_rules] : []);
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
        <div className="space-y-4">
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
              <div>
                <label className="block text-sm font-medium mb-1">
                  Promote to Fighter Type
                </label>
                {eligibleTypes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No eligible {targetClass || 'promotion'} fighter types available for this gang.
                  </p>
                ) : (
                  <select
                    value={selectedTypeId}
                    onChange={(e) => handleTypeChange(e.target.value)}
                    className="w-full p-2 border rounded-md"
                  >
                    {eligibleTypes.map(ft => (
                      <option key={ft.id} value={ft.id}>
                        {ft.fighter_type} ({ft.fighter_class})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Current Special Rules (read-only) */}
              {currentSpecialRules.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                  Special Rules To Be Removed
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {currentSpecialRules.map((rule, index) => (
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
              {isExoticBeast ? 'Special Rules' : 'Special Rules To Be Added'}
            </label>
            <div className="flex space-x-2 mb-2">
              <Input
                type="text"
                value={newRuleInput}
                onChange={(e) => setNewRuleInput(e.target.value)}
                placeholder="Add a Special Rule"
                className="flex-grow"
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
                    className="ml-2 text-muted-foreground hover:text-muted-foreground focus:outline-none"
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
