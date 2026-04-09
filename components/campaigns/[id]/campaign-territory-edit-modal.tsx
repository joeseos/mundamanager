'use client'

import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import Modal from "@/components/ui/modal"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Combobox } from "@/components/ui/combobox"
import { ImInfo } from "react-icons/im"
import { Tooltip } from "react-tooltip"
import {
  TERRITORY_PLAYING_CARD_NONE,
  TERRITORY_PLAYING_CARD_CUSTOM,
  territoryPlayingCardEditOptions,
  parseStandardPlayingCard
} from "@/utils/campaigns/territory-playing-card-options"

interface TerritoryEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (updates: {
    ruined: boolean;
    default_gang_territory: boolean;
    playing_card: string | null;
    description: string | null;
  }) => void;
  territoryName: string;
  currentRuined: boolean;
  currentDefaultGangTerritory: boolean;
  currentPlayingCard?: string | null;
  currentDescription?: string | null;
  groupedTerritories?: Array<{
    id: string;
    territory_name: string;
    playing_card?: string | null;
    description?: string | null;
  }>;
  selectedTerritoryId?: string;
  onSelectTerritory?: (territoryId: string) => void;
  isUpdating?: boolean;
}

function normalisePlayingCard(value: string | null | undefined): string | null {
  const t = typeof value === 'string' ? value.trim() : '';
  return t ? t : null;
}

function deriveInitialPlayingCardSelection(currentPlayingCard: string | null | undefined): {
  selectedRef: string;
  customPlayingCard: string;
} {
  const raw = normalisePlayingCard(currentPlayingCard);
  if (!raw) {
    return { selectedRef: TERRITORY_PLAYING_CARD_NONE, customPlayingCard: '' };
  }
  if (parseStandardPlayingCard(raw)) {
    return { selectedRef: raw, customPlayingCard: '' };
  }
  return { selectedRef: TERRITORY_PLAYING_CARD_CUSTOM, customPlayingCard: raw };
}

function normaliseDescription(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

const TERRITORY_DESCRIPTION_CHAR_LIMIT = 1500;

export default function TerritoryEditModal({
  isOpen,
  onClose,
  onConfirm,
  territoryName,
  currentRuined,
  currentDefaultGangTerritory,
  currentPlayingCard,
  currentDescription,
  groupedTerritories = [],
  selectedTerritoryId,
  onSelectTerritory,
  isUpdating = false
}: TerritoryEditModalProps) {
  const initialPlayingCard = deriveInitialPlayingCardSelection(currentPlayingCard);
  const [ruined, setRuined] = useState(currentRuined);
  const [defaultGangTerritory, setDefaultGangTerritory] = useState(currentDefaultGangTerritory);
  const [selectedRef, setSelectedRef] = useState(initialPlayingCard.selectedRef);
  const [customPlayingCard, setCustomPlayingCard] = useState(initialPlayingCard.customPlayingCard);
  const [description, setDescription] = useState(currentDescription || '');
  const [hasChanged, setHasChanged] = useState(false);

  const getCharCount = (htmlContent: string) => {
    const textContent = htmlContent.replace(/<[^>]*>/g, '');
    return textContent.length;
  };

  const effectivePlayingCard = useMemo(() => {
    if (selectedRef === TERRITORY_PLAYING_CARD_NONE) return null;
    if (selectedRef === TERRITORY_PLAYING_CARD_CUSTOM) {
      return normalisePlayingCard(customPlayingCard);
    }
    return selectedRef;
  }, [selectedRef, customPlayingCard]);

  // Reset state when modal opens/closes or the territory value changes
  useEffect(() => {
    if (isOpen) {
      const next = deriveInitialPlayingCardSelection(currentPlayingCard);
      setRuined(currentRuined);
      setDefaultGangTerritory(currentDefaultGangTerritory);
      setSelectedRef(next.selectedRef);
      setCustomPlayingCard(next.customPlayingCard);
      setDescription(currentDescription || '');
      setHasChanged(false);
    }
  }, [isOpen, currentRuined, currentDefaultGangTerritory, currentPlayingCard, currentDescription]);

  // Track changes
  useEffect(() => {
    setHasChanged(
      ruined !== currentRuined ||
      defaultGangTerritory !== currentDefaultGangTerritory ||
      normalisePlayingCard(effectivePlayingCard ?? undefined) !== normalisePlayingCard(currentPlayingCard) ||
      normaliseDescription(description) !== normaliseDescription(currentDescription)
    );
  }, [
    ruined,
    currentRuined,
    defaultGangTerritory,
    currentDefaultGangTerritory,
    effectivePlayingCard,
    currentPlayingCard,
    description,
    currentDescription
  ]);

  const comboboxValue =
    selectedRef === TERRITORY_PLAYING_CARD_CUSTOM
      ? TERRITORY_PLAYING_CARD_CUSTOM
      : selectedRef || TERRITORY_PLAYING_CARD_NONE;
  const isDescriptionOverLimit = getCharCount(description) > TERRITORY_DESCRIPTION_CHAR_LIMIT;

  const handleConfirm = () => {
    if (selectedRef === TERRITORY_PLAYING_CARD_CUSTOM && !customPlayingCard.trim()) {
      toast.error('Please enter a custom playing card value');
      return false;
    }

    const descriptionCharCount = getCharCount(description);
    if (descriptionCharCount > TERRITORY_DESCRIPTION_CHAR_LIMIT) {
      toast.error(`Description cannot exceed ${TERRITORY_DESCRIPTION_CHAR_LIMIT} characters`);
      return false;
    }

    onConfirm({
      ruined,
      default_gang_territory: defaultGangTerritory,
      playing_card: effectivePlayingCard,
      description: normaliseDescription(description)
    });
    return true;
  };

  const modalContent = (
    <div className="space-y-4">
      {groupedTerritories.length > 1 && (
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            Territories in this group
          </label>
          <Combobox
            value={selectedTerritoryId || groupedTerritories[0]?.id || ''}
            onValueChange={(value) => onSelectTerritory?.(value)}
            options={groupedTerritories.map((territory) => ({
              value: territory.id,
              label: territory.playing_card?.trim()
                ? `${territory.territory_name} • ${territory.playing_card.trim()}`
                : territory.territory_name,
              displayValue: territory.playing_card?.trim()
                ? `${territory.territory_name} ${territory.playing_card.trim()}`
                : territory.territory_name
            }))}
            placeholder="Select a territory to edit"
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">
          Playing card (Ref.)
        </label>
        <Combobox
          value={comboboxValue}
          onValueChange={(value) => {
            if (value === TERRITORY_PLAYING_CARD_NONE) {
              setSelectedRef(TERRITORY_PLAYING_CARD_NONE);
              setCustomPlayingCard('');
            } else if (value === TERRITORY_PLAYING_CARD_CUSTOM) {
              setSelectedRef(TERRITORY_PLAYING_CARD_CUSTOM);
              setCustomPlayingCard('');
            } else {
              setSelectedRef(value);
              setCustomPlayingCard('');
            }
          }}
          options={territoryPlayingCardEditOptions}
          placeholder="Select a playing card..."
        />
        {selectedRef === TERRITORY_PLAYING_CARD_CUSTOM && (
          <div className="mt-2">
            <Input
              type="text"
              className="w-full"
              placeholder="Enter custom playing card value"
              value={customPlayingCard}
              onChange={(e) => setCustomPlayingCard(e.target.value)}
            />
          </div>
        )}
      </div>
      
      <div className="flex items-center space-x-2">
        <Checkbox
          id="ruined-checkbox"
          checked={ruined}
          onCheckedChange={(checked) => setRuined(checked === true)}
        />
        <label 
          htmlFor="ruined-checkbox" 
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
        >
          Mark as Ruined
        </label>
      </div>
      
      <div className="flex items-center space-x-2">
        <Checkbox
          id="default-gang-territory-checkbox"
          checked={defaultGangTerritory}
          onCheckedChange={(checked) => setDefaultGangTerritory(checked === true)}
        />
        <label 
          htmlFor="default-gang-territory-checkbox" 
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
        >
          Default Gang Territory
        </label>
      </div>

      {/* Description — layout aligned with campaign-edit-modal */}
      <div>
        <label className="flex justify-between items-center text-sm font-medium text-muted-foreground mb-1">
          <div className="flex items-center space-x-2">
            <span>Description</span>
            <span
              className="relative cursor-pointer text-muted-foreground hover:text-foreground"
              data-tooltip-id="territory-description-tooltip"
              data-tooltip-html={
                'The territory description is shown as a tooltip in the campaign territories list so participants can read notes about this territory.'
              }
            >
              <ImInfo />
            </span>
          </div>
          <span className={`text-sm ${isDescriptionOverLimit ? 'text-red-500' : 'text-muted-foreground'}`}>
            {description.length}/{TERRITORY_DESCRIPTION_CHAR_LIMIT} characters
          </span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full p-2 border rounded min-h-[200px]"
          placeholder="Enter territory description..."
        />
      </div>
    </div>
  );

  return (
    <>
      <Modal
        title="Edit Territory"
        helper={`Modify settings for ${territoryName}`}
        content={modalContent}
        onClose={onClose}
        onConfirm={handleConfirm}
        confirmText="Update Territory"
        confirmDisabled={!hasChanged || isUpdating || isDescriptionOverLimit}
        width="2xl"
      />
      <Tooltip
        id="territory-description-tooltip"
        place="top"
        className="!bg-neutral-900 !text-white !text-xs !z-[2000]"
        delayHide={100}
        clickable={true}
        style={{
          padding: '6px',
          maxWidth: '20rem'
        }}
      />
    </>
  );
}
