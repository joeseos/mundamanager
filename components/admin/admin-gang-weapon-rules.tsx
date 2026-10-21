'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HiX } from 'react-icons/hi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import Modal from '@/components/ui/modal';
import { EditionSelect, useEditions } from '@/components/edition-select';
import { GangScope, GangScopeSelects, formatGangScope } from '@/components/admin/gang-scope-options';
import { FighterEffectCategory, FighterEffectType, TypeSpecificData } from '@/types/fighter-effect';

interface GangWeaponRuleScope extends GangScope {
  id: string;
  excluded: boolean;
}

// The weapon profile fields applyWeaponModifiers changes
const WEAPON_STATS = [
  { stat_name: 'range_short', label: 'Range (Short)' },
  { stat_name: 'range_long', label: 'Range (Long)' },
  { stat_name: 'acc_short', label: 'Accuracy (Short)' },
  { stat_name: 'acc_long', label: 'Accuracy (Long)' },
  { stat_name: 'strength', label: 'Strength' },
  { stat_name: 'ap', label: 'Armour Piercing' },
  { stat_name: 'damage', label: 'Damage' },
  { stat_name: 'ammo', label: 'Ammo' },
  { stat_name: 'lethality', label: 'Lethality' },
];

const CATEGORY_NAME = 'gang-weapon-rules';

const toList = (value: string) => value.split(',').map(t => t.trim()).filter(Boolean);
const fromList = (value: string[] | undefined) => value?.join(', ') ?? '';

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

interface AdminGangWeaponRulesModalProps {
  onClose: () => void;
}

export function AdminGangWeaponRulesModal({ onClose }: AdminGangWeaponRulesModalProps) {
  const queryClient = useQueryClient();

  const [editionId, setEditionId] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [requiresTraits, setRequiresTraits] = useState('');
  const [excludesTraits, setExcludesTraits] = useState('');
  const [traitsToAdd, setTraitsToAdd] = useState('');
  const [traitsToRemove, setTraitsToRemove] = useState('');

  const [modifierStat, setModifierStat] = useState('');
  const [modifierValue, setModifierValue] = useState('');

  const [showScopeDialog, setShowScopeDialog] = useState(false);
  const [scopeGangType, setScopeGangType] = useState('');
  const [scopeGangOrigin, setScopeGangOrigin] = useState('');
  const [scopeGangSubtype, setScopeGangSubtype] = useState('');
  const [scopeExcluded, setScopeExcluded] = useState(false);

  const { data: categoryId } = useQuery<string | undefined>({
    queryKey: ['admin-fighter-effect-categories', CATEGORY_NAME],
    queryFn: async () => {
      const categories: FighterEffectCategory[] = await request('/api/admin/fighter-effects?categories=true');
      return categories.find(c => c.category_name === CATEGORY_NAME)?.id;
    },
    staleTime: 5 * 60 * 1000,
  });

  const rulesKey = ['admin-fighter-effects', categoryId];
  const { data: rules = [] } = useQuery<FighterEffectType[]>({
    queryKey: rulesKey,
    queryFn: () => request(`/api/admin/fighter-effects?categoryId=${categoryId}`),
    enabled: !!categoryId,
  });

  const scopesKey = ['admin-gang-weapon-rules', selectedId];
  const { data: scopes = [] } = useQuery<GangWeaponRuleScope[]>({
    queryKey: scopesKey,
    queryFn: () => request(`/api/admin/gang-weapon-rules?fighter_effect_type_id=${selectedId}`),
    enabled: !!selectedId,
  });

  const { data: gangTypes = [] } = useQuery<Array<{ id: string; gang_type: string; edition_id?: string | null }>>({
    queryKey: ['admin-gang-types'],
    queryFn: () => request('/api/admin/gang-types'),
    staleTime: 5 * 60 * 1000,
  });

  const { data: origins = [] } = useQuery<Array<{ id: string; origin_name: string; edition_id?: string | null }>>({
    queryKey: ['admin-gang-origins'],
    queryFn: () => request('/api/admin/gang-origins'),
    staleTime: 5 * 60 * 1000,
  });

  const { data: subtypes = [] } = useQuery<Array<{ id: string; subtype: string; edition_id?: string | null }>>({
    queryKey: ['admin-gang-subtypes'],
    queryFn: () => request('/api/gang-subtype-types'),
    staleTime: 5 * 60 * 1000,
  });

  const { data: editions = [] } = useEditions();
  const editionSlug = editions.find(edition => edition.id === editionId)?.slug;

  const inEdition = <T extends { edition_id?: string | null }>(rows: T[]) =>
    editionId ? rows.filter(row => row.edition_id === editionId) : rows;
  const filteredRules = inEdition(rules);
  const scopeLists = { gangTypes, origins, subtypes };
  // Every edition's names label a saved gang; the dialog offers only this edition's
  const scopeSelectLists = { gangTypes: inEdition(gangTypes), origins: inEdition(origins), subtypes: inEdition(subtypes), editionSlug };

  const selectedRule = rules.find(rule => rule.id === selectedId);
  const isFormDisabled = (!isCreateMode && !selectedId) || isSubmitting;

  const fillForm = (rule?: FighterEffectType) => {
    const tsd = rule?.type_specific_data;
    setName(rule?.effect_name ?? '');
    setRequiresTraits(fromList(tsd?.requires_traits));
    setExcludesTraits(fromList(tsd?.excludes_traits));
    setTraitsToAdd(fromList(tsd?.traits_to_add));
    setTraitsToRemove(fromList(tsd?.traits_to_remove));
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setIsCreateMode(false);
    fillForm(rules.find(rule => rule.id === id));
  };

  const handleCreateNew = () => {
    setSelectedId('');
    setIsCreateMode(true);
    fillForm();
  };

  // Runs an admin write, then refreshes the rule list and the selected rule's scopes
  const submit = async (action: () => Promise<void>, success: string) => {
    setIsSubmitting(true);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: rulesKey });
      await queryClient.invalidateQueries({ queryKey: ['admin-gang-weapon-rules'] });
      toast.success(success);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // false keeps the modal open, so a new rule can be given its stat changes and gangs
  const handleSave = async () => {
    await saveRule();
    return false;
  };

  const saveRule = () => submit(async () => {
    const typeSpecificData: TypeSpecificData = {
      ...(selectedRule?.type_specific_data ?? {}),
      requires_traits: toList(requiresTraits),
      excludes_traits: toList(excludesTraits),
      traits_to_add: toList(traitsToAdd),
      traits_to_remove: toList(traitsToRemove),
    };
    (Object.keys(typeSpecificData) as Array<keyof TypeSpecificData>).forEach(key => {
      const value = typeSpecificData[key];
      if (Array.isArray(value) && value.length === 0) delete typeSpecificData[key];
    });

    const body = {
      effect_name: name.trim(),
      fighter_effect_category_id: categoryId,
      type_specific_data: typeSpecificData,
      edition_id: editionId || null,
    };

    if (isCreateMode) {
      const created = await request('/api/admin/fighter-effects', jsonInit('POST', body));
      setSelectedId(created.id);
      setIsCreateMode(false);
    } else {
      await request(`/api/admin/fighter-effects?id=${selectedId}`, jsonInit('PATCH', body));
    }
  }, isCreateMode ? 'Rule created' : 'Rule updated');

  const handleDelete = () => submit(async () => {
    await request(`/api/admin/fighter-effects?id=${selectedId}`, { method: 'DELETE' });
    setSelectedId('');
    fillForm();
  }, 'Rule deleted');

  const handleAddModifier = () => submit(async () => {
    await request('/api/admin/fighter-effects', jsonInit('POST', {
      fighter_effect_type_id: selectedId,
      stat_name: modifierStat,
      default_numeric_value: parseInt(modifierValue, 10),
      operation: 'add',
    }));
    setModifierStat('');
    setModifierValue('');
  }, 'Stat change added');

  const handleDeleteModifier = (modifierId: string) => submit(async () => {
    await request(`/api/admin/fighter-effects?id=${modifierId}&is_modifier=true`, { method: 'DELETE' });
  }, 'Stat change removed');

  const closeScopeDialog = () => {
    setShowScopeDialog(false);
    setScopeGangType('');
    setScopeGangOrigin('');
    setScopeGangSubtype('');
    setScopeExcluded(false);
  };

  // Modal closes the dialog when this resolves true
  const handleAddScope = () => submit(async () => {
    await request('/api/admin/gang-weapon-rules', jsonInit('POST', {
      fighter_effect_type_id: selectedId,
      gang_type_id: scopeGangType || null,
      gang_origin_id: scopeGangOrigin || null,
      gang_subtype_id: scopeGangSubtype || null,
      excluded: scopeExcluded,
    }));
  }, 'Gang added');

  const handleDeleteScope = (scopeId: string) => submit(async () => {
    await request(`/api/admin/gang-weapon-rules?id=${scopeId}`, { method: 'DELETE' });
  }, 'Gang removed');

  return (
    <Modal
      title="Gang Weapon Rules"
      helper="Changes to every weapon a gang's own fighters carry, e.g. the Chymist Cult's Deadly Poisons. Hired guns and other fighters from outside the gang's own list are not affected."
      onClose={onClose}
      onConfirm={handleSave}
      confirmText={isCreateMode ? 'Create Rule' : 'Save Rule'}
      confirmDisabled={isFormDisabled || !name.trim() || !categoryId}
      onDelete={selectedId && !isCreateMode ? handleDelete : undefined}
      deleteLabel="Delete Rule"
      width="2xl"
    >
      <div className="space-y-4">
        <EditionSelect
          value={editionId}
          onChange={(id) => {
            setEditionId(id);
            handleSelect('');
          }}
          defaultToCurrent
        />

        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="block text-sm font-medium text-muted-foreground">Rule</label>
            <Button onClick={handleCreateNew} disabled={isSubmitting} className="text-xs h-7 px-3">
              Add Rule
            </Button>
          </div>
          <select
            value={selectedId}
            onChange={(e) => handleSelect(e.target.value)}
            className="w-full p-2 border rounded-md"
            disabled={isSubmitting}
          >
            <option value="">Select a rule to edit</option>
            {filteredRules.map(rule => (
              <option key={rule.id} value={rule.id}>{rule.effect_name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">Name *</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Deadly Poisons" disabled={isFormDisabled} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Weapons With Traits</label>
            <Input value={requiresTraits} onChange={(e) => setRequiresTraits(e.target.value)} placeholder="e.g. Toxin" disabled={isFormDisabled} />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Weapons Without Traits</label>
            <Input value={excludesTraits} onChange={(e) => setExcludesTraits(e.target.value)} placeholder="e.g. Shred" disabled={isFormDisabled} />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Traits to Add</label>
            <Input value={traitsToAdd} onChange={(e) => setTraitsToAdd(e.target.value)} placeholder="e.g. Shred (6+)" disabled={isFormDisabled} />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Traits to Remove</label>
            <Input value={traitsToRemove} onChange={(e) => setTraitsToRemove(e.target.value)} disabled={isFormDisabled} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Comma separated. Leave Weapons With Traits empty for every weapon. In Weapons With and Without Traits, a trait name without a value matches every value, so Toxin matches Toxin (4+).
        </p>

        {selectedRule && (
          <>
            <div className="border-t pt-4">
              <label className="block text-sm font-medium text-muted-foreground mb-1">Stat Changes</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {selectedRule.modifiers.map(modifier => (
                  <div key={modifier.id} className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-muted">
                    <span>
                      {WEAPON_STATS.find(s => s.stat_name === modifier.stat_name)?.label ?? modifier.stat_name}{' '}
                      {(modifier.default_numeric_value ?? 0) > 0 ? '+' : ''}{modifier.default_numeric_value}
                    </span>
                    <button
                      type="button"
                      onClick={() => modifier.id && handleDeleteModifier(modifier.id)}
                      className="hover:text-red-500 focus:outline-hidden"
                      disabled={isSubmitting}
                    >
                      <HiX className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <select
                  value={modifierStat}
                  onChange={(e) => setModifierStat(e.target.value)}
                  className="flex-1 p-2 border rounded-md"
                >
                  <option value="">Select a stat</option>
                  {WEAPON_STATS.map(stat => (
                    <option key={stat.stat_name} value={stat.stat_name}>{stat.label}</option>
                  ))}
                </select>
                <Input
                  type="number"
                  value={modifierValue}
                  onChange={(e) => setModifierValue(e.target.value)}
                  placeholder="e.g. -1"
                  className="w-24"
                />
                <Button
                  variant="outline"
                  onClick={handleAddModifier}
                  disabled={isSubmitting || !modifierStat || !Number.isFinite(parseInt(modifierValue, 10))}
                >
                  Add
                </Button>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-muted-foreground">Gangs</label>
                <Button variant="outline" size="sm" onClick={() => setShowScopeDialog(true)} disabled={isSubmitting}>
                  Add Gang
                </Button>
              </div>
              {scopes.length === 0 && (
                <p className="text-sm text-muted-foreground">No gangs yet, so the rule applies to none.</p>
              )}
              <div className="flex flex-wrap gap-2">
                {scopes.map(scope => (
                  <div key={scope.id} className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-muted">
                    <span>{scope.excluded ? 'Deny' : 'Grant'} — {formatGangScope(scope, scopeLists)}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteScope(scope.id)}
                      className="hover:text-red-500 focus:outline-hidden"
                      disabled={isSubmitting}
                    >
                      <HiX className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {showScopeDialog && (
          <Modal
            title="Gang Weapon Rule Gang"
            helper="The rule applies to gangs matching a grant, unless they also match a deny."
            onClose={closeScopeDialog}
            onConfirm={handleAddScope}
            confirmText="Add Gang"
            // scope_chk: an all-null scope would apply to every gang in the game
            confirmDisabled={isSubmitting || (!scopeGangType && !scopeGangOrigin && !scopeGangSubtype)}
            width="sm"
          >
            <div className="space-y-4">
              <GangScopeSelects
                {...scopeSelectLists}
                gangTypeId={scopeGangType}
                onGangTypeChange={setScopeGangType}
                gangOriginId={scopeGangOrigin}
                onGangOriginChange={setScopeGangOrigin}
                gangSubtypeId={scopeGangSubtype}
                onGangSubtypeChange={setScopeGangSubtype}
              />
              <label className="flex items-start space-x-2">
                <Checkbox
                  checked={scopeExcluded}
                  onCheckedChange={(checked) => setScopeExcluded(checked === true)}
                  className="mt-1"
                />
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Deny</span>
                  <p className="text-sm text-muted-foreground mt-1">
                    Cancels the rule for matching gangs, e.g. a gang subtype that loses a house rule.
                  </p>
                </div>
              </label>
            </div>
          </Modal>
        )}
      </div>
    </Modal>
  );
}
