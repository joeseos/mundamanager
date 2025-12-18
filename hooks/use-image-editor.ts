'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { createClient } from '@/utils/supabase/client';
import {
  CropArea,
  getCroppedImg,
  getResizedImg,
  compressImage,
  validateImageFile,
  processImageFile,
} from '@/utils/image-processing';

export interface UseImageEditorOptions {
  isOpen: boolean;
  onImageUpdate: (newImageUrl: string) => void;
  uploadConfig: {
    entityId: string;
    storagePath: string;
    fileNamePattern: (id: string, timestamp: number) => string;
    listPath: string;
    updateAction: (imageUrl: string | null) => Promise<{ success: boolean; error?: string }>;
    successMessage: string;
    removeSuccessMessage: string;
  };
  imageConfig?: {
    crop?: boolean;
    width?: number;
    height?: number;
    targetSizeBytes?: number;
  };
}

export const useImageEditor = ({
  isOpen,
  onImageUpdate,
  uploadConfig,
  imageConfig = {},
}: UseImageEditorOptions) => {
  const {
    crop: enableCrop = true,
    width = 200,
    height = 200,
    targetSizeBytes = 16 * 1024,
  } = imageConfig;
  
  // Calculate cropAspect from width and height
  const cropAspect = width / height;
  
  const [image, setImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const onCropComplete = useCallback((croppedArea: any, croppedAreaPixels: CropArea) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  // Reset modal state when it opens
  useEffect(() => {
    if (isOpen) {
      setImage(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setIsUploading(false);
      setIsRemoving(false);
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [isOpen]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file
    const validation = validateImageFile(file);
    if (!validation.valid) {
      toast({
        title: validation.error?.includes('10MB') ? 'File too large' : 'Unsupported file type',
        description: validation.error,
        variant: 'destructive',
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      setIsProcessing(true);
      const processedFile = await processImageFile(file);
      const reader = new FileReader();
      reader.onload = () => setImage(reader.result as string);
      reader.readAsDataURL(processedFile);
    } catch (error) {
      console.error('Error processing image:', error);
      toast({
        title: 'File processing failed',
        description: 'Failed to process the image. Please try a different file.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = async (): Promise<boolean> => {
    if (!image) {
      toast({
        title: 'No image selected',
        description: 'Please select an image',
        variant: 'destructive',
      });
      return false;
    }

    if (enableCrop && !croppedAreaPixels) {
      toast({
        title: 'No image selected',
        description: 'Please select an image to crop',
        variant: 'destructive',
      });
      return false;
    }

    setIsRemoving(false);
    setIsUploading(true);
    try {
      // Create processed image (cropped or resized)
      const processedBlob = enableCrop && croppedAreaPixels
        ? await getCroppedImg(image, croppedAreaPixels, width, height)
        : await getResizedImg(image, width, height);

      // Compress to under target size
      const compressedBlob = await compressImage(processedBlob, targetSizeBytes, width, height);

      // Upload to Supabase Storage
      const supabase = createClient();
      const timestamp = Date.now();
      const fileName = uploadConfig.fileNamePattern(uploadConfig.entityId, timestamp);
      const filePath = `${uploadConfig.storagePath}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('users-images')
        .upload(filePath, compressedBlob, {
          upsert: true,
          contentType: 'image/webp',
          cacheControl: 'no-cache',
        });

      if (uploadError) {
        throw uploadError;
      }

      // Clean up old images
      const { data: files } = await supabase.storage
        .from('users-images')
        .list(uploadConfig.listPath);

      const filesToRemove: string[] = [];

      if (files) {
        files.forEach((file) => {
          const shouldRemove =
            (file.name.startsWith(`${uploadConfig.entityId}_`) ||
              file.name === `${uploadConfig.entityId}.webp`) &&
            file.name !== fileName;
          if (shouldRemove) {
            filesToRemove.push(`${uploadConfig.storagePath}/${file.name}`);
          }
        });
      }

      // Remove old files
      if (filesToRemove.length > 0) {
        await supabase.storage.from('users-images').remove(filesToRemove);
      }

      // Get the public URL
      const { data: urlData } = supabase.storage
        .from('users-images')
        .getPublicUrl(filePath);

      // Update the database using server action
      const updateResult = await uploadConfig.updateAction(urlData.publicUrl);

      if (!updateResult.success) {
        throw new Error(updateResult.error || 'Failed to update image');
      }

      // Update the UI
      onImageUpdate(urlData.publicUrl);

      toast({
        title: 'Success',
        description: uploadConfig.successMessage,
      });

      return true;
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        title: 'Upload failed',
        description: 'Failed to upload image. Please try again.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveImage = async (): Promise<boolean> => {
    setIsRemoving(true);
    setIsUploading(true);
    try {
      const supabase = createClient();

      // List files to find matching ones
      const { data: files } = await supabase.storage
        .from('users-images')
        .list(uploadConfig.listPath);

      const filesToRemove: string[] = [];

      if (files) {
        files.forEach((file) => {
          if (
            file.name.startsWith(`${uploadConfig.entityId}_`) ||
            file.name === `${uploadConfig.entityId}.webp`
          ) {
            filesToRemove.push(`${uploadConfig.storagePath}/${file.name}`);
          }
        });
      }

      // Remove all matching files
      if (filesToRemove.length > 0) {
        await supabase.storage.from('users-images').remove(filesToRemove);
      }

      // Update database using server action
      const updateResult = await uploadConfig.updateAction(null);

      if (!updateResult.success) {
        throw new Error(updateResult.error || 'Failed to remove image');
      }

      // Update the UI
      onImageUpdate('');

      toast({
        title: 'Success',
        description: uploadConfig.removeSuccessMessage,
      });

      return true;
    } catch (error) {
      console.error('Error removing image:', error);
      toast({
        title: 'Remove failed',
        description: 'Failed to remove image. Please try again.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsRemoving(false);
      setIsUploading(false);
    }
  };

  return {
    image,
    crop,
    zoom,
    croppedAreaPixels,
    isUploading,
    isRemoving,
    isProcessing,
    fileInputRef,
    setCrop,
    setZoom,
    onCropComplete,
    handleFileSelect,
    handleSave,
    handleRemoveImage,
    cropAspect: enableCrop ? cropAspect : undefined,
    enableCrop,
  };
};

