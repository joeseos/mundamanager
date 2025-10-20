"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/app/lib/utils"

/**
 * A searchable combobox component that allows users to select from a list of options
 * or type to filter/search through them. Supports custom values when allowCustom is true.
 * Built using only existing components and dependencies.
 * 
 * @example
 * ```tsx
 * <Combobox
 *   options={[
 *     { value: "1", label: "1. The Escape" },
 *     { value: "2", label: "2. The Heist" }
 *   ]}
 *   value={selectedValue}
 *   onValueChange={setSelectedValue}
 *   placeholder="Select or search..."
 *   allowCustom={true}
 * />
 * ```
 */
interface ComboboxProps {
  options: Array<{
    value: string
    label: string | React.ReactNode
    displayValue?: string // For search/filter purposes when label is ReactNode
  }>
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  allowCustom?: boolean
  customPlaceholder?: string
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Select option...",
  disabled = false,
  className,
  allowCustom = false,
  customPlaceholder = "Enter custom value..."
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [searchValue, setSearchValue] = React.useState("")
  const [inputValue, setInputValue] = React.useState("")

  // Find the selected option
  const selectedOption = options.find(option => option.value === value)

  // Filter options based on search
  const filteredOptions = React.useMemo(() => {
    if (!searchValue) return options
    
    return options.filter(option => {
      const searchText = typeof option.label === 'string' 
        ? option.label 
        : (option.displayValue || '');
      return searchText.toLowerCase().includes(searchValue.toLowerCase())
    })
  }, [options, searchValue])

  // Handle option selection
  const handleSelect = (optionValue: string) => {
    onValueChange?.(optionValue)
    setOpen(false)
    setSearchValue("")
    setInputValue("")
  }

  // Handle custom value
  const handleCustomValue = () => {
    if (allowCustom && searchValue.trim()) {
      onValueChange?.(searchValue.trim())
      setOpen(false)
      setSearchValue("")
      setInputValue("")
    }
  }

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    setSearchValue(newValue)
    
    if (!open) {
      setOpen(true)
    }
  }

  // Handle key down
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && allowCustom && searchValue.trim()) {
      e.preventDefault()
      handleCustomValue()
    } else if (e.key === "Escape") {
      setOpen(false)
      setSearchValue("")
      setInputValue("")
    }
  }

  // Handle click outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      if (!target.closest('[data-combobox]')) {
        setOpen(false)
        setSearchValue("")
        setInputValue("")
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  return (
    <div className={cn("relative", className)} data-combobox>
      <div className="relative">
        <input
          type="text"
          className={cn(
            "flex h-10 w-full rounded-md border border-border bg-muted px-3 py-2 text-sm",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "pr-10",
            selectedOption && typeof selectedOption.label !== 'string' && !open && "text-transparent placeholder:text-transparent"
          )}
          placeholder={
            selectedOption && typeof selectedOption.label !== 'string' && !open
              ? ""
              : selectedOption 
                ? (typeof selectedOption.label === 'string' 
                    ? selectedOption.label 
                    : (selectedOption.displayValue || placeholder))
                : placeholder
          }
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          disabled={disabled}
        />
        {selectedOption && typeof selectedOption.label !== 'string' && !open && (
          <div className="absolute inset-0 flex items-center px-3 py-2 pointer-events-none">
            <span className="flex items-center gap-1 text-sm">
              {selectedOption.label}
            </span>
          </div>
        )}
        <button
          type="button"
          className="absolute right-0 top-0 h-full px-3 flex items-center justify-center hover:bg-primary/30 rounded-r-md"
          onClick={() => setOpen(!open)}
          disabled={disabled}
        >
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </button>
      </div>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-60 overflow-auto">
          {filteredOptions.length > 0 ? (
            <div className="py-1">
              {filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none",
                    "flex items-center justify-between",
                    value === option.value && "bg-muted"
                  )}
                  onClick={() => handleSelect(option.value)}
                >
                  <span className="flex items-center gap-1">{option.label}</span>
                  {value === option.value && (
                    <Check className="h-4 w-4" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No options found
            </div>
          )}
          
          {allowCustom && searchValue.trim() && (
            <div className="border-t border-border">
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none flex items-center"
                onClick={handleCustomValue}
              >
                <span className="text-blue-600">Custom: "{searchValue}"</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
