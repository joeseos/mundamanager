-- Clear gang and fighter image_urls whose file is gone
--
-- Copying a gang or fighter used to keep the source's image_url, so the copy
-- showed the source's file. Once the source's owner replaced or removed that
-- image, or deleted the fighter, gang or account, the copy pointed at a
-- missing file: a broken image on the fighter card, and a NoSuchKey warning
-- in the storage logs on every view. On 2026-11-04 that was 448 fighters and
-- 93 gangs.
--
-- NULL puts them back on the default image: the gang's catalogue portrait or
-- the unknown gang/fighter silhouette.
--
-- Safe to run again: only rows whose file is missing are touched.

BEGIN;

UPDATE public.fighters f
SET image_url = NULL
WHERE f.image_url LIKE '%/storage/v1/object/public/users-images/%'
  AND NOT EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id = 'users-images'
      AND o.name = split_part(f.image_url, '/users-images/', 2)
  );

UPDATE public.gangs g
SET image_url = NULL
WHERE g.image_url LIKE '%/storage/v1/object/public/users-images/%'
  AND NOT EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id = 'users-images'
      AND o.name = split_part(g.image_url, '/users-images/', 2)
  );

COMMIT;
