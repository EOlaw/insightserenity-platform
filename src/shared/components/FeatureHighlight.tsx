'use client'

import { useState, useEffect } from 'react'
import { Sparkles, X } from 'lucide-react'

interface FeatureHighlightProps {
  featureId: string
  title: string
  description: string
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  children: React.ReactNode
  pulse?: boolean
}

export function FeatureHighlight({
  featureId,
  title,
  description,
  position = 'top-right',
  children,
  pulse = true
}: FeatureHighlightProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem(`feature-${featureId}-dismissed`)
    if (!dismissed) {
      setIsVisible(true)
    } else {
      setIsDismissed(true)
    }
  }, [featureId])

  const handleDismiss = () => {
    localStorage.setItem(`feature-${featureId}-dismissed`, 'true')
    setIsVisible(false)
    setIsDismissed(true)
  }

  const positionClasses = {
    'top-left': 'top-0 left-0',
    'top-right': 'top-0 right-0',
    'bottom-left': 'bottom-0 left-0',
    'bottom-right': 'bottom-0 right-0'
  }

  return (
    <div className="relative inline-block">
      {children}

      {/* Pulse indicator for new features */}
      {isVisible && pulse && (
        <span className={`absolute ${positionClasses[position]} flex h-3 w-3 -mt-1 -mr-1`}>
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
        </span>
      )}

      {/* Feature tooltip */}
      {isVisible && (
        <div className={`absolute ${position.includes('top') ? 'top-8' : 'bottom-8'} ${position.includes('left') ? 'left-0' : 'right-0'} z-50 w-64 p-3 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700`}>
          <button
            onClick={handleDismiss}
            className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X className="h-3 w-3" />
          </button>

          <div className="flex items-start space-x-2">
            <Sparkles className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
            <div className="pr-4">
              <h4 className="text-xs font-semibold mb-1 dark:text-white">{title}</h4>
              <p className="text-xs text-gray-600 dark:text-gray-400">{description}</p>
            </div>
          </div>
        </div>
      )}

      {/* Small indicator dot after dismissal */}
      {isDismissed && !isVisible && (
        <span className={`absolute ${positionClasses[position]} flex h-2 w-2 -mt-0.5 -mr-0.5`}>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-gray-400"></span>
        </span>
      )}
    </div>
  )
}
