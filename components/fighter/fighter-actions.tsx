'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { useToast } from "@/components/ui/use-toast";
import { SellFighterModal } from "@/components/fighter/sell-fighter";
import { UserPermissions } from '@/types/user-permissions';
import { editFighterStatus } from "@/app/actions/edit-fighter";
import { useMutation } from '@tanstack/react-query';

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
  onFighterUpdate?: () => void;
  onStatusMutate?: (optimistic: Partial<Fighter>, gangCreditsDelta?: number) => any;
  onStatusError?: (snapshot: any) => void;
  onStatusSuccess?: () => void;
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
  onFighterUpdate,
  onStatusMutate,
  onStatusError,
  onStatusSuccess
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

  // TanStack mutation for fighter status updates
  const statusMutation = useMutation({
    mutationFn: async (variables: { action: 'kill' | 'retire' | 'sell' | 'rescue' | 'starve' | 'recover' | 'capture' | 'delete'; sell_value?: number }) => {
      const result = await editFighterStatus({ fighter_id: fighterId, ...variables });
      if (!result.success) throw new Error(result.error || 'Failed to update fighter status');
      return result;
    },
    onMutate: (vars) => {
      const optimistic: Partial<Fighter> = {};
      switch (vars.action) {
        case 'kill': optimistic.killed = !fighter.killed; break;
        case 'retire': optimistic.retired = !fighter.retired; break;
        case 'sell': optimistic.enslaved = true; break;
        case 'rescue': optimistic.enslaved = false; break;
        case 'starve': optimistic.starved = !fighter.starved; break;
        case 'recover': optimistic.recovery = !fighter.recovery; break;
        case 'capture': optimistic.captured = !fighter.captured; break;
      }
      const snapshot = onStatusMutate?.(optimistic, vars.action === 'sell' ? (vars.sell_value || 0) : undefined);
      const prevFlags = {
        killed: !!fighter.killed,
        retired: !!fighter.retired,
        enslaved: !!fighter.enslaved,
        starved: !!fighter.starved,
        recovery: !!fighter.recovery,
        captured: !!fighter.captured,
      };
      return { snapshot, prevFlags } as const;
    },
    onSuccess: (result, vars, ctx) => {
      if (result.data?.redirectTo) {
        router.push(result.data.redirectTo);
        return;
      }
      const prev = (ctx as any)?.prevFlags as {
        killed: boolean; retired: boolean; enslaved: boolean; starved: boolean; recovery: boolean; captured: boolean;
      } | undefined;
      let successMessage = 'Status updated';
      switch (vars.action) {
        case 'kill':
          successMessage = prev?.killed ? 'Fighter has been resurrected' : 'Fighter has been killed';
          break;
        case 'retire':
          successMessage = prev?.retired ? 'Fighter has been unretired' : 'Fighter has been retired';
          break;
        case 'sell':
          successMessage = `Fighter has been sold for ${vars.sell_value ?? 0} credits`;
          break;
        case 'rescue':
          successMessage = 'Fighter has been rescued from the Guilders';
          break;
        case 'starve':
          successMessage = prev?.starved ? 'Fighter has been fed' : 'Fighter has been starved';
          break;
        case 'recover':
          successMessage = prev?.recovery ? 'Fighter has been recovered from the recovery bay' : 'Fighter has been sent to the recovery bay';
          break;
        case 'capture':
          successMessage = prev?.captured ? 'Fighter has been rescued from captivity' : 'Fighter has been marked as captured';
          break;
      }
      toast({ description: successMessage });
      onFighterUpdate?.();
      onStatusSuccess?.();
    },
    onError: (error, _vars, ctx) => {
      toast({ description: error instanceof Error ? error.message : 'Failed to update fighter status', variant: 'destructive' });
      if (ctx && 'snapshot' in (ctx as any)) {
        onStatusError?.((ctx as any).snapshot);
      }
    }
  });

  // Delete handled via statusMutation; close modal immediately in onConfirm

  const handleActionConfirm = async (action: 'kill' | 'retire' | 'sell' | 'rescue' | 'starve' | 'recover' | 'capture', sellValue?: number) => {
    statusMutation.mutate({ action, sell_value: action === 'sell' ? sellValue : undefined });
    return true;
  };

  return (
    <>
      {/* Action buttons */}
      <div className="mt-6">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="default"
            className="flex-1 bg-neutral-900 text-white hover:bg-gray-800"
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
          onConfirm={async () => {
            // Use direct mutation to avoid TS narrowing of union in helper
            statusMutation.mutate({ action: 'delete' });
            const success = true;
            if (success) handleModalToggle('delete', false);
            return success;
          }}
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
          onConfirm={async () => {
            const success = await handleActionConfirm('kill');
            if (success) {
              handleModalToggle('kill', false);
            }
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
          onConfirm={async () => {
            const success = await handleActionConfirm('retire');
            if (success) {
              handleModalToggle('retire', false);
            }
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
          onConfirm={async (sellValue) => {
            const action = fighter?.enslaved ? 'rescue' : 'sell';
            const success = await handleActionConfirm(action, sellValue);
            if (success) {
              handleModalToggle('enslave', false);
            }
            return success;
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
          onConfirm={async () => {
            const success = await handleActionConfirm('starve');
            if (success) {
              handleModalToggle('starve', false);
            }
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
          onConfirm={async () => {
            const success = await handleActionConfirm('recover');
            if (success) {
              handleModalToggle('recovery', false);
            }
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
          onConfirm={async () => {
            const success = await handleActionConfirm('capture');
            if (success) {
              handleModalToggle('captured', false);
            }
          }}
        />
      )}
    </>
  );
}