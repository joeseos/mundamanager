import { useSortable } from '@dnd-kit/react/sortable';
import { directionBiased } from '@dnd-kit/collision';
import FighterCard from './fighter-card';
import { FighterProps } from '@/types/fighter';
import { GangPageViewMode } from './ViewModeDropdown';
import { UserPermissions } from '@/types/user-permissions';

interface SortableFighterProps {
  fighter: FighterProps;
  index: number;
  viewMode?: GangPageViewMode;
  userPermissions?: UserPermissions;
}

export function SortableFighter({ fighter, index, viewMode = 'normal', userPermissions }: SortableFighterProps) {
  // Check if user can edit to determine if drag should be enabled
  const canEdit = userPermissions?.canEdit ?? false;

  const { ref, handleRef, isDragging } = useSortable({
    id: fighter.id,
    index,
    disabled: !canEdit, // Disable drag when user can't edit
    // Stable with cards of very different heights when paired with the custom sorting in
    // DraggableFighters (dnd-kit#1950).
    collisionDetector: directionBiased,
  });

  // Extract the first vehicle from the vehicles array for the FighterCard
  const vehicle = fighter.vehicles && fighter.vehicles.length > 0 ? fighter.vehicles[0] : undefined;

  return (
    <div
      ref={ref}
      style={{ position: 'relative', zIndex: isDragging ? 50 : undefined }}
      className={viewMode !== 'normal' ? 'min-w-0 w-full flex flex-col' : undefined}
    >
      <FighterCard
        {...fighter}
        name={fighter.fighter_name}
        type={fighter.fighter_type}
        skills={fighter.skills}
        vehicle={vehicle}
        disableLink={isDragging}
        viewMode={viewMode}
        isDragging={isDragging}
        dragHandle={canEdit ? handleRef : undefined}
      />
    </div>
  );
}
