"use client"

import { KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

export function useDndSensorsConfig() {
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 600, tolerance: 10 },
  });
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { delay: 150, tolerance: 5 },
  });

  return useSensors(
    typeof window === "undefined" ? pointerSensor :
    (() => {
      const isMobile = /Mobi|Android|iPhone|iPad|Tablet/i.test(navigator.userAgent) ||
        ('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0);
      return isMobile ? touchSensor : pointerSensor;
    })(),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
}
