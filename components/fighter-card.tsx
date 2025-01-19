import React, { useEffect, useRef, useState, memo } from 'react';
import { StatsTable } from './ui/table';
import WeaponTable from './weapon-table';
import Link from 'next/link';
import { Equipment } from '@/types/equipment';
import { calculateAdjustedStats } from '@/utils/stats';
import { FighterProps, Injury } from '@/types/fighter';
import { Skull, Armchair, Key, Utensils } from "lucide-react";

interface FighterCardProps extends Omit<FighterProps, 'fighter_name' | 'fighter_type'> {
  name: string;  // maps to fighter_name
  type: string;  // maps to fighter_type
  label?: string;
  fighter_class?: string;
  killed?: boolean;
  retired?: boolean;
  enslaved?: boolean;
  starved?: boolean;
  free_skill?: boolean;
  kills: number;  // Required property
  injuries: Injury[];
}

type FighterCardData = FighterProps & {
  label?: string;
};

const FighterCard = memo(function FighterCard({
  id,
  name,
  type,
  label,
  fighter_class,
  credits,
  movement,
  weapon_skill,
  ballistic_skill,
  strength,
  toughness,
  wounds,
  initiative,
  attacks,
  leadership,
  cool,
  willpower,
  intelligence,
  xp,
  advancements,
  weapons,
  wargear,
  special_rules,
  killed,
  retired,
  enslaved,
  starved,
  free_skill,
  kills = 0,  // Default value
  injuries = [],
}: FighterCardProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isMultiline, setIsMultiline] = useState(false);

  const isInactive = killed || retired || enslaved || starved;

  const fighterData: FighterCardData = {
    id,
    fighter_name: name,
    fighter_type: type,
    fighter_class,
    label,
    credits,
    movement,
    weapon_skill,
    ballistic_skill,
    strength,
    toughness,
    wounds,
    initiative,
    attacks,
    leadership,
    cool,
    willpower,
    intelligence,
    xp,
    kills,
    advancements: {
      characteristics: advancements?.characteristics || {},
      skills: advancements?.skills || {}
    },
    weapons,
    wargear,
    special_rules,
    injuries: injuries || [],
  };

  const adjustedStats = calculateAdjustedStats(fighterData);

  const isCrew = fighter_class === 'Crew';

  const stats: Record<string, string | number> = isCrew ? {
    'M': '*',
    'Front': '*',
    'Side': '*', 
    'Rear': '*',
    'HP': '*',
    'Hnd': '*',
    'Sv': '*',
    'BS': adjustedStats.ballistic_skill === 0 ? '-' : `${adjustedStats.ballistic_skill}+`,
    'Ld': `${adjustedStats.leadership}+`,
    'Cl': `${adjustedStats.cool}+`,
    'Wil': `${adjustedStats.willpower}+`,
    'Int': `${adjustedStats.intelligence}+`,
    'XP': xp
  } : {
    'M': `${adjustedStats.movement}"`,
    'WS': `${adjustedStats.weapon_skill}+`,
    'BS': adjustedStats.ballistic_skill === 0 ? '-' : `${adjustedStats.ballistic_skill}+`,
    'S': adjustedStats.strength,
    'T': adjustedStats.toughness,
    'W': adjustedStats.wounds,
    'I': `${adjustedStats.initiative}+`,
    'A': adjustedStats.attacks,
    'Ld': `${adjustedStats.leadership}+`,
    'Cl': `${adjustedStats.cool}+`,
    'Wil': `${adjustedStats.willpower}+`,
    'Int': `${adjustedStats.intelligence}+`,
    'XP': xp
  };

  useEffect(() => {
    const checkHeight = () => {
      if (contentRef.current) {
        setTimeout(() => {
          const contentHeight = contentRef.current?.clientHeight || 0;
          const contentWidth = contentRef.current?.clientWidth || 0;
          const text = contentRef.current?.textContent || '';
          const shouldBeMultiline = contentHeight > 24 && text.length > (contentWidth / 8);
          setIsMultiline(shouldBeMultiline);
        }, 0);
      }
    };

    const observer = new MutationObserver(checkHeight);
    
    if (contentRef.current) {
      observer.observe(contentRef.current, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true
      });
    }

    checkHeight();
    window.addEventListener('resize', checkHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', checkHeight);
    };
  }, [special_rules]);

  return (
    <Link href={`/fighter/${id}`}>
      <div 
        className="relative rounded-lg overflow-hidden shadow-md hover:shadow-lg hover:scale-[1.02] transition-all duration-200 border-4 border-black p-4"
        style={{
          backgroundImage: "url('https://res.cloudinary.com/dle0tkpbl/image/upload/v1736145100/fighter-card-background-v3-lighter_bmefnl.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          fontSize: 'calc(10px + 0.2vmin)'
        }}
      >
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-start gap-3 flex-grow">
            <div className="name-banner-container relative w-full">
              <div 
                className="absolute inset-0 bg-no-repeat bg-cover"
                style={{
                  backgroundImage: "url('https://res.cloudinary.com/dle0tkpbl/image/upload/v1735986017/top-bar-stroke-v3_s97f2k.png')",
                  width: 'calc(100% + 100px)',
                  height: '65px',
                  marginLeft: '-12px',
                  marginTop: '0px',
                  zIndex: 0,
                  backgroundPosition: 'center',
                  backgroundSize: '100% 100%',
                  right: '-24px'
                }}
              />
              <div 
                className="relative z-10 pl-4 flex items-center gap-2" 
                style={{ 
                  height: '65px', 
                  marginTop: '0px'
                }}
              >
                {label && (
                  <span className="inline-flex items-center rounded-sm bg-white px-1.5 py-0.5 text-xs font-bold text-black uppercase">
                    {label}
                  </span>
                )}
                <div className="flex flex-wrap items-baseline">
                  <span className="text-lg sm:text-xl font-semibold text-white leading-tight mr-2">{name}</span>
                  <div className="text-gray-300 text-[0.65rem] sm:text-sm leading-tight">
                    {type}
                    {fighter_class && ` (${fighter_class})`}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 z-10" style={{ marginTop: '16px' }}>
              {killed && <Skull className="h-7 w-7 text-red-600" />}
              {retired && <Armchair className="h-7 w-7 text-amber-900" />}
              {enslaved && <Key className="h-7 w-7 text-gray-600" />}
              {starved && <Utensils className="h-7 w-7 text-orange-600" />}
            </div>
          </div>
          {!isInactive && (
            <div className="bg-[#F0F0F0] rounded-full p-2 shadow-md border-4 border-black flex flex-col items-center justify-center w-16 h-16 flex-shrink-0 relative z-10">
              <span className="font-bold text-lg">{credits}</span>
              <span className="text-xs">Credits</span>
            </div>
          )}
        </div>
        
        {!isInactive && (
          <>
            <StatsTable data={stats} isCrew={isCrew} />
            {weapons && weapons.length > 0 && (
              <div className="mt-4">
                <WeaponTable weapons={weapons} />
              </div>
            )}
            <div className={`grid gap-y-3 mt-4 ${isMultiline ? 'grid-cols-[4.5rem,1fr]' : 'grid-cols-[6rem,1fr]'}`}>
              {wargear && wargear.length > 0 && (
                <>
                  <div className="font-bold text-sm pr-4 whitespace-nowrap">Wargear</div>
                  <div className="text-sm break-words">
                    {wargear
                      .sort((a, b) => a.wargear_name.localeCompare(b.wargear_name))
                      .map(item => item.wargear_name)
                      .join(', ')}
                  </div>
                </>
              )}
              {((advancements?.skills && Object.keys(advancements.skills).length > 0) || free_skill) && (
                <>
                  <div className="font-bold text-sm pr-4 whitespace-nowrap">Skills</div>
                  <div className="text-sm break-words">
                    {(advancements?.skills && Object.keys(advancements.skills).length > 0) ? (
                      Object.keys(advancements.skills)
                        .sort((a, b) => a.localeCompare(b))
                        .join(', ')
                    ) : free_skill ? (
                      <div className="flex items-center gap-2 text-amber-700">
                        <svg 
                          xmlns="http://www.w3.org/2000/svg" 
                          viewBox="0 0 24 24" 
                          fill="currentColor" 
                          className="w-4 h-4"
                        >
                          <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                        </svg>
                        Starting skill missing.
                      </div>
                    ) : null}
                  </div>
                </>
              )}
              {special_rules && special_rules.length > 0 && (
                <>
                  <div className="font-bold text-sm pr-4">
                    {isMultiline ? (
                      <>
                        Special<br />Rules
                      </>
                    ) : (
                      <span className="whitespace-nowrap">Special Rules</span>
                    )}
                  </div>
                  <div 
                    ref={contentRef}
                    className="text-sm break-words"
                  >
                    {special_rules.join(', ')}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </Link>
  );
});

export default FighterCard;
