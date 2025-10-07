'use client'

import { useState, useEffect } from 'react'
import { X, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react'
import { Button } from './ui/button'

interface TooltipStep {
  id: string
  target: string
  title: string
  content: string
  position: 'top' | 'bottom' | 'left' | 'right'
  offset?: { x?: number; y?: number }
}

const onboardingSteps: TooltipStep[] = [
  {
    id: 'welcome',
    target: '.logo',
    title: 'Welcome to Enterprise Platform! 👋',
    content: 'Your complete solution for managing consulting and recruitment operations. Let me show you around.',
    position: 'bottom',
    offset: { y: 10 }
  },
  {
    id: 'features',
    target: 'a[href="/features"]',
    title: 'Explore Features',
    content: 'Discover all the powerful features our platform offers to streamline your business operations.',
    position: 'bottom',
  },
  {
    id: 'pricing',
    target: 'a[href="/pricing"]',
    title: 'Flexible Pricing',
    content: 'Choose from our range of pricing plans designed to fit businesses of all sizes.',
    position: 'bottom',
  },
  {
    id: 'theme',
    target: '[aria-label="Toggle theme"]',
    title: 'Dark Mode Available',
    content: 'Click here to switch between light and dark themes for comfortable viewing.',
    position: 'bottom',
  },
  {
    id: 'get-started',
    target: 'a[href="/register"] button',
    title: 'Ready to Start?',
    content: 'Sign up for a free 14-day trial. No credit card required!',
    position: 'left',
  },
  {
    id: 'footer-resources',
    target: 'footer',
    title: 'Helpful Resources',
    content: 'Find documentation, API references, support, and legal information in the footer.',
    position: 'top',
  },
]

export function OnboardingTooltips() {
  const [isVisible, setIsVisible] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [hasSeenTour, setHasSeenTour] = useState(true)

  useEffect(() => {
    // Check if user has seen the tour
    const seen = localStorage.getItem('hasSeenOnboarding')
    if (!seen) {
      setHasSeenTour(false)
      setTimeout(() => setIsVisible(true), 1000) // Show after 1 second
    }
  }, [])

  useEffect(() => {
    if (isVisible && currentStep < onboardingSteps.length) {
      const step = onboardingSteps[currentStep]
      const element = document.querySelector(step.target)

      if (element) {
        const rect = element.getBoundingClientRect()
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft

        let top = rect.top + scrollTop
        let left = rect.left + scrollLeft

        // Position adjustments based on tooltip position
        switch (step.position) {
          case 'bottom':
            top += rect.height + (step.offset?.y || 10)
            left += rect.width / 2
            break
          case 'top':
            top -= (step.offset?.y || 10)
            left += rect.width / 2
            break
          case 'left':
            top += rect.height / 2
            left -= (step.offset?.x || 10)
            break
          case 'right':
            top += rect.height / 2
            left += rect.width + (step.offset?.x || 10)
            break
        }

        setPosition({ top, left })

        // Highlight the target element
        element.classList.add('onboarding-highlight')

        // Scroll element into view
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })

        return () => {
          element.classList.remove('onboarding-highlight')
        }
      }
    }
  }, [isVisible, currentStep])

  const handleNext = () => {
    if (currentStep < onboardingSteps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleComplete()
    }
  }

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSkip = () => {
    handleComplete()
  }

  const handleComplete = () => {
    localStorage.setItem('hasSeenOnboarding', 'true')
    setIsVisible(false)
    setHasSeenTour(true)
    // Remove all highlights
    document.querySelectorAll('.onboarding-highlight').forEach(el => {
      el.classList.remove('onboarding-highlight')
    })
  }

  const handleRestart = () => {
    setCurrentStep(0)
    setIsVisible(true)
    setHasSeenTour(false)
  }

  if (hasSeenTour) {
    return (
      <button
        onClick={handleRestart}
        className="fixed bottom-6 right-6 z-50 bg-primary text-black p-3 rounded-full shadow-lg hover:bg-primary/90 transition-all hover:scale-110"
        aria-label="Restart tour"
      >
        <Sparkles className="h-5 w-5" />
      </button>
    )
  }

  if (!isVisible || currentStep >= onboardingSteps.length) return null

  const step = onboardingSteps[currentStep]
  const progress = ((currentStep + 1) / onboardingSteps.length) * 100

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={handleSkip} />

      {/* Tooltip */}
      <div
        className={`fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-4 max-w-sm transform -translate-x-1/2 ${
          step.position === 'top' ? '-translate-y-full' : ''
        }`}
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
        }}
      >
        {/* Close button */}
        <button
          onClick={handleSkip}
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Content */}
        <div className="pr-6">
          <h3 className="text-sm font-semibold mb-2 dark:text-white">{step.title}</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">{step.content}</p>
        </div>

        {/* Progress bar */}
        <div className="mb-3">
          <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Step {currentStep + 1} of {onboardingSteps.length}
          </p>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Skip tour
          </button>
          <div className="flex items-center space-x-2">
            {currentStep > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handlePrevious}
                className="h-7 px-2"
              >
                <ChevronLeft className="h-3 w-3" />
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleNext}
              className="h-7 px-3"
            >
              {currentStep === onboardingSteps.length - 1 ? 'Finish' : 'Next'}
              {currentStep < onboardingSteps.length - 1 && <ChevronRight className="h-3 w-3 ml-1" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Spotlight effect */}
      <style jsx global>{`
        .onboarding-highlight {
          position: relative;
          z-index: 41;
          box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
          border-radius: 4px;
        }
      `}</style>
    </>
  )
}
