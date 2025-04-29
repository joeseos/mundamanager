'use client';

import React, { useState, useEffect } from 'react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import Modal from '@/components/modal';
import { FighterType } from '@/types/fighter-type';
import { useToast } from "@/components/ui/use-toast";
import { fighterClassRank } from "@/utils/fighterClassRank";
import { createClient } from '@/utils/supabase/client';

interface AddFighterProps {
  showModal: boolean;
  setShowModal: (show: boolean) => void;
  fighterTypes: FighterType[];
  gangId: string;
  initialCredits: number;
  onFighterAdded: (newFighter: any, cost: number) => void;
}

export default function AddFighter({
  showModal,
  setShowModal,
  fighterTypes,
  gangId,
  initialCredits,
  onFighterAdded,
}: AddFighterProps) {
  const { toast } = useToast();
  const [selectedFighterTypeId, setSelectedFighterTypeId] = useState('');
  const [fighterName, setFighterName] = useState('');
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedSubTypeId, setSelectedSubTypeId] = useState('');
  const [availableSubTypes, setAvailableSubTypes] = useState<Array<{id: string, sub_type_name: string}>>([]);
  const [fighterCost, setFighterCost] = useState('');
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([]);
  
  // Automatically select Default or Vatborn sub-type if available
  useEffect(() => {
    if (availableSubTypes.length > 0 && !selectedSubTypeId) {
      const defaultSubType = availableSubTypes.find(
        (sub) =>
          sub.sub_type_name.toLowerCase() === "default" ||
          sub.sub_type_name.toLowerCase() === "vatborn"
      );
      if (defaultSubType) {
        setSelectedSubTypeId(defaultSubType.id);
      }
    }
  }, [availableSubTypes, selectedSubTypeId]);

  const handleFighterTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const typeId = e.target.value;
    setSelectedFighterTypeId(typeId);
    setSelectedSubTypeId(''); // Reset sub-type selection
    setSelectedEquipmentIds([]); // Reset equipment selections when type changes
    
    if (typeId) {
      // Get all fighters with this fighter_type name to check for sub-types
      const selectedType = fighterTypes.find(t => t.id === typeId);
      const fighterTypeGroup = fighterTypes.filter(t => 
        t.fighter_type === selectedType?.fighter_type
      );
      
      // If we have multiple entries with the same fighter_type, they have sub-types
      if (fighterTypeGroup.length > 1) {
        const subTypes = fighterTypeGroup.map(ft => ({
          id: ft.id,
          sub_type_name: ft.sub_type?.sub_type_name || 'Default',
          cost: ft.total_cost
        }));
        
        setAvailableSubTypes(subTypes);
        
        // Set cost to the lowest cost option initially
        const lowestCostType = fighterTypeGroup.reduce(
          (lowest, current) => 
            current.total_cost < lowest.total_cost ? current : lowest, 
          fighterTypeGroup[0]
        );
        
        setFighterCost(lowestCostType.total_cost.toString() || '');
      } else {
        // No sub-types, just set the cost directly
        setFighterCost(selectedType?.total_cost.toString() || '');
        setAvailableSubTypes([]);
      }
    } else {
      setFighterCost('');
      setAvailableSubTypes([]);
    }
  };

  const handleSubTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const subTypeId = e.target.value;
    setSelectedSubTypeId(subTypeId);
    setSelectedEquipmentIds([]); // Reset equipment selections when sub-type changes
    
    if (subTypeId) {
      // Set the fighter type ID to match the sub-type's ID
      setSelectedFighterTypeId(subTypeId);
      
      const selectedType = fighterTypes.find(t => t.id === subTypeId);
      if (selectedType) {
        setFighterCost(selectedType.total_cost.toString() || '');
      }
    }
  };

  const handleAddFighter = async () => {
    if (!selectedFighterTypeId || !fighterName || !fighterCost) {
      setFetchError('Please fill in all fields');
      return false;
    }

    try {
      // Get the current authenticated user's ID
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setFetchError('You must be logged in to add a fighter');
        return false;
      }

      const response = await fetch(
        'https://iojoritxhpijprgkjfre.supabase.co/rest/v1/rpc/add_fighter_to_gang',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
          },
          body: JSON.stringify({
            p_gang_id: gangId,
            p_fighter_type_id: selectedFighterTypeId,
            p_fighter_name: fighterName,
            p_cost: parseInt(fighterCost),
            p_selected_equipment_ids: selectedEquipmentIds,
            p_user_id: user.id  // Use the current user's ID from auth
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.message?.includes('Not enough credits')) {
          throw new Error('Not enough credits to add this fighter');
        }
        throw new Error('Failed to add fighter');
      }

      const data = await response.json();

      if (!data?.fighter_id) {
        throw new Error('Failed to add fighter');
      }

      const actualCost = parseInt(fighterCost);

      const newFighter = {
        id: data.fighter_id,
        fighter_name: fighterName,
        fighter_type_id: selectedFighterTypeId,
        fighter_type: data.fighter_type,
        fighter_class: data.fighter_class,
        fighter_sub_type: data.fighter_sub_type,
        credits: actualCost,
        movement: data.stats.movement,
        weapon_skill: data.stats.weapon_skill,
        ballistic_skill: data.stats.ballistic_skill,
        strength: data.stats.strength,
        toughness: data.stats.toughness,
        wounds: data.stats.wounds,
        initiative: data.stats.initiative,
        attacks: data.stats.attacks,
        leadership: data.stats.leadership,
        cool: data.stats.cool,
        willpower: data.stats.willpower,
        intelligence: data.stats.intelligence,
        xp: data.stats.xp,
        kills: 0,
        weapons: data.equipment
          .filter((item: any) => item.equipment_type === 'weapon')
          .map((item: any) => ({
            weapon_name: item.equipment_name,
            weapon_id: item.equipment_id,
            cost: item.cost,
            fighter_weapon_id: item.fighter_equipment_id,
            weapon_profiles: item.weapon_profiles || []
          })),
        wargear: data.equipment
          .filter((item: any) => item.equipment_type === 'wargear')
          .map((item: any) => ({
            wargear_name: item.equipment_name,
            wargear_id: item.equipment_id,
            cost: item.cost,
            fighter_weapon_id: item.fighter_equipment_id
          })),
        special_rules: data.special_rules || [],
        skills: data.skills ? data.skills.reduce((acc: any, skill: any) => {
          acc[skill.skill_name] = {
            id: skill.skill_id,
            credits_increase: 0,
            xp_cost: 0,
            is_advance: false,
            acquired_at: new Date().toISOString(),
            fighter_injury_id: null
          };
          return acc;
        }, {}) : {},
        advancements: {
          characteristics: {},
          skills: {}
        },
        injuries: [],
        free_skill: data.free_skill || false,
        effects: {
          injuries: [],
          advancements: [],
          bionics: [],
          cybernetics: [],
          user: []
        },
        base_stats: {
          movement: data.stats.movement,
          weapon_skill: data.stats.weapon_skill,
          ballistic_skill: data.stats.ballistic_skill,
          strength: data.stats.strength,
          toughness: data.stats.toughness,
          wounds: data.stats.wounds,
          initiative: data.stats.initiative,
          attacks: data.stats.attacks,
          leadership: data.stats.leadership,
          cool: data.stats.cool,
          willpower: data.stats.willpower,
          intelligence: data.stats.intelligence
        },
        current_stats: {
          movement: data.stats.movement,
          weapon_skill: data.stats.weapon_skill,
          ballistic_skill: data.stats.ballistic_skill,
          strength: data.stats.strength,
          toughness: data.stats.toughness,
          wounds: data.stats.wounds,
          initiative: data.stats.initiative,
          attacks: data.stats.attacks,
          leadership: data.stats.leadership,
          cool: data.stats.cool,
          willpower: data.stats.willpower,
          intelligence: data.stats.intelligence
        }
      };

      onFighterAdded(newFighter, actualCost);
      closeModal();

      toast({
        description: `${fighterName} added successfully`,
        variant: "default"
      });

      return true;
    } catch (error) {
      console.error('Error adding fighter:', error);
      setFetchError(error instanceof Error ? error.message : 'Failed to add fighter');
      return false;
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setFighterName('');
    setSelectedFighterTypeId('');
    setSelectedSubTypeId('');
    setAvailableSubTypes([]);
    setFighterCost('');
    setSelectedEquipmentIds([]);
    setFetchError(null);
  };

  const addFighterModalContent = (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Fighter Name
        </label>
        <Input
          type="text"
          placeholder="Fighter name"
          value={fighterName}
          onChange={(e) => setFighterName(e.target.value)}
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Fighter Type
        </label>
        <select
          value={selectedFighterTypeId}
          onChange={handleFighterTypeChange}
          className="w-full p-2 border rounded"
        >
          <option value="">Select fighter type</option>
          {/* Modified dropdown options to properly handle sub-types */}
          {Array.from(new Set(fighterTypes.map(type => type.fighter_type))).map(uniqueType => {
            const matchingFighters = fighterTypes.filter(ft => ft.fighter_type === uniqueType);

            // Find the selected sub-type if it matches this fighter type
            const selectedSubType = selectedSubTypeId
              ? matchingFighters.find(t => t.id === selectedSubTypeId)
              : null;

            // Find the cheapest fighter for this type
            const lowestCostFighter = matchingFighters.reduce((lowest, current) =>
              current.total_cost < lowest.total_cost ? current : lowest
            );

            // Show the selected sub-type if available; otherwise, fall back to the cheapest option for this fighter type
            if (selectedSubType) {
              return (
                <option key={selectedSubType.id} value={selectedSubType.id}>
                  {uniqueType} ({selectedSubType.fighter_class}) - {lowestCostFighter.total_cost} credits
                </option>
              );
            } else {
              return (
                <option key={lowestCostFighter.id} value={lowestCostFighter.id}>
                  {uniqueType} ({lowestCostFighter.fighter_class}) - {lowestCostFighter.total_cost} credits
                </option>
              );
            }
          })}
        </select>
      </div>

      {/* Conditionally show sub-type dropdown if there are available sub-types */}
      {availableSubTypes.length > 0 && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Fighter Sub-type
          </label>
          <select
            value={selectedSubTypeId}
            onChange={handleSubTypeChange}
            className="w-full p-2 border rounded"
          >
            <option value="">Select fighter sub-type</option>
            {[...availableSubTypes]
              .sort((a, b) => {
                const aName = a.sub_type_name.toLowerCase();
                const bName = b.sub_type_name.toLowerCase();

                // Always keep "Default" or "Vatborn" first
                const isAFirst = aName === 'default' || aName === 'vatborn';
                const isBFirst = bName === 'default' || bName === 'vatborn';
                if (isAFirst && !isBFirst) return -1;
                if (!isAFirst && isBFirst) return 1;

                // Otherwise sort by cost, then name
                const aCost = fighterTypes.find(ft => ft.id === a.id)?.total_cost ?? 0;
                const bCost = fighterTypes.find(ft => ft.id === b.id)?.total_cost ?? 0;
                if (aCost !== bCost) return aCost - bCost;

                return aName.localeCompare(bName);
              })
              .map((subType) => {
                const subTypeCost = fighterTypes.find(ft => ft.id === subType.id)?.total_cost ?? 0;
                const lowestSubTypeCost = Math.min(
                  ...availableSubTypes.map(sub =>
                    fighterTypes.find(ft => ft.id === sub.id)?.total_cost ?? Infinity
                  )
                );
                const diff = subTypeCost - lowestSubTypeCost;
                const costLabel = diff === 0 ? "(+0 credits)" : (diff > 0 ? `(+${diff} credits)` : `(${diff} credits)`);

                return (
                  <option key={subType.id} value={subType.id}>
                    {subType.sub_type_name} {costLabel}
                  </option>
                );
              })}
          </select>
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Cost (credits)
        </label>
        <Input
          type="number"
          value={fighterCost}
          onChange={(e) => setFighterCost(e.target.value)}
          className="w-full"
          min={0}
        />
        {selectedFighterTypeId && (
          <p className="text-sm text-gray-500">
            Base cost: {fighterTypes.find(t => t.id === selectedFighterTypeId)?.total_cost} credits
          </p>
        )}
      </div>

      {/* Equipment selection */}
      {selectedFighterTypeId && (() => {
        // Get the selected fighter type
        const selectedType = fighterTypes.find(t => t.id === selectedFighterTypeId);
        
        // Check if it has equipment selection options
        if (selectedType?.equipment_selection?.weapons?.options && 
            selectedType.equipment_selection.weapons.options.length > 0) {
          const weapons = selectedType.equipment_selection.weapons;
          const isSingle = weapons.select_type === 'single';
          const options = weapons.options || [];
          
          // Group options by category if available
          const categories: Record<string, any[]> = {};
          
          options.forEach(option => {
            const category = (option as any).equipment_category || 'Spyrer Equipment';
            if (!categories[category]) {
              categories[category] = [];
            }
            categories[category].push(option);
          });
          
          return (
            <div className="mt-6">
              <h3 className="font-medium mb-3 text-sm">Select Equipment</h3>
              
              {Object.entries(categories).map(([category, categoryOptions]) => (
                <div key={category}>
                  <p className="text-gray-600 text-sm mb-2">{category}</p>
                  {categoryOptions.map((option) => (
                    <div key={option.id} className="mb-2 flex items-center">
                      <input
                        type={isSingle ? "radio" : "checkbox"}
                        id={`equip-${option.id}`}
                        name="equipment-selection"
                        className="mr-2"
                        checked={selectedEquipmentIds.includes(option.id)}
                        onChange={(e) => {
                          const selectedType = fighterTypes.find(t => t.id === selectedFighterTypeId);
                          const baseCost = selectedType?.total_cost || 0;
                          const optionCost = option.cost || 0;
                          
                          if (e.target.checked) {
                            if (isSingle) {
                              // For single selection, remove any previous selection first
                              const prevSelectedId = selectedEquipmentIds[0];
                              let prevSelectedCost = 0;
                              
                              // Find cost of previously selected item if any
                              if (prevSelectedId) {
                                const prevOption = weapons.options?.find((o: any) => o.id === prevSelectedId);
                                prevSelectedCost = prevOption?.cost || 0;
                              }
                              
                              // Update IDs
                              setSelectedEquipmentIds([option.id]);
                              
                              // Update cost: base cost - previous option cost + new option cost
                              setFighterCost(String(baseCost - prevSelectedCost + optionCost));
                            } else {
                              // For multiple selection, add to existing selections
                              setSelectedEquipmentIds(prev => [...prev, option.id]);
                              setFighterCost(String(parseInt(fighterCost || '0') + optionCost));
                            }
                          } else {
                            // Remove this option
                            setSelectedEquipmentIds(prev => prev.filter(id => id !== option.id));
                            setFighterCost(String(parseInt(fighterCost || '0') - optionCost));
                          }
                        }}
                      />
                      <label htmlFor={`equip-${option.id}`} className="text-sm">
                        {option.equipment_name} 
                        {option.cost > 0 && ` (+${option.cost} credits)`}
                      </label>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        }
        
        return null;
      })()}

      {fetchError && <p className="text-red-500">{fetchError}</p>}
    </div>
  );

  return (
    <Modal
      title="Add Fighter"
      headerContent={
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Gang Credits</span>
          <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm">
            {initialCredits}
          </span>
        </div>
      }
      content={addFighterModalContent}
      onClose={closeModal}
      onConfirm={handleAddFighter}
      confirmText="Add Fighter"
      confirmDisabled={!selectedFighterTypeId || !fighterName || !fighterCost || 
        (availableSubTypes.length > 0 && !selectedSubTypeId)}
    />
  );
} 