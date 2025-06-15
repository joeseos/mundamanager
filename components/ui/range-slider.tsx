"use client"
import * as SliderPrimitive from "@radix-ui/react-slider"

interface RangeSliderProps {
  label: string
  value: [number, number]
  onValueChange: (value: [number, number]) => void
  min: number
  max: number
  step?: number
  formatValue?: (value: number) => string
  className?: string
}

export function RangeSlider({
  label,
  value,
  onValueChange,
  min,
  max,
  step = 1,
  formatValue = (val) => val.toString(),
  className = "",
}: RangeSliderProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex justify-between items-center">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <span className="text-sm text-gray-500">
          {formatValue(value[0])} - {formatValue(value[1])}
        </span>
      </div>

      <SliderPrimitive.Root
        className="relative flex w-full touch-none select-none items-center"
        value={value}
        onValueChange={onValueChange}
        min={min}
        max={max}
        step={step}
        minStepsBetweenThumbs={1}
      >
        <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-gray-400">
          <SliderPrimitive.Range className="absolute h-full bg-black" />
        </SliderPrimitive.Track>

        {/* First thumb (minimum value) */}
        <SliderPrimitive.Thumb
          className="block h-4 w-4 rounded-full border border-gray-300 bg-white shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          aria-label="Set minimum value"
        />

        {/* Second thumb (maximum value) */}
        <SliderPrimitive.Thumb
          className="block h-4 w-4 rounded-full border border-gray-300 bg-white shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          aria-label="Set maximum value"
        />
      </SliderPrimitive.Root>
    </div>
  )
} 