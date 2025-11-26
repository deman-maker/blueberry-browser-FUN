import React from 'react'
import { useBrowser } from '../contexts/BrowserContext'
import { cn } from '@common/lib/utils'

// Color mapping for tab groups
const groupColors: Record<string, { bg: string; border: string; text: string; bgDark: string; borderDark: string; textDark: string }> = {
    blue: {
        bg: 'bg-blue-100',
        border: 'border-blue-300',
        text: 'text-blue-700',
        bgDark: 'dark:bg-blue-900/30',
        borderDark: 'dark:border-blue-700',
        textDark: 'dark:text-blue-300'
    },
    red: {
        bg: 'bg-red-100',
        border: 'border-red-300',
        text: 'text-red-700',
        bgDark: 'dark:bg-red-900/30',
        borderDark: 'dark:border-red-700',
        textDark: 'dark:text-red-300'
    },
    yellow: {
        bg: 'bg-yellow-100',
        border: 'border-yellow-300',
        text: 'text-yellow-700',
        bgDark: 'dark:bg-yellow-900/30',
        borderDark: 'dark:border-yellow-700',
        textDark: 'dark:text-yellow-300'
    },
    green: {
        bg: 'bg-green-100',
        border: 'border-green-300',
        text: 'text-green-700',
        bgDark: 'dark:bg-green-900/30',
        borderDark: 'dark:border-green-700',
        textDark: 'dark:text-green-300'
    },
    pink: {
        bg: 'bg-pink-100',
        border: 'border-pink-300',
        text: 'text-pink-700',
        bgDark: 'dark:bg-pink-900/30',
        borderDark: 'dark:border-pink-700',
        textDark: 'dark:text-pink-300'
    },
    purple: {
        bg: 'bg-purple-100',
        border: 'border-purple-300',
        text: 'text-purple-700',
        bgDark: 'dark:bg-purple-900/30',
        borderDark: 'dark:border-purple-700',
        textDark: 'dark:text-purple-300'
    },
    cyan: {
        bg: 'bg-cyan-100',
        border: 'border-cyan-300',
        text: 'text-cyan-700',
        bgDark: 'dark:bg-cyan-900/30',
        borderDark: 'dark:border-cyan-700',
        textDark: 'dark:text-cyan-300'
    }
}

export const TabGroupPills: React.FC = () => {
    const { groups } = useBrowser()

    const handleGroupClick = async (groupId: string) => {
        try {
            await window.topBarAPI.toggleGroupCollapse(groupId)
        } catch (error) {
            console.error('Failed to toggle group collapse:', error)
        }
    }

    if (!groups || groups.length === 0) return null

    return (
        <div className="flex items-center gap-2 app-region-no-drag">
            {groups.map(group => {
                const color = groupColors[group.color || 'blue'] || groupColors.blue

                return (
                    <button
                        key={group.id}
                        onClick={() => handleGroupClick(group.id)}
                        className={cn(
                            "px-3 py-1 rounded-full text-xs font-medium transition-all duration-200",
                            "border hover:shadow-sm",
                            color.bg,
                            color.border,
                            color.text,
                            color.bgDark,
                            color.borderDark,
                            color.textDark,
                            group.collapsed ? "opacity-60" : "opacity-100"
                        )}
                        title={`${group.name} (${group.tabIds?.length || 0} tabs) - Click to ${group.collapsed ? 'expand' : 'collapse'}`}
                    >
                        {group.name}
                    </button>
                )
            })}
        </div>
    )
}
