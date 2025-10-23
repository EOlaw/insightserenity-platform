'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Activity,
  Users,
  Calendar,
  DollarSign,
  TrendingUp,
  Bell,
  Settings,
  LogOut,
  User,
  Building2,
  Mail,
  Phone,
  MapPin,
  CheckCircle,
  AlertCircle,
  Clock,
  BarChart3,
  PieChart,
  Target,
  Briefcase
} from 'lucide-react'
import toast from 'react-hot-toast'
import { auth, api } from '@/lib/api/client'

interface UserData {
  _id: string
  email: string
  firstName: string
  lastName: string
  profile: {
    displayName: string
    firstName: string
    lastName: string
    email: string
    phone: string
    avatar: {
      url: string
      alt: string
    }
  }
  professional: {
    title: string
    department: string
    company: string
    experience: number
    skills: string[]
    bio: string
  }
  subscription: {
    plan: string
    status: string
    startDate: string
    endDate?: string
    features: string[]
  }
  role: string
  status: string
  emailVerified: boolean
  phoneVerified: boolean
  createdAt: string
  updatedAt: string
}

const stats = [
  {
    title: 'Total Projects',
    value: '12',
    change: '+20.1%',
    trend: 'up',
    icon: Briefcase,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  {
    title: 'Active Clients',
    value: '8',
    change: '+15.3%',
    trend: 'up',
    icon: Users,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  {
    title: 'This Month Revenue',
    value: '$24,500',
    change: '+12.5%',
    trend: 'up',
    icon: DollarSign,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  {
    title: 'Completed Tasks',
    value: '145',
    change: '+8.2%',
    trend: 'up',
    icon: Target,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
]

const recentActivities = [
  {
    id: 1,
    type: 'project',
    title: 'New project started',
    description: 'Website redesign for TechCorp',
    time: '2 hours ago',
    icon: Briefcase,
  },
  {
    id: 2,
    type: 'client',
    title: 'Client meeting completed',
    description: 'Strategy session with StartupXYZ',
    time: '4 hours ago',
    icon: Users,
  },
  {
    id: 3,
    type: 'task',
    title: 'Task completed',
    description: 'Market research analysis',
    time: '6 hours ago',
    icon: CheckCircle,
  },
  {
    id: 4,
    type: 'payment',
    title: 'Payment received',
    description: '$5,000 from RetailCorp project',
    time: '1 day ago',
    icon: DollarSign,
  },
]

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadUserData()
  }, [])

  const loadUserData = async () => {
    setIsLoading(true)
    setError('')

    try {
      // Get current user data from backend
      const userData = await auth.getCurrentUser()
      
      console.log('User data received:', userData)
      
      // ========================================
      // FIX: Handle different response structures
      // ========================================
      let actualUserData: UserData
      
      if (userData.data?.user) {
        // Response structure: { success: true, data: { user: {...} } }
        actualUserData = userData.data.user
      } else if (userData.user) {
        // Response structure: { user: {...} }
        actualUserData = userData.user
      } else if (userData._id || userData.email) {
        // Response is the user object directly
        actualUserData = userData as UserData
      } else {
        console.error('Unexpected user data structure:', userData)
        throw new Error('Invalid user data structure received from server')
      }
      
      setUser(actualUserData)
      
    } catch (error: any) {
      console.error('Failed to load user data:', error)

      if (error.response?.status === 401) {
        // User not authenticated, redirect to login
        toast.error('Please sign in to access the dashboard')
        router.push('/login')
      } else {
        setError('Failed to load user data')
        toast.error('Failed to load user data')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await auth.logout()
      toast.success('Logged out successfully')
      router.push('/')
    } catch (error) {
      console.error('Logout failed:', error)
      // Even if logout fails, redirect to home
      router.push('/')
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">Active</span>
      case 'pending':
        return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Pending</span>
      case 'suspended':
        return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">Suspended</span>
      default:
        return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{status}</span>
    }
  }

  const getPlanBadge = (plan: string) => {
    switch (plan) {
      case 'enterprise':
        return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">Enterprise</span>
      case 'pro':
        return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Pro</span>
      case 'basic':
        return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">Basic</span>
      case 'free':
        return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Free</span>
      default:
        return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{plan}</span>
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (error || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <span>Error Loading Dashboard</span>
            </CardTitle>
            <CardDescription>
              {error || 'Failed to load user data'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex space-x-2">
              <Button onClick={loadUserData} variant="outline" size="sm">
                Try Again
              </Button>
              <Button onClick={() => router.push('/login')} size="sm">
                Back to Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/" className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <span className="text-black font-bold text-sm">E</span>
                </div>
                <span className="text-lg font-bold">Enterprise</span>
              </Link>
            </div>

            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm">
                <Bell className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome back, {user.profile?.displayName || user.firstName}!
          </h1>
          <p className="text-sm text-gray-600">
            Here's what's happening with your account today.
          </p>
        </div>

        {/* User Profile Card */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Profile Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start space-x-4">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                  <User className="h-8 w-8 text-primary" />
                </div>
                <div className="flex-1 space-y-2">
                  <div>
                    <h3 className="text-base font-semibold">{user.profile?.displayName || `${user.firstName} ${user.lastName}`}</h3>
                    <p className="text-xs text-gray-600">{user.professional?.title || 'No title set'}</p>
                  </div>

                  <div className="flex items-center space-x-4 text-xs text-gray-600">
                    <div className="flex items-center space-x-1">
                      <Mail className="h-3 w-3" />
                      <span>{user.email}</span>
                      {user.emailVerified ? (
                        <CheckCircle className="h-3 w-3 text-green-600" />
                      ) : (
                        <AlertCircle className="h-3 w-3 text-yellow-600" />
                      )}
                    </div>
                  </div>

                  {user.profile?.phone && (
                    <div className="flex items-center space-x-1 text-xs text-gray-600">
                      <Phone className="h-3 w-3" />
                      <span>{user.profile.phone}</span>
                      {user.phoneVerified ? (
                        <CheckCircle className="h-3 w-3 text-green-600" />
                      ) : (
                        <AlertCircle className="h-3 w-3 text-yellow-600" />
                      )}
                    </div>
                  )}

                  {user.professional?.company && (
                    <div className="flex items-center space-x-1 text-xs text-gray-600">
                      <Building2 className="h-3 w-3" />
                      <span>{user.professional.company}</span>
                    </div>
                  )}

                  <div className="flex items-center space-x-2 pt-2">
                    {getStatusBadge(user.status)}
                    {user.subscription?.plan && getPlanBadge(user.subscription.plan)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Account Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">Account Type</span>
                <span className="text-xs font-medium capitalize">{user.role}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">Member Since</span>
                <span className="text-xs font-medium">
                  {new Date(user.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">Last Updated</span>
                <span className="text-xs font-medium">
                  {new Date(user.updatedAt).toLocaleDateString()}
                </span>
              </div>
              {!user.emailVerified && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-3">
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                    <div>
                      <p className="text-xs font-medium text-yellow-800">Email Not Verified</p>
                      <p className="text-xs text-yellow-700">Please check your email to verify your account</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => {
            const Icon = stat.icon
            return (
              <Card key={index}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-gray-600">{stat.title}</p>
                      <p className="text-2xl font-bold">{stat.value}</p>
                      <p className="text-xs text-green-600 flex items-center mt-1">
                        <TrendingUp className="h-3 w-3 mr-1" />
                        {stat.change}
                      </p>
                    </div>
                    <div className={`w-12 h-12 ${stat.bgColor} rounded-lg flex items-center justify-center`}>
                      <Icon className={`h-6 w-6 ${stat.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Recent Activity and Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Activity</CardTitle>
              <CardDescription className="text-xs">
                Your latest account activities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivities.map((activity) => {
                  const Icon = activity.icon
                  return (
                    <div key={activity.id} className="flex items-start space-x-3">
                      <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                        <Icon className="h-4 w-4 text-gray-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">{activity.title}</p>
                        <p className="text-xs text-gray-600">{activity.description}</p>
                        <p className="text-xs text-gray-500 flex items-center mt-1">
                          <Clock className="h-3 w-3 mr-1" />
                          {activity.time}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
              <CardDescription className="text-xs">
                Common tasks and settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <Link href="/dashboard/profile">
                  <Button variant="outline" size="sm" className="w-full">
                    <User className="h-3.5 w-3.5 mr-2" />
                    Edit Profile
                  </Button>
                </Link>
                <Link href="/dashboard/settings">
                  <Button variant="outline" size="sm" className="w-full">
                    <Settings className="h-3.5 w-3.5 mr-2" />
                    Settings
                  </Button>
                </Link>
                <Link href="/dashboard/projects">
                  <Button variant="outline" size="sm" className="w-full">
                    <Briefcase className="h-3.5 w-3.5 mr-2" />
                    Projects
                  </Button>
                </Link>
                <Link href="/dashboard/reports">
                  <Button variant="outline" size="sm" className="w-full">
                    <BarChart3 className="h-3.5 w-3.5 mr-2" />
                    Reports
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}