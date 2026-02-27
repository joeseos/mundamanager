import { useMemo } from 'react';
import { FighterProps as Fighter } from '@/types/fighter';

export function FighterCharacteristicTable({ fighter }: { fighter: Fighter }) {
  // Define the stats to display
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
    { key: 'intelligence', label: 'Int' }
  ];

  // IMPORTANT FIX: Get base values from original fighter properties directly
  const getStat = (fighter: Fighter, key: string): number => {
    // Return original base values from fighter object
    return fighter[key as keyof Fighter] as number || 0;
  };

  // Single function to calculate effects for any category
  const calculateEffectsForCategory = useMemo(() => {
    return (categoryName: keyof typeof fighter.effects) => {
      const effects: Record<string, number> = {};
      fighter.effects?.[categoryName]?.forEach(effect => {
        effect.fighter_effect_modifiers?.forEach(modifier => {
          const statName = modifier.stat_name.toLowerCase();
          const numValue = parseInt(modifier.numeric_value.toString());
          effects[statName] = (effects[statName] || 0) + numValue;
        });
      });
      return effects;
    };
  }, [fighter.effects]);

  // Calculate all effect categories using the single function
  const injuryEffects = useMemo(() => calculateEffectsForCategory('injuries'), [calculateEffectsForCategory]);
  const advancementEffects = useMemo(() => calculateEffectsForCategory('advancements'), [calculateEffectsForCategory]);
  const userEffects = useMemo(() => calculateEffectsForCategory('user'), [calculateEffectsForCategory]);
  const userHasNonZero = useMemo(() => Object.values(userEffects).some(v => (v || 0) !== 0), [userEffects]);
  const bionicsEffects = useMemo(() => calculateEffectsForCategory('bionics'), [calculateEffectsForCategory]);
  const geneSmithingEffects = useMemo(() => calculateEffectsForCategory('gene-smithing'), [calculateEffectsForCategory]);
  const rigGlitchesEffects = useMemo(() => calculateEffectsForCategory('rig-glitches'), [calculateEffectsForCategory]);
  const augmentationsEffects = useMemo(() => calculateEffectsForCategory('augmentations'), [calculateEffectsForCategory]);
  const equipmentEffects = useMemo(() => calculateEffectsForCategory('equipment'), [calculateEffectsForCategory]);
  const powerBoostsEffects = useMemo(() => calculateEffectsForCategory('power-boosts'), [calculateEffectsForCategory]);

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="px-1 py-1 text-xs text-left">Type</th>
            {stats.map(stat => (
              <th key={stat.key} className="min-w-[20px] max-w-[20px] border-l border-border text-center text-xs">{stat.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Base row - always shown */}
          <tr className="bg-muted">
            <td className="px-1 py-1 font-medium text-xs">Base</td>
            {stats.map(stat => {
              const baseValue = getStat(fighter, stat.key);

              return (
                <td key={stat.key} className="border-l border-border text-center text-xs">
                  {stat.key === 'movement' ? `${baseValue}"` :
                   stat.key === 'wounds' || stat.key === 'attacks' ||
                   stat.key === 'strength' || stat.key === 'toughness' ?
                   baseValue :
                   `${baseValue}+`}
                </td>
              );
            })}
          </tr>

          {/* Injury row - only show if fighter has injuries */}
          {fighter.effects?.injuries && fighter.effects.injuries.length > 0 && (
            <tr className="bg-red-50 dark:bg-red-950">
              <td className="px-1 py-1 font-medium text-xs">Injuries</td>
              {stats.map(stat => (
                <td key={stat.key} className="border-l border-border text-center text-xs">
                  {injuryEffects[stat.key] ? injuryEffects[stat.key] : '-'}
                </td>
              ))}
            </tr>
          )}

          {/* Advancements row - only show if fighter has advancements */}
          {fighter.effects?.advancements && fighter.effects.advancements.length > 0 && (
            <tr className="bg-blue-50 dark:bg-blue-950">
              <td className="px-1 py-1 font-medium text-xs">Adv.</td>
              {stats.map(stat => (
                <td key={stat.key} className="border-l border-border text-center text-xs">
                  {advancementEffects[stat.key] ? advancementEffects[stat.key] : '-'}
                </td>
              ))}
            </tr>
          )}

          {/* Bionics row - only show if fighter has bionics */}
          {fighter.effects?.bionics && fighter.effects.bionics.length > 0 && (
            <tr className="bg-yellow-50 dark:bg-yellow-950">
              <td className="px-1 py-1 font-medium text-xs">Bionics</td>
              {stats.map(stat => (
                <td key={stat.key} className="border-l border-border text-center text-xs">
                  {bionicsEffects[stat.key] ? bionicsEffects[stat.key] : '-'}
                </td>
              ))}
            </tr>
          )}

          {/* User row - only show if user effects result in any non-zero modifier */}
          {userHasNonZero && (
            <tr className="bg-green-50 dark:bg-green-950">
              <td className="px-1 py-1 font-medium text-xs">User</td>
              {stats.map(stat => (
                <td key={stat.key} className="border-l border-border text-center text-xs">
                  {userEffects[stat.key] ? userEffects[stat.key] : '-'}
                </td>
              ))}
            </tr>
          )}

          {/* Gene-Smithing row - only show if fighter has gene-smithing effects */}
          {fighter.effects?.['gene-smithing'] && fighter.effects['gene-smithing'].length > 0 && (
            <tr className="bg-purple-50 dark:bg-purple-950">
              <td className="px-1 py-1 font-medium text-xs">Gene-Smithing</td>
              {stats.map(stat => (
                <td key={stat.key} className="border-l border-border text-center text-xs">
                  {geneSmithingEffects[stat.key] ? geneSmithingEffects[stat.key] : '-'}
                </td>
              ))}
            </tr>
          )}

          {/* Rig-Glitches row - only show if fighter has rig-glitches effects */}
          {fighter.effects?.['rig-glitches'] && fighter.effects['rig-glitches'].length > 0 && (
            <tr className="bg-pink-50 dark:bg-pink-950">
              <td className="px-1 py-1 font-medium text-xs">Rig-Glitches</td>
              {stats.map(stat => (
                <td key={stat.key} className="border-l border-border text-center text-xs">
                  {rigGlitchesEffects[stat.key] ? rigGlitchesEffects[stat.key] : '-'}
                </td>
              ))}
            </tr>
          )}

          {/* Augmentations row - only show if fighter has augmentations effects */}
          {fighter.effects?.augmentations && fighter.effects.augmentations.length > 0 && (
            <tr className="bg-teal-50 dark:bg-teal-950">
              <td className="px-1 py-1 font-medium text-xs">Augmentations</td>
              {stats.map(stat => (
                <td key={stat.key} className="border-l border-border text-center text-xs">
                  {augmentationsEffects[stat.key] ? augmentationsEffects[stat.key] : '-'}
                </td>
              ))}
            </tr>
          )}

          {/* Equipment row - only show if fighter has equipment effects */}
          {fighter.effects?.equipment && fighter.effects.equipment.length > 0 && (
            <tr className="bg-amber-50 dark:bg-amber-950">
              <td className="px-1 py-1 font-medium text-xs">Equipment</td>
              {stats.map(stat => (
                <td key={stat.key} className="border-l border-border text-center text-xs">
                  {equipmentEffects[stat.key] ? equipmentEffects[stat.key] : '-'}
                </td>
              ))}
            </tr>
          )}

          {/* Power Boosts row - only show if fighter has power-boosts effects */}
          {fighter.effects?.['power-boosts'] && fighter.effects['power-boosts'].length > 0 && (
            <tr className="bg-cyan-50 dark:bg-cyan-950">
              <td className="px-1 py-1 font-medium text-xs">Power Boosts</td>
              {stats.map(stat => (
                <td key={stat.key} className="border-l border-border text-center text-xs">
                  {powerBoostsEffects[stat.key] ? powerBoostsEffects[stat.key] : '-'}
                </td>
              ))}
            </tr>
          )}

          {/* Total row - always shown */}
          <tr className="bg-muted font-bold">
            <td className="px-1 py-1 text-xs">Total</td>
            {stats.map(stat => {
              const baseValue = getStat(fighter, stat.key);
              const injuryValue = injuryEffects[stat.key] || 0;
              const advancementValue = advancementEffects[stat.key] || 0;
              const bionicsValue = bionicsEffects[stat.key] || 0;
              const userValue = userEffects[stat.key] || 0;
              const geneSmithingValue = geneSmithingEffects[stat.key] || 0;
              const rigGlitchesValue = rigGlitchesEffects[stat.key] || 0;
              const augmentationsValue = augmentationsEffects[stat.key] || 0;
              const equipmentValue = equipmentEffects[stat.key] || 0;
              const powerBoostsValue = powerBoostsEffects[stat.key] || 0;
              const total = baseValue + injuryValue + advancementValue + bionicsValue + userValue + geneSmithingValue + rigGlitchesValue + augmentationsValue + equipmentValue + powerBoostsValue;

              return (
                <td key={stat.key} className="border-l border-border text-center text-xs">
                  {stat.key === 'movement' ? `${total}"` :
                   stat.key === 'wounds' || stat.key === 'attacks' ||
                   stat.key === 'strength' || stat.key === 'toughness' ?
                   total :
                   `${total}+`}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
