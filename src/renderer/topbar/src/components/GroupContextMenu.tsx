import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface GroupContextMenuProps {
  groupId: string
  groupName: string
  position: { x: number; y: number }
  onClose: () => void
  onCreateTabInGroup: () => void
  onMoveToNewWindow: () => void
  onSaveAndClose: () => void
  onUngroup: () => void
  onDelete: () => void
}

export const GroupContextMenu: React.FC<GroupContextMenuProps> = ({
  position,
  onClose,
  onCreateTabInGroup,
  onMoveToNewWindow,
  onSaveAndClose,
  onUngroup,
  onDelete,
}) => {
  const menuRef = useRef<HTMLDivElement>(null)
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
    // Adjust position to keep menu on screen
    const adjustPosition = () => {
      if (!menuRef.current) return

      const menuWidth = menuRef.current.offsetWidth || 200
      const menuHeight = menuRef.current.offsetHeight || 200
      let x = position.x
      let y = position.y

      // Keep within viewport bounds
      if (x + menuWidth > window.innerWidth) {
        x = window.innerWidth - menuWidth - 10
      }
      if (y + menuHeight > window.innerHeight) {
        y = window.innerHeight - menuHeight - 10
      }
      if (x < 10) x = 10
      if (y < 10) y = 10

      setAdjustedPosition({ x, y })
    }

    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(adjustPosition)

    // Re-adjust after a short delay to account for actual rendered size
    const timeout = setTimeout(adjustPosition, 0)
    return () => clearTimeout(timeout)
  }, [position])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
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

  const menuContent = (
    <div
      ref={menuRef}
      className="fixed bg-background border border-border rounded-lg shadow-2xl z-[99999] py-1 min-w-[200px] dark:bg-secondary dark:border-gray-700"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        position: 'fixed',
        pointerEvents: 'auto'
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => {
          onCreateTabInGroup()
          onClose()
        }}
        className="w-full text-left px-4 py-2 hover:bg-muted dark:hover:bg-muted/50 text-sm transition-colors"
      >
        New tab in group
      </button>
      <button
        onClick={() => {
          onMoveToNewWindow()
          onClose()
        }}
        className="w-full text-left px-4 py-2 hover:bg-muted dark:hover:bg-muted/50 text-sm transition-colors"
      >
        Move group to new window
      </button>
      <button
        onClick={() => {
          onSaveAndClose()
          onClose()
        }}
        className="w-full text-left px-4 py-2 hover:bg-muted dark:hover:bg-muted/50 text-sm transition-colors"
      >
        Save and close group
      </button>
      <div className="border-t border-border my-1 dark:border-gray-700" />
      <button
        onClick={() => {
          onUngroup()
          onClose()
        }}
        className="w-full text-left px-4 py-2 hover:bg-muted dark:hover:bg-muted/50 text-sm transition-colors"
      >
        Ungroup tabs
      </button>
      <button
        onClick={() => {
          onDelete()
          onClose()
        }}
        className="w-full text-left px-4 py-2 hover:bg-muted dark:hover:bg-muted/50 text-sm text-destructive transition-colors"
      >
        Delete group
      </button>
    </div>
  )

  // Render using portal to document.body to ensure it's above all content
  if (!portalContainer) return null

  return createPortal(menuContent, portalContainer)
}

