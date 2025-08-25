'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Cropper from 'react-easy-crop';
import { Button } from '@/components/ui/button';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { updateCampaignImage } from '@/app/actions/campaigns/[id]/update-campaign-image';
import Modal from '@/components/ui/modal';

interface CampaignImageEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentImageUrl?: string;
  campaignId: string;
  onImageUpdate: (newImageUrl: string) => void;
}

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const CampaignImageEditModal: React.FC<CampaignImageEditModalProps> = ({
  isOpen,
  onClose,
  currentImageUrl,
  campaignId,
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

  useEffect(() => {
    if (isOpen) {
      setImage(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setIsUploading(false);
      setIsRemoving(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [isOpen]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast({ title: 'File too large', description: 'Please select an image smaller than 10MB', variant: 'destructive' });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => setImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const createImage = (url: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', reject);
    img.src = url;
  });

  const getCroppedImg = async (imageSrc: string, pixelCrop: CropArea): Promise<Blob> => {
    const img = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2d context');
    canvas.width = 200; canvas.height = 200;
    const { x, y, width, height } = pixelCrop;
    ctx.drawImage(img, x, y, width, height, 0, 0, 200, 200);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob); else throw new Error('Failed to create blob');
      }, 'image/webp', 0.85);
    });
  };

  const compressImage = async (blob: Blob): Promise<Blob> => {
    if (blob.size <= 16 * 1024) return blob;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2d context');
    const img = await createImage(URL.createObjectURL(blob));
    canvas.width = 200; canvas.height = 200;
    for (const q of [0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1]) {
      ctx.clearRect(0, 0, 200, 200);
      ctx.drawImage(img, 0, 0, 200, 200);
      const compressed = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => { if (b) resolve(b); else throw new Error('Compression failed'); }, 'image/webp', q);
      });
      if (compressed.size <= 16 * 1024) return compressed;
    }
    ctx.clearRect(0, 0, 200, 200);
    ctx.drawImage(img, 0, 0, 200, 200);
    return new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => { if (b) resolve(b); else throw new Error('Final compression failed'); }, 'image/webp', 0.1);
    });
  };

  const handleSave = async (): Promise<boolean> => {
    if (!image || !croppedAreaPixels) {
      toast({ title: 'No image selected', description: 'Please select an image to crop', variant: 'destructive' });
      return false;
    }
    setIsRemoving(false);
    setIsUploading(true);
    try {
      const croppedBlob = await getCroppedImg(image, croppedAreaPixels);
      const compressedBlob = await compressImage(croppedBlob);
      const supabase = createClient();
      const ts = Date.now();
      const fileName = `${campaignId}_${ts}.webp`;
      const filePath = `campaigns/${campaignId}/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from('users-images')
        .upload(filePath, compressedBlob, { upsert: true, contentType: 'image/webp', cacheControl: 'no-cache' });
      if (uploadError) throw uploadError;

      // Cleanup old files in campaign root
      const { data: files } = await supabase.storage.from('users-images').list(`campaigns/${campaignId}/`);
      const toRemove: string[] = [];
      if (files) {
        files.forEach(f => {
          if ((f.name.startsWith(`${campaignId}_`) || f.name === `${campaignId}.webp`) && f.name !== fileName) {
            toRemove.push(`campaigns/${campaignId}/${f.name}`);
          }
        });
      }
      if (toRemove.length > 0) {
        await supabase.storage.from('users-images').remove(toRemove);
      }

      const { data: urlData } = supabase.storage.from('users-images').getPublicUrl(filePath);
      const updateResult = await updateCampaignImage(campaignId, urlData.publicUrl);
      if (!updateResult.success) throw new Error(updateResult.error || 'Failed to update campaign image');
      onImageUpdate(urlData.publicUrl);
      toast({ title: 'Success', description: 'Campaign image updated successfully' });
      return true;
    } catch (e) {
      console.error(e);
      toast({ title: 'Upload failed', description: 'Failed to upload image. Please try again.', variant: 'destructive' });
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
      const { data: files } = await supabase.storage.from('users-images').list(`campaigns/${campaignId}/`);
      const toRemove: string[] = [];
      if (files) {
        files.forEach(f => {
          if (f.name.startsWith(`${campaignId}_`) || f.name === `${campaignId}.webp`) {
            toRemove.push(`campaigns/${campaignId}/${f.name}`);
          }
        });
      }
      if (toRemove.length > 0) {
        await supabase.storage.from('users-images').remove(toRemove);
      }
      const updateResult = await updateCampaignImage(campaignId, null);
      if (!updateResult.success) throw new Error(updateResult.error || 'Failed to remove campaign image');
      onImageUpdate('');
      toast({ title: 'Success', description: 'Campaign image removed successfully' });
      return true;
    } catch (e) {
      console.error(e);
      toast({ title: 'Remove failed', description: 'Failed to remove image. Please try again.', variant: 'destructive' });
      return false;
    } finally {
      setIsRemoving(false);
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      title="Edit Campaign Image"
      onClose={onClose}
      onConfirm={isRemoving ? handleRemoveImage : handleSave}
      confirmText={isRemoving ? 'Removing image...' : (isUploading ? 'Uploading...' : 'Upload Image')}
      confirmDisabled={isUploading || isRemoving || (!image && !currentImageUrl)}
      width="2xl"
    >
      <div className="space-y-4">
        {currentImageUrl && (
          <div className="mb-4">
            <div className="flex items-center justify-center space-x-4">
              <img src={currentImageUrl} alt="Current" className="bg-black rounded-full shadow-md border-4 border-black size-[85px] rounded-full object-cover overflow-hidden" />
              <Button variant="destructive" onClick={handleRemoveImage} disabled={isUploading}>Remove Image</Button>
            </div>
          </div>
        )}
        <div className="mb-4">
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="w-full">Replace with New Image</Button>
        </div>
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
                style={{ containerStyle: { width: '100%', height: '100%', backgroundColor: '#f3f4f6' } }}
              />
            </div>
            <div className="flex items-center mt-2">
              <label className="text-sm font-medium text-gray-700">Zoom:</label>
              <input type="range" min={1} max={3} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full ml-2 mt-1" />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};


