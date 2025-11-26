import React, { useState, useEffect, useRef } from 'react'
import { ChevronDown, Plus, Trash2, Container } from 'lucide-react'
import { cn } from '@common/lib/utils'

interface Workspace {
  id: string
  name: string
  icon?: string
  color?: string
  tabCount: number
  defaultContainerId?: string
}

interface Container {
  id: string
  name: string
  color?: string
  icon?: string
}

export const WorkspaceSwitcher: React.FC = () => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null)
  const [containers, setContainers] = useState<Container[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadWorkspaces()
    loadContainers()
    loadActiveWorkspace()

    // Listen for workspace updates
    const handleWorkspacesUpdated = (data: { workspaces: Workspace[]; activeWorkspace: Workspace | null }) => {
      setWorkspaces(data.workspaces)
      setActiveWorkspace(data.activeWorkspace)
    }

    window.topBarAPI.onWorkspacesUpdated(handleWorkspacesUpdated)

    // Refresh periodically as fallback
    const interval = setInterval(() => {
      loadWorkspaces()
      loadActiveWorkspace()
    }, 5000) // Increased to 5 seconds since we have events now

    return () => {
      clearInterval(interval)
      window.topBarAPI.removeWorkspacesUpdatedListener()
    }
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      // Expand topbar
      window.topBarAPI.expand()
    } else {
      // Collapse topbar
      window.topBarAPI.collapse()
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const loadWorkspaces = async () => {
    try {
      const ws = await window.topBarAPI.getWorkspaces()
      setWorkspaces(ws)
    } catch (error) {
      console.error('Failed to load workspaces:', error)
    }
  }

  const loadActiveWorkspace = async () => {
    try {
      const active = await window.topBarAPI.getActiveWorkspace()
      setActiveWorkspace(active)
    } catch (error) {
      console.error('Failed to load active workspace:', error)
    }
  }

  const loadContainers = async () => {
    try {
      const cont = await window.topBarAPI.getContainers()
      setContainers(cont)
    } catch (error) {
      console.error('Failed to load containers:', error)
    }
  }

  const handleSwitchWorkspace = async (workspaceId: string) => {
    try {
      await window.topBarAPI.switchWorkspace(workspaceId)
      await loadActiveWorkspace()
      setIsOpen(false)
    } catch (error) {
      console.error('Failed to switch workspace:', error)
    }
  }

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) return

    try {
      await window.topBarAPI.createWorkspace(newWorkspaceName.trim())
      setNewWorkspaceName('')
      setIsCreatingWorkspace(false)
      // The event listener will update the UI automatically
      // But we can also refresh immediately for better UX
      await loadWorkspaces()
      await loadActiveWorkspace()
    } catch (error) {
      console.error('Failed to create workspace:', error)
    }
  }

  const handleDeleteWorkspace = async (workspaceId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (window.confirm('Are you sure you want to delete this workspace?')) {
      try {
        await window.topBarAPI.deleteWorkspace(workspaceId)
        // The event listener will update the UI automatically
        // But we can also refresh immediately for better UX
        await loadWorkspaces()
        await loadActiveWorkspace()
      } catch (error) {
        console.error('Failed to delete workspace:', error)
      }
    }
  }

  const getColorClass = (color?: string) => {
    const colorMap: Record<string, string> = {
      blue: 'bg-blue-500',
      red: 'bg-red-500',
      green: 'bg-green-500',
      yellow: 'bg-yellow-500',
      purple: 'bg-purple-500',
      pink: 'bg-pink-500',
      cyan: 'bg-cyan-500',
    }
    return colorMap[color || 'blue'] || 'bg-blue-500'
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Workspace Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-md",
          "bg-muted/50 hover:bg-muted dark:bg-muted/30 dark:hover:bg-muted/50",
          "text-sm font-medium transition-colors",
          "app-region-no-drag"
        )}
      >
        <div className={cn("w-2 h-2 rounded-full", getColorClass(activeWorkspace?.color))} />
        <span className="max-w-[120px] truncate">
          {activeWorkspace?.name || 'Default'}
        </span>
        <span className="text-xs text-muted-foreground">
          ({activeWorkspace?.tabCount || 0})
        </span>
        <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className={cn(
          "absolute top-full left-0 mt-2 w-64 rounded-lg border",
          "bg-background dark:bg-secondary shadow-lg z-50",
          "app-region-no-drag"
        )}>
          <div className="p-2">
            {/* Workspaces List */}
            <div className="space-y-1">
              {workspaces.map((workspace) => (
                <div
                  key={workspace.id}
                  onClick={() => handleSwitchWorkspace(workspace.id)}
                  className={cn(
                    "group flex items-center justify-between p-2 rounded-md cursor-pointer",
                    "hover:bg-muted dark:hover:bg-muted/50 transition-colors",
                    activeWorkspace?.id === workspace.id && "bg-muted dark:bg-muted/70"
                  )}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className={cn("w-2 h-2 rounded-full flex-shrink-0", getColorClass(workspace.color))} />
                    <span className="text-sm truncate">{workspace.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({workspace.tabCount})
                    </span>
                  </div>
                  <button
                    onClick={(e) => handleDeleteWorkspace(workspace.id, e)}
                    className="p-1 hover:bg-destructive/20 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              ))}
            </div>

            {/* Create Workspace */}
            {isCreatingWorkspace ? (
              <div className="mt-2 p-2 border rounded-md">
                <input
                  type="text"
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleCreateWorkspace()
                    } else if (e.key === 'Escape') {
                      setIsCreatingWorkspace(false)
                      setNewWorkspaceName('')
                    }
                  }}
                  placeholder="Workspace name..."
                  className="w-full px-2 py-1 text-sm rounded border bg-background"
                  autoFocus
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleCreateWorkspace}
                    className="flex-1 px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => {
                      setIsCreatingWorkspace(false)
                      setNewWorkspaceName('')
                    }}
                    className="flex-1 px-2 py-1 text-xs bg-muted rounded hover:bg-muted/80"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsCreatingWorkspace(true)}
                className="w-full mt-2 p-2 rounded-md hover:bg-muted dark:hover:bg-muted/50 transition-colors flex items-center gap-2 text-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Create Workspace</span>
              </button>
            )}

            {/* Containers Section */}
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center gap-2 mb-2 px-2">
                <Container className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Containers</span>
              </div>
              <div className="space-y-1">
                {containers.map((container) => (
                  <div
                    key={container.id}
                    className="flex items-center gap-2 p-2 rounded-md text-sm"
                  >
                    <div className={cn("w-2 h-2 rounded-full", getColorClass(container.color))} />
                    <span className="truncate">{container.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

