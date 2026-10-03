'use client';

import React from 'react';
import { EquipmentOption, DefaultEquipment } from '@/types/fighter-type';
import { Checkbox } from '@/components/ui/checkbox';
import { compareEquipmentCategories } from '@/utils/getEquipmentCategoryRank';
import {
  SelectedEquipmentItem,
  normalizeEquipmentSelection,
  inferCategoryFromEquipmentName,
} from '@/utils/equipment-selection';

interface EquipmentSelectionProps {
  equipmentSelection: any;
  selectedEquipmentIds: string[];
  setSelectedEquipmentIds: React.Dispatch<React.SetStateAction<string[]>>;
  selectedEquipment: SelectedEquipmentItem[];
  setSelectedEquipment: React.Dispatch<React.SetStateAction<SelectedEquipmentItem[]>>;
  setFighterCost: React.Dispatch<React.SetStateAction<string>>;
  editionSlug?: string | null;
}

/**
 * Shared starting-equipment picker for the fighter-add flows. Renders four
 * selection patterns driven by each category's `select_type` / `replacement_mode`:
 *  - optional + flexible → checkboxes with per-slot accounting
 *  - optional + strict   → radios that replace all slots
 *  - single / optional_single → radios (with a "Keep Default" option)
 *  - multiple → checkboxes
 */
export function EquipmentSelection({
  equipmentSelection,
  selectedEquipmentIds,
  setSelectedEquipmentIds,
  selectedEquipment,
  setSelectedEquipment,
  setFighterCost,
  editionSlug,
}: EquipmentSelectionProps) {
  if (!equipmentSelection) return null;

  const normalizedSelection = normalizeEquipmentSelection(equipmentSelection);
  const allCategories = Object.entries(normalizedSelection);
  if (allCategories.length === 0) return null;

  return (
    <div className="space-y-4">
      {allCategories.map(([categoryId, categoryData]) => {
        if (!categoryData) return null;

        const categoryName = categoryData.name || 'Equipment';
        const selectType = categoryData.select_type || 'optional';
        const isOptional = selectType === 'optional';
        const isOptionalSingle = selectType === 'optional_single';
        const isSingle = selectType === 'single';

        // Group equipment options by category
        const categorizedOptions: Record<string, EquipmentOption[]> = {};

        if (categoryData.options && Array.isArray(categoryData.options)) {
          categoryData.options.forEach((option: EquipmentOption) => {
            const optionAny = option as any;
            const equipCategoryName = optionAny.equipment_category || inferCategoryFromEquipmentName(optionAny.equipment_name || categoryName);
            const categoryKey = equipCategoryName.toLowerCase();

            if (!categorizedOptions[categoryKey]) {
              categorizedOptions[categoryKey] = [];
            }

            categorizedOptions[categoryKey].push({
              ...option,
              displayCategory: equipCategoryName,
            } as any);
          });
        }

        const sortedCategories = Object.keys(categorizedOptions).sort((a, b) =>
          compareEquipmentCategories(a, b, editionSlug)
        );

        // Don't render anything if no options
        if ((!categoryData.default || categoryData.default.length === 0) &&
            (!categoryData.options || categoryData.options.length === 0)) {
          return null;
        }

        // Compute slot counts for optional categories
        const totalSlots = isOptional && categoryData.default
          ? categoryData.default.reduce((sum, d) => sum + (d.quantity || 1), 0)
          : 0;
        const replacementMode = (categoryData.replacement_mode || 'flexible') as 'flexible' | 'strict';

        const usedSlots = isOptional
          ? (categoryData.options || []).filter(o =>
              selectedEquipmentIds.includes(`${categoryId}-${o.id}`)
            ).length
          : 0;
        const remainingSlots = totalSlots - usedSlots;

        const strictSelectedId = isOptional && replacementMode === 'strict'
          ? selectedEquipmentIds.find(id =>
              (categoryData.options || []).some((o: any) => `${categoryId}-${o.id}` === id)
            )
          : undefined;

        // Categories can offer the same equipment ids (e.g. two default weapons that
        // each take any of the same replacements), so only drop items this category added.
        const withoutCategoryItems = (items: SelectedEquipmentItem[]) =>
          items.filter(item => item.selection_key !== categoryId);
        const categoryItem = (equipment: any, cost: number, quantity: number): SelectedEquipmentItem => ({
          equipment_id: equipment.id,
          cost,
          quantity,
          is_editable: equipment.is_editable || false,
          selection_key: categoryId,
        });
        const withCategoryDefaults = (items: SelectedEquipmentItem[]) => [
          ...withoutCategoryItems(items),
          ...(categoryData.default || []).map((d: any) => categoryItem(d, 0, d.quantity || 1)),
        ];

        return (
          <div key={categoryId} className="space-y-3">
            {/* Default equipment display */}
            {categoryData.default && categoryData.default.length > 0 && (
              <div className="space-y-1">
                <label className="block text-sm font-medium text-muted-foreground">
                  Default {categoryName}
                </label>
                <div className="space-y-1">
                  {categoryData.default.map((item: DefaultEquipment, index: number) => {
                    const defaultItem = item as any;
                    const equipmentName = defaultItem.equipment_name || 'Equipment';

                    if (isOptional && totalSlots > 0) {
                      let displayQty: number;
                      if (replacementMode === 'strict') {
                        displayQty = strictSelectedId ? 0 : item.quantity;
                      } else {
                        const slotsBefore = categoryData.default!
                          .slice(0, index)
                          .reduce((s, d) => s + (d.quantity || 1), 0);
                        const slotsConsumedBefore = Math.min(usedSlots, slotsBefore);
                        const slotsLeft = usedSlots - slotsConsumedBefore;
                        displayQty = Math.max(0, (item.quantity || 1) - slotsLeft);
                      }
                      if (displayQty <= 0) return null;
                      return (
                        <div key={`${item.id}-${index}`} className="flex items-center gap-2">
                          <div className="bg-muted px-3 py-1 rounded-full text-sm">
                            {displayQty}x {equipmentName}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={`${item.id}-${index}`} className="flex items-center gap-2">
                        <div className="bg-muted px-3 py-1 rounded-full text-sm">
                          {item.quantity}x {equipmentName}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {categoryData.options && categoryData.options.length > 0 && (
              <div className="space-y-1">
                <label className="block text-sm font-medium text-muted-foreground">
                  {isOptional
                    ? (replacementMode === 'strict'
                      ? `Optional ${categoryName} (replace all ${totalSlots})`
                      : `Optional ${categoryName} (replace up to ${totalSlots})`)
                    : isOptionalSingle ? `Optional ${categoryName} (Choose one replacement)`
                    : isSingle ? `Select ${categoryName} (Choose one)`
                    : `Additional ${categoryName} (Select any)`}
                </label>

                <div className="space-y-1">
                  {/* Keep Default option for optional_single */}
                  {isOptionalSingle && (
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`equipment-selection-${categoryId}`}
                        id={`${categoryId}-keep-default`}
                        checked={!categoryData.options?.some((o: any) => selectedEquipmentIds.includes(`${categoryId}-${o.id}`))}
                        onChange={() => {
                          setSelectedEquipmentIds((prev) => {
                            const currentCategoryOptions = categoryData.options || [];
                            return prev.filter(id =>
                              !currentCategoryOptions.some((o: any) => `${categoryId}-${o.id}` === id)
                            );
                          });
                          setSelectedEquipment(withCategoryDefaults);
                          setFighterCost((prevCost) => {
                            const currentCategoryOptions = categoryData.options || [];
                            const prevSelectedUniqueId = selectedEquipmentIds.find(id =>
                              currentCategoryOptions.some((o: any) => `${categoryId}-${o.id}` === id)
                            );
                            const prevSelectedCost = prevSelectedUniqueId
                              ? currentCategoryOptions.find((o: any) => `${categoryId}-${o.id}` === prevSelectedUniqueId)?.cost || 0
                              : 0;
                            return String(parseInt(prevCost || '0') - prevSelectedCost);
                          });
                        }}
                      />
                      <label htmlFor={`${categoryId}-keep-default`} className="text-sm font-medium">
                        Keep Default {categoryData.default?.[0]?.equipment_name ? `(${categoryData.default[0].equipment_name})` : 'Equipment'}
                      </label>
                    </div>
                  )}

                  {/* Strict mode: Keep Default radio for optional categories */}
                  {isOptional && replacementMode === 'strict' && (
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`equipment-selection-${categoryId}`}
                        id={`${categoryId}-keep-default`}
                        checked={!strictSelectedId}
                        onChange={() => {
                          setSelectedEquipmentIds((prev) => {
                            const currentCategoryOptions = categoryData.options || [];
                            return prev.filter(id =>
                              !currentCategoryOptions.some((o: any) => `${categoryId}-${o.id}` === id)
                            );
                          });
                          setSelectedEquipment(withCategoryDefaults);
                          if (strictSelectedId) {
                            const prevOption = (categoryData.options || []).find((o: any) => `${categoryId}-${o.id}` === strictSelectedId);
                            if (prevOption) {
                              setFighterCost((prevCost) =>
                                String(parseInt(prevCost || '0') - (prevOption.cost || 0) * totalSlots)
                              );
                            }
                          }
                        }}
                      />
                      <label htmlFor={`${categoryId}-keep-default`} className="text-sm font-medium">
                        Keep Default
                      </label>
                    </div>
                  )}

                  {/* Render options */}
                  {sortedCategories.flatMap(category =>
                    categorizedOptions[category]
                  )
                  .sort((a, b) => {
                    const nameA = a.equipment_name || '';
                    const nameB = b.equipment_name || '';
                    return nameA.localeCompare(nameB);
                  })
                  .map((option) => {
                    const uniqueOptionId = `${categoryId}-${option.id}`;

                    // === OPTIONAL + FLEXIBLE MODE: checkboxes (each = 1 slot) ===
                    if (isOptional && replacementMode === 'flexible') {
                      const isChecked = selectedEquipmentIds.includes(uniqueOptionId);
                      const isDisabled = !isChecked && remainingSlots <= 0;

                      return (
                        <div key={uniqueOptionId} className="flex items-center gap-2">
                          <Checkbox
                            id={uniqueOptionId}
                            checked={isChecked}
                            disabled={isDisabled}
                            onCheckedChange={(checked) => {
                              const optionCost = option.cost || 0;
                              const adding = checked === true;

                              setSelectedEquipmentIds(prev => {
                                const newIds = adding
                                  ? [...prev, uniqueOptionId]
                                  : prev.filter(id => id !== uniqueOptionId);

                                setSelectedEquipment(prevEquip => {
                                  const currentCategoryOptions = categoryData.options || [];
                                  const filtered = withoutCategoryItems(prevEquip);

                                  currentCategoryOptions.forEach((o: any) => {
                                    if (newIds.includes(`${categoryId}-${o.id}`)) {
                                      filtered.push(categoryItem(o, o.cost || 0, 1));
                                    }
                                  });

                                  const newUsed = currentCategoryOptions.filter((o: any) =>
                                    newIds.includes(`${categoryId}-${o.id}`)
                                  ).length;
                                  const remainingDefaults = totalSlots - newUsed;
                                  if (remainingDefaults > 0 && categoryData.default && categoryData.default.length > 0) {
                                    const firstDefault = categoryData.default[0] as any;
                                    filtered.push(categoryItem(firstDefault, 0, remainingDefaults));
                                  }

                                  return filtered;
                                });

                                return newIds;
                              });

                              setFighterCost(prevCost =>
                                String(parseInt(prevCost || '0') + (adding ? optionCost : -optionCost))
                              );
                            }}
                          />
                          <label htmlFor={uniqueOptionId} className="text-sm">
                            {option.equipment_name || 'Loading...'}
                            {` ${option.cost >= 0 ? '+' : ''}${option.cost} credits`}
                          </label>
                        </div>
                      );
                    }

                    // === OPTIONAL + STRICT MODE: radio buttons ===
                    if (isOptional && replacementMode === 'strict') {
                      return (
                        <div key={uniqueOptionId} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`equipment-selection-${categoryId}`}
                            id={uniqueOptionId}
                            checked={strictSelectedId === uniqueOptionId}
                            onChange={() => {
                              const optionCost = option.cost || 0;

                              const prevOption = strictSelectedId
                                ? (categoryData.options || []).find((o: any) => `${categoryId}-${o.id}` === strictSelectedId)
                                : undefined;
                              const prevCostPerUnit = prevOption?.cost || 0;

                              setSelectedEquipmentIds((prev) => {
                                const currentCategoryOptions = categoryData.options || [];
                                const filtered = prev.filter(id =>
                                  !currentCategoryOptions.some((o: any) => `${categoryId}-${o.id}` === id)
                                );
                                return [...filtered, uniqueOptionId];
                              });

                              setSelectedEquipment((prev) => [...withoutCategoryItems(prev), categoryItem(option, optionCost, totalSlots)]);

                              setFighterCost((prevCost) =>
                                String(parseInt(prevCost || '0') - (prevCostPerUnit * totalSlots) + (optionCost * totalSlots))
                              );
                            }}
                          />
                          <label htmlFor={uniqueOptionId} className="text-sm">
                            {totalSlots}x {option.equipment_name || 'Loading...'}
                            {` ${option.cost * totalSlots >= 0 ? '+' : ''}${option.cost * totalSlots} credits`}
                          </label>
                        </div>
                      );
                    }

                    // === SINGLE / OPTIONAL_SINGLE: radio buttons ===
                    if (isSingle || isOptionalSingle) {
                      return (
                        <div key={uniqueOptionId} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`equipment-selection-${categoryId}`}
                            id={uniqueOptionId}
                            checked={selectedEquipmentIds.includes(uniqueOptionId)}
                            onChange={() => {
                              setSelectedEquipmentIds((prev) => {
                                const currentCategoryOptions = categoryData.options || [];
                                const filtered = prev.filter(id =>
                                  !currentCategoryOptions.some((o: any) => `${categoryId}-${o.id}` === id)
                                );
                                return [...filtered, uniqueOptionId];
                              });

                              setSelectedEquipment((prev) => [...withoutCategoryItems(prev), categoryItem(option, option.cost || 0, 1)]);

                              setFighterCost((prevCost) => {
                                const currentCategoryOptions = categoryData.options || [];
                                const prevSelectedUniqueId = selectedEquipmentIds.find(id =>
                                  currentCategoryOptions.some((o: any) => `${categoryId}-${o.id}` === id)
                                );
                                const prevSelectedCost = prevSelectedUniqueId
                                  ? currentCategoryOptions.find((o: any) => `${categoryId}-${o.id}` === prevSelectedUniqueId)?.cost || 0
                                  : 0;
                                const optionCost = option.cost || 0;
                                return String(parseInt(prevCost || '0') - prevSelectedCost + optionCost);
                              });
                            }}
                          />
                          <label htmlFor={uniqueOptionId} className="text-sm">
                            {option.equipment_name || 'Loading...'}
                            {` ${option.cost >= 0 ? '+' : ''}${option.cost} credits`}
                          </label>
                        </div>
                      );
                    }

                    // === MULTIPLE: checkboxes (default) ===
                    return (
                      <div key={uniqueOptionId} className="flex items-center gap-2">
                        <Checkbox
                          id={uniqueOptionId}
                          checked={selectedEquipmentIds.includes(uniqueOptionId)}
                          onCheckedChange={(checked) => {
                            const optionCost = option.cost || 0;

                            if (checked === true) {
                              setSelectedEquipmentIds(prev => [...prev, uniqueOptionId]);
                              setSelectedEquipment(prev => [...prev, categoryItem(option, optionCost, 1)]);
                              setFighterCost(prevCost => String(parseInt(prevCost || '0') + optionCost));
                            } else {
                              setSelectedEquipmentIds(prev => prev.filter(id => id !== uniqueOptionId));
                              setSelectedEquipment(prev => prev.filter(item =>
                                !(item.selection_key === categoryId && item.equipment_id === option.id)
                              ));
                              setFighterCost(prevCost => String(parseInt(prevCost || '0') - optionCost));
                            }
                          }}
                        />
                        <label htmlFor={uniqueOptionId} className="text-sm">
                          {option.equipment_name || 'Loading...'}
                          {` ${option.cost >= 0 ? '+' : ''}${option.cost} credits`}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
