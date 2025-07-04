# Cache Strategy Options

## **Option 1: TTL as Safety Net (Recommended)**

```typescript
export const getCampaignMembers = unstable_cache(
  async (campaignId: string) => {
    const supabase = await createClient();
    return _getCampaignMembers(campaignId, supabase);
  },
  ['campaign-members'],
  {
    tags: ['campaign-members', `campaign-members-${campaignId}`, `campaign-${campaignId}`],
    revalidate: 1800 // 30 minutes safety net
  }
);
```

**Pros:**
- Handles external database changes
- Protects against failed cache invalidation
- Handles edge cases and race conditions
- More resilient system

**Cons:**
- Slight complexity
- Potential for stale data (rare)

## **Option 2: No TTL (Server Actions Only)**

```typescript
export const getCampaignMembers = unstable_cache(
  async (campaignId: string) => {
    const supabase = await createClient();
    return _getCampaignMembers(campaignId, supabase);
  },
  ['campaign-members'],
  {
    tags: ['campaign-members', `campaign-members-${campaignId}`, `campaign-${campaignId}`],
    revalidate: false // Cache never expires automatically
  }
);
```

**Pros:**
- Maximum performance (infinite cache)
- Simpler mental model
- Perfect data consistency via server actions

**Cons:**
- Vulnerable to external database changes
- No protection against failed invalidation
- Requires perfect server action coverage

## **Option 3: Long TTL (Best of Both)**

```typescript
export const getCampaignMembers = unstable_cache(
  async (campaignId: string) => {
    const supabase = await createClient();
    return _getCampaignMembers(campaignId, supabase);
  },
  ['campaign-members'],
  {
    tags: ['campaign-members', `campaign-members-${campaignId}`, `campaign-${campaignId}`],
    revalidate: 86400 // 24 hours - very long safety net
  }
);
```

**Pros:**
- Near-infinite cache performance
- Protection against edge cases
- Simple and resilient

**Cons:**
- Potential 24-hour stale data in edge cases

## **Recommendation**

**Use Option 3 (Long TTL)** for your use case:

- **24 hours** for most campaign data
- **1 week** for rarely changing data (triumphs)
- **1 hour** for frequently changing data (territories) if needed

This gives you the performance benefits of infinite cache while maintaining protection against edge cases.

## **When to Use Each Option**

### **Use TTL Safety Net (Option 1) when:**
- Multiple systems can modify the database
- You have admin interfaces that bypass server actions
- You have webhook integrations
- You have background jobs that update data
- You want maximum resilience

### **Use No TTL (Option 2) when:**
- ALL changes go through your server actions
- You have perfect test coverage
- You want maximum performance
- You're confident in your invalidation logic

### **Use Long TTL (Option 3) when:**
- Most changes go through server actions
- You want the best of both worlds
- You prefer a conservative approach
- You want to handle unknown edge cases

## **Your Current Architecture Assessment**

Based on your codebase:
- ✅ All user-triggered changes go through server actions
- ✅ Proper cache invalidation is implemented
- ❓ Potential for admin/external database changes
- ❓ Background jobs or webhooks (unknown)

**Recommendation: Use Long TTL (24 hours) as a safety net.**