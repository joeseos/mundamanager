'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from '@/components/ui/combobox';
import { toast } from 'sonner';
import { EditionSelect } from '@/components/edition-select';
import {
  compareScenarioTableEntries,
  describeCrewSelectionRule,
  DICE_NOTATION_RE,
  formatD6Range,
  SCENARIO_TABLE_TYPE_LABELS,
  SCENARIO_TABLE_TYPES,
  type CrewSelectionRole,
  type ScenarioCrewSelectionRule,
  type ScenarioTable,
  type ScenarioTableEntry,
  type ScenarioTableType,
} from '@/types/scenario-table';

enum OperationType {
  POST = 'POST',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE'
}

interface GangType {
  id: string;
  gang_type: string;
  edition_id?: string | null;
  parent_gang_type_id?: string | null;
}

interface ScenarioTableEntryRow extends ScenarioTableEntry {
  crew_rules: ScenarioCrewSelectionRule[];
}

interface SectionProps {
  onClose: () => void;
}

const TABLES_QUERY_KEY = ['admin-scenario-tables'];
const ENTRIES_QUERY_KEY = ['admin-scenario-table-entries'];

function verb(operation: OperationType): { doing: string; done: string } {
  switch (operation) {
    case OperationType.POST: return { doing: 'create', done: 'created' };
    case OperationType.UPDATE: return { doing: 'update', done: 'updated' };
    case OperationType.DELETE: return { doing: 'delete', done: 'deleted' };
  }
}

async function submitJson(url: string, operation: OperationType, payload: object) {
  const method = operation === OperationType.POST ? 'POST' : operation === OperationType.UPDATE ? 'PATCH' : 'DELETE';
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to ${verb(operation).doing}`);
  }
  return operation === OperationType.DELETE ? null : response.json();
}

function useScenarioTables() {
  return useQuery<ScenarioTable[]>({
    queryKey: TABLES_QUERY_KEY,
    queryFn: async () => {
      const response = await fetch('/api/admin/scenario-tables');
      if (!response.ok) throw new Error('Failed to fetch scenario tables');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useGangTypes() {
  // detailed=1 carries parent_gang_type_id, so house tables can be offered
  // only the houses themselves.
  return useQuery<GangType[]>({
    queryKey: ['admin-gang-types', 'detailed'],
    queryFn: async () => {
      const response = await fetch('/api/admin/gang-types?detailed=1');
      if (!response.ok) throw new Error('Failed to fetch gang types');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Core tables first within each type, then by name. */
function compareTables(a: ScenarioTable, b: ScenarioTable): number {
  return (
    SCENARIO_TABLE_TYPES.indexOf(a.table_type) - SCENARIO_TABLE_TYPES.indexOf(b.table_type) ||
    Number(a.gang_type_id !== null) - Number(b.gang_type_id !== null) ||
    a.name.localeCompare(b.name)
  );
}

function tableSelectOption(table: ScenarioTable, gangTypes: GangType[]) {
  const gangTypeName = table.gang_type_id
    ? gangTypes.find(gt => gt.id === table.gang_type_id)?.gang_type
    : undefined;
  const detail = [SCENARIO_TABLE_TYPE_LABELS[table.table_type], gangTypeName].filter(Boolean).join(' • ');
  return {
    value: table.id,
    label: (
      <span className="inline-flex items-baseline gap-1">
        <span>{table.name}</span>
        <span className="text-xs text-muted-foreground">{`• ${detail}`}</span>
      </span>
    ),
    displayValue: `${table.name} • ${detail}`,
  };
}

function SectionFooter({
  entityLabel,
  isCreateMode,
  selectedId,
  canSubmit,
  isLoading,
  onClose,
  onSubmit,
}: {
  entityLabel: string;
  isCreateMode: boolean;
  selectedId: string;
  canSubmit: boolean;
  isLoading: boolean;
  onClose: () => void;
  onSubmit: (operation: OperationType) => void;
}) {
  return (
    <div className="border-t px-[10px] py-2 flex flex-wrap justify-end gap-2">
      <Button variant="outline" onClick={onClose} disabled={isLoading} className="flex-1">
        Cancel
      </Button>

      {isCreateMode && (
        <Button
          onClick={() => onSubmit(OperationType.POST)}
          disabled={!canSubmit || isLoading}
          className="flex-1 bg-neutral-900 text-white rounded-sm hover:bg-gray-800"
        >
          {isLoading ? 'Creating...' : `Create ${entityLabel}`}
        </Button>
      )}

      {!isCreateMode && selectedId && (
        <>
          <Button
            onClick={() => onSubmit(OperationType.UPDATE)}
            disabled={!canSubmit || isLoading}
            className="flex-1 bg-neutral-900 text-white rounded-sm hover:bg-gray-800"
          >
            {isLoading ? 'Updating...' : `Update ${entityLabel}`}
          </Button>
          <Button
            onClick={() => onSubmit(OperationType.DELETE)}
            disabled={isLoading}
            className="flex-1 bg-red-600 text-white rounded-sm hover:bg-red-700"
          >
            {isLoading ? 'Deleting...' : `Delete ${entityLabel}`}
          </Button>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Tables
// ============================================================================

export function ScenarioTablesSection({ onClose }: SectionProps) {
  const queryClient = useQueryClient();

  const [editionId, setEditionId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState('');
  const [tableName, setTableName] = useState('');
  const [tableType, setTableType] = useState<ScenarioTableType | ''>('');
  const [gangTypeId, setGangTypeId] = useState('');
  const [isCreateMode, setIsCreateMode] = useState(false);

  const { data: tables = [], isLoading: isLoadingTables } = useScenarioTables();
  const { data: gangTypes = [], isLoading: isLoadingGangTypes } = useGangTypes();

  const isLoading = isLoadingTables || isLoadingGangTypes || isSubmitting;

  const tableOptions = useMemo(
    () => tables
      .filter(table => !editionId || table.edition_id === editionId)
      .sort(compareTables)
      .map(table => tableSelectOption(table, gangTypes)),
    [tables, gangTypes, editionId]
  );

  const typeOptions = useMemo(
    () => SCENARIO_TABLE_TYPES.map(type => ({ value: type, label: SCENARIO_TABLE_TYPE_LABELS[type] })),
    []
  );

  // Houses only: alternate lists reach their house's tables through
  // parent_gang_type_id, so a table belongs on the house itself.
  const gangTypeOptions = useMemo(
    () => [
      { value: '', label: 'Core (All gangs)' },
      ...gangTypes
        .filter(gt => !gt.parent_gang_type_id && (!editionId || gt.edition_id === editionId))
        .map(gt => ({ value: gt.id, label: gt.gang_type })),
    ],
    [gangTypes, editionId]
  );

  const isFormDisabled = (!isCreateMode && !selectedTableId) || isLoading;
  const canSubmit = Boolean(tableName.trim() && tableType && editionId);

  const resetSelection = () => {
    setSelectedTableId('');
    setTableName('');
    setTableType('');
    setGangTypeId('');
    setIsCreateMode(false);
  };

  const handleEditionChange = (newEditionId: string) => {
    setEditionId(newEditionId);
    const table = tables.find(t => t.id === selectedTableId);
    if (newEditionId && table && table.edition_id !== newEditionId) {
      resetSelection();
    }
    const gangType = gangTypes.find(gt => gt.id === gangTypeId);
    if (gangType && gangType.edition_id !== newEditionId) {
      setGangTypeId('');
    }
  };

  const handleTableSelect = (tableId: string) => {
    const table = tables.find(t => t.id === tableId);
    if (!table) {
      resetSelection();
      return;
    }
    setSelectedTableId(table.id);
    setTableName(table.name);
    setTableType(table.table_type);
    setGangTypeId(table.gang_type_id ?? '');
    setEditionId(table.edition_id);
    setIsCreateMode(false);
  };

  const handleCreateNew = () => {
    resetSelection();
    setIsCreateMode(true);
  };

  const handleSubmit = async (operation: OperationType) => {
    if (operation !== OperationType.DELETE && !canSubmit) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const fields = {
        name: tableName,
        table_type: tableType,
        edition_id: editionId,
        gang_type_id: gangTypeId || null,
      };
      const result: ScenarioTable | null = await submitJson(
        '/api/admin/scenario-tables',
        operation,
        operation === OperationType.POST ? fields
          : operation === OperationType.UPDATE ? { id: selectedTableId, ...fields }
          : { id: selectedTableId }
      );

      toast.success(`Table ${verb(operation).done} successfully`);
      await queryClient.invalidateQueries({ queryKey: TABLES_QUERY_KEY });

      if (operation === OperationType.DELETE) {
        resetSelection();
      } else if (result) {
        setSelectedTableId(result.id);
        setIsCreateMode(false);
      }
    } catch (error) {
      console.error(`Error executing ${operation} table operation:`, error);
      toast.error(error instanceof Error ? error.message : `Failed to ${verb(operation).doing} table`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="px-[10px] py-4">
        <div className="space-y-4">
          <EditionSelect value={editionId} onChange={handleEditionChange} defaultToCurrent />

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-muted-foreground">
                Select Table
              </label>
              <Button onClick={handleCreateNew} disabled={isLoading} className="text-xs h-7 px-3">
                Create New
              </Button>
            </div>
            <Combobox
              value={selectedTableId}
              onValueChange={handleTableSelect}
              options={tableOptions}
              placeholder="Select a table to edit"
              clearable
              disabled={isLoading}
              showLabelWhenClosed
            />
            {isCreateMode && (
              <p className="text-xs text-amber-600 mt-1">
                Creating new table. Select from dropdown to cancel and edit existing.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Table Name *
            </label>
            <Input
              type="text"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder="E.g. Deployment Table, Goliath Side Jobs"
              className="w-full"
              disabled={isFormDisabled}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Type *
            </label>
            <Combobox
              value={tableType}
              onValueChange={(value) => setTableType(value as ScenarioTableType)}
              options={typeOptions}
              placeholder="Select a type"
              disabled={isFormDisabled}
            />
            <p className="text-xs text-muted-foreground mt-1">
              The type cannot change once the table has entries.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Gang Type
            </label>
            <Combobox
              value={gangTypeId}
              onValueChange={setGangTypeId}
              options={gangTypeOptions}
              placeholder="Core (All gangs)"
              disabled={isFormDisabled}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Core (All gangs) is the table every gang rolls on; each edition has one per type. A house table offers that house an alternative, and its alternate lists use it too.
            </p>
          </div>
        </div>
      </div>

      <SectionFooter
        entityLabel="Table"
        isCreateMode={isCreateMode}
        selectedId={selectedTableId}
        canSubmit={canSubmit}
        isLoading={isLoading}
        onClose={onClose}
        onSubmit={handleSubmit}
      />
    </>
  );
}

// ============================================================================
// Entries
// ============================================================================

type CrewRuleKey = 'both' | CrewSelectionRole;

interface CrewRuleForm {
  chosen: string;
  random: string;
  reinforcements: boolean;
  reinforcementCount: string;
  perRound: string;
  fromRound: string;
}

const EMPTY_CREW_RULE: CrewRuleForm = {
  chosen: '',
  random: '',
  reinforcements: false,
  reinforcementCount: '',
  perRound: 'D3',
  fromRound: '1',
};

const EMPTY_CREW_RULES: Record<CrewRuleKey, CrewRuleForm> = {
  both: EMPTY_CREW_RULE,
  attacker: EMPTY_CREW_RULE,
  defender: EMPTY_CREW_RULE,
};

function crewRuleToForm(rule: ScenarioCrewSelectionRule | undefined): CrewRuleForm {
  if (!rule) return EMPTY_CREW_RULE;
  return {
    chosen: rule.chosen_count === '0' ? '' : rule.chosen_count,
    random: rule.random_count === '0' ? '' : rule.random_count,
    reinforcements: rule.reinforcement_count != null,
    reinforcementCount: rule.reinforcement_count == null ? '' : String(rule.reinforcement_count),
    perRound: rule.reinforcements_per_round ?? 'D3',
    fromRound: rule.reinforcements_from_round == null ? '1' : String(rule.reinforcements_from_round),
  };
}

function formToCrewRule(form: CrewRuleForm, role: CrewSelectionRole | null): ScenarioCrewSelectionRule {
  return {
    role,
    chosen_count: form.chosen.trim().toUpperCase() || '0',
    random_count: form.random.trim().toUpperCase() || '0',
    reinforcement_count: form.reinforcements ? Number(form.reinforcementCount) : null,
    reinforcements_per_round: form.reinforcements ? form.perRound.trim().toUpperCase() : null,
    reinforcements_from_round: form.reinforcements ? Number(form.fromRound) : null,
  };
}

/** Why a rule cannot be saved yet, or null when it can. */
function crewRuleProblem(form: CrewRuleForm): string | null {
  const chosen = form.chosen.trim().toUpperCase() || '0';
  const random = form.random.trim().toUpperCase() || '0';
  if (!DICE_NOTATION_RE.test(chosen) || !DICE_NOTATION_RE.test(random)) {
    return 'Chosen and Random take a number or dice, e.g. 3, D3 or D3+1';
  }
  if (chosen === '0' && random === '0') {
    return 'Set Chosen, Random, or both';
  }
  if (form.reinforcements) {
    const isPositiveInt = (value: string) => /^[1-9][0-9]*$/.test(value.trim());
    if (!isPositiveInt(form.reinforcementCount) || !isPositiveInt(form.fromRound)) {
      return 'Reinforcements and From Round take a whole number of 1 or more';
    }
    if (!DICE_NOTATION_RE.test(form.perRound.trim().toUpperCase())) {
      return 'Per Round takes a number or dice, e.g. D3';
    }
  }
  return null;
}

function CrewRuleFields({
  title,
  idPrefix,
  value,
  onChange,
  disabled,
}: {
  title: string;
  idPrefix: string;
  value: CrewRuleForm;
  onChange: (value: CrewRuleForm) => void;
  disabled: boolean;
}) {
  const problem = crewRuleProblem(value);
  const set = (patch: Partial<CrewRuleForm>) => onChange({ ...value, ...patch });

  return (
    <div className="rounded-md border p-3 space-y-3">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">Chosen</label>
          <Input
            type="text"
            value={value.chosen}
            onChange={(e) => set({ chosen: e.target.value })}
            placeholder="E.g. 3"
            disabled={disabled}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">Random</label>
          <Input
            type="text"
            value={value.random}
            onChange={(e) => set({ random: e.target.value })}
            placeholder="E.g. D3"
            disabled={disabled}
          />
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id={`${idPrefix}-reinforcements`}
          checked={value.reinforcements}
          onCheckedChange={(checked) => set({ reinforcements: checked === true })}
          disabled={disabled}
        />
        <label
          htmlFor={`${idPrefix}-reinforcements`}
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          Reinforcements
        </label>
      </div>

      {value.reinforcements && (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Reinforcements</label>
            <Input
              type="text"
              inputMode="numeric"
              value={value.reinforcementCount}
              onChange={(e) => set({ reinforcementCount: e.target.value })}
              placeholder="E.g. 5"
              disabled={disabled}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Per Round</label>
            <Input
              type="text"
              value={value.perRound}
              onChange={(e) => set({ perRound: e.target.value })}
              placeholder="E.g. D3"
              disabled={disabled}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">From Round</label>
            <Input
              type="text"
              inputMode="numeric"
              value={value.fromRound}
              onChange={(e) => set({ fromRound: e.target.value })}
              placeholder="E.g. 1"
              disabled={disabled}
            />
          </div>
        </div>
      )}

      <p className={`text-xs ${problem ? 'text-amber-600' : 'text-muted-foreground'}`}>
        {problem ?? describeCrewSelectionRule(formToCrewRule(value, null))}
      </p>
    </div>
  );
}

export function ScenarioTableEntriesSection({ onClose }: SectionProps) {
  const queryClient = useQueryClient();

  const [editionId, setEditionId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tableId, setTableId] = useState('');
  const [selectedEntryId, setSelectedEntryId] = useState('');
  const [entryName, setEntryName] = useState('');
  const [d6Min, setD6Min] = useState('');
  const [d6Max, setD6Max] = useState('');
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [crewPerRole, setCrewPerRole] = useState(false);
  const [crewRules, setCrewRules] = useState(EMPTY_CREW_RULES);

  const { data: tables = [], isLoading: isLoadingTables } = useScenarioTables();
  const { data: gangTypes = [], isLoading: isLoadingGangTypes } = useGangTypes();
  const { data: entries = [], isLoading: isLoadingEntries } = useQuery<ScenarioTableEntryRow[]>({
    queryKey: ENTRIES_QUERY_KEY,
    queryFn: async () => {
      const response = await fetch('/api/admin/scenario-table-entries');
      if (!response.ok) throw new Error('Failed to fetch scenario table entries');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = isLoadingTables || isLoadingGangTypes || isLoadingEntries || isSubmitting;

  const selectedTable = tables.find(t => t.id === tableId);
  const isCrewTable = selectedTable?.table_type === 'crew_selection';

  const tableOptions = useMemo(
    () => tables
      .filter(table => !editionId || table.edition_id === editionId)
      .sort(compareTables)
      .map(table => tableSelectOption(table, gangTypes)),
    [tables, gangTypes, editionId]
  );

  const tableEntries = useMemo(
    () => entries.filter(entry => entry.scenario_table_id === tableId).sort(compareScenarioTableEntries),
    [entries, tableId]
  );

  const entryOptions = useMemo(
    () => tableEntries.map(entry => ({
      value: entry.id,
      label: `${formatD6Range(entry.d6_min, entry.d6_max)}. ${entry.name}`,
    })),
    [tableEntries]
  );

  const isMetaDisabled = (!isCreateMode && !selectedEntryId) || isLoading;
  const isFieldsDisabled = isMetaDisabled || !tableId;

  const d6MinValue = Number(d6Min);
  const d6MaxValue = Number(d6Max);
  const d6Valid =
    /^[1-6]$/.test(d6Min.trim()) &&
    /^[1-6]$/.test(d6Max.trim()) &&
    d6MinValue <= d6MaxValue;

  const activeCrewKeys: CrewRuleKey[] = crewPerRole ? ['attacker', 'defender'] : ['both'];
  const crewRulesValid = !isCrewTable || activeCrewKeys.every(key => crewRuleProblem(crewRules[key]) === null);
  const canSubmit = Boolean(entryName.trim() && tableId && d6Valid && crewRulesValid);

  const clearEntryFields = () => {
    setEntryName('');
    setD6Min('');
    setD6Max('');
    setCrewPerRole(false);
    setCrewRules(EMPTY_CREW_RULES);
  };

  const resetEntrySelection = () => {
    setSelectedEntryId('');
    clearEntryFields();
    setIsCreateMode(false);
  };

  const handleEditionChange = (newEditionId: string) => {
    setEditionId(newEditionId);
    if (newEditionId && selectedTable && selectedTable.edition_id !== newEditionId) {
      setTableId('');
      resetEntrySelection();
    }
  };

  const handleTableChange = (newTableId: string) => {
    setTableId(newTableId);
    if (!isCreateMode) {
      resetEntrySelection();
    }
  };

  const populateFromEntry = (entry: ScenarioTableEntryRow) => {
    setEntryName(entry.name);
    setD6Min(String(entry.d6_min));
    setD6Max(String(entry.d6_max));
    const perRole = entry.crew_rules.some(rule => rule.role !== null);
    setCrewPerRole(perRole);
    setCrewRules({
      both: crewRuleToForm(entry.crew_rules.find(rule => rule.role === null)),
      attacker: crewRuleToForm(entry.crew_rules.find(rule => rule.role === 'attacker')),
      defender: crewRuleToForm(entry.crew_rules.find(rule => rule.role === 'defender')),
    });
  };

  const handleEntrySelect = (entryId: string) => {
    const entry = entries.find(e => e.id === entryId);
    if (!entry) {
      resetEntrySelection();
      return;
    }
    setSelectedEntryId(entry.id);
    populateFromEntry(entry);
    setIsCreateMode(false);
  };

  const handleCreateNew = () => {
    setSelectedEntryId('');
    clearEntryFields();
    // Suggest the next free line, since tables are entered top to bottom.
    const next = tableEntries.reduce((max, entry) => Math.max(max, entry.d6_max), 0) + 1;
    if (next <= 6) {
      setD6Min(String(next));
      setD6Max(String(next));
    }
    setIsCreateMode(true);
  };

  const handleSubmit = async (operation: OperationType) => {
    if (operation !== OperationType.DELETE && !canSubmit) {
      toast.error(
        !d6Valid
          ? 'D6 Min and Max must be 1 to 6, with Min no higher than Max'
          : 'Please fill in all required fields'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const fields = {
        name: entryName,
        scenario_table_id: tableId,
        d6_min: d6MinValue,
        d6_max: d6MaxValue,
        ...(isCrewTable && {
          crew_rules: crewPerRole
            ? [formToCrewRule(crewRules.attacker, 'attacker'), formToCrewRule(crewRules.defender, 'defender')]
            : [formToCrewRule(crewRules.both, null)],
        }),
      };
      const result: ScenarioTableEntryRow | null = await submitJson(
        '/api/admin/scenario-table-entries',
        operation,
        operation === OperationType.POST ? fields
          : operation === OperationType.UPDATE ? { id: selectedEntryId, ...fields }
          : { id: selectedEntryId }
      );

      toast.success(`Entry ${verb(operation).done} successfully`);
      await queryClient.invalidateQueries({ queryKey: ENTRIES_QUERY_KEY });

      if (operation === OperationType.DELETE) {
        resetEntrySelection();
      } else if (result) {
        setSelectedEntryId(result.id);
        populateFromEntry(result);
        setIsCreateMode(false);
      }
    } catch (error) {
      console.error(`Error executing ${operation} entry operation:`, error);
      toast.error(error instanceof Error ? error.message : `Failed to ${verb(operation).doing} entry`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="px-[10px] py-4">
        <div className="space-y-4">
          <EditionSelect value={editionId} onChange={handleEditionChange} defaultToCurrent />

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Table *
            </label>
            <Combobox
              value={tableId}
              onValueChange={handleTableChange}
              options={tableOptions}
              placeholder="Select a table"
              clearable
              disabled={isLoading}
              showLabelWhenClosed
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-muted-foreground">
                Select Entry
              </label>
              <Button onClick={handleCreateNew} disabled={isLoading || !tableId} className="text-xs h-7 px-3">
                Create New
              </Button>
            </div>
            <Combobox
              value={selectedEntryId}
              onValueChange={handleEntrySelect}
              options={entryOptions}
              placeholder={tableId ? 'Select an entry to edit' : 'Select a table first'}
              clearable
              disabled={isLoading || !tableId}
            />
            {isCreateMode && (
              <p className="text-xs text-amber-600 mt-1">
                Creating new entry. Select from dropdown to cancel and edit existing.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Entry Name *
            </label>
            <Input
              type="text"
              value={entryName}
              onChange={(e) => setEntryName(e.target.value)}
              placeholder="E.g. Sniping Range, King of the Hive"
              className="w-full"
              disabled={isFieldsDisabled}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                D6 Min *
              </label>
              <Input
                type="text"
                inputMode="numeric"
                value={d6Min}
                onChange={(e) => setD6Min(e.target.value)}
                placeholder="E.g. 1"
                className="w-full"
                disabled={isFieldsDisabled}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                D6 Max *
              </label>
              <Input
                type="text"
                inputMode="numeric"
                value={d6Max}
                onChange={(e) => setD6Max(e.target.value)}
                placeholder="E.g. 1"
                className="w-full"
                disabled={isFieldsDisabled}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Most lines are a single result, so Min and Max are usually the same.
          </p>

          {isCrewTable && (
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="crew-per-role"
                  checked={crewPerRole}
                  onCheckedChange={(checked) => setCrewPerRole(checked === true)}
                  disabled={isFieldsDisabled}
                />
                <label
                  htmlFor="crew-per-role"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Different crew rules for attacker and defender
                </label>
              </div>
              {activeCrewKeys.map(key => (
                <CrewRuleFields
                  key={key}
                  title={key === 'both' ? 'Both gangs' : key === 'attacker' ? 'Attacker' : 'Defender'}
                  idPrefix={`crew-${key}`}
                  value={crewRules[key]}
                  onChange={(value) => setCrewRules(prev => ({ ...prev, [key]: value }))}
                  disabled={isFieldsDisabled}
                />
              ))}
              <p className="text-xs text-muted-foreground">
                Chosen fighters are picked by the player, then Random ones are drawn: Hybrid (3+D3) is Chosen 3, Random D3.
              </p>
            </div>
          )}
        </div>
      </div>

      <SectionFooter
        entityLabel="Entry"
        isCreateMode={isCreateMode}
        selectedId={selectedEntryId}
        canSubmit={canSubmit}
        isLoading={isLoading}
        onClose={onClose}
        onSubmit={handleSubmit}
      />
    </>
  );
}
