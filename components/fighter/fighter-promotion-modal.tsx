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

interface FighterPromotionModalProps {
  currentClass: string;
  currentSpecialRules: string[];
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
  fighterTypes,
  isOpen,
  onClose,
  onPromoted,
}: FighterPromotionModalProps) {
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [newSpecialRules, setNewSpecialRules] = useState<string[]>([]);
  const [newRuleInput, setNewRuleInput] = useState('');

  const targetClass = PROMOTION_MAP[currentClass] || '';

  // Filter fighter types to only those matching the target promotion class
  const eligibleTypes = useMemo(() => {
    if (!targetClass) return [];
    return fighterTypes.filter(ft => ft.fighter_class === targetClass);
  }, [fighterTypes, targetClass]);

  const selectedType = eligibleTypes.find(ft => ft.id === selectedTypeId);

  // Reset state on each open, pre-select the first eligible type
  useEffect(() => {
    if (isOpen) {
      const firstId = eligibleTypes.length > 0 ? eligibleTypes[0].id : '';
      setSelectedTypeId(firstId);
      // Initialize new special rules from the first eligible type
      const firstType = eligibleTypes.length > 0 ? eligibleTypes[0] : null;
      setNewSpecialRules(firstType?.special_rules ? [...firstType.special_rules] : []);
      setNewRuleInput('');
    }
  }, [isOpen, eligibleTypes]);

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
      confirmDisabled={!selectedType}
      content={
        <div className="space-y-4">
          {/* Fighter type selection dropdown */}
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

          {/* New Special Rules (editable) */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Special Rules To Be Added
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
