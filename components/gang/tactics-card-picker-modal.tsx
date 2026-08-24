'use client';

/**
 * The "pick some Gang Tactics" modal: a D66 roller over the edition's catalogue
 * plus a checkbox list of every card in it.
 *
 * Extracted from gang-tactics-cards.tsx so the Post-cycle Actions panel can
 * offer the same surface for its Develop Tactics action. It only *chooses*
 * cards — `onConfirm` decides what that means, so one caller saves immediately
 * and the other stashes the ids until the whole Post-cycle Sequence resolves.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import Modal from '@/components/ui/modal';
import DiceRoller from '@/components/dice-roller';
import { Checkbox } from '@/components/ui/checkbox';
import { rollD66Outcome, type RollOutcome } from '@/utils/dice';
import { formatD66Range, type TacticsCard } from '@/types/tactics-card';
import { verifyAndLogRolledTacticsCard } from '@/app/actions/gang-tactics-cards';

export interface TacticsCardPickerModalProps {
  gangId: string;
  editionSlug?: string | null;
  /** Catalogue ids the gang already holds. Disabled, marked "Already added". */
  ownedCardIds: Set<string>;
  /**
   * Ids another row of the same batch has already claimed. Disabled, marked
   * "Picked this sequence". Kept separate from owned so the two reasons a card
   * is unavailable read differently.
   */
  reservedCardIds?: Set<string>;
  initialSelectedIds?: string[];
  /** Return false to keep the modal open, matching Modal's onConfirm contract. */
  onConfirm: (cardIds: string[]) => Promise<boolean> | boolean;
  onClose: () => void;
  title?: string;
  helper?: string;
  confirmText?: string;
  confirmDisabled?: boolean;
}

const EMPTY_IDS: ReadonlySet<string> = new Set<string>();

export default function TacticsCardPickerModal({
  gangId,
  editionSlug,
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
  const [rollLogCooldown, setRollLogCooldown] = useState(false);

  const reserved = reservedCardIds ?? EMPTY_IDS;

  /** Unavailable for either reason — what the roller must never land on. */
  const unavailableCardIds = useMemo(
    () => new Set<string>([...ownedCardIds, ...reserved]),
    [ownedCardIds, reserved]
  );

  // The modal is only mounted while open, so mounting is the gate the old
  // `isAddModalOpen` flag used to be. Key is shared with any other caller.
  const {
    data: catalogue = [],
    isLoading: isLoadingCatalogue,
    error: catalogueError
  } = useQuery<TacticsCard[]>({
    queryKey: ['tactics-cards', editionSlug],
    queryFn: async () => {
      const response = await fetch(`/api/tactics-cards?edition_slug=${editionSlug}`);
      if (!response.ok) throw new Error('Failed to fetch tactics cards');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!editionSlug
  });

  const hasRollableCard = catalogue.some(
    card => card.d66_min != null && !unavailableCardIds.has(card.id)
  );

  const logRollMutation = useMutation({
    mutationFn: (outcome: RollOutcome) =>
      verifyAndLogRolledTacticsCard({ gangId, total: outcome.total, dice: outcome.dice })
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
              disabled={isLoadingCatalogue || !hasRollableCard}
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
          {isLoadingCatalogue ? (
            <p className="text-muted-foreground italic text-center py-4">Loading tactics cards...</p>
          ) : catalogueError ? (
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
      onConfirm={() => onConfirm(Array.from(selectedCardIds))}
      confirmText={confirmText}
      confirmDisabled={selectedCardIds.size === 0 || confirmDisabled}
      width="lg"
    />
  );
}
