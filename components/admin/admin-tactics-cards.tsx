'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from '@/components/ui/combobox';
import { toast } from 'sonner';
import { EditionSelect } from '@/components/edition-select';
import { compareTacticsCards, formatD66Range } from '@/types/tactics-card';

enum OperationType {
  POST = 'POST',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE'
}

type CategoryType = 'packs' | 'cards';

interface TacticsPack {
  id: string;
  name: string;
  edition_id: string;
  gang_type_id: string | null;
}

interface TacticsCardRow {
  id: string;
  name: string;
  d66_min: number | null;
  d66_max: number | null;
  tactics_cards_pack_id: string;
  edition_id: string;
}

interface GangType {
  gang_type_id: string;
  gang_type: string;
  edition_id?: string | null;
}

interface AdminTacticsCardsModalProps {
  onClose: () => void;
}

function packGangTypeName(pack: TacticsPack, gangTypes: GangType[]): string | undefined {
  if (pack.gang_type_id == null) return undefined;
  return gangTypes.find(gt => gt.gang_type_id === pack.gang_type_id)?.gang_type;
}

function packSelectOption(pack: TacticsPack, gangTypes: GangType[]) {
  const gangTypeName = packGangTypeName(pack, gangTypes);
  return {
    value: pack.id,
    label: gangTypeName ? (
      <span className="inline-flex items-baseline gap-1">
        <span>{pack.name}</span>
        <span className="text-xs text-muted-foreground">
          {`• ${gangTypeName}`}
        </span>
      </span>
    ) : pack.name,
    displayValue: gangTypeName ? `${pack.name} • ${gangTypeName}` : pack.name,
  };
}

function cardLabel(card: TacticsCardRow): string {
  const range = formatD66Range(card.d66_min, card.d66_max);
  return range === '-' ? card.name : `${card.name} (${range})`;
}

function parseD66Input(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : NaN;
}

export function AdminTacticsCardsModal({ onClose }: AdminTacticsCardsModalProps) {
  const queryClient = useQueryClient();

  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('packs');
  const [editionId, setEditionId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedPackId, setSelectedPackId] = useState('');
  const [packName, setPackName] = useState('');
  const [packGangTypeId, setPackGangTypeId] = useState('');
  const [isCreateModePack, setIsCreateModePack] = useState(false);

  const [selectedCardId, setSelectedCardId] = useState('');
  const [cardPackId, setCardPackId] = useState('');
  const [cardName, setCardName] = useState('');
  const [d66Min, setD66Min] = useState('');
  const [d66Max, setD66Max] = useState('');
  const [isCreateModeCard, setIsCreateModeCard] = useState(false);

  const { data: packs = [], isLoading: isLoadingPacks } = useQuery<TacticsPack[]>({
    queryKey: ['admin-tactics-cards-packs'],
    queryFn: async () => {
      const response = await fetch('/api/admin/tactics-cards-packs');
      if (!response.ok) throw new Error('Failed to fetch tactics card packs');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: cards = [], isLoading: isLoadingCards } = useQuery<TacticsCardRow[]>({
    queryKey: ['admin-tactics-cards'],
    queryFn: async () => {
      const response = await fetch('/api/admin/tactics-cards');
      if (!response.ok) throw new Error('Failed to fetch tactics cards');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: selectedCategory === 'cards',
  });

  const { data: gangTypes = [], isLoading: isLoadingGangTypes } = useQuery<GangType[]>({
    queryKey: ['admin-gang-types'],
    queryFn: async () => {
      const response = await fetch('/api/admin/gang-types');
      if (!response.ok) throw new Error('Failed to fetch gang types');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const isLoading =
    isLoadingPacks ||
    isLoadingGangTypes ||
    isSubmitting ||
    (selectedCategory === 'cards' && isLoadingCards);

  const filteredGangTypes = useMemo(
    () => editionId
      ? gangTypes.filter(gt => gt.edition_id === editionId)
      : gangTypes,
    [gangTypes, editionId]
  );

  const filteredPacks = useMemo(
    () => editionId
      ? packs.filter(pack => pack.edition_id === editionId)
      : packs,
    [packs, editionId]
  );

  const filteredCards = useMemo(() => {
    const byEdition = editionId
      ? cards.filter(card => card.edition_id === editionId)
      : cards;
    const byPack = cardPackId
      ? byEdition.filter(card =>
          card.tactics_cards_pack_id === cardPackId || card.id === selectedCardId
        )
      : byEdition;
    return [...byPack].sort(compareTacticsCards);
  }, [cards, editionId, cardPackId, selectedCardId]);

  const packSelectOptions = useMemo(
    () => filteredPacks.map((pack) => packSelectOption(pack, gangTypes)),
    [filteredPacks, gangTypes]
  );

  const gangTypeSelectOptions = useMemo(
    () => [
      { value: '', label: 'Core (All gangs)' },
      ...filteredGangTypes.map((gangType) => ({
        value: gangType.gang_type_id,
        label: gangType.gang_type,
      })),
    ],
    [filteredGangTypes]
  );

  const cardSelectOptions = useMemo(
    () => filteredCards.map((card) => ({
      value: card.id,
      label: cardLabel(card),
    })),
    [filteredCards]
  );

  const isPackFormDisabled = (!isCreateModePack && !selectedPackId) || isLoading;
  const isCardMetaDisabled = (!isCreateModeCard && !selectedCardId) || isLoading;
  const isCardFieldsDisabled = isCardMetaDisabled || (isCreateModeCard && !cardPackId);

  const d66MinValue = parseD66Input(d66Min);
  const d66MaxValue = parseD66Input(d66Max);
  const d66PairValid =
    (d66MinValue === null && d66MaxValue === null) ||
    (
      d66MinValue !== null &&
      d66MaxValue !== null &&
      !Number.isNaN(d66MinValue) &&
      !Number.isNaN(d66MaxValue) &&
      d66MinValue <= d66MaxValue
    );

  const canSubmitPack = Boolean(packName.trim() && editionId);
  const canSubmitCard = Boolean(cardName.trim() && cardPackId && d66PairValid);

  const clearPackFields = () => {
    setPackName('');
    setPackGangTypeId('');
  };

  const clearCardFields = () => {
    setCardName('');
    setD66Min('');
    setD66Max('');
  };

  const resetPackSelection = () => {
    setSelectedPackId('');
    clearPackFields();
    setIsCreateModePack(false);
  };

  const resetCardSelection = () => {
    setSelectedCardId('');
    setCardPackId('');
    clearCardFields();
    setIsCreateModeCard(false);
  };

  const handleCategoryChange = (category: CategoryType) => {
    if (category === selectedCategory) return;
    setSelectedCategory(category);
    resetPackSelection();
    resetCardSelection();
  };

  const handleEditionChange = (newEditionId: string) => {
    setEditionId(newEditionId);

    if (newEditionId && selectedPackId) {
      const pack = packs.find(p => p.id === selectedPackId);
      if (pack && pack.edition_id !== newEditionId) {
        resetPackSelection();
      }
    }

    if (packGangTypeId) {
      const selectedGangType = gangTypes.find(gt => gt.gang_type_id === packGangTypeId);
      if (selectedGangType && selectedGangType.edition_id !== newEditionId) {
        setPackGangTypeId('');
      }
    }

    if (newEditionId && selectedCardId) {
      const card = cards.find(c => c.id === selectedCardId);
      if (card && card.edition_id !== newEditionId) {
        resetCardSelection();
      }
    }

    if (cardPackId) {
      const pack = packs.find(p => p.id === cardPackId);
      if (pack && pack.edition_id !== newEditionId) {
        setCardPackId('');
        setSelectedCardId('');
        clearCardFields();
        setIsCreateModeCard(false);
      }
    }
  };

  const handlePackSelect = (packId: string) => {
    setSelectedPackId(packId);
    const pack = packs.find(p => p.id === packId);
    if (pack) {
      setPackName(pack.name);
      setPackGangTypeId(pack.gang_type_id ?? '');
      setEditionId(pack.edition_id ?? '');
      setIsCreateModePack(false);
    } else {
      clearPackFields();
      setIsCreateModePack(false);
    }
  };

  const handleCreateNewPack = () => {
    setSelectedPackId('');
    clearPackFields();
    setIsCreateModePack(true);
  };

  const handleCardSelect = (cardId: string) => {
    setSelectedCardId(cardId);
    const card = cards.find(c => c.id === cardId);
    if (card) {
      setCardPackId(card.tactics_cards_pack_id);
      setCardName(card.name);
      setD66Min(card.d66_min == null ? '' : String(card.d66_min));
      setD66Max(card.d66_max == null ? '' : String(card.d66_max));
      setEditionId(card.edition_id ?? '');
      setIsCreateModeCard(false);
    } else {
      clearCardFields();
      setIsCreateModeCard(false);
    }
  };

  const handleCreateNewCard = () => {
    setSelectedCardId('');
    clearCardFields();
    setIsCreateModeCard(true);
  };

  const invalidateTacticsQueries = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['admin-tactics-cards-packs'] }),
    queryClient.invalidateQueries({ queryKey: ['admin-tactics-cards'] }),
    queryClient.invalidateQueries({ queryKey: ['tactics-cards'] }),
  ]);

  const handleSubmitPack = async (operation: OperationType) => {
    if (
      (operation === OperationType.POST || operation === OperationType.UPDATE) &&
      (!packName.trim() || !editionId)
    ) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      let method: string;
      let body: string | undefined;

      switch (operation) {
        case OperationType.POST:
          method = 'POST';
          body = JSON.stringify({
            name: packName,
            edition_id: editionId,
            gang_type_id: packGangTypeId || null,
          });
          break;
        case OperationType.UPDATE:
          method = 'PATCH';
          body = JSON.stringify({
            id: selectedPackId,
            name: packName,
            edition_id: editionId,
            gang_type_id: packGangTypeId || null,
          });
          break;
        case OperationType.DELETE:
          method = 'DELETE';
          body = JSON.stringify({
            id: selectedPackId,
          });
          break;
        default:
          throw new Error('Invalid operation');
      }

      const response = await fetch('/api/admin/tactics-cards-packs', {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error ||
          `Failed to ${operation === OperationType.POST ? 'create' : operation === OperationType.UPDATE ? 'update' : 'delete'} pack`
        );
      }

      const resultData = operation === OperationType.DELETE
        ? null
        : await response.json();

      toast.success(
        `Pack ${operation === OperationType.POST ? 'created' : operation === OperationType.UPDATE ? 'updated' : 'deleted'} successfully`
      );

      await invalidateTacticsQueries();

      if (operation === OperationType.POST && resultData?.id) {
        setSelectedPackId(resultData.id);
        setIsCreateModePack(false);
        setPackName(resultData.name ?? packName);
        setPackGangTypeId(resultData.gang_type_id ?? '');
        setEditionId(resultData.edition_id ?? editionId);
      } else if (operation === OperationType.DELETE) {
        resetPackSelection();
      }
    } catch (error) {
      console.error(`Error executing ${operation} pack operation:`, error);
      toast.error(
        error instanceof Error
          ? error.message
          : `Failed to ${operation === OperationType.POST ? 'create' : operation === OperationType.UPDATE ? 'update' : 'delete'} pack`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitCard = async (operation: OperationType) => {
    if (
      (operation === OperationType.POST || operation === OperationType.UPDATE) &&
      (!cardName.trim() || !cardPackId || !d66PairValid)
    ) {
      toast.error(
        !d66PairValid
          ? 'D66 min and max must both be empty or both be integers with min less than or equal to max'
          : 'Please fill in all required fields'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      let method: string;
      let body: string | undefined;

      switch (operation) {
        case OperationType.POST:
          method = 'POST';
          body = JSON.stringify({
            name: cardName,
            tactics_cards_pack_id: cardPackId,
            d66_min: d66MinValue,
            d66_max: d66MaxValue,
          });
          break;
        case OperationType.UPDATE:
          method = 'PATCH';
          body = JSON.stringify({
            id: selectedCardId,
            name: cardName,
            tactics_cards_pack_id: cardPackId,
            d66_min: d66MinValue,
            d66_max: d66MaxValue,
          });
          break;
        case OperationType.DELETE:
          method = 'DELETE';
          body = JSON.stringify({
            id: selectedCardId,
          });
          break;
        default:
          throw new Error('Invalid operation');
      }

      const response = await fetch('/api/admin/tactics-cards', {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error ||
          `Failed to ${operation === OperationType.POST ? 'create' : operation === OperationType.UPDATE ? 'update' : 'delete'} card`
        );
      }

      const resultData = operation === OperationType.DELETE
        ? null
        : await response.json();

      toast.success(
        `Card ${operation === OperationType.POST ? 'created' : operation === OperationType.UPDATE ? 'updated' : 'deleted'} successfully`
      );

      await invalidateTacticsQueries();

      if (operation === OperationType.POST && resultData?.id) {
        setSelectedCardId(resultData.id);
        setIsCreateModeCard(false);
        setCardName(resultData.name ?? cardName);
        setCardPackId(resultData.tactics_cards_pack_id ?? cardPackId);
        setD66Min(resultData.d66_min == null ? '' : String(resultData.d66_min));
        setD66Max(resultData.d66_max == null ? '' : String(resultData.d66_max));
        setEditionId(resultData.edition_id ?? editionId);
      } else if (operation === OperationType.DELETE) {
        setSelectedCardId('');
        clearCardFields();
        setIsCreateModeCard(false);
      }
    } catch (error) {
      console.error(`Error executing ${operation} card operation:`, error);
      toast.error(
        error instanceof Error
          ? error.message
          : `Failed to ${operation === OperationType.POST ? 'create' : operation === OperationType.UPDATE ? 'update' : 'delete'} card`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const isCreateMode = selectedCategory === 'packs' ? isCreateModePack : isCreateModeCard;
  const selectedId = selectedCategory === 'packs' ? selectedPackId : selectedCardId;
  const canSubmit = selectedCategory === 'packs' ? canSubmitPack : canSubmitCard;
  const handleSubmit = selectedCategory === 'packs' ? handleSubmitPack : handleSubmitCard;
  const entityLabel = selectedCategory === 'packs' ? 'Pack' : 'Card';

  return (
    <div
      className="fixed inset-0 bg-black/50 dark:bg-neutral-700/50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card rounded-lg shadow-xl w-full max-w-2xl min-h-0 max-h-svh overflow-y-auto flex flex-col">
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <div>
            <h3 className="text-xl md:text-2xl font-bold text-foreground">Manage Tactics Cards</h3>
            <p className="text-sm text-muted-foreground">Create, edit, or delete tactics card packs and cards</p>
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
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Category
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={selectedCategory === 'packs' ? 'default' : 'outline'}
                  onClick={() => handleCategoryChange('packs')}
                  disabled={isLoading}
                  className={
                    selectedCategory === 'packs'
                      ? ''
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }
                >
                  Packs
                </Button>
                <Button
                  type="button"
                  variant={selectedCategory === 'cards' ? 'default' : 'outline'}
                  onClick={() => handleCategoryChange('cards')}
                  disabled={isLoading}
                  className={
                    selectedCategory === 'cards'
                      ? ''
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }
                >
                  Cards
                </Button>
              </div>
            </div>

            <EditionSelect value={editionId} onChange={handleEditionChange} defaultToCurrent />

            {selectedCategory === 'packs' && (
              <>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-muted-foreground">
                      Select Pack
                    </label>
                    <Button
                      onClick={handleCreateNewPack}
                      disabled={isLoading}
                      className="text-xs h-7 px-3"
                    >
                      Create New
                    </Button>
                  </div>
                  <Combobox
                    value={selectedPackId}
                    onValueChange={handlePackSelect}
                    options={packSelectOptions}
                    placeholder="Select a pack to edit"
                    clearable
                    disabled={isLoading}
                    showLabelWhenClosed
                  />
                  {isCreateModePack && (
                    <p className="text-xs text-amber-600 mt-1">
                      Creating new pack. Select from dropdown to cancel and edit existing.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Pack Name *
                  </label>
                  <Input
                    type="text"
                    value={packName}
                    onChange={(e) => setPackName(e.target.value)}
                    placeholder="E.g. Core Gang Tactics"
                    className="w-full"
                    disabled={isPackFormDisabled}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Gang Type
                  </label>
                  <Combobox
                    value={packGangTypeId}
                    onValueChange={setPackGangTypeId}
                    options={gangTypeSelectOptions}
                    placeholder="Core (All gangs)"
                    disabled={isPackFormDisabled}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Core (All gangs) is the edition default deck. House packs should use the parent gang type so alternate lists inherit them.
                  </p>
                </div>
              </>
            )}

            {selectedCategory === 'cards' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Pack *
                  </label>
                  <Combobox
                    value={cardPackId}
                    onValueChange={setCardPackId}
                    options={packSelectOptions}
                    placeholder="Select a pack"
                    clearable
                    disabled={isLoading}
                    showLabelWhenClosed
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-muted-foreground">
                      Select Card
                    </label>
                    <Button
                      onClick={handleCreateNewCard}
                      disabled={isLoading}
                      className="text-xs h-7 px-3"
                    >
                      Create New
                    </Button>
                  </div>
                  <Combobox
                    value={selectedCardId}
                    onValueChange={handleCardSelect}
                    options={cardSelectOptions}
                    placeholder="Select a card to edit"
                    clearable
                    disabled={isLoading}
                  />
                  {isCreateModeCard && (
                    <p className="text-xs text-amber-600 mt-1">
                      Creating new card. Select from dropdown to cancel and edit existing.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Card Name *
                  </label>
                  <Input
                    type="text"
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    placeholder="E.g. Point-blank Shot"
                    className="w-full"
                    disabled={isCardFieldsDisabled}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                      D66 Min
                    </label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={d66Min}
                      onChange={(e) => setD66Min(e.target.value)}
                      placeholder="E.g. 11"
                      className="w-full"
                      disabled={isCardFieldsDisabled}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                      D66 Max
                    </label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={d66Max}
                      onChange={(e) => setD66Max(e.target.value)}
                      placeholder="E.g. 12"
                      className="w-full"
                      disabled={isCardFieldsDisabled}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground -mt-2">
                  Leave both empty for unnumbered cards. If set, both are required and min must be less than or equal to max.
                </p>
              </>
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
              onClick={() => handleSubmit(OperationType.POST)}
              disabled={!canSubmit || isLoading}
              className="flex-1 bg-neutral-900 text-white rounded-sm hover:bg-gray-800"
            >
              {isLoading ? 'Creating...' : `Create ${entityLabel}`}
            </Button>
          )}

          {!isCreateMode && selectedId && (
            <>
              <Button
                onClick={() => handleSubmit(OperationType.UPDATE)}
                disabled={!canSubmit || isLoading}
                className="flex-1 bg-neutral-900 text-white rounded-sm hover:bg-gray-800"
              >
                {isLoading ? 'Updating...' : `Update ${entityLabel}`}
              </Button>
              <Button
                onClick={() => handleSubmit(OperationType.DELETE)}
                disabled={isLoading}
                className="flex-1 bg-red-600 text-white rounded-sm hover:bg-red-700"
              >
                {isLoading ? 'Deleting...' : `Delete ${entityLabel}`}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
