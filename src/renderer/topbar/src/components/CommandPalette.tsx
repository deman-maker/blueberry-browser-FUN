import React, { useState, useEffect, useRef } from 'react'
import { Sparkles, Loader2, X, CheckCircle2, AlertCircle, Undo2 } from 'lucide-react'
import { cn } from '@common/lib/utils'

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const [command, setCommand] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string; undoableAction?: any } | null>(null)
  const [isUndoing, setIsUndoing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
      setCommand('')
      setResult(null)
    }
  }, [isOpen])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+/ or Cmd+/ to toggle (handled by parent)
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!command.trim() || isProcessing) return

    setIsProcessing(true)
    setResult(null)

    try {
      const response = await window.topBarAPI.processTabCommand(command.trim())
      setResult(response)
      
      // Don't auto-close if there's an undoable action - let user see the undo option
      if (response.success && !response.undoableAction) {
        setTimeout(() => {
          onClose()
        }, 1500)
      }
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to process command',
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleUndo = async () => {
    if (!result?.undoableAction || isUndoing) return

    setIsUndoing(true)
    try {
      const undoResult = await window.topBarAPI.undoTabCommand()
      setResult({
        success: undoResult.success,
        message: undoResult.message,
        undoableAction: undefined, // Clear undo after using it
      })
      
      if (undoResult.success) {
        setTimeout(() => {
          onClose()
        }, 1500)
      }
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to undo action',
        undoableAction: result.undoableAction, // Keep undo available if it failed
      })
    } finally {
      setIsUndoing(false)
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Command Palette Modal */}
      <div className="fixed inset-0 flex items-start justify-center pt-20 z-50 pointer-events-none">
        <div
          className={cn(
            "w-full max-w-2xl mx-4 bg-background rounded-lg shadow-2xl",
            "border border-border dark:border-border/50",
            "pointer-events-auto"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <form onSubmit={handleSubmit} className="p-4">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-md bg-primary/10 dark:bg-primary/20">
                <Sparkles className="size-5 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-foreground">Tab Commands</h2>
                <p className="text-xs text-muted-foreground">
                  Use natural language to manage your tabs. Example: "Close all LinkedIn tabs"
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-md hover:bg-muted dark:hover:bg-muted/50 transition-colors"
                aria-label="Close"
              >
                <X className="size-4 text-muted-foreground" />
              </button>
            </div>

            {/* Input */}
            <div className="relative mb-3">
              <input
                ref={inputRef}
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    onClose()
                  }
                }}
                placeholder="Type your command... (e.g., 'Close all LinkedIn tabs', 'Group all Pinterest tabs')"
                className={cn(
                  "w-full px-4 py-3 pr-12 rounded-md",
                  "bg-muted/50 dark:bg-muted/30",
                  "border border-border dark:border-border/50",
                  "text-foreground placeholder:text-muted-foreground",
                  "focus:outline-none focus:ring-2 focus:ring-primary/50",
                  "text-sm"
                )}
                disabled={isProcessing}
              />
              {isProcessing && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <Loader2 className="size-4 animate-spin text-primary" />
                </div>
              )}
            </div>

            {/* Result */}
            {result && (
              <div
                className={cn(
                  "p-3 rounded-md text-sm flex items-start gap-2",
                  result.success
                    ? "bg-green-500/10 dark:bg-green-500/20 text-green-700 dark:text-green-400"
                    : "bg-red-500/10 dark:bg-red-500/20 text-red-700 dark:text-red-400"
                )}
              >
                {result.success ? (
                  <CheckCircle2 className="size-4 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="size-4 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <p className="font-medium">{result.success ? 'Success' : 'Error'}</p>
                  <p className="text-xs mt-0.5 opacity-90">{result.message}</p>
                </div>
                {result.success && result.undoableAction && (
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={isUndoing}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium",
                      "bg-background/50 dark:bg-background/30",
                      "hover:bg-background/70 dark:hover:bg-background/50",
                      "text-foreground border border-border/50",
                      "transition-colors",
                      isUndoing && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {isUndoing ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Undo2 className="size-3" />
                    )}
                    <span>Undo</span>
                  </button>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-muted dark:bg-muted/50 rounded text-[0.7rem]">
                    Enter
                  </kbd>
                  <span>to execute</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-muted dark:bg-muted/50 rounded text-[0.7rem]">
                    Esc
                  </kbd>
                  <span>to close</span>
                </span>
              </div>
              <div className="text-xs opacity-60">
                Privacy-first: Only your command is sent to AI, tab data stays local
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}

