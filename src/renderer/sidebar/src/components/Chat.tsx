import React, { useState, useRef, useEffect, useLayoutEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { ArrowUp, Plus } from 'lucide-react'
import { useChat } from '../contexts/ChatContext'
import { cn } from '@common/lib/utils'
import { Button } from '@common/components/Button'

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

// Auto-scroll hook - scrolls during streaming and when new messages arrive
const useAutoScroll = (messages: Message[]) => {
    const scrollRef = useRef<HTMLDivElement>(null)
    const prevMessageId = useRef<string | undefined>(undefined)
    const prevContentLength = useRef(0)

    useLayoutEffect(() => {
        const lastMessage = messages[messages.length - 1]
        if (!lastMessage) return

        const isNewMessage = lastMessage.id !== prevMessageId.current
        const currentContentLength = lastMessage.content?.length || 0
        const isStreamingUpdate = lastMessage.isStreaming && currentContentLength > prevContentLength.current

        if (isNewMessage || isStreamingUpdate) {
            // Use requestAnimationFrame for smoother scrolling during streaming
            requestAnimationFrame(() => {
                scrollRef.current?.scrollIntoView({
                    behavior: isNewMessage ? 'smooth' : 'auto', // Smooth for new messages, instant for streaming
                    block: 'end'
                })
            })
        }

        prevMessageId.current = lastMessage.id
        prevContentLength.current = currentContentLength
    }, [messages])

    return scrollRef
}

// User Message Component - appears on the right
const UserMessage: React.FC<{ content: string }> = ({ content }) => (
    <div className="relative max-w-[85%] ml-auto animate-fade-in">
        <div className="bg-muted dark:bg-muted/50 rounded-3xl px-6 py-4">
            <div className="text-foreground" style={{ whiteSpace: 'pre-wrap' }}>
                {content}
            </div>
        </div>
    </div>
)

// Streaming Text Component - displays content immediately as chunks arrive (like Perplexity Comet)
const StreamingText: React.FC<{ content: string }> = ({ content }) => {
    return (
        <div className="whitespace-pre-wrap text-foreground">
            {content}
            <span className="inline-block w-2 h-5 bg-primary/60 dark:bg-primary/40 ml-0.5 animate-pulse" />
        </div>
    )
}

// Markdown Renderer Component
const Markdown: React.FC<{ content: string }> = ({ content }) => (
    <div className="prose prose-sm dark:prose-invert max-w-none 
                    prose-headings:text-foreground prose-p:text-foreground 
                    prose-strong:text-foreground prose-ul:text-foreground 
                    prose-ol:text-foreground prose-li:text-foreground
                    prose-a:text-primary hover:prose-a:underline
                    prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 
                    prose-code:rounded prose-code:text-sm prose-code:text-foreground
                    prose-pre:bg-muted dark:prose-pre:bg-muted/50 prose-pre:p-3 
                    prose-pre:rounded-lg prose-pre:overflow-x-auto">
        <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkBreaks]}
            components={{
                // Custom code block styling
                code: ({ node, className, children, ...props }) => {
                    const inline = !className
                    return inline ? (
                        <code className="bg-muted dark:bg-muted/50 px-1 py-0.5 rounded text-sm text-foreground" {...props}>
                            {children}
                        </code>
                    ) : (
                        <code className={className} {...props}>
                            {children}
                        </code>
                    )
                },
                // Custom link styling
                a: ({ children, href }) => (
                    <a
                        href={href}
                        className="text-primary hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {children}
                    </a>
                ),
            }}
        >
            {content}
        </ReactMarkdown>
    </div>
)

// Routing Info Badge Component
const RoutingInfoBadge: React.FC<{ routingInfo: RoutingInfo }> = ({ routingInfo }) => {
    const getRouteColor = (route: string) => {
        switch (route) {
            case 'pattern':
                return 'bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30'
            case 't5':
                return 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30'
            case 'slm':
                return 'bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30'
            case 'gemini':
                return 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30'
            case 'fallback':
                return 'bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-500/30'
            default:
                return 'bg-gray-500/20 text-gray-600 dark:text-gray-400 border-gray-500/30'
        }
    }

    const getRouteLabel = (route: string) => {
        switch (route) {
            case 'pattern':
                return 'Pattern'
            case 't5':
                return 'T5'
            case 'slm':
                return 'SLM'
            case 'gemini':
                return 'Gemini'
            case 'fallback':
                return 'Fallback'
            default:
                return route
        }
    }

    return (
        <div className={cn(
            "inline-flex items-center gap-2 px-2 py-1 rounded-md text-xs border",
            getRouteColor(routingInfo.route)
        )}>
            <span className="font-medium">{getRouteLabel(routingInfo.route)}</span>
            <span className="opacity-70">•</span>
            <span>{Math.round(routingInfo.latency)}ms</span>
            {routingInfo.model && (
                <>
                    <span className="opacity-70">•</span>
                    <span className="opacity-70 truncate max-w-[100px]">{routingInfo.model}</span>
                </>
            )}
        </div>
    )
}

// Assistant Message Component - appears on the left
const AssistantMessage: React.FC<{
    content: string
    isStreaming?: boolean
    routingInfo?: RoutingInfo
}> = ({
    content,
    isStreaming,
    routingInfo
}) => (
        <div className="relative w-full animate-fade-in">
            {routingInfo && !isStreaming && (
                <div className="mb-2 flex items-center gap-2">
                    <RoutingInfoBadge routingInfo={routingInfo} />
                    {routingInfo.reasoning && (
                        <span className="text-xs text-muted-foreground opacity-70">
                            {routingInfo.reasoning}
                        </span>
                    )}
                </div>
            )}
            <div className="py-1">
                {isStreaming ? (
                    <StreamingText content={content} />
                ) : (
                    <Markdown content={content} />
                )}
            </div>
        </div>
    )

// Loading Indicator with spinning star
const LoadingIndicator: React.FC = () => {
    const [isVisible, setIsVisible] = useState(false)

    useEffect(() => {
        setIsVisible(true)
    }, [])

    return (
        <div className={cn(
            "transition-transform duration-300 ease-in-out",
            isVisible ? "scale-100" : "scale-0"
        )}>
            ...
        </div>
    )
}

// Chat Input Component with pill design
const ChatInput: React.FC<{
    onSend: (message: string) => void
    disabled: boolean
}> = ({ onSend, disabled }) => {
    const [value, setValue] = useState('')
    const [isFocused, setIsFocused] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // Register setValue function with context so it can be called from outside
    useEffect(() => {
        // Store the setter function in a way that can be accessed
        const setter = (newValue: string) => {
            setValue(newValue)
            // Focus the textarea after setting value
            setTimeout(() => {
                textareaRef.current?.focus()
                // Move cursor to end
                if (textareaRef.current) {
                    const length = textareaRef.current.value.length
                    textareaRef.current.setSelectionRange(length, length)
                }
            }, 0)
        }
            // Store in window for now (we'll improve this)
            ; (window as any).__chatInputSetter = setter

        // Cleanup
        return () => {
            delete (window as any).__chatInputSetter
        }
    }, [])

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'
            const scrollHeight = textareaRef.current.scrollHeight
            const newHeight = Math.min(scrollHeight, 200) // Max 200px
            textareaRef.current.style.height = `${newHeight}px`
        }
    }, [value])

    const handleSubmit = () => {
        if (value.trim() && !disabled) {
            onSend(value.trim())
            setValue('')
            // Reset textarea height
            if (textareaRef.current) {
                textareaRef.current.style.height = '24px'
            }
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmit()
        }
    }

    return (
        <div className={cn(
            "w-full border p-3 rounded-3xl bg-background dark:bg-secondary",
            "shadow-chat animate-spring-scale outline-none transition-all duration-200",
            isFocused ? "border-primary/20 dark:border-primary/30" : "border-border"
        )}>
            {/* Input Area */}
            <div className="w-full px-3 py-2">
                <div className="w-full flex items-start gap-3">
                    <div className="relative flex-1 overflow-hidden">
                        <textarea
                            ref={textareaRef}
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            onFocus={() => setIsFocused(true)}
                            onBlur={() => setIsFocused(false)}
                            onKeyDown={handleKeyDown}
                            placeholder="Send a message..."
                            className="w-full resize-none outline-none bg-transparent 
                                     text-foreground placeholder:text-muted-foreground
                                     min-h-[24px] max-h-[200px]"
                            rows={1}
                            style={{ lineHeight: '24px' }}
                        />
                    </div>
                </div>
            </div>

            {/* Send Button */}
            <div className="w-full flex items-center gap-1.5 px-1 mt-2 mb-1">
                <div className="flex-1" />
                <button
                    onClick={handleSubmit}
                    disabled={disabled || !value.trim()}
                    className={cn(
                        "size-9 rounded-full flex items-center justify-center",
                        "transition-all duration-200",
                        "bg-primary text-primary-foreground",
                        "hover:opacity-80 disabled:opacity-50"
                    )}
                >
                    <ArrowUp className="size-5" />
                </button>
            </div>
        </div>
    )
}

// Conversation Turn Component
interface ConversationTurn {
    user?: Message
    assistant?: Message
}

const ConversationTurnComponent: React.FC<{
    turn: ConversationTurn
    isLoading?: boolean
}> = ({ turn, isLoading }) => (
    <div className="pt-12 flex flex-col gap-8">
        {turn.user && <UserMessage content={turn.user.content} />}
        {turn.assistant && (
            <AssistantMessage
                content={turn.assistant.content}
                isStreaming={turn.assistant.isStreaming}
                routingInfo={turn.assistant.routingInfo}
            />
        )}
        {isLoading && (
            <div className="flex justify-start">
                <LoadingIndicator />
            </div>
        )}
    </div>
)

// Main Chat Component
export const Chat: React.FC = () => {
    const { messages, isLoading, sendMessage, clearChat } = useChat()
    const scrollRef = useAutoScroll(messages)

    // Group messages into conversation turns
    const conversationTurns: ConversationTurn[] = []
    for (let i = 0; i < messages.length; i++) {
        if (messages[i].role === 'user') {
            const turn: ConversationTurn = { user: messages[i] }
            if (messages[i + 1]?.role === 'assistant') {
                turn.assistant = messages[i + 1]
                i++ // Skip next message since we've paired it
            }
            conversationTurns.push(turn)
        } else if (messages[i].role === 'assistant' &&
            (i === 0 || messages[i - 1]?.role !== 'user')) {
            // Handle standalone assistant messages
            conversationTurns.push({ assistant: messages[i] })
        }
    }

    // Check if we need to show loading after the last turn
    const showLoadingAfterLastTurn = isLoading &&
        messages[messages.length - 1]?.role === 'user'

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto">
                <div className="h-8 max-w-3xl mx-auto px-4">
                    {/* New Chat Button - Floating */}
                    {messages.length > 0 && (
                        <Button
                            onClick={clearChat}
                            title="Start new chat"
                            variant="ghost"
                        >
                            <Plus className="size-4" />
                            New Chat
                        </Button>
                    )}
                </div>

                <div className="pb-4 relative max-w-3xl mx-auto px-4">

                    {messages.length === 0 ? (
                        // Empty State
                        <div className="flex items-center justify-center h-full min-h-[400px]">
                            <div className="text-center animate-fade-in max-w-md mx-auto gap-2 flex flex-col">
                                <h3 className="text-2xl font-bold">🫐</h3>
                                <p className="text-muted-foreground text-sm">
                                    Press ⌘E to toggle the sidebar
                                </p>
                            </div>
                        </div>
                    ) : (
                        <>

                            {/* Render conversation turns */}
                            {conversationTurns.map((turn, index) => (
                                <ConversationTurnComponent
                                    key={`turn-${index}`}
                                    turn={turn}
                                    isLoading={
                                        showLoadingAfterLastTurn &&
                                        index === conversationTurns.length - 1
                                    }
                                />
                            ))}
                        </>
                    )}

                    {/* Scroll anchor */}
                    <div ref={scrollRef} />
                </div>
            </div>

            {/* Input Area */}
            <div className="p-4">
                <ChatInput onSend={sendMessage} disabled={isLoading} />
            </div>
        </div>
    )
}