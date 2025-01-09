'use client';

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { createClient } from "@/utils/supabase/client";

interface Fighter {
  id: string;
  fighter_name: string;
  credits: number;
}

export interface StashItem {
  id: string;
  equipment_name: string;
  cost: number;
}

interface GangStashModalProps {
  onClose: () => void;
  stash: StashItem[];
  fighters: Fighter[];
  onStashUpdate?: (updatedStash: StashItem[]) => void;
  onFighterUpdate?: (fighterId: string, newCredits: number) => void;
}

export default function GangStashModal({ 
  onClose, 
  stash, 
  fighters,
  onStashUpdate,
  onFighterUpdate 
}: GangStashModalProps) {
  const [selectedItem, setSelectedItem] = useState<number | null>(null);
  const [selectedFighter, setSelectedFighter] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [session, setSession] = useState<any>(null);

  React.useEffect(() => {
    const getSession = async () => {
      const supabase = createClient();
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      setSession(currentSession);
    };
    getSession();
  }, []);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleRadioChange = (index: number) => {
    setSelectedItem(index);
  };

  const handleMoveToFighter = async () => {
    if (!selectedFighter || selectedItem === null) return false;

    setIsLoading(true);
    try {
      const stashItem = stash[selectedItem];
      
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/move_from_stash`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            p_stash_id: stashItem.id,
            p_fighter_id: selectedFighter
          })
        }
      );

      if (!response.ok) throw new Error('Failed to move equipment from stash');

      const data = await response.json();

      const updatedStash = stash.filter((_, index) => index !== selectedItem);
      if (onStashUpdate) {
        onStashUpdate(updatedStash);
      }

      if (onFighterUpdate) {
        const selectedFighterData = fighters.find(f => f.id === selectedFighter);
        if (selectedFighterData) {
          const newCredits = selectedFighterData.credits + stashItem.cost;
          onFighterUpdate(selectedFighter, newCredits);
        }
      }

      toast({
        title: "Success",
        description: `${stashItem.equipment_name} moved to fighter's equipment`,
      });

      setSelectedItem(null);
      setSelectedFighter('');
      return true;
    } catch (error) {
      console.error('Error moving item:', error);
      toast({
        description: 'Failed to move item',
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={handleOverlayClick}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <h3 className="text-2xl font-bold text-gray-900">Gang Stash</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl"
          >
            ×
          </button>
        </div>
        
        <div className="overflow-y-auto flex-grow">
          {stash.length === 0 ? (
            <div className="p-4">
              <p className="text-gray-500 italic">No items in stash</p>
            </div>
          ) : (
            <>
              <div className="mb-4">
                <div className="flex items-center text-sm font-medium text-gray-700 px-4 py-2">
                  <div className="w-4 mr-3" />
                  <div className="flex-grow">Equipment Name</div>
                  <div>Value</div>
                </div>
                <div className="space-y-2 px-4">
                  {stash.map((item, index) => (
                    <div 
                      key={index}
                      className="flex items-center p-2 bg-gray-50 rounded-md"
                    >
                      <input
                        type="radio"
                        name="stash-item"
                        checked={selectedItem === index}
                        onChange={() => handleRadioChange(index)}
                        className="h-4 w-4 border-gray-300 text-black focus:ring-black mr-3"
                      />
                      <span className="flex-grow">{item.equipment_name}</span>
                      <span>{item.cost}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="px-4">
                <div className="border-t pt-4">
                  <label htmlFor="fighter-select" className="block text-sm font-medium text-gray-700 mb-2">
                    Select Fighter
                  </label>
                  <select
                    id="fighter-select"
                    value={selectedFighter}
                    onChange={(e) => setSelectedFighter(e.target.value)}
                    className="w-full p-2 border rounded-md border-gray-300 focus:outline-none focus:ring-2 focus:ring-black"
                  >
                    <option value="">Select a fighter</option>
                    {fighters.map((fighter) => (
                      <option key={fighter.id} value={fighter.id}>
                        {fighter.fighter_name} ({fighter.credits} credits)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-2 mt-4 pb-4">
                  <Button
                    onClick={onClose}
                    variant="outline"
                    className="px-6"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleMoveToFighter}
                    disabled={selectedItem === null || !selectedFighter || isLoading}
                    className="bg-black hover:bg-gray-800 text-white px-6"
                  >
                    Move to Fighter
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
} 