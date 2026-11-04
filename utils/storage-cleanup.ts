import type { SupabaseClient } from '@supabase/supabase-js';

/** A gang's image folders in users-images: the gang image and its fighters' images. */
export const gangImageFolders = (gangId: string) => [`gangs/${gangId}/`, `gangs/${gangId}/fighters/`];

/**
 * Removes the files directly inside each users-images folder. Folders are
 * virtual: a listing shows subfolders with no id, and they go once empty.
 * Failures are logged, never thrown, so a storage hiccup doesn't fail the
 * delete that called it.
 */
export async function removeStorageFolders(supabase: SupabaseClient, folders: string[]) {
  try {
    const listings = await Promise.all(
      folders.map((folder) => supabase.storage.from('users-images').list(folder))
    );
    const files = listings.flatMap(({ data }, i) =>
      (data ?? []).filter((file) => file.id).map((file) => `${folders[i]}${file.name}`)
    );
    if (files.length > 0) {
      const { error } = await supabase.storage.from('users-images').remove(files);
      if (error) console.error('Error removing storage files:', error);
    }
  } catch (error) {
    console.error('Error removing storage files:', error);
  }
}
