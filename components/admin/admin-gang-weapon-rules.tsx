'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HiX } from 'react-icons/hi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import Modal from '@/components/ui/modal';
import { useEditions } from '@/components/edition-select';
import { GangOriginOptions, GangSubtypeOptions, formatGangScope } from '@/components/admin/gang-scope-options';
import { FighterEffectCategory, FighterEffectTypeModifier, TypeSpecificData } from '@/types/fighter-effect';

interface GangWeaponRuleRow {
  id: string;
  fighter_effect_type_id: string;
  gang_type_id: string;
  gang_origin_id: string | null;
  gang_subtype_id: string | null;
  excluded: boolean;
  fighter_effect_types: {
    id: string;
    effect_name: string;
    type_specific_data: TypeSpecificData | null;
    fighter_effect_type_modifiers: FighterEffectTypeModifier[];
  };
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
const NEW_RULE = 'new';

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

const chipClass = 'flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-muted';

interface GangWeaponRulesSectionProps {
  gangTypeId: string;
  editionId: string;
}

/**
 * The Gangs modal's Weapon Rules: rules a gang type applies to its own fighters' weapons, e.g. the
 * Chymist Cult's Deadly Poisons. Each rule is a fighter effect type in the gang-weapon-rules
 * category plus gang_weapon_rules rows for this gang type, narrowed or denied by origin/subtype.
 */
export function GangWeaponRulesSection({ gangTypeId, editionId }: GangWeaponRulesSectionProps) {
  const queryClient = useQueryClient();

  const [editingId, setEditingId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [requiresTraits, setRequiresTraits] = useState('');
  const [excludesTraits, setExcludesTraits] = useState('');
  const [traitsToAdd, setTraitsToAdd] = useState('');
  const [traitsToRemove, setTraitsToRemove] = useState('');

  const [modifierStat, setModifierStat] = useState('');
  const [modifierValue, setModifierValue] = useState('');

  const [scopeOrigin, setScopeOrigin] = useState('');
  const [scopeSubtype, setScopeSubtype] = useState('');
  const [scopeExcluded, setScopeExcluded] = useState(false);

  const rowsKey = ['admin-gang-weapon-rules', gangTypeId];
  const { data: rows = [] } = useQuery<GangWeaponRuleRow[]>({
    queryKey: rowsKey,
    queryFn: () => request(`/api/admin/gang-weapon-rules?gang_type_id=${gangTypeId}`),
  });

  const { data: categoryId } = useQuery<string | undefined>({
    queryKey: ['admin-fighter-effect-categories', CATEGORY_NAME],
    queryFn: async () => {
      const categories: FighterEffectCategory[] = await request('/api/admin/fighter-effects?categories=true');
      return categories.find(c => c.category_name === CATEGORY_NAME)?.id;
    },
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
  const inEdition = <T extends { edition_id?: string | null }>(list: T[]) =>
    editionId ? list.filter(item => item.edition_id === editionId) : list;

  // One entry per rule, with this gang type's rows for it
  const rules = [...new Map(rows.map(row => [row.fighter_effect_type_id, row.fighter_effect_types])).values()];
  const editingRule = rules.find(rule => rule.id === editingId);
  const editingRows = rows.filter(row => row.fighter_effect_type_id === editingId);

  const openEditor = (ruleId: string) => {
    const tsd = rules.find(rule => rule.id === ruleId)?.type_specific_data;
    setEditingId(ruleId);
    setName(rules.find(rule => rule.id === ruleId)?.effect_name ?? '');
    setRequiresTraits(fromList(tsd?.requires_traits));
    setExcludesTraits(fromList(tsd?.excludes_traits));
    setTraitsToAdd(fromList(tsd?.traits_to_add));
    setTraitsToRemove(fromList(tsd?.traits_to_remove));
  };

  // Runs an admin write, then refreshes this gang type's rules
  const submit = async (action: () => Promise<void>, success: string) => {
    setIsSubmitting(true);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: rowsKey });
      toast.success(success);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const addRow = (fighterEffectTypeId: string, scope: { gang_origin_id?: string; gang_subtype_id?: string; excluded?: boolean } = {}) =>
    request('/api/admin/gang-weapon-rules', jsonInit('POST', {
      fighter_effect_type_id: fighterEffectTypeId,
      gang_type_id: gangTypeId,
      ...scope,
    }));

  // false keeps the editor open, so a new rule can be given its stat changes and gangs
  const handleSave = async () => {
    await submit(async () => {
      const typeSpecificData: TypeSpecificData = {
        ...(editingRule?.type_specific_data ?? {}),
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

      if (editingId === NEW_RULE) {
        // A new rule applies to the whole gang type until narrowed below
        const created = await request('/api/admin/fighter-effects', jsonInit('POST', body));
        await addRow(created.id);
        setEditingId(created.id);
      } else {
        await request(`/api/admin/fighter-effects?id=${editingId}`, jsonInit('PATCH', body));
      }
    }, editingId === NEW_RULE ? 'Rule created' : 'Rule updated');
    return false;
  };

  const handleDelete = () => submit(async () => {
    await request(`/api/admin/fighter-effects?id=${editingId}`, { method: 'DELETE' });
    setEditingId('');
  }, 'Rule deleted');

  const handleAddModifier = () => submit(async () => {
    await request('/api/admin/fighter-effects', jsonInit('POST', {
      fighter_effect_type_id: editingId,
      stat_name: modifierStat,
      default_numeric_value: parseInt(modifierValue, 10),
      operation: 'add',
    }));
    setModifierStat('');
    setModifierValue('');
  }, 'Stat change added');

  const handleAddScope = () => submit(async () => {
    await addRow(editingId, {
      gang_origin_id: scopeOrigin || undefined,
      gang_subtype_id: scopeSubtype || undefined,
      excluded: scopeExcluded,
    });
    setScopeOrigin('');
    setScopeSubtype('');
    setScopeExcluded(false);
  }, 'Gangs updated');

  const handleDeleteScope = (rowId: string) => submit(async () => {
    await request(`/api/admin/gang-weapon-rules?id=${rowId}`, { method: 'DELETE' });
  }, 'Gangs updated');

  const removeButton = (onClick: () => void) => (
    <button type="button" onClick={onClick} className="hover:text-red-500 focus:outline-hidden" disabled={isSubmitting}>
      <HiX className="h-4 w-4" />
    </button>
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <label className="block text-sm font-medium text-muted-foreground">Weapon Rules</label>
        <Button onClick={() => openEditor(NEW_RULE)} variant="outline" size="sm" disabled={!categoryId}>
          Add Rule
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mb-2">
        Changes to every weapon this gang type&apos;s own fighters carry. Hired guns and other fighters from outside its list are not affected.
      </p>
      <div className="flex flex-wrap gap-2">
        {rules.map(rule => (
          <button key={rule.id} type="button" onClick={() => openEditor(rule.id)} className={`${chipClass} hover:bg-muted/70`}>
            {rule.effect_name}
          </button>
        ))}
      </div>

      {editingId && (
        <Modal
          title={editingId === NEW_RULE ? 'Add Weapon Rule' : 'Edit Weapon Rule'}
          onClose={() => setEditingId('')}
          onConfirm={handleSave}
          confirmText={editingId === NEW_RULE ? 'Create Rule' : 'Save Rule'}
          confirmDisabled={isSubmitting || !name.trim()}
          onDelete={editingRule ? handleDelete : undefined}
          deleteLabel="Delete Rule"
          width="2xl"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Name *</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Deadly Poisons" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Weapons With Traits</label>
                <Input value={requiresTraits} onChange={(e) => setRequiresTraits(e.target.value)} placeholder="e.g. Toxin" />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Weapons Without Traits</label>
                <Input value={excludesTraits} onChange={(e) => setExcludesTraits(e.target.value)} placeholder="e.g. Shred" />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Traits to Add</label>
                <Input value={traitsToAdd} onChange={(e) => setTraitsToAdd(e.target.value)} placeholder="e.g. Shred (6+)" />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Traits to Remove</label>
                <Input value={traitsToRemove} onChange={(e) => setTraitsToRemove(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Comma separated. Leave Weapons With Traits empty for every weapon. In Weapons With and Without Traits, a trait name without a value matches every value, so Toxin matches Toxin (4+).
            </p>

            {editingRule && (
              <>
                <div className="border-t pt-4">
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Stat Changes</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {editingRule.fighter_effect_type_modifiers.map(modifier => (
                      <div key={modifier.id} className={chipClass}>
                        <span>
                          {WEAPON_STATS.find(s => s.stat_name === modifier.stat_name)?.label ?? modifier.stat_name}{' '}
                          {(modifier.default_numeric_value ?? 0) > 0 ? '+' : ''}{modifier.default_numeric_value}
                        </span>
                        {removeButton(() => submit(async () => {
                          await request(`/api/admin/fighter-effects?id=${modifier.id}&is_modifier=true`, { method: 'DELETE' });
                        }, 'Stat change removed'))}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <select value={modifierStat} onChange={(e) => setModifierStat(e.target.value)} className="flex-1 p-2 border rounded-md">
                      <option value="">Select a stat</option>
                      {WEAPON_STATS.map(stat => (
                        <option key={stat.stat_name} value={stat.stat_name}>{stat.label}</option>
                      ))}
                    </select>
                    <Input type="number" value={modifierValue} onChange={(e) => setModifierValue(e.target.value)} placeholder="e.g. -1" className="w-24" />
                    <Button
                      variant="outline"
                      onClick={handleAddModifier}
                      disabled={isSubmitting || !modifierStat || !Number.isFinite(parseInt(modifierValue, 10))}
                    >
                      Add
                    </Button>
                  </div>
                </div>

                <div className="border-t pt-4 space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Gangs</label>
                  <p className="text-xs text-muted-foreground">
                    The rule applies to gangs of this gang type matching a grant, unless they also match a deny, e.g. deny a corrupted subtype.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {editingRows.map(row => (
                      <div key={row.id} className={chipClass}>
                        <span>
                          {row.excluded ? 'Deny' : 'Grant'} — {formatGangScope({ ...row, gang_type_id: null }, { gangTypes: [], origins, subtypes }) || 'every gang'}
                        </span>
                        {removeButton(() => handleDeleteScope(row.id))}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
                    <select value={scopeOrigin} onChange={(e) => setScopeOrigin(e.target.value)} className="p-2 border rounded-md">
                      <option value="">Any Gang Origin</option>
                      <GangOriginOptions origins={inEdition(origins)} />
                    </select>
                    <select value={scopeSubtype} onChange={(e) => setScopeSubtype(e.target.value)} className="p-2 border rounded-md">
                      <option value="">Any Gang Subtype</option>
                      <GangSubtypeOptions subtypes={inEdition(subtypes)} editionSlug={editionSlug} />
                    </select>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={scopeExcluded} onCheckedChange={(checked) => setScopeExcluded(checked === true)} />
                      Deny
                    </label>
                    <Button variant="outline" onClick={handleAddScope} disabled={isSubmitting}>
                      Add
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
