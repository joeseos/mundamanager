'use client';

import { useEffect, useState } from 'react';

/**
 * Scroll-spy: which of the given heading ids is currently "active".
 *
 * A heading becomes active once its top crosses the line `topOffsetPx` below
 * the viewport top (the fixed header + breadcrumb bar). Between headings the
 * most recently passed one stays active, so scrolling up never blanks the
 * highlight. Returns null until the first heading has been reached.
 *
 * `contentKey` should change whenever the DOM holding the headings is
 * re-created (e.g. an edition toggle that remounts the article), so the
 * observer re-attaches to the live elements even if the ids are identical.
 */
export function useActiveHeading(
  ids: string[],
  topOffsetPx = 96,
  contentKey = ''
): string | null {
  const idsKey = ids.join('\n');
  const stateKey = `${contentKey}\u0000${idsKey}`;
  // State is tagged with the key it was computed for, so switching
  // editions reads as "nothing active" until the new headings are measured.
  const [active, setActive] = useState<{ key: string; id: string | null }>({ key: stateKey, id: null });

  useEffect(() => {
    const headingIds = idsKey ? idsKey.split('\n') : [];
    if (headingIds.length === 0) return;
    // Always resolve from the live document: elements captured earlier may
    // have been detached by a remount and would measure as top = 0.
    const resolve = () =>
      headingIds
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => el !== null && el.isConnected);

    // The last heading whose top sits above the activation line wins.
    const compute = () => {
      let current: string | null = null;
      for (const el of resolve()) {
        if (el.getBoundingClientRect().top <= topOffsetPx + 1) {
          current = el.id;
        } else {
          break;
        }
      }
      setActive((prev) =>
        prev.key === stateKey && prev.id === current ? prev : { key: stateKey, id: current }
      );
    };

    let frame: number | null = null;
    const schedule = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        compute();
      });
    };

    // IntersectionObserver fires whenever any heading crosses the activation
    // zone (from the line down to 40% of the viewport). We recompute from
    // geometry on each event rather than trusting entry order, which keeps
    // the result correct for fast scrolls and for scrolling upwards.
    const observer = new IntersectionObserver(schedule, {
      rootMargin: `-${topOffsetPx}px 0px -60% 0px`,
      threshold: [0, 1],
    });
    resolve().forEach((el) => observer.observe(el));

    // Also recompute on scroll / resize / hash jumps so a heading skipped
    // between two observer callbacks is still picked up.
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('hashchange', schedule);

    schedule();

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('hashchange', schedule);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [idsKey, stateKey, topOffsetPx]);

  return active.key === stateKey ? active.id : null;
}
