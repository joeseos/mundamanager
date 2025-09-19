import { TbDiamondFilled } from "react-icons/tb";
import { getPatreonTierColor } from "@/utils/patreon";
import { Badge } from "@/components/ui/badge";

interface PatreonSupporterBadgeProps {
  username: string;
  patreonTierId: string;
  patreonTierTitle?: string;
  size?: number;
}

export function PatreonSupporterBadge({ 
  username, 
  patreonTierId, 
  patreonTierTitle, 
  size = 14 
}: PatreonSupporterBadgeProps) {
  return (
    <Badge variant="outline" className="flex items-center gap-1">
      <TbDiamondFilled 
        size={size} 
        color={getPatreonTierColor(patreonTierId)}
        title={patreonTierTitle || `Patreon Tier ${patreonTierId}`}
      />
      {username}
    </Badge>
  );
}
