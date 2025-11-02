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
        src="https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/background_numv5r.avif"
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