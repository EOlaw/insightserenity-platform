import Image from 'next/image'
import Link from 'next/link'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-2/5 bg-black relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5" />
        <div className="relative z-10 flex flex-col justify-between p-8 xl:p-12 text-white h-full">
          <div>
            <Link href="/" className="inline-flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-black font-bold text-lg">E</span>
              </div>
              <span className="text-xl font-bold">Enterprise Platform</span>
            </Link>
          </div>

          <div className="space-y-6">
            <blockquote className="space-y-2">
              <p className="text-lg xl:text-xl font-light leading-relaxed">
                "The comprehensive platform that transformed how we manage our business operations.
                From consulting to recruitment, everything is seamlessly integrated."
              </p>
              <footer className="text-sm opacity-70">
                <cite className="not-italic">
                  — Sarah Johnson, CEO at TechCorp
                </cite>
              </footer>
            </blockquote>
          </div>

          <div className="flex items-center space-x-6 text-xs">
            <Link href="/about" className="hover:text-primary transition-colors">
              About
            </Link>
            <Link href="/privacy" className="hover:text-primary transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-primary transition-colors">
              Terms
            </Link>
            <Link href="/contact" className="hover:text-primary transition-colors">
              Contact
            </Link>
          </div>
        </div>

        {/* Decorative Elements */}
        <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </div>

      {/* Right Panel - Auth Form */}
      <div className="flex-1 flex flex-col">
        {/* Mobile Header */}
        <div className="lg:hidden p-6 border-b">
          <Link href="/" className="inline-flex items-center space-x-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-black font-bold text-sm">E</span>
            </div>
            <span className="text-lg font-bold">Enterprise</span>
          </Link>
        </div>

        {/* Auth Content */}
        <div className="flex-1 flex items-center justify-center p-6 sm:p-8">
          <div className="w-full max-w-md">
            {children}
          </div>
        </div>

        {/* Mobile Footer */}
        <div className="lg:hidden p-6 border-t">
          <div className="flex items-center justify-center space-x-4 text-2xs text-muted-foreground">
            <Link href="/about" className="hover:text-foreground transition-colors">
              About
            </Link>
            <span>•</span>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <span>•</span>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms
            </Link>
            <span>•</span>
            <Link href="/contact" className="hover:text-foreground transition-colors">
              Contact
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
