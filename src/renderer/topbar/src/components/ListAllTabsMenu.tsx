import React, { useState, useEffect, useRef } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { useBrowser } from '../contexts/BrowserContext'
import { Favicon } from './Favicon'
import { cn } from '@common/lib/utils'

interface GroupWithTabs {
  id: string
  name: string
  color: string
  collapsed: boolean
  tabs: Array<{ id: string; title: string; url: string }>
}

export const ListAllTabsMenu: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [groups, setGroups] = useState<GroupWithTabs[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const { tabs, switchTab } = useBrowser()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const loadGroups = async () => {
      try {
        const groupsData = await window.topBarAPI.getAllGroupsWithTabs()
        setGroups(groupsData)
      } catch (error) {
        console.error('Failed to load groups:', error)
      }
    }

    if (isOpen) {
      loadGroups()
      // Expand topbar to full screen
      window.topBarAPI.expand()
    } else {
      // Collapse topbar
      window.topBarAPI.collapse()
    }
  }, [isOpen, tabs])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const getFavicon = (url: string) => {
    try {
      const domain = new URL(url).hostname
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
    } catch {
      return null
    }
  }

  const getColorClass = (color: string) => {
    const colorClasses: Record<string, string> = {
      blue: 'bg-blue-500 border-blue-500',
      red: 'bg-red-500 border-red-500',
      yellow: 'bg-yellow-500 border-yellow-500',
      green: 'bg-green-500 border-green-500',
      pink: 'bg-pink-500 border-pink-500',
      purple: 'bg-purple-500 border-purple-500',
      cyan: 'bg-cyan-500 border-cyan-500',
    }
    return colorClasses[color] || colorClasses.blue
  }

  const filteredGroups = groups.filter((group) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      group.name.toLowerCase().includes(query) ||
      group.tabs.some((tab) => tab.title.toLowerCase().includes(query) || tab.url.toLowerCase().includes(query))
    )
  })

  const ungroupedTabs = tabs.filter((tab) => !tab.groupId)
  const filteredUngroupedTabs = ungroupedTabs.filter((tab) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return tab.title.toLowerCase().includes(query) || tab.url.toLowerCase().includes(query)
  })

  const handleCloseDuplicateTabs = async () => {
    try {
      const closedCount = await window.topBarAPI.closeDuplicateTabs()
      if (closedCount > 0) {
        // Optionally show a toast or notification here
        console.log(`Closed ${closedCount} duplicate tabs`)
      }
    } catch (error) {
      console.error('Failed to close duplicate tabs:', error)
    }
  }

  const handleTabClick = (tabId: string) => {
    switchTab(tabId)
    setIsOpen(false)
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "p-2 rounded-md transition-colors app-region-no-drag",
          isOpen ? "bg-accent text-accent-foreground" : "hover:bg-muted dark:hover:bg-muted/50"
        )}
        title="List all tabs"
      >
        <ChevronDown className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[99999] bg-black/20 backdrop-blur-sm flex items-start justify-center pt-20 pointer-events-auto" onClick={() => setIsOpen(false)}>
          <div
            ref={menuRef}
            className="w-[600px] bg-background border border-border rounded-xl shadow-2xl max-h-[80vh] overflow-hidden flex flex-col dark:bg-secondary dark:border-gray-700 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-border dark:border-gray-700 flex items-center gap-3">
              <Search className="w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search tabs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 text-lg bg-transparent border-none focus:outline-none placeholder:text-muted-foreground/50"
                autoFocus
              />
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-muted rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-2">
              {/* Recent tab groups */}
              {filteredGroups.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-medium text-muted-foreground mb-2 px-4 uppercase tracking-wider">Tab Groups</div>
                  <div className="grid grid-cols-2 gap-2 px-2">
                    {filteredGroups.map((group) => (
                      <div key={group.id} className="bg-muted/30 rounded-lg p-3 border border-border/50 dark:border-gray-700/50">
                        <div className="flex items-center gap-2 mb-2">
                          <div className={cn('w-3 h-3 rounded-full', getColorClass(group.color).replace('border-', ''))} />
                          <span className="font-medium text-sm">{group.name}</span>
                          <span className="text-xs text-muted-foreground ml-auto">{group.tabs.length} tabs</span>
                        </div>
                        <div className="space-y-1">
                          {group.tabs.slice(0, 3).map((tab) => (
                            <div
                              key={tab.id}
                              onClick={() => handleTabClick(tab.id)}
                              className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted dark:hover:bg-muted/50 rounded cursor-pointer transition-colors group"
                            >
                              <Favicon src={getFavicon(tab.url)} className="w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity" />
                              <span className="text-xs truncate flex-1 text-muted-foreground group-hover:text-foreground transition-colors">{tab.title || 'New Tab'}</span>
                            </div>
                          ))}
                          {group.tabs.length > 3 && (
                            <div className="text-xs text-muted-foreground px-2 pt-1">
                              + {group.tabs.length - 3} more...
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Current window */}
              {filteredUngroupedTabs.length > 0 && (
                <div className="px-2">
                  <div className="text-xs font-medium text-muted-foreground mb-2 px-2 uppercase tracking-wider">Open Tabs</div>
                  <div className="space-y-1">
                    {filteredUngroupedTabs.map((tab) => (
                      <div
                        key={tab.id}
                        onClick={() => handleTabClick(tab.id)}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-muted dark:hover:bg-muted/50 rounded-lg cursor-pointer transition-colors group"
                      >
                        <Favicon src={getFavicon(tab.url)} className="w-5 h-5" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate group-hover:text-primary transition-colors">{tab.title || 'New Tab'}</div>
                          <div className="text-xs text-muted-foreground truncate">{tab.url}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {filteredGroups.length === 0 && filteredUngroupedTabs.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  <p>No tabs found matching "{searchQuery}"</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-2 border-t border-border dark:border-gray-700 bg-muted/20 flex justify-between items-center">
              <button
                onClick={handleCloseDuplicateTabs}
                className="text-xs px-3 py-1.5 hover:bg-muted rounded-md transition-colors text-muted-foreground hover:text-foreground"
              >
                Close duplicate tabs
              </button>
              <div className="text-xs text-muted-foreground px-3">
                {filteredGroups.length} groups, {filteredUngroupedTabs.length} tabs
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

