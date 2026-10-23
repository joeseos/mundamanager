'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { LuPencil } from 'react-icons/lu';
import { UserAvatar } from '@/components/ui/user-avatar';
import { updateAvatarAction } from '@/app/actions/user';

const ImageEditModal = dynamic(
  () => import('@/components/ui/image-edit-modal').then((mod) => mod.ImageEditModal),
  { ssr: false }
);

interface AvatarChangeProps {
  userId: string;
  username: string;
  currentAvatarUrl: string | null;
}

/** The account page avatar: opens the same crop and upload modal as fighter portraits. */
export default function AvatarChange({ userId, username, currentAvatarUrl }: AvatarChangeProps) {
  const [avatarUrl, setAvatarUrl] = useState(currentAvatarUrl);
  const [isEditing, setIsEditing] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="relative shrink-0 rounded-full"
        aria-label="Change avatar"
        title="Change avatar"
      >
        <UserAvatar username={username} avatarUrl={avatarUrl} className="size-16 text-2xl" />
        <span className="absolute bottom-0 right-0 rounded-full bg-neutral-900 text-white p-1 shadow">
          <LuPencil className="h-3 w-3" />
        </span>
      </button>

      {isEditing && (
        <ImageEditModal
          onClose={() => setIsEditing(false)}
          currentImageUrl={avatarUrl ?? undefined}
          title="Edit Avatar"
          onImageUpdate={(newImageUrl) => setAvatarUrl(newImageUrl || null)}
          uploadConfig={{
            entityId: userId,
            storagePath: `avatars/${userId}`,
            fileNamePattern: (id: string, timestamp: number) => `${id}_${timestamp}.webp`,
            listPath: `avatars/${userId}/`,
            updateAction: updateAvatarAction,
            successMessage: 'Avatar updated successfully',
            removeSuccessMessage: 'Avatar removed successfully',
          }}
          imageConfig={{
            crop: true,
            width: 200,
            height: 200,
            targetSizeBytes: 16 * 1024,
          }}
        />
      )}
    </>
  );
}
