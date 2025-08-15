# Munda Manager

A comprehensive gang management tool for Necromunda tabletop game with features like:
- 🎮 Interactive gang management
- 👥 Fighter roster tracking
- 💰 Resource management
- ⚔️ Equipment and weapons system
- 📈 Experience and advancement tracking
- 📋 Comprehensive activity logging

## Tech Stack

- **Framework:** Next.js 18+ (App Router)
- **Database:** PostgreSQL
- **Authentication:** Supabase Auth
- **Styling:** Tailwind CSS
- **Components:** shadcn/ui
- **Type Safety:** TypeScript

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Issues

For bug reports, feature requests, or help, please join our **[Discord Community](https://discord.gg/FrqEWShQd7)**.

## Support

If you enjoy using Munda Manager, consider:
- Supporting us on [Patreon](https://patreon.com/mundamanager)
- Buying us a coffee at [Buy Me a Coffee](https://buymeacoffee.com/mundamanager)

For questions about contributing, feel free to ask in our [Discord server](https://discord.gg/FrqEWShQd7).

## How to Contribute as a Developper?

### Practical steps to create a pull request

1. Clone the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Added some amazing feature'`)
4. Push to the branch (`git push -u origin HEAD`)
5. Open a Pull Request

### How to Setup your Environment

1. **Prerequisites**
   - Node.js 18+
   - Supabase project url and key
   - Cloudflare Turnstile keys

2. **Environment Setup**
   ```bash
   cp .env.example .env.local
   ```
   Configure the following variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=mundamanager-project-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=mundamanager-turnstile-key
   TURNSTILE_SECRET_KEY=mundamanager-turnstile-secret-key
   NODE_ENV=development
   ```

3. **Running the environment**
   ```bash
   npm install
   npm run dev
   ```

4. **Mobile device testing**
   On your desktop, make sure you have the NODE_ENV variable setup with the value 'development'. Then run the following:
   ```bash
   npm run dev --host
   ```
   
   On your mobile device, when connected to your wifi, access the website using the IP of your desktop on your local network (e.g. 192.168.1.5):
   http://192.168.1.5:3000

5. **Access to the DB Schema**
   The Supabase DB schema can be accessed through https://supabase-schema.vercel.app/
   Use the Supabase URL and the and the anon key to connect to it


## Component Architecture

### Page Structure
```
GangPage (Server Component)
└── GangPageContent (Client Component)
    └── Gang
        ├── MyFighters
        │   └── FighterCard
        │       ├── StatsTable
        │       └── WeaponTable
        └── GangStashModal
```

### Key Components

#### Gang Management
- `GangPageContent`: Main wrapper for gang management
- `Gang`: Core gang management component
- `GangStashModal`: Equipment stash management

#### Fighter Management
- `MyFighters`: Fighter roster display
- `FighterCard`: Individual fighter display
- `WeaponTable`: Equipment and weapons display
- `FighterStatsTable`: Stats display component

### Error Handling
- Comprehensive error boundaries
- Loading states
- Fallback UI components
- Type-safe error handling

## Development

### State Management
- Context-based gang state (`GangsContext`)
- Local component state for UI
- Optimistic updates
- Real-time data synchronization

### Data Flow
1. Server-side data fetching (RPC calls)
2. Data processing and transformation
3. Client-side state management
4. Real-time updates
5. Optimistic UI updates

### Best Practices
- Type safety throughout
- Component memoization
- Error boundary implementation
- Hydration-safe rendering
- Proper loading states


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
- Injuries
- Advancements
- Bionics
- Cyberteknika
- Gene-smithing
- Rig-glitches
- Augmentations
- Equipment
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
    augmentations: FighterEffect[];
    equipment: FighterEffect[];
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
     ['injuries', 'advancements', 'bionics', 'cyberteknika', 'gene-smithing', 'rig-glitches', 'augmentations', 'equipment', 'vehicle_damages', 'user'].forEach(category => {
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

4. **Adding a Vehicle Lasting Damage**
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

5. **User Modification**
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

-- Equipment triggers
CREATE TRIGGER fighter_equipment_trigger
    AFTER INSERT OR DELETE ON fighter_equipment
    FOR EACH ROW
    EXECUTE FUNCTION fighter_equipment_logs();
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
  type: 'info' | 'warning' | 'error' | 'invite';
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
  fighter_class: string
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


