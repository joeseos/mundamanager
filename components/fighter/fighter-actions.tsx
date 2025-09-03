'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { useToast } from "@/components/ui/use-toast";
import { SellFighterModal } from "@/components/fighter/sell-fighter";
import { UserPermissions } from '@/types/user-permissions';

interface Fighter {
  id: string;
  fighter_name: string;
  killed?: boolean;
  retired?: boolean;
  enslaved?: boolean;
  starved?: boolean;
  recovery?: boolean;
  captured?: boolean;
  credits: number;
  campaigns?: Array<{
    has_meat: boolean;
  }>;
}

interface Gang {
  id: string;
}

interface FighterActionsProps {
  fighter: Fighter;
  gang: Gang;
  fighterId: string;
  userPermissions: UserPermissions;
  onStatusUpdate: (params: { fighter_id: string; action: string; sell_value?: number }) => void;
}

interface ActionModals {
  delete: boolean;
  kill: boolean;
  retire: boolean;
  enslave: boolean;
  starve: boolean;
  recovery: boolean;
  captured: boolean;
}

export function FighterActions({ 
  fighter, 
  gang, 
  fighterId, 
  userPermissions,
  onStatusUpdate
}: FighterActionsProps) {
  const router = useRouter();
  const { toast } = useToast();
  
  const [modals, setModals] = useState<ActionModals>({
    delete: false,
    kill: false,
    retire: false,
    enslave: false,
    starve: false,
    recovery: false,
    captured: false
  });

  // Keep meat-checking functionality
  const isMeatEnabled = useCallback(() => {
    return fighter?.campaigns?.some(campaign => campaign.has_meat) ?? false;
  }, [fighter?.campaigns]);

  const handleModalToggle = (modalName: keyof ActionModals, value: boolean) => {
    setModals(prev => ({
      ...prev,
      [modalName]: value
    }));
  };

  const handleDeleteFighter = useCallback(async () => {
    if (!fighter || !gang) return;

    try {
      const result = await editFighterStatus({
        fighter_id: fighter.id,
        action: 'delete'
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete fighter');
      }

      toast({
        description: `${fighter.fighter_name} has been successfully deleted.`,
        variant: "default"
      });

      // Navigate to the gang page as returned by the server action
      if (result.data?.redirectTo) {
        router.push(result.data.redirectTo);
      } else {
        router.push(`/gang/${gang.id}`);
      }
    } catch (error) {
      console.error('Error deleting fighter:', {
        error,
        fighterId: fighter.id,
        fighterName: fighter.fighter_name
      });

      const message = error instanceof Error
        ? error.message
        : 'An unexpected error occurred. Please try again.';

      toast({
        title: "Error",
        description: message,
        variant: "destructive"
      });
    } finally {
      setModals(prev => ({
        ...prev,
        delete: false
      }));
    }
  }, [fighter, gang, toast, router]);

  const handleActionConfirm = async (action: 'kill' | 'retire' | 'sell' | 'rescue' | 'starve' | 'recover' | 'capture', sellValue?: number) => {
    // Use the TanStack Query mutation for optimistic updates
    onStatusUpdate({
      fighter_id: fighterId,
      action,
      sell_value: action === 'sell' ? sellValue : undefined
    });

    return true;
  };

  return (
    <>
      {/* Action buttons */}
      <div className="mt-6">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="default"
            className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => handleModalToggle('kill', true)}
            disabled={!userPermissions.canEdit}
          >
            {fighter?.killed ? 'Resurrect Fighter' : 'Kill Fighter'}
          </Button>
          <Button
            variant={fighter?.retired ? 'success' : 'default'}
            className="flex-1"
            onClick={() => handleModalToggle('retire', true)}
            disabled={!userPermissions.canEdit}
          >
            {fighter?.retired ? 'Unretire Fighter' : 'Retire Fighter'}
          </Button>
          <Button
            variant={fighter?.enslaved ? 'success' : 'default'}
            className="flex-1"
            onClick={() => handleModalToggle('enslave', true)}
            disabled={!userPermissions.canEdit}
          >
            {fighter?.enslaved ? 'Rescue from Guilders' : 'Sell to Guilders'}
          </Button>
          {isMeatEnabled() && (
            <Button
              variant={fighter?.starved ? 'success' : 'default'}
              className="flex-1"
              onClick={() => handleModalToggle('starve', true)}
              disabled={!userPermissions.canEdit}
            >
              {fighter?.starved ? 'Feed Fighter' : 'Starve Fighter'}
            </Button>
          )}
          <Button
            variant={fighter?.recovery ? 'success' : 'default'}
            className="flex-1"
            onClick={() => handleModalToggle('recovery', true)}
            disabled={!userPermissions.canEdit}
          >
            {fighter?.recovery ? 'Recover Fighter' : 'Send to Recovery'}
          </Button>
          <Button
            variant={fighter?.captured ? 'success' : 'default'}
            className="flex-1"
            onClick={() => handleModalToggle('captured', true)}
            disabled={!userPermissions.canEdit}
          >
            {fighter?.captured ? 'Rescue Fighter' : 'Capture Fighter'}
          </Button>
          
          <Button
            variant="destructive"
            className="flex-1"
            onClick={() => handleModalToggle('delete', true)}
            disabled={!userPermissions.canEdit}
          >
            Delete Fighter
          </Button>
        </div>
      </div>

      {/* Action modals */}
      {modals.delete && (
        <Modal
          title="Delete Fighter"
          content={
            <div>
              <p>Are you sure you want to delete <strong>{fighter?.fighter_name}</strong>?</p>
              <br />
              <p className="text-sm text-red-600">
                This action cannot be undone.
              </p>
            </div>
          }
          onClose={() => handleModalToggle('delete', false)}
          onConfirm={handleDeleteFighter}
        />
      )}

      {modals.kill && (
        <Modal
          title={fighter?.killed ? "Resurrect Fighter" : "Kill Fighter"}
          content={
            <div>
              <p>
                {fighter?.killed 
                  ? `Are you sure you want to resurrect "${fighter?.fighter_name}"?`
                  : `Are you sure you want to kill "${fighter?.fighter_name}"?`
                }
              </p>
            </div>
          }
          onClose={() => handleModalToggle('kill', false)}
          onConfirm={() => {
            handleActionConfirm('kill');
            handleModalToggle('kill', false);
          }}
        />
      )}

      {modals.retire && (
        <Modal
          title={fighter?.retired ? "Unretire Fighter" : "Retire Fighter"}
          content={
            <div>
              <p>
                {fighter?.retired 
                  ? `Are you sure you want to unretire "${fighter?.fighter_name}"?`
                  : `Are you sure you want to retire "${fighter?.fighter_name}"?`
                }
              </p>
            </div>
          }
          onClose={() => handleModalToggle('retire', false)}
          onConfirm={() => {
            handleActionConfirm('retire');
            handleModalToggle('retire', false);
          }}
        />
      )}

      {modals.enslave && (
        <SellFighterModal
          isOpen={modals.enslave}
          onClose={() => handleModalToggle('enslave', false)}
          fighterName={fighter?.fighter_name || ''}
          fighterValue={fighter?.credits || 0}
          isEnslaved={fighter?.enslaved || false}
          onConfirm={(sellValue) => {
            const action = fighter?.enslaved ? 'rescue' : 'sell';
            handleActionConfirm(action, sellValue);
            handleModalToggle('enslave', false);
            return true;
          }}
        />
      )}

      {modals.starve && (
        <Modal
          title={fighter?.starved ? "Feed Fighter" : "Starve Fighter"}
          content={
            <div>
              <p>
                {fighter?.starved 
                  ? `Are you sure you want to feed "${fighter?.fighter_name}"?`
                  : `Are you sure you want to starve "${fighter?.fighter_name}"?`
                }
              </p>
            </div>
          }
          onClose={() => handleModalToggle('starve', false)}
          onConfirm={() => {
            handleActionConfirm('starve');
            handleModalToggle('starve', false);
          }}
        />
      )}

      {modals.recovery && (
        <Modal
          title={fighter?.recovery ? "Recover Fighter" : "Send to Recovery"}
          content={
            <div>
              <p>
                {fighter?.recovery 
                  ? `Are you sure you want to recover "${fighter?.fighter_name}" from the recovery bay?`
                  : `Are you sure you want to send "${fighter?.fighter_name}" to the recovery bay?`
                }
              </p>
            </div>
          }
          onClose={() => handleModalToggle('recovery', false)}
          onConfirm={() => {
            handleActionConfirm('recover');
            handleModalToggle('recovery', false);
          }}
        />
      )}

      {modals.captured && (
        <Modal
          title={fighter?.captured ? "Rescue Fighter" : "Capture Fighter"}
          content={
            <div>
              <p>
                {fighter?.captured 
                  ? `Are you sure you want to rescue "${fighter?.fighter_name}" from captivity?`
                  : `Are you sure you want to mark "${fighter?.fighter_name}" as captured?`
                }
              </p>
            </div>
          }
          onClose={() => handleModalToggle('captured', false)}
          onConfirm={() => {
            handleActionConfirm('capture');
            handleModalToggle('captured', false);
          }}
        />
      )}
    </>
  );
}