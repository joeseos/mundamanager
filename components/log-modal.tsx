'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Modal from '@/components/ui/modal';
import { ListColumn } from '@/components/ui/list';
import { getLogTypeLabel } from '@/utils/log-types';
import { Combobox } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { HiX } from 'react-icons/hi';

interface GangLog {
  id: string;
  gang_id: string;
  action_type: string;
  description: string;
  created_at: string;
  user_id?: string;
  username?: string;
  fighter_id?: string;
  vehicle_id?: string;
}

interface LogModalProps {
  fetchUrl: string;
  title?: string;
  emptyMessage?: string;
  isOpen: boolean;
  onClose: () => void;
  fighters?: Array<{ id: string; name: string }>;
  vehicles?: Array<{ id: string; name: string }>;
}

// Mirrors the `.limit(100)` cap applied server-side in the logs API routes.
const LOGS_FETCH_LIMIT = 100;

export default function LogModal({
  fetchUrl,
  title = 'Activity Logs',
  emptyMessage = 'No activity logs found.',
  isOpen,
  onClose,
  fighters,
  vehicles,
}: LogModalProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const logsPerPage = 10;

  const [filterActionType, setFilterActionType] = useState('');
  const [filterFighterId, setFilterFighterId] = useState('');
  const [filterVehicleId, setFilterVehicleId] = useState('');

  // When a fighter/vehicle filter is selected, route the id(s) through the
  // server-side `fighterId`/`vehicleId` query params (same as the fighter
  // page's fetchUrl) rather than only slicing the gang-wide, already
  // `.limit(100)`-capped response client-side. Otherwise selecting a less
  // active fighter/vehicle could miss real history that fell outside the
  // fetched window.
  const effectiveFetchUrl = useMemo(() => {
    if (!filterFighterId && !filterVehicleId) return fetchUrl;

    const [base, existingQuery] = fetchUrl.split('?');
    const params = new URLSearchParams(existingQuery);
    if (filterFighterId) params.set('fighterId', filterFighterId);
    if (filterVehicleId) params.set('vehicleId', filterVehicleId);
    // These are independent, user-selected filters, so require both to match
    // the same log row (AND) rather than the route's default OR behaviour —
    // otherwise the true intersection could be pushed out of the `.limit(100)`
    // window by unrelated rows matching only one side.
    if (filterFighterId && filterVehicleId) params.set('combine', 'and');

    return `${base}?${params.toString()}`;
  }, [fetchUrl, filterFighterId, filterVehicleId]);

  const { data: logs = [], isLoading } = useQuery<GangLog[]>({
    queryKey: ['logs', effectiveFetchUrl],
    queryFn: async () => {
      const response = await fetch(effectiveFetchUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    },
    enabled: isOpen,
  });

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen && !prevIsOpen) {
    setCurrentPage(1);
  }
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
  }

  const getActionTypeDisplay = (actionType: string) => getLogTypeLabel(actionType);

  const actionTypeOptions = useMemo(() => {
    const unique = Array.from(new Set(logs.map(l => l.action_type))).sort();
    return [
      { value: '', label: 'All Action Types' },
      ...unique.map(type => ({ value: type, label: getLogTypeLabel(type) })),
    ];
  }, [logs]);

  const filteredLogs = useMemo(() => {
    let result = logs;
    if (filterActionType) {
      result = result.filter(l => l.action_type === filterActionType);
    }
    if (filterFighterId) {
      result = result.filter(l => l.fighter_id === filterFighterId);
    }
    if (filterVehicleId) {
      result = result.filter(l => l.vehicle_id === filterVehicleId);
    }
    return result;
  }, [logs, filterActionType, filterFighterId, filterVehicleId]);

  const hasActiveFilters = !!(filterActionType || filterFighterId || filterVehicleId);

  const clearFilters = () => {
    setFilterActionType('');
    setFilterFighterId('');
    setFilterVehicleId('');
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [filterActionType, filterFighterId, filterVehicleId]);

  const totalPages = Math.ceil(filteredLogs.length / logsPerPage);
  const startIndex = (currentPage - 1) * logsPerPage;
  const endIndex = startIndex + logsPerPage;
  const currentLogs = filteredLogs.slice(startIndex, endIndex);

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
      width: '60px',
      render: (value) => getActionTypeDisplay(value)
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

  const showFighterFilter = fighters && fighters.length > 0;
  const showVehicleFilter = vehicles && vehicles.length > 0;

  return (
    <Modal
      title={title}
      helper={
        <>
          Track all changes and activity
          <br />
          <span className="text-xs italic">Note: Logs are automatically deleted after 3 months</span>
        </>
      }
      onClose={onClose}
      width="4xl"
    >
      {/* Filter Section */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Filters</h3>
        </div>
        {logs.length >= LOGS_FETCH_LIMIT && (
          <p className="text-xs text-muted-foreground italic mb-2">
            Only the most recent {LOGS_FETCH_LIMIT} matching logs are fetched, so the Action Type filter may not
            reflect older history.
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Action Type Filter */}
          <div className="space-y-1">
            <Label className="text-xs">Action Type</Label>
            <Combobox
              options={actionTypeOptions}
              value={filterActionType}
              onValueChange={setFilterActionType}
              placeholder="All Action Types"
              className="h-9"
            />
          </div>

          {/* Fighter Filter */}
          {showFighterFilter && (
            <div className="space-y-1">
              <Label className="text-xs">Fighter</Label>
              <Combobox
                options={[
                  { value: '', label: 'All Fighters' },
                  ...(fighters ?? []).map(f => ({ value: f.id, label: f.name })),
                ]}
                value={filterFighterId}
                onValueChange={setFilterFighterId}
                placeholder="All Fighters"
                className="h-9"
              />
            </div>
          )}

          {/* Vehicle Filter */}
          {showVehicleFilter && (
            <div className="space-y-1">
              <Label className="text-xs">Vehicle</Label>
              <Combobox
                options={[
                  { value: '', label: 'All Vehicles' },
                  ...(vehicles ?? []).map(v => ({ value: v.id, label: v.name })),
                ]}
                value={filterVehicleId}
                onValueChange={setFilterVehicleId}
                placeholder="All Vehicles"
                className="h-9"
              />
            </div>
          )}
        </div>
        {hasActiveFilters && (
          <div className="flex items-center justify-between gap-2 mt-2">
            <span className="leading-[3] text-xs text-muted-foreground">
              Showing {filteredLogs.length} of {logs.length} logs
            </span>
            <Button onClick={clearFilters} variant="outline" size="sm">
              <HiX className="h-3 w-3 mr-1" />
              Clear
            </Button>
          </div>
        )}
      </div>

      <div className="max-h-[min(70vh,calc(100svh-12rem))] overflow-y-auto">
        <table className="w-full table-auto">
          <thead className="sticky top-0 bg-card z-10 shadow-xs">
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
            ) : filteredLogs.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="text-muted-foreground italic text-center py-8"
                >
                  {logs.length === 0 ? emptyMessage : 'No logs match the selected filters.'}
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

      {totalPages > 1 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-3 py-2 border-t border-border bg-muted mt-4">
          <div className="text-sm text-muted-foreground text-center sm:text-left">
            Logs {startIndex + 1} to {Math.min(endIndex, filteredLogs.length)} of {filteredLogs.length}
          </div>
          <div className="flex items-center justify-center sm:justify-end space-x-2">
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
