'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Building2,
  UserCheck,
  Settings,
  HelpCircle,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Bell,
  Search,
  Globe,
  CreditCard,
  FileText,
  TrendingUp,
  User as UserIcon,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { auth } from '@/lib/api/client'

const navigation = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    name: 'Core Business',
    href: '/dashboard/core-business',
    icon: Briefcase,
    children: [
      { name: 'Clients', href: '/dashboard/core-business/clients' },
      { name: 'Projects', href: '/dashboard/core-business/projects' },
      { name: 'Consultants', href: '/dashboard/core-business/consultants' },
      { name: 'Engagements', href: '/dashboard/core-business/engagements' },
      { name: 'Analytics', href: '/dashboard/core-business/analytics' },
    ],
  },
  {
    name: 'Recruitment',
    href: '/dashboard/recruitment',
    icon: UserCheck,
    children: [
      { name: 'Jobs', href: '/dashboard/recruitment/jobs' },
      { name: 'Candidates', href: '/dashboard/recruitment/candidates' },
      { name: 'Applications', href: '/dashboard/recruitment/applications' },
      { name: 'Partnerships', href: '/dashboard/recruitment/partnerships' },
      { name: 'Analytics', href: '/dashboard/recruitment/analytics' },
    ],
  },
  {
    name: 'Organization',
    href: '/dashboard/organization',
    icon: Building2,
    children: [
      { name: 'Settings', href: '/dashboard/organization/settings' },
      { name: 'Members', href: '/dashboard/organization/members' },
      { name: 'Subscription', href: '/dashboard/organization/subscription' },
      { name: 'Tenant', href: '/dashboard/organization/tenant' },
    ],
  },
]

const bottomNavigation = [
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
  { name: 'Help & Support', href: '/dashboard/support', icon: HelpCircle },
]

interface UserData {
  _id: string
  email: string
  firstName: string
  lastName: string
  profile?: {
    displayName?: string
    firstName?: string
    lastName?: string
  }
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [expandedItems, setExpandedItems] = useState<string[]>([])
  const [user, setUser] = useState<UserData | null>(null)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  useEffect(() => {
    loadUserData()
  }, [])

  const loadUserData = async () => {
    try {
      const userData = await auth.getCurrentUser()
      
      let actualUserData: UserData
      
      if (userData.data?.user) {
        actualUserData = userData.data.user
      } else if (userData.user) {
        actualUserData = userData.user
      } else if (userData._id || userData.email) {
        actualUserData = userData as UserData
      } else {
        return
      }
      
      setUser(actualUserData)
    } catch (error) {
      console.error('Failed to load user data:', error)
    }
  }

  const handleLogout = async () => {
    if (isLoggingOut) return
    
    setIsLoggingOut(true)
    try {
      await auth.logout()
      toast.success('Logged out successfully')
      router.push('/')
    } catch (error) {
      console.error('Logout failed:', error)
      toast.error('Failed to logout. Redirecting...')
      // Even if logout fails, redirect to home
      router.push('/')
    } finally {
      setIsLoggingOut(false)
    }
  }

  const toggleExpanded = (name: string) => {
    setExpandedItems(prev =>
      prev.includes(name)
        ? prev.filter(item => item !== name)
        : [...prev, name]
    )
  }

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard'
    }
    return pathname.startsWith(href)
  }

  const getUserInitials = () => {
    if (!user) return 'U'
    
    const firstName = user.profile?.firstName || user.firstName || ''
    const lastName = user.profile?.lastName || user.lastName || ''
    
    if (firstName && lastName) {
      return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
    }
    
    if (firstName) {
      return firstName.charAt(0).toUpperCase()
    }
    
    if (user.email) {
      return user.email.charAt(0).toUpperCase()
    }
    
    return 'U'
  }

  const getUserDisplayName = () => {
    if (!user) return 'User'
    
    if (user.profile?.displayName) {
      return user.profile.displayName
    }
    
    const firstName = user.profile?.firstName || user.firstName
    const lastName = user.profile?.lastName || user.lastName
    
    if (firstName && lastName) {
      return `${firstName} ${lastName}`
    }
    
    if (firstName) {
      return firstName
    }
    
    return 'User'
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-black text-white transform transition-transform lg:relative lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-between px-6 border-b border-white/10">
            <Logo href="/" showText={false} />
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-white/60 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Tenant Switcher */}
          <div className="px-4 py-3 border-b border-white/10">
            <button className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 bg-primary rounded-md flex items-center justify-center">
                  <span className="text-black font-semibold text-2xs">TC</span>
                </div>
                <div className="text-left">
                  <p className="text-xs font-medium">TechCorp Inc</p>
                  <p className="text-2xs text-white/60">Premium Plan</p>
                </div>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-white/60" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-4 py-4">
            <ul className="space-y-1">
              {navigation.map((item) => (
                <li key={item.name}>
                  <div>
                    {item.children ? (
                      <button
                        onClick={() => toggleExpanded(item.name)}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                          isActive(item.href)
                            ? "bg-primary text-black"
                            : "text-white/70 hover:bg-white/10 hover:text-white"
                        )}
                      >
                        <div className="flex items-center space-x-3">
                          <item.icon className="h-4 w-4" />
                          <span>{item.name}</span>
                        </div>
                        <ChevronDown
                          className={cn(
                            "h-3.5 w-3.5 transition-transform",
                            expandedItems.includes(item.name) && "rotate-180"
                          )}
                        />
                      </button>
                    ) : (
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                          isActive(item.href)
                            ? "bg-primary text-black"
                            : "text-white/70 hover:bg-white/10 hover:text-white"
                        )}
                      >
                        <div className="flex items-center space-x-3">
                          <item.icon className="h-4 w-4" />
                          <span>{item.name}</span>
                        </div>
                      </Link>
                    )}
                  </div>
                  {item.children && expandedItems.includes(item.name) && (
                    <ul className="mt-1 ml-7 space-y-1">
                      {item.children.map((child) => (
                        <li key={child.name}>
                          <Link
                            href={child.href}
                            className={cn(
                              "block px-3 py-1.5 rounded-md text-xs transition-colors",
                              isActive(child.href)
                                ? "bg-white/10 text-white"
                                : "text-white/60 hover:bg-white/5 hover:text-white/90"
                            )}
                          >
                            {child.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          {/* Bottom navigation */}
          <div className="border-t border-white/10 px-4 py-4">
            <ul className="space-y-1">
              {bottomNavigation.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center space-x-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                      isActive(item.href)
                        ? "bg-primary text-black"
                        : "text-white/70 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* User menu */}
          <div className="border-t border-white/10 px-4 py-4">
            <div className="flex items-center space-x-3 px-3">
              <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center">
                <span className="text-2xs font-medium">{getUserInitials()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{getUserDisplayName()}</p>
                <p className="text-2xs text-white/60 truncate">{user?.email || 'Loading...'}</p>
              </div>
              <button 
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="text-white/60 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Sign out"
              >
                {isLoggingOut ? (
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b h-16 flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-gray-500 hover:text-gray-700"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Search */}
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="search"
                placeholder="Search..."
                className="pl-9 pr-4 py-2 text-xs border rounded-lg w-64 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Quick actions */}
            <button className="p-2 text-gray-500 hover:text-gray-700 relative">
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-red-500 rounded-full" />
            </button>

            <button className="p-2 text-gray-500 hover:text-gray-700">
              <Globe className="h-4 w-4" />
            </button>

            <button className="p-2 text-gray-500 hover:text-gray-700 sm:hidden">
              <Search className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  )
}