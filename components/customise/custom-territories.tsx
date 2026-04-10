'use client';

import React, { useState } from 'react';
import { List, ListColumn, ListAction } from '@/components/ui/list';
import { CustomTerritory } from '@/app/lib/customise/custom-territories';
import Modal from '@/components/ui/modal';
import { LuEye } from 'react-icons/lu';

interface CustomiseTerritoriesProps {
  className?: string;
  initialTerritories?: CustomTerritory[];
  readOnly?: boolean;
}

export function CustomiseTerritories({ className, initialTerritories = [] }: CustomiseTerritoriesProps) {
  const [territories] = useState<CustomTerritory[]>(initialTerritories);
  const [viewModalData, setViewModalData] = useState<CustomTerritory | null>(null);

  const columns: ListColumn[] = [
    {
      key: 'territory_name',
      label: 'Name',
      align: 'left',
      width: '100%'
    }
  ];

  const actions: ListAction[] = [
    {
      icon: <LuEye className="h-4 w-4" />,
      onClick: (item: CustomTerritory) => setViewModalData(item),
      variant: 'outline',
      size: 'sm',
      className: 'text-xs px-1.5 h-6'
    }
  ];

  const sortTerritories = (a: CustomTerritory, b: CustomTerritory) => {
    return a.territory_name.localeCompare(b.territory_name);
  };

  const deprecationNotice = (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
      <strong>Custom Territories have moved.</strong> To create custom Territories,
      open a campaign you own or arbitrate and use the <em>Add</em> button in the Territories tab.
    </div>
  );

  return (
    <div className={className}>
      <List<CustomTerritory>
        title="Territories"
        description={deprecationNotice}
        items={territories}
        columns={columns}
        actions={actions}
        emptyMessage="No custom Territories."
        sortBy={sortTerritories}
      />

      {viewModalData && (
        <Modal
          title="View Territory"
          content={
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Territory Name
                </label>
                <div className="w-full p-2 border rounded-md bg-muted">
                  {viewModalData.territory_name}
                </div>
              </div>
            </div>
          }
          onClose={() => setViewModalData(null)}
          hideCancel={true}
        />
      )}
    </div>
  );
}
