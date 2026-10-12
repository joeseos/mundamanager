'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScenarioEntryPicker } from '@/components/scenario-entry-picker';
import { setSideJobCompleted, updateParticipantSideJob } from '@/app/actions/battle-sessions';
import type { ScenarioTableWithEntries } from '@/types/campaign';
import type { BattleSessionParticipant } from '@/types/battle-session';

interface ParticipantSideJobProps {
  sessionId: string;
  participant: BattleSessionParticipant;
  /** The session edition's scenario tables. */
  scenarioTables: ScenarioTableWithEntries[];
  /** Pre-battle: the gang's owner or the session's manager picks the Side Job. */
  canPick: boolean;
  /** Post-battle: the gang's owner or an arbitrator records whether it was completed. */
  canComplete: boolean;
  onSaved?: () => void;
}

/**
 * An N26 gang's Side Job in a battle session: rolled before the battle, on the
 * core table or, for a house gang, its house's; marked completed after it.
 */
export function ParticipantSideJob({
  sessionId,
  participant,
  scenarioTables,
  canPick,
  canComplete,
  onSaved,
}: ParticipantSideJobProps) {
  const coreTable = scenarioTables.find((table) => table.table_type === 'side_job' && !table.gang_type_id);
  const gangTypeId = participant.gang?.gang_type_id;
  // A house table also serves the house's alternate lists.
  const houseTable = gangTypeId
    ? scenarioTables.find((table) => table.table_type === 'side_job' && table.gang_type_ids.includes(gangTypeId))
    : undefined;

  const [sideJobId, setSideJobId] = useState(participant.side_job_id ?? '');
  const [completed, setCompleted] = useState(participant.side_job_completed === true);
  const [houseChosen, setHouseChosen] = useState(false);
  // Follow what other players save, as the role does.
  const [saved, setSaved] = useState([participant.side_job_id, participant.side_job_completed]);
  if (saved[0] !== participant.side_job_id || saved[1] !== participant.side_job_completed) {
    setSaved([participant.side_job_id, participant.side_job_completed]);
    setSideJobId(participant.side_job_id ?? '');
    setCompleted(participant.side_job_completed === true);
  }

  const entry = [coreTable, houseTable]
    .flatMap((table) => table?.entries ?? [])
    .find((candidate) => candidate.id === sideJobId);
  const fromHouse = sideJobId ? !!houseTable?.entries.some((e) => e.id === sideJobId) : houseChosen;

  const pick = (id: string) => {
    const previous = sideJobId;
    setSideJobId(id);
    setCompleted(false);
    updateParticipantSideJob(sessionId, participant.id, id || null).then((result) => {
      if (result.success) {
        onSaved?.();
      } else {
        setSideJobId(previous);
        toast.error(result.error || 'Failed to update Side Job');
      }
    });
  };

  const complete = (checked: boolean) => {
    setCompleted(checked);
    setSideJobCompleted(sessionId, participant.id, checked).then((result) => {
      if (result.success) {
        onSaved?.();
      } else {
        setCompleted(!checked);
        toast.error(result.error || 'Failed to update Side Job');
      }
    });
  };

  if (!canPick && !sideJobId) return null;

  return (
    <div className="mt-2 space-y-2">
      {canPick ? (
        <>
          {houseTable && (
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {[
                { house: false, name: 'Core Side Jobs' },
                { house: true, name: houseTable.name },
              ].map(({ house, name }) => (
                <div key={name} className="flex items-center space-x-2">
                  <Checkbox
                    id={`side-job-table-${participant.id}-${house ? 'house' : 'core'}`}
                    checked={fromHouse === house}
                    onCheckedChange={() => {
                      if (fromHouse === house) return;
                      setHouseChosen(house);
                      if (sideJobId) pick('');
                    }}
                  />
                  <Label htmlFor={`side-job-table-${participant.id}-${house ? 'house' : 'core'}`} className="text-sm">
                    {name}
                  </Label>
                </div>
              ))}
            </div>
          )}
          <ScenarioEntryPicker
            label="Side Job"
            entries={(fromHouse ? houseTable : coreTable)?.entries ?? []}
            value={sideJobId}
            onChange={pick}
            placeholder="Select a Side Job"
          />
        </>
      ) : (
        <p className="text-sm">
          <span className="text-muted-foreground">Side Job:</span>{' '}
          {entry ? `${entry.d6_min}. ${entry.name}` : 'Unknown'}
          {completed && !canComplete && <span className="text-muted-foreground"> (completed)</span>}
        </p>
      )}
      {canComplete && sideJobId && (
        <div className="flex items-center gap-2">
          <Checkbox
            id={`side-job-completed-${participant.id}`}
            checked={completed}
            onCheckedChange={(checked) => complete(checked === true)}
          />
          <Label htmlFor={`side-job-completed-${participant.id}`} className="text-sm">
            Side Job completed
          </Label>
        </div>
      )}
    </div>
  );
}
