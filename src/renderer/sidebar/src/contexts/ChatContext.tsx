import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'

interface RoutingInfo {
    route: 'pattern' | 't5' | 'slm' | 'gemini' | 'fallback' | 'direct_llm'
    latency: number
    confidence: number
    model?: string
    reasoning?: string
}

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: number
    isStreaming?: boolean
    routingInfo?: RoutingInfo
}

interface ChatContextType {
    messages: Message[]
    isLoading: boolean

    // Chat actions
    sendMessage: (content: string) => Promise<void>
    clearChat: () => void
    setInputValue: (value: string) => void // Set chat input value from outside

    // Page content access
    getPageContent: () => Promise<string | null>
    getPageText: () => Promise<string | null>
    getCurrentUrl: () => Promise<string | null>
}

const ChatContext = createContext<ChatContextType | null>(null)

export const useChat = () => {
    const context = useContext(ChatContext)
    if (!context) {
        throw new Error('useChat must be used within a ChatProvider')
    }
    return context
}

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [messages, setMessages] = useState<Message[]>([])
    const [isLoading, setIsLoading] = useState(false)

    // Load initial messages from main process
    useEffect(() => {
        const loadMessages = async () => {
            try {
                const storedMessages = await window.sidebarAPI.getMessages()
                if (storedMessages && storedMessages.length > 0) {
                    // Convert CoreMessage format to our frontend Message format
                    const convertedMessages = storedMessages.map((msg: any, index: number) => ({
                        id: `msg-${index}`,
                        role: msg.role,
                        content: typeof msg.content === 'string' 
                            ? msg.content 
                            : msg.content.find((p: any) => p.type === 'text')?.text || '',
                        timestamp: Date.now(),
                        isStreaming: false
                    }))
                    setMessages(convertedMessages)
                }
            } catch (error) {
                console.error('Failed to load messages:', error)
            }
        }
        loadMessages()
    }, [])

    const sendMessage = useCallback(async (content: string) => {
        setIsLoading(true)

        try {
            const messageId = Date.now().toString()

            // Add user message immediately
            const userMessage: Message = {
                id: messageId,
                role: 'user',
                content: content,
                timestamp: Date.now(),
                isStreaming: false
            }
            setMessages(prev => [...prev, userMessage])

            // Add placeholder assistant message for streaming
            const assistantMessageId = `${messageId}-assistant`
            const assistantMessage: Message = {
                id: assistantMessageId,
                role: 'assistant',
                content: '',
                timestamp: Date.now(),
                isStreaming: true
            }
            setMessages(prev => [...prev, assistantMessage])

            // Send message to main process (which will handle context)
            await window.sidebarAPI.sendChatMessage({
                message: content,
                messageId: messageId
            })
        } catch (error) {
            console.error('Failed to send message:', error)
            setIsLoading(false)
        }
    }, [])

    const clearChat = useCallback(async () => {
        try {
            await window.sidebarAPI.clearChat()
            setMessages([])
        } catch (error) {
            console.error('Failed to clear chat:', error)
        }
    }, [])

    const getPageContent = useCallback(async () => {
        try {
            return await window.sidebarAPI.getPageContent()
        } catch (error) {
            console.error('Failed to get page content:', error)
            return null
        }
    }, [])

    const getPageText = useCallback(async () => {
        try {
            return await window.sidebarAPI.getPageText()
        } catch (error) {
            console.error('Failed to get page text:', error)
            return null
        }
    }, [])

    const getCurrentUrl = useCallback(async () => {
        try {
            return await window.sidebarAPI.getCurrentUrl()
        } catch (error) {
            console.error('Failed to get current URL:', error)
            return null
        }
    }, [])

    // Set up message listeners
    useEffect(() => {
        // Listen for streaming response updates
        const handleChatResponse = (data: { 
            messageId: string
            content: string
            isComplete: boolean
            routingInfo?: RoutingInfo
        }) => {
            setMessages(prev => {
                const assistantMessageId = `${data.messageId}-assistant`
                const existingIndex = prev.findIndex(msg => msg.id === assistantMessageId)
                
                if (existingIndex !== -1) {
                    // Update existing assistant message
                    const updated = [...prev]
                    updated[existingIndex] = {
                        ...updated[existingIndex],
                        content: updated[existingIndex].content + (data.content || ''),
                        isStreaming: !data.isComplete,
                        routingInfo: data.routingInfo || updated[existingIndex].routingInfo
                    }
                    return updated
                } else {
                    // Create new assistant message if it doesn't exist
                    return [...prev, {
                        id: assistantMessageId,
                        role: 'assistant' as const,
                        content: data.content || '',
                        timestamp: Date.now(),
                        isStreaming: !data.isComplete,
                        routingInfo: data.routingInfo
                    }]
                }
            })

            if (data.isComplete) {
                setIsLoading(false)
            }
        }

        // Listen for message updates from main process
        const handleMessagesUpdated = (updatedMessages: any[]) => {
            // Convert CoreMessage format to our frontend Message format
            const convertedMessages = updatedMessages.map((msg: any, index: number) => ({
                id: `msg-${index}`,
                role: msg.role,
                content: typeof msg.content === 'string' 
                    ? msg.content 
                    : msg.content.find((p: any) => p.type === 'text')?.text || '',
                timestamp: Date.now(),
                isStreaming: false
            }))
            setMessages(convertedMessages)
        }

        window.sidebarAPI.onChatResponse(handleChatResponse)
        window.sidebarAPI.onMessagesUpdated(handleMessagesUpdated)

        return () => {
            window.sidebarAPI.removeChatResponseListener()
            window.sidebarAPI.removeMessagesUpdatedListener()
        }
    }, [])

    const setInputValue = useCallback((value: string) => {
        // Access the setter function stored in window
        const setter = (window as any).__chatInputSetter
        if (setter) {
            setter(value)
        }
    }, [])

    const value: ChatContextType = {
        messages,
        isLoading,
        sendMessage,
        clearChat,
        setInputValue,
        getPageContent,
        getPageText,
        getCurrentUrl
    }

    return (
        <ChatContext.Provider value={value}>
            {children}
        </ChatContext.Provider>
    )
}

