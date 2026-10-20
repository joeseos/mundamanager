-- Campaign Sent history looks up notifications by type and link
-- (type = 'campaign_message' AND link IN (...)). The existing indexes are
-- single-column, so that filter scanned every campaign_message row.

CREATE INDEX IF NOT EXISTS notifications_type_link_idx
  ON public.notifications (type, link);
