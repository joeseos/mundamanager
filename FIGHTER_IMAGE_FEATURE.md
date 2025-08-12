# Fighter Image Editing Feature

## Overview

This feature allows users to upload, crop, and manage profile images for their fighters. The images are automatically optimized and stored in Supabase Storage.

## Features

- **Click to Edit**: Click on any fighter's profile picture to open the image editing modal
- **Image Upload**: Upload images up to 10MB in size
- **Crop & Resize**: Use the interactive cropper to select the perfect 1:1 crop area
- **Automatic Optimization**: Images are automatically converted to WebP format and compressed to ≤16KB
- **Storage Management**: Images are stored in Supabase Storage with organized folder structure
- **Remove Images**: Option to remove existing fighter images

## Technical Implementation

### Storage Structure
```
users-images/
├── gangs/
│   └── {gang_id}/
│       └── fighters/
│           └── {fighter_id}_{timestamp}.webp
```

### Cache-Busting Strategy
- **Unique Filenames**: Each upload creates a new file with timestamp (`{fighterId}_{timestamp}.webp`)
- **Automatic Cleanup**: Old files are automatically removed when new images are uploaded
- **No Browser Cache Issues**: Unique filenames prevent browser caching conflicts

### Image Processing
1. **Upload**: User selects an image file
2. **Crop**: Interactive cropping with 1:1 aspect ratio lock
3. **Resize**: Automatically resized to 200x200 pixels
4. **Compress**: Converted to WebP format with quality optimization
5. **Size Limit**: Compressed to ≤16KB for optimal performance
6. **Storage**: Uploaded to Supabase Storage in organized folder structure
7. **Database**: URL saved to `fighters.image_url` field via server action
8. **Cache**: Automatic cache invalidation via server action for fighter and gang data

### Server Actions
- **`updateFighterImage`**: Handles database updates and cache invalidation
  - Updates `fighters.image_url` field
  - Invalidates `BASE_FIGHTER_BASIC` cache
  - Invalidates `COMPOSITE_GANG_FIGHTERS_LIST` cache
- **`deleteGang`**: Handles gang deletion with storage cleanup
  - Deletes gang from database
  - Removes all fighter images for the gang
  - Invalidates user cache

### Automatic Cleanup
- **Fighter Deletion**: When a fighter is deleted, their images are automatically removed from storage
- **Gang Deletion**: When a gang is deleted, all fighter images for that gang are automatically removed from storage
- **Image Updates**: When uploading a new image, old images are automatically cleaned up
- **Manual Removal**: Users can manually remove images via the image edit modal

### Database Schema
The `fighters` table includes an `image_url` column that stores the public URL to the fighter's image.

### Security
- Storage bucket is public for viewing but requires authentication for uploads
- RLS policies ensure users can only upload to their own gang folders
- File size and type restrictions are enforced

## Usage

1. Navigate to a fighter's details page
2. Click on the fighter's profile picture (if you have edit permissions)
3. In the modal:
   - View current image (if any)
   - Click "Select New Image" to upload a new image
   - Use the cropper to adjust the crop area
   - Use the zoom slider to fine-tune the view
   - Click "Save Image" to apply changes
   - Click "Remove Image" to delete the current image

## Dependencies

- `react-easy-crop`: For the interactive cropping interface
- `canvas.toBlob()`: For image processing and format conversion
- Supabase Storage: For image storage and serving

## Storage Setup

The `users-images` storage bucket is already configured in Supabase with the following policies:

- **Public read access**: Anyone can view images
- **Authenticated upload access**: Only authenticated users can upload images

The bucket structure follows:
```
users-images/
├── gangs/
│   └── {gang_id}/
│       └── fighters/
│           └── {fighter_id}_{timestamp}.webp
```

## Database Requirements

The `fighters` table should include an `image_url` column (TEXT) to store the public URL to the fighter's image. If this column doesn't exist, you'll need to add it:

```sql
ALTER TABLE fighters ADD COLUMN image_url TEXT;
```

## Configuration

The Next.js configuration has been updated to allow images from the Supabase storage domain:

```javascript
remotePatterns: [
  {
    protocol: 'https',
    hostname: 'iojoritxhpijprgkjfre.supabase.co',
    pathname: '/storage/v1/object/public/**',
  },
]
```
