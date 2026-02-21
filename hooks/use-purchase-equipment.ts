'use client';

import { buyEquipmentForFighter } from '@/app/actions/equipment';
import { Equipment } from '@/types/equipment';
import { toast } from 'sonner';

// This is for the wrapper function to inject dependencies from the parent component.
export interface PurchaseEquipmentContext {
  session: { access_token: string } | null;
  gangId: string;
  fighterId?: string;
  vehicleId?: string;
  isVehicleEquipment?: boolean;
  isStashMode?: boolean;
  fighterCredits: number;
  onEquipmentBought?: (
    newFighterCredits: number,
    newGangCredits: number,
    boughtEquipment: Equipment,
    newGangRating?: number,
    newGangWealth?: number
  ) => void;
  onPurchaseRequest?: (payload: { params: BuyEquipmentPayload; item: Equipment }) => void;
  closePurchaseModal?: () => void;
}

export type EquipmentTarget = { target_equipment_id: string; effect_type_id: string };

export interface PurchaseEquipmentInput {
  item: Equipment;
  manualCost: number;
  isMasterCrafted?: boolean;
  useBaseCostForRating?: boolean;
  selectedEffectIds?: string[];
  equipmentTarget?: EquipmentTarget;
  selectedGrantEquipmentIds?: string[];
}

export interface BuyEquipmentPayload {
  equipment_id?: string;
  custom_equipment_id?: string;
  gang_id: string;
  manual_cost: number;
  master_crafted: boolean;
  use_base_cost_for_rating: boolean;
  buy_for_gang_stash: boolean;
  selected_effect_ids: string[];
  fighter_id?: string;
  vehicle_id?: string;
  equipment_target?: EquipmentTarget;
  listed_cost?: number;
  selected_grant_equipment_ids?: string[];
}

export function usePurchaseEquipment(deps: PurchaseEquipmentContext) {
  

  const purchaseEquipment = async ({
    item,
    manualCost,
    isMasterCrafted = false,
    useBaseCostForRating = true,
    selectedEffectIds = [],
    equipmentTarget,
    selectedGrantEquipmentIds = [],
  }: PurchaseEquipmentInput) => {
    const {
      session,
      gangId,
      fighterId,
      vehicleId,
      isVehicleEquipment,
      isStashMode,
      fighterCredits,
      onEquipmentBought,
      onPurchaseRequest,
      closePurchaseModal,
    } = deps;

    if (!session) return;

    // Determine if this is a gang stash purchase
    const isGangStashPurchase = Boolean(isStashMode || (!fighterId && !vehicleId));

    const params: BuyEquipmentPayload = {
      ...(item.is_custom ? { custom_equipment_id: item.equipment_id } : { equipment_id: item.equipment_id }),
      gang_id: gangId,
      manual_cost: manualCost,
      master_crafted: isMasterCrafted && item.equipment_type === 'weapon',
      use_base_cost_for_rating: useBaseCostForRating,
      buy_for_gang_stash: isGangStashPurchase,
      selected_effect_ids: selectedEffectIds,
      listed_cost: item.adjusted_cost ?? item.cost,

      // Only include fighter_id or vehicle_id if not buying for gang stash
      ...(!isGangStashPurchase &&
        (isVehicleEquipment ? { vehicle_id: vehicleId || undefined } : { fighter_id: fighterId || undefined })),

      ...(equipmentTarget?.target_equipment_id &&
        equipmentTarget?.effect_type_id && {
          equipment_target: equipmentTarget,
        }),

      ...(selectedGrantEquipmentIds.length > 0 && {
        selected_grant_equipment_ids: selectedGrantEquipmentIds,
      }),
    };

    // Optimistic path: delegate to parent (no server call here)
    if (onPurchaseRequest) {
      onPurchaseRequest({ params, item });
      closePurchaseModal?.();
      return;
    }

    try {
      const result = await buyEquipmentForFighter(params);
      if (!result.success) throw new Error(result.error || 'Failed to buy equipment');

      const data = result.data;
      const newGangCredits = data.updategangsCollection?.records?.[0]?.credits;
      const newGangRating = data.updategangsCollection?.records?.[0]?.rating;
      const newGangWealth = data.updategangsCollection?.records?.[0]?.wealth;

      const equipmentRecord = data.insertIntofighter_equipmentCollection?.records?.[0];
      if (!equipmentRecord) throw new Error('Failed to get equipment ID from response');

      const ratingCost = data.rating_cost;
      const serverPurchaseCost = data.purchase_cost ?? manualCost;

      const newFighterCredits = isGangStashPurchase ? fighterCredits : fighterCredits + ratingCost;

      onEquipmentBought?.(
        newFighterCredits,
        newGangCredits,
        {
          ...item,
          fighter_equipment_id: equipmentRecord.id,
          cost: ratingCost,
          is_master_crafted: equipmentRecord.is_master_crafted,
          equipment_name:
            equipmentRecord.is_master_crafted && item.equipment_type === 'weapon'
              ? `${item.equipment_name} (Master-crafted)`
              : item.equipment_name,
        },
        newGangRating,
        newGangWealth
      );

      toast.success('Equipment purchased', {
        description: `Successfully bought ${
          equipmentRecord.is_master_crafted && item.equipment_type === 'weapon'
            ? `${item.equipment_name} (Master-crafted)`
            : item.equipment_name
        } for ${serverPurchaseCost} credits`,
      });

      closePurchaseModal?.();
    } catch (err) {
      console.error('Error buying equipment:', err);
      toast.error('Error', { description: err instanceof Error ? err.message : 'Failed to buy equipment' });
    }
  };

  return { purchaseEquipment };
}

