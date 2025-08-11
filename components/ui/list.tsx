'use client';

import React from 'react';
import { Button } from './button';

export interface ListColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  width?: string;
  render?: (value: any, item: any, index?: number) => React.ReactNode;
}

export interface ListAction {
  label?: string;
  icon?: React.ReactNode;
  onClick: (item: any) => void;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  disabled?: (item: any) => boolean;
  className?: string;
  title?: string;
}

export interface ListProps<T = any> {
  title: string;
  items: T[];
  columns: ListColumn[];
  actions?: ListAction[];
  onAdd?: () => void;
  addButtonText?: string;
  addButtonDisabled?: boolean;
  emptyMessage?: string;
  className?: string;
  isLoading?: boolean;
  sortBy?: (a: T, b: T) => number;
}

export function List<T = any>({
  title,
  items,
  columns,
  actions = [],
  onAdd,
  addButtonText = "Add",
  addButtonDisabled,
  emptyMessage = "No items yet.",
  className = "",
  isLoading = false,
  sortBy
}: ListProps<T>) {
  // Sort items if sortBy function is provided
  const sortedItems = sortBy ? [...items].sort(sortBy) : items;

  const getAlignmentClass = (align?: string) => {
    switch (align) {
      case 'right':
        return 'text-right';
      case 'center':
        return 'text-center';
      default:
        return 'text-left';
    }
  };

  const renderCellContent = (column: ListColumn, item: T, index: number): React.ReactNode => {
    if (column.render) {
      return column.render(item[column.key as keyof T], item, index);
    }
    const value = item[column.key as keyof T];
    // Convert the value to a string or return null if it's null/undefined
    if (value === null || value === undefined) {
      return null;
    }
    return String(value);
  };

  return (
    <div className={`mt-6 ${className}`}>
      <div className="flex flex-wrap justify-between items-center mb-2">
        <h2 className="text-xl md:text-2xl font-bold">{title}</h2>
        {onAdd && (
          <Button 
            onClick={onAdd}
            className="bg-black hover:bg-gray-800 text-white"
            disabled={isLoading || (addButtonDisabled === true)}
          >
            {addButtonText}
          </Button>
        )}
      </div>

      <div>
        <div className="overflow-x-auto">
          <table className="w-full table-auto">
            {(sortedItems.length > 0) && (
              <thead>
                <tr className="bg-gray-100">
                  {columns.map((column) => (
                    <th 
                      key={column.key}
                      className={`px-1 py-1 ${getAlignmentClass(column.align)}`}
                      style={column.width ? { width: column.width } : undefined}
                    >
                      {column.label}
                    </th>
                  ))}
                  {actions.length > 0 && (
                    <th className="px-1 py-1 text-right">Action</th>
                  )}
                </tr>
              </thead>
            )}
            <tbody>
              {sortedItems.length === 0 ? (
                <tr>
                  <td 
                    colSpan={columns.length + (actions.length > 0 ? 1 : 0)} 
                    className="text-gray-500 italic text-center py-4"
                  >
                    {isLoading ? "Loading..." : emptyMessage}
                  </td>
                </tr>
              ) : (
                sortedItems.map((item, index) => (
                  <tr key={index} className="border-t">
                    {columns.map((column) => (
                      <td 
                        key={column.key}
                        className={`px-1 py-1 ${getAlignmentClass(column.align)}`}
                      >
                        {renderCellContent(column, item, index)}
                      </td>
                    ))}
                    {actions.length > 0 && (
                      <td className="px-1 py-1">
                        <div className="flex justify-end gap-1">
                          {actions.map((action, actionIndex) => (
                            <Button
                              key={actionIndex}
                              variant={action.variant || 'destructive'}
                              size={action.size || 'sm'}
                              onClick={() => action.onClick(item)}
                              disabled={action.disabled ? action.disabled(item) : false}
                              className={`text-xs px-1.5 h-6 ${action.className || ''}`}
                              title={action.title}
                            >
                              {action.icon || action.label}
                            </Button>
                          ))}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}