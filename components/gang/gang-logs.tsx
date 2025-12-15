'use client';

import React, { useState, useEffect } from 'react';
import Modal from '@/components/ui/modal';
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
    } else {
      setLogs([]); // Clear logs when modal closes to prevent flickering on reopen
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
      'fighter_resurected': 'Fighter resurected',
      'fighter_retired': 'Fighter retired',
      'fighter_enslaved': 'Fighter enslaved',
      'fighter_xp_changed': 'Fighter XP changed',
      'fighter_total_xp_changed': 'Fighter total XP changed',
      'fighter_kills_changed': 'Fighter kills count changed',
      'fighter_OOA_changed': 'Fighter OOA count changed',

      'fighter_cost_adjusted': 'Fighter cost adjusted',
      'equipment_purchased': 'Equipment purchased',
      'equipment_purchased_to_stash': 'Equipment purchased to stash',
      'equipment_sold': 'Equipment sold',
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
      'vehicle_equipment_sold': 'Vehicle equipment sold',
      'Vehicle equipment removed': 'Vehicle equipment removed',
      'vehicle_equipment_moved_to_stash': 'Vehicle equipment moved to stash',
      'vehicle_equipment_moved_from_stash': 'Vehicle equipment moved from stash',
      'vehicle_damage_added': 'Vehicle damage sustained',
      'vehicle_damage_removed': 'Vehicle damage recovered',
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
      'fighter_characteristic_removed': 'Characteristic removed',
      'fighter_injured': 'Fighter injured',
      'fighter_recovered': 'Fighter recovered',
      'fighter_rescued': 'Fighter rescued',
      'fighter_starved': 'Fighter starved',
      'fighter_fed': 'Fighter fed',
      'fighter_captured': 'Fighter captured',
      'fighter_released': 'Fighter released',
      'fighter_copied': 'Fighter copied',
      'campaign_joined': 'Campaign joined',
      'campaign_left': 'Campaign left',
      'battle_won': 'Battle won',
      'battle_lost': 'Battle lost',
      'battle_draw': 'Battle draw',
      'territory_claimed': 'Territory claimed',
      'territory_lost': 'Territory lost',
      'injury_roll': 'Injury Roll'
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
    <Modal
      title="Gang Activity Logs"
      helper={
        <>
          Track all changes made to your gang
          <br />
          <span className="text-xs italic">Note: Logs are automatically deleted after 3 months</span>
        </>
      }
      onClose={onClose}
      width="4xl"
    >
      <div className="max-h-[70vh] min-h-[400px] overflow-y-auto">
        <table className="w-full table-auto">
          <thead className="sticky top-0 bg-card z-10 shadow-sm">
            <tr className="bg-muted">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-2 sm:px-3 py-1 sm:py-2 text-left text-sm font-medium text-muted-foreground border-b-2 border-border whitespace-nowrap ${
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
                  className="text-muted-foreground italic text-center py-8"
                >
                  Loading...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="text-muted-foreground italic text-center py-8"
                >
                  No activity logs found for this gang.
                </td>
              </tr>
            ) : (
              currentLogs.map((log, index) => (
                <tr key={log.id} className="border-t hover:bg-muted">
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
        <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-muted mt-4">
          <div className="text-sm text-muted-foreground">
            Showing {startIndex + 1} to {Math.min(endIndex, sortedLogs.length)} of {sortedLogs.length} logs
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border rounded-md hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
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
                    return <span key={page} className="px-2 text-muted-foreground">...</span>;
                  }
                  if (page === totalPages - 1 && currentPage < totalPages - 3) {
                    return <span key={page} className="px-2 text-muted-foreground">...</span>;
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
                        : 'hover:bg-muted'
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
              className="px-3 py-1 text-sm border rounded-md hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
} 