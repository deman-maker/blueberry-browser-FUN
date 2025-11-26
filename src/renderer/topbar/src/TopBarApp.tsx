import React, { useState, useEffect } from 'react'
import { BrowserProvider } from './contexts/BrowserContext'
import { TabBar } from './components/TabBar'
import { AddressBar } from './components/AddressBar'
import { CommandPalette } from './components/CommandPalette'
import { WorkspaceSwitcher } from './components/WorkspaceSwitcher'

export const TopBarApp: React.FC = () => {
    const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)

    // Handle keyboard shortcut (Ctrl+/ or Cmd+/)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Check for Ctrl+/ (Windows/Linux) or Cmd+/ (Mac)
            if ((e.ctrlKey || e.metaKey) && e.key === '/') {
                e.preventDefault()
                setIsCommandPaletteOpen((prev) => !prev)
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [])

    // Listen for IPC message from menu to open command palette
    useEffect(() => {
        const handleOpenCommandPalette = () => {
            setIsCommandPaletteOpen(true)
        }

        // Listen for the IPC message
        if (window.electron?.ipcRenderer) {
            window.electron.ipcRenderer.on('open-command-palette', handleOpenCommandPalette)
        }

        return () => {
            if (window.electron?.ipcRenderer) {
                window.electron.ipcRenderer.removeListener('open-command-palette', handleOpenCommandPalette)
            }
        }
    }, [])

    return (
        <BrowserProvider>
            <div className="flex flex-col h-screen w-screen pointer-events-none">
                {/* Top Bar Strip - Enable pointer events */}
                <div className="flex flex-col bg-background select-none pointer-events-auto shadow-md z-50">
                    {/* Tab Bar */}
                    <div className="w-full h-10 pr-2 flex items-center gap-2 app-region-drag bg-muted dark:bg-muted/80 backdrop-blur-md border-b border-border/50">
                        <div className="pl-2 app-region-no-drag">
                            <WorkspaceSwitcher />
                        </div>
                        <TabBar />
                    </div>

                    {/* Toolbar */}
                    <div className="flex items-center px-2 py-1.5 gap-2 app-region-drag bg-background/95 backdrop-blur-sm z-10">
                        <AddressBar />
                    </div>
                </div>

                {/* Command Palette - Enable pointer events when open */}
                <div className="pointer-events-auto">
                    <CommandPalette
                        isOpen={isCommandPaletteOpen}
                        onClose={() => setIsCommandPaletteOpen(false)}
                    />
                </div>
            </div>
        </BrowserProvider>
    )
}

