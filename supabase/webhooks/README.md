# Supabase Database Webhooks

Version-controlled definitions of Database Webhooks that are **applied manually**, not by
CI. They live here (rather than in `supabase/migrations/` or `supabase/functions/`)
because:

- `supabase_functions.http_request` triggers embed a header secret, so they must not be
  committed with real credentials.
- `deploy_supabase_functions.yml` only deploys `supabase/functions/*.sql`.
- `supabase_schema_snapshot.yml` deliberately **strips** `supabase_functions.http_request`
  triggers from the schema dump, so they never round-trip into source.

Each `.sql` file keeps the trigger shape reproducible and reviewable with the secret
parameterized.

## `send_notification_email.sql`

Fires the `send-notification-email` edge function immediately when a row is inserted into
`public.email_deliveries` (the email outbox). This is the low-latency delivery path.

### Apply it

**Dashboard:** Database → Webhooks → *Create a new hook*
- Table: `public.email_deliveries`, Events: `INSERT`
- Type: *Supabase Edge Functions* → `send-notification-email`
- HTTP Headers: `Authorization: <the WEBHOOK_SECRET value>`

**Or via psql** (substitutes the secret from the environment):

```bash
psql "$SUPABASE_DB_URL" \
  -v webhook_secret="$WEBHOOK_SECRET" \
  -f supabase/webhooks/send_notification_email.sql
```

(When applying via psql, use the `format(...)` header form noted in the SQL file so the
secret is injected from `:'webhook_secret'` instead of the `<WEBHOOK_SECRET>` placeholder.)

### Recovery fallback (schedule)

The webhook is the *immediate* path. Also schedule the same function to sweep the outbox
for anything the webhook missed or that needs a retry. Schedule it in the Dashboard
(Edge Functions → Schedules) or with `pg_cron` → `pg_net`, e.g. every 5 minutes:

```sql
select cron.schedule(
  'sweep-notification-email',
  '*/5 * * * *',
  $$
  select net.http_post(
    url    := 'https://iojoritxhpijprgkjfre.supabase.co/functions/v1/send-notification-email',
    headers:= jsonb_build_object('Content-Type','application/json','Authorization', '<WEBHOOK_SECRET>')
  );
  $$
);
```

The worker self-claims from the outbox on every invocation, so the webhook and the sweep
never double-send (unique delivery rows + `FOR UPDATE SKIP LOCKED` + status transitions).

## Required edge-function secrets

Set these with `supabase secrets set` (never commit them):

```
AWS_ACCESS_KEY_ID       # least-privilege IAM identity, ses:SendEmail only
AWS_SECRET_ACCESS_KEY
AWS_REGION=us-east-1
SES_FROM_EMAIL          # a verified SES sender
WEBHOOK_SECRET          # shared secret in the webhook/schedule Authorization header
UNSUBSCRIBE_SECRET      # HMAC key for one-click unsubscribe tokens (same value in the Next app env)
APP_URL=https://www.mundamanager.com
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.
