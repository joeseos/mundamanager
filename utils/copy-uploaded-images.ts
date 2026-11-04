import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Gives each copied gang or fighter its own copy of its source's uploaded
 * image, named for the copy like an upload, so the copy keeps its image when
 * the source's is replaced or deleted. A source with no upload, or whose file
 * is already gone, leaves the copy on the default image.
 */
export async function copyUploadedImages(
  supabase: SupabaseClient,
  table: 'gangs' | 'fighters',
  folder: string,
  copies: { id: string; sourceUrl: string | null | undefined }[]
) {
  const bucket = supabase.storage.from('users-images');
  await Promise.all(
    copies.map(async ({ id, sourceUrl }) => {
      const sourcePath = sourceUrl?.split('/users-images/')[1];
      if (!sourcePath) return;

      const path = `${folder}${id}_${Date.now()}.webp`;
      const { error: copyError } = await bucket.copy(sourcePath, path);
      if (copyError) {
        console.warn(`Failed to copy image ${sourcePath}:`, copyError);
        return;
      }
      const { error } = await supabase
        .from(table)
        .update({ image_url: bucket.getPublicUrl(path).data.publicUrl })
        .eq('id', id);
      if (error) console.error('Error saving copied image:', error);
    })
  );
}
