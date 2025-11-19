'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Logo } from '@/components/Logo'

function TypewriterText({ text }: { text: string }) {
  const [displayedText, setDisplayedText] = useState('')
  const [showCursor, setShowCursor] = useState(true)

  useEffect(() => {
    let currentIndex = 0
    const typingInterval = setInterval(() => {
      if (currentIndex <= text.length) {
        setDisplayedText(text.slice(0, currentIndex))
        currentIndex++
      } else {
        clearInterval(typingInterval)
        // Blink cursor a few times then hide it
        setTimeout(() => setShowCursor(false), 3000)
      }
    }, 30) // Adjust speed here (lower = faster)

    return () => clearInterval(typingInterval)
  }, [text])

  return (
    <p className="text-xl xl:text-2xl font-light leading-relaxed tracking-wide">
      {displayedText}
      <span className={`inline-block w-0.5 h-6 ml-1 bg-primary ${showCursor ? 'animate-pulse' : 'opacity-0'}`} />
    </p>
  )
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const testimonialText = '"The comprehensive platform that transformed how we manage our business operations. From consulting to recruitment, everything is seamlessly integrated."'

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-2/5 bg-black relative overflow-hidden">
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-10 xl:p-16 text-white h-full">
          {/* Logo with Enhanced Glow Effect */}
          <div>
            <Link href="/" className="inline-flex items-center space-x-3 group">
              <div className="relative">
                <Image
                  src="/android-chrome-192x192.png"
                  alt="Insight Serenity"
                  width={48}
                  height={48}
                  className="rounded-xl shadow-lg group-hover:shadow-primary/50 transition-all duration-300 relative z-10"
                  priority
                />
                {/* Multiple glow layers for enhanced effect */}
                <div className="absolute inset-0 rounded-xl bg-primary/0 group-hover:bg-primary/30 blur-2xl transition-all duration-500 -z-10 scale-150" />
                <div className="absolute inset-0 rounded-xl bg-primary/0 group-hover:bg-primary/40 blur-xl transition-all duration-300 -z-10 scale-125" />
                <div className="absolute inset-0 rounded-xl bg-primary/0 group-hover:bg-primary/50 blur-md transition-all duration-200 -z-10" />
              </div>
              <span className="text-lg font-bold tracking-tight">
                Insight <span className="text-primary">Serenity</span>
              </span>
            </Link>
          </div>

          {/* Testimonial with Typewriter Effect */}
          <div className="space-y-8">
            <div className="w-12 h-1 bg-primary rounded-full" />
            <blockquote className="space-y-4">
              <TypewriterText text={testimonialText} />
              <footer className="flex items-center space-x-4 opacity-0 animate-fadeIn" style={{ animationDelay: '4s', animationFillMode: 'forwards' }}>
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-primary font-semibold text-sm">SJ</span>
                </div>
                <div>
                  <cite className="not-italic font-medium block">
                    Sarah Johnson
                  </cite>
                  <span className="text-sm text-white/60">
                    CEO at TechCorp
                  </span>
                </div>
              </footer>
            </blockquote>
          </div>

          {/* Footer Links */}
          <div className="flex items-center space-x-8 text-sm text-white/60">
            <Link href="/about" className="hover:text-primary transition-colors duration-200">
              About
            </Link>
            <Link href="/privacy" className="hover:text-primary transition-colors duration-200">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-primary transition-colors duration-200">
              Terms
            </Link>
            <Link href="/contact" className="hover:text-primary transition-colors duration-200">
              Contact
            </Link>
          </div>
        </div>

        {/* Decorative Elements */}
        <div className="absolute -bottom-48 -left-48 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -top-48 -right-48 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-primary/5 to-transparent rounded-full" />
      </div>

      {/* Right Panel - Auth Form */}
      <div className="flex-1 flex flex-col bg-background">
        {/* Mobile Header */}
        <div className="lg:hidden p-6 border-b border-border/50">
          <Logo href="/" size="md" showText={true} />
        </div>

        {/* Auth Content */}
        <div className="flex-1 flex items-center justify-center p-6 sm:p-8 lg:p-12">
          <div className="w-full max-w-md">
            {children}
          </div>
        </div>

        {/* Mobile Footer */}
        <div className="lg:hidden p-6 border-t border-border/50">
          <div className="flex items-center justify-center space-x-4 text-xs text-muted-foreground">
            <Link href="/about" className="hover:text-foreground transition-colors">
              About
            </Link>
            <span className="text-border">•</span>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <span className="text-border">•</span>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms
            </Link>
            <span className="text-border">•</span>
            <Link href="/contact" className="hover:text-foreground transition-colors">
              Contact
            </Link>
          </div>
        </div>
      </div>

      {/* Animation Styles */}
      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.6s ease-out;
        }
      `}</style>
    </div>
  )
}
