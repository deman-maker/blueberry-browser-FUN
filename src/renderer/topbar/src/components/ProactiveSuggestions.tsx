import React, { useMemo } from 'react'
import { Sparkles, Layers, Pin, FolderInput, Archive } from 'lucide-react'
import { useBrowser } from '../contexts/BrowserContext'
import { cn } from '@common/lib/utils'

interface Suggestion {
    type: 'duplicates' | 'grouping' | 'organize-domain' | 'pin-tabs' | 'move-workspace' | 'archive-group'
    count: number
    label: string
    icon: React.ComponentType<{ className?: string }>
    action: () => Promise<void>
    priority: number
}

export const ProactiveSuggestions: React.FC = () => {
    const { tabs, groups, workspaces, activeWorkspace } = useBrowser()

    const suggestions = useMemo(() => {
        const allSuggestions: Suggestion[] = []

        // 1. Check for duplicates (highest priority)
        const urlCounts = new Map<string, number>()
        let duplicateCount = 0

        tabs.forEach(tab => {
            if (tab.url && tab.url !== 'about:blank') {
                const count = urlCounts.get(tab.url) || 0
                urlCounts.set(tab.url, count + 1)
                if (count >= 1) {
                    duplicateCount++
                }
            }
        })

        if (duplicateCount > 0) {
            allSuggestions.push({
                type: 'duplicates',
                count: duplicateCount,
                label: `Close ${duplicateCount} duplicate${duplicateCount > 1 ? 's' : ''}`,
                icon: Sparkles,
                priority: 10,
                action: async () => {
                    try {
                        await window.topBarAPI.closeDuplicateTabs()
                    } catch (error) {
                        console.error('Failed to close duplicate tabs:', error)
                    }
                }
            })
        }

        // 2. Check for ungrouped tabs
        const ungroupedTabs = tabs.filter(tab => !tab.groupId && !tab.isPinned && tab.url !== 'about:blank')
        if (ungroupedTabs.length > 5) {
            allSuggestions.push({
                type: 'grouping',
                count: ungroupedTabs.length,
                label: `Group ${ungroupedTabs.length} tabs`,
                icon: Layers,
                priority: 8,
                action: async () => {
                    try {
                        await window.topBarAPI.autoGroupTabs()
                    } catch (error) {
                        console.error('Failed to auto-group tabs:', error)
                    }
                }
            })
        }

        // 3. Check for scattered domain tabs (organize by domain)
        const domainMap = new Map<string, number>()
        tabs.forEach(tab => {
            if (tab.url && tab.url !== 'about:blank') {
                try {
                    const url = new URL(tab.url)
                    const domain = url.hostname.replace(/^www\./, '')
                    domainMap.set(domain, (domainMap.get(domain) || 0) + 1)
                } catch {
                    // Invalid URL
                }
            }
        })

        const scatteredDomains = Array.from(domainMap.entries()).filter(([_, count]) => count >= 3)
        if (scatteredDomains.length >= 2 && ungroupedTabs.length > 0) {
            allSuggestions.push({
                type: 'organize-domain',
                count: scatteredDomains.length,
                label: `Organize by domain`,
                icon: Layers,
                priority: 7,
                action: async () => {
                    try {
                        await window.topBarAPI.organizeTabsByDomain()
                    } catch (error) {
                        console.error('Failed to organize tabs by domain:', error)
                    }
                }
            })
        }

        // 4. Check for frequently visited tabs to pin
        // Simple heuristic: tabs that have been open for a while and are commonly used domains
        const commonDomains = ['gmail.com', 'calendar.google.com', 'outlook.com', 'slack.com', 'notion.so']
        const unpinnedCommonTabs = tabs.filter(tab => {
            if (tab.isPinned || !tab.url) return false
            try {
                const url = new URL(tab.url)
                const domain = url.hostname.replace(/^www\./, '')
                return commonDomains.some(common => domain.includes(common))
            } catch {
                return false
            }
        })

        if (unpinnedCommonTabs.length > 0) {
            allSuggestions.push({
                type: 'pin-tabs',
                count: unpinnedCommonTabs.length,
                label: `Pin ${unpinnedCommonTabs.length} common tab${unpinnedCommonTabs.length > 1 ? 's' : ''}`,
                icon: Pin,
                priority: 5,
                action: async () => {
                    try {
                        await window.topBarAPI.pinTabs({
                            tabIds: unpinnedCommonTabs.map(t => t.id),
                            action: 'pin'
                        })
                    } catch (error) {
                        console.error('Failed to pin tabs:', error)
                    }
                }
            })
        }

        // 5. Check for tabs that could be moved to a different workspace
        // Only suggest if there are multiple workspaces
        if (workspaces && workspaces.length > 1 && activeWorkspace) {
            // Look for social media tabs in non-personal workspace
            const socialDomains = ['facebook.com', 'twitter.com', 'instagram.com', 'reddit.com', 'linkedin.com']
            const socialTabs = tabs.filter(tab => {
                if (!tab.url) return false
                try {
                    const url = new URL(tab.url)
                    const domain = url.hostname.replace(/^www\./, '')
                    return socialDomains.some(social => domain.includes(social))
                } catch {
                    return false
                }
            })

            const personalWorkspace = workspaces.find(ws => ws.name.toLowerCase().includes('personal'))
            if (socialTabs.length >= 2 && personalWorkspace && activeWorkspace.id !== personalWorkspace.id) {
                allSuggestions.push({
                    type: 'move-workspace',
                    count: socialTabs.length,
                    label: `Move ${socialTabs.length} social tab${socialTabs.length > 1 ? 's' : ''} to Personal`,
                    icon: FolderInput,
                    priority: 4,
                    action: async () => {
                        try {
                            await window.topBarAPI.moveTabsToWorkspace(personalWorkspace.id, {
                                tabIds: socialTabs.map(t => t.id)
                            })
                        } catch (error) {
                            console.error('Failed to move tabs to workspace:', error)
                        }
                    }
                })
            }
        }

        // 6. Check for inactive groups to archive
        // Simple heuristic: groups with no active tab
        if (groups && groups.length > 0) {
            const activeTabId = tabs.find(t => t.isActive)?.id
            const inactiveGroups = groups.filter(group => {
                return !group.tabIds?.includes(activeTabId || '')
            })

            if (inactiveGroups.length > 0) {
                const groupToArchive = inactiveGroups[0]
                allSuggestions.push({
                    type: 'archive-group',
                    count: 1,
                    label: `Archive "${groupToArchive.name}"`,
                    icon: Archive,
                    priority: 2,
                    action: async () => {
                        try {
                            await window.topBarAPI.saveAndCloseGroup(groupToArchive.id)
                        } catch (error) {
                            console.error('Failed to archive group:', error)
                        }
                    }
                })
            }
        }

        // Sort by priority (highest first) and return the top suggestion
        allSuggestions.sort((a, b) => b.priority - a.priority)

        // Debug logging
        console.log('[ProactiveSuggestions] All suggestions:', allSuggestions.map(s => ({ type: s.type, priority: s.priority, label: s.label })))
        console.log('[ProactiveSuggestions] Context:', {
            tabsCount: tabs.length,
            groupsCount: groups?.length || 0,
            workspacesCount: workspaces?.length || 0,
            activeWorkspace: activeWorkspace?.name
        })

        return allSuggestions[0] || null
    }, [tabs, groups, workspaces, activeWorkspace])

    if (!suggestions) return null

    const Icon = suggestions.icon

    return (
        <button
            onClick={suggestions.action}
            className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300",
                "bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20 dark:bg-indigo-500/20 dark:text-indigo-300 dark:hover:bg-indigo-500/30",
                "border border-indigo-200 dark:border-indigo-800",
                "animate-in fade-in slide-in-from-top-1 app-region-no-drag"
            )}
            title={suggestions.label}
        >
            <Icon className="w-3.5 h-3.5" />
            <span>{suggestions.label}</span>
        </button>
    )
}
