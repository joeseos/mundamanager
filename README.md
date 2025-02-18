# Munda Manager

A comprehensive gang management tool for Necromunda tabletop game, built with Next.js 14 and Supabase.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

Munda Manager helps you manage your Necromunda gangs, fighters, and campaigns with features like:
- 🎮 Interactive gang management
- 👥 Fighter roster tracking
- 💰 Resource management
- ⚔️ Equipment and weapons system
- 📈 Experience and advancement tracking

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Database:** Supabase
- **Authentication:** Supabase Auth
- **Styling:** Tailwind CSS
- **Components:** shadcn/ui
- **Type Safety:** TypeScript

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

## Getting Started

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

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

If you enjoy using Munda Manager, consider:
- Supporting us on [Patreon](https://patreon.com/mundamanager)
- Buying us a coffee at [Buy Me a Coffee](https://buymeacoffee.com/mundamanager)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
