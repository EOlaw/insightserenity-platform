'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Users,
  Calendar,
  Bell,
  Settings,
  User,
  Building2,
  Mail,
  Phone,
  CheckCircle,
  AlertCircle,
  Clock,
  Briefcase,
  FileText,
  Download,
  Shield,
  CreditCard,
  MessageSquare,
  ArrowUpRight,
  MoreVertical,
  RefreshCw,
  StickyNote,
  FolderOpen,
  UserPlus,
  Upload,
  PlusCircle,
  Eye,
  TrendingUp
} from 'lucide-react'
import toast from 'react-hot-toast'

// Import your existing API client
import { auth, api } from '@/lib/api/client'

interface UserData {
  _id: string
  email: string
  firstName: string
  lastName: string
  phoneNumber?: string
  profile: {
    displayName: string
    firstName: string
    lastName: string
    email: string
    phone?: string
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
  verification?: {
    email?: {
      verified: boolean
    }
    phone?: {
      verified: boolean
    }
  }
  createdAt: string
  updatedAt: string
}

interface Contact {
  _id: string
  personalInfo: {
    firstName: string
    lastName: string
    email: string
    phone?: string
  }
  professionalInfo?: {
    jobTitle?: string
    company?: string
  }
  status: {
    isActive: boolean
  }
  createdAt: string
}

interface Document {
  _id: string
  documentInfo: {
    name: string
    displayName?: string
    description?: string
  }
  file: {
    size: number
    mimeType: string
  }
  createdAt: string
}

interface Note {
  _id: string
  content: {
    title?: string
    body: string
  }
  classification: {
    type: string
    importance: string
  }
  createdAt: string
}

interface DashboardStats {
  totalContacts: number
  totalDocuments: number
  totalNotes: number
  recentActivityCount: number
}

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  
  // Data states
  const [stats, setStats] = useState<DashboardStats>({
    totalContacts: 0,
    totalDocuments: 0,
    totalNotes: 0,
    recentActivityCount: 0
  })
  const [recentContacts, setRecentContacts] = useState<Contact[]>([])
  const [recentDocuments, setRecentDocuments] = useState<Document[]>([])
  const [recentNotes, setRecentNotes] = useState<Note[]>([])
  const [isLoadingData, setIsLoadingData] = useState(true)

  useEffect(() => {
    loadUserData()
  }, [])

  useEffect(() => {
    if (user) {
      loadDashboardData()
    }
  }, [user])

  const loadUserData = async () => {
    setIsLoading(true)
    setError('')

    try {
      const userData = await auth.getCurrentUser()
      
      console.log('User data received:', userData)
      
      let actualUserData: UserData
      
      if (userData.data?.user) {
        actualUserData = userData.data.user
      } else if (userData.user) {
        actualUserData = userData.user
      } else if (userData._id || userData.email) {
        actualUserData = userData as UserData
      } else {
        console.error('Unexpected user data structure:', userData)
        throw new Error('Invalid user data structure received from server')
      }
      
      setUser(actualUserData)
      
    } catch (error: any) {
      console.error('Failed to load user data:', error)

      if (error.response?.status === 401) {
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

  const loadDashboardData = async () => {
    setIsLoadingData(true)
    
    try {
      console.log('Loading dashboard data for authenticated user...')

      // Load contacts, documents, and notes in parallel using the correct endpoints
      // The backend uses req.user.clientId from the JWT token to scope the data
      const [contactsResponse, documentsResponse, notesResponse] = await Promise.all([
        api.get('/clients/contacts?limit=5').catch(err => {
          console.error('Failed to load contacts:', err)
          return { success: false, data: [], metadata: { total: 0 } }
        }),
        api.get('/clients/documents?limit=5').catch(err => {
          console.error('Failed to load documents:', err)
          return { success: false, data: [], metadata: { total: 0 } }
        }),
        api.get('/clients/notes?limit=5').catch(err => {
          console.error('Failed to load notes:', err)
          return { success: false, data: [], metadata: { total: 0 } }
        })
      ])

      // Extract data from responses
      const contactsData = Array.isArray(contactsResponse.data) ? contactsResponse.data : []
      const documentsData = Array.isArray(documentsResponse.data) ? documentsResponse.data : []
      const notesData = Array.isArray(notesResponse.data) ? notesResponse.data : []

      console.log('Dashboard data loaded:', {
        contacts: contactsData.length,
        documents: documentsData.length,
        notes: notesData.length
      })

      // Update stats
      setStats({
        totalContacts: contactsResponse.metadata?.total || contactsData.length,
        totalDocuments: documentsResponse.metadata?.total || documentsData.length,
        totalNotes: notesResponse.metadata?.total || notesData.length,
        recentActivityCount: (contactsData.length + documentsData.length + notesData.length)
      })

      // Set recent data
      setRecentContacts(contactsData)
      setRecentDocuments(documentsData)
      setRecentNotes(notesData)

    } catch (error) {
      console.error('Failed to load dashboard data:', error)
      toast.error('Some dashboard data could not be loaded')
    } finally {
      setIsLoadingData(false)
    }
  }

  const handleLogout = async () => {
    try {
      await auth.logout()
      toast.success('Logged out successfully')
      router.push('/')
    } catch (error) {
      console.error('Logout failed:', error)
      router.push('/')
    }
  }

  const isEmailVerified = () => {
    if (!user) return false
    if (user.emailVerified === true) return true
    if (user.verification?.email?.verified === true) return true
    return false
  }

  const isPhoneVerified = () => {
    if (!user) return false
    if (user.verification?.phone?.verified === true) return true
    return false
  }

  const hasPhoneNumber = () => {
    if (!user) return false
    return !!(user.phoneNumber || (user as any).phone)
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
        return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Basic</span>
      default:
        return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 capitalize">{plan}</span>
    }
  }

  const getRelativeTime = (dateString: string): string => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffInSeconds < 60) return 'Just now'
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`
    
    return date.toLocaleDateString()
  }

  const getContactDisplayName = (contact: Contact): string => {
    return `${contact.personalInfo.firstName} ${contact.personalInfo.lastName}`
  }

  const getContactEmail = (contact: Contact): string => {
    return contact.personalInfo.email
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const getFileIcon = (mimeType: string): string => {
    if (mimeType?.includes('pdf')) return '📄'
    if (mimeType?.includes('word') || mimeType?.includes('document')) return '📝'
    if (mimeType?.includes('sheet') || mimeType?.includes('excel')) return '📊'
    if (mimeType?.includes('image')) return '🖼️'
    if (mimeType?.includes('video')) return '🎥'
    return '📁'
  }

  const getImportanceBadge = (importance: string): string => {
    switch (importance.toLowerCase()) {
      case 'high':
        return 'bg-red-100 text-red-800'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800'
      case 'low':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-sm text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  if (error || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Failed to Load Dashboard</h2>
            <p className="text-sm text-gray-600 mb-4">{error || 'Unable to load user data'}</p>
            <Button onClick={loadUserData}>Try Again</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome back, {user.profile?.displayName || user.firstName}!
          </h1>
          <p className="text-sm text-gray-600">
            Here is an overview of your account and recent activity.
          </p>
        </div>

        {/* Email Verification Alert */}
        {!isEmailVerified() && (
          <div className="mb-6">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-yellow-800 mb-1">Email Verification Required</h3>
                  <p className="text-sm text-yellow-700 mb-3">
                    Please verify your email address to access all features and ensure account security.
                  </p>
                  <Button size="sm" variant="outline" className="border-yellow-300 text-yellow-800 hover:bg-yellow-100">
                    Resend Verification Email
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Profile and Account Status Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Profile Overview</CardTitle>
                <Link href="/client/profile">
                  <Button variant="ghost" size="sm">
                    <Settings className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-start space-x-4">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="h-8 w-8 text-primary" />
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <h3 className="text-base font-semibold">{user.profile?.displayName || `${user.firstName} ${user.lastName}`}</h3>
                    <p className="text-xs text-gray-600">{user.professional?.title || 'No title set'}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="flex items-center space-x-2 text-xs text-gray-600">
                      <Mail className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{user.email}</span>
                      {isEmailVerified() ? (
                        <CheckCircle className="h-3 w-3 text-green-600 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="h-3 w-3 text-yellow-600 flex-shrink-0" />
                      )}
                    </div>

                    {(user.phoneNumber || user.profile?.phone) && (
                      <div className="flex items-center space-x-2 text-xs text-gray-600">
                        <Phone className="h-3 w-3 flex-shrink-0" />
                        <span>{user.phoneNumber || user.profile.phone}</span>
                        {isPhoneVerified() ? (
                          <CheckCircle className="h-3 w-3 text-green-600 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="h-3 w-3 text-yellow-600 flex-shrink-0" />
                        )}
                      </div>
                    )}

                    {user.professional?.company && (
                      <div className="flex items-center space-x-2 text-xs text-gray-600">
                        <Building2 className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{user.professional.company}</span>
                      </div>
                    )}

                    {user.professional?.department && (
                      <div className="flex items-center space-x-2 text-xs text-gray-600">
                        <Briefcase className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{user.professional.department}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 pt-2">
                    {getStatusBadge(user.status)}
                    {user.subscription?.plan && getPlanBadge(user.subscription.plan)}
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 capitalize">
                      {user.role}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Account Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
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
              </div>

              <div className="pt-3 border-t">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-gray-700">Verification Status</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Mail className="h-3 w-3 text-gray-500" />
                      <span className="text-xs text-gray-600">Email</span>
                    </div>
                    {isEmailVerified() ? (
                      <div className="flex items-center space-x-1">
                        <CheckCircle className="h-3 w-3 text-green-600" />
                        <span className="text-xs text-green-600">Verified</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-1">
                        <AlertCircle className="h-3 w-3 text-yellow-600" />
                        <span className="text-xs text-yellow-600">Not Verified</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Phone className="h-3 w-3 text-gray-500" />
                      <span className="text-xs text-gray-600">Phone</span>
                    </div>
                    {!hasPhoneNumber() ? (
                      <div className="flex items-center space-x-1">
                        <AlertCircle className="h-3 w-3 text-gray-400" />
                        <span className="text-xs text-gray-500">Not Added</span>
                      </div>
                    ) : isPhoneVerified() ? (
                      <div className="flex items-center space-x-1">
                        <CheckCircle className="h-3 w-3 text-green-600" />
                        <span className="text-xs text-green-600">Verified</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-1">
                        <AlertCircle className="h-3 w-3 text-yellow-600" />
                        <span className="text-xs text-yellow-600">Not Verified</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Account Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-600">Your Contacts</p>
                  <p className="text-2xl font-bold mt-1">{stats.totalContacts}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    Total contacts in your network
                  </p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-600">Your Documents</p>
                  <p className="text-2xl font-bold mt-1">{stats.totalDocuments}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    Files uploaded and managed
                  </p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <FolderOpen className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-600">Your Notes</p>
                  <p className="text-2xl font-bold mt-1">{stats.totalNotes}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    Notes and observations recorded
                  </p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <StickyNote className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Recent Contacts */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Recent Contacts</CardTitle>
                  <CardDescription className="text-xs">Your most recently added contacts</CardDescription>
                </div>
                <Link href="/client/?tab=contacts">
                  <Button variant="ghost" size="sm">
                    <Eye className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingData ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : recentContacts.length > 0 ? (
                <div className="space-y-3">
                  {recentContacts.map((contact) => (
                    <div key={contact._id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-semibold text-blue-600">
                          {contact.personalInfo.firstName?.[0]}{contact.personalInfo.lastName?.[0]}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 truncate">
                          {getContactDisplayName(contact)}
                        </p>
                        <p className="text-xs text-gray-600 truncate">{getContactEmail(contact)}</p>
                        <p className="text-xs text-gray-500">{contact.professionalInfo?.jobTitle || 'No title'}</p>
                      </div>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        contact.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {contact.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm text-gray-600 mb-4">No contacts yet</p>
                  <Link href="/client/?tab=contacts">
                    <Button size="sm" variant="outline">
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add Your First Contact
                    </Button>
                  </Link>
                </div>
              )}
              {recentContacts.length > 0 && (
                <Link href="/client/?tab=contacts">
                  <Button variant="outline" size="sm" className="w-full mt-4">
                    View All Contacts
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>

          {/* Recent Documents */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Recent Documents</CardTitle>
                  <CardDescription className="text-xs">Your recently uploaded files</CardDescription>
                </div>
                <Link href="/client/?tab=documents">
                  <Button variant="ghost" size="sm">
                    <Upload className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingData ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : recentDocuments.length > 0 ? (
                <div className="space-y-3">
                  {recentDocuments.map((doc) => (
                    <div key={doc._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <div className="text-2xl">
                          {getFileIcon(doc?.file?.mimeType)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">
                            {doc.documentInfo.displayName || doc.documentInfo.name}
                          </p>
                          <p className="text-xs text-gray-600">
                            {formatFileSize(doc?.file?.size)} • {getRelativeTime(doc?.createdAt)}
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="flex-shrink-0">
                        <Download className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm text-gray-600 mb-4">No documents yet</p>
                  <Link href="/client/?tab=documents">
                    <Button size="sm" variant="outline">
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Your First Document
                    </Button>
                  </Link>
                </div>
              )}
              {recentDocuments.length > 0 && (
                <Link href="/client/?tab=documents">
                  <Button variant="outline" size="sm" className="w-full mt-4">
                    View All Documents
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Notes and Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Notes */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Recent Notes</CardTitle>
                  <CardDescription className="text-xs">Your latest notes and observations</CardDescription>
                </div>
                <Link href="/client/?tab=notes">
                  <Button variant="ghost" size="sm">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingData ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : recentNotes.length > 0 ? (
                <div className="space-y-3">
                  {recentNotes.map((note) => (
                    <div key={note._id} className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <div className="flex items-start justify-between mb-2">
                        {note.content.title && (
                          <h4 className="text-xs font-medium text-gray-900">{note.content.title}</h4>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getImportanceBadge(note.classification.importance)}`}>
                          {note.classification.importance}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 line-clamp-2 mb-2">{note.content.body}</p>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                          {note.classification.type}
                        </span>
                        <span>{getRelativeTime(note.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <StickyNote className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm text-gray-600 mb-4">No notes yet</p>
                  <Link href="/client/?tab=notes">
                    <Button size="sm" variant="outline">
                      <PlusCircle className="h-4 w-4 mr-2" />
                      Create Your First Note
                    </Button>
                  </Link>
                </div>
              )}
              {recentNotes.length > 0 && (
                <Link href="/client/?tab=notes">
                  <Button variant="outline" size="sm" className="w-full mt-4">
                    View All Notes
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
              <CardDescription className="text-xs">Common tasks and settings</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <Link href="/client/profile">
                  <Button variant="outline" size="sm" className="w-full h-auto py-3 flex-col space-y-1">
                    <User className="h-4 w-4" />
                    <span className="text-xs">Edit Profile</span>
                  </Button>
                </Link>
                <Link href="/client/settings">
                  <Button variant="outline" size="sm" className="w-full h-auto py-3 flex-col space-y-1">
                    <Settings className="h-4 w-4" />
                    <span className="text-xs">Settings</span>
                  </Button>
                </Link>
                <Link href="/client/">
                  <Button variant="outline" size="sm" className="w-full h-auto py-3 flex-col space-y-1">
                    <Briefcase className="h-4 w-4" />
                    <span className="text-xs">Client Management</span>
                  </Button>
                </Link>
                <Link href="/dashboard/calendar">
                  <Button variant="outline" size="sm" className="w-full h-auto py-3 flex-col space-y-1">
                    <Calendar className="h-4 w-4" />
                    <span className="text-xs">Calendar</span>
                  </Button>
                </Link>
                <Link href="/dashboard/messages">
                  <Button variant="outline" size="sm" className="w-full h-auto py-3 flex-col space-y-1">
                    <MessageSquare className="h-4 w-4" />
                    <span className="text-xs">Messages</span>
                  </Button>
                </Link>
                <Link href="/dashboard/billing">
                  <Button variant="outline" size="sm" className="w-full h-auto py-3 flex-col space-y-1">
                    <CreditCard className="h-4 w-4" />
                    <span className="text-xs">Billing</span>
                  </Button>
                </Link>
                <Link href="/dashboard/notifications">
                  <Button variant="outline" size="sm" className="w-full h-auto py-3 flex-col space-y-1">
                    <Bell className="h-4 w-4" />
                    <span className="text-xs">Notifications</span>
                  </Button>
                </Link>
                <Link href="/dashboard/help">
                  <Button variant="outline" size="sm" className="w-full h-auto py-3 flex-col space-y-1">
                    <Shield className="h-4 w-4" />
                    <span className="text-xs">Help</span>
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