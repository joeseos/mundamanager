import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/lib/campaigns/[id]/get-campaign-data', () => ({
  getCampaignBasic: vi.fn(),
  getCampaignMembers: vi.fn(),
  getCampaignTerritories: vi.fn(),
  getCampaignBattles: vi.fn(),
  getCampaignResources: vi.fn(),
  getCampaignFighters: vi.fn(),
}));

import {
  getCampaignBasic,
  getCampaignMembers,
  getCampaignTerritories,
  getCampaignBattles,
  getCampaignResources,
  getCampaignFighters,
} from '@/app/lib/campaigns/[id]/get-campaign-data';
import { GET, OPTIONS } from './route';

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';
const ACCEPTED_GANG_ID = '22222222-2222-4222-8222-222222222222';
const PENDING_GANG_ID = '33333333-3333-4333-8333-333333333333';

// The rate limiter is module state keyed by IP, so each request gets its own
// IP unless a test is exercising the limiter itself.
let ipCounter = 0;
const nextIp = () => `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

function request(campaignId: string, { format, ip = nextIp() }: { format?: string; ip?: string } = {}) {
  const url = new URL(`http://localhost/api/campaigns/${campaignId}/data`);
  if (format) url.searchParams.set('format', format);
  return GET(new Request(url, { headers: { 'x-forwarded-for': ip } }), {
    params: Promise.resolve({ campaignId }),
  });
}

const basic = {
  id: CAMPAIGN_ID,
  campaign_name: 'Underhive & Co <Wars>',
  campaign_type_id: 'type-1',
  status: 'active',
  description: 'desc',
  note: null,
  image_url: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: null,
  campaign_types: { campaign_type_name: 'Dominion', image_url: 'dominion.png', edition_slug: null },
};

const gang = (id: string, status: string, name: string) => ({
  campaign_gang_id: `cg-${id}`,
  campaign_member_id: 'member-1',
  status,
  id,
  name,
  gang_type: 'Goliath',
  gang_type_id: 'gt-1',
  parent_gang_type_name: null,
  gang_colour: '#ff0000',
  rating: 1000,
  wealth: 1200,
  credits: 200,
  reputation: 5,
  territory_count: 1,
  resources: [{ resource_id: 'r-1', resource_name: 'Meat', quantity: 3, is_custom: false }],
  allegiance: null,
});

const members = [
  {
    id: 'member-1',
    user_id: 'auth-user-secret',
    username: 'craig',
    role: 'OWNER',
    invited_at: null,
    joined_at: '2026-01-02T00:00:00Z',
    invited_by: null,
    profile: { id: 'auth-user-secret', username: 'craig', updated_at: '', user_role: '' },
    gangs: [gang(ACCEPTED_GANG_ID, 'ACCEPTED', 'Iron Skulls'), gang(PENDING_GANG_ID, 'PENDING', 'Invited Gang')],
  },
];

const territories = [
  {
    id: 'ct-1',
    territory_id: 'tmpl-1',
    territory_name: 'Old Ruins',
    gang_id: ACCEPTED_GANG_ID,
    created_at: '2026-01-03T00:00:00Z',
    ruined: false,
    default_gang_territory: false,
    playing_card: null,
    is_custom: false,
    owning_gangs: [{ id: ACCEPTED_GANG_ID, name: 'Iron Skulls', gang_type: 'Goliath', gang_colour: '#ff0000' }],
  },
];

const fighter = (overrides: Record<string, unknown> = {}) => ({
  id: 'f-1',
  fighter_name: 'Krug',
  fighter_type: 'Forge Boss',
  fighter_subtypes: [],
  xp: 7,
  is_vehicle: false,
  killed: false,
  retired: false,
  enslaved: false,
  recovery: false,
  captured: false,
  starved: false,
  fighter_types: null,
  custom_fighter_type: null,
  ...overrides,
});

function mockCampaign({
  fighters = {
    [ACCEPTED_GANG_ID]: [fighter()],
    // Present in the data on purpose: the route must still withhold it.
    [PENDING_GANG_ID]: [fighter({ id: 'f-pending', fighter_name: 'Should Not Appear' })],
  } as Record<string, unknown[]>,
} = {}) {
  vi.mocked(getCampaignBasic).mockResolvedValue(basic as any);
  vi.mocked(getCampaignMembers).mockResolvedValue(members as any);
  vi.mocked(getCampaignTerritories).mockResolvedValue(territories as any);
  vi.mocked(getCampaignBattles).mockResolvedValue([]);
  vi.mocked(getCampaignResources).mockResolvedValue([]);
  vi.mocked(getCampaignFighters).mockResolvedValue(fighters as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCampaign();
});

describe('OPTIONS', () => {
  it('answers the CORS preflight', async () => {
    const res = await OPTIONS(new Request('http://localhost'));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
  });
});

describe('GET not found', () => {
  it('returns 404 for a malformed id without reading any data', async () => {
    const res = await request('not-a-uuid');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Campaign not found' });
    expect(getCampaignBasic).not.toHaveBeenCalled();
    expect(getCampaignFighters).not.toHaveBeenCalled();
  });

  it('returns 404 when the campaign does not exist', async () => {
    vi.mocked(getCampaignBasic).mockResolvedValue(null);
    const res = await request(CAMPAIGN_ID);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Campaign not found' });
  });

  it('returns a 404 XML error when format=xml', async () => {
    vi.mocked(getCampaignBasic).mockResolvedValue(null);
    const res = await request(CAMPAIGN_ID, { format: 'xml' });
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toBe('application/xml');
    expect(await res.text()).toContain('<error><error>Campaign not found</error></error>');
  });
});

describe('GET JSON', () => {
  it('returns the campaign with rate-limit and CORS headers', async () => {
    const res = await request(CAMPAIGN_ID);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('9');

    const body = await res.json();
    expect(body.campaign).toMatchObject({
      id: CAMPAIGN_ID,
      campaign_name: 'Underhive & Co <Wars>',
      campaign_type_name: 'Dominion',
      campaign_type_image_url: 'dominion.png',
      image_url: '',
    });
    expect(getCampaignBattles).toHaveBeenCalledWith(CAMPAIGN_ID, 100);
  });

  it('does not expose auth user ids', async () => {
    const body = await (await request(CAMPAIGN_ID)).json();
    expect(body.members[0].user_info).toEqual({
      campaign_member_id: 'member-1',
      username: 'craig',
      role: 'OWNER',
      invited_at: null,
      joined_at: '2026-01-02T00:00:00Z',
    });
    expect(JSON.stringify(body)).not.toContain('auth-user-secret');
  });

  it('publishes fighters for ACCEPTED gangs only', async () => {
    const body = await (await request(CAMPAIGN_ID)).json();
    const [accepted, pending] = body.members[0].gangs;

    expect(accepted.status).toBe('ACCEPTED');
    expect(accepted.fighters).toEqual([
      {
        id: 'f-1',
        name: 'Krug',
        type: 'Forge Boss',
        subtypes: [],
        xp: 7,
        is_vehicle: false,
        killed: false,
        retired: false,
        enslaved: false,
        recovery: false,
        captured: false,
        starved: false,
      },
    ]);

    expect(pending.status).toBe('PENDING');
    expect(pending.fighters).toEqual([]);
    expect(JSON.stringify(body)).not.toContain('Should Not Appear');
  });

  it('keeps the data layer order of fighters', async () => {
    mockCampaign({
      fighters: { [ACCEPTED_GANG_ID]: [fighter({ id: 'b', fighter_name: 'Zed' }), fighter({ id: 'a', fighter_name: 'Abe' })] },
    });
    const body = await (await request(CAMPAIGN_ID)).json();
    expect(body.members[0].gangs[0].fighters.map((f: { id: string }) => f.id)).toEqual(['b', 'a']);
  });

  it('falls back through catalog and custom fighter types, then Unknown', async () => {
    mockCampaign({
      fighters: {
        [ACCEPTED_GANG_ID]: [
          fighter({ id: 'catalog', fighter_type: null, fighter_types: { fighter_type: 'Catalog Type' } }),
          fighter({ id: 'custom', fighter_type: '', custom_fighter_type: { fighter_type: 'Custom Type' } }),
          fighter({ id: 'none', fighter_type: null }),
        ],
      },
    });
    const body = await (await request(CAMPAIGN_ID)).json();
    expect(body.members[0].gangs[0].fighters.map((f: { type: string }) => f.type)).toEqual([
      'Catalog Type',
      'Custom Type',
      'Unknown',
    ]);
  });

  it('defaults nullable fighter fields', async () => {
    mockCampaign({
      fighters: {
        [ACCEPTED_GANG_ID]: [
          fighter({ fighter_name: null, fighter_subtypes: null, xp: null, recovery: null, captured: null }),
        ],
      },
    });
    const body = await (await request(CAMPAIGN_ID)).json();
    expect(body.members[0].gangs[0].fighters[0]).toMatchObject({
      name: '',
      subtypes: [],
      xp: 0,
      recovery: false,
      captured: false,
    });
  });

  it('returns an empty roster for an accepted gang with no fighters entry', async () => {
    mockCampaign({ fighters: {} });
    const body = await (await request(CAMPAIGN_ID)).json();
    expect(body.members[0].gangs[0].fighters).toEqual([]);
  });

  it('nests territories under their gang without gang_id and lists them top-level with it', async () => {
    const body = await (await request(CAMPAIGN_ID)).json();
    const [accepted, pending] = body.members[0].gangs;

    expect(accepted.territories).toHaveLength(1);
    expect(accepted.territories[0]).not.toHaveProperty('gang_id');
    expect(accepted.territories[0]).toMatchObject({ id: 'ct-1', template_id: 'tmpl-1', name: 'Old Ruins' });
    expect(pending.territories).toEqual([]);

    expect(body.available_territories[0]).toMatchObject({ id: 'ct-1', gang_id: ACCEPTED_GANG_ID });
    expect(body.available_territories[0].owning_gangs).toEqual([
      { id: ACCEPTED_GANG_ID, name: 'Iron Skulls', type: 'Goliath', colour: '#ff0000' },
    ]);
  });

  it('maps battles, including multiple winners and a draw', async () => {
    vi.mocked(getCampaignBattles).mockResolvedValue([
      {
        id: 'b-1',
        created_at: '2026-02-01T00:00:00Z',
        updated_at: null,
        scenario: 'Ambush',
        scenario_name: 'Ambush',
        scenario_number: 3,
        note: null,
        participants: [],
        campaign_territory_id: 'ct-1',
        territory_name: 'Old Ruins',
        attacker: { id: 'g-a', name: 'A' },
        defender: { id: 'g-d', name: 'D' },
        winner: { id: 'g-a', name: 'A' },
        winners: [{ id: 'g-a', name: 'A' }, { id: 'g-x', name: 'X' }],
        territory_claimer: { id: 'g-a', name: 'A' },
      },
      {
        id: 'b-2',
        winners: [],
        territory_claimer: null,
      },
    ] as any);

    const body = await (await request(CAMPAIGN_ID)).json();
    const [won, draw] = body.battle_logs;

    expect(won).toMatchObject({
      id: 'b-1',
      campaign_territory_id: 'ct-1',
      territory_id: null,
      territory_is_custom: false,
      attacker: { id: 'g-a', name: 'A' },
      defender: { id: 'g-d', name: 'D' },
      winner: { id: 'g-a', name: 'A' },
      winners: [{ id: 'g-a', name: 'A' }, { id: 'g-x', name: 'X' }],
      territory_claimer: { id: 'g-a', name: 'A' },
    });
    expect(draw).not.toHaveProperty('winner');
    expect(draw).not.toHaveProperty('winners');
    expect(draw.territory_claimer).toBeNull();
  });

  it('returns 500 when a data read fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(getCampaignFighters).mockRejectedValue(new Error('db down'));
    const res = await request(CAMPAIGN_ID);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to generate campaign data' });
  });
});

describe('GET XML', () => {
  it('renders the campaign as escaped XML with singular item nodes', async () => {
    const res = await request(CAMPAIGN_ID, { format: 'xml' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/xml');
    expect(res.headers.get('Content-Disposition')).toBe(`inline; filename="campaign_${CAMPAIGN_ID}.xml"`);

    const xml = await res.text();
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<campaign_data>')).toBe(true);
    expect(xml).toContain('<campaign_name>Underhive &amp; Co &lt;Wars&gt;</campaign_name>');
    expect(xml).toContain('<fighters><fighter><id>f-1</id><name>Krug</name><type>Forge Boss</type>');
    expect(xml).toContain('<territories><territory><id>ct-1</id>');
    // Empty arrays become self-closing tags; null fields are omitted.
    expect(xml).toContain('<subtypes />');
    expect(xml).toContain('<battle_logs />');
    expect(xml).not.toContain('<note>');
    expect(xml).not.toContain('Should Not Appear');
  });
});

describe('rate limiting', () => {
  it('allows 10 requests per IP per minute, then returns 429', async () => {
    const ip = '192.0.2.1';
    for (let i = 0; i < 10; i++) {
      const res = await request(CAMPAIGN_ID, { ip });
      expect(res.status).toBe(200);
      expect(res.headers.get('X-RateLimit-Remaining')).toBe(String(9 - i));
    }

    const limited = await request(CAMPAIGN_ID, { ip });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect((await limited.json()).error).toMatch(/^Rate limit exceeded/);

    // Other clients are unaffected.
    expect((await request(CAMPAIGN_ID, { ip: '192.0.2.2' })).status).toBe(200);
  });

  it('uses the first x-forwarded-for address', async () => {
    const ip = '192.0.2.10';
    for (let i = 0; i < 10; i++) await request(CAMPAIGN_ID, { ip: `${ip}, 10.9.9.${i}` });
    expect((await request(CAMPAIGN_ID, { ip })).status).toBe(429);
  });

  it('counts malformed ids against the limit', async () => {
    const ip = '192.0.2.20';
    for (let i = 0; i < 10; i++) expect((await request('bad', { ip })).status).toBe(404);
    expect((await request('bad', { ip })).status).toBe(429);
  });

  it('allows the client again once the window has passed', async () => {
    vi.useFakeTimers();
    try {
      const ip = '192.0.2.30';
      for (let i = 0; i < 10; i++) await request(CAMPAIGN_ID, { ip });
      expect((await request(CAMPAIGN_ID, { ip })).status).toBe(429);

      vi.advanceTimersByTime(60_001);
      expect((await request(CAMPAIGN_ID, { ip })).status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });
});
