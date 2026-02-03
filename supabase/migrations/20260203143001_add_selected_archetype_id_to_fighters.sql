-- Add selected_archetype_id column to fighters table
-- Allows Underhive Outcasts Leaders/Champions to select a skill archetype

ALTER TABLE public.fighters
    ADD COLUMN selected_archetype_id uuid;

-- Add foreign key constraint with SET NULL on delete
ALTER TABLE ONLY public.fighters
    ADD CONSTRAINT fighters_selected_archetype_id_fkey
        FOREIGN KEY (selected_archetype_id)
        REFERENCES public.skill_access_archetypes(id)
        ON DELETE SET NULL;

-- Add index for faster lookups
CREATE INDEX idx_fighters_selected_archetype_id
    ON public.fighters(selected_archetype_id)
    WHERE selected_archetype_id IS NOT NULL;
