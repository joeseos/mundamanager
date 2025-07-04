-- Create the trigger for fighter equipment changes
DROP TRIGGER IF EXISTS fighter_equipment_log_trigger ON fighter_equipment;
CREATE TRIGGER fighter_equipment_log_trigger
    AFTER INSERT OR DELETE ON fighter_equipment
    FOR EACH ROW
    EXECUTE FUNCTION fighter_equipment_logs();