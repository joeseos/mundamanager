-- Safety net: prevent negative credits, rating, and wealth at the database level.
-- Application code already floors these to 0 via Math.max(), but CHECK constraints
-- guard against race conditions and future bugs.

ALTER TABLE gangs ADD CONSTRAINT gangs_credits_non_negative CHECK (credits >= 0);
ALTER TABLE gangs ADD CONSTRAINT gangs_rating_non_negative CHECK (rating >= 0);
ALTER TABLE gangs ADD CONSTRAINT gangs_wealth_non_negative CHECK (wealth >= 0);
