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

alter table public.skills
  add constraint skills_skill_type_id_fkey
  foreign key (skill_type_id) references public.skill_types(id)
  on delete restrict;
