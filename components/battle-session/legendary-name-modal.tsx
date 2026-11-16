'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Modal from '@/components/ui/modal';
import { Combobox } from '@/components/ui/combobox';
import { addEarnedLegendaryName } from '@/app/actions/fighter-advancement';

interface SetSkill {
  skill_id: string;
  skill_name: string;
  available: boolean;
  usable?: boolean;
}

/** N26: a fighter who earns 5+ XP in a battle may gain a Legendary Name for free (+5 credits, not an Advancement). */
export function LegendaryNameModal({
  fighterId,
  fighterName,
  skillTypeId,
  onAdded,
  onClose,
}: {
  fighterId: string;
  fighterName: string;
  skillTypeId: string;
  onAdded?: () => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [skillId, setSkillId] = useState('');

  const { data: skills = [], isLoading } = useQuery({
    queryKey: ['fighter-skill-access', fighterId, skillTypeId],
    queryFn: async () => {
      const res = await fetch(
        `/api/fighters/skill-access?fighterId=${encodeURIComponent(fighterId)}&skillTypeId=${encodeURIComponent(skillTypeId)}`
      );
      if (!res.ok) throw new Error('Failed to load Legendary Names');
      const data = (await res.json()) as { skills?: SetSkill[] };
      return data.skills ?? [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const result = await addEarnedLegendaryName({ fighter_id: fighterId, skill_id: skillId });
      if (!result.success) throw new Error(result.error);
    },
    onSuccess: () => {
      toast.success(`${fighterName} gained a Legendary Name`);
      queryClient.invalidateQueries({ queryKey: ['fighter-skill-access', fighterId] });
      onAdded?.();
      onClose();
    },
    onError: (error) => toast.error(error.message || 'Failed to add the Legendary Name'),
  });

  return (
    <Modal
      title="Add Legendary Name"
      helper={fighterName}
      onClose={onClose}
      onConfirm={async () => {
        addMutation.mutate();
        return false;
      }}
      confirmText="Confirm"
      confirmDisabled={!skillId || addMutation.isPending}
      width="md"
    >
      <div className="space-y-3 text-left">
        <p className="text-sm text-muted-foreground">
          A fighter who earned 5 or more XP in this battle may gain a Legendary Name for free. It is not an
          Advancement and adds 5 credits to the fighter&apos;s value.
        </p>
        <Combobox
          options={skills
            .filter((s) => s.available && s.usable !== false)
            .sort((a, b) => a.skill_name.localeCompare(b.skill_name))
            .map((s) => ({ value: s.skill_id, label: s.skill_name }))}
          value={skillId}
          onValueChange={setSkillId}
          placeholder="Select a Legendary Name"
          disabled={isLoading}
        />
      </div>
    </Modal>
  );
}
