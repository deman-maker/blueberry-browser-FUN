import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'

interface TabInfo {
    id: string
    title: string
    url: string
    isActive: boolean
    isPinned?: boolean
    groupId?: string
    groupName?: string
    groupColor?: string
    groupTabCount?: number
    groupCollapsed?: boolean
    isHiddenByCollapse?: boolean
    containerId?: string
    containerName?: string
    containerColor?: string
}

interface TabGroup {
    id: string
    name: string
    color?: string
    tabIds?: string[]
    collapsed?: boolean
}

interface Workspace {
    id: string
    name: string
    icon?: string
    color?: string
    tabCount: number
    defaultContainerId?: string
}

interface BrowserContextType {
    tabs: TabInfo[]
    activeTab: TabInfo | null
    isLoading: boolean
    groups: TabGroup[]
    workspaces: Workspace[]
    activeWorkspace: Workspace | null

    // Tab management
    createTab: (url?: string) => Promise<void>
    closeTab: (tabId: string) => Promise<void>
    switchTab: (tabId: string) => Promise<void>
    togglePinTab: (tabId: string) => Promise<void>
    refreshTabs: () => Promise<void>

    // Navigation
    navigateToUrl: (url: string) => Promise<void>
    goBack: () => Promise<void>
    goForward: () => Promise<void>
    reload: () => Promise<void>

    // Tab actions
    takeScreenshot: (tabId: string) => Promise<string | null>
    runJavaScript: (tabId: string, code: string) => Promise<any>
}

const BrowserContext = createContext<BrowserContextType | null>(null)

export const useBrowser = () => {
    const context = useContext(BrowserContext)
    if (!context) {
        throw new Error('useBrowser must be used within a BrowserProvider')
    }
    return context
}

export const BrowserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [tabs, setTabs] = useState<TabInfo[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [groups, setGroups] = useState<TabGroup[]>([])
    const [workspaces, setWorkspaces] = useState<Workspace[]>([])
    const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null)

    const activeTab = tabs.find(tab => tab.isActive) || null

    const refreshTabs = useCallback(async () => {
        try {
            const tabsData = await window.topBarAPI.getTabs()
            setTabs(tabsData)
        } catch (error) {
            console.error('Failed to refresh tabs:', error)
        }
    }, [])

    const refreshGroups = useCallback(async () => {
        try {
            const groupsData = await window.topBarAPI.getTabGroups()
            setGroups(groupsData)
        } catch (error) {
            console.error('Failed to refresh groups:', error)
        }
    }, [])

    const refreshWorkspaces = useCallback(async () => {
        try {
            const workspacesData = await window.topBarAPI.getWorkspaces()
            setWorkspaces(workspacesData)
            const activeWs = await window.topBarAPI.getActiveWorkspace()
            setActiveWorkspace(activeWs)
        } catch (error) {
            console.error('Failed to refresh workspaces:', error)
        }
    }, [])

    const createTab = useCallback(async (url?: string) => {
        setIsLoading(true)
        try {
            await window.topBarAPI.createTab(url)
            // Tab updates will be handled by the tabs-updated event listener
        } catch (error) {
            console.error('Failed to create tab:', error)
            setIsLoading(false)
        }
    }, [])

    const closeTab = useCallback(async (tabId: string) => {
        setIsLoading(true)
        try {
            await window.topBarAPI.closeTab(tabId)
            // Tab updates will be handled by the tabs-updated event listener
        } catch (error) {
            console.error('Failed to close tab:', error)
            setIsLoading(false)
        }
    }, [])

    const switchTab = useCallback(async (tabId: string) => {
        setIsLoading(true)
        try {
            await window.topBarAPI.switchTab(tabId)
            // Tab updates will be handled by the tabs-updated event listener
        } catch (error) {
            console.error('Failed to switch tab:', error)
            setIsLoading(false)
        }
    }, [])

    const togglePinTab = useCallback(async (tabId: string) => {
        try {
            await window.topBarAPI.togglePinTab(tabId)
            // Tab updates will be handled by the tabs-updated event listener
        } catch (error) {
            console.error('Failed to toggle pin tab:', error)
        }
    }, [])

    const navigateToUrl = useCallback(async (url: string) => {
        if (!activeTab) return

        setIsLoading(true)
        try {
            await window.topBarAPI.navigateTab(activeTab.id, url)
            // Wait a bit for navigation to start, then refresh tabs to get updated URL
            setTimeout(() => refreshTabs(), 500)
        } catch (error) {
            console.error('Failed to navigate:', error)
        } finally {
            setIsLoading(false)
        }
    }, [activeTab, refreshTabs])

    const goBack = useCallback(async () => {
        if (!activeTab) return

        try {
            await window.topBarAPI.goBack(activeTab.id)
            setTimeout(() => refreshTabs(), 500)
        } catch (error) {
            console.error('Failed to go back:', error)
        }
    }, [activeTab, refreshTabs])

    const goForward = useCallback(async () => {
        if (!activeTab) return

        try {
            await window.topBarAPI.goForward(activeTab.id)
            setTimeout(() => refreshTabs(), 500)
        } catch (error) {
            console.error('Failed to go forward:', error)
        }
    }, [activeTab, refreshTabs])

    const reload = useCallback(async () => {
        if (!activeTab) return

        try {
            await window.topBarAPI.reload(activeTab.id)
            setTimeout(() => refreshTabs(), 500)
        } catch (error) {
            console.error('Failed to reload:', error)
        }
    }, [activeTab, refreshTabs])

    const takeScreenshot = useCallback(async (tabId: string) => {
        try {
            return await window.topBarAPI.tabScreenshot(tabId)
        } catch (error) {
            console.error('Failed to take screenshot:', error)
            return null
        }
    }, [])

    const runJavaScript = useCallback(async (tabId: string, code: string) => {
        try {
            return await window.topBarAPI.tabRunJs(tabId, code)
        } catch (error) {
            console.error('Failed to run JavaScript:', error)
            return null
        }
    }, [])

    // Initialize tabs, groups, and workspaces on mount
    useEffect(() => {
        refreshTabs()
        refreshGroups()
        refreshWorkspaces()
    }, [refreshTabs, refreshGroups, refreshWorkspaces])

    // Listen for tab update events from main process
    useEffect(() => {
        const handleTabsUpdated = (data: any) => {
            // Check if data is the new format { tabs, groups } or old format [tabs]
            if (data.tabs && data.groups) {
                setTabs(data.tabs)
                setGroups(data.groups)
            } else if (Array.isArray(data)) {
                // Fallback for old format (shouldn't happen after restart, but good for safety)
                setTabs(data)
                refreshGroups()
            }
            setIsLoading(false)
        }

        window.topBarAPI.onTabsUpdated(handleTabsUpdated)

        return () => {
            window.topBarAPI.removeTabsUpdatedListener()
        }
    }, [refreshGroups])

    // Listen for workspace update events
    useEffect(() => {
        const handleWorkspacesUpdated = (data: { workspaces: Workspace[]; activeWorkspace: Workspace | null }) => {
            setWorkspaces(data.workspaces)
            setActiveWorkspace(data.activeWorkspace)
        }

        window.topBarAPI.onWorkspacesUpdated(handleWorkspacesUpdated)

        return () => {
            window.topBarAPI.removeWorkspacesUpdatedListener()
        }
    }, [])

    // Periodic refresh to keep tabs in sync (fallback, but events should handle most updates)
    // Reduced frequency since events handle most updates
    useEffect(() => {
        const interval = setInterval(refreshTabs, 10000) // Refresh every 10 seconds as fallback
        return () => clearInterval(interval)
    }, [refreshTabs])

    const value: BrowserContextType = {
        tabs,
        activeTab,
        isLoading,
        groups,
        workspaces,
        activeWorkspace,
        createTab,
        closeTab,
        switchTab,
        togglePinTab,
        refreshTabs,
        navigateToUrl,
        goBack,
        goForward,
        reload,
        takeScreenshot,
        runJavaScript
    }

    return (
        <BrowserContext.Provider value={value}>
            {children}
        </BrowserContext.Provider>
    )
}

