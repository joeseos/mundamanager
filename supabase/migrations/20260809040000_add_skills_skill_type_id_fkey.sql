-- skills.skill_type_id has always been a bare uuid: the column references
-- skill_types by convention, but no constraint ever enforced it. Without the
-- FK, PostgREST cannot resolve a skills -> skill_types embed and rejects the
-- whole query with PGRST200. That broke Default Skills in the admin fighter
-- type modals after the edition-aware skills API started embedding
-- skill_types to filter by edition_id (#1948).
--
-- ON DELETE RESTRICT: deleting a skill set must not silently wipe its skills
-- (those skills may still be referenced by fighter_skills / fighter_defaults
-- with NO ACTION FKs).

-- Drop skills whose skill_type_id no longer points at a skill_types row so the
-- FK can be added on every environment. No-op when already clean; fails loudly
-- if an orphan is still referenced by fighter_skills / fighter_defaults.
delete from public.skills s
where s.skill_type_id is not null
  and not exists (
    select 1 from public.skill_types st where st.id = s.skill_type_id
  );

alter table public.skills
  add constraint skills_skill_type_id_fkey
  foreign key (skill_type_id) references public.skill_types(id)
  on delete restrict;
