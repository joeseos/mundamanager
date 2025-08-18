'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Cropper from 'react-easy-crop';
import { Button } from '@/components/ui/button';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { updateGangImage } from '@/app/actions/update-gang-image';
import Modal from '@/components/ui/modal';

interface GangImageEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentImageUrl?: string;
  gangId: string;
  onImageUpdate: (newImageUrl: string) => void;
}

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const GangImageEditModal: React.FC<GangImageEditModalProps> = ({
  isOpen,
  onClose,
  currentImageUrl,
  gangId,
  onImageUpdate,
}) => {
  const [image, setImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
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
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [isOpen]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast({
          title: "File too large",
          description: "Please select an image smaller than 10MB",
          variant: "destructive",
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', error => reject(error));
      image.src = url;
    });

  const getCroppedImg = async (
    imageSrc: string,
    pixelCrop: CropArea
  ): Promise<Blob> => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('No 2d context');
    }

    // Set canvas size to 200x200
    canvas.width = 200;
    canvas.height = 200;

    // Calculate the crop dimensions
    const { x, y, width, height } = pixelCrop;

    // Draw the cropped image
    ctx.drawImage(
      image,
      x,
      y,
      width,
      height,
      0,
      0,
      200,
      200
    );

    // Convert to WebP format with quality settings
    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            throw new Error('Failed to create blob for this image');
          }
        },
        'image/webp',
        0.85 // 85% quality
      );
    });
  };

  const compressImage = async (blob: Blob): Promise<Blob> => {
    // If blob is already under 16KB, return it
    if (blob.size <= 16 * 1024) {
      return blob;
    }

    // Create a new canvas to compress
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2d context');

    const image = await createImage(URL.createObjectURL(blob));
    canvas.width = 200;
    canvas.height = 200;

    // Try different quality levels
    const qualities = [0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];
    
    for (const quality of qualities) {
      ctx.clearRect(0, 0, 200, 200);
      ctx.drawImage(image, 0, 0, 200, 200);
      
      const compressedBlob = await new Promise<Blob>((resolve) => {
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else throw new Error('Failed to create compressed blob for this image');
          },
          'image/webp',
          quality
        );
      });

      if (compressedBlob.size <= 16 * 1024) {
        return compressedBlob;
      }
    }

    // If still too large, return the smallest one
    ctx.clearRect(0, 0, 200, 200);
    ctx.drawImage(image, 0, 0, 200, 200);
    
    return new Promise<Blob>((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else throw new Error('Failed to create final compressed blob for this image');
        },
        'image/webp',
        0.1
      );
    });
  };

  const handleSave = async (): Promise<boolean> => {
    if (!image || !croppedAreaPixels) {
      toast({
        title: "No image selected",
        description: "Please select an image to crop",
        variant: "destructive",
      });
      return false;
    }

    setIsRemoving(false);
    setIsUploading(true);
    try {
      // Create cropped image
      const croppedBlob = await getCroppedImg(image, croppedAreaPixels);
      
      // Compress to under 16KB
      const compressedBlob = await compressImage(croppedBlob);
      
      // Upload to Supabase Storage
      const supabase = createClient();
      
      // Create the file path with timestamp to avoid cache issues
      const timestamp = Date.now();
      const fileName = `${gangId}_${timestamp}.webp`;
      const filePath = `gangs/${gangId}/${fileName}`;
      
      const { data, error } = await supabase.storage
        .from('users-images')
        .upload(filePath, compressedBlob, {
          upsert: true,
          contentType: 'image/webp',
          cacheControl: 'no-cache',
        });

      if (error) {
        throw error;
      }

      // Clean up old images for this gang
      const { data: files } = await supabase.storage
        .from('users-images')
        .list(`gangs/${gangId}/`);
      
      const filesToRemove: string[] = [];
      
      if (files) {
        // Find all files that start with the gang ID (excluding the new one we just uploaded)
        files.forEach(file => {
          if ((file.name.startsWith(`${gangId}_`) || file.name === `${gangId}.webp`) && 
              file.name !== fileName) {
            filesToRemove.push(`gangs/${gangId}/${file.name}`);
          }
        });
      }
      
      // Remove old files
      if (filesToRemove.length > 0) {
        await supabase.storage
          .from('users-images')
          .remove(filesToRemove);
      }

      // Get the public URL
      const { data: urlData } = supabase.storage
        .from('users-images')
        .getPublicUrl(filePath);

      // Update the database using server action (includes cache invalidation)
      const updateResult = await updateGangImage(gangId, urlData.publicUrl);
      
      if (!updateResult.success) {
        throw new Error(updateResult.error || 'Failed to update gang image');
      }

      // Update the UI
      onImageUpdate(urlData.publicUrl);
      
      toast({
        title: "Success",
        description: "Gang image updated successfully",
      });

      return true;
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        title: "Upload failed",
        description: "Failed to upload image. Please try again.",
        variant: "destructive",
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
      
      // Remove from storage if exists (try both old and new filename patterns)
      const oldFileName = `${gangId}.webp`;
      const oldFilePath = `gangs/${gangId}/${oldFileName}`;
      
      // List files in the gang directory to find the actual filename
      const { data: files } = await supabase.storage
        .from('users-images')
        .list(`gangs/${gangId}/`);
      
      const filesToRemove: string[] = [];
      
      if (files) {
        // Find all files that start with the gang ID
        files.forEach(file => {
          if (file.name.startsWith(`${gangId}_`) || file.name === `${gangId}.webp`) {
            filesToRemove.push(`gangs/${gangId}/${file.name}`);
          }
        });
      }
      
      // Remove all matching files
      if (filesToRemove.length > 0) {
        await supabase.storage
          .from('users-images')
          .remove(filesToRemove);
      }

      // Update database using server action (includes cache invalidation)
      const updateResult = await updateGangImage(gangId, null);
      
      if (!updateResult.success) {
        throw new Error(updateResult.error || 'Failed to remove gang image');
      }

      // Update the UI
      onImageUpdate('');
      
      toast({
        title: "Success",
        description: "Gang image removed successfully",
      });

      return true;
    } catch (error) {
      console.error('Error removing image:', error);
      toast({
        title: "Remove failed",
        description: "Failed to remove image. Please try again.",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsRemoving(false);
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      title="Edit Gang Image"
      onClose={onClose}
      onConfirm={handleSave}
      confirmText={isUploading ? (isRemoving ? 'Removing Image...' : 'Uploading...') : 'Upload Image'}
      confirmDisabled={!image || !croppedAreaPixels || isUploading}
      width="2xl"
    >
      <div className="space-y-4">
        {/* Current image display */}
        {currentImageUrl && (
          <div className="mb-4">
            <div className="flex items-center justify-center space-x-4">
              <img
                src={currentImageUrl}
                alt="Current gang"
                className="bg-black rounded-full shadow-md border-4 border-black size-[85px] rounded-full object-cover overflow-hidden"
              />
              <Button
                variant="destructive"
                onClick={handleRemoveImage}
                disabled={isUploading}
              >
                Remove Image
              </Button>
            </div>
          </div>
        )}

        {/* File upload */}
        <div className="mb-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full"
          >
            Replace with New Image
          </Button>
        </div>

        {/* Crop area */}
        {image && (
          <div className="mb-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Crop Image:</h3>
            <div className="relative w-full h-64 bg-gray-100 rounded-lg overflow-hidden" style={{ position: 'relative' }}>
              <Cropper
                image={image}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                showGrid={true}
                objectFit="contain"
                style={{
                  containerStyle: {
                    width: '100%',
                    height: '100%',
                    backgroundColor: '#f3f4f6'
                  }
                }}
              />
            </div>
           
            {/* Zoom control */}
            <div className="flex items-center mt-2">
              <label className="text-sm font-medium text-gray-700">Zoom:</label>
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full ml-2 mt-1"
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
