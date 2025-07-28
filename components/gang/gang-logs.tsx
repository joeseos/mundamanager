'use client';

import React, { useState, useEffect } from 'react';
import Modal from '@/components/modal';
import { List, ListColumn, ListAction } from '@/components/ui/list';

interface GangLog {
  id: string;
  gang_id: string;
  action_type: string;
  description: string;
  created_at: string;
  user_id?: string;
  username?: string;
}

interface GangLogsProps {
  gangId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function GangLogs({ gangId, isOpen, onClose }: GangLogsProps) {
  const [logs, setLogs] = useState<GangLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const logsPerPage = 10;

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/gangs/${gangId}/logs`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setLogs(data);
    } catch (error) {
      console.error('Error fetching gang logs:', error);
      // Keep logs empty on error - the UI will show the empty state
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
      setCurrentPage(1); // Reset to first page when modal opens
    }
  }, [isOpen, gangId]);

  const getActionTypeDisplay = (actionType: string) => {
    const actionTypeMap: { [key: string]: string } = {
      'credits_earned': 'Credits earned',
      'credits_spent': 'Credits spent',
      'credits_changed': 'Credits changed',
      'reputation_gained': 'Reputation gained',
      'reputation_lost': 'Reputation lost',
      'reputation_changed': 'Reputation changed',
      'fighter_added': 'Fighter added',
      'fighter_removed': 'Fighter removed',
      'fighter_killed': 'Fighter killed',
      'fighter_retired': 'Fighter retired',
      'fighter_enslaved': 'Fighter enslaved',
      'fighter_xp_changed': 'Fighter XP changed',
      'fighter_total_xp_changed': 'Fighter total XP changed',
      'fighter_kills_changed': 'Fighter kills changed',
      'fighter_cost_adjusted': 'Fighter cost adjusted',
      'equipment_purchased': 'Equipment purchased',
      'Equipment removed': 'Equipment removed',
      'equipment_moved_to_stash': 'Equipment moved to stash',
      'equipment_moved_from_stash': 'Equipment moved from stash',
      'vehicle_added': 'Vehicle added',
      'vehicle_deleted': 'Vehicle removed',
      'vehicle_updated': 'Vehicle updated',
      'vehicle_removed': 'Vehicle removed',
      'vehicle_cost_changed': 'Vehicle cost changed',
      'vehicle_assignment_changed': 'Vehicle assignment changed',
      'vehicle_name_changed': 'Vehicle name changed',
      'vehicle_equipment_purchased': 'Vehicle equipment purchased',
      'Vehicle equipment removed': 'Vehicle equipment removed',
      'vehicle_equipment_moved_to_stash': 'Vehicle equipment moved to stash',
      'vehicle_equipment_moved_from_stash': 'Vehicle equipment moved from stash',
      'stash_update': 'Stash updated',
      'alignment_change': 'Alignment changed',
      'gang_created': 'Gang created',
      'gang_deleted': 'Gang deleted',
      'name_change': 'Name changed',
      'name_changed': 'Name changed',
      'gang_type_changed': 'Gang type changed',
      'fighter_characteristic_advancement': 'Characteristic advanced',
      'fighter_skill_advancement': 'Skill advanced',
      'fighter_skill_learned': 'Skill learned',
      'fighter_skill_removed': 'Skill removed',
      'fighter_characteristic_removed': 'Characteristic removed'
    };
    return actionTypeMap[actionType] || actionType;
  };

  const sortLogs = (a: GangLog, b: GangLog) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  };

  // Pagination logic
  const sortedLogs = [...logs].sort(sortLogs);
  const totalPages = Math.ceil(sortedLogs.length / logsPerPage);
  const startIndex = (currentPage - 1) * logsPerPage;
  const endIndex = startIndex + logsPerPage;
  const currentLogs = sortedLogs.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} — ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const columns: ListColumn[] = [
    {
      key: 'created_at',
      label: 'Date',
      width: '100px',
      render: (value) => formatDate(value)
    },
    {
      key: 'action_type',
      label: 'Type',
      width: '90px',
      render: (value) => getActionTypeDisplay(value)
    },
    {
      key: 'description',
      label: 'Description',
      render: (value) => value
    }
  ];

  const actions: ListAction[] = [
    // Future: Add actions like "Revert" for certain log types
  ];

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 min-h-screen bg-gray-300 bg-opacity-50 flex justify-center items-center z-[100] px-[10px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl min-h-0 max-h-svh overflow-y-auto">
        <div className="border-b px-2 py-2 flex justify-between items-center">
          <div>
            <h3 className="text-xl md:text-2xl font-bold text-gray-900">Gang Activity Logs</h3>
            <p className="text-sm text-gray-500">Track all changes made to your gang</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-3xl"
            >
              ×
            </button>
          </div>
        </div>
        
        <div className="px-2 py-4">
          <div className="max-h-[70vh] min-h-[400px] overflow-y-auto">
            <table className="w-full table-auto">
              <thead className="sticky top-0 bg-white z-10 shadow-sm">
                <tr className="bg-gray-100">
                  {columns.map((column) => (
                    <th 
                      key={column.key}
                      className={`px-2 sm:px-3 py-1 sm:py-2 text-left text-sm font-medium text-gray-700 border-b-2 border-gray-200 whitespace-nowrap ${
                        column.align === 'right' ? 'text-right' : 
                        column.align === 'center' ? 'text-center' : 'text-left'
                      }`}
                      style={column.width ? { width: column.width, minWidth: column.width } : undefined}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td 
                      colSpan={columns.length} 
                      className="text-gray-500 italic text-center py-8"
                    >
                      Loading...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td 
                      colSpan={columns.length} 
                      className="text-gray-500 italic text-center py-8"
                    >
                      No activity logs found for this gang.
                    </td>
                  </tr>
                ) : (
                  currentLogs.map((log, index) => (
                    <tr key={log.id} className="border-t hover:bg-gray-50">
                      {columns.map((column) => (
                        <td 
                          key={column.key}
                          className={`px-2 sm:px-3 py-1 sm:py-2 text-sm align-top ${
                            column.key === 'description' ? '' : 'sm:whitespace-nowrap'
                          } ${
                            column.align === 'right' ? 'text-right' : 
                            column.align === 'center' ? 'text-center' : 'text-left'
                          }`}
                          style={column.width ? { width: column.width, minWidth: column.width } : undefined}
                        >
                          {column.render 
                            ? column.render(log[column.key as keyof typeof log], log)
                            : log[column.key as keyof typeof log] || 'System'
                          }
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 bg-gray-50">
              <div className="text-sm text-gray-700">
                Showing {startIndex + 1} to {Math.min(endIndex, sortedLogs.length)} of {sortedLogs.length} logs
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1 text-sm border rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                
                {/* Page numbers */}
                <div className="flex items-center space-x-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                    // Show first page, last page, current page, and pages around current page
                    const showPage = page === 1 || 
                                   page === totalPages || 
                                   Math.abs(page - currentPage) <= 1;
                    
                    if (!showPage) {
                      // Show ellipsis for gaps
                      if (page === 2 && currentPage > 4) {
                        return <span key={page} className="px-2 text-gray-500">...</span>;
                      }
                      if (page === totalPages - 1 && currentPage < totalPages - 3) {
                        return <span key={page} className="px-2 text-gray-500">...</span>;
                      }
                      return null;
                    }
                    
                    return (
                      <button
                        key={page}
                        onClick={() => goToPage(page)}
                        className={`px-3 py-1 text-sm border rounded-md ${
                          currentPage === page
                            ? 'bg-black text-white border-black'
                            : 'hover:bg-gray-100'
                        }`}
                      >
                        {page}
                      </button>
                    );
                  })}
                </div>
                
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 text-sm border rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 