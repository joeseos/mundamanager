import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Equipment } from '@/types/equipment';
import Modal from '@/components/ui/modal';
import { Checkbox } from '@/components/ui/checkbox';

interface EquipmentWithId extends Equipment {
  id: string;
}

interface AdminFighterTradingPostProps {
  equipment: EquipmentWithId[];
  tradingPostEquipment: string[];
  setTradingPostEquipment: (equipment: string[] | ((prev: string[]) => string[])) => void;
  disabled?: boolean;
}

export function AdminFighterTradingPost({
  equipment,
  tradingPostEquipment,
  setTradingPostEquipment,
  disabled = false
}: AdminFighterTradingPostProps) {
  const [showTradingPostDialog, setShowTradingPostDialog] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [equipmentByCategory, setEquipmentByCategory] = useState<Record<string, EquipmentWithId[]>>({});
  const [excludeExclusive, setExcludeExclusive] = useState(true);
  const { toast } = useToast();

  // Group equipment by category
  React.useEffect(() => {
    const groupedByCategory: Record<string, EquipmentWithId[]> = {};
    
    equipment.forEach((item) => {
      const category = item.equipment_category || item.equipment_type || 'Uncategorized';
      if (!groupedByCategory[category]) {
        groupedByCategory[category] = [];
      }
      groupedByCategory[category].push(item);
    });
    
    // Sort equipment within each category by name
    Object.keys(groupedByCategory).forEach(category => {
      groupedByCategory[category].sort((a, b) => 
        a.equipment_name.localeCompare(b.equipment_name)
      );
    });
    
    setEquipmentByCategory(groupedByCategory);
  }, [equipment]);

  const handleSave = () => {
    toast({
      description: "Trading Post options saved. Remember to update the fighter type to apply changes.",
      variant: "default"
    });
    return true;
  };

  const modalContent = (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Checkbox
          id="exclude-exclusive-checkbox"
          checked={excludeExclusive}
          onCheckedChange={checked => setExcludeExclusive(!!checked)}
        />
        <label htmlFor="exclude-exclusive-checkbox" className="text-sm font-medium select-none cursor-pointer">
          Exclude exclusive equipment
        </label>
      </div>
      <p className="text-sm text-muted-foreground">Select equipment items that should be available in the Trading Post for this fighter type.</p>

      <div className="border rounded-lg overflow-hidden">
        {/* Table header */}
        <div className="bg-muted border-b px-4 py-2 font-medium">
          Equipment
        </div>

        {/* Equipment categories and list */}
        <div className="max-h-[50vh] overflow-y-auto">
          {Object.keys(equipmentByCategory).length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">Loading equipment categories...</div>
          ) : (
            Object.entries(equipmentByCategory)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([category, items]) => {
                // Determine which items to consider for checked/indeterminate state
                const relevantItems = excludeExclusive
                  ? items.filter(item => item.availability !== 'E')
                  : items;
                const relevantIds = relevantItems.map(item => item.id);
                const checkedCount = relevantIds.filter(id => tradingPostEquipment.includes(id)).length;
                const allChecked = checkedCount === relevantIds.length && relevantIds.length > 0;
                const someChecked = checkedCount > 0 && checkedCount < relevantIds.length;

                return (
                  <div key={category} className="border-b last:border-b-0">
                    {/* Category header with checkbox */}
                    <div
                      className="flex items-center justify-between px-4 py-3 bg-muted cursor-pointer hover:bg-muted"
                      onClick={() => setExpandedCategory(
                        expandedCategory === category ? null : category
                      )}
                    >
                      <div className="flex items-center">
                        <Checkbox
                          id={`category-${category}`}
                          checked={allChecked}
                          onCheckedChange={(checked) => {
                            const itemIds = items.map(item => item.id);
                            const nonExclusiveIds = items.filter(item => item.availability !== 'E').map(item => item.id);
                            if (checked) {
                              setTradingPostEquipment((prev: string[]) => {
                                if (excludeExclusive) {
                                  return Array.from(new Set([...prev, ...nonExclusiveIds]));
                                } else {
                                  return Array.from(new Set([...prev, ...itemIds]));
                                }
                              });
                            } else {
                              // Always remove all items in the category
                              setTradingPostEquipment((prev: string[]) =>
                                prev.filter((id: string) => !itemIds.includes(id))
                              );
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <label
                          htmlFor={`category-${category}`}
                          className="ml-2 text-sm font-medium"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {category} ({items.length})
                        </label>
                      </div>
                      <div className="flex items-center">
                        {someChecked && (
                          <span className="text-xs mr-2 text-muted-foreground">
                            {checkedCount} selected
                          </span>
                        )}
                        <svg
                          className={`h-5 w-5 transition-transform ${expandedCategory === category ? 'rotate-90' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>

                    {/* Expanded equipment list */}
                    {expandedCategory === category && (
                      <div>
                        {items.map(item => (
                          <div
                            key={item.id}
                            className="border-t px-4 py-2 flex items-center justify-between"
                          >
                            <div className="flex items-center flex-1">
                              <Checkbox
                                id={`trading-post-${item.id}`}
                                checked={tradingPostEquipment.includes(item.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setTradingPostEquipment([...tradingPostEquipment, item.id]);
                                  } else {
                                    setTradingPostEquipment(tradingPostEquipment.filter(id => id !== item.id));
                                  }
                                }}
                              />
                              <label htmlFor={`trading-post-${item.id}`} className="ml-2 block text-sm">
                                {item.equipment_name}
                              </label>
                            </div>

                            {/* Use type assertion for availability */}
                            {item.availability && (
                              <div className="w-6 h-6 rounded-full flex items-center justify-center bg-sky-500 text-white">
                                <span className="text-[10px] font-medium">{item.availability}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <label className="block text-sm font-medium text-muted-foreground mb-1">
        Trading Post
      </label>
      <Button
        onClick={() => setShowTradingPostDialog(true)}
        variant="outline"
        size="sm"
        className="mb-2"
        disabled={disabled}
      >
        Open Trading Post Menu
      </Button>
      {disabled && (
        <p className="text-sm text-muted-foreground mb-2">
          Select a gang type and fighter type to configure trading post options
        </p>
      )}

      {showTradingPostDialog && (
        <Modal
          title="Trading Post Options"
          content={modalContent}
          onClose={() => setShowTradingPostDialog(false)}
          onConfirm={handleSave}
          confirmText="Save Options"
        />
      )}
    </div>
  );
} 