-- Add standard_class boolean column to fighter_classes table
-- When true, the class appears in the fighter class override dropdown

ALTER TABLE public.fighter_classes
    ADD COLUMN standard_class boolean NOT NULL DEFAULT false;

-- Add index for filtering standard classes
CREATE INDEX idx_fighter_classes_standard_class
    ON public.fighter_classes(standard_class)
    WHERE standard_class = true;
