import React from 'react';
import { Button } from './ui/button';
import { Equipment, WeaponProfile } from '@/types/equipment';

interface FighterWeaponsTableProps {
  equipment: Equipment[];
  onDeleteEquipment: (fighterEquipmentId: string, equipmentId: string) => void;
  onSellEquipment: (fighterEquipmentId: string, equipmentId: string) => void;
  onStashEquipment: (fighterEquipmentId: string, equipmentId: string) => void;
  isLoading: boolean;
}

export function FighterWeaponsTable({ 
  equipment, 
  onDeleteEquipment, 
  onSellEquipment, 
  onStashEquipment, 
  isLoading 
}: FighterWeaponsTableProps) {
  const sortedEquipment = [...equipment].sort((a, b) => {
    if (a.core_equipment && !b.core_equipment) return -1;
    if (!a.core_equipment && b.core_equipment) return 1;
    return a.equipment_name.localeCompare(b.equipment_name);
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-200 animate-pulse rounded" />
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 bg-gray-100 animate-pulse rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full table-auto">
          {(equipment?.length > 0) && (
            <thead>
              <tr className="bg-gray-100">
                <th className="px-1 py-1 text-left">Name</th>
                <th className="px-1 py-1 text-right">Cost</th>
                <th className="px-1 py-1 text-right">Action</th>
              </tr>
            </thead>
          )}
          <tbody>
            {!equipment?.length ? (
              <tr>
                <td colSpan={3} className="text-center py-1 text-gray-500">
                  No equipment available
                </td>
              </tr>
            ) : (
              sortedEquipment.map((item) => (
                <tr 
                  key={item.fighter_equipment_id || `${item.equipment_id}-${item.equipment_name}`} 
                  className="border-b"
                >
                  <td className="px-1 py-1">
                    {item.equipment_name}
                  </td>
                  <td className="px-1 py-1 text-right">
                    {item.cost ?? '-'}
                  </td>
                  <td className="px-1 py-1">
                    <div className="flex justify-end gap-1">
                      {!item.core_equipment && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onStashEquipment(item.fighter_equipment_id, item.equipment_id)}
                            disabled={isLoading}
                            className="text-xs px-1.5 h-6"
                          >
                            Stash
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onSellEquipment(item.fighter_equipment_id, item.equipment_id)}
                            disabled={isLoading}
                            className="text-xs px-1.5 h-6"
                          >
                            Sell
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => onDeleteEquipment(item.fighter_equipment_id, item.equipment_id)}
                            disabled={isLoading}
                            className="text-xs px-1.5 h-6"
                          >
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
