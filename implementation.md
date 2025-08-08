## Copy Gang - Implementation Plan

### Goals
- Add a "Copy Gang" feature that duplicates an existing gang and all of its content into a brand new gang owned by the current user.
- UX: One-click icon in the gang header opens a modal prefilled with the new gang name as "<existing name> copy". User can edit and confirm.
- Server: Create a robust server action to perform a deep copy in a single transactional operation for data integrity.

---

### Scope and Decisions
- **What we copy (MVP)**
  - Gang core row (type, colour, alignment, resources, variants, notes, positioning if present), credits, reputation.
  - Fighters with full state: base attributes, labels, notes, positions and flags (killed/starved/retired/enslaved/recovery should be copied as-is).
  - Fighter equipment, skills, effects.
  - Vehicles
    - Gang-owned vehicles (no fighter owner) with their equipment and effects.
    - Fighter-owned vehicles with their equipment and effects.
  - Stash items (equipment rows marked `gang_stash = true`).
  - Special rules and cost adjustments.
- **What we do NOT copy (MVP)**
  - Logs tables (fighter logs, gang logs, equipment logs).
  - Campaign membership and territories.
  - Notifications.
- **IDs**: All inserted entities must receive new IDs. We will maintain in-memory ID maps during the copy to remap relationships.
- **Integrity**: Perform all inserts in a single DB transaction (recommended via SQL function / RPC) to avoid partial copies.

---

### Files and Modules Involved
- Fetch helpers (read-only, reused for preview/UI): `app/lib/shared/gang-data.ts`
- Modal: `components/modal.tsx`
- Gang header (icon row): likely in `components/gang/gang.tsx` or `components/gang/gang-page-content.tsx` (add copy icon to the left of the logs icon)
- New UI component: `components/gang/copy-gang-modal.tsx`
- New server action: `app/actions/copy-gang.ts`

---

### UI/UX
1. **Add Copy Icon**
   - Place to the left of the existing gang logs icon in the gang header.
   - Tooltip: "Copy Gang".
   - On click: open `CopyGangModal`.

2. **`CopyGangModal` component (`components/gang/copy-gang-modal.tsx`)**
   - Uses `Modal` from `components/modal.tsx`.
   - Props: `{ gangId: string, currentName: string, onComplete?: (newGangId: string) => void }`.
   - Prefill input value with `${currentName} copy`.
   - Buttons: Cancel (closes), Copy (submits).
   - On submit: calls server action `copyGang({ sourceGangId, newName })`.
   - After success: optionally redirect to the new gang page or surface a link; also show a toast.

3. **Where to mount**
   - Import and render in `components/gang/gang.tsx` (or the header component managing the icon bar). Keep local state to control modal visibility.

---

### Server Action: `app/actions/copy-gang.ts`
- API
  - `export async function copyGang(input: { sourceGangId: string; newName: string }): Promise<{ newGangId: string }>`
- Auth
  - Use existing Supabase client utilities to obtain the current user ID.
- Strategy
  - Perform the deep copy entirely inside this server action (no RPC function).
  - Use the Supabase server client and `insert(...).select()` to capture newly created IDs and build old→new ID maps for `fighters` and `vehicles`.
  - If any step fails, run a compensating cleanup that deletes the just-created `new_gang_id` and all rows referencing it (`fighters`, `vehicles`, `fighter_equipment`, `fighter_skills`, `fighter_effects`). Then rethrow the error.
- Cache/ISR
  - After success, revalidate user gangs list and any tags that show gang collections. If we have tag helpers, call `revalidateTag(CACHE_TAGS.USER_GANGS(userId))` and the generic gang list tags. No need to pre-warm caches for the new gang.

---

### Server-Side Copy Algorithm (No RPC)
- All reads use shared helpers from `app/lib/shared/gang-data.ts` to avoid duplicating query logic.
- All writes are performed by the server action using Supabase inserts and the captured IDs.

Steps:
1. Read source data
   - `getGangBasic`, `getGangFightersList`, `getGangVehicles`, `getGangStash`.
2. Insert new gang row
   - Copy all relevant columns; set `name = newName`, `user_id = currentUser.id`, and update timestamps; capture `new_gang_id`.
3. Insert fighters
   - For each source fighter, insert into `fighters` with `gang_id = new_gang_id`; capture `new_fighter_id` and store `{ old: fighter.id, new: new_fighter_id }`.
4. Insert gang-owned vehicles
   - From `getGangVehicles`, insert with `gang_id = new_gang_id`, `fighter_id = null`; capture `{ oldVehicleId, newVehicleId }`.
5. Insert fighter-owned vehicles
   - From each fighter’s `vehicles`, insert with `gang_id = new_gang_id` and `fighter_id = fighterIdMap[oldFighterId]`; capture into `vehicleIdMap`.
6. Insert stash items
   - From `getGangStash`, insert rows into `fighter_equipment` with `gang_id = new_gang_id`, `gang_stash = true` preserving `equipment_id`/`custom_equipment_id`, `purchase_cost`, and flags.
7. Insert fighter equipment
   - From each fighter’s `equipment`, insert into `fighter_equipment` with `fighter_id = fighterIdMap[oldFighterId]` (and `gang_id = new_gang_id` if present in source), preserving `equipment_id` or `custom_equipment_id`, `purchase_cost`, `is_master_crafted`, etc.
8. Insert vehicle equipment
   - From gang-owned and fighter-owned vehicles’ equipment, insert into `fighter_equipment` with `vehicle_id = vehicleIdMap[oldVehicleId]` and `gang_id = new_gang_id`, preserving costs and flags.
9. Insert fighter skills
   - For each fighter’s skills, insert into `fighter_skills` with `fighter_id = fighterIdMap[oldFighterId]` and the same `skill_type_id`/`skill_id` and metadata.
10. Insert effects (fighters and vehicles)
    - Insert into `fighter_effects` with remapped `fighter_id` and/or `vehicle_id`, preserving `fighter_effect_type_id`, `effect_name`, `type_specific_data`, and modifiers rows.
11. Derived values
    - Copy stored rating from source gang row if present or leave to existing rating computation routines. Credits/wealth copy as-is.
12. Validation and cleanup
    - Run the checks listed in "Post-Copy Validation"; on failure, delete all rows for `new_gang_id` and return an error.

- Constraints & indexes
  - Preserve `sort_order` or positional columns where they exist.
  - Ensure unique constraints (e.g., name uniqueness per user, if any) are handled; if conflict, append a numeric suffix.

---

### No Cross-Gang References Guarantee
- Every copied row receives a brand-new primary key (UUID) generated by Postgres: `gangs`, `fighters`, `vehicles`, `fighter_equipment`, `fighter_skills`, `fighter_effects`, and any other dependent tables we insert into.
- All foreign keys are rewritten to point only to new IDs:
  - `fighters.gang_id = new_gang_id`.
  - `vehicles.gang_id = new_gang_id`; `vehicles.fighter_id` remapped via the fighters ID map.
  - `fighter_equipment.fighter_id` remapped via fighters map; `fighter_equipment.vehicle_id` remapped via vehicles map; `fighter_equipment.gang_id` set to `new_gang_id` for stash rows.
  - `fighter_skills.fighter_id` remapped; `fighter_effects.fighter_id`/`vehicle_id` remapped.
- No row inserted in the new gang will reference `source_gang_id`, any `old_fighter_id`, or any `old_vehicle_id`.
- If any remap is missing (foreign key would still point to a source ID), the transaction raises an exception and rolls back.

### Post-Copy Validation (inside transaction before COMMIT)
Run assertions to guarantee isolation:
- Check no new rows reference the source gang:
  - `select 1 from fighters where gang_id = new_gang_id and id = any(old_fighter_ids)` → must return none.
  - `select 1 from vehicles where gang_id = new_gang_id and id = any(old_vehicle_ids)` → none.
  - `select 1 from fighter_equipment where gang_id = new_gang_id and (fighter_id = any(old_fighter_ids) or vehicle_id = any(old_vehicle_ids))` → none.
- Ensure all remapped FKs are within the new ID sets:
  - `fighter_equipment.fighter_id` null or in `new_fighter_ids`.
  - `fighter_equipment.vehicle_id` null or in `new_vehicle_ids`.
  - `fighter_effects.fighter_id` null or in `new_fighter_ids`; `fighter_effects.vehicle_id` null or in `new_vehicle_ids`.
- Optional: verify counts match expectations (fighters/vehicles/equipment/effects/skills) between source and destination.

---

### Data Access During UI
- For previewing or displaying in the modal, use existing read-only fetchers from `app/lib/shared/gang-data.ts` as needed.
- No additional fetching is required to perform the copy if using the SQL function.

---

### Navigation and Feedback
- After a successful copy, redirect to `/app/gang/[newGangId]` or show a toast with a link.
- Ensure error states from the server action are surfaced in the modal.

---

### Testing Checklist
- Copy gang with: no fighters, only stash, only vehicles, only fighters, mixed fighters and vehicles, and with exotic beasts.
- Ensure all equipment and effects show up on copied fighters/vehicles.
- Ensure no logs or campaign memberships are copied.
- Verify rating/credits/wealth display correctly for the new gang.
- Verify the UI icons align and the modal closes appropriately on success/cancel.

---

### Rollout Plan
- Land UI + server action guarded behind a simple modal—feature is safe to ship.
- After deploy, verify on a test gang in production.
- Optional follow-ups:
  - Allow choosing which parts to copy (fighters only, vehicles only, stash only).
  - Copy campaign membership behind a checkbox.
  - Background job to re-index or precompute rating if needed. 