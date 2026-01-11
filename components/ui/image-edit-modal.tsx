'use client';

import React from 'react';
import Cropper from 'react-easy-crop';
import { Button } from '@/components/ui/button';
import Modal from '@/components/ui/modal';
import { UseImageEditorOptions } from '@/hooks/use-image-editor';
import { useImageEditor } from '@/hooks/use-image-editor';

interface ImageEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentImageUrl?: string;
  title: string;
  uploadConfig: UseImageEditorOptions['uploadConfig'];
  imageConfig?: UseImageEditorOptions['imageConfig'];
  onImageUpdate: (newImageUrl: string) => void;
  confirmButtonText?: string;
  showRemoveButton?: boolean;
  defaultImageUrl?: string;
}

export const ImageEditModal: React.FC<ImageEditModalProps> = ({
  isOpen,
  onClose,
  currentImageUrl,
  title,
  uploadConfig,
  imageConfig,
  onImageUpdate,
  confirmButtonText,
  showRemoveButton = true,
  defaultImageUrl,
}) => {
  const {
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
    cropAspect,
    enableCrop,
  } = useImageEditor({
    isOpen,
    onImageUpdate,
    uploadConfig,
    imageConfig,
  });

  if (!isOpen) return null;

  const defaultConfirmText = isRemoving
    ? 'Removing image...'
    : isUploading
      ? 'Uploading...'
      : 'Upload Image';

  const confirmDisabled =
    isUploading ||
    isRemoving ||
    isProcessing ||
    (enableCrop && (!image || !croppedAreaPixels)) ||
    (!enableCrop && !image);

  return (
    <Modal
      title={title}
      onClose={onClose}
      onConfirm={isRemoving ? handleRemoveImage : handleSave}
      confirmText={confirmButtonText || defaultConfirmText}
      confirmDisabled={confirmDisabled}
      width="2xl"
    >
      <div className="space-y-4">
        {currentImageUrl && showRemoveButton && (
          <div className="mb-4">
            <div className="flex items-center justify-center space-x-4">
              <img
                src={currentImageUrl}
                alt="Current"
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
        {!currentImageUrl && !image && defaultImageUrl && (
          <div className="mb-4">
            <div className="flex items-center justify-center">
              <img
                src={defaultImageUrl}
                alt="Default"
                className="bg-black rounded-full shadow-md border-4 border-black size-[85px] rounded-full object-cover overflow-hidden"
              />
            </div>
          </div>
        )}
        <div className="mb-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/svg+xml,.heic,.heif,.avif,.svg"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || isProcessing}
            className="w-full"
          >
            {isProcessing ? 'Processing image...' : 'Replace with New Image'}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground text-center">
            Supported: JPG, PNG, WEBP, GIF, AVIF, SVG, HEIC • Max 10MB
          </p>
        </div>
        {image && enableCrop && cropAspect !== undefined && (
          <div className="mb-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Crop Image:</h3>
            <div
              className="relative w-full h-64 bg-muted rounded-lg overflow-hidden"
              style={{ position: 'relative' }}
            >
              <Cropper
                image={image}
                crop={crop}
                zoom={zoom}
                aspect={cropAspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                showGrid={true}
                objectFit="contain"
                style={{
                  containerStyle: {
                    width: '100%',
                    height: '100%',
                    backgroundColor: '#f3f4f6',
                  },
                }}
              />
            </div>
            <div className="flex items-center mt-2">
              <label className="text-sm font-medium text-muted-foreground">Zoom:</label>
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

