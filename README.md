# Munda Manager

A comprehensive gang management tool for Necromunda tabletop game with features like:
- 🎮 Interactive gang management
- 👥 Fighter roster tracking
- 💰 Resource management
- ⚔️ Equipment and weapons system
- 📈 Experience and advancement tracking
- 📋 Comprehensive activity logging

## Tech Stack

- **Framework:** Next.js 15.4.3 (App Router)
- **Database:** PostgreSQL
- **Authentication:** Supabase Auth
- **Styling:** Tailwind CSS
- **Components:** shadcn/ui
- **Type Safety:** TypeScript

## Issues

For bug reports, feature requests, or help, please join our **[Discord Community](https://discord.gg/FrqEWShQd7)**.

## Support

If you enjoy using Munda Manager, consider:
- Supporting us on [Patreon](https://patreon.com/mundamanager)
- Buying us a coffee at [Buy Me a Coffee](https://buymeacoffee.com/mundamanager)

For questions about contributing, feel free to ask in our [Discord server](https://discord.gg/FrqEWShQd7).

## Contributing

Setup instructions, how to run a local Supabase database, the pull request process, and the
architecture conventions the codebase follows all live in **[CONTRIBUTING.md](CONTRIBUTING.md)**.

## Core Features

### Gang Management
- Create and manage multiple gangs
- Track gang resources:
  - Credits
  - Reputation
  - Meat
  - Exploration points
- Manage gang alignment (Law Abiding/Outlaw)
- Equipment stash system
- Campaign integration

### Fighter System
- Comprehensive fighter management:
  - Stats tracking (M, WS, BS, S, T, W, I, A, Ld, Cl, Wil, Int)
  - Experience and advancements
  - Equipment and weapons
  - Skills and special rules
- Status tracking (killed, retired, enslaved, starved)
- Automatic stat calculations
- Equipment transfer system

## Fighter Effects System

### Overview
The fighter effects system manages all modifications to fighter statistics through a unified interface. Effects can come from various sources:
- Lasting Injuries
- Advancements
- Bionics
- Cyberteknika
- Gene-smithing
- Rig-glitches
- Power-boosts (Spyrer enhancements)
- Augmentations
- Equipment
- Skills
- Vehicle Lasting Damages
- User modifications

### Data Structure
```typescript
// Core effect interface
interface FighterEffect {
  id?: string;
  effect_name: string;
  fighter_effect_modifiers: Array<{
    id: string;
    fighter_effect_id: string;
    stat_name: string;
    numeric_value: number;
  }>;
}

// Fighter effects structure
interface Fighter {
  effects: {
    injuries: FighterEffect[];
    advancements: FighterEffect[];
    bionics: FighterEffect[];
    cyberteknika: FighterEffect[];
    'gene-smithing': FighterEffect[];
    'rig-glitches': FighterEffect[];
    'power-boosts': FighterEffect[];
    augmentations: FighterEffect[];
    equipment: FighterEffect[];
    skills: FighterEffect[];
    vehicle_damages: FighterEffect[];
    user: FighterEffect[];
  }
}
```

### How It Works

1. **Effect Categories**
   - Each effect belongs to a specific category (injury, advancement, vehicle damage, etc.)
   - Categories are stored in the `fighter_effect_categories` table
   - Each category can have different business rules and UI treatments

2. **Stat Modifications**
   - Effects modify fighter stats through `fighter_effect_modifiers`
   - Each modifier specifies:
     - Which stat to modify (`stat_name`)
     - How much to modify it by (`numeric_value`)
     - Reference to its parent effect (`fighter_effect_id`)

3. **Stat Calculation**
   ```typescript
   function calculateAdjustedStats(fighter: Fighter) {
     // Start with base stats
     const adjustedStats = { ...fighter.base_stats };

     // Process all effect categories
     ['injuries', 'advancements', 'bionics', 'cyberteknika', 'gene-smithing', 'rig-glitches', 'power-boosts', 'augmentations', 'equipment', 'skills', 'vehicle_damages', 'user'].forEach(category => {
       fighter.effects[category]?.forEach(effect => {
         effect.fighter_effect_modifiers?.forEach(modifier => {
           const statName = modifier.stat_name.toLowerCase();
           adjustedStats[statName] += modifier.numeric_value;
         });
       });
     });

     return adjustedStats;
   }
   ```

4. **Database Schema**
   ```sql
   -- Effect categories
   CREATE TABLE fighter_effect_categories (
     id UUID PRIMARY KEY,
     category_name TEXT NOT NULL,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ
   );

   -- Effects
   CREATE TABLE fighter_effects (
     id UUID PRIMARY KEY,
     fighter_id UUID REFERENCES fighters(id),
     vehicle_id UUID REFERENCES vehicles(id),
     effect_name TEXT NOT NULL,
     category_id UUID REFERENCES fighter_effect_categories(id),
     created_at TIMESTAMPTZ DEFAULT NOW()
   );

   -- Effect modifiers
   CREATE TABLE fighter_effect_modifiers (
     id UUID PRIMARY KEY,
     fighter_effect_id UUID REFERENCES fighter_effects(id),
     stat_name TEXT NOT NULL,
     numeric_value INTEGER NOT NULL
   );
   ```

### Key Files for Effect Logic

The fighter effects system is implemented across several key files:

#### Core Effect Processing
- **`utils/effect-modifiers.ts`**: Core logic for applying effect modifiers to fighter stats
  - `calculateAdjustedStats()`: Main function that processes all effect categories
  - `applyWeaponModifiers()`: Applies equipment-to-equipment effects on weapon profiles
  - Supports both 'add' and 'set' operations for stat modifications

#### Data Fetching
- **`app/lib/shared/fighter-data.ts`**: Server-side functions for fetching fighter data
  - `getFighterEffects()`: Queries and groups effects by category from database
  - Returns effects organized by category: `{ injuries: [], equipment: [], skills: [], ... }`
  - Uses caching with proper cache tags for performance

#### Type Definitions
- **`types/fighter.ts`**: TypeScript interfaces for fighter data
  - `FighterEffect`: Interface for individual effects
  - `FighterProps.effects`: Complete effects structure with all categories
  - `EffectCategory`: Union type of all valid effect categories

#### Frontend Components
- **`components/fighter/fighter-details-card.tsx`**: Displays fighter stats with effects applied on the fighter detail page
  - Receives effects from parent via props
  - Constructs `fighterData` object with all effect categories (line 284-294)
  - Calls `calculateAdjustedStats()` to compute modified stats (line 344-347)
  - **IMPORTANT**: Must include all effect categories in the `fighterData.effects` object

- **`components/gang/fighter-card.tsx`**: Displays fighter stats with effects applied on the gang roster
  - Used in gang page to show fighter cards in the roster
  - Constructs `fighterData` object with all effect categories (line 249-260)
  - Calls `calculateAdjustedStats()` to compute modified stats (line 296)
  - **IMPORTANT**: Must include all effect categories in the `fighterData.effects` object (same as fighter-details-card)

- **`components/fighter/fighter-page.tsx`**: Main fighter page component
  - Fetches initial fighter data including effects
  - Transforms and passes effects to child components (line 215-226)
  - Manages fighter state and updates

#### Effect Application Logic
- **`app/actions/equipment.ts`**: Handles equipment purchases and associated effects
  - `buyEquipmentForFighter()`: Automatically creates fighter_effects when equipment with effects is purchased
  - Queries `fighter_effect_types` to find effects associated with equipment
  - Creates both `fighter_effects` and `fighter_effect_modifiers` records

- **`app/actions/fighter-advancement.ts`**: Handles skill advancements and associated effects
  - `addSkillAdvancement()`: Automatically creates fighter_effects when skills with effects are added (line 325-373)
  - Queries `fighter_effect_types` where `type_specific_data->>'skill_id'` matches
  - Creates both `fighter_effects` and `fighter_effect_modifiers` records
  - Invalidates caches to trigger re-rendering

### Usage Examples

1. **Adding an Injury**
   ```typescript
   const injury: FighterEffect = {
     effect_name: "Head Wound",
     fighter_effect_modifiers: [{
       stat_name: "ballistic_skill",
       numeric_value: -1
     }]
   };
   fighter.effects.injuries.push(injury);
   ```

2. **Adding a Bionic Enhancement**
   ```typescript
   const bionic: FighterEffect = {
     effect_name: "Bionic Arm",
     fighter_effect_modifiers: [{
       stat_name: "strength",
       numeric_value: 1
     }]
   };
   fighter.effects.bionics.push(bionic);
   ```

3. **Adding Equipment Effects**
   ```typescript
   const equipmentEffect: FighterEffect = {
     effect_name: "Psychomancer's harness",
     fighter_effect_modifiers: [
       {
         stat_name: "movement",
         numeric_value: 2
       }
     ]
   };
   fighter.effects.equipment.push(equipmentEffect);
   ```

4. **Adding Skill Effects**
   ```typescript
   const skillEffect: FighterEffect = {
     effect_name: "Extra Appendages",
     fighter_effect_modifiers: [
       {
         stat_name: "attacks",
         numeric_value: 1
       }
     ]
   };
   fighter.effects.skills.push(skillEffect);
   ```

5. **Adding a Power Boost (Spyrer)**
   ```typescript
   const powerBoost: FighterEffect = {
     effect_name: "Improved Motive Power",
     fighter_effect_modifiers: [{
       stat_name: "movement",
       numeric_value: 1
     }],
     type_specific_data: {
       kill_cost: 4,
       credits_increase: 10
     }
   };
   fighter.effects['power-boosts'].push(powerBoost);
   ```

6. **Adding a Vehicle Lasting Damage**
   ```typescript
   const vehicleDamage: FighterEffect = {
     effect_name: "Loss of Power",
     vehicle_id: "vehicle-uuid",
     fighter_effect_modifiers: [{
       stat_name: "movement",
       numeric_value: -1
     }]
   };
   fighter.effects.vehicle_damages.push(vehicleDamage);
   ```

7. **User Modification**
   ```typescript
   const userMod: FighterEffect = {
     effect_name: "Custom Bonus",
     fighter_effect_modifiers: [{
       stat_name: "movement",
       numeric_value: 1
     }]
   };
   fighter.effects.user.push(userMod);
   ```

## Gang Logging System

### Overview
The gang logging system provides comprehensive tracking of all changes and activities within your gang. Every action is automatically logged with timestamps, creating a complete audit trail of your gang's history.

### Features
- **Automatic Logging**: All gang activities are tracked automatically through database triggers
- **Comprehensive Coverage**: Logs credits, reputation, fighters, equipment, vehicles, and more
- **Detailed Descriptions**: Human-readable log entries with before/after values
- **Real-time Updates**: Logs appear immediately after actions are performed
- **Paginated Display**: Clean interface with 10 logs per page for easy browsing

### Logged Activities

#### Gang Changes
- **Credits**: "Credits increased from 500 to 600" or "Credits decreased from 600 to 500"
- **Reputation**: "Reputation changed from 5 to 10"
- **Resources**: Meat and exploration points changes
- **Gang Type**: Gang alignment and type modifications

#### Fighter Operations
- **Fighter Management**: "Added fighter 'Juve' (65 credits). New gang rating: 365"
- **Fighter Removal**: "Removed fighter 'Ganger' (95 credits). New gang rating: 270"
- **Status Changes**: Fighter deaths, retirements, enslavement with context
- **Cost Adjustments**: Manual fighter cost modifications
- **Experience & Kills**: XP gains and kill count changes

#### Equipment Transactions
- **Purchases**: "Fighter 'Ganger' bought Lasgun for 15 credits. New gang rating: 280"
- **Sales**: "Fighter 'Heavy' sold Plasma gun for 100 credits. New gang rating: 380"
- **Stash Operations**: 
  - "Fighter moved Heavy bolter to gang stash. New gang rating: 265"
  - "Fighter took Plasma gun from gang stash. New gang rating: 365"

#### Vehicle Operations
- **Vehicle Management**: "Added vehicle 'Cargo-8 Ridgehauler' (130 credits). New gang rating: 495"
- **Vehicle Equipment**: "Vehicle 'Ridgehauler' bought Heavy bolter for 160 credits. New gang rating: 655"
- **Vehicle Modifications**: Upgrades, repairs, and customizations

### Technical Implementation

#### Database Triggers
The logging system uses PostgreSQL triggers that fire automatically on data changes:

```sql
-- Gang changes trigger
CREATE TRIGGER gang_changes_trigger
    AFTER UPDATE ON gangs
    FOR EACH ROW
    EXECUTE FUNCTION auto_log_gang_changes();

-- Fighter changes trigger
CREATE TRIGGER fighter_changes_trigger
    AFTER INSERT OR UPDATE OR DELETE ON fighters
    FOR EACH ROW
    EXECUTE FUNCTION fighter_logs();
```

#### Smart Duplicate Prevention
The system prevents duplicate logging by checking for recent related activities:
- Credit decreases from equipment purchases don't create separate credit logs
- Fighter additions don't duplicate credit change logs
- Equipment stash operations are distinguished from regular sales/purchases

#### Data Structure
```typescript
interface GangLog {
  id: string;
  gang_id: string;
  user_id: string;
  action_type: string;
  description: string;
  fighter_id?: string;
  vehicle_id?: string;
  created_at: string;
}
```

### User Interface
- **Modal Display**: Logs open in a responsive modal dialog
- **Table Format**: Clean 3-column layout (Date, Type, Description)
- **Pagination**: Navigate through logs with page controls
- **Responsive Design**: Optimized for both desktop and mobile viewing
- **Real-time Updates**: New logs appear immediately without page refresh

### Access
Gang logs are accessible via the "Logs" button on each gang page, positioned next to the Edit button. The logs are private to the gang owner and provide a complete history of all gang activities.

## Notification System

### Overview
The notification system provides real-time notifications to users for various application events. Notifications support different types (info, warning, error, invite) with appropriate visual indicators.

### Features
- Real-time notifications using Supabase Realtime
- Different notification types with distinct visual styling
- Automatic marking of notifications as read when viewed
- Notification deletion capability
- Database-driven notification storage

### Data Structure
```typescript
// Core notification interface
interface Notification {
  id: string;
  text: string;
  type: 'info' | 'warning' | 'error' | 'invite' | 'campaign_invite' | 'friend_request' | 'battle_invite' | 'gang_invite';
  created_at: string;
  dismissed: boolean;
  link: string | null;
}
```

### Database Integration
- Notifications are stored in the `notifications` table
- Database triggers automatically create notifications for specific events
- Example functions:
  - `notify_campaign_member_added()`: Creates notifications when users are invited to campaigns
- Example triggers:
  - `trigger_campaign_member_notification`: Fires the notification function when new campaign members are added

### Implementation
- Global notification store manages application-wide notification state
- Notification hooks provide real-time updates and management functions
- Notification API endpoints for secure server-side operations
- Profile page integration for reviewing all notifications

## Data Architecture

```typescript
// Core Data Types
interface GangData {
  id: string
  name: string
  credits: number
  reputation: number
  alignment: 'Law Abiding' | 'Outlaw'
  meat: number
  exploration_points: number
  fighters: FighterProps[]
  stash: StashItem[]
}

interface FighterProps {
  id: string
  fighter_name: string
  fighter_type: string
  fighter_subtype: string
  credits: number
  // Stats and equipment
  movement: number
  weapon_skill: number
  ballistic_skill: number
  // ... other stats
  weapons: Weapon[]
  wargear: Wargear[]
  advancements: Advancement
}
```



## Self-Hosted Caching (Coolify)

On Vercel the app uses Next's built-in Data Cache and nothing here applies. When
self-hosting, `cache-handler.js` can back the Next.js `cacheHandler` with Redis so
cached data is shared between instances and survives a redeploy.

It is off unless `USE_REDIS_CACHE=true` is set **at build time** — `next.config.js`
reads it to decide whether to register the handler at all. `REDIS_URL` is a runtime
secret and is deliberately not needed during `next build`; without it the handler
falls back to an in-process cache, which is what makes the build work.

| Variable | Required | Notes |
|---|---|---|
| `USE_REDIS_CACHE` | build | `true` enables the handler |
| `REDIS_URL` | runtime | Secret. Absent ⇒ in-memory fallback |
| `REDIS_CACHE_PREFIX` | no | Default `munda-manager:next-cache` |
| `REDIS_CACHE_TIMEOUT_MS` | no | Default `1000` |
| `NEXT_PRIVATE_DEBUG_CACHE` | no | `1` logs HIT/MISS/SET and invalidations |

### Redis instance requirements

**Configure the instance as a cache, not a store:**

```
maxmemory 256mb                 # size to taste
maxmemory-policy allkeys-lru
```

Cache entries carry no TTL on purpose, so that tag invalidation stays the only thing
that expires them. On Redis's actual default policy (`noeviction`) the keyspace
therefore grows unbounded until writes fail with OOM — at which point the cache stops
working and invalidations start being dropped. Under `allkeys-lru` it just evicts, which
is the failure mode the handler is designed around.

**Recovery after a Redis outage.** Cache entries have no TTL, so an invalidation that
cannot reach Redis would otherwise leave stale data that nothing expires. If that
happens the handler marks the cache dirty: it stops serving Redis hits, and once Redis
is reachable again it drops the whole namespace before trusting it. Expect one cold
cache — and a burst of Supabase reads — after an outage. Both transitions are logged.

**Do not expose the instance.** Entries hold whatever `unstable_cache` wrapped — gang,
fighter and campaign data, profiles, permission results — so treat it like any other
datastore with real data in it: private network only, and require auth (and TLS) if it
is ever reachable beyond the Coolify network.

`unstable_cache` entries are stored under `…:v1:fetch:` and persist across deploys;
rendered pages are stored per build id so a new build never serves the previous
build's payloads. Tags from `utils/cache-tags.ts` are indexed as Redis sets, so
`revalidateTag` deletes exactly the affected keys rather than scanning the keyspace.

To confirm Redis is receiving entries:

```bash
redis-cli -u "$REDIS_URL" DBSIZE
redis-cli -u "$REDIS_URL" --scan --pattern 'munda-manager:next-cache:*' | head -50
redis-cli -u "$REDIS_URL" SMEMBERS 'munda-manager:next-cache:v1:tag:gang-<GANG_ID>'
redis-cli -u "$REDIS_URL" MONITOR   # watch live traffic while browsing

# flush the app's cache (e.g. after changing the shape of a cached value)
redis-cli -u "$REDIS_URL" --scan --pattern 'munda-manager:next-cache:*' \
  | xargs -r -n 500 redis-cli -u "$REDIS_URL" DEL
```

To roll back to stock Next.js caching, unset `USE_REDIS_CACHE` and rebuild.
