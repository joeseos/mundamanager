"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { LuCheck, LuChevronsUpDown } from "react-icons/lu";
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
    disabled?: boolean // For non-selectable items like section headers
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
  const [position, setPosition] = React.useState({ top: 0, left: 0, width: 0 })
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Find the selected option
  const selectedOption = options.find(option => option.value === value)

  // Filter options based on search
  const filteredOptions = React.useMemo(() => {
    if (!searchValue) return options
    
    return options.filter(option => {
      // Always include disabled options (headers)
      if (option.disabled) return true
      
      const searchText = typeof option.label === 'string' 
        ? option.label 
        : (option.displayValue || '');
      return searchText.toLowerCase().includes(searchValue.toLowerCase())
    })
  }, [options, searchValue])

  // Handle option selection
  const handleSelect = (optionValue: string, isDisabled?: boolean) => {
    if (isDisabled) return
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

  // Update position when dropdown opens or scrolls
  const updatePosition = React.useCallback(() => {
    if (open && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect()
      setPosition({
        top: rect.bottom,
        left: rect.left,
        width: rect.width
      })
    }
  }, [open])

  React.useEffect(() => {
    updatePosition()
  }, [open, updatePosition])

  // Update position on scroll
  React.useEffect(() => {
    if (open) {
      window.addEventListener('scroll', updatePosition, true)
      return () => window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, updatePosition])

  // Handle click outside or on another combobox
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      const clickedCombobox = target.closest('[data-combobox]')
      const currentCombobox = inputRef.current?.closest('[data-combobox]')
      
      // Close if:
      // 1. Click is outside both the combobox container and the dropdown portal, OR
      // 2. Click is on a different combobox (not this one)
      if (
        (!target.closest('[data-combobox]') && !target.closest('[data-combobox-dropdown]')) ||
        (clickedCombobox && clickedCombobox !== currentCombobox)
      ) {
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
          ref={inputRef}
          type="text"
          className={cn(
            "flex h-10 w-full rounded-md border border-border bg-muted px-3 py-2 text-base md:text-sm",
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
          <LuChevronsUpDown className="h-4 w-4 opacity-50" />
        </button>
      </div>

      {open && createPortal(
        <div 
          data-combobox-dropdown
          className="fixed z-[110] bg-card border border-border rounded-md shadow-lg max-h-60 overflow-auto"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
            width: `${position.width}px`
          }}
        >
          {filteredOptions.length > 0 ? (
            <div className="py-1">
              {filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={option.disabled}
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm flex items-center justify-between",
                    option.disabled 
                      ? "cursor-default bg-muted" 
                      : "hover:bg-muted focus:bg-muted focus:outline-none cursor-pointer",
                    value === option.value && !option.disabled && "bg-muted"
                  )}
                  onClick={() => handleSelect(option.value, option.disabled)}
                >
                  <span className="flex items-center gap-1">{option.label}</span>
                  {value === option.value && !option.disabled && (
                    <LuCheck className="h-4 w-4" />
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
        </div>,
        document.body
      )}
    </div>
  )
}
