-- Fighter types granted or denied by a gang's scope.
--
-- The fighter-type counterpart of equipment_availability, carrying the same three gang-scope
-- axes (gang_type_id / gang_origin_id / gang_subtype_id) plus fighter_type_equipment's
-- grant/deny polarity. Per-column semantics are in the COMMENT ON COLUMN statements below.
--
-- Until now app/api/fighter-types/route.ts hardcoded both halves of this. Grants came from
-- string-matching a hidden gang type named 'Subtype: <name>'; denies were a single literal set
-- (`subtypesWithoutLeaders = new Set(['secundan incursion'])`). Neither could express the N26
-- rule that a gang holding Malstrain Corrupted may not add its own gang type's Brutes, and the
-- name-matching actively got in the way: 'Malstrain Corrupted' exists in both N23 and N26, but
-- only the N26 gang loses its Brutes -- the N23 subtype pool is itself two Brutes. Keying on
-- gang_subtype_types.id, which is per-edition, is what keeps those two apart.
--
-- excluded exists because scoping alone cannot take something away: a deny has to remove a
-- fighter the base catalogue already offers, and adding more grants cannot subtract those.
--
-- Ordering matters and lives in the route, not here: denies apply to the gang type's own pool
-- BEFORE grants are appended. Secundan Incursion denies 'Leader' and grants four Spyre Hunters
-- that are themselves ["Leader"] -- a deny evaluated over the whole result would leave those
-- gangs with no addable leader at all.

CREATE TABLE public.fighter_type_availability (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz,

    -- what the row acts on: exactly one of these
    fighter_type_id uuid        REFERENCES public.fighter_types(id) ON DELETE CASCADE,
    fighter_subtype text,

    -- gang scope: every non-NULL axis must match, at least one must be set
    gang_type_id    uuid        REFERENCES public.gang_types(gang_type_id) ON DELETE CASCADE,
    gang_origin_id  uuid        REFERENCES public.gang_origins(id) ON DELETE CASCADE,
    gang_subtype_id uuid        REFERENCES public.gang_subtype_types(id) ON DELETE CASCADE,

    excluded        boolean     NOT NULL DEFAULT false,

    CONSTRAINT fighter_type_availability_target_chk CHECK (
        (fighter_type_id IS NOT NULL) <> (fighter_subtype IS NOT NULL)
        AND (excluded OR fighter_type_id IS NOT NULL)
    ),
    CONSTRAINT fighter_type_availability_scope_chk CHECK (
        num_nonnulls(gang_type_id, gang_origin_id, gang_subtype_id) >= 1
    )
);

COMMENT ON COLUMN public.fighter_type_availability.fighter_type_id IS
  'The fighter type this row acts on. With excluded=false it is granted to gangs matching the '
  'scope; with excluded=true just this one is denied. Required for a grant -- "grant every '
  'Brute" names no fighter to add -- which fighter_type_availability_target_chk enforces.';
COMMENT ON COLUMN public.fighter_type_availability.fighter_subtype IS
  'Deny-only alternative to fighter_type_id: every fighter carrying this subtype name, matched '
  'against fighter_types.fighter_subtypes. A name rather than an FK because subtypes are stored '
  'as names in jsonb arrays throughout; see 20260806120000. Mirrors '
  'fighter_type_equipment.fighter_subtype.';
COMMENT ON COLUMN public.fighter_type_availability.gang_type_id IS
  'Restricts the row to gangs of this gang type. NULL applies regardless of gang type.';
COMMENT ON COLUMN public.fighter_type_availability.gang_origin_id IS
  'Restricts the row to gangs with this origin (gangs.gang_origin_id). NULL applies regardless '
  'of origin.';
COMMENT ON COLUMN public.fighter_type_availability.gang_subtype_id IS
  'Restricts the row to gangs holding this subtype (gangs.gang_subtypes contains the id). '
  'Per-edition by construction, so an N26 rule cannot reach the N23 re-issue of the same '
  'subtype. NULL applies regardless of subtype.';
COMMENT ON COLUMN public.fighter_type_availability.excluded IS
  'false grants the fighter type to gangs matching this row''s scope; true denies it, removing '
  'it from the gang type''s own pool even where the base catalogue offers it. A deny never '
  'strips a fighter that a grant row supplied -- see the ordering note in the table comment.';
COMMENT ON CONSTRAINT fighter_type_availability_scope_chk ON public.fighter_type_availability IS
  'At least one scope axis must be set. An all-NULL scope would grant or deny a fighter type for '
  'every gang in the game, which is a data-entry mistake rather than an intended rule.';

-- One row per target/scope combination. NULLS NOT DISTINCT because the default would let two
-- identical scopes both through, which is the duplicate this prevents. excluded is deliberately
-- not in the key, so a grant and a deny for one scope collide and the contradictory pair cannot
-- be stored -- same reasoning as fighter_type_equipment_fighter_scope_uidx.
CREATE UNIQUE INDEX fighter_type_availability_scope_uidx
    ON public.fighter_type_availability
       (fighter_type_id, fighter_subtype, gang_type_id, gang_origin_id, gang_subtype_id)
    NULLS NOT DISTINCT;

-- The three gang-scope columns are what the route probes to find a gang's rules. No index on
-- fighter_subtype: fighter_type_equipment has one because get_equipment_detailed_data joins on
-- it, whereas here that column is only ever evaluated in the route.
CREATE INDEX fighter_type_availability_fighter_type_id_idx
    ON public.fighter_type_availability (fighter_type_id);
CREATE INDEX fighter_type_availability_gang_type_id_idx
    ON public.fighter_type_availability (gang_type_id);
CREATE INDEX fighter_type_availability_gang_origin_id_idx
    ON public.fighter_type_availability (gang_origin_id);
CREATE INDEX fighter_type_availability_gang_subtype_id_idx
    ON public.fighter_type_availability (gang_subtype_id);

ALTER TABLE public.fighter_type_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view fighter_type_availability"
    ON public.fighter_type_availability
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY fighter_type_availability_admin_insert_policy
    ON public.fighter_type_availability
    FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY fighter_type_availability_admin_update_policy
    ON public.fighter_type_availability
    FOR UPDATE
    TO authenticated
    USING ((SELECT private.is_admin()))
    WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY fighter_type_availability_admin_delete_policy
    ON public.fighter_type_availability
    FOR DELETE
    TO authenticated
    USING ((SELECT private.is_admin()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fighter_type_availability
    TO authenticated, service_role;

-- Seed the grants from the 'Subtype: <name>' pools the route matched by name until now, so
-- behaviour is unchanged by this migration. Derived rather than written out as literals, so it
-- stays honest about where the data came from: 30 rows across six subtypes today.
--
-- 'Subtype: Genestealer Corrupted' (N26) is deliberately not reached by this join -- the N26
-- gang_subtype_types row is named 'Genestealer Infected', so the name convention never matched
-- that pool either. Reviving it would hand those gangs fighters they do not currently get.
INSERT INTO public.fighter_type_availability (fighter_type_id, gang_subtype_id, excluded)
SELECT ft.id, gst.id, false
FROM public.gang_subtype_types gst
JOIN public.gang_types gt
  ON gt.gang_type = ('Subtype: ' || gst.subtype)
 AND gt.edition_id = gst.edition_id
JOIN public.fighter_types ft ON ft.gang_type_id = gt.gang_type_id
ON CONFLICT DO NOTHING;

-- The denies. Resolved by subtype name + edition rather than by literal id: the same subtype
-- name exists in both editions and the two ids are not guessable from the name.
INSERT INTO public.fighter_type_availability (fighter_subtype, gang_subtype_id, excluded)
SELECT v.fighter_subtype, gst.id, true
FROM (VALUES
    -- Migrated from the route's subtypesWithoutLeaders hardcode. The four Spyre Hunters granted
    -- above replace the gang's own Leaders.
    ('Secundan Incursion',  'n23', 'Leader'),
    -- A gang holding Malstrain Corrupted may not add its own gang type's Brutes. N26 only: the
    -- N23 Malstrain pool is itself two Brutes and is unaffected.
    ('Malstrain Corrupted', 'n26', 'Brute')
) AS v(subtype, edition_slug, fighter_subtype)
JOIN public.editions e ON e.slug = v.edition_slug
JOIN public.gang_subtype_types gst
  ON gst.subtype = v.subtype
 AND gst.edition_id = e.id
ON CONFLICT DO NOTHING;
