import React, { useState, useEffect } from 'react'
import { ArrowLeft, ArrowRight, RefreshCw, Loader2, PanelLeftClose, PanelLeft, Search, X } from 'lucide-react'
import { useBrowser } from '../contexts/BrowserContext'
import { ToolBarButton } from '../components/ToolBarButton'
import { Favicon } from '../components/Favicon'
import { DarkModeToggle } from '../components/DarkModeToggle'
import { cn } from '@common/lib/utils'
import { ProactiveSuggestions } from './ProactiveSuggestions'
import { TabGroupPills } from './TabGroupPills'

export const AddressBar: React.FC = () => {
    const { activeTab, navigateToUrl, goBack, goForward, reload, isLoading } = useBrowser()
    const [url, setUrl] = useState('')
    const [isEditing, setIsEditing] = useState(false)
    const [isFocused, setIsFocused] = useState(false)
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)

    // Update URL when active tab changes
    useEffect(() => {
        if (activeTab && !isEditing) {
            setUrl(activeTab.url || '')
        }
    }, [activeTab, isEditing])

    // Handle topbar expansion
    useEffect(() => {
        if (isFocused) {
            window.topBarAPI.expand()
        } else {
            window.topBarAPI.collapse()
        }
    }, [isFocused])

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!url.trim()) return

        let finalUrl = url.trim()

        // Add protocol if missing
        if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
            // Check if it looks like a domain
            if (finalUrl.includes('.') && !finalUrl.includes(' ')) {
                finalUrl = `https://${finalUrl}`
            } else {
                // Treat as search query
                finalUrl = `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}`
            }
        }

        navigateToUrl(finalUrl)
        setIsEditing(false)
        setIsFocused(false)
            ; (document.activeElement as HTMLElement)?.blur()
    }

    const handleFocus = () => {
        setIsEditing(true)
        setIsFocused(true)
    }

    const handleBlur = () => {
        setIsEditing(false)
        setIsFocused(false)
        // Reset to current tab URL if editing was cancelled
        if (activeTab) {
            setUrl(activeTab.url || '')
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            setIsEditing(false)
            setIsFocused(false)
            if (activeTab) {
                setUrl(activeTab.url || '')
            }
            ; (e.target as HTMLInputElement).blur()
        }
    }

    const canGoBack = activeTab !== null
    const canGoForward = activeTab !== null

    // Extract domain and title for display
    const getDomain = () => {
        if (!activeTab?.url) return ''
        try {
            const urlObj = new URL(activeTab.url)
            const hostname = urlObj.hostname
            // Return full hostname without www prefix, ensure it's not empty
            if (!hostname) {
                // Fallback: try to extract from URL string
                const match = activeTab.url.match(/https?:\/\/(?:www\.)?([^\/\s]+)/)
                return match ? match[1] : activeTab.url
            }
            return hostname.replace(/^www\./, '')
        } catch {
            // If URL parsing fails, try to extract domain from string
            const match = activeTab.url.match(/https?:\/\/(?:www\.)?([^\/\s]+)/)
            if (match && match[1]) {
                return match[1].replace(/^www\./, '')
            }
            return activeTab.url
        }
    }

    const getPath = () => {
        if (!activeTab?.url) return ''
        try {
            const urlObj = new URL(activeTab.url)
            return urlObj.pathname + urlObj.search + urlObj.hash
        } catch {
            return ''
        }
    }

    const getFavicon = () => {
        if (!activeTab?.url) return null
        try {
            const domain = new URL(activeTab.url).hostname
            return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
        } catch {
            return null
        }
    }

    const toggleSidebar = () => {
        setIsSidebarOpen(!isSidebarOpen)
        // Send IPC event to toggle sidebar
        if (window.topBarAPI) {
            window.topBarAPI.toggleSidebar()
        }
    }

    return (
        <>
            {/* Navigation Controls */}
            <div className="flex gap-1.5 app-region-no-drag">
                <ToolBarButton
                    Icon={ArrowLeft}
                    onClick={goBack}
                    active={canGoBack && !isLoading}
                />
                <ToolBarButton
                    Icon={ArrowRight}
                    onClick={goForward}
                    active={canGoForward && !isLoading}
                />
                <ToolBarButton
                    onClick={reload}
                    active={activeTab !== null && !isLoading}
                >
                    {isLoading ? (
                        <Loader2 className="size-4.5 animate-spin" />
                    ) : (
                        <RefreshCw className="size-4.5" />
                    )}
                </ToolBarButton>
            </div>

            {/* Address Bar */}
            {isFocused ? (
                // Expanded State
                <div className="fixed inset-0 z-[99999] bg-black/20 backdrop-blur-sm flex items-start justify-center pt-20 pointer-events-auto" onClick={handleBlur}>
                    <form
                        onSubmit={handleSubmit}
                        className="w-[600px] bg-background rounded-xl shadow-2xl p-2 dark:bg-secondary border border-border dark:border-gray-700 animate-in fade-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-2 px-2">
                            <Search className="w-5 h-5 text-muted-foreground" />
                            <input
                                type="text"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                onFocus={handleFocus}
                                onKeyDown={handleKeyDown}
                                className="flex-1 py-2 text-lg outline-none bg-transparent text-foreground placeholder:text-muted-foreground/50"
                                placeholder={activeTab ? "Enter URL or search term" : "No active tab"}
                                disabled={!activeTab}
                                spellCheck={false}
                                autoFocus
                            />
                            {url && (
                                <button
                                    type="button"
                                    onClick={() => setUrl('')}
                                    className="p-1 hover:bg-muted rounded-full transition-colors"
                                >
                                    <X className="w-4 h-4 text-muted-foreground" />
                                </button>
                            )}
                        </div>
                    </form>
                </div>
            ) : (
                // Collapsed State
                <div
                    onClick={handleFocus}
                    className={cn(
                        "flex-1 max-w-2xl mx-auto px-3 h-9 rounded-full cursor-text group/address-bar",
                        "bg-muted/50 hover:bg-muted text-muted-foreground app-region-no-drag",
                        "transition-all duration-200 border border-transparent hover:border-border/50",
                        "dark:bg-muted/20 dark:hover:bg-muted/40",
                        "flex items-center justify-center relative"
                    )}
                >
                    <div className="flex items-center gap-2 max-w-full overflow-hidden px-2">
                        {/* Favicon */}
                        <div className="size-4 flex-shrink-0 opacity-70 group-hover/address-bar:opacity-100 transition-opacity">
                            <Favicon src={getFavicon()} />
                        </div>

                        {/* URL Display */}
                        <div className="text-sm leading-normal truncate flex-1 text-center">
                            {activeTab ? (
                                <>
                                    <span className="text-foreground dark:text-foreground font-medium">{getDomain()}</span>
                                    <span className="group-hover/address-bar:hidden text-muted-foreground/60 ml-1">
                                        {activeTab.title && activeTab.title !== 'New Tab' && activeTab.title !== getDomain() && `— ${activeTab.title}`}
                                    </span>
                                    <span className="group-hover/address-bar:inline hidden text-muted-foreground/60 ml-0.5">
                                        {getPath()}
                                    </span>
                                </>
                            ) : (
                                <span className="text-muted-foreground">Search or enter address</span>
                            )}
                        </div>

                        {/* Lock icon or similar could go here */}
                    </div>
                </div>
            )}

            {/* Actions Menu */}
            <div className="flex items-center gap-1 app-region-no-drag">
                <TabGroupPills />
                <ProactiveSuggestions />
                <DarkModeToggle />
                <ToolBarButton
                    Icon={isSidebarOpen ? PanelLeftClose : PanelLeft}
                    onClick={toggleSidebar}
                    toggled={isSidebarOpen}
                />
            </div>
        </>
    )
}