'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Tooltip } from 'react-tooltip';
import { BiSolidNotepad } from 'react-icons/bi';
import { LuSquarePen, LuTrash2 } from 'react-icons/lu';
import Modal from '@/components/ui/modal';
import TacticsCardPickerModal from '@/components/gang/tactics-card-picker-modal';
import { Textarea } from '@/components/ui/textarea';
import { List, ListAction, ListColumn } from '@/components/ui/list';
import { renderDescriptionTooltip } from '@/components/ui/tooltip-renderers';
import { UserPermissions } from '@/types/user-permissions';
import {
  compareTacticsCards,
  formatD66Range,
  normaliseTacticsDescription,
  TACTICS_DESCRIPTION_CHAR_LIMIT,
  type GangTacticsCard
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
  const [editCard, setEditCard] = useState<GangTacticsCard | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [deleteCard, setDeleteCard] = useState<GangTacticsCard | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canEdit = userPermissions.canEdit;

  const ownedCardIds = useMemo(
    () => new Set(tacticsCards.map(card => card.tactics_cards_id)),
    [tacticsCards]
  );

  const handleAdd = async (cardIds: string[]) => {
    if (cardIds.length === 0) return false;

    setIsSubmitting(true);
    try {
      const result = await addGangTacticsCards({ gangId, tacticsCardIds: cardIds });

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
        onAdd={() => setIsAddModalOpen(true)}
        addButtonText="Add"
        addButtonDisabled={!canEdit}
        emptyMessage="No gang tactics yet."
        sortBy={compareTacticsCards}
      />

      {isAddModalOpen && (
        <TacticsCardPickerModal
          gangId={gangId}
          editionSlug={editionSlug}
          ownedCardIds={ownedCardIds}
          onConfirm={handleAdd}
          onClose={() => setIsAddModalOpen(false)}
          confirmDisabled={isSubmitting}
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
              Remove <strong>{deleteCard.name}</strong>{' '}
              from this gang&apos;s tactics?
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
