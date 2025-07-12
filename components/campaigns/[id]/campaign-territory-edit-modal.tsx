'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/modal';
import { Checkbox } from '@/components/ui/checkbox';

interface TerritoryEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (updates: {
    ruined: boolean;
    default_gang_territory: boolean;
  }) => void;
  territoryName: string;
  currentRuined: boolean;
  currentDefaultGangTerritory: boolean;
}

export default function TerritoryEditModal({
  isOpen,
  onClose,
  onConfirm,
  territoryName,
  currentRuined,
  currentDefaultGangTerritory,
}: TerritoryEditModalProps) {
  const [ruined, setRuined] = useState(currentRuined);
  const [defaultGangTerritory, setDefaultGangTerritory] = useState(
    currentDefaultGangTerritory
  );
  const [hasChanged, setHasChanged] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setRuined(currentRuined);
      setDefaultGangTerritory(currentDefaultGangTerritory);
      setHasChanged(false);
    }
  }, [isOpen, currentRuined, currentDefaultGangTerritory]);

  // Track changes
  useEffect(() => {
    setHasChanged(
      ruined !== currentRuined ||
        defaultGangTerritory !== currentDefaultGangTerritory
    );
  }, [
    ruined,
    currentRuined,
    defaultGangTerritory,
    currentDefaultGangTerritory,
  ]);

  const handleConfirm = () => {
    onConfirm({ ruined, default_gang_territory: defaultGangTerritory });
    return true;
  };

  const modalContent = (
    <div className="space-y-4">
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
          onCheckedChange={(checked) =>
            setDefaultGangTerritory(checked === true)
          }
        />
        <label
          htmlFor="default-gang-territory-checkbox"
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
        >
          Default Gang Territory
        </label>
      </div>
    </div>
  );

  return (
    <Modal
      title="Edit Territory"
      helper={`Modify settings for ${territoryName}`}
      content={modalContent}
      onClose={onClose}
      onConfirm={handleConfirm}
      confirmText="Update Territory"
      confirmDisabled={!hasChanged}
    />
  );
}
