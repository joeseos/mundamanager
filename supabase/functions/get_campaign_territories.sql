
WITH gang_territories AS (
    SELECT
        k.gang_id::uuid as gang_id,
        json_agg(
            json_build_object(
                'id', ct.id,
                'territory_id', ct.territory_id,
                'territory_name', ct.territory_name,
                'assigned_at', ((ct.owner->>k.gang_id)::jsonb)->>'assigned_at'
            )
        ) as territories
    FROM campaign_territories ct,
    LATERAL jsonb_object_keys(ct.owner) as k(gang_id)
    WHERE ct.campaign_id = $1
    AND ct.owner IS NOT NULL
    GROUP BY k.gang_id
)
SELECT json_build_object(
    'gang_id', gt.gang_id,
    'territories', gt.territories
)
FROM gang_territories gt;
