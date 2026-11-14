# Campaign Trading

Reference for campaign trading. RAW-first: N17–N23 Trading Captive Models, the N26 ransom, and guild ransoms. Equipment uses the same tables. Mutations are a later PR.

---

## Feature

Gangs in the same campaign trade captives, stash items, credits, reputation, campaign resources, and anything RAW leaves to the table (a Territory, Toll Crossing priority, a bounty, a house-rule good).

**A trade completes only when it is accepted.**

Arbitrators opt in with **Allow campaign trading** in Edit Campaign (`campaigns.allow_trading`). Only owners of ACCEPTED gangs in that campaign can propose or accept. A gang sits in at most one campaign.

Three shapes, one row type:

| Shape | How it is stored |
|---|---|
| Direct trade | `campaign_trades` with proposer + counterparty, `parent_trade_id` null |
| Auction / open listing | Same table, `counterparty_gang_id` null. Other gangs insert bid rows with `parent_trade_id` = the listing |
| Buying | An open listing whose items are the author’s payment (e.g. 50 credits). The title says what they want. Bidders bid with what they supply |

Same owner, two gangs: allowed. A gang cannot be both proposer and counterparty on one row.

Law Abiding gangs cannot trade captives to Outlaw gangs (enforced in the accept action, not the schema).

---

## Data model

Author SQL under `supabase/migrations/` (`supabase migration new`, do not invent timestamps). Mirror tables in `utils/db/schema.ts`. Do not edit `supabase/schema/schema.public.sql`. Do not apply from the agent; the user runs `supabase db push`.

### 1. `campaigns.allow_trading`

Boolean, default false. Same path as `allow_join_requests` (Edit Campaign, `updateCampaignSettings`, campaigns UPDATE RLS). Disabling the flag blocks new trades; leave pending rows completable or cancellable so nothing stays locked.

### 2. `campaign_trades`

| Column | Notes |
|---|---|
| `campaign_id` | FK campaigns, ON DELETE CASCADE |
| `proposer_gang_id` | The gang that posted this row |
| `counterparty_gang_id` | Who must accept. **Null** = open listing |
| `parent_trade_id` | Set on a bid, pointing at the listing. Null on a direct trade or listing |
| `title`, `note` | Title required. Note is free text |
| `status` | `pending` / `accepted` / `declined` / `cancelled` |
| timestamps | `created_at`, `updated_at`, `resolved_at` |

Checks: not self-parent; proposer ≠ counterparty; a bid always has a counterparty. Composite `(parent_trade_id, campaign_id)` → `(id, campaign_id)` so a bid cannot leave the listing’s campaign.

Partial unique: one pending bid per gang per listing.

### 3. `campaign_trade_items`

Everything a gang **gives**, one row per thing.

| Column | Used when |
|---|---|
| `trade_id`, `giving_gang_id` | Always |
| `kind` | `captive` / `equipment` / `credits` / `reputation` / `campaign_resource` / `custom` |
| `fighter_id` | Captive. Giving gang is the captor (`captured_by_gang_id`). `fighters.gang_id` does not change |
| `fighter_equipment_id` | Stash item |
| `amount` | Credits, reputation, or campaign resource |
| `campaign_type_resource_id` / `campaign_resource_id` | Which resource (same ids as `campaign_gang_resources`) |
| `description` | `custom` only: Territory, service, bounty, house-rule good. App records it; players settle at the table |
| `locked` | True while the trade is pending. False after accept, decline or cancel |

A CHECK ties each kind to its columns. A later kind is a small migration.

Partial unique indexes on `fighter_equipment_id` and `fighter_id` **WHERE locked**, so the same item or captive cannot sit on two pending trades. Credits are not uniquely locked; accept re-checks balances.

FKs to `fighters` and `fighter_equipment` are **ON DELETE CASCADE**. Deleting a gang, fighter or account is never blocked. (A reservations table with ON DELETE RESTRICT would block those deletes.)

---

## Flow (code in a later PR)

Accept is **one server action**. It flips status from pending first, re-checks, then applies each item (`custom` is only recorded):

| Kind | Writer |
|---|---|
| Credits / reputation | `updateGangFinancials` |
| Campaign resource | `campaign_gang_resources` + `logGangResourceChanges` |
| Captive, back to original gang | Existing rescue path (`captured = false`, clear `captured_by_gang_id`, remove Captured injury) |
| Captive, to a third gang | `captured_by_gang_id` only. No gang or rating change |
| Stash item | `gang_id` (and granted child items) |

Then log and notify both gangs.

If the author accepts one bid, other pending bids on that listing are declined and their items unlocked.

Stash actions (sell, move to fighter, delete) and captive actions (rescue, delete fighter) check for a **locked** item and refuse with a clear message.

---

## RLS

SELECT only in this migration. Writes come later.

- Members, arbitrators and admins can read trades and items in that campaign.
- `app_server` has `USING (true)` so campaign-page reads work (`auth.uid()` is NULL on that role).

---

## What we dropped, and why

| Dropped | Why |
|---|---|
| `campaign_trade_reservations` | `locked` + partial unique indexes are the lock |
| `pending_offer_count` | Count bids with `parent_trade_id` |
| Composite unique on `campaign_gangs` | Trades reference `gangs` directly; one gang per campaign |
| Separate adverts vs offers tables | Direct / auction / buying are the same rows |
| `ON DELETE RESTRICT` on listed goods | Blocked deleting a gang, fighter or account |

Keep `allow_trading`.

---

## Locked product decisions

1. Same player, two gangs: allowed. Block only the same gang on both sides of one trade.
2. Captive never changes `gang_id`. Ransom uses the rescue path; a third gang only changes `captured_by_gang_id`.
3. Credits are not locked at propose time. Accept re-checks.
4. Amount 0 is allowed.
5. `custom` items are recorded, not moved.
6. Law Abiding cannot trade captives to Outlaw (accept action).
7. Vehicles: stash is `fighter_equipment` only. No extra vehicle-row transfer in v1.
8. No trades on `/api/campaigns/{id}/data` in v1.
9. One campaign per gang. No campaign picker.

---

## Implementation order

**This PR — schema.** Flag, two tables, SELECT RLS. No mutations.

**Next — app.** Create/decline/cancel, accept action (captive ransom first, then equipment on the same path), stash/captive lock checks, list UI gated on `allow_trading`.

Do not settle in several `.update()` calls in a server action. Confirm with `@/components/ui/modal`, never `window.confirm`.

---

## Key files

| Area | Files |
|---|---|
| Migration | `supabase/migrations/20261112224135_campaign_trading.sql` |
| Drizzle | `utils/db/schema.ts` |
| Flag UI | `components/campaigns/[id]/campaign-edit-modal.tsx` |
| Flag action | `app/actions/campaigns/[id]/campaign-settings.ts` |
| Stash mutations to lock | `app/actions/move-from-stash.ts`, `app/actions/sell-equipment.ts`, `app/actions/equipment.ts` |
| Captive rescue | `app/actions/edit-fighter.ts` (`case 'rescue'`) |
| Finances | `utils/gang-rating-and-wealth.ts`, `utils/campaigns/resources.ts` |
| Cache | `utils/cache-tags.ts` |
| Modal | `components/ui/modal.tsx` |
