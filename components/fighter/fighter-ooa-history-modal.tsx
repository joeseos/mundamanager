'use client';

import React, { useState } from 'react';
import Modal from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getFighterOoaRecords,
  getFighterSustainedOoaRecords,
  getCampaignGangsAndFighters,
  createFighterOoaRecord,
  updateFighterOoaRecord,
  deleteFighterOoaRecord,
  FighterOoaRecord,
} from '@/app/actions/fighter-ooa-records';
import { buildGangComboboxOption } from '@/utils/gang-combobox-option';
import { useCampaignGangFighterOptions, buildFighterComboboxOption } from '@/utils/campaign-gang-fighter-options';
import { FaBookDead } from 'react-icons/fa';
import { LuPencil, LuPlus, LuTrash2 } from 'react-icons/lu';
import { toast } from 'sonner';
import type { QueryClient } from '@tanstack/react-query';

interface FighterOoaHistoryModalProps {
  isOpen: boolean;
  fighterId: string;
  gangId?: string;
  campaignId?: string;
  canEdit?: boolean;
  onClose: () => void;
}

const EVENT_LABELS: Record<FighterOoaRecord['event_type'], string> = {
  out_of_action: 'Out of Action',
  vehicle_wrecked: 'Vehicle Wrecked',
};

const EVENT_OPTIONS = [
  { value: 'out_of_action', label: 'Out of Action' },
  { value: 'vehicle_wrecked', label: 'Vehicle Wrecked' },
];

const RECORDS_PER_PAGE = 10;

interface EditFormState {
  gangId?: string;
  fighterId?: string;
  eventType: FighterOoaRecord['event_type'];
  /** YYYY-MM-DDTHH:mm for the datetime-local input */
  date: string;
}

function toDateTimeInputValue(value?: string | null): string {
  const date = value ? new Date(value) : new Date();
  const source = isNaN(date.getTime()) ? new Date() : date;
  const tzOffsetMs = source.getTimezoneOffset() * 60000;
  return new Date(source.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

function dateTimeInputToIso(dateTimeStr: string): string {
  return new Date(dateTimeStr).toISOString();
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} — ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function emptyAddForm(): EditFormState {
  return { eventType: 'out_of_action', date: toDateTimeInputValue() };
}

/** Invalidates both "Caused" and "Sustained" OOA history queries for any fighter. */
function invalidateOoaRecordQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({
    predicate: (query) =>
      typeof query.queryKey[0] === 'string' &&
      query.queryKey[0].startsWith('fighter-ooa-records'),
  });
}

export function FighterOoaHistoryModal({
  isOpen,
  fighterId,
  gangId,
  campaignId,
  canEdit = false,
  onClose,
}: FighterOoaHistoryModalProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'caused' | 'sustained'>('caused');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [addForm, setAddForm] = useState<EditFormState>(emptyAddForm);
  const [recordToDelete, setRecordToDelete] = useState<FighterOoaRecord | null>(null);

  const { data: causedRecords = [], isLoading: causedLoading, isError: causedError } = useQuery({
    queryKey: ['fighter-ooa-records', fighterId],
    queryFn: () => getFighterOoaRecords(fighterId),
    enabled: isOpen && !!fighterId,
    staleTime: 30_000,
  });

  const { data: sustainedRecords = [], isLoading: sustainedLoading, isError: sustainedError } = useQuery({
    queryKey: ['fighter-ooa-records-sustained', fighterId],
    queryFn: () => getFighterSustainedOoaRecords(fighterId),
    enabled: isOpen && activeTab === 'sustained' && !!fighterId,
    staleTime: 30_000,
  });

  const isSustained = activeTab === 'sustained';
  const records = isSustained ? sustainedRecords : causedRecords;
  const isLoading = isSustained ? sustainedLoading : causedLoading;
  const isError = isSustained ? sustainedError : causedError;

  const { data: campaignGangs = [], isLoading: gangsLoading } = useQuery({
    queryKey: ['campaign-gangs-fighters', gangId, campaignId],
    queryFn: () => getCampaignGangsAndFighters({ campaignId, gangId: gangId! }),
    enabled: isOpen && canEdit && !!gangId,
    staleTime: 60_000,
  });

  const createMutation = useMutation({
    mutationFn: createFighterOoaRecord,
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error || 'Failed to add record');
        return;
      }
      invalidateOoaRecordQueries(queryClient);
      setIsAdding(false);
      setAddForm(emptyAddForm());
      setCurrentPage(1);
      toast.success('Record added');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to add record');
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateFighterOoaRecord,
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error || 'Failed to update record');
        return;
      }
      invalidateOoaRecordQueries(queryClient);
      setEditingId(null);
      setEditForm(null);
      toast.success('Record updated');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update record');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFighterOoaRecord,
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error || 'Failed to delete record');
        return;
      }
      invalidateOoaRecordQueries(queryClient);
      setRecordToDelete(null);
      toast.success('Record deleted');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete record');
    },
  });

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen && !prevIsOpen) {
    setActiveTab('caused');
    setCurrentPage(1);
    setEditingId(null);
    setEditForm(null);
    setIsAdding(false);
    setAddForm(emptyAddForm());
    setRecordToDelete(null);
  }
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
  }

  const totalPages = Math.ceil(records.length / RECORDS_PER_PAGE);
  const startIndex = (currentPage - 1) * RECORDS_PER_PAGE;
  const endIndex = startIndex + RECORDS_PER_PAGE;
  const currentRecords = records.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const { getFighterOptions: baseGetFighterOptions } =
    useCampaignGangFighterOptions(campaignGangs);

  const editingRecord =
    editingId != null ? causedRecords.find((r) => r.id === editingId) ?? null : null;
  const editGangMissingFromCampaign = !!(
    editForm?.gangId &&
    !campaignGangs.some((g) => g.gang_id === editForm.gangId)
  );

  const gangOptions = [
    ...campaignGangs.map((g) =>
      buildGangComboboxOption({
        id: g.gang_id,
        name: g.name,
        gang_colour: g.gang_colour,
        owner_username: g.owner_username,
      })
    ),
    ...(editGangMissingFromCampaign && editingRecord?.injured_gang_id
      ? [
          buildGangComboboxOption({
            id: editingRecord.injured_gang_id,
            name: editingRecord.injured_gang_name || 'Unknown gang',
          }),
        ]
      : []),
  ];

  const getFighterOptions = (selectedGangId?: string, crewOnly?: boolean) => {
    const options = baseGetFighterOptions(selectedGangId, crewOnly);
    if (
      !editGangMissingFromCampaign ||
      !editingRecord?.injured_fighter_id ||
      selectedGangId !== editingRecord.injured_gang_id
    ) {
      return options;
    }
    if (crewOnly && editingRecord.injured_fighter_class !== 'Crew') {
      return options;
    }
    if (options.some((o) => o.value === editingRecord.injured_fighter_id)) {
      return options;
    }
    return [
      buildFighterComboboxOption({
        id: editingRecord.injured_fighter_id,
        fighter_name: editingRecord.injured_fighter_name,
        fighter_type: editingRecord.injured_fighter_type,
        fighter_class: editingRecord.injured_fighter_class,
      }),
      ...options,
    ];
  };

  const startEdit = (record: FighterOoaRecord) => {
    setIsAdding(false);
    setEditingId(record.id);
    setEditForm({
      gangId: record.injured_gang_id ?? undefined,
      fighterId: record.injured_fighter_id ?? undefined,
      eventType: record.event_type,
      date: toDateTimeInputValue(record.created_at),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const isEditIncomplete = !!(editForm?.gangId && !editForm?.fighterId);
  const isAddIncomplete = !!(addForm.gangId && !addForm.fighterId);
  const isEditDateMissing = !editForm?.date;
  const isAddDateMissing = !addForm.date;

  const saveEdit = () => {
    if (!editingId || !editForm || isEditIncomplete || isEditDateMissing) return;
    updateMutation.mutate({
      record_id: editingId,
      injured_fighter_id: editForm.fighterId || null,
      event_type: editForm.eventType,
      created_at: dateTimeInputToIso(editForm.date),
    });
  };

  const startAdd = () => {
    setEditingId(null);
    setEditForm(null);
    setIsAdding(true);
    setAddForm(emptyAddForm());
  };

  const cancelAdd = () => {
    setIsAdding(false);
    setAddForm(emptyAddForm());
  };

  const saveAdd = () => {
    if (isAddIncomplete || isAddDateMissing || !gangId) return;
    createMutation.mutate({
      causing_fighter_id: fighterId,
      campaign_id: campaignId ?? null,
      injured_fighter_id: addForm.fighterId || null,
      event_type: addForm.eventType,
      created_at: dateTimeInputToIso(addForm.date),
    });
  };

  const handleDeleteRecord = (record: FighterOoaRecord) => {
    setEditingId(null);
    setEditForm(null);
    setIsAdding(false);
    setRecordToDelete(record);
  };

  const confirmDeleteRecord = () => {
    if (!recordToDelete) return false;
    const recordId = recordToDelete.id;
    setRecordToDelete(null);
    deleteMutation.mutate(recordId);
    return true;
  };

  if (!isOpen) return null;

  const addCrewOnly = addForm.eventType === 'vehicle_wrecked';

  return (
    <>
    <Modal
      title="OOA / Wreck Records"
      helper={
        <>
          <span className="text-xs italic">Note: Fighter information is recorded as it was at the time the record was created.</span>
        </>
      }
      width="xl"
      onClose={onClose}
      content={
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={activeTab === 'caused' ? 'default' : 'outline'}
              size="sm"
              className="w-full"
              onClick={() => {
                setActiveTab('caused');
                setCurrentPage(1);
                setEditingId(null);
                setEditForm(null);
                setIsAdding(false);
              }}
            >
              Caused
            </Button>
            <Button
              type="button"
              variant={activeTab === 'sustained' ? 'default' : 'outline'}
              size="sm"
              className="w-full"
              onClick={() => {
                setActiveTab('sustained');
                setCurrentPage(1);
                setEditingId(null);
                setEditForm(null);
                setIsAdding(false);
              }}
            >
              Sustained
            </Button>
          </div>

          {canEdit && gangId && activeTab === 'caused' && (
            <>
              {!isAdding ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={startAdd}
                  className="w-full"
                >
                  <LuPlus className="h-3.5 w-3.5 mr-1" />
                  Add record
                </Button>
              ) : (
                <div className="rounded-md border border-border p-2.5 text-sm space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">New record</span>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline_cancel"
                        onClick={cancelAdd}
                        disabled={createMutation.isPending}
                        title="Cancel"
                        aria-label="Cancel"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        onClick={saveAdd}
                        disabled={createMutation.isPending || isAddIncomplete || isAddDateMissing}
                        title="Save"
                        aria-label="Save"
                      >
                        Save
                      </Button>
                    </div>
                  </div>

                  <p className="text-xs text-amber-500">
                    This only creates a record, it does not change the fighter’s OOA counter or award XP.
                  </p>
                  <Input
                    type="datetime-local"
                    value={addForm.date}
                    onChange={(e) =>
                      setAddForm((prev) => ({ ...prev, date: e.target.value }))
                    }
                    className="w-full"
                  />
                  <Combobox
                    options={EVENT_OPTIONS}
                    value={addForm.eventType}
                    onValueChange={(value) =>
                      setAddForm((prev) => ({
                        ...prev,
                        eventType: value as FighterOoaRecord['event_type'],
                        fighterId: undefined,
                      }))
                    }
                    placeholder="Event type"
                    className="w-full"
                  />
                  <Combobox
                    options={gangOptions}
                    value={addForm.gangId}
                    onValueChange={(value) =>
                      setAddForm((prev) => ({
                        ...prev,
                        gangId: value || undefined,
                        fighterId: undefined,
                      }))
                    }
                    placeholder={gangsLoading ? 'Loading gangs...' : 'Select gang (optional)'}
                    clearable
                    className="w-full"
                  />
                  <Combobox
                    options={getFighterOptions(addForm.gangId, addCrewOnly)}
                    value={addForm.fighterId}
                    onValueChange={(value) =>
                      setAddForm((prev) => ({ ...prev, fighterId: value || undefined }))
                    }
                    placeholder={
                      addForm.gangId
                        ? addCrewOnly
                          ? 'Select crew (optional)'
                          : 'Select fighter'
                        : 'Select a gang first'
                    }
                    disabled={!addForm.gangId}
                    clearable
                    className="w-full"
                    noResultsText={addCrewOnly ? 'No crew found' : 'No fighters found'}
                  />
                  {isAddIncomplete && (
                    <p className="text-xs text-red-500">
                      Select a fighter, or clear the gang to leave as Unknown.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {isLoading && (
            <p className="text-sm text-muted-foreground">Loading records...</p>
          )}

          {isError && !isLoading && (
            <p className="text-sm text-red-500">Failed to load records. Please try again.</p>
          )}

          {!isLoading && !isError && records.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {isSustained
                ? 'No fighters have put this fighter Out of Action or wrecked their vehicle yet.'
                : 'No fighters have been put Out of Action or wrecked by this fighter yet.'}
            </p>
          )}

          {!isLoading && !isError && records.length > 0 && (
            <>
              <ul className="space-y-2">
                {currentRecords.map((record) => {
                  const isEditing = !isSustained && editingId === record.id && !!editForm;
                  const crewOnly = (isEditing ? editForm!.eventType : record.event_type) === 'vehicle_wrecked';

                  return (
                    <li
                      key={record.id}
                      className="rounded-md border border-border p-2.5 text-sm"
                    >
                      {!isEditing ? (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-foreground">
                              {isSustained
                                ? record.causing_fighter_name || 'Unknown fighter'
                                : record.injured_fighter_name || 'Unknown fighter'}
                            </span>
                            <span className="shrink-0 rounded-full bg-secondary py-0.5 text-xs text-secondary-foreground">
                              {EVENT_LABELS[record.event_type] ?? record.event_type}
                            </span>
                          </div>

                          <div className="mt-1 text-xs text-muted-foreground space-y-1">
                            {isSustained ? (
                              (record.causing_fighter_type || record.causing_fighter_class || record.causing_fighter_gang_name) && (
                                <div>
                                  {record.causing_fighter_type}
                                  {record.causing_fighter_type && record.causing_fighter_class ? ' ' : ''}
                                  {record.causing_fighter_class ? `(${record.causing_fighter_class})` : ''}
                                  {(record.causing_fighter_type || record.causing_fighter_class) && record.causing_fighter_gang_name ? ' • ' : ''}
                                  {record.causing_fighter_gang_name}
                                </div>
                              )
                            ) : (
                              (record.injured_fighter_type || record.injured_fighter_class || record.injured_gang_name) && (
                                <div>
                                  {record.injured_fighter_type}
                                  {record.injured_fighter_type && record.injured_fighter_class ? ' ' : ''}
                                  {record.injured_fighter_class ? `(${record.injured_fighter_class})` : ''}
                                  {(record.injured_fighter_type || record.injured_fighter_class) && record.injured_gang_name ? ' • ' : ''}
                                  {record.injured_gang_name}
                                </div>
                              )
                            )}
                            {record.event_type === 'vehicle_wrecked' &&
                              (record.vehicle_type || record.vehicle_name) && (
                                <div>
                                  Vehicle: {record.vehicle_name || record.vehicle_type}
                                  {record.vehicle_name && record.vehicle_type
                                    ? ` (${record.vehicle_type})`
                                    : ''}
                                </div>
                              )}
                            <div className="flex items-center justify-between gap-2">
                              <div>{formatDateTime(record.created_at)}</div>
                              {canEdit && !isSustained && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <Button
                                    type="button"
                                    onClick={() => startEdit(record)}
                                    variant="outline"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    title="Edit record"
                                    aria-label="Edit record"
                                  >
                                    <LuPencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    onClick={() => handleDeleteRecord(record)}
                                    variant="outline"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                    aria-label="Delete record"
                                    disabled={deleteMutation.isPending}
                                  >
                                    <LuTrash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">Edit record</span>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="outline_cancel"
                                onClick={cancelEdit}
                                disabled={updateMutation.isPending}
                                title="Cancel"
                                aria-label="Cancel"
                              >
                                Cancel
                              </Button>
                              <Button
                                type="button"
                                onClick={saveEdit}
                                disabled={updateMutation.isPending || isEditIncomplete || isEditDateMissing || !gangId}
                                title="Save"
                                aria-label="Save"
                              >
                                Save
                              </Button>
                            </div>
                          </div>

                          <Input
                            type="datetime-local"
                            value={editForm!.date}
                            onChange={(e) =>
                              setEditForm((prev) =>
                                prev ? { ...prev, date: e.target.value } : prev
                              )
                            }
                            className="w-full"
                          />
                          <Combobox
                            options={EVENT_OPTIONS}
                            value={editForm!.eventType}
                            onValueChange={(value) =>
                              setEditForm((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      eventType: value as FighterOoaRecord['event_type'],
                                      // Clear fighter when switching to wreck if current pick may no longer be crew
                                      fighterId: undefined,
                                    }
                                  : prev
                              )
                            }
                            placeholder="Event type"
                            className="w-full"
                          />
                          <Combobox
                            options={gangOptions}
                            value={editForm!.gangId}
                            onValueChange={(value) =>
                              setEditForm((prev) =>
                                prev
                                  ? { ...prev, gangId: value || undefined, fighterId: undefined }
                                  : prev
                              )
                            }
                            placeholder={gangsLoading ? 'Loading gangs...' : 'Select gang (optional)'}
                            clearable
                            className="w-full"
                          />
                          {editGangMissingFromCampaign && (
                            <p className="text-xs text-amber-500">
                              This gang is no longer in the campaign. Clear or pick another gang to change the target.
                            </p>
                          )}
                          <Combobox
                            options={getFighterOptions(editForm!.gangId, crewOnly)}
                            value={editForm!.fighterId}
                            onValueChange={(value) =>
                              setEditForm((prev) =>
                                prev ? { ...prev, fighterId: value || undefined } : prev
                              )
                            }
                            placeholder={
                              editForm!.gangId
                                ? crewOnly
                                  ? 'Select crew'
                                  : 'Select fighter'
                                : 'Select a gang first'
                            }
                            disabled={!editForm!.gangId}
                            clearable
                            className="w-full"
                            noResultsText={crewOnly ? 'No crew found' : 'No fighters found'}
                          />
                          {isEditIncomplete && (
                            <p className="text-xs text-red-500">
                              Select a fighter, or clear the gang to leave as Unknown.
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              {totalPages > 1 && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-3 py-2 border-t border-border bg-muted mt-4">
                  <div className="text-sm text-muted-foreground text-center sm:text-left">
                    Records {startIndex + 1} to {Math.min(endIndex, records.length)} of {records.length}
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
                        const showPage =
                          page === 1 ||
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
            </>
          )}
        </div>
      }
      headerContent={
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <FaBookDead className="h-5 w-5" />
          <span className="text-sm">{records.length}</span>
        </div>
      }
    />

    {recordToDelete && (
      <Modal
        title="Delete Record"
        content={
          <div>
            <p className="mb-4">Are you sure you want to delete this record?</p>
            <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md space-y-1">
              <p>
                <span className="font-medium">Fighter:</span>{' '}
                {recordToDelete.injured_fighter_name || 'Unknown fighter'}
              </p>
              <p>
                <span className="font-medium">Type:</span>{' '}
                {EVENT_LABELS[recordToDelete.event_type] ?? recordToDelete.event_type}
              </p>
              <p>
                <span className="font-medium">Date:</span>{' '}
                {formatDateTime(recordToDelete.created_at)}
              </p>
            </div>
            <p className="text-sm text-red-600 mt-4">
              This action cannot be undone.
            </p>
          </div>
        }
        onClose={() => setRecordToDelete(null)}
        onConfirm={confirmDeleteRecord}
        confirmText={deleteMutation.isPending ? 'Deleting...' : 'Delete'}
        confirmDisabled={deleteMutation.isPending}
      />
    )}
    </>
  );
}
