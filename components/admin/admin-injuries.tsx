'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from 'sonner';
import { AdminFighterEffects } from "./admin-fighter-effects";
import {
  FighterEffectType,
  FighterEffectCategory,
  TypeSpecificData
} from "@/types/fighter-effect";

enum OperationType {
  POST = 'POST',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE'
}

interface AdminInjuriesGlitchesModalProps {
  onClose: () => void;
  onSubmit?: () => void;
}

export function AdminInjuriesGlitchesModal({ onClose, onSubmit }: AdminInjuriesGlitchesModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<'injuries' | 'rig-glitches'>('injuries');
  const [categories, setCategories] = useState<FighterEffectCategory[]>([]);
  const [effects, setEffects] = useState<FighterEffectType[]>([]);
  const [selectedEffectId, setSelectedEffectId] = useState('');
  const [effectName, setEffectName] = useState('');
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fighterEffects, setFighterEffects] = useState<FighterEffectType[]>([]);
  const [fighterEffectCategories, setFighterEffectCategories] = useState<FighterEffectCategory[]>([]);

  // Type-specific data fields
  const [recovery, setRecovery] = useState<boolean>(false);
  const [convalescence, setConvalescence] = useState<boolean>(false);
  const [appliesToEquipment, setAppliesToEquipment] = useState<boolean>(false);
  const [effectSelection, setEffectSelection] = useState<'fixed' | 'single_select' | 'multiple_select'>('fixed');
  const [addsToGlitchCount, setAddsToGlitchCount] = useState<boolean>(false);

  

  // Computed disabled state for form fields
  const isFormDisabled = (!isCreateMode && !selectedEffectId) || isLoading;

  // Fetch categories on mount
  useEffect(() => {
    fetchCategories();
  }, []);

  // Fetch effects when category changes
  useEffect(() => {
    if (categories.length > 0) {
      fetchEffects();
    }
  }, [selectedCategory, categories]);

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/admin/fighter-effects?categories=true');
      if (!response.ok) throw new Error('Failed to fetch categories');
      const data = await response.json();

      // Filter to only injuries and rig-glitches
      const relevantCategories = data.filter(
        (cat: FighterEffectCategory) => cat.category_name === 'injuries' || cat.category_name === 'rig-glitches'
      );

      setCategories(relevantCategories);
      setFighterEffectCategories(relevantCategories);
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast({
        description: 'Failed to load categories',
        variant: "destructive"
      });
    }
  };

  const fetchEffects = async () => {
    const category = categories.find(cat => cat.category_name === selectedCategory);
    if (!category) return;

    try {
      const response = await fetch(`/api/admin/fighter-effects?categoryId=${category.id}`);
      if (!response.ok) throw new Error('Failed to fetch effects');
      const data = await response.json();
      setEffects(data);
    } catch (error) {
      console.error('Error fetching effects:', error);
      toast({
        description: 'Failed to load effects',
        variant: "destructive"
      });
    }
  };

  const handleCategoryChange = (newCategory: 'injuries' | 'rig-glitches') => {
    setSelectedCategory(newCategory);
    setSelectedEffectId('');
    setEffectName('');
    setIsCreateMode(false);
    setFighterEffects([]);
    // Reset type-specific data
    setRecovery(false);
    setConvalescence(false);
    setAppliesToEquipment(false);
    setEffectSelection('fixed');
    setAddsToGlitchCount(false);
  };

  const handleEffectSelect = (effectId: string) => {
    setSelectedEffectId(effectId);
    const effect = effects.find(e => e.id === effectId);
    if (effect) {
      setEffectName(effect.effect_name);
      setIsCreateMode(false);
      // Set the effect for AdminFighterEffects to display modifiers
      setFighterEffects([effect]);

      // Populate type-specific data fields
      const typeData = effect.type_specific_data;
      setRecovery(typeData?.recovery === 'true' || typeData?.recovery === true);
      setConvalescence(typeData?.convalescence === 'true' || typeData?.convalescence === true);
      setAppliesToEquipment(typeData?.applies_to === 'equipment');
      setEffectSelection(typeData?.effect_selection || 'fixed');
      setAddsToGlitchCount(typeData?.adds_to_glitch_count === true);
    } else {
      setEffectName('');
      setIsCreateMode(false);
      setFighterEffects([]);
      // Reset type-specific data
      setRecovery(false);
      setConvalescence(false);
      setEffectSelection('fixed');
    }
  };

  const handleCreateNew = () => {
    setSelectedEffectId('');
    setEffectName('');
    setIsCreateMode(true);
    setFighterEffects([]);
    // Reset type-specific data
    setRecovery(false);
    setConvalescence(false);
    setAppliesToEquipment(false);
    setEffectSelection('fixed');
    setAddsToGlitchCount(false);
  };

  const handleSubmitEffect = async (operation: OperationType) => {
    // Validate required fields
    if ((operation === OperationType.POST || operation === OperationType.UPDATE) && !effectName) {
      toast({
        description: "Please enter an effect name",
        variant: "destructive"
      });
      return;
    }

    const category = categories.find(cat => cat.category_name === selectedCategory);
    if (!category) {
      toast({
        description: "Category not found",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      let url = '/api/admin/fighter-effects';
      let method: string;
      let body: string | undefined;

      // Build type_specific_data
      const typeSpecificData: TypeSpecificData = {
        recovery: recovery ? 'true' : 'false',
        convalescence: convalescence ? 'true' : 'false',
        effect_selection: effectSelection,
        ...(appliesToEquipment && { applies_to: 'equipment' as const }),
        ...(addsToGlitchCount && { adds_to_glitch_count: true })
      };

      switch (operation) {
        case OperationType.POST:
          method = 'POST';
          body = JSON.stringify({
            effect_name: effectName,
            fighter_effect_category_id: category.id,
            type_specific_data: typeSpecificData
          });
          break;
        case OperationType.UPDATE:
          method = 'PATCH';
          url = `/api/admin/fighter-effects?id=${selectedEffectId}`;
          body = JSON.stringify({
            effect_name: effectName,
            fighter_effect_category_id: category.id,
            type_specific_data: typeSpecificData
          });
          break;
        case OperationType.DELETE:
          method = 'DELETE';
          url = `/api/admin/fighter-effects?id=${selectedEffectId}`;
          break;
        default:
          throw new Error('Invalid operation');
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${operation === OperationType.POST ? 'create' : operation === OperationType.UPDATE ? 'update' : 'delete'} effect`);
      }

      const resultData = await response.json();

      toast({
        description: `Effect ${operation === OperationType.POST ? 'created' : operation === OperationType.UPDATE ? 'updated' : 'deleted'} successfully`,
        variant: "default"
      });

      // Refresh the effects list
      await fetchEffects();

      // If created, select the new effect to allow adding modifiers
      if (operation === OperationType.POST && resultData.id) {
        setSelectedEffectId(resultData.id);
        setIsCreateMode(false);
        // Fetch the newly created effect with its modifiers
        const newEffect = await fetch(`/api/admin/fighter-effects?id=${resultData.id}`);
        const newEffectData = await newEffect.json();
        if (newEffectData.length > 0) {
          setFighterEffects([newEffectData[0]]);
        }
      } else if (operation === OperationType.DELETE) {
        // Reset form after delete
        setSelectedEffectId('');
        setEffectName('');
        setIsCreateMode(false);
        setFighterEffects([]);
      }

      if (onSubmit) {
        onSubmit();
      }
    } catch (error) {
      console.error(`Error executing ${operation} operation:`, error);
      toast({
        description: error instanceof Error ? error.message : `Failed to ${operation === OperationType.POST ? 'create' : operation === OperationType.UPDATE ? 'update' : 'delete'} effect`,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEffectsChange = async (updatedEffects: FighterEffectType[]) => {
    // Get the current effect we're working with
    const currentEffect = fighterEffects[0];
    const updatedEffect = updatedEffects[0];

    if (!currentEffect || !updatedEffect) {
      setFighterEffects(updatedEffects);
      return;
    }

    // Find modifiers that were added (have temp IDs)
    const newModifiers = updatedEffect.modifiers.filter(
      mod => mod.id?.startsWith('temp-') && !currentEffect.modifiers.some(cm => cm.id === mod.id)
    );

    // Find modifiers that were deleted (no longer in the array)
    const deletedModifiers = currentEffect.modifiers.filter(
      mod => !mod.id?.startsWith('temp-') && !updatedEffect.modifiers.some(um => um.id === mod.id)
    );

    try {
      // Save new modifiers to the API
      for (const modifier of newModifiers) {
        const response = await fetch('/api/admin/fighter-effects', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fighter_effect_type_id: selectedEffectId,
            stat_name: modifier.stat_name,
            default_numeric_value: modifier.default_numeric_value,
            operation: modifier.operation || 'add'
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to save modifier');
        }
      }

      // Delete removed modifiers from the API
      for (const modifier of deletedModifiers) {
        const response = await fetch(`/api/admin/fighter-effects?id=${modifier.id}&is_modifier=true`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to delete modifier');
        }
      }

      // If any changes were made, show success and refresh
      if (newModifiers.length > 0 || deletedModifiers.length > 0) {
        toast({
          description: 'Modifiers updated successfully',
          variant: 'default'
        });
      }

      // Refresh the effects list to get the real IDs from the database
      await fetchEffects();

      // Re-fetch the selected effect to update the local state with real IDs
      const effectResponse = await fetch(`/api/admin/fighter-effects?id=${selectedEffectId}`);
      const effectData = await effectResponse.json();
      if (effectData.length > 0) {
        setFighterEffects([effectData[0]]);
      }
    } catch (error) {
      console.error('Error updating modifiers:', error);
      toast({
        description: error instanceof Error ? error.message : 'Failed to update modifiers',
        variant: 'destructive'
      });
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 dark:bg-neutral-700/50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card rounded-lg shadow-xl w-full max-w-3xl min-h-0 max-h-svh overflow-y-auto flex flex-col">
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <div>
            <h3 className="text-xl md:text-2xl font-bold text-foreground">Manage Injuries & Rig Glitches</h3>
            <p className="text-sm text-muted-foreground">Create, edit, or delete injuries and rig glitches</p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-muted-foreground text-xl"
          >
            ×
          </button>
        </div>

        <div className="px-[10px] py-4">
          <div className="space-y-4">
            {/* Category Selector */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Category *
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => handleCategoryChange(e.target.value as 'injuries' | 'rig-glitches')}
                className="w-full p-2 border rounded-md"
                disabled={isLoading}
              >
                <option value="injuries">Injury</option>
                <option value="rig-glitches">Rig Glitch</option>
              </select>
            </div>

            {/* Effect Selector */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-muted-foreground">
                  Select Effect
                </label>
                <Button
                  onClick={handleCreateNew}
                  disabled={isLoading}
                  className="text-xs h-7 px-3"
                >
                  Create New
                </Button>
              </div>
              <select
                value={selectedEffectId}
                onChange={(e) => handleEffectSelect(e.target.value)}
                className="w-full p-2 border rounded-md"
                disabled={isLoading}
              >
                <option value="">Select an effect to edit</option>
                {effects.map((effect) => (
                  <option key={effect.id} value={effect.id}>
                    {effect.effect_name}
                  </option>
                ))}
              </select>
              {isCreateMode && (
                <p className="text-xs text-amber-600 mt-1">
                  Creating new effect. Select from dropdown to cancel and edit existing.
                </p>
              )}
            </div>

            {/* Effect Name */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Effect Name *
              </label>
              <Input
                type="text"
                value={effectName}
                onChange={(e) => setEffectName(e.target.value)}
                placeholder="E.g. Sprained Ankle, Head Injury"
                className="w-full"
                disabled={isFormDisabled}
              />
            </div>

            {/* Type-Specific Configuration - Only show when creating or editing */}
            {(isCreateMode || selectedEffectId) && (
              <div className="border rounded-md p-3 space-y-3 bg-muted/30">
                <h4 className="text-sm font-semibold">Configuration</h4>

                {/* Recovery */}
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="recovery"
                    checked={recovery}
                    onCheckedChange={(checked) => setRecovery(checked === true)}
                    disabled={isFormDisabled}
                  />
                  <label htmlFor="recovery" className="text-sm font-medium cursor-pointer">
                    Goes into recovery
                  </label>
                </div>

                {/* Convalescence */}
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="convalescence"
                    checked={convalescence}
                    onCheckedChange={(checked) => setConvalescence(checked === true)}
                    disabled={isFormDisabled}
                  />
                  <label htmlFor="convalescence" className="text-sm font-medium cursor-pointer">
                    Goes into convalescence
                  </label>
                </div>

                {/* Adds to Glitch Count - only for rig-glitches */}
                {selectedCategory === 'rig-glitches' && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="adds-to-glitch-count"
                      checked={addsToGlitchCount}
                      onCheckedChange={(checked) => setAddsToGlitchCount(checked === true)}
                      disabled={isFormDisabled}
                    />
                    <label htmlFor="adds-to-glitch-count" className="text-sm font-medium cursor-pointer">
                      Adds to Glitch Count
                    </label>
                  </div>
                )}

                {/* Effect Selection */}
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Effect Selection
                  </label>
                  <select
                    value={effectSelection}
                    onChange={(e) => setEffectSelection(e.target.value as 'fixed' | 'single_select' | 'multiple_select')}
                    className="w-full p-2 border rounded-md"
                    disabled={isFormDisabled}
                  >
                    <option value="fixed">Fixed</option>
                    <option value="single_select">Single Select</option>
                    <option value="multiple_select">Multiple Select</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Fixed: Effect always applies. Single/Multiple Select: User can choose effect(s).
                  </p>
                </div>

                {/* Applies to Equipment */}
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="appliesToEquipment"
                    checked={appliesToEquipment}
                    onCheckedChange={(checked) => setAppliesToEquipment(checked === true)}
                    disabled={isFormDisabled}
                  />
                  <label htmlFor="appliesToEquipment" className="text-sm font-medium cursor-pointer">
                    Applies to equipment (user must select which weapon is affected)
                  </label>
                </div>
              </div>
            )}

            {/* Fighter Effects Section - Only show after creating or when editing */}
            {/* Note: equipmentId prop is reused here but actually receives the effect type ID,
                not an equipment ID. This allows AdminFighterEffects to manage modifiers 
                for this injury/glitch effect type. */}
            {(selectedEffectId && !isCreateMode) && (
              <div className="border-t pt-4">
                <AdminFighterEffects
                  equipmentId={selectedEffectId}
                  isSkill={false}
                  fighterEffects={fighterEffects}
                  fighterEffectCategories={fighterEffectCategories}
                  onUpdate={() => fetchEffects()}
                  onChange={handleEffectsChange}
                  hideEquipmentOption={true}
                />
              </div>
            )}
          </div>
        </div>

        <div className="border-t px-[10px] py-2 flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1"
          >
            Cancel
          </Button>

          {isCreateMode && (
            <Button
              onClick={() => handleSubmitEffect(OperationType.POST)}
              disabled={!effectName || isLoading}
              className="flex-1 bg-neutral-900 text-white rounded hover:bg-gray-800"
            >
              {isLoading ? 'Creating...' : 'Create Effect'}
            </Button>
          )}

          {!isCreateMode && selectedEffectId && (
            <>
              <Button
                onClick={() => handleSubmitEffect(OperationType.UPDATE)}
                disabled={!effectName || isLoading}
                className="flex-1 bg-neutral-900 text-white rounded hover:bg-gray-800"
              >
                {isLoading ? 'Updating...' : 'Update Effect'}
              </Button>
              <Button
                onClick={() => handleSubmitEffect(OperationType.DELETE)}
                disabled={isLoading}
                className="flex-1 bg-red-600 text-white rounded hover:bg-red-700"
              >
                {isLoading ? 'Deleting...' : 'Delete Effect'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
