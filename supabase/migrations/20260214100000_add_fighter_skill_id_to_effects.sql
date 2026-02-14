-- Add fighter_skill_id to fighter_effects for skill-linked effects
-- This column links effects that are automatically created when a skill is added.
-- ON DELETE CASCADE ensures effects are removed when the skill is deleted.
ALTER TABLE fighter_effects
ADD COLUMN IF NOT EXISTS fighter_skill_id UUID REFERENCES fighter_skills(id) ON DELETE CASCADE;
