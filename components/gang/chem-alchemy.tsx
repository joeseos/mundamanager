"use client"

import { useState, useEffect } from "react"
import Modal from "../ui/modal"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ImInfo } from "react-icons/im"
import { rollD6 } from "@/utils/dice"

type ChemType = "stimm" | "gaseous" | "toxic"

interface ChemEffect {
  name: string
  cost: number
}

const STIMM_EFFECTS: ChemEffect[] = [
  { name: "Bad Blood", cost: 10 },
  { name: "Blood Rush", cost: 15 },
  { name: "Brain Lock", cost: 15 },
  { name: "Dreamland", cost: 10 },
  { name: "Hyper", cost: 20 },
  { name: "Ice Cold", cost: 15 },
  { name: "Jolt", cost: 30 },
  { name: "Night Night", cost: 25 },
  { name: "Predator's Kiss", cost: 45 },
  { name: "Puke", cost: 15 },
  { name: "Wide-eye", cost: 10 },
]

const GASEOUS_EFFECTS: ChemEffect[] = [
  { name: "Acidic", cost: 20 },
  { name: "Bane", cost: 15 },
  { name: "Blackout", cost: 30 },
  { name: "Blinding", cost: 10 },
  { name: "Expansive", cost: 20 },
  { name: "Hallucinogen", cost: 15 },
  { name: "Leaden", cost: 30 },
  { name: "Liftin'", cost: 25 },
  { name: "Pathogenic", cost: 15 },
  { name: "Pyrophoric", cost: 20 },
]

const TOXIC_EFFECTS: ChemEffect[] = [
  { name: "Bleeding", cost: 10 },
  { name: "Blood Boil", cost: 30 },
  { name: "Concentrated", cost: 15 },
  { name: "Debilitating", cost: 10 },
  { name: "Decaying", cost: 5 },
  { name: "Exploding", cost: 20 },
  { name: "Maddening", cost: 5 },
  { name: "Maiming", cost: 10 },
  { name: "Panicking", cost: 10 },
  { name: "Paralysing", cost: 5 },
  { name: "Silencing", cost: 5 },
  { name: "Skin Fire", cost: 25 },
]

const getEffectsForType = (type: ChemType): ChemEffect[] => {
  switch (type) {
    case "stimm":
      return STIMM_EFFECTS
    case "gaseous":
      return GASEOUS_EFFECTS
    case "toxic":
      return TOXIC_EFFECTS
    default:
      return []
  }
}

const getTypeDisplayName = (type: ChemType): string => {
  switch (type) {
    case "stimm":
      return "Stimm"
    case "gaseous":
      return "Gaseous Ammo"
    case "toxic":
      return "Toxic Ammo"
    default:
      return ""
  }
}

interface ChemAlchemyCreatorProps {
  isOpen: boolean
  onClose: () => void
  gangCredits: number
  hasApprenticeClanChymist?: boolean
  onCreateChem?: (chem: {
    type: ChemType
    effects: ChemEffect[]
    totalCost: number
    name: string
    useBaseCostForRating: boolean
    baseCost: number
  }) => void
}

export default function ChemAlchemyCreator({ isOpen, onClose, gangCredits, hasApprenticeClanChymist = false, onCreateChem }: ChemAlchemyCreatorProps) {
  const [selectedType, setSelectedType] = useState<ChemType>("stimm")
  const [selectedEffects, setSelectedEffects] = useState<ChemEffect[]>([])
  const [chemName, setChemName] = useState("")
  const [manualCost, setManualCost] = useState("")
  const [useBaseCostForRating, setUseBaseCostForRating] = useState(true)
  const [creditError, setCreditError] = useState<string | null>(null)
  const [lastDiscountRoll, setLastDiscountRoll] = useState<number | null>(null)
  const [lastDiscountNewCost, setLastDiscountNewCost] = useState<number | null>(null)

  const availableEffects = getEffectsForType(selectedType)
  const totalCost = selectedEffects.reduce((sum, effect) => sum + effect.cost, 0)

  // Update manual cost when effects change
  useEffect(() => {
    setManualCost(String(totalCost))
  }, [totalCost])

  const handleTypeChange = (type: ChemType) => {
    setSelectedType(type)
    setSelectedEffects([])
  }

  const handleEffectToggle = (effect: ChemEffect) => {
    setSelectedEffects((prev) => {
      const isSelected = prev.some((e) => e.name === effect.name)
      if (isSelected) {
        return prev.filter((e) => e.name !== effect.name)
      } else if (prev.length < 3) {
        return [...prev, effect]
      }
      return prev
    })
  }

  const handleCreateChem = () => {
    if (selectedEffects.length === 0 || !chemName.trim()) {
      return false
    }

    const parsedCost = Number(manualCost)

    if (isNaN(parsedCost)) {
      setCreditError('Incorrect input, please update the cost value')
      return false
    } else if (parsedCost > gangCredits) {
      setCreditError(`Not enough credits. Gang Credits: ${gangCredits}`)
      return false
    }

    setCreditError(null)
    const finalName = selectedEffects.length > 0
      ? `${chemName.trim()} (${selectedEffects.map(effect => effect.name).join(", ")})`
      : chemName.trim()

    onCreateChem?.({
      type: selectedType,
      effects: selectedEffects,
      totalCost: parsedCost,
      name: finalName,
      useBaseCostForRating,
      baseCost: totalCost
    })
    return true
  }

  const handleClose = () => {
    setSelectedEffects([])
    setChemName("")
    setManualCost("")
    setUseBaseCostForRating(true)
    setCreditError(null)
    setLastDiscountRoll(null)
    setLastDiscountNewCost(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <Modal
      title="Create Chem-alchemy Elixir"
      headerContent={
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Gang Credits</span>
          <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm">
            {gangCredits}
          </span>
        </div>
      }
      onClose={handleClose}
      onConfirm={handleCreateChem}
      confirmText="Create Elixir"
      confirmDisabled={selectedEffects.length === 0 || !chemName.trim() || !manualCost.trim() || isNaN(Number(manualCost)) || Number(manualCost) > gangCredits}
    >
      <div className="space-y-5">
        {/* Chem Name Input */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">Elixir Name</label>
          <input
            type="text"
            value={chemName}
            onChange={(e) => setChemName(e.target.value)}
            placeholder="Enter a name for your elixir..."
            className="w-full px-3 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
          
          <div className="mt-0">
            <span className="text-sm text-muted-foreground">
              Name Suffix: {selectedEffects.length > 0 ? `(${selectedEffects.map(effect => effect.name).join(", ")})` : "()"}
            </span>
          </div>
          
        </div>

        {/* Chem Type Selection */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">Chem Type</label>
          <div className="grid grid-cols-3 gap-2">
            {(["stimm", "gaseous", "toxic"] as ChemType[]).map((type) => (
              <Button
                key={type}
                onClick={() => handleTypeChange(type)}
                variant={selectedType === type ? "default" : "outline"}
                size="sm"
                className="font-medium"
              >
                {getTypeDisplayName(type)}
              </Button>
            ))}
          </div>
        </div>

        {/* Effects Selection */}
        <div>
          <div className="mb-2">
            <label className="block text-sm font-semibold text-foreground">
              Available Effects ({selectedEffects.length}/3)
            </label>
          </div>
          <div className="max-h-64 overflow-y-auto border border-border rounded-lg">
            {availableEffects.map((effect, index) => {
              const isSelected = selectedEffects.some((e) => e.name === effect.name)
              const canSelect = selectedEffects.length < 3 || isSelected

              return (
                <label
                  key={effect.name}
                  htmlFor={`effect-${effect.name}`}
                  className={`flex items-center justify-between pl-3 pr-3 pb-[6px] pt-[6px] ${
                    index !== availableEffects.length - 1 ? "border-b border-gray-100" : ""
                  } ${!canSelect ? "opacity-40" : "hover:bg-muted"} transition-colors cursor-pointer`}
                >
                  <div className="flex items-center space-x-3 flex-1">
                    <Checkbox
                      id={`effect-${effect.name}`}
                      checked={isSelected}
                      onCheckedChange={() => handleEffectToggle(effect)}
                      disabled={!canSelect}
                    />
                    <span className="text-sm font-medium text-foreground">
                      {effect.name}
                    </span>
                  </div>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center bg-neutral-900 text-white">
                    <span className="text-[10px] font-medium">{effect.cost}</span>
                  </div>
                </label>
              )
            })}
          </div>
        </div>

        {/* Discount Roll Button */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-semibold text-foreground">Cost (credits)</label>
            {hasApprenticeClanChymist && (
              <div className="flex items-center gap-2">
                {lastDiscountRoll !== null && lastDiscountNewCost !== null && (
                  <span className="text-xs text-muted-foreground">
                    Roll {lastDiscountRoll}: -{lastDiscountRoll * 10} 
                    <span className="mx-1">→</span> {lastDiscountNewCost} credits
                  </span>
                )}
                <Button
                  type="button"
                  title="Roll a D6 to apply the discount granted by your Apprentice Clan Chymist."
                  size="sm"
                  variant="default"
                  disabled={selectedEffects.length < 1}
                  onClick={() => {
                    const die = rollD6()
                    const discount = die * 10
                    const next = Math.max(10, totalCost - discount)
                    const nextStr = String(next)
                    setManualCost(nextStr)
                    setLastDiscountRoll(die)
                    setLastDiscountNewCost(next)
                    if (next <= gangCredits) {
                      setCreditError(null)
                    }
                  }}
                >
                  Roll D6
                </Button>
              </div>
            )}
          </div>

          {/* Cost Input */}
          <input
            type="number"
            inputMode="numeric"
            pattern="-?[0-9]*"
            value={manualCost}
            onChange={(e) => {
              const val = e.target.value;
              if (/^-?\d*$/.test(val)) {
                setManualCost(val);
                const parsed = Number(val);
                if (!Number.isNaN(parsed) && parsed <= gangCredits) {
                  setCreditError(null);
                }
              }
            }}
            className="w-full px-3 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            min="0"
          />
          <p className="text-sm text-muted-foreground mt-1">
            Listed cost: {totalCost} credits
          </p>
          {creditError && (
            <p className="text-red-500 text-sm mt-1">{creditError}</p>
          )}
        </div>

        {/* Use Listed / Base Cost Checkbox */}
        <div className="flex items-center space-x-2">
          <Checkbox 
            id="use-base-cost-for-rating"
            checked={useBaseCostForRating}
            onCheckedChange={(checked) => setUseBaseCostForRating(checked as boolean)}
          />
          <label 
            htmlFor="use-base-cost-for-rating" 
            className="text-sm font-medium text-muted-foreground cursor-pointer"
          >
            Use Listed Cost for Rating
          </label>
          <div className="relative group">
            <ImInfo />
            <div className="absolute bottom-full mb-2 hidden group-hover:block bg-neutral-900 text-white text-xs p-2 rounded w-72 -left-36 z-50">
              When enabled, the elixir's rating is calculated using its listed cost, even if you paid a different amount. Disable this if you want the rating to reflect the price actually paid.
            </div>
          </div>
        </div>

      </div>
    </Modal>
  )
} 