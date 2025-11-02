'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ThemeToggle'
import { FeatureHighlight } from '@/components/FeatureHighlight'
import { Logo } from '@/components/Logo'
import { auth } from '@/lib/api/client'
import { 
  User, 
  LogOut, 
  Settings, 
  ChevronDown,
  LayoutDashboard 
} from 'lucide-react'

export default function Navigation() {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    checkAuthStatus()
  }, [])

  const checkAuthStatus = () => {
    try {
      const authenticated = auth.isAuthenticated()
      setIsAuthenticated(authenticated)

      if (authenticated) {
        const storedUser = auth.getStoredUser()
        setUser(storedUser)
      }
    } catch (error) {
      console.error('Error checking auth status:', error)
      setIsAuthenticated(false)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await auth.logout()
    } catch (error) {
      console.error('Logout failed:', error)
      // Force logout even if API call fails
      auth.clearAuthState()
      window.location.href = '/login'
    }
  }

  const getUserDisplayName = () => {
    if (!user) return 'User'
    
    if (user.profile?.firstName && user.profile?.lastName) {
      return `${user.profile.firstName} ${user.profile.lastName}`
    }
    
    if (user.profile?.firstName) {
      return user.profile.firstName
    }
    
    if (user.email) {
      return user.email.split('@')[0]
    }
    
    return 'User'
  }

  const getUserInitials = () => {
    if (!user) return 'U'
    
    if (user.profile?.firstName && user.profile?.lastName) {
      return `${user.profile.firstName[0]}${user.profile.lastName[0]}`.toUpperCase()
    }
    
    if (user.profile?.firstName) {
      return user.profile.firstName[0].toUpperCase()
    }
    
    if (user.email) {
      return user.email[0].toUpperCase()
    }
    
    return 'U'
  }

  return (
    <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Main Navigation */}
          <div className="flex items-center space-x-8">
            <Logo href="/" showText={false} />
            <div className="hidden md:flex items-center space-x-6">
              <Link href="/features" className="text-xs text-muted-foreground hover:text-foreground transition">
                Features
              </Link>
              <Link href="/pricing" className="text-xs text-muted-foreground hover:text-foreground transition">
                Pricing
              </Link>
              <Link href="/about" className="text-xs text-muted-foreground hover:text-foreground transition">
                About
              </Link>
              <Link href="/contact" className="text-xs text-muted-foreground hover:text-foreground transition">
                Contact
              </Link>
            </div>
          </div>

          {/* Right Side - Auth-Aware Actions */}
          <div className="flex items-center space-x-3">
            <FeatureHighlight
              featureId="dark-mode"
              title="New: Dark Mode!"
              description="Switch between light and dark themes for comfortable viewing any time of day."
              position="bottom-left"
            >
              <ThemeToggle />
            </FeatureHighlight>

            {isLoading ? (
              // Loading state
              <div className="flex items-center space-x-3">
                <div className="h-8 w-16 bg-muted animate-pulse rounded" />
                <div className="h-8 w-24 bg-muted animate-pulse rounded" />
              </div>
            ) : isAuthenticated && user ? (
              // Authenticated state - Show user menu
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-muted transition"
                >
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                    <span className="text-xs font-semibold text-black">
                      {getUserInitials()}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-foreground hidden sm:inline">
                    {getUserDisplayName()}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>

                {/* User Dropdown Menu */}
                {showUserMenu && (
                  <>
                    {/* Backdrop */}
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowUserMenu(false)}
                    />
                    
                    {/* Menu */}
                    <div className="absolute right-0 mt-2 w-56 bg-background border border-border rounded-lg shadow-lg z-50">
                      <div className="p-4 border-b border-border">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                            <span className="text-sm font-semibold text-black">
                              {getUserInitials()}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {getUserDisplayName()}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="py-2">
                        <Link
                          href="/dashboard"
                          className="flex items-center space-x-2 px-4 py-2 text-sm text-foreground hover:bg-muted transition"
                          onClick={() => setShowUserMenu(false)}
                        >
                          <LayoutDashboard className="h-4 w-4" />
                          <span>Dashboard</span>
                        </Link>
                        <Link
                          href="/settings"
                          className="flex items-center space-x-2 px-4 py-2 text-sm text-foreground hover:bg-muted transition"
                          onClick={() => setShowUserMenu(false)}
                        >
                          <Settings className="h-4 w-4" />
                          <span>Settings</span>
                        </Link>
                      </div>
                      <div className="border-t border-border py-2">
                        <button
                          onClick={handleLogout}
                          className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-destructive hover:bg-muted transition"
                        >
                          <LogOut className="h-4 w-4" />
                          <span>Sign out</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              // Unauthenticated state - Show auth buttons
              <>
                <Link href="/login">
                  <Button variant="ghost" size="sm">Sign in</Button>
                </Link>
                <Link href="/register">
                  <Button size="sm">Get Started</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}