'use client';

import Image from 'next/image';
import { useState } from 'react';

export default function BackgroundImage() {
  const [imageError, setImageError] = useState(false);

  if (imageError) {
    return (
      <div className="fixed inset-0 z-[-1] bg-gray-900">
        {/* Fallback dark background */}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[-1] print:hidden">
      <Image
        src="https://res.cloudinary.com/dle0tkpbl/image/upload/v1736057860/background_numv5r.avif"
        alt="Background"
        fill
        priority
        style={{ objectFit: 'cover' }}
        quality={100}
        onError={() => setImageError(true)}
      />
    </div>
  );
}