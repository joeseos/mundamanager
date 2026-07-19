import { PointerSensor, KeyboardSensor, PointerActivationConstraints } from '@dnd-kit/dom'

// Shared sensor configuration for all DragDropProviders.
// Passing an array replaces the defaults, so KeyboardSensor must be listed explicitly.
export const dndSensors = [
  PointerSensor.configure({
    activationConstraints(event) {
      if (event.pointerType === 'touch') {
        // Long-press to drag on touch, so swipes still scroll the page
        return [new PointerActivationConstraints.Delay({ value: 600, tolerance: 10 })]
      }
      // Small distance for mouse/pen so plain clicks still navigate card links
      return [new PointerActivationConstraints.Distance({ value: 8 })]
    },
    preventActivation(event) {
      // The default blocks activation inside any interactive element, which would
      // make our link-wrapped cards undraggable. Only real controls opt out;
      // anchors stay draggable since the whole card is the drag handle.
      return event.target instanceof Element &&
        event.target.closest('button, input, textarea, select') !== null
    },
  }),
  KeyboardSensor,
]
