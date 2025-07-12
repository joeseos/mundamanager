'use client';

import { useState, useEffect } from 'react';
import Modal from '../modal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ImInfo } from 'react-icons/im';

type ChemType = 'stimm' | 'gaseous' | 'toxic';

interface ChemEffect {
  name: string;
  cost: number;
}

const STIMM_EFFECTS: ChemEffect[] = [
  { name: 'Bad Blood', cost: 10 },
  { name: 'Blood Rush', cost: 15 },
  { name: 'Brain Lock', cost: 15 },
  { name: 'Dreamland', cost: 10 },
  { name: 'Hyper', cost: 20 },
  { name: 'Ice Cold', cost: 15 },
  { name: 'Jolt', cost: 30 },
  { name: 'Night Night', cost: 25 },
  { name: "Predator's Kiss", cost: 45 },
  { name: 'Puke', cost: 15 },
  { name: 'Wide-eye', cost: 10 },
];

const GASEOUS_EFFECTS: ChemEffect[] = [
  { name: 'Acidic', cost: 20 },
  { name: 'Bane', cost: 15 },
  { name: 'Blackout', cost: 30 },
  { name: 'Blinding', cost: 10 },
  { name: 'Expansive', cost: 20 },
  { name: 'Hallucinogen', cost: 15 },
  { name: 'Leaden', cost: 30 },
  { name: "Liftin'", cost: 25 },
  { name: 'Pathogenic', cost: 15 },
  { name: 'Pyrophoric', cost: 20 },
];

const TOXIC_EFFECTS: ChemEffect[] = [
  { name: 'Bleeding', cost: 10 },
  { name: 'Blood Boil', cost: 30 },
  { name: 'Concentrated', cost: 15 },
  { name: 'Debilitating', cost: 10 },
  { name: 'Decaying', cost: 5 },
  { name: 'Exploding', cost: 20 },
  { name: 'Maddening', cost: 5 },
  { name: 'Maiming', cost: 10 },
  { name: 'Panicking', cost: 10 },
  { name: 'Paralysing', cost: 5 },
  { name: 'Silencing', cost: 5 },
  { name: 'Skin Fire', cost: 25 },
];

const getEffectsForType = (type: ChemType): ChemEffect[] => {
  switch (type) {
    case 'stimm':
      return STIMM_EFFECTS;
    case 'gaseous':
      return GASEOUS_EFFECTS;
    case 'toxic':
      return TOXIC_EFFECTS;
    default:
      return [];
  }
};

const getTypeDisplayName = (type: ChemType): string => {
  switch (type) {
    case 'stimm':
      return 'Stimm';
    case 'gaseous':
      return 'Gaseous Ammo';
    case 'toxic':
      return 'Toxic Ammo';
    default:
      return '';
  }
};

interface ChemAlchemyCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  gangCredits: number;
  onCreateChem?: (chem: {
    type: ChemType;
    effects: ChemEffect[];
    totalCost: number;
    name: string;
    useBaseCostForRating: boolean;
    baseCost: number;
  }) => void | Promise<void>;
}

export default function ChemAlchemyCreator({
  isOpen,
  onClose,
  gangCredits,
  onCreateChem,
}: ChemAlchemyCreatorProps) {
  const [selectedType, setSelectedType] = useState<ChemType>('stimm');
  const [selectedEffects, setSelectedEffects] = useState<ChemEffect[]>([]);
  const [chemName, setChemName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [manualCost, setManualCost] = useState('');
  const [useBaseCostForRating, setUseBaseCostForRating] = useState(true);
  const [creditError, setCreditError] = useState<string | null>(null);

  const availableEffects = getEffectsForType(selectedType);
  const totalCost = selectedEffects.reduce(
    (sum, effect) => sum + effect.cost,
    0
  );

  // Update manual cost when effects change
  useEffect(() => {
    setManualCost(String(totalCost));
  }, [totalCost]);

  const handleTypeChange = (type: ChemType) => {
    setSelectedType(type);
    setSelectedEffects([]);
  };

  const handleEffectToggle = (effect: ChemEffect) => {
    setSelectedEffects((prev) => {
      const isSelected = prev.some((e) => e.name === effect.name);
      if (isSelected) {
        return prev.filter((e) => e.name !== effect.name);
      } else if (prev.length < 3) {
        return [...prev, effect];
      }
      return prev;
    });
  };

  const handleCreateChem = async () => {
    if (selectedEffects.length === 0 || !chemName.trim() || isCreating) {
      return false;
    }

    const parsedCost = Number(manualCost);

    if (isNaN(parsedCost)) {
      setCreditError('Incorrect input, please update the cost value');
      return false;
    } else if (parsedCost > gangCredits) {
      setCreditError(`Not enough credits. Gang Credits: ${gangCredits}`);
      return false;
    }

    setCreditError(null);
    setIsCreating(true);
    try {
      await onCreateChem?.({
        type: selectedType,
        effects: selectedEffects,
        totalCost: parsedCost,
        name: chemName.trim(),
        useBaseCostForRating,
        baseCost: totalCost,
      });

      // Reset form
      setSelectedEffects([]);
      setChemName('');
      setManualCost('');
      setUseBaseCostForRating(true);
      setCreditError(null);
      return true;
    } catch (error) {
      console.error('Error in handleCreateChem:', error);
      return false;
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    setSelectedEffects([]);
    setChemName('');
    setManualCost('');
    setUseBaseCostForRating(true);
    setCreditError(null);
    setIsCreating(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Modal
      title="Create Chem-alchemy Elixir"
      headerContent={
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Gang Credits</span>
          <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm">
            {gangCredits}
          </span>
        </div>
      }
      onClose={handleClose}
      onConfirm={handleCreateChem}
      confirmText={isCreating ? 'Creating...' : 'Create Elixir'}
      confirmDisabled={
        selectedEffects.length === 0 ||
        !chemName.trim() ||
        isCreating ||
        !manualCost.trim() ||
        isNaN(Number(manualCost)) ||
        Number(manualCost) > gangCredits
      }
    >
      <div className="space-y-5">
        {/* Chem Name Input */}
        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-2">
            Elixir Name
          </label>
          <input
            type="text"
            value={chemName}
            onChange={(e) => setChemName(e.target.value)}
            placeholder="Enter a name for your elixir..."
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </div>

        {/* Chem Type Selection */}
        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-3">
            Chem Type
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['stimm', 'gaseous', 'toxic'] as ChemType[]).map((type) => (
              <Button
                key={type}
                onClick={() => handleTypeChange(type)}
                variant={selectedType === type ? 'default' : 'outline'}
                size="sm"
                className="font-medium"
              >
                {getTypeDisplayName(type)}
              </Button>
            ))}
          </div>
        </div>

        {/* Cost Input */}
        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-2">
            Cost (credits)
          </label>
          <input
            type="number"
            inputMode="numeric"
            pattern="-?[0-9]*"
            value={manualCost}
            onChange={(e) => {
              const val = e.target.value;
              if (/^-?\d*$/.test(val)) {
                setManualCost(val);
                const parsed = Number(val);
                if (!Number.isNaN(parsed) && parsed <= gangCredits) {
                  setCreditError(null);
                }
              }
            }}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            min="0"
          />
          <p className="text-sm text-gray-500 mt-1">
            Base cost: {totalCost} credits
          </p>
          {creditError && (
            <p className="text-red-500 text-sm mt-1">{creditError}</p>
          )}
        </div>

        {/* Use Base Cost Checkbox */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="use-base-cost-for-rating"
            checked={useBaseCostForRating}
            onCheckedChange={(checked) =>
              setUseBaseCostForRating(checked as boolean)
            }
          />
          <label
            htmlFor="use-base-cost-for-rating"
            className="text-sm font-medium text-gray-700 cursor-pointer"
          >
            Use Listed Cost for Rating
          </label>
          <div className="relative group">
            <ImInfo />
            <div className="absolute bottom-full mb-2 hidden group-hover:block bg-black text-white text-xs p-2 rounded w-72 -left-36 z-50">
              When enabled, the elixir&apos;s rating is calculated using its
              listed cost, even if you paid a different amount. Disable this if
              you want the rating to reflect the price actually paid.
            </div>
          </div>
        </div>

        {/* Effects Selection */}
        <div>
          <div className="mb-3">
            <label className="block text-sm font-semibold text-gray-800">
              Available Effects ({selectedEffects.length}/3)
            </label>
          </div>
          <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-lg">
            {availableEffects.map((effect, index) => {
              const isSelected = selectedEffects.some(
                (e) => e.name === effect.name
              );
              const canSelect = selectedEffects.length < 3 || isSelected;

              return (
                <div
                  key={effect.name}
                  className={`flex items-center justify-between p-3 ${
                    index !== availableEffects.length - 1
                      ? 'border-b border-gray-100'
                      : ''
                  } ${!canSelect ? 'opacity-40' : 'hover:bg-gray-50'} transition-colors`}
                >
                  <div className="flex items-center space-x-3 flex-1">
                    <Checkbox
                      id={`effect-${effect.name}`}
                      checked={isSelected}
                      onCheckedChange={() => handleEffectToggle(effect)}
                      disabled={!canSelect}
                    />
                    <label
                      htmlFor={`effect-${effect.name}`}
                      className="text-sm font-medium text-gray-900 cursor-pointer"
                    >
                      {effect.name}
                    </label>
                  </div>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center bg-black text-white">
                    <span className="text-[10px] font-medium">
                      {effect.cost}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
