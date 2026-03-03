'use client';

import React, { useState, useEffect } from 'react';
import Modal from '@/components/ui/modal';
import { getLogTypeLabel } from '@/utils/log-types';

interface FighterLog {
  id: string;
  gang_id: string;
  fighter_id: string;
  action_type: string;
  description: string;
  created_at: string;
  user_id?: string;
  username?: string;
}

interface FighterLogsProps {
  gangId: string;
  fighterId: string;
  fighterName: string;
  vehicleId?: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function FighterLogs({ gangId, fighterId, fighterName, vehicleId, isOpen, onClose }: FighterLogsProps) {
  const [logs, setLogs] = useState<FighterLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const logsPerPage = 10;

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      // Build URL with optional vehicleId parameter for Crew fighters
      let url = `/api/gangs/${gangId}/logs?fighterId=${fighterId}`;
      if (vehicleId) {
        url += `&vehicleId=${vehicleId}`;
      }
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setLogs(data);
    } catch (error) {
      console.error('Error fetching fighter logs:', error);
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
      setCurrentPage(1);
    } else {
      setLogs([]);
    }
  }, [isOpen, gangId, fighterId, vehicleId]);

  const getActionTypeDisplay = (actionType: string) => getLogTypeLabel(actionType);

  const sortLogs = (a: FighterLog, b: FighterLog) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  };

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

  const columns = [
    {
      key: 'created_at',
      label: 'Date',
      width: '100px',
      render: (value: string) => formatDate(value)
    },
    {
      key: 'action_type',
      label: 'Type',
      width: '90px',
      render: (value: string) => getActionTypeDisplay(value)
    },
    {
      key: 'description',
      label: 'Description',
      render: (value: string) => {
        if (!value) return value;
        const newlineIndex = value.indexOf('\n');
        if (newlineIndex === -1) return value;
        const main = value.slice(0, newlineIndex);
        const financial = value.slice(newlineIndex + 1).trim();
        if (!financial) return main;
        return (
          <span className="block">
            {main}
            <br />
            <span className="text-xs text-muted-foreground block mt-0.5">{financial}</span>
          </span>
        );
      }
    }
  ];

  if (!isOpen) return null;

  return (
    <Modal
      title={`Activity Logs: ${fighterName}`}
      helper={
        <>
          Track all changes made to this fighter{vehicleId && ' and their vehicle'}
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
                  className="px-2 sm:px-3 py-1 sm:py-2 text-left text-sm font-medium text-muted-foreground border-b-2 border-border whitespace-nowrap"
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
                  No activity logs found for this fighter.
                </td>
              </tr>
            ) : (
              currentLogs.map((log) => (
                <tr key={log.id} className="border-t hover:bg-muted">
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-2 sm:px-3 py-1 sm:py-2 text-sm align-top ${
                        column.key === 'description' ? 'whitespace-pre-line' : 'sm:whitespace-nowrap'
                      }`}
                      style={column.width ? { width: column.width, minWidth: column.width } : undefined}
                    >
                      {column.render
                        ? column.render(log[column.key as keyof typeof log] as string)
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

            <div className="flex items-center space-x-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                const showPage = page === 1 ||
                               page === totalPages ||
                               Math.abs(page - currentPage) <= 1;

                if (!showPage) {
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

