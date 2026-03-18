"use client"

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Gang } from '@/app/lib/get-user-gangs'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { toggleFavourite } from '@/app/actions/toggle-favourite'
import { reorderFavourites } from '@/app/actions/reorder-favourites'
import { toast } from 'sonner'
import { useDndSensorsConfig } from '@/components/home/use-dnd-sensors'
import { GangCardContent, SortableGangCard } from '@/components/home/gang-card'

interface GangsTabProps {
  gangs: Gang[];
}

export function GangsTab({ gangs }: GangsTabProps) {
  const [localGangs, setLocalGangs] = useState<Gang[]>(gangs);
  const [isMounted, setIsMounted] = useState(false);
  const sensors = useDndSensorsConfig();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    setLocalGangs(gangs);
  }, [gangs]);

  const favouriteGangs = useMemo(
    () => [...localGangs]
      .filter(g => g.is_favourite)
      .sort((a, b) => (a.favourite_order ?? 0) - (b.favourite_order ?? 0)),
    [localGangs]
  );

  const nonFavouriteGangs = useMemo(
    () => [...localGangs]
      .filter(g => !g.is_favourite)
      .sort((a, b) => {
        const dateA = new Date(b.last_updated || b.created_at).getTime();
        const dateB = new Date(a.last_updated || a.created_at).getTime();
        return dateA - dateB;
      }),
    [localGangs]
  );

  const handleToggleFavourite = useCallback(async (gangId: string, isFavourite: boolean) => {
    const previousGangs = localGangs;

    setLocalGangs(prev => {
      if (isFavourite) {
        const currentMaxOrder = Math.max(-1, ...prev.filter(g => g.is_favourite).map(g => g.favourite_order ?? -1));
        return prev.map(g =>
          g.id === gangId ? { ...g, is_favourite: true, favourite_order: currentMaxOrder + 1 } : g
        );
      }
      return prev.map(g =>
        g.id === gangId ? { ...g, is_favourite: false, favourite_order: null } : g
      );
    });

    const result = await toggleFavourite({ type: 'gang', id: gangId, is_favourite: isFavourite });
    if (!result.success) {
      setLocalGangs(previousGangs);
      toast.error(result.error || 'Failed to update favourite');
    }
  }, [localGangs]);

  const handleDragEnd = useCallback(async (event: { active: { id: string | number }; over: { id: string | number } | null }) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = favouriteGangs.findIndex(g => g.id === active.id);
    const newIndex = favouriteGangs.findIndex(g => g.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(favouriteGangs, oldIndex, newIndex);
    const newGangIds = reordered.map(g => g.id);

    setLocalGangs(prev => {
      const updated = [...prev];
      for (let i = 0; i < newGangIds.length; i++) {
        const idx = updated.findIndex(g => g.id === newGangIds[i]);
        if (idx !== -1) {
          updated[idx] = { ...updated[idx], favourite_order: i };
        }
      }
      return updated;
    });

    const result = await reorderFavourites({ type: 'gang', ids: newGangIds });
    if (!result.success) {
      toast.error(result.error || 'Failed to reorder favourites');
    }
  }, [favouriteGangs]);

  return (
    <div className="bg-card shadow-md rounded-lg p-4">
      <h2 className="text-xl md:text-2xl font-bold mb-4">Gangs</h2>
      {localGangs.length === 0 ? (
        <p className="text-center text-muted-foreground">No gangs created yet.</p>
      ) : (
        <div className="space-y-3">
          {favouriteGangs.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Favourites</h3>
              {isMounted ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={favouriteGangs.map(g => g.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul className="space-y-3">
                      {favouriteGangs.map(gang => (
                        <SortableGangCard
                          key={gang.id}
                          gang={gang}
                          onToggleFavourite={handleToggleFavourite}
                        />
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
              ) : (
                <ul className="space-y-3">
                  {favouriteGangs.map(gang => (
                    <li key={gang.id}>
                      <GangCardContent
                        gang={gang}
                        onToggleFavourite={handleToggleFavourite}
                      />
                    </li>
                  ))}
                </ul>
              )}
              {nonFavouriteGangs.length > 0 && (
                <hr className="border-border my-4" />
              )}
            </>
          )}

          {nonFavouriteGangs.length > 0 && (
            <ul className="space-y-3">
              {nonFavouriteGangs.map(gang => (
                <li key={gang.id}>
                  <GangCardContent
                    gang={gang}
                    onToggleFavourite={handleToggleFavourite}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
