import React, { useState, useEffect } from 'react'
import { Activity, Zap, TrendingUp, CheckCircle2 } from 'lucide-react'
import { cn } from '@common/lib/utils'

interface RouteStats {
  count: number
  avgLatency: number
  successRate: number
  p95Latency: number
}

interface TelemetryStats {
  total: number
  avgLatency: number
  routeBreakdown: Record<string, RouteStats>
  routePercentages: {
    pattern?: number
    t5?: number
    slm?: number
    gemini?: number
    direct_llm?: number
    fallback?: number
  }
}

interface TelemetryDashboardProps {
  className?: string
}

export const TelemetryDashboard: React.FC<TelemetryDashboardProps> = ({ className }) => {
  const [stats, setStats] = useState<TelemetryStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadStats = async () => {
      try {
        const metrics = await window.sidebarAPI.getRoutingMetrics()
        setStats(metrics)
      } catch (error) {
        console.error('Failed to load telemetry stats:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadStats()
    
    // Refresh every 2 seconds
    const interval = setInterval(loadStats, 2000)
    return () => clearInterval(interval)
  }, [])

  if (isLoading) {
    return (
      <div className={cn("p-4 bg-muted/50 rounded-lg", className)}>
        <div className="text-sm text-muted-foreground">Loading metrics...</div>
      </div>
    )
  }

  if (!stats || stats.total === 0) {
    return (
      <div className={cn("p-4 bg-muted/50 rounded-lg", className)}>
        <div className="text-sm text-muted-foreground">No metrics collected yet</div>
      </div>
    )
  }

  const getRouteColor = (route: string) => {
    switch (route.toLowerCase()) {
      case 'pattern':
        return 'bg-green-500/20 text-green-600 dark:text-green-400'
      case 't5':
        return 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
      case 'slm':
        return 'bg-purple-500/20 text-purple-600 dark:text-purple-400'
      case 'gemini':
        return 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400'
      case 'direct_llm':
        return 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400'
      case 'fallback':
        return 'bg-orange-500/20 text-orange-600 dark:text-orange-400'
      default:
        return 'bg-gray-500/20 text-gray-600 dark:text-gray-400'
    }
  }

  const getRouteLabel = (route: string) => {
    switch (route.toLowerCase()) {
      case 'pattern':
        return 'Pattern Matching'
      case 't5':
        return 'T5-Distilled'
      case 'slm':
        return 'SLM (Phi-3.5)'
      case 'gemini':
        return 'Gemini API'
      case 'direct_llm':
        return 'Direct LLM'
      case 'fallback':
        return 'Fallback'
      default:
        return route
    }
  }

  const routeEntries = Object.entries(stats.routeBreakdown).sort(
    (a, b) => b[1].count - a[1].count
  )

  return (
    <div className={cn("p-4 bg-muted/50 rounded-lg border border-border", className)}>
      <div className="flex items-center gap-2 mb-4">
        <Activity className="size-4 text-primary" />
        <h3 className="font-semibold text-sm">Performance Telemetry</h3>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-background/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Total Queries</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="bg-background/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Avg Latency</div>
          <div className="text-2xl font-bold flex items-center gap-1">
            {Math.round(stats.avgLatency)}ms
            <Zap className="size-4 text-primary" />
          </div>
        </div>
      </div>

      {/* Route Breakdown */}
      <div className="space-y-3">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Route Distribution
        </div>
        
        {routeEntries.map(([route, routeStats]) => {
          // Normalize route name for percentage lookup
          const normalizedRoute = route.toLowerCase().replace(/-/g, '_');
          const percentage = stats.routePercentages[normalizedRoute as keyof typeof stats.routePercentages] || 
                            (routeStats.count / stats.total * 100)
          
          return (
            <div key={route} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className={cn("px-2 py-0.5 rounded text-xs font-medium", getRouteColor(route))}>
                    {getRouteLabel(route)}
                  </span>
                  <span className="text-muted-foreground">
                    {routeStats.count} queries
                  </span>
                </div>
                <span className="font-semibold">{percentage.toFixed(1)}%</span>
              </div>
              
              {/* Progress Bar */}
              <div className="h-2 bg-background rounded-full overflow-hidden">
                <div
                  className={cn("h-full transition-all duration-300", getRouteColor(route))}
                  style={{ width: `${percentage}%` }}
                />
              </div>

              {/* Stats Row */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <TrendingUp className="size-3" />
                  <span>Avg: {Math.round(routeStats.avgLatency)}ms</span>
                </div>
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="size-3" />
                  <span>{routeStats.successRate.toFixed(1)}% success</span>
                </div>
                <span>P95: {Math.round(routeStats.p95Latency)}ms</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Route Percentages Summary */}
      {stats.routePercentages && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="text-xs text-muted-foreground mb-2">Quick Stats</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.routePercentages)
              .filter(([_, percentage]) => percentage && percentage > 0)
              .sort(([_, a], [__, b]) => (b || 0) - (a || 0))
              .map(([route, percentage]) => (
                <div
                  key={route}
                  className={cn(
                    "px-2 py-1 rounded text-xs font-medium",
                    getRouteColor(route)
                  )}
                >
                  {getRouteLabel(route)}: {percentage?.toFixed(0) || 0}%
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

