'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'sonner';
import {
  validateImageFile,
  processImageFile,
  getResizedImgMax,
} from '@/utils/image-processing';

export interface DraftUpload {
  draftPath: string;
  draftUrl: string;
  blob: Blob;
}

export interface UseRichTextImagesOptions {
  campaignId?: string;
  content?: string; // Current HTML content to count images from
  maxImages?: number;
  onImageInserted?: (url: string) => void;
  onCloseImageInput?: () => void;
}

export interface UseRichTextImagesReturn {
  // State
  isUploadingImage: boolean;
  uploadedImageCount: number;
  draftUploads: DraftUpload[];
  pendingDeletes: string[];
  hostedImageToRemove: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;

  // Setters
  setHostedImageToRemove: (src: string | null) => void;

  // Helpers
  getStorageBaseUrl: () => string;
  getStoragePathFromUrl: (src: string) => string | null;
  isHostedImage: (src?: string) => boolean;

  // Actions
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  removeHostedImage: (src: string, removeImageFromEditor: () => void) => Promise<void>;
  finalizeAssets: (currentHtml: string) => Promise<string>;
  discardAssets: () => Promise<void>;
  resetImageInputState: () => void;
}

export function useRichTextImages({
  campaignId,
  content = '',
  maxImages = 5,
  onImageInserted,
  onCloseImageInput,
}: UseRichTextImagesOptions): UseRichTextImagesReturn {
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [draftUploads, setDraftUploads] = useState<DraftUpload[]>([]);
  const [pendingDeletes, setPendingDeletes] = useState<string[]>([]);
  const [hostedImageToRemove, setHostedImageToRemove] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  

  // Storage URL helpers
  const getStorageBaseUrl = useCallback(() => {
    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
    return supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/users-images/` : '';
  }, []);

  const getStoragePathFromUrl = useCallback((src: string): string | null => {
    const base = getStorageBaseUrl();
    const withoutQuery = src.split('?')[0];
    if (base && withoutQuery.startsWith(base)) {
      return withoutQuery.replace(base, '');
    }
    const marker = '/users-images/';
    const idx = withoutQuery.indexOf(marker);
    if (idx !== -1) {
      return withoutQuery.slice(idx + marker.length);
    }
    return null;
  }, [getStorageBaseUrl]);

  const isHostedImage = useCallback((src?: string) => {
    if (!src) return false;
    const base = getStorageBaseUrl();
    return !!base && src.startsWith(base);
  }, [getStorageBaseUrl]);

  // Count hosted images currently in the HTML content
  const uploadedImageCount = useMemo(() => {
    if (!campaignId) return 0;

    const base = getStorageBaseUrl();
    if (!base) return 0;

    // Parse content for img tags with our storage URL
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let count = 0;
    let match;

    while ((match = imgRegex.exec(content)) !== null) {
      const src = match[1];
      // Count images hosted on our platform (both drafts and permanent)
      if (src.startsWith(base)) {
        count++;
      }
    }

    return count;
  }, [campaignId, content, getStorageBaseUrl]);

  const resetImageInputState = useCallback(() => {
    setHostedImageToRemove(null);
    onCloseImageInput?.();
  }, [onCloseImageInput]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file using shared utilities
    const validation = validateImageFile(file);
    if (!validation.valid) {
      toast.error(validation.error?.includes('10MB') ? 'File too large' : 'Unsupported file type', { description: validation.error });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Check image limit
    if (campaignId && uploadedImageCount >= maxImages) {
      toast.error('Image limit reached', { description: `Maximum of ${maxImages} images can be uploaded per campaign.` });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsUploadingImage(true);
    try {
      // Normalize file (e.g. HEIC → PNG) using shared utility
      const processedFile = await processImageFile(file);

      // Read file as data URL
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const dataUrl = reader.result as string;

          // Resize image so that neither dimension exceeds 900px, preserving aspect ratio
          const resizedBlob = await getResizedImgMax(dataUrl, 900, 900);

          // Upload to Supabase Storage
          if (!campaignId) {
            throw new Error('Campaign ID is required for image upload');
          }

          const supabase = createClient();
          const ts = Date.now();
          const fileName = `draft_${ts}.webp`;
          const filePath = `campaigns/${campaignId}/pack/_draft/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('users-images')
            .upload(filePath, resizedBlob, {
              upsert: true,
              contentType: 'image/webp',
              cacheControl: 'no-cache',
            });

          if (uploadError) throw uploadError;

          // Get public URL
          const { data: urlData } = supabase.storage
            .from('users-images')
            .getPublicUrl(filePath);

          // Track draft upload for later promotion on save
          setDraftUploads((prev) => [...prev, { draftPath: filePath, draftUrl: urlData.publicUrl, blob: resizedBlob }]);

          // Notify parent to insert image into editor (count updates automatically via content)
          onImageInserted?.(urlData.publicUrl);

          toast.success('Success', { description: 'Image uploaded successfully' });

          // Close image input
          onCloseImageInput?.();
        } catch (error) {
          console.error('Error processing/uploading image:', error);
          toast.error('Upload failed', { description: 'Failed to upload image. Please try again.' });
        } finally {
          setIsUploadingImage(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      reader.readAsDataURL(processedFile);
    } catch (error) {
      console.error('Error processing image:', error);
      toast.error('File processing failed', { description: 'Failed to process the image. Please try a different file.' });
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [campaignId, maxImages, uploadedImageCount, onImageInserted, onCloseImageInput]);

  const removeHostedImage = useCallback(async (src: string, removeImageFromEditor: () => void) => {
    const storagePath = getStoragePathFromUrl(src);
    if (!storagePath || !campaignId) {
      removeImageFromEditor();
      return;
    }

    // If this is a staged draft file, delete immediately
    if (storagePath.includes('/_draft/')) {
      setIsUploadingImage(true);
      try {
        const supabase = createClient();
        const { error } = await supabase.storage.from('users-images').remove([storagePath]);
        if (error) throw error;
        setDraftUploads((prev) => prev.filter((d) => d.draftPath !== storagePath));
        removeImageFromEditor(); // Count updates automatically via content change
        resetImageInputState();
        toast.success('Image removed', { description: 'The image was deleted from storage.' });
      } catch (error) {
        console.error('Error removing hosted image:', error);
        toast.error('Remove failed', { description: 'Failed to delete the image. Please try again.' });
      } finally {
        setIsUploadingImage(false);
      }
      return;
    }

    // Otherwise, defer deletion until save
    setPendingDeletes((prev) => prev.includes(storagePath) ? prev : [...prev, storagePath]);
    removeImageFromEditor(); // Count updates automatically via content change
    resetImageInputState();
    toast.success('Image marked for removal', { description: 'It will be deleted when you save.' });
  }, [campaignId, getStoragePathFromUrl, resetImageInputState]);

  const finalizeAssets = useCallback(async (currentHtml: string): Promise<string> => {
    let html = currentHtml;
    if (!campaignId) return html;

    try {
      const supabase = createClient();
      const baseUrl = getStorageBaseUrl();

      // Separate drafts that are still in the HTML vs orphaned ones
      const draftsToPromote: DraftUpload[] = [];
      const orphanedDraftPaths: string[] = [];

      for (const draft of draftUploads) {
        if (html.includes(draft.draftUrl)) {
          draftsToPromote.push(draft);
        } else {
          // Draft was removed from content - mark for deletion
          orphanedDraftPaths.push(draft.draftPath);
        }
      }

      // Delete orphaned drafts from current session
      if (orphanedDraftPaths.length > 0) {
        await supabase.storage.from('users-images').remove(orphanedDraftPaths);
      }

      // Also clean up any orphaned draft files in storage (from previous sessions)
      const draftPath = `campaigns/${campaignId}/pack/_draft`;
      const { data: draftFiles } = await supabase.storage
        .from('users-images')
        .list(draftPath);

      if (draftFiles && draftFiles.length > 0) {
        const orphanedStorageDrafts: string[] = [];

        for (const file of draftFiles) {
          if (!file.name.match(/\.(webp|jpg|jpeg|png|gif)$/i)) {
            continue;
          }

          const filePath = `${draftPath}/${file.name}`;
          const fileUrl = `${baseUrl}${filePath}`;

          // If this draft is not in the HTML and not being promoted, delete it
          if (!html.includes(fileUrl)) {
            orphanedStorageDrafts.push(filePath);
          }
        }

        if (orphanedStorageDrafts.length > 0) {
          await supabase.storage.from('users-images').remove(orphanedStorageDrafts);
        }
      }

      // Promote remaining drafts
      for (let i = 0; i < draftsToPromote.length; i++) {
        const draft = draftsToPromote[i];
        const ts = Date.now() + i;
        const finalName = `pack_${ts}.webp`;
        const finalPath = `campaigns/${campaignId}/pack/${finalName}`;

        const { error: uploadError } = await supabase.storage
          .from('users-images')
          .upload(finalPath, draft.blob, {
            upsert: true,
            contentType: 'image/webp',
            cacheControl: 'no-cache',
          });
        if (uploadError) throw uploadError;

        // Delete draft file
        await supabase.storage.from('users-images').remove([draft.draftPath]);

        const { data: urlData } = supabase.storage
          .from('users-images')
          .getPublicUrl(finalPath);

        // Replace draft URL in HTML with final URL
        html = html.split(draft.draftUrl).join(urlData.publicUrl);
      }

      // Execute pending deletions (images explicitly marked for removal)
      if (pendingDeletes.length > 0) {
        await supabase.storage.from('users-images').remove(pendingDeletes);
      }

      // Clean up permanent images that are no longer referenced in the final HTML
      const packPath = `campaigns/${campaignId}/pack`;
      const { data: existingFiles } = await supabase.storage
        .from('users-images')
        .list(packPath);

      if (existingFiles && existingFiles.length > 0) {
        const orphanedPermanentPaths: string[] = [];

        for (const file of existingFiles) {
          // Skip the _draft folder and non-image files
          if (file.name === '_draft' || !file.name.match(/\.(webp|jpg|jpeg|png|gif)$/i)) {
            continue;
          }

          const filePath = `${packPath}/${file.name}`;
          const fileUrl = `${baseUrl}${filePath}`;

          // If this permanent image is not in the final HTML, mark for deletion
          if (!html.includes(fileUrl)) {
            orphanedPermanentPaths.push(filePath);
          }
        }

        if (orphanedPermanentPaths.length > 0) {
          await supabase.storage.from('users-images').remove(orphanedPermanentPaths);
        }
      }

      // Clear state after commit
      setDraftUploads([]);
      setPendingDeletes([]);
      setHostedImageToRemove(null);

      return html;
    } catch (error) {
      console.error('Error finalizing assets:', error);
      toast.error('Save warning', { description: 'Failed to finalize images. Please try again.' });
      return html;
    }
  }, [campaignId, draftUploads, pendingDeletes, getStorageBaseUrl]);

  const discardAssets = useCallback(async () => {
    if (!campaignId) return;
    try {
      const supabase = createClient();
      const draftPaths = draftUploads.map((d) => d.draftPath);
      if (draftPaths.length > 0) {
        await supabase.storage.from('users-images').remove(draftPaths);
      }
    } catch (error) {
      console.error('Error discarding draft images:', error);
    } finally {
      setDraftUploads([]);
      setPendingDeletes([]);
      setHostedImageToRemove(null);
    }
  }, [campaignId, draftUploads]);

  return {
    // State
    isUploadingImage,
    uploadedImageCount,
    draftUploads,
    pendingDeletes,
    hostedImageToRemove,
    fileInputRef,

    // Setters
    setHostedImageToRemove,

    // Helpers
    getStorageBaseUrl,
    getStoragePathFromUrl,
    isHostedImage,

    // Actions
    handleFileUpload,
    removeHostedImage,
    finalizeAssets,
    discardAssets,
    resetImageInputState,
  };
}

