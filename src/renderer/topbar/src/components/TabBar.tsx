import React, { useState, useRef, useEffect } from 'react'
import { Plus, X } from 'lucide-react'
import { useBrowser } from '../contexts/BrowserContext'
import { Favicon } from '../components/Favicon'
import { TabBarButton } from '../components/TabBarButton'
import { GroupContextMenu } from './GroupContextMenu'
import { CreateGroupDialog } from './CreateGroupDialog'
import { ListAllTabsMenu } from './ListAllTabsMenu'
import { cn } from '@common/lib/utils'

interface TabItemProps {
    id: string
    title: string
    favicon?: string | null
    isActive: boolean
    isPinned?: boolean
    groupId?: string
    groupName?: string
    groupColor?: string
    groupTabCount?: number
    groupCollapsed?: boolean
    isHiddenByCollapse?: boolean
    isFirstInGroup?: boolean
    isLastInGroup?: boolean
    containerId?: string
    containerName?: string
    containerColor?: string
    onClose: () => void
    onActivate: () => void
    onTogglePin: () => void
    onToggleGroupCollapse?: () => void
    onGroupContextMenu?: (e: React.MouseEvent) => void
    onDragStart: (e: React.DragEvent) => void
    onDragOver: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent) => void
    onDragEnd: () => void
    dragOver: boolean
    isDragging: boolean
}

const TabItem: React.FC<TabItemProps> = ({
    title,
    favicon,
    isActive,
    isPinned = false,
    groupId,
    groupName,
    groupColor = "blue",
    groupTabCount,
    groupCollapsed = false,
    isHiddenByCollapse = false,
    isFirstInGroup = false,
    containerId,
    containerName,
    containerColor,
    onClose,
    onActivate,
    onTogglePin,
    onToggleGroupCollapse,
    onGroupContextMenu,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    dragOver,
    isDragging
}) => {
    const isGrouped = !!groupId
    const [showPreview, setShowPreview] = useState(false)
    const previewRef = useRef<HTMLDivElement>(null)

    // Firefox-style: Color mapping for group backgrounds and underlines
    // Each color has distinct styling for tabs, labels, and underlines
    const groupColorClasses: Record<string, { bg: string; bgActive: string; border: string; text: string; labelBg: string; labelBorder: string }> = {
        blue: {
            bg: "bg-blue-500/20 dark:bg-blue-500/30",
            bgActive: "bg-blue-500/30 dark:bg-blue-500/40",
            border: "border-b-blue-500",
            text: "text-blue-900 dark:text-blue-100",
            labelBg: "bg-blue-500/10 dark:bg-blue-500/20",
            labelBorder: "border-blue-500"
        },
        red: {
            bg: "bg-red-500/20 dark:bg-red-500/30",
            bgActive: "bg-red-500/30 dark:bg-red-500/40",
            border: "border-b-red-500",
            text: "text-red-900 dark:text-red-100",
            labelBg: "bg-red-500/10 dark:bg-red-500/20",
            labelBorder: "border-red-500"
        },
        yellow: {
            bg: "bg-yellow-500/20 dark:bg-yellow-500/30",
            bgActive: "bg-yellow-500/30 dark:bg-yellow-500/40",
            border: "border-b-yellow-500",
            text: "text-yellow-900 dark:text-yellow-100",
            labelBg: "bg-yellow-500/10 dark:bg-yellow-500/20",
            labelBorder: "border-yellow-500"
        },
        green: {
            bg: "bg-green-500/20 dark:bg-green-500/30",
            bgActive: "bg-green-500/30 dark:bg-green-500/40",
            border: "border-b-green-500",
            text: "text-green-900 dark:text-green-100",
            labelBg: "bg-green-500/10 dark:bg-green-500/20",
            labelBorder: "border-green-500"
        },
        pink: {
            bg: "bg-pink-500/20 dark:bg-pink-500/30",
            bgActive: "bg-pink-500/30 dark:bg-pink-500/40",
            border: "border-b-pink-500",
            text: "text-pink-900 dark:text-pink-100",
            labelBg: "bg-pink-500/10 dark:bg-pink-500/20",
            labelBorder: "border-pink-500"
        },
        purple: {
            bg: "bg-purple-500/20 dark:bg-purple-500/30",
            bgActive: "bg-purple-500/30 dark:bg-purple-500/40",
            border: "border-b-purple-500",
            text: "text-purple-900 dark:text-purple-100",
            labelBg: "bg-purple-500/10 dark:bg-purple-500/20",
            labelBorder: "border-purple-500"
        },
        cyan: {
            bg: "bg-cyan-500/20 dark:bg-cyan-500/30",
            bgActive: "bg-cyan-500/30 dark:bg-cyan-500/40",
            border: "border-b-cyan-500",
            text: "text-cyan-900 dark:text-cyan-100",
            labelBg: "bg-cyan-500/10 dark:bg-cyan-500/20",
            labelBorder: "border-cyan-500"
        },
    }

    // Ensure we use the actual group color, not a default
    const actualGroupColor = groupColor || "blue"
    const groupColorScheme = groupColorClasses[actualGroupColor] || groupColorClasses.blue

    // Firefox-style: colored background for grouped tabs with underline
    const baseClassName = cn(
        "relative flex items-center h-8 pl-2 pr-1.5 select-none",
        "group/tab transition-all duration-200 cursor-pointer",
        "app-region-no-drag",
        isPinned ? "w-8 !px-0 justify-center rounded-md" : "rounded-t-md",
        // Firefox-style: colored background for grouped tabs
        isGrouped && !isPinned && !isActive && groupColorScheme.bg,
        isGrouped && !isPinned && isActive && groupColorScheme.bgActive,
        // Firefox-style: colored underline for grouped tabs
        isGrouped && !isPinned && "border-b-2",
        isGrouped && !isPinned && groupColorScheme.border,
        // Text color for grouped tabs
        isGrouped && !isPinned && groupColorScheme.text,
        // Active tab styling
        isActive && !isGrouped
            ? "bg-background shadow-sm dark:bg-secondary z-10 border-b-2 border-background text-primary"
            : !isGrouped && "bg-transparent hover:bg-muted/50 dark:hover:bg-muted/30 text-primary",
        dragOver && "ring-2 ring-primary ring-inset",
        isDragging && "opacity-50"
    )

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault()
        if (isGrouped && isFirstInGroup && onGroupContextMenu) {
            onGroupContextMenu(e)
        } else {
            // Simple context menu for individual tabs
            if (window.confirm(isPinned ? 'Unpin this tab?' : 'Pin this tab?')) {
                onTogglePin()
            }
        }
    }

    return (
        <div className={cn(
            "py-1 relative",
            isGrouped && !isPinned && "px-0",
            !isGrouped && "px-0.5"
        )}>
            {/* Firefox-style: Group label - shown as colored rectangle above first tab */}
            {isGrouped && isFirstInGroup && !isPinned && (
                <div
                    className={cn(
                        "absolute -top-5 left-0 text-[0.7rem] font-medium px-2 py-0.5 rounded-t z-10",
                        "text-foreground whitespace-nowrap cursor-pointer transition-all",
                        "hover:opacity-80 hover:shadow-sm",
                        groupColorScheme.labelBg,
                        groupColorScheme.labelBorder,
                        "border-t-2 border-l-2 border-r-2 border-b-0",
                        groupCollapsed && "rounded-b-md border-b-2"
                    )}
                    onClick={(e) => {
                        e.stopPropagation()
                        onToggleGroupCollapse?.()
                    }}
                    onContextMenu={onGroupContextMenu}
                    onMouseEnter={() => groupCollapsed && setShowPreview(true)}
                    onMouseLeave={(e) => {
                        if (!previewRef.current?.contains(e.relatedTarget as Node)) {
                            setShowPreview(false)
                        }
                    }}
                >
                    <span className="mr-1.5 text-[0.65rem]">{groupCollapsed ? '▶' : '▼'}</span>
                    <span>{groupName || 'Group'}</span>
                    <span className="ml-1.5 text-[0.65rem] text-muted-foreground">({groupTabCount})</span>
                </div>
            )}

            {/* Firefox-style: Hover preview for collapsed groups */}
            {isGrouped && isFirstInGroup && !isPinned && showPreview && groupCollapsed && (
                <div
                    className="absolute -top-5 left-0 z-20"
                    onMouseEnter={() => setShowPreview(true)}
                    onMouseLeave={() => setShowPreview(false)}
                >
                    <GroupPreview
                        groupId={groupId!}
                        groupName={groupName || 'Group'}
                        ref={previewRef}
                    />
                </div>
            )}

            {/* Firefox-style: Collapsed group rectangle (when all tabs are hidden) */}
            {isGrouped && isFirstInGroup && !isPinned && groupCollapsed && isHiddenByCollapse && (
                <div
                    className={cn(
                        "absolute -top-5 left-0 text-[0.7rem] font-medium px-2 py-0.5 rounded-md z-10",
                        "text-foreground whitespace-nowrap cursor-pointer transition-all",
                        "hover:opacity-80 hover:shadow-sm",
                        groupColorScheme.labelBg,
                        groupColorScheme.labelBorder,
                        "border-2"
                    )}
                    onClick={(e) => {
                        e.stopPropagation()
                        onToggleGroupCollapse?.()
                    }}
                    onContextMenu={onGroupContextMenu}
                    onMouseEnter={() => setShowPreview(true)}
                    onMouseLeave={(e) => {
                        if (!previewRef.current?.contains(e.relatedTarget as Node)) {
                            setShowPreview(false)
                        }
                    }}
                >
                    <span className="mr-1.5 text-[0.65rem]">▶</span>
                    <span>{groupName || 'Group'}</span>
                    <span className="ml-1.5 text-[0.65rem] text-muted-foreground">({groupTabCount})</span>
                </div>
            )}

            {/* Don't render tab if group is collapsed (except active tab) */}
            {isHiddenByCollapse ? null : (
                <div
                    className={baseClassName}
                    onClick={() => !isActive && onActivate()}
                    onContextMenu={handleContextMenu}
                    draggable={!isPinned}
                    onDragStart={onDragStart}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                    onDragEnd={onDragEnd}
                >
                    {/* Container indicator - colored dot/badge */}
                    {containerId && containerColor && (
                        <div
                            className={cn(
                                "flex-shrink-0 w-2 h-2 rounded-full mr-1.5",
                                containerColor === 'blue' && "bg-blue-500",
                                containerColor === 'red' && "bg-red-500",
                                containerColor === 'yellow' && "bg-yellow-500",
                                containerColor === 'green' && "bg-green-500",
                                containerColor === 'pink' && "bg-pink-500",
                                containerColor === 'purple' && "bg-purple-500",
                                containerColor === 'cyan' && "bg-cyan-500",
                                !containerColor && "bg-gray-500"
                            )}
                            title={containerName ? `Container: ${containerName}` : 'Container'}
                        />
                    )}

                    {/* Favicon */}
                    <div className={cn(!isPinned && "mr-2")}>
                        <Favicon src={favicon} />
                    </div>

                    {/* Title (hide for pinned tabs) */}
                    {!isPinned && (
                        <span className="text-xs truncate max-w-[200px] flex-1">
                            {title || 'New Tab'}
                        </span>
                    )}

                    {/* Close button (shows on hover) */}
                    {!isPinned && (
                        <div
                            onClick={(e) => {
                                e.stopPropagation()
                                onClose()
                            }}
                            className={cn(
                                "flex-shrink-0 p-1 rounded-md transition-opacity",
                                "hover:bg-muted dark:hover:bg-muted/50",
                                "opacity-0 group-hover/tab:opacity-100",
                                isActive && "opacity-100"
                            )}
                        >
                            <X className="size-3 text-primary dark:text-primary" />
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// Group preview component for hover
const GroupPreview = React.forwardRef<HTMLDivElement, { groupId: string; groupName: string }>(
    ({ groupId, groupName }, ref) => {
        const [tabs, setTabs] = useState<Array<{ id: string; title: string; url: string }>>([])
        const { switchTab } = useBrowser()

        useEffect(() => {
            const loadTabs = async () => {
                try {
                    const groups = await window.topBarAPI.getAllGroupsWithTabs()
                    const group = groups.find(g => g.id === groupId)
                    if (group) {
                        setTabs(group.tabs)
                    }
                } catch (error) {
                    console.error('Failed to load group tabs:', error)
                }
            }
            loadTabs()
        }, [groupId])

        const getFavicon = (url: string) => {
            try {
                const domain = new URL(url).hostname
                return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
            } catch {
                return null
            }
        }

        return (
            <div
                ref={ref}
                className="mt-6 w-72 bg-background border border-border rounded-lg shadow-xl p-3 dark:bg-secondary dark:border-gray-700"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="text-xs font-semibold mb-2 text-foreground/90">{groupName}</div>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                    {tabs.length === 0 ? (
                        <div className="text-xs text-muted-foreground p-2">No tabs in this group</div>
                    ) : (
                        tabs.map(tab => (
                            <div
                                key={tab.id}
                                onClick={() => switchTab(tab.id)}
                                className="flex items-center gap-2.5 p-1.5 hover:bg-muted dark:hover:bg-muted/50 rounded-md cursor-pointer transition-colors"
                            >
                                <Favicon src={getFavicon(tab.url)} />
                                <span className="text-xs truncate flex-1">{tab.title || 'New Tab'}</span>
                            </div>
                        ))
                    )}
                </div>
            </div>
        )
    }
)
GroupPreview.displayName = 'GroupPreview'

export const TabBar: React.FC = () => {
    const { tabs, createTab, closeTab, switchTab, togglePinTab } = useBrowser()
    const [draggedTabId, setDraggedTabId] = useState<string | null>(null)
    const [dragOverTabId, setDragOverTabId] = useState<string | null>(null)
    const [groupMenuState, setGroupMenuState] = useState<{
        groupId: string
        groupName: string
        position: { x: number; y: number }
    } | null>(null)
    const [createGroupDialog, setCreateGroupDialog] = useState<{
        tabIds: string[]
        position: { x: number; y: number }
    } | null>(null)

    const handleCreateTab = () => {
        createTab('https://www.google.com')
    }

    const handleToggleGroupCollapse = async (groupId: string) => {
        console.log('[TabBar] Calling toggleGroupCollapse for:', groupId)
        try {
            const result = await window.topBarAPI.toggleGroupCollapse(groupId)
            console.log('[TabBar] Toggle result:', result)
        } catch (error) {
            console.error('Failed to toggle group collapse:', error)
        }
    }

    const handleDragStart = (e: React.DragEvent, id: string, type: 'tab' | 'group') => {
        setDraggedTabId(id) // Reusing this state for both, could rename to draggedItemId
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', id)
        e.dataTransfer.setData('application/drag-type', type)
        e.dataTransfer.setData('application/drag-id', id)
    }

    const handleDragOver = (e: React.DragEvent, targetId: string, _type: 'tab' | 'group') => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'

        // Allow dropping tabs on tabs, groups on groups
        // Also allow dropping tabs on groups to add to group
        if (draggedTabId && draggedTabId !== targetId) {
            setDragOverTabId(targetId)
        }
    }

    const handleDrop = async (e: React.DragEvent, targetId: string, targetType: 'tab' | 'group', targetGroupId?: string) => {
        e.preventDefault()
        setDragOverTabId(null)

        const draggedId = e.dataTransfer.getData('application/drag-id')
        const draggedType = e.dataTransfer.getData('application/drag-type') as 'tab' | 'group'

        if (!draggedId || draggedId === targetId) return

        if (draggedType === 'group' && targetType === 'group') {
            // Reorder groups
            // We need to calculate the new index based on the target group's position
            // This requires knowing the index of the target group in the list of groups
            // For now, let's assume we can get the list of groups from tabs
            const groups = Array.from(new Set(tabs.map(t => t.groupId).filter(Boolean)))
            const targetIndex = groups.indexOf(targetId)
            if (targetIndex !== -1) {
                await window.topBarAPI.moveTabGroup(draggedId, targetIndex)
            }
        } else if (draggedType === 'tab') {
            if (targetType === 'group') {
                // Move tab to group
                await window.topBarAPI.moveTabToGroup(draggedId, targetId)
            } else if (targetType === 'tab') {
                // Get the dragged tab's current group
                const draggedTab = tabs.find(t => t.id === draggedId)
                const draggedTabGroupId = draggedTab?.groupId

                if (targetGroupId) {
                    // If target tab is in a group
                    if (draggedTabGroupId === targetGroupId) {
                        // Same group - reorder within group
                        const targetIndex = tabs.filter(t => t.groupId === targetGroupId).findIndex(t => t.id === targetId)
                        if (targetIndex !== -1) {
                            await window.topBarAPI.reorderTabInGroup(draggedId, targetIndex)
                        }
                    } else {
                        // Different group - move to target tab's group
                        await window.topBarAPI.moveTabToGroup(draggedId, targetGroupId)
                    }
                } else {
                    // Target tab is not in a group
                    if (draggedTabGroupId) {
                        // Dragged tab is in a group, target is not
                        // Remove from group (ungroup the dragged tab)
                        await window.topBarAPI.moveTabToGroup(draggedId, null)
                    } else {
                        // Both ungrouped - create new group
                        setCreateGroupDialog({
                            tabIds: [draggedId, targetId],
                            position: { x: e.clientX, y: e.clientY }
                        })
                    }
                }
            }
        }
    }

    const handleDragEnd = () => {
        setDraggedTabId(null)
        setDragOverTabId(null)
    }

    const handleGroupContextMenu = (e: React.MouseEvent, groupId: string, groupName: string) => {
        e.preventDefault()
        e.stopPropagation()
        setGroupMenuState({
            groupId,
            groupName,
            position: { x: e.clientX, y: e.clientY }
        })
    }

    const handleCreateTabInGroup = async (groupId: string) => {
        try {
            await window.topBarAPI.createTabInGroup(undefined, groupId)
        } catch (error) {
            console.error('Failed to create tab in group:', error)
        }
    }

    const handleSaveAndCloseGroup = async (groupId: string) => {
        try {
            await window.topBarAPI.saveAndCloseGroup(groupId)
        } catch (error) {
            console.error('Failed to save and close group:', error)
        }
    }

    const handleUngroupTabs = async (groupId: string) => {
        try {
            await window.topBarAPI.ungroupTabs(groupId)
        } catch (error) {
            console.error('Failed to ungroup tabs:', error)
        }
    }

    const handleDeleteGroup = async (groupId: string) => {
        try {
            await window.topBarAPI.deleteGroup(groupId)
        } catch (error) {
            console.error('Failed to delete group:', error)
        }
    }

    const suggestTabsToAdd = async (): Promise<string[]> => {
        if (!createGroupDialog) return []

        try {
            // Use AI-powered tab grouping suggestions
            const result = await window.topBarAPI.suggestTabsForGrouping(
                createGroupDialog.tabIds,
                tabs.filter(t => t.groupId).map(t => t.id) // Exclude already grouped tabs
            )

            // If AI suggests a group name, update the dialog
            if (result.groupName && createGroupDialog) {
                // Note: We can't directly update the dialog state here,
                // but the parent component can handle this
                console.log('AI suggested group name:', result.groupName)
            }

            return result.suggestedTabIds || []
        } catch (error) {
            console.error('Failed to get AI suggestions, using fallback:', error)
            // Fallback to simple domain-based heuristic
            const currentTabUrls = createGroupDialog.tabIds
                .map(id => tabs.find(t => t.id === id)?.url)
                .filter(Boolean) as string[]

            const currentDomains = currentTabUrls.map(url => {
                try {
                    return new URL(url).hostname.replace(/^www\./, '')
                } catch {
                    return null
                }
            }).filter(Boolean) as string[]

            const suggestedTabIds = tabs
                .filter(tab => {
                    if (createGroupDialog.tabIds.includes(tab.id)) return false
                    if (tab.groupId) return false
                    try {
                        const domain = new URL(tab.url).hostname.replace(/^www\./, '')
                        return currentDomains.includes(domain)
                    } catch {
                        return false
                    }
                })
                .map(tab => tab.id)

            return suggestedTabIds
        }
    }

    // Auto-assign unique colors to groups
    const getNextAvailableColor = (): string => {
        const existingGroups = tabs
            .filter(t => t.groupId)
            .map(t => t.groupColor)
            .filter(Boolean) as string[]

        const allColors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan']

        // Find the first color that's not heavily used
        for (const color of allColors) {
            const usageCount = existingGroups.filter(c => c === color).length
            if (usageCount === 0) {
                return color
            }
        }

        // If all colors are used, return the least used one
        const colorUsage = allColors.map(color => ({
            color,
            count: existingGroups.filter(c => c === color).length
        }))
        colorUsage.sort((a, b) => a.count - b.count)
        return colorUsage[0].color
    }

    const handleCreateGroup = async (name: string, color: string) => {
        if (!createGroupDialog) return
        try {
            // Get suggested tabs if available
            const suggestedTabIds = await suggestTabsToAdd()
            const allTabIds = suggestedTabIds.length > 0
                ? [...new Set([...createGroupDialog.tabIds, ...suggestedTabIds])]
                : createGroupDialog.tabIds

            // Use provided color or auto-assign a unique one
            const groupColor = color || getNextAvailableColor()

            await window.topBarAPI.createGroup({
                tabIds: allTabIds,
                groupName: name,
                color: groupColor as any
            })
            setCreateGroupDialog(null)
        } catch (error) {
            console.error('Failed to create group:', error)
        }
    }

    // Extract favicon from URL (simplified - you might want to improve this)
    const getFavicon = (url: string) => {
        try {
            const domain = new URL(url).hostname
            return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
        } catch {
            return null
        }
    }

    return (
        <>
            <div className="flex-1 overflow-x-hidden flex items-center">
                {/* macOS traffic lights spacing */}
                <div className="pl-20" />

                {/* Tabs */}
                <div className="flex-1 overflow-x-auto flex relative pt-1 pb-1 items-end">
                    {tabs.map((tab, index) => {
                        const isGrouped = !!tab.groupId
                        const prevTab = index > 0 ? tabs[index - 1] : null
                        const isFirstInGroup = isGrouped && (!prevTab || prevTab.groupId !== tab.groupId)

                        // Chrome-style: Group Header rendered inline
                        const groupHeader = isFirstInGroup ? (
                            <div
                                key={`group-${tab.groupId}`}
                                className={cn(
                                    "flex items-center px-2 h-6 mr-1 rounded-md cursor-pointer transition-all select-none flex-shrink-0",
                                    "hover:opacity-80 hover:shadow-sm",
                                    // Use group colors
                                    tab.groupColor === 'blue' && "bg-blue-100 text-blue-700 border border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700",
                                    tab.groupColor === 'red' && "bg-red-100 text-red-700 border border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700",
                                    tab.groupColor === 'yellow' && "bg-yellow-100 text-yellow-700 border border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700",
                                    tab.groupColor === 'green' && "bg-green-100 text-green-700 border border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700",
                                    tab.groupColor === 'pink' && "bg-pink-100 text-pink-700 border border-pink-300 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-700",
                                    tab.groupColor === 'purple' && "bg-purple-100 text-purple-700 border border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700",
                                    tab.groupColor === 'cyan' && "bg-cyan-100 text-cyan-700 border border-cyan-300 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-700",
                                    !tab.groupColor && "bg-gray-100 text-gray-700 border border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600",
                                    dragOverTabId === tab.groupId && "ring-2 ring-primary ring-inset"
                                )}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    console.log('Toggling group collapse:', tab.groupId, 'Current collapsed:', tab.groupCollapsed)
                                    handleToggleGroupCollapse(tab.groupId!)
                                }}
                                onContextMenu={(e) => handleGroupContextMenu(e, tab.groupId!, tab.groupName || 'Group')}
                                draggable
                                onDragStart={(e) => handleDragStart(e, tab.groupId!, 'group')}
                                onDragOver={(e) => handleDragOver(e, tab.groupId!, 'group')}
                                onDrop={(e) => handleDrop(e, tab.groupId!, 'group')}
                                onDragEnd={handleDragEnd}
                            >
                                <span className={cn("w-2 h-2 rounded-full mr-1.5",
                                    tab.groupColor === 'blue' && "bg-blue-500",
                                    tab.groupColor === 'red' && "bg-red-500",
                                    tab.groupColor === 'yellow' && "bg-yellow-500",
                                    tab.groupColor === 'green' && "bg-green-500",
                                    tab.groupColor === 'pink' && "bg-pink-500",
                                    tab.groupColor === 'purple' && "bg-purple-500",
                                    tab.groupColor === 'cyan' && "bg-cyan-500",
                                    !tab.groupColor && "bg-gray-500"
                                )} />
                                <span className="text-xs font-medium max-w-[100px] truncate">{tab.groupName || 'Group'}</span>
                            </div>
                        ) : null

                        // If group is collapsed, hide all tabs in the group
                        // Only show the group header for the first tab
                        if (tab.groupId && tab.groupCollapsed) {
                            return isFirstInGroup ? groupHeader : null
                        }

                        return (
                            <React.Fragment key={tab.id}>
                                {groupHeader}
                                <TabItem
                                    id={tab.id}
                                    title={tab.title}
                                    favicon={getFavicon(tab.url)}
                                    isActive={tab.isActive}
                                    isPinned={tab.isPinned}
                                    groupId={tab.groupId}
                                    groupName={tab.groupName}
                                    groupColor={tab.groupColor}
                                    groupTabCount={tab.groupTabCount}
                                    groupCollapsed={tab.groupCollapsed}
                                    isHiddenByCollapse={tab.isHiddenByCollapse}
                                    isFirstInGroup={isFirstInGroup}
                                    isLastInGroup={isGrouped && (!tabs[index + 1] || tabs[index + 1].groupId !== tab.groupId)}
                                    containerId={tab.containerId}
                                    containerName={tab.containerName}
                                    containerColor={tab.containerColor}
                                    onClose={() => closeTab(tab.id)}
                                    onActivate={() => switchTab(tab.id)}
                                    onTogglePin={() => togglePinTab(tab.id)}
                                    onToggleGroupCollapse={tab.groupId ? () => handleToggleGroupCollapse(tab.groupId!) : undefined}
                                    onGroupContextMenu={tab.groupId && isFirstInGroup ? (e) => handleGroupContextMenu(e, tab.groupId!, tab.groupName || 'Group') : undefined}
                                    onDragStart={(e) => handleDragStart(e, tab.id, 'tab')}
                                    onDragOver={(e) => handleDragOver(e, tab.id, 'tab')}
                                    onDrop={(e) => handleDrop(e, tab.id, 'tab', tab.groupId)}
                                    onDragEnd={handleDragEnd}
                                    dragOver={dragOverTabId === tab.id}
                                    isDragging={draggedTabId === tab.id}
                                />
                            </React.Fragment>
                        )
                    })}
                </div>

                {/* List All Tabs Menu */}
                <div className="pl-1">
                    <ListAllTabsMenu />
                </div>

                {/* Add Tab Button */}
                <div className="pl-1 pr-2">
                    <TabBarButton
                        Icon={Plus}
                        onClick={handleCreateTab}
                    />
                </div>
            </div>

            {/* Group Context Menu */}
            {groupMenuState && (
                <GroupContextMenu
                    groupId={groupMenuState.groupId}
                    groupName={groupMenuState.groupName}
                    position={groupMenuState.position}
                    onClose={() => setGroupMenuState(null)}
                    onCreateTabInGroup={() => handleCreateTabInGroup(groupMenuState.groupId)}
                    onMoveToNewWindow={() => {
                        // TODO: Implement move to new window
                        console.log('Move to new window')
                    }}
                    onSaveAndClose={() => handleSaveAndCloseGroup(groupMenuState.groupId)}
                    onUngroup={() => handleUngroupTabs(groupMenuState.groupId)}
                    onDelete={() => handleDeleteGroup(groupMenuState.groupId)}
                />
            )}

            {/* Create Group Dialog */}
            {createGroupDialog && (
                <CreateGroupDialog
                    tabIds={createGroupDialog.tabIds}
                    position={createGroupDialog.position}
                    onClose={() => setCreateGroupDialog(null)}
                    onCreate={handleCreateGroup}
                    onSuggestTabs={suggestTabsToAdd}
                />
            )}
        </>
    )
}
