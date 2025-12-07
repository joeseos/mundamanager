'use client';

import { TbDiamondFilled } from "react-icons/tb";
import { getPatreonTierColor } from "@/utils/patreon";

interface PatreonSupporterIconProps {
  patreonTierId: string;
  patreonTierTitle?: string;
  size?: number;
}

export function PatreonSupporterIcon({ 
  patreonTierId, 
  patreonTierTitle, 
  size = 14 
}: PatreonSupporterIconProps) {
  return (
    <TbDiamondFilled 
      size={size} 
      color={getPatreonTierColor(patreonTierId)}
      title={patreonTierTitle || `Patreon Tier ${patreonTierId}`}
    />
  );
}
