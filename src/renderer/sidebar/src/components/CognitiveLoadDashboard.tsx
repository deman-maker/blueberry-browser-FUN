/**
 * CognitiveLoadDashboard - Visualizes cognitive load and tab management health
 * 
 * Features:
 * - Cognitive load score based on tab count, groups, context switching
 * - Tab health metrics (zombie tabs, duplicates, inactive)
 * - Proactive suggestions for tab management
 */

import React, { useState, useEffect } from 'react';
import { Activity, AlertTriangle, TrendingUp, Zap, Archive, Group } from 'lucide-react';
import { cn } from '@common/lib/utils';
import { useChat } from '../contexts/ChatContext';

interface CognitiveLoadMetrics {
  totalTabs: number;
  groupedTabs: number;
  ungroupedTabs: number;
  duplicateTabs: number;
  inactiveTabs: number; // Tabs not visited in 24h
  cognitiveLoadScore: number; // 0-100
  suggestions: string[];
}

interface CognitiveLoadDashboardProps {
  className?: string;
}

export const CognitiveLoadDashboard: React.FC<CognitiveLoadDashboardProps> = ({ className }) => {
  const [metrics, setMetrics] = useState<CognitiveLoadMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const { setInputValue } = useChat();

  // Convert suggestion text to actionable command
  const suggestionToCommand = (suggestion: string): string => {
    const lower = suggestion.toLowerCase();
    
    // "Close X duplicate tab(s) to free up resources" -> "close duplicate tabs"
    if (lower.includes('close') && lower.includes('duplicate')) {
      return 'close duplicate tabs';
    }
    
    // "Archive X inactive tabs to improve performance" -> "archive inactive tabs"
    if (lower.includes('archive') && lower.includes('inactive')) {
      return 'archive inactive tabs';
    }
    
    // "Group X ungrouped tabs to reduce cognitive load" -> "group my tabs"
    if (lower.includes('group') && lower.includes('ungrouped')) {
      return 'group my tabs';
    }
    
    // "Consider archiving old tabs - you have X tabs open" -> "archive old tabs"
    if (lower.includes('archive') && lower.includes('old')) {
      return 'archive old tabs';
    }
    
    // Default: return the suggestion as-is (user can edit)
    return suggestion;
  };

  const handleSuggestionClick = (suggestion: string) => {
    const command = suggestionToCommand(suggestion);
    setInputValue(command);
  };

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        // Get tab data from main process
        const tabs = await window.sidebarAPI?.getAllTabs?.() || [];
        
        // Calculate metrics
        const totalTabs = tabs.length;
        const groupedTabs = tabs.filter((t: any) => t.groupId).length;
        const ungroupedTabs = totalTabs - groupedTabs;
        
        // Find duplicates (same URL)
        const urlMap = new Map<string, number>();
        tabs.forEach((tab: any) => {
          const count = urlMap.get(tab.url) || 0;
          urlMap.set(tab.url, count + 1);
        });
        const duplicateTabs = Array.from(urlMap.values()).filter(count => count > 1).reduce((sum, count) => sum + count - 1, 0);
        
        // Find inactive tabs (not visited in 24h - mock for now)
        const inactiveTabs = Math.floor(totalTabs * 0.3); // Mock: 30% inactive
        
        // Calculate cognitive load score
        // Factors: total tabs (40%), ungrouped tabs (30%), duplicates (20%), inactive (10%)
        const baseLoad = Math.min(100, (totalTabs / 50) * 40); // 50 tabs = 40 points
        const ungroupedLoad = Math.min(30, (ungroupedTabs / totalTabs) * 30);
        const duplicateLoad = Math.min(20, (duplicateTabs / totalTabs) * 20);
        const inactiveLoad = Math.min(10, (inactiveTabs / totalTabs) * 10);
        
        const cognitiveLoadScore = Math.round(baseLoad + ungroupedLoad + duplicateLoad + inactiveLoad);
        
        // Generate suggestions
        const suggestions: string[] = [];
        if (ungroupedTabs > 10) {
          suggestions.push(`Group ${ungroupedTabs} ungrouped tabs to reduce cognitive load`);
        }
        if (duplicateTabs > 0) {
          suggestions.push(`Close ${duplicateTabs} duplicate tab(s) to free up resources`);
        }
        if (inactiveTabs > 5) {
          suggestions.push(`Archive ${inactiveTabs} inactive tabs to improve performance`);
        }
        if (totalTabs > 30) {
          suggestions.push(`Consider archiving old tabs - you have ${totalTabs} tabs open`);
        }
        if (suggestions.length === 0) {
          suggestions.push('Your tabs are well organized!');
        }
        
        setMetrics({
          totalTabs,
          groupedTabs,
          ungroupedTabs,
          duplicateTabs,
          inactiveTabs,
          cognitiveLoadScore,
          suggestions
        });
      } catch (error) {
        console.error('[CognitiveLoadDashboard] Failed to fetch metrics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, []);

  if (loading || !metrics) {
    return (
      <div className={cn("p-4 bg-muted/50 rounded-lg", className)}>
        <div className="text-sm text-muted-foreground">Loading cognitive load metrics...</div>
      </div>
    );
  }

  const getLoadColor = (score: number) => {
    if (score < 40) return 'text-green-600 dark:text-green-400';
    if (score < 70) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getLoadBgColor = (score: number) => {
    if (score < 40) return 'bg-green-500/20';
    if (score < 70) return 'bg-yellow-500/20';
    return 'bg-red-500/20';
  };

  const getLoadLabel = (score: number) => {
    if (score < 40) return 'Low';
    if (score < 70) return 'Medium';
    return 'High';
  };

  return (
    <div className={cn("p-4 bg-muted/50 rounded-lg space-y-4", className)}>
      <div className="flex items-center gap-2">
        <Activity className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">Cognitive Load Dashboard</h3>
      </div>

      {/* Cognitive Load Score */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Cognitive Load Score</span>
          <span className={cn("text-lg font-bold", getLoadColor(metrics.cognitiveLoadScore))}>
            {metrics.cognitiveLoadScore}/100
          </span>
        </div>
        <div className="relative h-3 bg-muted rounded-full overflow-hidden">
          <div
            className={cn("h-full transition-all duration-300", getLoadBgColor(metrics.cognitiveLoadScore))}
            style={{ width: `${metrics.cognitiveLoadScore}%` }}
          />
        </div>
        <div className="text-xs text-muted-foreground">
          Status: <span className={cn("font-medium", getLoadColor(metrics.cognitiveLoadScore))}>
            {getLoadLabel(metrics.cognitiveLoadScore)} Load
          </span>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-background rounded-lg border">
          <div className="flex items-center gap-2 mb-1">
            <Group className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-muted-foreground">Total Tabs</span>
          </div>
          <div className="text-2xl font-bold">{metrics.totalTabs}</div>
        </div>

        <div className="p-3 bg-background rounded-lg border">
          <div className="flex items-center gap-2 mb-1">
            <Archive className="w-4 h-4 text-purple-500" />
            <span className="text-xs text-muted-foreground">Grouped</span>
          </div>
          <div className="text-2xl font-bold">{metrics.groupedTabs}</div>
        </div>

        <div className="p-3 bg-background rounded-lg border">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            <span className="text-xs text-muted-foreground">Duplicates</span>
          </div>
          <div className="text-2xl font-bold">{metrics.duplicateTabs}</div>
        </div>

        <div className="p-3 bg-background rounded-lg border">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-yellow-500" />
            <span className="text-xs text-muted-foreground">Inactive</span>
          </div>
          <div className="text-2xl font-bold">{metrics.inactiveTabs}</div>
        </div>
      </div>

      {/* Proactive Suggestions */}
      {metrics.suggestions.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Proactive Suggestions</span>
          </div>
          <div className="space-y-1">
            {metrics.suggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => handleSuggestionClick(suggestion)}
                className="w-full text-left p-2 bg-background rounded border border-primary/20 text-sm hover:bg-primary/5 hover:border-primary/40 transition-colors cursor-pointer group"
                title="Click to add to chat input"
              >
                <div className="flex items-center justify-between">
                  <span className="text-foreground group-hover:text-primary transition-colors">
                    {suggestion}
                  </span>
                  <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    →
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

