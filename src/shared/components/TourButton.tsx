'use client'

import { useState } from 'react'
import { Map, HelpCircle, X } from 'lucide-react'
import { Button } from '../../../shared/components/ui/button'

export function TourButton() {
  const [showMenu, setShowMenu] = useState(false)

  const restartTour = () => {
    localStorage.removeItem('hasSeenOnboarding')
    window.location.reload()
  }

  const openHelp = () => {
    window.location.href = '/support'
  }

  const openDocs = () => {
    window.location.href = '/docs'
  }

  return (
    <>
      {/* Floating help button */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="fixed bottom-6 right-6 z-40 bg-primary text-black p-3 rounded-full shadow-lg hover:bg-primary/90 transition-all hover:scale-110 group"
        aria-label="Help menu"
      >
        {showMenu ? (
          <X className="h-5 w-5" />
        ) : (
          <HelpCircle className="h-5 w-5" />
        )}
        <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
          Need help?
        </span>
      </button>

      {/* Help menu */}
      {showMenu && (
        <div className="fixed bottom-20 right-6 z-40 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-2">
            <button
              onClick={restartTour}
              className="w-full flex items-center space-x-3 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors text-left"
            >
              <Map className="h-4 w-4 text-primary" />
              <div>
                <div className="font-medium dark:text-white">Take a Tour</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Learn about key features</div>
              </div>
            </button>

            <button
              onClick={openDocs}
              className="w-full flex items-center space-x-3 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors text-left"
            >
              <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <div>
                <div className="font-medium dark:text-white">Documentation</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Browse help articles</div>
              </div>
            </button>

            <button
              onClick={openHelp}
              className="w-full flex items-center space-x-3 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors text-left"
            >
              <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <div>
                <div className="font-medium dark:text-white">Get Support</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Contact our team</div>
              </div>
            </button>
          </div>

          <div className="bg-gray-50 dark:bg-gray-900 px-4 py-2 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
              <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2"></span>
              All systems operational
            </p>
          </div>
        </div>
      )}
    </>
  )
}
