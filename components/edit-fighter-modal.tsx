import { useState } from 'react';
import { Input } from "@/components/ui/input";
import Modal from "@/components/modal";
import { FighterEffect } from '@/types/fighter';

// Define the Fighter interface locally since it's not exported from types/fighter
interface Fighter {
  id: string;
  fighter_name: string;
  label?: string;
  fighter_type: {
    fighter_type: string;
    fighter_type_id: string;
    fighter_class?: string;
  };
  gang_type_id: string;
  credits: number;
  movement: number;
  weapon_skill: number;
  ballistic_skill: number;
  strength: number;
  toughness: number;
  wounds: number;
  initiative: number;
  attacks: number;
  leadership: number;
  cool: number;
  willpower: number;
  intelligence: number;
  xp: number | null;
  total_xp: number | null;
  effects?: {
    injuries: Array<FighterEffect>;
    advancements: Array<FighterEffect>;
  };
  cost_adjustment?: number;
  kills?: number;
  base_credits?: number;
}

// FighterCharacteristicTable defined within the same file
function FighterCharacteristicTable({ fighter }: { fighter: Fighter }) {
  // Define the stat names and their display labels
  const stats = [
    { key: 'movement', label: 'M' },
    { key: 'weapon_skill', label: 'WS' },
    { key: 'ballistic_skill', label: 'BS' },
    { key: 'strength', label: 'S' },
    { key: 'toughness', label: 'T' },
    { key: 'wounds', label: 'W' },
    { key: 'initiative', label: 'I' },
    { key: 'attacks', label: 'A' },
    { key: 'leadership', label: 'Ld' },
    { key: 'cool', label: 'Cl' },
    { key: 'willpower', label: 'Wil' },
    { key: 'intelligence', label: 'Int' },
  ];

  // Track the specific injuries affecting each stat
  const injuryModifiers: Record<string, Array<{ name: string, value: number }>> = {};
  
  // Track the specific advancements affecting each stat
  const advancementModifiers: Record<string, Array<{ name: string, value: number }>> = {};
  
  // Extract injury effects with proper type annotations
  const injuryEffects = fighter.effects?.injuries?.reduce((acc: Record<string, number>, injury: FighterEffect) => {
    if (injury.fighter_effect_modifiers) {
      injury.fighter_effect_modifiers.forEach(modifier => {
        const statKey = modifier.stat_name.toLowerCase();
        const numValue = modifier.numeric_value;
        
        if (numValue !== 0) {
          if (!injuryModifiers[statKey]) {
            injuryModifiers[statKey] = [];
          }
          
          injuryModifiers[statKey].push({
            name: injury.effect_name || 'Unknown injury',
            value: numValue
          });
          
          acc[statKey] = (acc[statKey] || 0) + numValue;
        }
      });
    }
    return acc;
  }, {} as Record<string, number>) || {};

  // Extract advancement effects with proper type annotations
  const advancementEffects = fighter.effects?.advancements?.reduce((acc: Record<string, number>, advancement: FighterEffect) => {
    if (advancement.fighter_effect_modifiers) {
      advancement.fighter_effect_modifiers.forEach(modifier => {
        const statKey = modifier.stat_name.toLowerCase();
        const numValue = modifier.numeric_value;
        
        if (numValue !== 0) {
          if (!advancementModifiers[statKey]) {
            advancementModifiers[statKey] = [];
          }
          
          advancementModifiers[statKey].push({
            name: advancement.effect_name || 'Unknown advancement',
            value: numValue
          });
          
          acc[statKey] = (acc[statKey] || 0) + numValue;
        }
      });
    }
    return acc;
  }, {} as Record<string, number>) || {};

  // Fix TypeScript errors by accessing fighter stats safely
  const getStat = (fighter: Fighter, key: string): number => {
    if (key === 'movement') return fighter.movement || 0;
    if (key === 'weapon_skill') return fighter.weapon_skill || 0;
    if (key === 'ballistic_skill') return fighter.ballistic_skill || 0;
    if (key === 'strength') return fighter.strength || 0;
    if (key === 'toughness') return fighter.toughness || 0;
    if (key === 'wounds') return fighter.wounds || 0;
    if (key === 'initiative') return fighter.initiative || 0;
    if (key === 'attacks') return fighter.attacks || 0;
    if (key === 'leadership') return fighter.leadership || 0;
    if (key === 'cool') return fighter.cool || 0;
    if (key === 'willpower') return fighter.willpower || 0;
    if (key === 'intelligence') return fighter.intelligence || 0;
    return 0;
  };

  // Check if there are any advancement effects to display
  const hasAdvancements = fighter.effects?.advancements?.some(adv => 
    typeof adv.type_specific_data === 'object' && 
    Object.keys(adv.type_specific_data || {}).some(key => key.endsWith('_modifier'))
  );

  return (
    <div className="overflow-x-auto">
      <h3 className="text-sm font-medium mb-2">Characteristics</h3>
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="px-1 py-1 border text-xs bg-gray-100">Type</th>
            {stats.map(stat => (
              <th key={stat.key} className="px-1 py-1 border text-center text-xs bg-gray-100">{stat.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Base Stats Row */}
          <tr className="bg-gray-50">
            <td className="px-1 py-1 border font-medium text-xs">Base</td>
            {stats.map(stat => (
              <td key={stat.key} className="px-1 py-1 border text-center text-xs">
                {stat.key === 'movement' ? `${getStat(fighter, stat.key)}"` : 
                 stat.key === 'wounds' || stat.key === 'attacks' ? 
                 getStat(fighter, stat.key) : 
                 `${getStat(fighter, stat.key)}+`}
              </td>
            ))}
          </tr>
          
          {/* Injuries Row */}
          <tr className="bg-red-50">
            <td className="px-1 py-1 border font-medium text-xs">Injuries</td>
            {stats.map(stat => {
              const value = injuryEffects[stat.key] || 0;
              const modifiers = injuryModifiers[stat.key] || [];
              
              return (
                <td 
                  key={stat.key} 
                  className="px-1 py-1 border text-center text-xs relative group cursor-help"
                >
                  {value === 0 ? '-' : value > 0 ? `+${value}` : value}
                  
                  {modifiers.length > 0 && (
                    <div className="hidden group-hover:block absolute z-10 bg-white shadow-lg p-2 rounded text-xs w-40 left-0 top-full mt-1">
                      {modifiers.map((mod, idx) => (
                        <div key={idx} className="flex justify-between text-left mb-1">
                          <span className="truncate mr-1">{mod.name}:</span>
                          <span className="text-right font-medium">{mod.value > 0 ? `+${mod.value}` : mod.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </td>
              );
            })}
          </tr>
          
          {/* Advancements Row */}
          <tr className="bg-green-50">
            <td className="px-1 py-1 border font-medium text-xs">Adv.</td>
            {stats.map(stat => {
              const value = advancementEffects[stat.key] || 0;
              const modifiers = advancementModifiers[stat.key] || [];
              
              return (
                <td 
                  key={stat.key} 
                  className="px-1 py-1 border text-center text-xs relative group cursor-help"
                >
                  {value === 0 ? '-' : value > 0 ? `+${value}` : value}
                  
                  {modifiers.length > 0 && (
                    <div className="hidden group-hover:block absolute z-10 bg-white shadow-lg p-2 rounded text-xs w-40 left-0 top-full mt-1">
                      {modifiers.map((mod, idx) => (
                        <div key={idx} className="flex justify-between text-left mb-1">
                          <span className="truncate mr-1">{mod.name}:</span>
                          <span className="text-right font-medium">{mod.value > 0 ? `+${mod.value}` : mod.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </td>
              );
            })}
          </tr>
          
          {/* User Input Row */}
          <tr className="bg-blue-50">
            <td className="px-1 py-1 border font-medium text-xs">User</td>
            {stats.map(stat => (
              <td key={stat.key} className="px-1 py-1 border text-center text-xs">-</td>
            ))}
          </tr>
          
          {/* Total Row */}
          <tr className="bg-gray-100 font-bold">
            <td className="px-1 py-1 border text-xs">Total</td>
            {stats.map(stat => {
              const baseValue = getStat(fighter, stat.key);
              const injuryValue = injuryEffects[stat.key] || 0;
              const advancementValue = advancementEffects[stat.key] || 0;
              const total = baseValue + injuryValue + advancementValue;
              
              return (
                <td key={stat.key} className="px-1 py-1 border text-center text-xs">
                  {stat.key === 'movement' ? `${total}"` :
                   stat.key === 'wounds' || stat.key === 'attacks' ? 
                   total : 
                   `${total}+`}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
      
      {/* Add a small summary section for advancements if there are any */}
      {hasAdvancements && (
        <div className="mt-2 text-xs text-green-700">
          <p className="font-medium">Advancements:</p>
          <ul className="list-disc pl-5">
            {fighter.effects?.advancements?.map((adv, idx) => (
              <li key={idx}>{adv.effect_type}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface EditFighterModalProps {
  fighter: Fighter;
  isOpen: boolean;
  initialValues: {
    name: string;
    label: string;
    kills: number;
    costAdjustment: string;
  };
  onClose: () => void;
  onSubmit: (values: {
    name: string;
    label: string;
    kills: number;
    costAdjustment: string;
  }) => Promise<boolean>;
}

export function EditFighterModal({
  fighter,
  isOpen,
  initialValues,
  onClose,
  onSubmit
}: EditFighterModalProps) {
  // Local state for form values
  const [formValues, setFormValues] = useState({
    name: initialValues.name,
    label: initialValues.label,
    kills: initialValues.kills,
    costAdjustment: initialValues.costAdjustment
  });

  const handleChange = (field: string, value: string | number) => {
    setFormValues(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Don't render if modal isn't open
  if (!isOpen) return null;

  return (
    <Modal
      title="Edit Fighter"
      content={
        <div className="space-y-4 max-w-3xl mx-auto">
          <div className="space-y-2">
            <p className="text-sm font-medium">Fighter name</p>
            <Input
              type="text"
              value={formValues.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full"
              placeholder="Fighter name"
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Label (max 5 characters)</p>
            <Input
              type="text"
              value={formValues.label}
              onChange={(e) => {
                const value = e.target.value.slice(0, 5);
                handleChange('label', value);
              }}
              className="w-full"
              placeholder="Label (5 chars max)"
              maxLength={5}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Cost Adjustment</p>
              <Input
                type="tel"
                inputMode="url"
                pattern="-?[0-9]*"
                value={formValues.costAdjustment}
                onKeyDown={(e) => {
                  if (![8, 9, 13, 27, 46, 189, 109].includes(e.keyCode) && 
                      !/^[0-9]$/.test(e.key) && 
                      e.key !== '-') {
                    e.preventDefault();
                  }
                }}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const value = e.target.value;
                  if (value === '' || value === '-' || /^-?\d*$/.test(value)) {
                    handleChange('costAdjustment', value);
                  }
                }}
                className="w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="Cost adjustment"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Kills</p>
              <Input
                type="number"
                min="0"
                value={formValues.kills}
                onChange={(e) => handleChange('kills', parseInt(e.target.value) || 0)}
                className="w-full"
                placeholder="Number of kills"
              />
            </div>
          </div>
          
          {/* Stats table appears below the form fields */}
          <div className="mt-6">
            <FighterCharacteristicTable fighter={fighter} />
          </div>
        </div>
      }
      onClose={() => {
        // Reset form values back to initial values
        setFormValues({
          name: initialValues.name,
          label: initialValues.label,
          kills: initialValues.kills,
          costAdjustment: initialValues.costAdjustment
        });
        onClose();
      }}
      onConfirm={async () => {
        return await onSubmit(formValues);
      }}
    />
  );
} 