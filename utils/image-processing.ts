/**
 * Image processing utilities for cropping, compression, and format conversion
 */

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Creates an HTMLImageElement from a URL
 */
export const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.src = url;
  });

/**
 * Resizes an image to specified width and height WebP blob (maintains aspect ratio, fits within dimensions)
 */
export const getResizedImg = async (
  imageSrc: string,
  width: number = 200,
  height: number = 200
): Promise<Blob> => {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('No 2d context');
  }

  // Calculate dimensions maintaining aspect ratio
  const imageAspectRatio = image.width / image.height;
  const targetAspectRatio = width / height;
  
  let drawWidth = width;
  let drawHeight = height;
  let offsetX = 0;
  let offsetY = 0;

  if (imageAspectRatio > targetAspectRatio) {
    // Image is wider: fit to width
    drawHeight = width / imageAspectRatio;
    offsetY = (height - drawHeight) / 2;
  } else {
    // Image is taller: fit to height
    drawWidth = height * imageAspectRatio;
    offsetX = (width - drawWidth) / 2;
  }

  // Set canvas size
  canvas.width = width;
  canvas.height = height;

  // Draw the resized image (centered)
  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

  // Convert to WebP format with quality settings
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob'));
        }
      },
      'image/webp',
      0.85 // 85% quality
    );
  });
};

/**
 * Resizes an image so that neither dimension exceeds maxWidth / maxHeight,
 * preserving aspect ratio and WITHOUT padding. Canvas size matches the
 * scaled image dimensions.
 */
export const getResizedImgMax = async (
  imageSrc: string,
  maxWidth: number,
  maxHeight: number
): Promise<Blob> => {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('No 2d context');
  }

  let { width, height } = image;

  // Only downscale if necessary
  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width = Math.floor(width * ratio);
    height = Math.floor(height * ratio);
  }

  canvas.width = width;
  canvas.height = height;

  ctx.drawImage(image, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob'));
        }
      },
      'image/webp',
      0.8 // 80% quality
    );
  });
};

/**
 * Crops an image to specified width and height WebP blob
 */
export const getCroppedImg = async (
  imageSrc: string,
  pixelCrop: CropArea,
  width: number = 200,
  height: number = 200
): Promise<Blob> => {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('No 2d context');
  }

  // Set canvas size to specified dimensions
  canvas.width = width;
  canvas.height = height;

  // Calculate the crop dimensions
  const { x, y, width: cropWidth, height: cropHeight } = pixelCrop;

  // Draw the cropped image
  ctx.drawImage(image, x, y, cropWidth, cropHeight, 0, 0, width, height);

  // Convert to WebP format with quality settings
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob'));
        }
      },
      'image/webp',
      0.85 // 85% quality
    );
  });
};

/**
 * Compresses a blob to under a target size (in bytes) by trying different quality levels
 */
export const compressImage = async (
  blob: Blob,
  targetSizeBytes: number = 16 * 1024,
  width: number = 200,
  height: number = 200
): Promise<Blob> => {
  // If blob is already under target size, return it
  if (blob.size <= targetSizeBytes) {
    return blob;
  }

  // Create a new canvas to compress
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2d context');

  const image = await createImage(URL.createObjectURL(blob));
  canvas.width = width;
  canvas.height = height;

  // Try different quality levels
  const qualities = [0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];

  for (const quality of qualities) {
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    const compressedBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create compressed blob'));
        },
        'image/webp',
        quality
      );
    });

    if (compressedBlob.size <= targetSizeBytes) {
      return compressedBlob;
    }
  }

  // If still too large, return the smallest one
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create final compressed blob'));
      },
      'image/webp',
      0.1
    );
  });
};

/**
 * Supported MIME types for image uploads
 */
export const SUPPORTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/avif',
  'image/svg+xml',
]);

/**
 * Supported file extensions for image uploads
 */
export const SUPPORTED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.heic',
  '.heif',
  '.avif',
  '.svg',
]);

/**
 * Validates if a file is a supported image type
 */
export const validateImageFile = (file: File): { valid: boolean; error?: string } => {
  const lowerName = file.name.toLowerCase();
  const hasSupportedExt = Array.from(SUPPORTED_EXTENSIONS).some((ext) =>
    lowerName.endsWith(ext)
  );
  const hasSupportedMime = SUPPORTED_MIME_TYPES.has(file.type);

  if (!hasSupportedExt && !hasSupportedMime) {
    return {
      valid: false,
      error: 'Please select a JPG, PNG, WEBP, GIF, AVIF, SVG, or HEIC image.',
    };
  }

  if (file.size > 10 * 1024 * 1024) {
    return {
      valid: false,
      error: 'Please select an image smaller than 10MB',
    };
  }

  return { valid: true };
};

/**
 * Processes a file, converting HEIC/HEIF to PNG if needed
 */
export const processImageFile = async (file: File): Promise<File> => {
  const lowerName = file.name.toLowerCase();
  const isHeic =
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    lowerName.endsWith('.heic') ||
    lowerName.endsWith('.heif');

  if (isHeic) {
    const heic2any = (await import('heic2any')).default;
    const convertedBlob = await heic2any({
      blob: file,
      toType: 'image/png',
      quality: 1,
    });

    // Create a new file object with the converted blob
    return new File(
      [convertedBlob],
      lowerName.replace(/\.(heic|heif)$/i, '.png'),
      {
        type: 'image/png',
        lastModified: file.lastModified,
      }
    );
  }

  return file;
};

