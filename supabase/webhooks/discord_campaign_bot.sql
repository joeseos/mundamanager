-- Database Webhook: campaign_battles -> discord-campaign-bot.
--
-- Posts the battle report when a battle becomes played. Two triggers because
-- Postgres rejects OLD in the WHEN clause of a combined INSERT OR UPDATE trigger.
--
-- Applied manually, not by CI. Takes the secret from the trigger already
-- installed, so it can be pasted into the Supabase SQL editor without putting a
-- credential in the query history. Do not use Database > Webhooks: that UI names
-- the hook itself and forces a Supabase-managed JWT, which this function rejects.
--
-- Everything is inside the DO block, so the whole swap is one atomic statement.

DO $$
DECLARE
  url    text := 'https://iojoritxhpijprgkjfre.supabase.co/functions/v1/discord-campaign-bot';
  secret text;
  hdrs   text;
BEGIN
  SELECT (regexp_match(pg_get_triggerdef(oid), '"Authorization"\s*:\s*"([^"]+)"'))[1]
    INTO secret
  FROM pg_trigger
  WHERE tgrelid = 'public.campaign_battles'::regclass
    AND NOT tgisinternal
    AND tgname IN ('campaign_battles', 'campaign_battles_completed')
    AND pg_get_triggerdef(oid) LIKE '%discord-campaign-bot%'
  LIMIT 1;

  IF secret IS NULL OR secret = '' THEN
    RAISE EXCEPTION
      'No existing discord-campaign-bot trigger on campaign_battles to read the secret from. '
      'Recreate it with the secret supplied explicitly.';
  END IF;

  hdrs := jsonb_build_object(
    'Content-type', 'application/json',
    'Authorization', secret
  )::text;

  DROP TRIGGER IF EXISTS campaign_battles ON public.campaign_battles;
  DROP TRIGGER IF EXISTS campaign_battles_completed ON public.campaign_battles;

  -- format() because trigger arguments must be literal constants, so the secret
  -- cannot be interpolated into CREATE TRIGGER directly.
  EXECUTE format(
    $f$CREATE TRIGGER campaign_battles
         AFTER INSERT ON public.campaign_battles
         FOR EACH ROW WHEN (NEW.status = 'played')
         EXECUTE FUNCTION supabase_functions.http_request(
           %L, 'POST', %L, '{}', '5000')$f$, url, hdrs);

  EXECUTE format(
    $f$CREATE TRIGGER campaign_battles_completed
         AFTER UPDATE ON public.campaign_battles
         FOR EACH ROW WHEN (NEW.status = 'played'
                            AND OLD.status IS DISTINCT FROM 'played')
         EXECUTE FUNCTION supabase_functions.http_request(
           %L, 'POST', %L, '{}', '5000')$f$, url, hdrs);
END $$;
