DROP TRIGGER IF EXISTS fighter_changes_log_trigger ON public.fighters;
DROP TRIGGER IF EXISTS fighter_delete_log_trigger ON public.fighters;

-- Trigger for DELETE operations (BEFORE to capture vehicle assignments)
CREATE TRIGGER fighter_delete_log_trigger 
    BEFORE DELETE 
    ON public.fighters 
    FOR EACH ROW 
    EXECUTE FUNCTION fighter_logs();

-- Trigger for INSERT and UPDATE operations (AFTER for normal logging)
CREATE TRIGGER fighter_changes_log_trigger 
    AFTER INSERT OR UPDATE 
    ON public.fighters 
    FOR EACH ROW 
    EXECUTE FUNCTION fighter_logs();