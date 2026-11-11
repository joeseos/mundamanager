"use client"

import { useState, useCallback, useMemo } from 'react'
import type { Gang } from '@/app/lib/get-user-gangs'
import { DragDropProvider, type DragEndEvent } from '@dnd-kit/react'
import { move } from '@dnd-kit/helpers'
import { toggleFavourite } from '@/app/actions/toggle-favourite'
import { reorderFavourites } from '@/app/actions/reorder-favourites'
import { toast } from 'sonner'
import { dndSensors, useSuppressClickAfterDrag } from '@/hooks/use-dnd-sensors'
import { useHomeEdition } from '@/hooks/use-home-edition'
import { sameEditionForDisplay } from '@/types/edition'
import { EditionToggle } from '@/components/home/edition-toggle'
import { GangCardContent, SortableGangCard } from '@/components/home/gang-card'

interface GangsTabProps {
  gangs: Gang[];
}

export function GangsTab({ gangs }: GangsTabProps) {
  const [localGangs, setLocalGangs] = useState<Gang[]>(gangs);
  const suppressClickAfterDrag = useSuppressClickAfterDrag('.home-favourite-card-link');
  const { editionSlug, setEditionSlug } = useHomeEdition();

  const [prevGangs, setPrevGangs] = useState(gangs);
  if (gangs !== prevGangs) {
    setPrevGangs(gangs);
    setLocalGangs(gangs);
  }

  const editionGangs = useMemo(
    () => localGangs.filter(g => sameEditionForDisplay(g.edition_slug, editionSlug)),
    [localGangs, editionSlug]
  );

  const favouriteGangs = useMemo(
    () => [...editionGangs]
      .filter(g => g.is_favourite)
      .sort((a, b) => (a.favourite_order ?? 0) - (b.favourite_order ?? 0)),
    [editionGangs]
  );

  const nonFavouriteGangs = useMemo(
    () => [...editionGangs]
      .filter(g => !g.is_favourite)
      .sort((a, b) => {
        const dateA = new Date(b.last_updated || b.created_at).getTime();
        const dateB = new Date(a.last_updated || a.created_at).getTime();
        return dateA - dateB;
      }),
    [editionGangs]
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

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    // Always consider suppress for pointer drags — including same-position drops — because a
    // real drag still produces a trailing click.
    suppressClickAfterDrag(event.operation.activatorEvent);

    const currentIds = favouriteGangs.map(g => g.id);
    const newGangIds = move(currentIds, event);
    if (newGangIds === currentIds) return;

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

    // dnd-kit runs this handler inside a React transition that its drop animation waits for.
    // Saving after it returns keeps the card from freezing until the server answers.
    queueMicrotask(async () => {
      const result = await reorderFavourites({ type: 'gang', ids: newGangIds });
      if (!result.success) {
        toast.error(result.error || 'Failed to reorder favourites');
      }
    });
  }, [favouriteGangs, suppressClickAfterDrag]);

  return (
    <div className="bg-card shadow-md rounded-lg p-4">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="text-xl md:text-2xl font-bold">Gangs</h2>
        <EditionToggle value={editionSlug} onChange={setEditionSlug} />
      </div>
      {editionGangs.length === 0 ? (
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
