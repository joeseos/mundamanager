'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import DiceRoller from '@/components/dice-roller';
import { Checkbox } from '@/components/ui/checkbox';
import { rollD66Outcome, rollNd6Outcome, type RollOutcome } from '@/utils/dice';
import { formatD66Range, type TacticsCard, type TacticsCardsPack } from '@/types/tactics-card';
import { verifyAndLogRolledTacticsCard } from '@/app/actions/gang-tactics-cards';

interface TacticsCardPickerProps {
  gangId: string;
  /** Catalogue ids the gang already holds; shown ticked and locked. */
  ownedCardIds: Set<string>;
  selectedCardIds: Set<string>;
  /** Also hands back the picked cards, so a caller can show them by name. */
  onSelectionChange: (cardIds: Set<string>, cards: TacticsCard[]) => void;
  /** Picking a card replaces the last pick instead of adding to it. */
  single?: boolean;
}

/**
 * The pack selector, dice roller and card list of the Add Gang Tactics modal,
 * also used by the Develop Tactics Post-cycle Action. Fetches the packs on mount.
 */
export default function TacticsCardPicker({
  gangId,
  ownedCardIds,
  selectedCardIds,
  onSelectionChange,
  single = false
}: TacticsCardPickerProps) {
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [rollLogCooldown, setRollLogCooldown] = useState(false);

  // Every pack arrives with its cards, so switching pack is local.
  const { data: packs = [], isLoading: isLoadingPacks, error: packsError } = useQuery<TacticsCardsPack[]>({
    queryKey: ['tactics-cards', gangId],
    queryFn: async () => {
      const response = await fetch(`/api/tactics-cards?gang_id=${gangId}`);
      if (!response.ok) throw new Error('Failed to fetch tactics cards');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!gangId
  });

  const corePack = packs.find(pack => pack.is_core);
  const selectablePacks = packs.filter(pack => !pack.is_core);
  // Each pack is its own roll table, so one is active at a time and the roller
  // follows it.
  const activePack = selectedPackId ? packs.find(pack => pack.id === selectedPackId) : corePack;
  const catalogue = activePack?.cards ?? [];
  // Packs carry no dice column: a deck numbered only 1-6 is a D6 table.
  const isD6Pack = catalogue.length > 0 && catalogue.every(card => card.d66_max == null || card.d66_max <= 6);

  const hasRollableCard = catalogue.some(card => card.d66_min != null && !ownedCardIds.has(card.id));

  const select = (cardIds: Set<string>) =>
    onSelectionChange(cardIds, catalogue.filter(card => cardIds.has(card.id)));

  const logRollMutation = useMutation({
    mutationFn: (outcome: RollOutcome) =>
      verifyAndLogRolledTacticsCard({
        gangId,
        total: outcome.total,
        dice: outcome.dice,
        tacticsCardsPackId: activePack?.id ?? null
      })
  });

  const logRollWithCooldown = (outcome: RollOutcome) => {
    if (rollLogCooldown || logRollMutation.isPending) return;
    setRollLogCooldown(true);
    try {
      logRollMutation.mutate(outcome);
    } finally {
      setTimeout(() => setRollLogCooldown(false), 2000);
    }
  };

  const cardForRoll = (total: number) =>
    catalogue.find(
      card => card.d66_min != null && card.d66_max != null && total >= card.d66_min && total <= card.d66_max
    );

  const rollPackDice = (): RollOutcome => (isD6Pack ? rollNd6Outcome(1) : rollD66Outcome());

  const rollUnowned = (): RollOutcome => {
    let outcome = rollPackDice();
    for (let attempt = 0; attempt < 50; attempt++) {
      const card = cardForRoll(outcome.total);
      // No match is a gap in the catalogue's ranges — report it rather than loop past it.
      if (!card || !ownedCardIds.has(card.id)) return outcome;
      outcome = rollPackDice();
    }
    return outcome;
  };

  // Assigning one id is what makes "only one pack at a time" true. The card
  // selection goes with the list it was made in.
  const selectPack = (packId: string | null) => {
    setSelectedPackId(packId);
    onSelectionChange(new Set(), []);
  };

  const toggleCard = (cardId: string) => {
    if (single) {
      select(new Set(selectedCardIds.has(cardId) ? [] : [cardId]));
      return;
    }
    const next = new Set(selectedCardIds);
    if (next.has(cardId)) {
      next.delete(cardId);
    } else {
      next.add(cardId);
    }
    select(next);
  };

  return (
    <div>
      {selectablePacks.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2">
          {selectablePacks.map(pack => (
            <div key={pack.id} className="flex items-center space-x-2">
              <Checkbox
                id={`tactics-pack-${pack.id}`}
                checked={selectedPackId === pack.id}
                onCheckedChange={(checked) => selectPack(checked ? pack.id : null)}
              />
              <label htmlFor={`tactics-pack-${pack.id}`} className="text-sm cursor-pointer">
                {pack.name}
              </label>
            </div>
          ))}
        </div>
      )}
      <div className="mb-3">
        <DiceRoller<TacticsCard>
          items={catalogue}
          getRange={(card) =>
            card.d66_min != null && card.d66_max != null
              ? { min: card.d66_min, max: card.d66_max }
              : null
          }
          getName={(card) => card.name}
          inline
          rollFn={rollUnowned}
          buttonText={isD6Pack ? 'Roll D6' : 'Roll D66'}
          disabled={isLoadingPacks || !hasRollableCard}
          onRolled={(rolled) => {
            const result = rolled[0];
            const card = result?.item;
            if (!card) return;
            logRollWithCooldown({ total: result.roll, dice: result.dice });
            select(new Set([card.id]));
            document
              .getElementById(`tactics-card-${card.id}`)
              ?.scrollIntoView({ block: 'nearest' });
          }}
        />
      </div>
      {isLoadingPacks ? (
        <p className="text-muted-foreground italic text-center py-4">Loading tactics cards...</p>
      ) : packsError ? (
        <p className="text-muted-foreground italic text-center py-4">Failed to load tactics cards.</p>
      ) : catalogue.length === 0 ? (
        <p className="text-muted-foreground italic text-center py-4">No tactics cards available.</p>
      ) : (
        <div className="max-h-96 overflow-y-auto border border-border rounded-lg">
          {catalogue.map((card, index) => {
            const isOwned = ownedCardIds.has(card.id);
            return (
              <label
                key={card.id}
                htmlFor={`tactics-card-${card.id}`}
                className={`flex items-center gap-3 px-3 py-[6px] ${
                  index !== catalogue.length - 1 ? 'border-b border-border' : ''
                } ${isOwned ? 'opacity-50' : 'hover:bg-muted cursor-pointer'} transition-colors`}
              >
                <Checkbox
                  id={`tactics-card-${card.id}`}
                  checked={isOwned || selectedCardIds.has(card.id)}
                  disabled={isOwned}
                  onCheckedChange={() => toggleCard(card.id)}
                />
                <span className="tabular-nums text-sm text-muted-foreground w-12 shrink-0">
                  {formatD66Range(card.d66_min, card.d66_max)}
                </span>
                <span className="text-sm font-medium text-foreground">{card.name}</span>
                {isOwned && (
                  <span className="ml-auto text-xs text-muted-foreground">Already added</span>
                )}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
