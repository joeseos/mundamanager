-- Participation XP already awarded in a battle session, per fighter
--
-- The post-battle Participation XP modal used to add its numbers to the
-- fighters every time it was confirmed. Reopening it to fix one fighter paid
-- everyone again. The participant row now keeps what was awarded
-- ({ fighter_id: xp }), so the modal reopens with those numbers and a confirm
-- pays only the difference, up or down.

ALTER TABLE public.battle_session_participants
  ADD COLUMN IF NOT EXISTS participation_xp jsonb NOT NULL DEFAULT '{}'::jsonb;
