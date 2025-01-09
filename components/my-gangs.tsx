"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from "@/utils/supabase/client";
import { useGangs } from '@/contexts/GangsContext'

interface Gang {
  id: string;
  name: string;
  gang_type: string;
  gang_type_id: string;
  image_url: string;
  credits: number;
  reputation: number;
  meat: number | null;
  exploration_points: number | null;
  rating: number | null;
  created_at: string;
  last_updated: string;
}

export default function MyGangs() {
  const { gangs, isLoading, error } = useGangs();

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    console.error('Failed to load image:', e.currentTarget.src);
    e.currentTarget.src = "https://res.cloudinary.com/dle0tkpbl/image/upload/v1732965431/default-gang_image.jpg";
  };

  if (isLoading) return <div className="text-center text-white">Loading gangs...</div>
  if (error) return <div className="text-center text-red-500">{error}</div>

  return (
    <div className="bg-white shadow-md rounded-lg p-3 md:p-6">
      <h2 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">Your Gangs</h2>
      {gangs.length === 0 ? (
        <p className="text-center text-gray-500">No gangs created yet.</p>
      ) : (
        <ul className="space-y-3">
          {gangs.map((gang) => (
            <li key={gang.id}>
              <Link href={`/gang/${gang.id}`} className="flex items-center p-3 md:p-4 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors duration-200">
                <div className="relative w-[72px] md:w-20 h-[72px] md:h-20 mr-3 md:mr-4 flex-shrink-0 flex items-center justify-center">
                  {gang.image_url ? (
                    <Image
                      src={gang.image_url}
                      alt={gang.name}
                      width={60}
                      height={60}
                      className="absolute rounded-full object-cover z-10 w-auto h-auto left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 scale-90 md:scale-100"
                      priority={false}
                      onError={handleImageError}
                    />
                  ) : (
                    <div className="absolute w-[60px] h-[60px] rounded-full bg-gray-200 z-10 flex items-center justify-center left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 scale-90 md:scale-100">
                      {gang.name.charAt(0)}
                    </div>
                  )}
                  <Image
                    src="https://res.cloudinary.com/dle0tkpbl/image/upload/v1732967039/cog-border_ffitze.png"
                    alt=""
                    width={72}
                    height={72}
                    className="absolute z-20 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 scale-90 md:scale-100"
                    priority
                    sizes="(max-width: 768px) 72px, 80px"
                    style={{ width: '72px', height: '72px' }}
                  />
                </div>
                <div className="flex-grow min-w-0">
                  <h3 className="text-lg md:text-xl font-medium text-black truncate">{gang.name}</h3>
                  <div className="text-sm md:text-base text-gray-600">
                    <span className="truncate block">{gang.gang_type}</span>
                    <span>Rating: {gang.rating ?? 0}</span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
