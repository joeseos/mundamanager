'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import Gang from "@/components/gang";
import GangStashModal from "@/components/gang-stash-modal";
import { StashItem } from './gang-stash-modal';
import { FighterProps } from '@/types/fighter';

interface GangPageContentProps {
  processedData: any;
  gangData: any;
}

export default function GangPageContent({ processedData, gangData }: GangPageContentProps) {
  const [showStashModal, setShowStashModal] = useState(false);
  const [stash, setStash] = useState(gangData.stash || []);
  const [fighters, setFighters] = useState<FighterProps[]>(processedData.fighters || []);

  const handleStashUpdate = (updatedStash: StashItem[]) => {
    setStash(updatedStash);
  };

  const handleFighterUpdate = (fighterId: string, newCredits: number) => {
    setFighters((prevFighters: FighterProps[]) => 
      prevFighters.map(fighter => 
        fighter.id === fighterId 
          ? { ...fighter, credits: newCredits }
          : fighter
      )
    );
  };

  return (
    <>
      <div className="container max-w-5xl w-full space-y-4">
        <Gang
          {...processedData}
          initialFighters={fighters}
          fighterTypes={processedData.fighterTypes}
          additionalButtons={
            <Button
              onClick={() => setShowStashModal(true)}
              className="mr-2"
            >
              Open Stash
            </Button>
          }
        />
      </div>
      
      {showStashModal && (
        <GangStashModal
          stash={stash}
          fighters={fighters}
          onClose={() => setShowStashModal(false)}
          onStashUpdate={handleStashUpdate}
          onFighterUpdate={handleFighterUpdate}
        />
      )}
    </>
  );
} 