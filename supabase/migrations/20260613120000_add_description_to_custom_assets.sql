-- Migration: Add optional description to custom asset tables

ALTER TABLE public.custom_skills ADD COLUMN description text;
ALTER TABLE public.custom_gang_types ADD COLUMN description text;
ALTER TABLE public.custom_equipment ADD COLUMN description text;
ALTER TABLE public.custom_fighter_types ADD COLUMN description text;
