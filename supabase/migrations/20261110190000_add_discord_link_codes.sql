-- One-time codes from the Discord bot's /link command. Anyone in a server the bot is in can run
-- /link and get a code for that server; a campaign owner or arbitrator enters it in Edit Campaign
-- to connect the campaign to that server without the bot invite screen, which needs Manage Server.
-- Written and read only with the service role (edge function and server action): users get no
-- SELECT, so nobody can list the codes.

CREATE TABLE public.discord_link_codes (
    code       text        PRIMARY KEY,
    guild_id   text        NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz
);

ALTER TABLE public.discord_link_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY discord_link_codes_admin_insert_policy
    ON public.discord_link_codes
    FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY discord_link_codes_admin_update_policy
    ON public.discord_link_codes
    FOR UPDATE
    TO authenticated
    USING ((SELECT private.is_admin()))
    WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY discord_link_codes_admin_delete_policy
    ON public.discord_link_codes
    FOR DELETE
    TO authenticated
    USING ((SELECT private.is_admin()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discord_link_codes TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.discord_link_codes TO authenticated;
