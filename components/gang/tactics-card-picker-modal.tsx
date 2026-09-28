'use client';

/**
 * The "pick some Gang Tactics" modal: a pack selector, a D66 roller over the
 * active pack and a checkbox list of its cards.
 *
 * Shared by the Gang Tactics list and the Post-cycle Actions panel. It only
 * *chooses* cards — `onConfirm` decides what that means, so one caller saves
 * immediately and the other stashes the ids until the whole Post-cycle Sequence
 * resolves.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import Modal from '@/components/ui/modal';
import DiceRoller from '@/components/dice-roller';
import { Checkbox } from '@/components/ui/checkbox';
import { rollD66Outcome, type RollOutcome } from '@/utils/dice';
import { formatD66Range, type TacticsCard, type TacticsCardsPack } from '@/types/tactics-card';
import { verifyAndLogRolledTacticsCard } from '@/app/actions/gang-tactics-cards';

export interface TacticsCardPickerModalProps {
  gangId: string;
  /** Catalogue ids the gang already holds. Disabled, marked "Already added". */
  ownedCardIds: Set<string>;
  /**
   * Ids another row of the same batch has already claimed. Disabled, marked
   * "Picked this sequence". Kept separate from owned so the two reasons a card
   * is unavailable read differently.
   */
  reservedCardIds?: Set<string>;
  initialSelectedIds?: string[];
  /**
   * Receives the chosen ids and their catalogue rows. Return false to keep the
   * modal open, matching Modal's onConfirm contract.
   */
  onConfirm: (cardIds: string[], cards: TacticsCard[]) => Promise<boolean> | boolean;
  onClose: () => void;
  title?: string;
  helper?: string;
  confirmText?: string;
  confirmDisabled?: boolean;
}

const EMPTY_IDS: ReadonlySet<string> = new Set<string>();

export default function TacticsCardPickerModal({
  gangId,
  ownedCardIds,
  reservedCardIds,
  initialSelectedIds,
  onConfirm,
  onClose,
  title = 'Add Gang Tactics',
  helper = 'Pick the tactics cards this gang holds.',
  confirmText = 'Add',
  confirmDisabled = false
}: TacticsCardPickerModalProps) {
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(
    () => new Set(initialSelectedIds ?? [])
  );
  /** undefined until the user picks a pack: follow the initial selection until then. */
  const [selectedPackId, setSelectedPackId] = useState<string | null | undefined>(undefined);
  const [rollLogCooldown, setRollLogCooldown] = useState(false);

  const reserved = reservedCardIds ?? EMPTY_IDS;

  /** Unavailable for either reason — what the roller must never land on. */
  const unavailableCardIds = useMemo(
    () => new Set<string>([...ownedCardIds, ...reserved]),
    [ownedCardIds, reserved]
  );

  // The modal is only mounted while open, so mounting is what triggers the
  // fetch. Every pack arrives with its cards, so switching pack is local.
  const {
    data: packs = [],
    isLoading: isLoadingPacks,
    error: packsError
  } = useQuery<TacticsCardsPack[]>({
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
  // Reopening with cards already chosen shows the pack they came from.
  const initialPack = packs.find(pack =>
    pack.cards.some(card => initialSelectedIds?.includes(card.id))
  );
  // Each pack is its own D66 table, so one is active at a time and the roller
  // follows it.
  const activePack =
    selectedPackId === undefined
      ? initialPack ?? corePack
      : selectedPackId
        ? packs.find(pack => pack.id === selectedPackId)
        : corePack;
  const catalogue = activePack?.cards ?? [];

  const hasRollableCard = catalogue.some(
    card => card.d66_min != null && !unavailableCardIds.has(card.id)
  );

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
      card =>
        card.d66_min != null &&
        card.d66_max != null &&
        total >= card.d66_min &&
        total <= card.d66_max
    );

  const rollUnownedD66 = (): RollOutcome => {
    let outcome = rollD66Outcome();
    for (let attempt = 0; attempt < 50; attempt++) {
      const card = cardForRoll(outcome.total);
      // No match is a gap in the catalogue's ranges — report it rather than loop past it.
      if (!card || !unavailableCardIds.has(card.id)) return outcome;
      outcome = rollD66Outcome();
    }
    return outcome;
  };

  // Assigning one id is what makes "only one pack at a time" true. The card
  // selection goes with the list it was made in.
  const selectPack = (packId: string | null) => {
    setSelectedPackId(packId);
    setSelectedCardIds(new Set());
  };

  const toggleCard = (cardId: string) => {
    setSelectedCardIds(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  };

  return (
    <Modal
      title={title}
      helper={helper}
      content={
        <div>
          {selectablePacks.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2">
              {selectablePacks.map(pack => (
                <div key={pack.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`tactics-pack-${pack.id}`}
                    checked={activePack?.id === pack.id}
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
              rollFn={rollUnownedD66}
              buttonText="Roll D66"
              disabled={isLoadingPacks || !hasRollableCard}
              onRolled={(rolled) => {
                const result = rolled[0];
                const card = result?.item;
                if (!card) return;
                logRollWithCooldown({ total: result.roll, dice: result.dice });
                setSelectedCardIds(new Set([card.id]));
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
                const isReserved = !isOwned && reserved.has(card.id);
                const isDisabled = isOwned || isReserved;
                return (
                  <label
                    key={card.id}
                    htmlFor={`tactics-card-${card.id}`}
                    className={`flex items-center gap-3 px-3 py-[6px] ${
                      index !== catalogue.length - 1 ? 'border-b border-border' : ''
                    } ${isDisabled ? 'opacity-50' : 'hover:bg-muted cursor-pointer'} transition-colors`}
                  >
                    <Checkbox
                      id={`tactics-card-${card.id}`}
                      checked={isDisabled || selectedCardIds.has(card.id)}
                      disabled={isDisabled}
                      onCheckedChange={() => toggleCard(card.id)}
                    />
                    <span className="tabular-nums text-sm text-muted-foreground w-12 shrink-0">
                      {formatD66Range(card.d66_min, card.d66_max)}
                    </span>
                    <span className="text-sm font-medium text-foreground">{card.name}</span>
                    {isDisabled && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        {isOwned ? 'Already added' : 'Picked this sequence'}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      }
      onClose={onClose}
      onConfirm={() =>
        onConfirm(
          Array.from(selectedCardIds),
          packs.flatMap(pack => pack.cards).filter(card => selectedCardIds.has(card.id))
        )
      }
      confirmText={confirmText}
      confirmDisabled={selectedCardIds.size === 0 || confirmDisabled}
      width="lg"
    />
  );
}
