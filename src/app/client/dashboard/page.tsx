'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import {
  Building2,
  TrendingUp,
  DollarSign,
  FileText,
  Users,
  Briefcase,
  Calendar,
  Star,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  AlertCircle,
  Edit,
  Search,
  Filter,
  BarChart3,
  PieChart,
  Activity,
  Clock,
  CheckCircle2,
  Target,
  Zap,
  Mail,
  Phone,
  MapPin,
  Globe,
  Award,
  TrendingDown,
  RefreshCw,
  Download,
  Eye,
  ChevronRight,
  Plus,
  MessageSquare,
  Bell,
  Settings,
  CreditCard,
  Folder,
  StickyNote,
  UserPlus,
  Shield,
  Sparkles,
  Brain,
  Layers,
  Trophy,
  Flame,
  ArrowRight,
  Upload,
} from 'lucide-react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts'
import toast from 'react-hot-toast'
import { clientApi, contactsApi, documentsApi, notesApi, consultantSearchApi } from '@/lib/api/client'

interface ClientProfile {
  _id: string
  clientCode: string
  companyName: string
  legalName?: string
  tradingName?: string
  businessDetails: {
    registrationNumber?: string
    entityType?: string
    numberOfEmployees?: {
      range?: string
      exact?: number
    }
    annualRevenue?: {
      amount?: number
      currency?: string
      range?: string
    }
  }
  industry: {
    primary?: {
      sector?: string
      subSector?: string
    }
  }
  contacts: {
    primary?: {
      name?: string
      title?: string
      email?: string
      phone?: string
    }
  }
  addresses: {
    headquarters?: {
      street1?: string
      city?: string
      state?: string
      country?: string
    }
  }
  relationship: {
    status?: string
    tier?: string
    accountManager?: any
    healthScore?: {
      score?: number
      trend?: string
    }
    satisfactionScore?: {
      nps?: number
    }
    churnRisk?: {
      level?: string
    }
  }
  billing: {
    currency?: string
    paymentTerms?: string
    outstandingBalance?: number
    totalRevenue?: number
  }
  analytics: {
    lifetime?: {
      totalRevenue?: number
      totalProjects?: number
      totalEngagements?: number
      averageProjectValue?: number
    }
    current?: {
      activeProjects?: number
      monthlyRecurringRevenue?: number
    }
    engagement?: {
      lastActivityDate?: string
      portalLogins?: number
    }
  }
  projects?: Array<{
    projectCode?: string
    name?: string
    status?: string
    value?: number
    completionPercentage?: number
  }>
  contracts?: Array<{
    contractNumber?: string
    type?: string
    status?: string
    value?: {
      amount?: number
      currency?: string
    }
    endDate?: string
  }>
  createdAt: string
  updatedAt: string
}

interface DashboardStats {
  overview: {
    clientId: string
    clientCode: string
    companyName: string
    status: string
    tier: string
  }
  financial: {
    totalRevenue: number
    outstandingBalance: number
    currency: string
  }
  engagement: {
    totalProjects: number
    activeProjects: number
    totalEngagements: number
    portalLogins: number
  }
  activity: {
    lastActivityDate: string
    totalInteractions: number
  }
  health: {
    healthScore: number
    churnRisk: string
    satisfaction: number
  }
}

export default function ClientDashboardPage() {
  const router = useRouter()
  const [client, setClient] = useState<ClientProfile | null>(null)
  const [statistics, setStatistics] = useState<DashboardStats | null>(null)
  const [recentContacts, setRecentContacts] = useState<any[]>([])
  const [recentDocuments, setRecentDocuments] = useState<any[]>([])
  const [recentNotes, setRecentNotes] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    setIsLoading(true)
    setError('')

    try {
      // Load client profile and dashboard data in parallel
      const [profileResponse, dashboardResponse, statsResponse] = await Promise.all([
        clientApi.getMyProfile(),
        clientApi.getMyDashboard(),
        clientApi.getMyStatistics()
      ])

      // Extract client data
      const clientData = profileResponse.data?.client || profileResponse.data || profileResponse
      setClient(clientData)

      // Extract statistics
      const statsData = statsResponse.data?.statistics || statsResponse.data || statsResponse
      setStatistics(statsData)

      // Load recent data
      const [contactsRes, documentsRes, notesRes] = await Promise.all([
        contactsApi.getAll({ limit: 5 }).catch(() => ({ data: [] })),
        documentsApi.getAll({ limit: 5 }).catch(() => ({ data: [] })),
        notesApi.getAll({ limit: 5 }).catch(() => ({ data: [] }))
      ])

      setRecentContacts(Array.isArray(contactsRes.data) ? contactsRes.data : [])
      setRecentDocuments(Array.isArray(documentsRes.data) ? documentsRes.data : [])
      setRecentNotes(Array.isArray(notesRes.data) ? notesRes.data : [])

      toast.success('Dashboard loaded successfully')
    } catch (error: any) {
      console.error('Failed to load dashboard:', error)
      setError('Failed to load dashboard data')
      
      if (error.response?.status === 401) {
        toast.error('Please sign in to access the dashboard')
        router.push('/login')
      } else {
        toast.error('Failed to load dashboard data')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearchConsultants = async () => {
    if (!searchQuery.trim()) {
      toast.error('Please enter a search query')
      return
    }

    setIsSearching(true)
    try {
      const response = await consultantSearchApi.search({
        q: searchQuery,
        limit: 10
      })

      const results = response.data?.consultants || response.data || []
      setSearchResults(results)
      
      if (results.length === 0) {
        toast.info('No consultants found matching your search')
      }
    } catch (error) {
      console.error('Search failed:', error)
      toast.error('Failed to search consultants')
    } finally {
      setIsSearching(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      prospect: { label: 'Prospect', className: 'bg-blue-100 text-blue-800 border-blue-200' },
      lead: { label: 'Lead', className: 'bg-purple-100 text-purple-800 border-purple-200' },
      active: { label: 'Active', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
      inactive: { label: 'Inactive', className: 'bg-gray-100 text-gray-800 border-gray-200' },
      churned: { label: 'Churned', className: 'bg-red-100 text-red-800 border-red-200' },
    }
    
    const config = statusConfig[status] || statusConfig.active
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border ${config.className}`}>
        {config.label}
      </span>
    )
  }

  const getTierBadge = (tier: string) => {
    const tierConfig: Record<string, { label: string; className: string }> = {
      strategic: { label: 'Strategic', className: 'bg-[#ffc451]/10 text-[#ffc451] border-[#ffc451]/30' },
      enterprise: { label: 'Enterprise', className: 'bg-purple-100 text-purple-800 border-purple-200' },
      mid_market: { label: 'Mid Market', className: 'bg-blue-100 text-blue-800 border-blue-200' },
      small_business: { label: 'Small Business', className: 'bg-green-100 text-green-800 border-green-200' },
      startup: { label: 'Startup', className: 'bg-orange-100 text-orange-800 border-orange-200' },
    }
    
    const config = tierConfig[tier] || tierConfig.small_business
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border ${config.className}`}>
        {config.label}
      </span>
    )
  }

  const getHealthScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600'
    if (score >= 60) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getRiskBadge = (level: string) => {
    const riskConfig: Record<string, { label: string; className: string }> = {
      none: { label: 'No Risk', className: 'bg-emerald-100 text-emerald-800' },
      low: { label: 'Low Risk', className: 'bg-blue-100 text-blue-800' },
      medium: { label: 'Medium Risk', className: 'bg-yellow-100 text-yellow-800' },
      high: { label: 'High Risk', className: 'bg-orange-100 text-orange-800' },
      critical: { label: 'Critical', className: 'bg-red-100 text-red-800' },
    }
    
    const config = riskConfig[level] || riskConfig.none
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${config.className}`}>
        {config.label}
      </span>
    )
  }

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
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

  // Mock data for charts (replace with real data from analytics)
  const COLORS = ['#ffc451', '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b']

  const monthlyRevenueData = [
    { month: 'Jul', revenue: 45000, projects: 3 },
    { month: 'Aug', revenue: 52000, projects: 4 },
    { month: 'Sep', revenue: 48000, projects: 3 },
    { month: 'Oct', revenue: 61000, projects: 5 },
    { month: 'Nov', revenue: 58000, projects: 4 },
    { month: 'Dec', revenue: 67000, projects: 6 },
  ]

  const projectStatusData = client?.projects
    ? [
        { name: 'Active', value: client.projects.filter(p => p.status === 'active').length, color: '#10b981' },
        { name: 'Completed', value: client.projects.filter(p => p.status === 'completed').length, color: '#3b82f6' },
        { name: 'On Hold', value: client.projects.filter(p => p.status === 'on_hold').length, color: '#f59e0b' },
        { name: 'Scheduled', value: client.projects.filter(p => p.status === 'scheduled').length, color: '#8b5cf6' },
      ].filter(item => item.value > 0)
    : []

  const engagementTrendData = [
    { month: 'Jul', logins: 45, interactions: 120 },
    { month: 'Aug', logins: 52, interactions: 135 },
    { month: 'Sep', logins: 48, interactions: 128 },
    { month: 'Oct', logins: 61, interactions: 156 },
    { month: 'Nov', logins: 58, interactions: 148 },
    { month: 'Dec', logins: 67, interactions: 178 },
  ]

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-2 rounded-lg shadow-lg border border-gray-200">
          <p className="text-[10px] font-medium text-gray-900">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-[9px] text-gray-600">
              {entry.name}: <span className="font-bold" style={{ color: entry.color }}>{entry.value}</span>
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center space-y-3">
          <div className="relative">
            <div className="w-12 h-12 mx-auto rounded-full bg-gradient-to-r from-[#ffc451] to-[#ffb020] animate-pulse" />
            <Loader2 className="h-6 w-6 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white animate-spin" />
          </div>
          <p className="text-xs font-medium text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  if (error && !client) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-red-200">
          <CardContent className="pt-6 text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-red-50 flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-red-500" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-gray-900">Failed to Load Dashboard</h3>
              <p className="text-xs text-gray-600">{error}</p>
            </div>
            <Button 
              onClick={loadDashboardData} 
              size="sm"
              className="w-full bg-gradient-to-r from-[#ffc451] to-[#ffb020] hover:from-[#ffb020] hover:to-[#ffc451] text-black font-medium"
            >
              Retry Loading
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="max-w-[1600px] mx-auto p-4 sm:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h1 className="text-lg font-bold text-gray-900">Client Enterprise Dashboard</h1>
            <p className="text-xs text-gray-500">
              Welcome back, <span className="text-[#ffc451] font-medium">{client?.companyName}</span> — Your comprehensive business overview
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8 text-xs"
              onClick={() => setIsSearchOpen(!isSearchOpen)}
            >
              <Search className="mr-1.5 h-3 w-3" />
              Find Consultants
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs">
              <Download className="mr-1.5 h-3 w-3" />
              Export Report
            </Button>
            <Link href="/client/profile">
              <Button size="sm" className="bg-gradient-to-r from-[#ffc451] to-[#ffb020] hover:from-[#ffb020] hover:to-[#ffc451] text-black font-medium text-xs h-8">
                <Edit className="mr-1.5 h-3 w-3" />
                Edit Profile
              </Button>
            </Link>
          </div>
        </div>

        {/* Consultant Search Section */}
        {isSearchOpen && (
          <Card className="border-[#ffc451]/20 bg-gradient-to-br from-[#ffc451]/5 to-white">
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                <Search className="h-3.5 w-3.5 text-[#ffc451]" />
                Search Consultants
              </CardTitle>
              <CardDescription className="text-[10px]">
                Find and connect with expert consultants for your business needs
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="flex gap-2 mb-3">
                <Input
                  placeholder="Search by name, skills, or expertise..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearchConsultants()}
                  className="h-8 text-xs"
                />
                <Button 
                  size="sm" 
                  onClick={handleSearchConsultants}
                  disabled={isSearching}
                  className="bg-gradient-to-r from-[#ffc451] to-[#ffb020] hover:from-[#ffb020] hover:to-[#ffc451] text-black font-medium h-8 px-4"
                >
                  {isSearching ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <Search className="mr-1.5 h-3 w-3" />
                      Search
                    </>
                  )}
                </Button>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-2">
                  {searchResults.map((consultant) => (
                    <Link key={consultant._id} href={`/client/consultants/${consultant._id}`}>
                      <div className="p-3 rounded-lg border border-gray-100 hover:border-[#ffc451]/30 bg-white hover:shadow-sm transition-all cursor-pointer group">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#ffc451] to-[#ffb020] flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-black">
                              {consultant.profile?.firstName?.[0]}{consultant.profile?.lastName?.[0]}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-semibold text-gray-900 group-hover:text-[#ffc451] transition-colors">
                              {consultant.profile?.firstName} {consultant.profile?.lastName}
                            </h4>
                            <p className="text-[10px] text-gray-600 capitalize">
                              {consultant.professional?.level} {consultant.professional?.specialization}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              {consultant.skills?.slice(0, 3).map((skill: any, idx: number) => (
                                <span key={idx} className="px-1.5 py-0.5 rounded text-[9px] bg-gray-100 text-gray-700">
                                  {skill.name}
                                </span>
                              ))}
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-[#ffc451] transition-colors" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Company Profile Section */}
        <div className="bg-white rounded-lg shadow-sm p-4 border border-[#ffc451]/20">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-[#ffc451] to-[#ffb020] flex items-center justify-center shadow-md">
                <Building2 className="h-7 w-7 text-black" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-900 mb-0.5">
                  {client?.companyName}
                </h2>
                <div className="flex items-center gap-2 text-xs text-gray-600 mb-1">
                  <span className="font-medium capitalize">{client?.businessDetails?.entityType || 'Corporation'}</span>
                  <span className="text-gray-300">|</span>
                  <span>{client?.industry?.primary?.sector || 'Technology'}</span>
                  <span className="text-gray-300">|</span>
                  <span className="text-gray-400 font-mono text-[10px]">{client?.clientCode}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-gray-500">
                  {client?.contacts?.primary?.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-2.5 w-2.5" />
                      {client.contacts.primary.email}
                    </span>
                  )}
                  {client?.contacts?.primary?.phone && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Phone className="h-2.5 w-2.5" />
                        {client.contacts.primary.phone}
                      </span>
                    </>
                  )}
                  {client?.addresses?.headquarters?.city && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-2.5 w-2.5" />
                        {client.addresses.headquarters.city}, {client.addresses.headquarters.country}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right space-y-2">
              <div className="flex items-center gap-2">
                {client?.relationship?.status && getStatusBadge(client.relationship.status)}
                {client?.relationship?.tier && getTierBadge(client.relationship.tier)}
              </div>
              <p className="text-[10px] text-gray-400">
                Member since {new Date(client?.createdAt || '').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
          <Card className="border-[#ffc451]/20 hover:border-[#ffc451]/40 transition-colors">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="w-7 h-7 rounded-lg bg-[#ffc451]/10 flex items-center justify-center">
                  <DollarSign className="h-3.5 w-3.5 text-[#ffc451]" />
                </div>
                <TrendingUp className="h-2.5 w-2.5 text-gray-400" />
              </div>
              <p className="text-lg font-bold text-gray-900">
                {formatCurrency(statistics?.financial?.totalRevenue || 0)}
              </p>
              <p className="text-[9px] font-medium text-gray-500 uppercase tracking-wide">Total Revenue</p>
              <p className="text-[9px] text-emerald-600 flex items-center gap-0.5 mt-1">
                <ArrowUpRight className="h-2 w-2" />
                Lifetime value
              </p>
            </CardContent>
          </Card>

          <Card className="border-emerald-500/20 hover:border-emerald-500/40 transition-colors">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <Briefcase className="h-3.5 w-3.5 text-emerald-600" />
                </div>
                <Activity className="h-2.5 w-2.5 text-gray-400" />
              </div>
              <p className="text-lg font-bold text-gray-900">{statistics?.engagement?.activeProjects || 0}</p>
              <p className="text-[9px] font-medium text-gray-500 uppercase tracking-wide">Active Projects</p>
              <p className="text-[9px] text-gray-500 mt-1">
                {statistics?.engagement?.totalProjects || 0} total
              </p>
            </CardContent>
          </Card>

          <Card className="border-blue-500/20 hover:border-blue-500/40 transition-colors">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <FileText className="h-3.5 w-3.5 text-blue-600" />
                </div>
                <Layers className="h-2.5 w-2.5 text-gray-400" />
              </div>
              <p className="text-lg font-bold text-gray-900">{client?.contracts?.length || 0}</p>
              <p className="text-[9px] font-medium text-gray-500 uppercase tracking-wide">Active Contracts</p>
              <p className="text-[9px] text-blue-600 mt-1">
                {client?.contracts?.filter(c => c.status === 'active').length || 0} active
              </p>
            </CardContent>
          </Card>

          <Card className="border-purple-500/20 hover:border-purple-500/40 transition-colors">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Users className="h-3.5 w-3.5 text-purple-600" />
                </div>
                <UserPlus className="h-2.5 w-2.5 text-gray-400" />
              </div>
              <p className="text-lg font-bold text-gray-900">{recentContacts.length}</p>
              <p className="text-[9px] font-medium text-gray-500 uppercase tracking-wide">Contacts</p>
              <p className="text-[9px] text-purple-600 mt-1">
                Your network
              </p>
            </CardContent>
          </Card>

          <Card className="border-yellow-500/20 hover:border-yellow-500/40 transition-colors">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="w-7 h-7 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                  <Star className="h-3.5 w-3.5 text-yellow-600" />
                </div>
                <Sparkles className="h-2.5 w-2.5 text-gray-400" />
              </div>
              <p className="text-lg font-bold text-gray-900">
                {statistics?.health?.healthScore || 0}
              </p>
              <p className="text-[9px] font-medium text-gray-500 uppercase tracking-wide">Health Score</p>
              <p className={`text-[9px] mt-1 ${getHealthScoreColor(statistics?.health?.healthScore || 0)}`}>
                {statistics?.health?.healthScore >= 80 ? 'Excellent' : statistics?.health?.healthScore >= 60 ? 'Good' : 'Needs attention'}
              </p>
            </CardContent>
          </Card>

          <Card className="border-orange-500/20 hover:border-orange-500/40 transition-colors">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center">
                  <CreditCard className="h-3.5 w-3.5 text-orange-600" />
                </div>
                <DollarSign className="h-2.5 w-2.5 text-gray-400" />
              </div>
              <p className="text-lg font-bold text-gray-900">
                {formatCurrency(statistics?.financial?.outstandingBalance || 0)}
              </p>
              <p className="text-[9px] font-medium text-gray-500 uppercase tracking-wide">Outstanding</p>
              <p className="text-[9px] text-orange-600 mt-1">
                Current balance
              </p>
            </CardContent>
          </Card>

          <Card className="border-indigo-500/20 hover:border-indigo-500/40 transition-colors">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                  <Folder className="h-3.5 w-3.5 text-indigo-600" />
                </div>
                <FileText className="h-2.5 w-2.5 text-gray-400" />
              </div>
              <p className="text-lg font-bold text-gray-900">{recentDocuments.length}</p>
              <p className="text-[9px] font-medium text-gray-500 uppercase tracking-wide">Documents</p>
              <p className="text-[9px] text-indigo-600 mt-1">
                Managed files
              </p>
            </CardContent>
          </Card>

          <Card className="border-pink-500/20 hover:border-pink-500/40 transition-colors">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="w-7 h-7 rounded-lg bg-pink-500/10 flex items-center justify-center">
                  <Activity className="h-3.5 w-3.5 text-pink-600" />
                </div>
                <Bell className="h-2.5 w-2.5 text-gray-400" />
              </div>
              <p className="text-lg font-bold text-gray-900">{statistics?.engagement?.portalLogins || 0}</p>
              <p className="text-[9px] font-medium text-gray-500 uppercase tracking-wide">Portal Logins</p>
              <p className="text-[9px] text-pink-600 mt-1">
                This quarter
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Left Column - 2 columns wide */}
          <div className="lg:col-span-2 space-y-4">
            {/* Relationship Health Overview */}
            <Card className="border-[#ffc451]/20">
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5 text-[#ffc451]" />
                  Relationship Health Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-medium text-gray-600">Health Score</span>
                      <span className={`text-xs font-bold ${getHealthScoreColor(statistics?.health?.healthScore || 0)}`}>
                        {statistics?.health?.healthScore || 0}/100
                      </span>
                    </div>
                    <Progress value={statistics?.health?.healthScore || 0} className="h-1.5" />
                    <p className="text-[9px] text-gray-500 mt-1">Overall relationship strength</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-medium text-gray-600">Satisfaction</span>
                      <span className="text-xs font-bold text-gray-900">{statistics?.health?.satisfaction || 0}/5.0</span>
                    </div>
                    <Progress value={(statistics?.health?.satisfaction || 0) * 20} className="h-1.5" />
                    <p className="text-[9px] text-emerald-600 mt-1">Highly satisfied</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-medium text-gray-600">Churn Risk</span>
                      {getRiskBadge(statistics?.health?.churnRisk || 'low')}
                    </div>
                    <Progress value={statistics?.health?.churnRisk === 'high' ? 80 : statistics?.health?.churnRisk === 'medium' ? 50 : 20} className="h-1.5" />
                    <p className="text-[9px] text-gray-500 mt-1">Risk assessment</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Revenue Analytics */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border-[#ffc451]/20">
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <BarChart3 className="h-3.5 w-3.5 text-[#ffc451]" />
                    Revenue Trend
                  </CardTitle>
                  <CardDescription className="text-[10px]">
                    Monthly revenue and project count
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={monthlyRevenueData}>
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ffc451" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#ffc451" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="month" 
                        tick={{ fontSize: 10, fill: '#6b7280' }}
                        axisLine={{ stroke: '#e5e7eb' }}
                      />
                      <YAxis 
                        tick={{ fontSize: 10, fill: '#6b7280' }}
                        axisLine={{ stroke: '#e5e7eb' }}
                        tickFormatter={(value) => `$${value / 1000}K`}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Area 
                        type="monotone" 
                        dataKey="revenue" 
                        stroke="#ffc451" 
                        strokeWidth={2}
                        fill="url(#colorRevenue)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                    <div className="text-[10px]">
                      <span className="text-gray-500">Total:</span>
                      <span className="font-bold text-gray-900 ml-1">
                        {formatCurrency(monthlyRevenueData.reduce((sum, m) => sum + m.revenue, 0))}
                      </span>
                    </div>
                    <div className="text-[10px] text-emerald-600 flex items-center gap-0.5">
                      <ArrowUpRight className="h-2.5 w-2.5" />
                      <span className="font-medium">+23% growth</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-[#ffc451]/20">
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <PieChart className="h-3.5 w-3.5 text-[#ffc451]" />
                    Project Distribution
                  </CardTitle>
                  <CardDescription className="text-[10px]">
                    Current project portfolio status
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  {projectStatusData.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={180}>
                        <RechartsPieChart>
                          <Pie
                            data={projectStatusData}
                            cx="50%"
                            cy="50%"
                            outerRadius={60}
                            dataKey="value"
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            labelLine={false}
                          >
                            {projectStatusData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                        </RechartsPieChart>
                      </ResponsiveContainer>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {projectStatusData.map((item, index) => (
                          <div key={index} className="flex items-center gap-1.5 text-[10px]">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="text-gray-600">{item.name}:</span>
                            <span className="font-medium text-gray-900">{item.value}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-12">
                      <Briefcase className="h-10 w-10 text-gray-400 mx-auto mb-2" />
                      <p className="text-xs text-gray-500">No project data available</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Engagement Trends */}
            <Card className="border-[#ffc451]/20">
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-[#ffc451]" />
                  Engagement Activity Trends
                </CardTitle>
                <CardDescription className="text-[10px]">
                  Portal logins and interaction metrics
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={engagementTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis 
                      dataKey="month" 
                      tick={{ fontSize: 10, fill: '#6b7280' }}
                      axisLine={{ stroke: '#e5e7eb' }}
                    />
                    <YAxis 
                      tick={{ fontSize: 10, fill: '#6b7280' }}
                      axisLine={{ stroke: '#e5e7eb' }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Line 
                      type="monotone" 
                      dataKey="logins" 
                      stroke="#ffc451" 
                      strokeWidth={2}
                      dot={{ fill: '#ffc451', r: 3 }}
                      name="Portal Logins"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="interactions" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      dot={{ fill: '#10b981', r: 3 }}
                      name="Interactions"
                    />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-3 text-[10px]">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-[#ffc451]" />
                      <span className="text-gray-600">Portal Logins</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-gray-600">Interactions</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-emerald-600 flex items-center gap-0.5">
                    <ArrowUpRight className="h-2.5 w-2.5" />
                    <span className="font-medium">Increasing engagement</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Active Projects */}
            <Card className="border-[#ffc451]/20">
              <CardHeader className="p-3 pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <Briefcase className="h-3.5 w-3.5 text-[#ffc451]" />
                    Active Projects
                  </CardTitle>
                  <Link href="/client/?tab=projects">
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] text-[#ffc451] hover:text-[#ffb020] hover:bg-[#ffc451]/10 px-2">
                      View All <ArrowRight className="ml-0.5 h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                {client?.projects && client.projects.filter(p => p.status === 'active').length > 0 ? (
                  <div className="space-y-2">
                    {client.projects
                      .filter(p => p.status === 'active')
                      .slice(0, 4)
                      .map((project, index) => (
                        <div key={index} className="p-2.5 rounded-lg border border-gray-100 hover:border-[#ffc451]/30 bg-white hover:shadow-sm transition-all group">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1 min-w-0">
                              <h4 className="text-xs font-semibold text-gray-900 group-hover:text-[#ffc451] transition-colors truncate">
                                {project.name}
                              </h4>
                              <p className="text-[10px] text-gray-500 truncate">{project.projectCode}</p>
                            </div>
                            <span className="px-2 py-0.5 rounded-md text-[9px] font-medium bg-emerald-50 text-emerald-600 border border-emerald-100 capitalize whitespace-nowrap ml-2">
                              {project.status}
                            </span>
                          </div>
                          {project.value && (
                            <p className="text-[10px] text-gray-600 mb-2">
                              Value: <span className="font-semibold text-gray-900">{formatCurrency(project.value)}</span>
                            </p>
                          )}
                          <div className="mt-2 pt-2 border-t border-gray-100">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-gray-500">Progress</span>
                              <span className="font-medium text-gray-900">{project.completionPercentage || 0}%</span>
                            </div>
                            <Progress value={project.completionPercentage || 0} className="h-1 mt-1" />
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Briefcase className="h-10 w-10 text-gray-400 mx-auto mb-2" />
                    <p className="text-xs font-medium text-gray-500">No active projects</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">New projects will appear here</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Contacts */}
            <Card className="border-[#ffc451]/20">
              <CardHeader className="p-3 pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-[#ffc451]" />
                    Recent Contacts
                  </CardTitle>
                  <Link href="/client/?tab=contacts">
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] text-[#ffc451] hover:text-[#ffb020] hover:bg-[#ffc451]/10 px-2">
                      View All <ArrowRight className="ml-0.5 h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                {recentContacts.length > 0 ? (
                  <div className="space-y-2">
                    {recentContacts.slice(0, 4).map((contact) => (
                      <div key={contact._id} className="flex items-center space-x-3 p-2.5 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                        <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-blue-600">
                            {contact.personalInfo?.firstName?.[0]}{contact.personalInfo?.lastName?.[0]}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">
                            {contact.personalInfo?.firstName} {contact.personalInfo?.lastName}
                          </p>
                          <p className="text-[10px] text-gray-600 truncate">
                            {contact.professionalInfo?.jobTitle || 'No title'}
                          </p>
                        </div>
                        <span className={`px-2 py-0.5 text-[9px] rounded-full ${
                          contact.status?.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {contact.status?.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Users className="h-10 w-10 text-gray-400 mx-auto mb-2" />
                    <p className="text-xs font-medium text-gray-500">No contacts yet</p>
                    <Link href="/client/?tab=contacts">
                      <Button size="sm" variant="outline" className="mt-3">
                        <UserPlus className="h-3 w-3 mr-1.5" />
                        Add Contact
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - 1 column wide */}
          <div className="space-y-4">
            {/* Account Manager */}
            {client?.relationship?.accountManager && (
              <Card className="border-[#ffc451]/20 bg-gradient-to-br from-[#ffc451]/5 to-white">
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-[#ffc451]" />
                    Your Account Manager
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#ffc451] to-[#ffb020] flex items-center justify-center">
                      <Users className="h-5 w-5 text-black" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-gray-900">
                        {client.relationship.accountManager.name || 'Account Manager'}
                      </p>
                      <p className="text-[10px] text-gray-600">Your dedicated contact</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                    <Button variant="outline" size="sm" className="w-full justify-start text-xs h-8">
                      <Mail className="mr-2 h-3 w-3" />
                      Send Message
                    </Button>
                    <Button variant="outline" size="sm" className="w-full justify-start text-xs h-8">
                      <Calendar className="mr-2 h-3 w-3" />
                      Schedule Meeting
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Quick Actions */}
            <Card className="border-[#ffc451]/20">
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-[#ffc451]" />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="space-y-2">
                  <Link href="/client/?tab=contacts">
                    <div className="p-2 rounded-lg border border-gray-200 hover:border-[#ffc451] bg-white hover:bg-[#ffc451]/5 transition-all cursor-pointer group">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                          <UserPlus className="h-3.5 w-3.5 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-[10px]">Add Contact</p>
                          <p className="text-[9px] text-gray-500">Manage your network</p>
                        </div>
                      </div>
                    </div>
                  </Link>
                  
                  <Link href="/client/?tab=documents">
                    <div className="p-2 rounded-lg border border-gray-200 hover:border-[#ffc451] bg-white hover:bg-[#ffc451]/5 transition-all cursor-pointer group">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                          <Upload className="h-3.5 w-3.5 text-emerald-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-[10px]">Upload Document</p>
                          <p className="text-[9px] text-gray-500">Add new files</p>
                        </div>
                      </div>
                    </div>
                  </Link>
                  
                  <Link href="/client/?tab=notes">
                    <div className="p-2 rounded-lg border border-gray-200 hover:border-[#ffc451] bg-white hover:bg-[#ffc451]/5 transition-all cursor-pointer group">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                          <StickyNote className="h-3.5 w-3.5 text-purple-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-[10px]">Create Note</p>
                          <p className="text-[9px] text-gray-500">Add observation</p>
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Recent Documents */}
            <Card className="border-[#ffc451]/20">
              <CardHeader className="p-3 pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-[#ffc451]" />
                    Recent Documents
                  </CardTitle>
                  <Link href="/client/?tab=documents">
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] text-[#ffc451] hover:text-[#ffb020] hover:bg-[#ffc451]/10 px-2">
                      View All
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                {recentDocuments.length > 0 ? (
                  <div className="space-y-2">
                    {recentDocuments.slice(0, 4).map((doc) => (
                      <div key={doc._id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                        <div className="text-xl">📄</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-medium text-gray-900 truncate">
                            {doc.documentInfo?.displayName || doc.documentInfo?.name}
                          </p>
                          <p className="text-[9px] text-gray-500">
                            {getRelativeTime(doc.createdAt)}
                          </p>
                        </div>
                        <Eye className="h-3 w-3 text-gray-400" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <FileText className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-xs text-gray-500">No documents yet</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Notes */}
            <Card className="border-[#ffc451]/20">
              <CardHeader className="p-3 pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <StickyNote className="h-3.5 w-3.5 text-[#ffc451]" />
                    Recent Notes
                  </CardTitle>
                  <Link href="/client/?tab=notes">
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] text-[#ffc451] hover:text-[#ffb020] hover:bg-[#ffc451]/10 px-2">
                      View All
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                {recentNotes.length > 0 ? (
                  <div className="space-y-2">
                    {recentNotes.slice(0, 4).map((note) => (
                      <div key={note._id} className="p-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                        <div className="flex items-start justify-between mb-1">
                          {note.content?.title && (
                            <h4 className="text-[10px] font-medium text-gray-900 line-clamp-1">
                              {note.content.title}
                            </h4>
                          )}
                          <span className="px-1.5 py-0.5 rounded text-[8px] bg-blue-100 text-blue-800 capitalize whitespace-nowrap ml-1">
                            {note.classification?.importance}
                          </span>
                        </div>
                        <p className="text-[9px] text-gray-600 line-clamp-2">{note.content?.body}</p>
                        <p className="text-[9px] text-gray-500 mt-1">{getRelativeTime(note.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <StickyNote className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-xs text-gray-500">No notes yet</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Achievement Highlights */}
            <Card className="border-[#ffc451]/20 bg-gradient-to-br from-[#ffc451]/5 to-white">
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <Trophy className="h-3.5 w-3.5 text-[#ffc451]" />
                  Partnership Milestones
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-white border border-[#ffc451]/20">
                    <div className="w-7 h-7 rounded-lg bg-[#ffc451]/10 flex items-center justify-center">
                      <Star className="h-3.5 w-3.5 text-[#ffc451]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-medium text-gray-900">Premier Client</p>
                      <p className="text-[9px] text-gray-500">Top tier partner</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-white border border-emerald-500/20">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-medium text-gray-900">Long-term Partner</p>
                      <p className="text-[9px] text-gray-500">
                        {Math.floor((new Date().getTime() - new Date(client?.createdAt || '').getTime()) / (1000 * 60 * 60 * 24 * 30))} months
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-white border border-blue-500/20">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Flame className="h-3.5 w-3.5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-medium text-gray-900">Active Engagement</p>
                      <p className="text-[9px] text-gray-500">High activity score</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}