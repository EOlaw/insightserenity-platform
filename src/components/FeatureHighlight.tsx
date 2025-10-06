'use client'

import { useState, useEffect } from 'react'
import { Sparkles, X } from 'lucide-react'

interface FeatureHighlightProps {
  featureId: string
  title: string
  description: string
  position?: 'top' | 'bottom' | 'left' | 'right' | 'bottom-left' | 'bottom-right'
  children: React.ReactNode
}

export function FeatureHighlight({
  featureId,
  title,
  description,
  position = 'bottom',
  children,
}: FeatureHighlightProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)

  useEffect(() => {
    // Check if user has already seen this feature
    const dismissed = localStorage.getItem(`feature-${featureId}-dismissed`)
    if (!dismissed) {
      // Show tooltip after a short delay
      const timer = setTimeout(() => setIsVisible(true), 1000)
      return () => clearTimeout(timer)
    } else {
      setIsDismissed(true)
    }
  }, [featureId])

  const handleDismiss = () => {
    setIsVisible(false)
    setIsDismissed(true)
    localStorage.setItem(`feature-${featureId}-dismissed`, 'true')
  }

  const getPositionClasses = () => {
    switch (position) {
      case 'top':
        return 'bottom-full left-1/2 -translate-x-1/2 mb-2'
      case 'bottom':
        return 'top-full left-1/2 -translate-x-1/2 mt-2'
      case 'left':
        return 'right-full top-1/2 -translate-y-1/2 mr-2'
      case 'right':
        return 'left-full top-1/2 -translate-y-1/2 ml-2'
      case 'bottom-left':
        return 'top-full right-0 mt-2'
      case 'bottom-right':
        return 'top-full left-0 mt-2'
      default:
        return 'top-full left-1/2 -translate-x-1/2 mt-2'
    }
  }

  if (isDismissed) {
    return <>{children}</>
  }

  return (
    <div className="relative">
      {children}
      
      {isVisible && (
        <div
          className={`absolute z-50 ${getPositionClasses()} w-64 animate-in fade-in slide-in-from-top-2 duration-300`}
        >
          <div className="bg-popover border border-border rounded-lg shadow-lg p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-popover-foreground mb-1">
                  {title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {description}
                </p>
              </div>
              <button
                onClick={handleDismiss}
                className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            {/* Arrow indicator */}
            <div
              className={`absolute w-2 h-2 bg-popover border-l border-t border-border rotate-45 ${
                position === 'bottom' || position === 'bottom-left' || position === 'bottom-right'
                  ? '-top-1 left-1/2 -translate-x-1/2'
                  : position === 'top'
                  ? '-bottom-1 left-1/2 -translate-x-1/2 rotate-[225deg]'
                  : position === 'left'
                  ? '-right-1 top-1/2 -translate-y-1/2 rotate-[135deg]'
                  : '-left-1 top-1/2 -translate-y-1/2 rotate-[315deg]'
              }`}
            />
          </div>
        </div>
      )}
    </div>
  )
}