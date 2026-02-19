'use client';

import React, { useState, useEffect } from 'react';
import Cropper from 'react-easy-crop';
import { Button } from '@/components/ui/button';
import Modal from '@/components/ui/modal';
import { UseImageEditorOptions } from '@/hooks/use-image-editor';
import { useImageEditor } from '@/hooks/use-image-editor';
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu';
import { DefaultImageEntry, DefaultImageCredit } from '@/types/gang';

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
  defaultImageUrls?: DefaultImageEntry[];
  currentDefaultImageIndex?: number | null;
  onDefaultImageIndexChange?: (index: number) => Promise<{ success: boolean; error?: string }>;
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
  defaultImageUrls,
  currentDefaultImageIndex,
  onDefaultImageIndexChange,
}) => {
  const [selectedDefaultImageIndex, setSelectedDefaultImageIndex] = useState<number | null>(
    currentDefaultImageIndex ?? null
  );
  const [isSavingDefaultImage, setIsSavingDefaultImage] = useState(false);

  // Reset selected index when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedDefaultImageIndex(currentDefaultImageIndex ?? null);
      setIsSavingDefaultImage(false);
    }
  }, [isOpen, currentDefaultImageIndex]);

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

  // Check if default image index has changed
  const defaultImageIndexChanged = 
    defaultImageUrls && 
    selectedDefaultImageIndex !== null &&
    selectedDefaultImageIndex !== currentDefaultImageIndex;

  // Determine if confirm button should be enabled
  const hasImageToSave = image && ((enableCrop && croppedAreaPixels) || !enableCrop);
  const confirmDisabled =
    isUploading ||
    isRemoving ||
    isProcessing ||
    isSavingDefaultImage ||
    (!hasImageToSave && !defaultImageIndexChanged);

  const defaultConfirmText = isRemoving
    ? 'Removing image...'
    : isUploading
      ? 'Uploading...'
      : isSavingDefaultImage
        ? 'Saving...'
        : defaultImageIndexChanged
          ? 'Set Image'
          : confirmDisabled || (!currentImageUrl && !image)
            ? 'Set Image'
            : 'Upload Image';

  const handleConfirm = async () => {
    if (isRemoving) {
      await handleRemoveImage();
    } else if (hasImageToSave) {
      await handleSave();
    } else if (defaultImageIndexChanged && onDefaultImageIndexChange && selectedDefaultImageIndex !== null) {
      setIsSavingDefaultImage(true);
      try {
        const result = await onDefaultImageIndexChange(selectedDefaultImageIndex);
        if (result.success) {
          onClose();
        }
      } catch (error) {
        console.error('Error saving default image index:', error);
      } finally {
        setIsSavingDefaultImage(false);
      }
    }
  };

  const handlePreviousImage = () => {
    if (defaultImageUrls && defaultImageUrls.length > 0) {
      setSelectedDefaultImageIndex((prev) => 
        prev === null || prev === 0 ? defaultImageUrls.length - 1 : prev - 1
      );
    }
  };

  const handleNextImage = () => {
    if (defaultImageUrls && defaultImageUrls.length > 0) {
      setSelectedDefaultImageIndex((prev) => 
        prev === null || prev === defaultImageUrls.length - 1 ? 0 : (prev ?? 0) + 1
      );
    }
  };

  // Get the display image entry for default images
  const getDisplayDefaultImageEntry = (): DefaultImageEntry | undefined => {
    if (defaultImageUrls && selectedDefaultImageIndex !== null && 
        selectedDefaultImageIndex >= 0 && selectedDefaultImageIndex < defaultImageUrls.length) {
      return defaultImageUrls[selectedDefaultImageIndex];
    }
    return defaultImageUrl ? { url: defaultImageUrl } : undefined;
  };

  const displayDefaultImageEntry = getDisplayDefaultImageEntry();
  const displayDefaultImageUrl = displayDefaultImageEntry?.url;
  const displayDefaultImageCredit: DefaultImageCredit | undefined = displayDefaultImageEntry?.credit;
  const hasMultipleDefaultImages = defaultImageUrls && defaultImageUrls.length > 1;

  return (
    <Modal
      title={title}
      onClose={onClose}
      onConfirm={handleConfirm}
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
        {!currentImageUrl && !image && displayDefaultImageUrl && (
          <div className="mb-4">
            <div className="flex items-center justify-center relative">
              <div className="relative flex items-center justify-center">
                {/* Left Arrow */}
                {hasMultipleDefaultImages && (
                  <button
                    onClick={handlePreviousImage}
                    className="absolute -left-12 z-30 p-2 rounded-full bg-card/80 hover:bg-card border border-border shadow-md transition-colors"
                    aria-label="Previous default image"
                    disabled={isSavingDefaultImage}
                  >
                    <LuChevronLeft className="w-5 h-5" />
                  </button>
                )}
                
                <img
                  src={displayDefaultImageUrl}
                  alt="Default"
                  className="bg-secondary rounded-full shadow-md border-4 border-black size-[85px] rounded-full object-cover overflow-hidden"
                />
                
                {/* Right Arrow */}
                {hasMultipleDefaultImages && (
                  <button
                    onClick={handleNextImage}
                    className="absolute -right-12 z-30 p-2 rounded-full bg-card/80 hover:bg-card border border-border shadow-md transition-colors"
                    aria-label="Next default image"
                    disabled={isSavingDefaultImage}
                  >
                    <LuChevronRight className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
            {displayDefaultImageCredit ? (
              <p className="text-xs italic text-center text-muted-foreground mt-1">
                Illustration by{' '}
                <a href={displayDefaultImageCredit.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                  {displayDefaultImageCredit.name}
                </a>
                {displayDefaultImageCredit.suffix && ` ${displayDefaultImageCredit.suffix}`}
              </p>
            ) : (
              <p className="text-xs mt-1">&nbsp;</p>
            )}
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

