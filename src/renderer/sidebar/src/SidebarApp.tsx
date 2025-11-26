import React, { useEffect } from 'react'
import { ChatProvider } from './contexts/ChatContext'
import { Chat } from './components/Chat'


import { useDarkMode } from '@common/hooks/useDarkMode'



const SidebarContent: React.FC = () => {
    const { isDarkMode } = useDarkMode()



    // Apply dark mode class to the document
    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark')
        } else {
            document.documentElement.classList.remove('dark')
        }
    }, [isDarkMode])

    return (
        <div className="h-screen flex flex-col bg-background border-l border-border">
            {/* Header with Toggle Buttons */}
            <div className="p-2 border-b border-border flex items-center justify-between">
                <div className="text-sm font-medium">AI Tab Management</div>

            </div>



            {/* Telemetry Dashboard */}


            {/* Chat */}
            <div className="flex-1 overflow-hidden">
                <Chat />
            </div>
        </div>
    )
}

export const SidebarApp: React.FC = () => {
    return (
        <ChatProvider>
            <SidebarContent />
        </ChatProvider>
    )
}

