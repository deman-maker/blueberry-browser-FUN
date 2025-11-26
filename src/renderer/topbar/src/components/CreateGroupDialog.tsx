import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Sparkles } from 'lucide-react'
import { cn } from '@common/lib/utils'

interface CreateGroupDialogProps {
  tabIds: string[]
  position: { x: number; y: number }
  onClose: () => void
  onCreate: (name: string, color: string) => void
  onSuggestTabs?: () => Promise<string[]>
}

const GROUP_COLORS = [
  { name: 'Blue', value: 'blue', class: 'bg-blue-500' },
  { name: 'Red', value: 'red', class: 'bg-red-500' },
  { name: 'Yellow', value: 'yellow', class: 'bg-yellow-500' },
  { name: 'Green', value: 'green', class: 'bg-green-500' },
  { name: 'Pink', value: 'pink', class: 'bg-pink-500' },
  { name: 'Purple', value: 'purple', class: 'bg-purple-500' },
  { name: 'Cyan', value: 'cyan', class: 'bg-cyan-500' },
]

export const CreateGroupDialog: React.FC<CreateGroupDialogProps> = ({
  tabIds: _tabIds, // Used by parent component when creating group
  position,
  onClose,
  onCreate,
  onSuggestTabs,
}) => {
  const [groupName, setGroupName] = useState('')
  const [selectedColor, setSelectedColor] = useState('blue')

  // Auto-select next available color
  useEffect(() => {
    const getNextAvailableColor = async () => {
      try {
        // Get groups from the tabs data
        const tabs = await window.topBarAPI.getTabs()
        const usedColors = tabs
          .filter(t => t.groupColor)
          .map(t => t.groupColor)
          .filter(Boolean) as string[]
        const uniqueColors = [...new Set(usedColors)]
        const allColors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan']

        // Find first unused color
        for (const color of allColors) {
          if (!uniqueColors.includes(color)) {
            setSelectedColor(color)
            return
          }
        }
        // If all used, use least used
        const colorUsage = allColors.map(color => ({
          color,
          count: usedColors.filter(c => c === color).length
        }))
        colorUsage.sort((a, b) => a.count - b.count)
        setSelectedColor(colorUsage[0].color)
      } catch (error) {
        console.error('Failed to get groups for color selection:', error)
      }
    }
    getNextAvailableColor()
  }, [])
  const [isSuggesting, setIsSuggesting] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [adjustedPosition, setAdjustedPosition] = useState(position)
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null)

  // Set up portal container on mount and handle TopBar expansion
  useEffect(() => {
    setPortalContainer(document.body)
    window.topBarAPI.expand()
    return () => {
      window.topBarAPI.collapse()
    }
  }, [])

  useEffect(() => {
    const adjustPosition = () => {
      if (!dialogRef.current) return

      const dialogWidth = dialogRef.current.offsetWidth || 320
      const dialogHeight = dialogRef.current.offsetHeight || 300
      let x = position.x
      let y = position.y

      if (x + dialogWidth > window.innerWidth) {
        x = window.innerWidth - dialogWidth - 10
      }
      if (y + dialogHeight > window.innerHeight) {
        y = window.innerHeight - dialogHeight - 10
      }
      if (x < 10) x = 10
      if (y < 10) y = 10

      setAdjustedPosition({ x, y })
    }

    requestAnimationFrame(adjustPosition)
    // Re-adjust after a short delay to account for actual rendered size
    const timeout = setTimeout(adjustPosition, 0)
    return () => clearTimeout(timeout)
  }, [position])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    // Use capture phase to catch events before they reach other elements
    document.addEventListener('mousedown', handleClickOutside, true)
    document.addEventListener('keydown', handleEscape, true)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true)
      document.removeEventListener('keydown', handleEscape, true)
    }
  }, [onClose])

  const handleSuggestTabs = async () => {
    if (!onSuggestTabs) return
    setIsSuggesting(true)
    try {
      const suggestedTabIds = await onSuggestTabs()
      // Add suggested tabs to the group
      if (suggestedTabIds.length > 0) {
        // This will be handled by the parent component
        console.log('Suggested tabs:', suggestedTabIds)
      }
    } catch (error) {
      console.error('Failed to suggest tabs:', error)
    } finally {
      setIsSuggesting(false)
    }
  }

  const handleCreate = () => {
    if (groupName.trim()) {
      onCreate(groupName.trim(), selectedColor)
      onClose()
    }
  }

  const dialogContent = (
    <div
      ref={dialogRef}
      className="fixed bg-background border border-border rounded-lg shadow-2xl z-[99999] w-80 dark:bg-secondary dark:border-gray-700"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        position: 'fixed',
        pointerEvents: 'auto'
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Create tab group</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Group Name */}
        <div className="mb-4">
          <label className="block text-xs font-medium mb-2">Name</label>
          <input
            ref={inputRef}
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreate()
              }
            }}
            placeholder="Example: Shopping"
            className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Color Selection */}
        <div className="mb-4">
          <div className="flex gap-2">
            {GROUP_COLORS.map((color) => (
              <button
                key={color.value}
                onClick={() => setSelectedColor(color.value)}
                className={cn(
                  'w-8 h-8 rounded border-2 transition-all',
                  color.class,
                  selectedColor === color.value
                    ? 'border-foreground scale-110 ring-2 ring-primary'
                    : 'border-transparent hover:scale-105'
                )}
                title={color.name}
              />
            ))}
          </div>
        </div>

        {/* Suggest Tabs Button */}
        {onSuggestTabs && (
          <button
            onClick={handleSuggestTabs}
            disabled={isSuggesting}
            className="w-full mb-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 text-sm font-medium flex items-center justify-center gap-2"
          >
            <Sparkles className={cn('w-4 h-4', isSuggesting && 'animate-pulse')} />
            Suggest more of my tabs
          </button>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-background border border-border rounded-md hover:bg-muted transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!groupName.trim()}
            className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )

  // Render using portal to document.body to ensure it's above all content
  if (!portalContainer) return null

  return createPortal(dialogContent, portalContainer)
}

