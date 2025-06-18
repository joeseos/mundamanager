-- Add vehicle_id column to gang_logs table
ALTER TABLE gang_logs ADD COLUMN vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE;

-- Add index for performance
CREATE INDEX idx_gang_logs_vehicle_id ON gang_logs(vehicle_id); 