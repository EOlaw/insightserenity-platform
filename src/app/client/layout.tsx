'use client'

import { useState, useEffect, useRef } from 'react'
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
  Loader2,
  ChevronRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { auth, api } from '@/lib/api/client'

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

interface Consultant {
  _id: string
  profile?: {
    firstName?: string
    lastName?: string
    avatar?: string
  }
  professional?: {
    level?: string
    specialization?: string
  }
  skills?: Array<{ name: string }>
}

interface Notification {
  _id: string
  title: string
  message: string
  type: string
  read: boolean
  createdAt: string
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

  // Search states
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Consultant[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showSearchResults, setShowSearchResults] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  // Notification states
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotifications, setShowNotifications] = useState(false)
  const notificationRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadUserData()
    loadNotifications()

    // Poll for new notifications every 30 seconds
    const notificationInterval = setInterval(loadNotifications, 30000)

    return () => clearInterval(notificationInterval)
  }, [])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchResults(false)
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Search consultants as user types
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (searchQuery.trim().length > 0) {
      setIsSearching(true)
      searchTimeoutRef.current = setTimeout(async () => {
        try {
          const response = await api.get(`/consultants/search?q=${encodeURIComponent(searchQuery)}&limit=10`)
          const results = response.data?.consultants || response.data || []
          setSearchResults(results)
          setShowSearchResults(true)
        } catch (error) {
          console.error('Search failed:', error)
          setSearchResults([])
        } finally {
          setIsSearching(false)
        }
      }, 300) // Debounce for 300ms
    } else {
      setSearchResults([])
      setShowSearchResults(false)
      setIsSearching(false)
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery])

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

  const loadNotifications = async () => {
    try {
      const response = await api.get('/notifications/me?limit=10')
      const notifs = response.data?.notifications || response.data || []
      setNotifications(notifs)
      setUnreadCount(notifs.filter((n: Notification) => !n.read).length)
    } catch (error) {
      console.error('Failed to load notifications:', error)
    }
  }

  const markAsRead = async (notificationId: string) => {
    try {
      await api.put(`/notifications/${notificationId}/read`)
      loadNotifications()
    } catch (error) {
      console.error('Failed to mark notification as read:', error)
    }
  }

  const markAllAsRead = async () => {
    try {
      await api.put('/notifications/mark-all-read')
      loadNotifications()
      toast.success('All notifications marked as read')
    } catch (error) {
      console.error('Failed to mark all as read:', error)
      toast.error('Failed to update notifications')
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
            {/* Live Consultant Search */}
            <div className="relative hidden md:block" ref={searchRef}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#ffc451] animate-spin" />
              )}
              <input
                type="search"
                placeholder="Search consultants..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-10 py-2 text-sm border rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-[#ffc451]/50 focus:border-[#ffc451]"
              />

              {/* Search Results Dropdown */}
              {showSearchResults && searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-lg border border-gray-200 max-h-96 overflow-y-auto z-50">
                  <div className="p-2 space-y-1">
                    {searchResults.map((consultant) => (
                      <Link
                        key={consultant._id}
                        href={`/client/consultants/${consultant._id}`}
                        onClick={() => {
                          setShowSearchResults(false)
                          setSearchQuery('')
                        }}
                      >
                        <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-[#ffc451]/10 transition-colors cursor-pointer group">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#ffc451] to-[#ffb020] flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-black">
                              {consultant.profile?.firstName?.[0]}{consultant.profile?.lastName?.[0]}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-semibold text-gray-900 group-hover:text-[#ffc451] transition-colors truncate">
                              {consultant.profile?.firstName} {consultant.profile?.lastName}
                            </h4>
                            <p className="text-xs text-gray-600 capitalize truncate">
                              {consultant.professional?.level} {consultant.professional?.specialization}
                            </p>
                            {consultant.skills && consultant.skills.length > 0 && (
                              <div className="flex items-center gap-1 mt-1">
                                {consultant.skills.slice(0, 2).map((skill, idx) => (
                                  <span key={idx} className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-700">
                                    {skill.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-[#ffc451] transition-colors" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {showSearchResults && searchQuery && searchResults.length === 0 && !isSearching && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-lg border border-gray-200 p-4 z-50 text-center">
                  <p className="text-sm text-gray-500">No consultants found</p>
                </div>
              )}
            </div>

            {/* Search (Mobile) */}
            <button className="p-2 text-gray-500 hover:text-gray-700 md:hidden transition-colors">
              <Search className="h-4 w-4" />
            </button>

            {/* Notifications */}
            <div className="relative" ref={notificationRef}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 text-gray-500 hover:text-gray-700 relative transition-colors"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 h-5 w-5 bg-[#ffc451] rounded-full flex items-center justify-center">
                    <span className="text-xs font-bold text-black">{unreadCount > 9 ? '9+' : unreadCount}</span>
                  </span>
                )}
              </button>

              {/* Notifications Dropdown */}
              {showNotifications && (
                <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 max-h-96 overflow-y-auto z-50">
                  <div className="p-3 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
                    <h3 className="text-sm font-bold text-gray-900">Notifications</h3>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className="text-xs text-[#ffc451] hover:text-[#ffb020] font-medium"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="divide-y divide-gray-100">
                    {notifications.length > 0 ? (
                      notifications.map((notification) => (
                        <div
                          key={notification._id}
                          onClick={() => !notification.read && markAsRead(notification._id)}
                          className={cn(
                            "p-3 hover:bg-gray-50 transition-colors cursor-pointer",
                            !notification.read && "bg-[#ffc451]/5"
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div className={cn(
                              "w-2 h-2 rounded-full mt-1.5 flex-shrink-0",
                              !notification.read ? "bg-[#ffc451]" : "bg-gray-300"
                            )} />
                            <div className="flex-1 min-w-0">
                              <h4 className={cn(
                                "text-sm truncate",
                                !notification.read ? "font-semibold text-gray-900" : "font-medium text-gray-700"
                              )}>
                                {notification.title}
                              </h4>
                              <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">
                                {notification.message}
                              </p>
                              <p className="text-xs text-gray-400 mt-1">
                                {new Date(notification.createdAt).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center">
                        <Bell className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">No notifications</p>
                        <p className="text-xs text-gray-400 mt-1">You&apos;re all caught up!</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

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
