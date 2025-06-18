DROP TRIGGER IF EXISTS gang_changes_log_trigger ON public.gangs;

CREATE TRIGGER gang_changes_log_trigger
    AFTER UPDATE
    ON public.gangs
    FOR EACH ROW
    EXECUTE FUNCTION auto_log_gang_changes();