CREATE TABLE campaign_types (
    campaign_type_id TEXT PRIMARY KEY,
    campaign_type TEXT NOT NULL
);

-- Insert the initial campaign types
INSERT INTO campaign_types (campaign_type_id, campaign_type) VALUES
    ('dominion', 'Dominion'),
    ('law-and-misrule', 'Law & Misrule'),
    ('uprising', 'Uprising'); 