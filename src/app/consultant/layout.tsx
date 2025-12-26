'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  User,
  Video,
  Target,
  Briefcase,
  Calendar,
  Award,
  FileText,
  TrendingUp,
  Settings,
  HelpCircle,
  LogOut,
  Menu,
  X,
  Bell,
  Search,
  CheckCircle,
  Clock,
  Star,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { auth } from '@/lib/api/client'

const navigation = [
  {
    name: 'Dashboard',
    href: '/consultant/dashboard',
    icon: LayoutDashboard,
    description: 'Overview and quick actions',
  },
  {
    name: 'My Profile',
    href: '/consultant/profile',
    icon: User,
    description: 'Personal and professional information',
  },
  {
    name: 'Consultations',
    href: '/consultant/consultations',
    icon: Video,
    description: 'Your consultation sessions',
  },
  {
    name: 'Skills',
    href: '/consultant/skills',
    icon: Target,
    description: 'Manage your skills and expertise',
  },
  {
    name: 'Assignments',
    href: '/consultant/assignments',
    icon: Briefcase,
    description: 'Active and past projects',
  },
  {
    name: 'Availability',
    href: '/consultant/availability',
    icon: Calendar,
    description: 'Manage your schedule and availability',
  },
  {
    name: 'Certifications',
    href: '/consultant/certifications',
    icon: Award,
    description: 'Professional certifications and credentials',
  },
  {
    name: 'Documents',
    href: '/consultant/documents',
    icon: FileText,
    description: 'Contracts, reports, and files',
  },
  {
    name: 'Performance',
    href: '/consultant/performance',
    icon: TrendingUp,
    description: 'Feedback and performance reviews',
  },
]

const bottomNavigation = [
  { name: 'Settings', href: '/consultant/settings', icon: Settings },
  { name: 'Help & Support', href: '/consultant/support', icon: HelpCircle },
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

interface ConsultantLayoutProps {
  children: React.ReactNode
}

export default function ConsultantLayout({ children }: ConsultantLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [user, setUser] = useState<UserData | null>(null)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [stats, setStats] = useState({
    activeAssignments: 0,
    completedProjects: 0,
    skillsCount: 0,
    certificationsCount: 0,
  })

  useEffect(() => {
    loadUserData()
    loadStats()
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

  const loadStats = async () => {
    // TODO: Implement actual stats loading from API
    // For now, using placeholder values
    setStats({
      activeAssignments: 3,
      completedProjects: 12,
      skillsCount: 24,
      certificationsCount: 5,
    })
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
    if (href === '/consultant/dashboard') {
      return pathname === '/consultant/dashboard'
    }
    return pathname.startsWith(href)
  }

  const getUserInitials = () => {
    if (!user) return 'C'

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

    return 'C'
  }

  const getUserDisplayName = () => {
    if (!user) return 'Consultant'

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

    return 'Consultant'
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
            <Logo href="/consultant/dashboard" showText={false} />
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-white/60 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Consultant Info Card */}
          <div className="px-4 py-4 border-b border-white/10">
            <div className="bg-gradient-to-br from-primary/20 to-primary/5 rounded-lg p-4 border border-primary/20">
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center">
                  <span className="text-black font-semibold text-sm">{getUserInitials()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{getUserDisplayName()}</p>
                  <p className="text-xs text-white/60 truncate">Consultant</p>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-black/20 rounded p-2">
                  <div className="text-white/60 mb-0.5">Active</div>
                  <div className="font-semibold text-primary">{stats.activeAssignments}</div>
                </div>
                <div className="bg-black/20 rounded p-2">
                  <div className="text-white/60 mb-0.5">Skills</div>
                  <div className="font-semibold text-primary">{stats.skillsCount}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-4 py-4">
            <ul className="space-y-1">
              {navigation.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all group",
                      isActive(item.href)
                        ? "bg-primary text-black shadow-lg shadow-primary/20"
                        : "text-white/70 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <item.icon className={cn(
                      "h-4 w-4 flex-shrink-0",
                      isActive(item.href) ? "text-black" : "text-white/60 group-hover:text-white"
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{item.name}</div>
                    </div>
                    {isActive(item.href) && (
                      <div className="w-1.5 h-1.5 bg-black rounded-full" />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Bottom navigation */}
          <div className="border-t border-white/10 px-4 py-4">
            <ul className="space-y-1 mb-4">
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

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-lg text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
        <header className="bg-white border-b h-16 flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-gray-500 hover:text-gray-700"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Current Page Title */}
            <div className="hidden sm:block">
              <h1 className="text-lg font-semibold text-gray-900">
                {navigation.find(item => isActive(item.href))?.name || 'Dashboard'}
              </h1>
              <p className="text-xs text-gray-500">
                {navigation.find(item => isActive(item.href))?.description}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Search (Mobile) */}
            <button className="p-2 text-gray-500 hover:text-gray-700 sm:hidden">
              <Search className="h-4 w-4" />
            </button>

            {/* Quick Stats Badges - Desktop Only */}
            <div className="hidden md:flex items-center space-x-2">
              <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-green-50 rounded-full">
                <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                <span className="text-xs font-medium text-green-700">{stats.activeAssignments} Active</span>
              </div>
              <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-50 rounded-full">
                <Clock className="h-3.5 w-3.5 text-blue-600" />
                <span className="text-xs font-medium text-blue-700">{stats.completedProjects} Completed</span>
              </div>
            </div>

            {/* Notifications */}
            <button className="p-2 text-gray-500 hover:text-gray-700 relative">
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-red-500 rounded-full" />
            </button>

            {/* Profile Menu */}
            <div className="hidden sm:flex items-center space-x-2 pl-3 border-l">
              <div className="w-8 h-8 bg-gradient-to-br from-primary to-yellow-600 rounded-full flex items-center justify-center">
                <span className="text-xs font-semibold text-black">{getUserInitials()}</span>
              </div>
            </div>
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