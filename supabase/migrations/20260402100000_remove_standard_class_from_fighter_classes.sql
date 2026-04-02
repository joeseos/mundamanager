-- Remove standard_class column from fighter_classes table
-- No longer used - the fighter class dropdown now shows all classes

DROP INDEX IF EXISTS idx_fighter_classes_standard_class;

ALTER TABLE public.fighter_classes
    DROP COLUMN standard_class;
