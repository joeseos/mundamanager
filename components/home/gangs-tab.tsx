"use client"

import { useState, useCallback, useMemo, useEffect } from 'react'
import type { Gang } from '@/app/lib/get-user-gangs'
import { DragDropProvider, type DragEndEvent } from '@dnd-kit/react'
import { move } from '@dnd-kit/helpers'
import { toggleFavourite } from '@/app/actions/toggle-favourite'
import { reorderFavourites } from '@/app/actions/reorder-favourites'
import { toast } from 'sonner'
import { dndSensors } from '@/utils/dnd-sensors'
import { GangCardContent, SortableGangCard } from '@/components/home/gang-card'

interface GangsTabProps {
  gangs: Gang[];
}

export function GangsTab({ gangs }: GangsTabProps) {
  const [localGangs, setLocalGangs] = useState<Gang[]>(gangs);
  const [pendingReorder, setPendingReorder] = useState<string[] | null>(null);

  // Persist from an effect, after the drop's React transition has committed.
  // Dispatching the server action any earlier (even via setTimeout) entangles
  // its pending transition with the drop's, freezing the card until the POST
  // + revalidation round-trip resolves.
  useEffect(() => {
    if (!pendingReorder) return;
    // No reset needed: each drag sets a fresh array, so the effect fires
    // exactly once per reorder via the dependency identity change
    reorderFavourites({ type: 'gang', ids: pendingReorder }).then(result => {
      if (!result.success) {
        toast.error(result.error || 'Failed to reorder favourites');
      }
    });
  }, [pendingReorder]);

  const [prevGangs, setPrevGangs] = useState(gangs);
  if (gangs !== prevGangs) {
    setPrevGangs(gangs);
    setLocalGangs(gangs);
  }

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

  // Must stay synchronous: the drop animation waits for this handler's React
  // transition to settle, so awaiting the server action here freezes the drop
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    if (event.canceled) return;

    // move() resolves the drop from the event's sortable metadata and
    // returns the same array reference when nothing changed
    const reordered = move(favouriteGangs, event);
    if (reordered === favouriteGangs) return;
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

    setPendingReorder(newGangIds);
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
              <DragDropProvider sensors={dndSensors} onDragEnd={handleDragEnd}>
                <ul className="space-y-3">
                  {favouriteGangs.map((gang, index) => (
                    <SortableGangCard
                      key={gang.id}
                      gang={gang}
                      index={index}
                      onToggleFavourite={handleToggleFavourite}
                    />
                  ))}
                </ul>
              </DragDropProvider>
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
