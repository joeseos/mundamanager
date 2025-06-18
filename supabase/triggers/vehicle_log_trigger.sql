DROP TRIGGER IF EXISTS vehicle_log_trigger ON public.vehicles;

CREATE TRIGGER vehicle_log_trigger
    AFTER INSERT OR UPDATE OR DELETE
    ON public.vehicles
    FOR EACH ROW
    EXECUTE FUNCTION vehicle_logs(); 