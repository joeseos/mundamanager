-- Create enum for member roles
CREATE TYPE campaign_member_role AS ENUM ('ADMIN', 'MEMBER');

CREATE TABLE campaign_members (
    campaign_id TEXT REFERENCES campaigns(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
    role campaign_member_role NOT NULL DEFAULT 'MEMBER',
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    invited_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    PRIMARY KEY (campaign_id, user_id)
);

-- Add indexes for better query performance
CREATE INDEX idx_campaign_members_campaign_id ON campaign_members(campaign_id);
CREATE INDEX idx_campaign_members_user_id ON campaign_members(user_id);
CREATE INDEX idx_campaign_members_invited_by ON campaign_members(invited_by); 