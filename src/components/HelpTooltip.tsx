'use client'

import { HelpCircle, Info } from 'lucide-react'
import { Tooltip } from '@/components/Tooltip'

interface HelpTooltipProps {
  content: string
  variant?: 'help' | 'info'
  className?: string
}

export function HelpTooltip({ content, variant = 'help', className = '' }: HelpTooltipProps) {
  const Icon = variant === 'help' ? HelpCircle : Info

  return (
    <Tooltip content={content}>
      <button
        className={`inline-flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors ${className}`}
        aria-label="Help"
      >
        <Icon className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  )
}
