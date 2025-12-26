'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import {
  LayoutDashboard,
  Calendar,
  FileText,
  Users,
  MessageSquare,
  CreditCard,
  Settings,
  HelpCircle,
  LogOut,
  Menu,
  X,
  Bell,
  Search,
  Sparkles,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { auth } from '@/lib/api/client'

const navigation = [
  {
    name: 'Dashboard',
    href: '/client/dashboard',
    icon: LayoutDashboard,
    description: 'Overview and insights',
  },
  {
    name: 'Consultations',
    href: '/client/consultations',
    icon: Calendar,
    description: 'Your consultation sessions',
  },
  {
    name: 'Documents',
    href: '/client/documents',
    icon: FileText,
    description: 'Files and uploads',
  },
  {
    name: 'Contacts',
    href: '/client/contacts',
    icon: Users,
    description: 'Your connections',
  },
  {
    name: 'Notes',
    href: '/client/notes',
    icon: MessageSquare,
    description: 'Your personal notes',
  },
  {
    name: 'Billing',
    href: '/client/billing',
    icon: CreditCard,
    description: 'Credits and payments',
  },
]

const bottomNavigation = [
  { name: 'Settings', href: '/client/settings', icon: Settings },
  { name: 'Help & Support', href: '/client/support', icon: HelpCircle },
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

interface ClientLayoutProps {
  children: React.ReactNode
}

export default function ClientLayout({ children }: ClientLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
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
      router.push('/')
    } finally {
      setIsLoggingOut(false)
    }
  }

  const isActive = (href: string) => {
    if (href === '/client/dashboard') {
      return pathname === '/client/dashboard'
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
          <div className="flex h-16 items-center justify-between px-6 border-b border-[#ffc451]/20">
            <Logo href="/client/dashboard" showText={false} />
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-white/60 hover:text-[#ffc451] transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* User Info Card */}
          <div className="px-4 py-4 border-b border-[#ffc451]/20">
            <div className="bg-gradient-to-br from-[#ffc451]/10 via-[#ffc451]/5 to-[#ffc451]/10 rounded-xl p-4 border border-[#ffc451]/30">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-gradient-to-br from-[#ffc451] to-[#d4a947] rounded-full flex items-center justify-center ring-2 ring-[#ffc451]/50 shadow-lg shadow-[#ffc451]/20">
                  <span className="text-black font-bold text-sm">{getUserInitials()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate text-white">{getUserDisplayName()}</p>
                  <div className="flex items-center space-x-1 mt-0.5">
                    <Sparkles className="h-3 w-3 text-[#ffc451]" />
                    <p className="text-xs text-[#ffc451]">Client</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-4 py-4">
            <ul className="space-y-1.5">
              {navigation.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group",
                      isActive(item.href)
                        ? "bg-[#ffc451] text-black shadow-lg shadow-[#ffc451]/30"
                        : "text-white/70 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <item.icon className={cn(
                      "h-4 w-4 flex-shrink-0",
                      isActive(item.href) ? "text-black" : "text-white/60 group-hover:text-[#ffc451]"
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{item.name}</div>
                    </div>
                    {isActive(item.href) && (
                      <div className="w-1.5 h-1.5 bg-black rounded-full animate-pulse" />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Bottom navigation */}
          <div className="border-t border-[#ffc451]/20 px-4 py-4">
            <ul className="space-y-1 mb-4">
              {bottomNavigation.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      isActive(item.href)
                        ? "bg-[#ffc451] text-black"
                        : "text-white/70 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.name}</span>
                  </Link>
                </li>
              ))}
            </ul>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium text-white/70 hover:bg-red-500/10 hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 hover:border-red-500/30"
            >
              {isLoggingOut ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Logging out...</span>
                </>
              ) : (
                <>
                  <LogOut className="h-4 w-4" />
                  <span>Sign Out</span>
                </>
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b h-16 flex items-center justify-between px-4 sm:px-6 shadow-sm">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-gray-500 hover:text-gray-700 transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Current Page Title */}
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold text-gray-900">
                {navigation.find(item => isActive(item.href))?.name || 'Dashboard'}
              </h1>
              <p className="text-xs text-gray-500">
                {navigation.find(item => isActive(item.href))?.description}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Search */}
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="search"
                placeholder="Search..."
                className="pl-9 pr-4 py-2 text-sm border rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-[#ffc451]/50 focus:border-[#ffc451]"
              />
            </div>

            {/* Search (Mobile) */}
            <button className="p-2 text-gray-500 hover:text-gray-700 md:hidden transition-colors">
              <Search className="h-4 w-4" />
            </button>

            {/* Notifications */}
            <button className="p-2 text-gray-500 hover:text-gray-700 relative transition-colors">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1 right-1 h-2 w-2 bg-[#ffc451] rounded-full animate-pulse" />
            </button>

            {/* Profile Menu */}
            <Link href="/client/profile">
              <div className="hidden sm:flex items-center space-x-2 pl-3 border-l cursor-pointer hover:opacity-80 transition-opacity">
                <div className="w-8 h-8 bg-gradient-to-br from-[#ffc451] to-[#d4a947] rounded-full flex items-center justify-center shadow-md">
                  <span className="text-xs font-bold text-black">{getUserInitials()}</span>
                </div>
                <div className="text-left">
                  <p className="text-xs font-medium text-gray-900">{getUserDisplayName()}</p>
                  <p className="text-2xs text-gray-500">View profile</p>
                </div>
              </div>
            </Link>
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
