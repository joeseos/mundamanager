'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Tooltip } from 'react-tooltip';
import { BiSolidNotepad } from 'react-icons/bi';
import { LuSquarePen, LuTrash2 } from 'react-icons/lu';
import Modal from '@/components/ui/modal';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { List, ListAction, ListColumn } from '@/components/ui/list';
import { renderDescriptionTooltip } from '@/components/ui/tooltip-renderers';
import { UserPermissions } from '@/types/user-permissions';
import {
  compareTacticsCards,
  formatD66Range,
  normaliseTacticsDescription,
  TACTICS_DESCRIPTION_CHAR_LIMIT,
  type GangTacticsCard,
  type TacticsCard
} from '@/types/tactics-card';
import {
  addGangTacticsCards,
  deleteGangTacticsCard,
  updateGangTacticsCardDescription
} from '@/app/actions/gang-tactics-cards';

interface GangTacticsCardsProps {
  gangId: string;
  editionSlug?: string | null;
  tacticsCards: GangTacticsCard[];
  /** Tab bodies unmount on switch, so the list itself lives in the page. */
  onTacticsCardsUpdate: (cards: GangTacticsCard[]) => void;
  userPermissions: UserPermissions;
}

const TOOLTIP_ID = 'gang-tactics-description-tooltip';

export default function GangTacticsCards({
  gangId,
  editionSlug,
  tacticsCards,
  onTacticsCardsUpdate,
  userPermissions
}: GangTacticsCardsProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [editCard, setEditCard] = useState<GangTacticsCard | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [deleteCard, setDeleteCard] = useState<GangTacticsCard | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canEdit = userPermissions.canEdit;

  const ownedCardIds = useMemo(
    () => new Set(tacticsCards.map(card => card.tactics_cards_id)),
    [tacticsCards]
  );

  // Only fetched once the Add modal is opened.
  const { data: catalogue = [], isLoading: isLoadingCatalogue, error: catalogueError } = useQuery<TacticsCard[]>({
    queryKey: ['tactics-cards', editionSlug],
    queryFn: async () => {
      const response = await fetch(`/api/tactics-cards?edition_slug=${editionSlug}`);
      if (!response.ok) throw new Error('Failed to fetch tactics cards');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: isAddModalOpen && !!editionSlug
  });

  const handleOpenAddModal = () => {
    setSelectedCardIds(new Set());
    setIsAddModalOpen(true);
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

  const handleAdd = async () => {
    if (selectedCardIds.size === 0) return false;

    setIsSubmitting(true);
    try {
      const result = await addGangTacticsCards({
        gangId,
        tacticsCardIds: Array.from(selectedCardIds)
      });

      if (!result.success) throw new Error(result.error);

      const added = result.data ?? [];
      // Re-adding an existing card is a server-side no-op, so merge rather than append.
      const byId = new Map(tacticsCards.map(card => [card.id, card]));
      added.forEach(card => byId.set(card.id, card));
      onTacticsCardsUpdate(Array.from(byId.values()));

      toast.success(added.length === 1 ? 'Tactics card added' : `${added.length} tactics cards added`);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add tactics cards');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEditModal = (card: GangTacticsCard) => {
    setEditCard(card);
    setEditDescription(card.description ?? '');
  };

  const isEditOverLimit = editDescription.length > TACTICS_DESCRIPTION_CHAR_LIMIT;
  const hasEditChanged =
    !!editCard &&
    normaliseTacticsDescription(editDescription) !== normaliseTacticsDescription(editCard.description);

  const handleSaveDescription = async () => {
    if (!editCard) return false;

    if (isEditOverLimit) {
      toast.error(`Description cannot exceed ${TACTICS_DESCRIPTION_CHAR_LIMIT} characters`);
      return false;
    }

    const description = normaliseTacticsDescription(editDescription);

    setIsSubmitting(true);
    try {
      const result = await updateGangTacticsCardDescription({
        gangId,
        gangTacticsCardId: editCard.id,
        description
      });

      if (!result.success) throw new Error(result.error);

      onTacticsCardsUpdate(
        tacticsCards.map(card => (card.id === editCard.id ? { ...card, description } : card))
      );
      toast.success('Description updated');
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update description');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteCard) return false;

    setIsSubmitting(true);
    try {
      const result = await deleteGangTacticsCard({
        gangId,
        gangTacticsCardId: deleteCard.id
      });

      if (!result.success) throw new Error(result.error);

      onTacticsCardsUpdate(tacticsCards.filter(card => card.id !== deleteCard.id));
      toast.success(`${deleteCard.name} removed`);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove tactics card');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: ListColumn[] = [
    {
      key: 'd66',
      label: 'D66',
      align: 'center',
      width: '4rem',
      cellClassName: 'tabular-nums text-muted-foreground',
      render: (_value, item: GangTacticsCard) => formatD66Range(item.d66_min, item.d66_max)
    },
    { key: 'name', label: 'Name', align: 'left' },
    {
      key: 'description',
      label: 'Desc.',
      align: 'left',
      width: '5%',
      render: (_value, item: GangTacticsCard) =>
        item.description?.trim() ? (
          <span
            className="inline-flex text-muted-foreground hover:text-foreground cursor-help"
            data-tooltip-id={TOOLTIP_ID}
            data-tooltip-title={item.name}
            data-tooltip-description={item.description}
          >
            <BiSolidNotepad className="h-4 w-4 inline" aria-label="View tactics card description" />
          </span>
        ) : null
    }
  ];

  const actions: ListAction[] = [
    {
      icon: <LuSquarePen className="h-4 w-4" />,
      title: 'Edit',
      variant: 'outline',
      size: 'sm',
      onClick: (item: GangTacticsCard) => handleOpenEditModal(item),
      disabled: () => !canEdit || isSubmitting
    },
    {
      icon: <LuTrash2 className="h-4 w-4" />,
      title: 'Delete',
      variant: 'outline_remove',
      size: 'sm',
      onClick: (item: GangTacticsCard) => setDeleteCard(item),
      disabled: () => !canEdit || isSubmitting
    }
  ];

  return (
    <>
      <List<GangTacticsCard>
        title="Gang Tactics"
        className="mt-0"
        items={tacticsCards}
        columns={columns}
        actions={actions}
        onAdd={handleOpenAddModal}
        addButtonText="Add"
        addButtonDisabled={!canEdit}
        emptyMessage="No gang tactics yet."
        sortBy={compareTacticsCards}
      />

      {isAddModalOpen && (
        <Modal
          title="Add Gang Tactics"
          helper="Pick the tactics cards this gang holds."
          content={
            <div>
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
          }
          onClose={() => setIsAddModalOpen(false)}
          onConfirm={handleAdd}
          confirmText="Add"
          confirmDisabled={selectedCardIds.size === 0 || isSubmitting}
          width="lg"
        />
      )}

      {editCard && (
        <Modal
          title="Edit Tactics Card"
          helper={`Description for ${editCard.name}`}
          content={
            <div>
              <label
                htmlFor="gang-tactics-description"
                className="flex justify-between items-center text-sm font-medium text-muted-foreground mb-1"
              >
                <span>Description</span>
                <span className={`text-sm ${isEditOverLimit ? 'text-red-500' : 'text-muted-foreground'}`}>
                  {editDescription.length}/{TACTICS_DESCRIPTION_CHAR_LIMIT} characters
                </span>
              </label>
              <Textarea
                id="gang-tactics-description"
                className="min-h-[200px] resize-y"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Enter the card's rules text or your own notes..."
              />
            </div>
          }
          onClose={() => setEditCard(null)}
          onConfirm={handleSaveDescription}
          confirmText="Save"
          confirmDisabled={!hasEditChanged || isEditOverLimit || isSubmitting}
          width="2xl"
        />
      )}

      {deleteCard && (
        <Modal
          title="Remove Tactics Card"
          content={
            <p>
              Remove <strong>{deleteCard.name}</strong> from this gang&apos;s tactics?
            </p>
          }
          onClose={() => setDeleteCard(null)}
          onConfirm={handleDelete}
          confirmText="Remove"
          confirmDisabled={isSubmitting}
        />
      )}

      <Tooltip
        id={TOOLTIP_ID}
        place="top"
        className="bg-neutral-900! text-white! text-xs! z-[2000]!"
        delayHide={100}
        clickable={true}
        render={renderDescriptionTooltip}
        style={{
          padding: '6px',
          width: '24rem',
          maxWidth: '90vw',
          maxHeight: '60vh'
        }}
      />
    </>
  );
}
