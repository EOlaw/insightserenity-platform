'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  User,
  Briefcase,
  Calendar,
  Award,
  TrendingUp,
  Clock,
  Star,
  ArrowRight,
  Loader2,
  AlertCircle,
  Edit,
  Plus,
  Zap,
  Target,
  CheckCircle2,
  Activity,
  BarChart3,
  Users,
  Building2,
  FileText,
  DollarSign,
  Brain,
  BookOpen,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Bell,
  MessageSquare,
  Folder,
  Download,
  Upload,
  Eye,
  ChevronRight,
  Trophy,
  Flame,
  Layers,
  Globe,
  Mail,
  Phone,
  PieChart,
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
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Area,
  AreaChart,
} from 'recharts'
import toast from 'react-hot-toast'
import { consultantApi, type ConsultantProfile, type Assignment, type AvailabilityRecord, type DashboardAnalytics } from '@/lib/api/consultant'
import AvailabilityCalendar from '@/components/consultant/availability-calendar'

interface DashboardStats {
  activeAssignments: number
  currentUtilization: number
  utilizationTarget: number
  totalSkills: number
  upcomingTimeOff: number
  feedbackCount: number
  completedProjects: number
  certifications: number
  billableHours: number
  revenue: number
  clientSatisfaction: number
  responseTime: number
}

export default function ConsultantDashboard() {
  const router = useRouter()
  const [consultant, setConsultant] = useState<ConsultantProfile | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [timeOffRequests, setTimeOffRequests] = useState<AvailabilityRecord[]>([])
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null)
  const [stats, setStats] = useState<DashboardStats>({
    activeAssignments: 0,
    currentUtilization: 0,
    utilizationTarget: 0,
    totalSkills: 0,
    upcomingTimeOff: 0,
    feedbackCount: 0,
    completedProjects: 0,
    certifications: 0,
    billableHours: 0,
    revenue: 0,
    clientSatisfaction: 0,
    responseTime: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    setIsLoading(true)
    setError('')

    try {
      const profileData = await consultantApi.getMyProfile()
      setConsultant(profileData)

      const analyticsData = await consultantApi.getMyDashboardAnalytics(6)
      setAnalytics(analyticsData)

      const assignmentsResponse = await consultantApi.getMyAssignments()
      let assignmentsData: Assignment[]
      if (Array.isArray(assignmentsResponse)) {
        assignmentsData = assignmentsResponse
      } else if (assignmentsResponse && typeof assignmentsResponse === 'object' && 'data' in assignmentsResponse) {
        const extracted = (assignmentsResponse as any).data
        assignmentsData = Array.isArray(extracted) ? extracted : []
      } else {
        assignmentsData = []
      }
      setAssignments(assignmentsData)

      const availabilityResponse = await consultantApi.getMyAvailability()
      let availabilityData: AvailabilityRecord[]
      if (Array.isArray(availabilityResponse)) {
        availabilityData = availabilityResponse
      } else if (availabilityResponse && typeof availabilityResponse === 'object' && 'data' in availabilityResponse) {
        const extracted = (availabilityResponse as any).data
        availabilityData = Array.isArray(extracted) ? extracted : []
      } else {
        availabilityData = []
      }
      setTimeOffRequests(availabilityData)

      const upcomingTimeOff = Array.isArray(availabilityData)
        ? availabilityData.filter(
            (a: AvailabilityRecord) => {
              const startDate = new Date(a.period.startDate)
              return startDate > new Date()
            }
          ).length
        : 0

      setStats({
        activeAssignments: analyticsData.summary.activeAssignments,
        currentUtilization: analyticsData.summary.currentUtilization,
        utilizationTarget: profileData.availability?.utilizationTarget || 80,
        totalSkills: profileData.skills?.length || 0,
        upcomingTimeOff,
        feedbackCount: profileData.performance?.feedback?.length || 0,
        completedProjects: analyticsData.projectStatus.completed,
        certifications: analyticsData.activeCertifications.length,
        billableHours: analyticsData.summary.billableHoursLogged,
        revenue: analyticsData.summary.totalRevenue,
        clientSatisfaction: analyticsData.summary.averageSatisfaction,
        responseTime: 2.3,
      })

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

  const generateCalendarData = () => {
    const data = []
    const today = new Date()
    const currentMonth = today.getMonth()
    const currentYear = today.getFullYear()

    for (let i = 0; i < 30; i++) {
      const date = new Date(currentYear, currentMonth, today.getDate() + i)
      const dayOfWeek = date.getDay()

      if (dayOfWeek === 0 || dayOfWeek === 6) continue

      let status: 'available' | 'partially_available' | 'unavailable' | 'time_off' | 'on_project'
      let hours = 8
      let description = ''

      if (i % 10 === 0) {
        status = 'time_off'
        hours = 0
        description = 'Scheduled time off'
      } else if (i % 7 === 0) {
        status = 'partially_available'
        hours = 4
        description = 'Morning meetings, available afternoon'
      } else if (i % 5 === 0) {
        status = 'on_project'
        hours = 8
        description = 'Client engagement - Tech Innovations Inc'
      } else if (i % 3 === 0) {
        status = 'available'
        hours = 8
        description = 'Fully available for new assignments'
      } else {
        status = 'on_project'
        hours = 6
        description = 'Current project work'
      }

      data.push({
        date,
        status,
        hours,
        description,
      })
    }

    return data
  }

  const calendarAvailabilityData = generateCalendarData()

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      available: { label: 'Available', className: 'bg-[#ffc451]/10 text-[#ffc451] border-[#ffc451]/30' },
      partially_available: { label: 'Partial', className: 'bg-orange-500/10 text-orange-600 border-orange-500/30' },
      unavailable: { label: 'Unavailable', className: 'bg-red-500/10 text-red-600 border-red-500/30' },
      on_leave: { label: 'On Leave', className: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
      on_project: { label: 'On Project', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
    }
    
    const config = statusConfig[status] || statusConfig.available
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border ${config.className}`}>
        {config.label}
      </span>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center space-y-3">
          <div className="relative">
            <div className="w-12 h-12 mx-auto rounded-full bg-gradient-to-r from-[#ffc451] to-[#ffb020] animate-pulse" />
            <Loader2 className="h-6 w-6 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white animate-spin" />
          </div>
          <p className="text-xs font-medium text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (error && !consultant) {
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

  const topSkills = consultant?.skills?.slice(0, 5) || []
  const recentActivities = [
    { id: 1, type: 'assignment', title: 'Started new project: Digital Transformation', time: '2 hours ago', icon: Briefcase },
    { id: 2, type: 'feedback', title: 'Received client feedback: Excellent work', time: '5 hours ago', icon: Star },
    { id: 3, type: 'certification', title: 'Completed: AWS Solutions Architect', time: '1 day ago', icon: Award },
    { id: 4, type: 'document', title: 'Uploaded proposal: Q1 Strategy Document', time: '2 days ago', icon: Upload },
  ]

  const upcomingEvents = [
    { id: 1, title: 'Client Presentation: Tech Modernization', date: 'Dec 15, 2025', time: '2:00 PM', type: 'meeting' },
    { id: 2, title: 'Training: Advanced Cloud Architecture', date: 'Dec 18, 2025', time: '10:00 AM', type: 'training' },
    { id: 3, title: 'Project Deadline: Infrastructure Audit', date: 'Dec 20, 2025', time: 'EOD', type: 'deadline' },
  ]

  const learningRecommendations = [
    { id: 1, title: 'Advanced Data Analytics Certification', provider: 'Coursera', duration: '6 weeks', relevance: 95 },
    { id: 2, title: 'Leadership & Strategy Workshop', provider: 'Harvard Business', duration: '3 days', relevance: 88 },
    { id: 3, title: 'Cloud Security Fundamentals', provider: 'AWS Training', duration: '4 weeks', relevance: 82 },
  ]

  const COLORS = ['#ffc451', '#10b981', '#3b82f6', '#8b5cf6', '#6b7280']
  
  const revenueByClientData = analytics?.revenueByClient.length 
    ? analytics.revenueByClient.map((client, index) => ({
        name: client.clientName,
        value: client.revenue,
        color: COLORS[index % COLORS.length]
      }))
    : [
        { name: 'Tech Innovations Inc', value: 45000, color: '#ffc451' },
        { name: 'Global Finance Corp', value: 32000, color: '#10b981' },
        { name: 'Healthcare Systems', value: 28000, color: '#3b82f6' },
        { name: 'Retail Solutions Ltd', value: 18000, color: '#8b5cf6' },
        { name: 'Others', value: 12000, color: '#6b7280' },
      ]

  const monthlyRevenueData = analytics?.monthlyRevenue.length
    ? analytics.monthlyRevenue.map(m => ({
        month: m.label.split(' ')[0],
        revenue: m.revenue,
        billableHours: Math.round(m.revenue / 150)
      }))
    : [
        { month: 'Jul', revenue: 28000, billableHours: 180 },
        { month: 'Aug', revenue: 32000, billableHours: 210 },
        { month: 'Sep', revenue: 29000, billableHours: 195 },
        { month: 'Oct', revenue: 35000, billableHours: 220 },
        { month: 'Nov', revenue: 38000, billableHours: 240 },
        { month: 'Dec', revenue: 41000, billableHours: 260 },
      ]

  const utilizationTrendData = analytics?.utilizationTrends.length
    ? analytics.utilizationTrends.map(u => ({
        month: u.label.split(' ')[0],
        utilization: u.utilization,
        target: stats.utilizationTarget
      }))
    : [
        { month: 'Jul', utilization: 72, target: 80 },
        { month: 'Aug', utilization: 76, target: 80 },
        { month: 'Sep', utilization: 74, target: 80 },
        { month: 'Oct', utilization: 79, target: 80 },
        { month: 'Nov', utilization: 82, target: 80 },
        { month: 'Dec', utilization: 85, target: 80 },
      ]

  const projectStatusData = analytics?.projectStatus
    ? [
        { name: 'Active', value: analytics.projectStatus.active, color: '#10b981' },
        { name: 'Completed', value: analytics.projectStatus.completed, color: '#3b82f6' },
        { name: 'On Hold', value: analytics.projectStatus.on_hold, color: '#f59e0b' },
        { name: 'Scheduled', value: analytics.projectStatus.scheduled, color: '#8b5cf6' },
      ].filter(item => item.value > 0)
    : [
        { name: 'Active', value: stats.activeAssignments, color: '#10b981' },
        { name: 'Completed', value: stats.completedProjects, color: '#3b82f6' },
        { name: 'On Hold', value: 1, color: '#f59e0b' },
        { name: 'Scheduled', value: 2, color: '#8b5cf6' },
      ]

  const skillsProficiencyData = analytics?.skillsProficiency.length
    ? analytics.skillsProficiency.map(s => ({
        skill: s.skill,
        proficiency: s.proficiency
      }))
    : [
        { skill: 'Strategy', proficiency: 90 },
        { skill: 'Analytics', proficiency: 85 },
        { skill: 'Leadership', proficiency: 88 },
        { skill: 'Technology', proficiency: 82 },
        { skill: 'Communication', proficiency: 92 },
        { skill: 'Finance', proficiency: 78 },
      ]

  const clientSatisfactionData = analytics?.clientSatisfaction.length
    ? analytics.clientSatisfaction.map(c => ({
        month: c.label.split(' ')[0],
        rating: c.satisfaction
      }))
    : [
        { month: 'Jul', rating: 4.5 },
        { month: 'Aug', rating: 4.6 },
        { month: 'Sep', rating: 4.5 },
        { month: 'Oct', rating: 4.7 },
        { month: 'Nov', rating: 4.8 },
        { month: 'Dec', rating: 4.7 },
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="max-w-[1600px] mx-auto p-4 sm:p-6 space-y-4">
        {/* Compact Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h1 className="text-lg font-bold text-gray-900">Enterprise Consultant Dashboard</h1>
            <p className="text-xs text-gray-500">
              Welcome back, <span className="text-[#ffc451] font-medium">{consultant?.profile?.preferredName || consultant?.profile?.firstName}</span> — Your comprehensive performance overview
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs">
              <Download className="mr-1.5 h-3 w-3" />
              Export Report
            </Button>
            <Link href="/consultant/profile">
              <Button size="sm" className="bg-gradient-to-r from-[#ffc451] to-[#ffb020] hover:from-[#ffb020] hover:to-[#ffc451] text-black font-medium text-xs h-8">
                <Edit className="mr-1.5 h-3 w-3" />
                Edit Profile
              </Button>
            </Link>
          </div>
        </div>

        {/* Enhanced Profile Section */}
        <div className="bg-white rounded-lg shadow-sm p-4 border border-[#ffc451]/20">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#ffc451] to-[#ffb020] flex items-center justify-center shadow-md">
                  <span className="text-base font-bold text-black">
                    {consultant?.profile?.firstName?.[0]}{consultant?.profile?.lastName?.[0]}
                  </span>
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white animate-pulse" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-900 mb-0.5">
                  {consultant?.profile?.firstName} {consultant?.profile?.lastName}
                </h2>
                <div className="flex items-center gap-2 text-xs text-gray-600 mb-1">
                  <span className="font-medium capitalize">{consultant?.professional?.level}</span>
                  <span className="text-gray-300">|</span>
                  <span className="capitalize">{consultant?.professional?.employmentType?.replace('_', ' ')}</span>
                  <span className="text-gray-300">|</span>
                  <span className="text-gray-400 font-mono text-[10px]">{consultant?.consultantCode}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-gray-500">
                  <span className="flex items-center gap-1">
                    <Mail className="h-2.5 w-2.5" />
                    {consultant?.contact?.email?.primary}
                  </span>
                  {consultant?.contact?.phone?.mobile && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Phone className="h-2.5 w-2.5" />
                        {consultant?.contact?.phone?.mobile}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right space-y-2">
              {consultant?.availability?.status && getStatusBadge(consultant.availability.status)}
              <p className="text-[10px] text-gray-400">
                Member since {new Date(consultant?.createdAt || '').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>
          
          {consultant?.profile?.summary && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-600 line-clamp-2">{consultant.profile.summary}</p>
            </div>
          )}
        </div>

        {/* Comprehensive Stats Grid */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
          <Card className="border-[#ffc451]/20 hover:border-[#ffc451]/40 transition-colors">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="w-7 h-7 rounded-lg bg-[#ffc451]/10 flex items-center justify-center">
                  <Briefcase className="h-3.5 w-3.5 text-[#ffc451]" />
                </div>
                <Activity className="h-2.5 w-2.5 text-gray-400" />
              </div>
              <p className="text-lg font-bold text-gray-900">{stats.activeAssignments}</p>
              <p className="text-[9px] font-medium text-gray-500 uppercase tracking-wide">Active Projects</p>
              <p className="text-[9px] text-emerald-600 flex items-center gap-0.5 mt-1">
                <ArrowUpRight className="h-2 w-2" />
                {stats.completedProjects} completed
              </p>
            </CardContent>
          </Card>

          <Card className="border-emerald-500/20 hover:border-emerald-500/40 transition-colors">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                </div>
                <Target className="h-2.5 w-2.5 text-gray-400" />
              </div>
              <p className="text-lg font-bold text-gray-900">{stats.currentUtilization}%</p>
              <p className="text-[9px] font-medium text-gray-500 uppercase tracking-wide">Utilization</p>
              <p className="text-[9px] text-gray-500 mt-1">
                Target: {stats.utilizationTarget}%
              </p>
            </CardContent>
          </Card>

          <Card className="border-blue-500/20 hover:border-blue-500/40 transition-colors">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Clock className="h-3.5 w-3.5 text-blue-600" />
                </div>
                <BarChart3 className="h-2.5 w-2.5 text-gray-400" />
              </div>
              <p className="text-lg font-bold text-gray-900">{stats.billableHours}</p>
              <p className="text-[9px] font-medium text-gray-500 uppercase tracking-wide">Billable Hours</p>
              <p className="text-[9px] text-blue-600 flex items-center gap-0.5 mt-1">
                <ArrowUpRight className="h-2 w-2" />
                This quarter
              </p>
            </CardContent>
          </Card>

          <Card className="border-purple-500/20 hover:border-purple-500/40 transition-colors">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <DollarSign className="h-3.5 w-3.5 text-purple-600" />
                </div>
                <TrendingUp className="h-2.5 w-2.5 text-gray-400" />
              </div>
              <p className="text-lg font-bold text-gray-900">${(stats.revenue / 1000).toFixed(0)}K</p>
              <p className="text-[9px] font-medium text-gray-500 uppercase tracking-wide">Revenue</p>
              <p className="text-[9px] text-emerald-600 flex items-center gap-0.5 mt-1">
                <ArrowUpRight className="h-2 w-2" />
                +12% vs last quarter
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
              <p className="text-lg font-bold text-gray-900">{stats.clientSatisfaction}</p>
              <p className="text-[9px] font-medium text-gray-500 uppercase tracking-wide">Client Rating</p>
              <p className="text-[9px] text-yellow-600 mt-1">
                Excellent performance
              </p>
            </CardContent>
          </Card>

          <Card className="border-indigo-500/20 hover:border-indigo-500/40 transition-colors">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                  <Zap className="h-3.5 w-3.5 text-indigo-600" />
                </div>
                <Brain className="h-2.5 w-2.5 text-gray-400" />
              </div>
              <p className="text-lg font-bold text-gray-900">{stats.totalSkills}</p>
              <p className="text-[9px] font-medium text-gray-500 uppercase tracking-wide">Skills</p>
              <p className="text-[9px] text-indigo-600 flex items-center gap-0.5 mt-1">
                <Award className="h-2 w-2" />
                {stats.certifications} certified
              </p>
            </CardContent>
          </Card>

          <Card className="border-pink-500/20 hover:border-pink-500/40 transition-colors">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="w-7 h-7 rounded-lg bg-pink-500/10 flex items-center justify-center">
                  <MessageSquare className="h-3.5 w-3.5 text-pink-600" />
                </div>
                <Clock className="h-2.5 w-2.5 text-gray-400" />
              </div>
              <p className="text-lg font-bold text-gray-900">{stats.responseTime}h</p>
              <p className="text-[9px] font-medium text-gray-500 uppercase tracking-wide">Response Time</p>
              <p className="text-[9px] text-emerald-600 flex items-center gap-0.5 mt-1">
                <ArrowDownRight className="h-2 w-2" />
                Fast responder
              </p>
            </CardContent>
          </Card>

          <Card className="border-orange-500/20 hover:border-orange-500/40 transition-colors">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center">
                  <Calendar className="h-3.5 w-3.5 text-orange-600" />
                </div>
                <Bell className="h-2.5 w-2.5 text-gray-400" />
              </div>
              <p className="text-lg font-bold text-gray-900">{stats.upcomingTimeOff}</p>
              <p className="text-[9px] font-medium text-gray-500 uppercase tracking-wide">Time Off</p>
              <p className="text-[9px] text-gray-500 mt-1">
                Approved requests
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Left Column - 2 columns wide */}
          <div className="lg:col-span-2 space-y-4">
            {/* Performance Overview */}
            <Card className="border-[#ffc451]/20">
              <CardHeader className="p-3 pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <BarChart3 className="h-3.5 w-3.5 text-[#ffc451]" />
                    Performance Overview
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] text-[#ffc451] hover:text-[#ffb020] hover:bg-[#ffc451]/10 px-2">
                    Details <ChevronRight className="ml-0.5 h-3 w-3" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-medium text-gray-600">Utilization Rate</span>
                        <span className="text-xs font-bold text-gray-900">{stats.currentUtilization}%</span>
                      </div>
                      <Progress value={stats.currentUtilization} className="h-1.5" />
                      <p className="text-[9px] text-gray-500 mt-1">Target: {stats.utilizationTarget}%</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-medium text-gray-600">Client Satisfaction</span>
                        <span className="text-xs font-bold text-gray-900">{stats.clientSatisfaction}/5.0</span>
                      </div>
                      <Progress value={(stats.clientSatisfaction / 5) * 100} className="h-1.5" />
                      <p className="text-[9px] text-emerald-600 mt-1">Above average</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-medium text-gray-600">Project Delivery</span>
                        <span className="text-xs font-bold text-gray-900">96%</span>
                      </div>
                      <Progress value={96} className="h-1.5" />
                      <p className="text-[9px] text-emerald-600 mt-1">On-time completion</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-medium text-gray-600">Skills Development</span>
                        <span className="text-xs font-bold text-gray-900">78%</span>
                      </div>
                      <Progress value={78} className="h-1.5" />
                      <p className="text-[9px] text-blue-600 mt-1">2 new certifications</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-medium text-gray-600">Revenue Growth</span>
                        <span className="text-xs font-bold text-gray-900">112%</span>
                      </div>
                      <Progress value={100} className="h-1.5" />
                      <p className="text-[9px] text-emerald-600 mt-1">+12% vs last quarter</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-medium text-gray-600">Team Collaboration</span>
                        <span className="text-xs font-bold text-gray-900">89%</span>
                      </div>
                      <Progress value={89} className="h-1.5" />
                      <p className="text-[9px] text-gray-500 mt-1">High engagement</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Revenue & Billing Analytics */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border-[#ffc451]/20">
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <PieChart className="h-3.5 w-3.5 text-[#ffc451]" />
                    Revenue by Client
                  </CardTitle>
                  <CardDescription className="text-[10px]">
                    Distribution across active engagements
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <ResponsiveContainer width="100%" height={200}>
                    <RechartsPieChart>
                      <Pie
                        data={revenueByClientData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {revenueByClientData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1 mt-2">
                    {revenueByClientData.map((item, index) => (
                      <div key={index} className="flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-gray-600 truncate">{item.name}</span>
                        </div>
                        <span className="font-medium text-gray-900">${(item.value / 1000).toFixed(0)}K</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-[#ffc451]/20">
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <BarChart3 className="h-3.5 w-3.5 text-[#ffc451]" />
                    Monthly Revenue Trend
                  </CardTitle>
                  <CardDescription className="text-[10px]">
                    Revenue and billable hours over time
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
                      <span className="text-gray-500">Total Revenue:</span>
                      <span className="font-bold text-gray-900 ml-1">${(monthlyRevenueData.reduce((sum, m) => sum + m.revenue, 0) / 1000).toFixed(0)}K</span>
                    </div>
                    <div className="text-[10px] text-emerald-600 flex items-center gap-0.5">
                      <ArrowUpRight className="h-2.5 w-2.5" />
                      <span className="font-medium">+18% growth</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Utilization & Performance Trends */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border-[#ffc451]/20">
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-[#ffc451]" />
                    Utilization Trend
                  </CardTitle>
                  <CardDescription className="text-[10px]">
                    Monthly utilization vs target
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={utilizationTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="month" 
                        tick={{ fontSize: 10, fill: '#6b7280' }}
                        axisLine={{ stroke: '#e5e7eb' }}
                      />
                      <YAxis 
                        tick={{ fontSize: 10, fill: '#6b7280' }}
                        axisLine={{ stroke: '#e5e7eb' }}
                        domain={[0, 100]}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Line 
                        type="monotone" 
                        dataKey="utilization" 
                        stroke="#10b981" 
                        strokeWidth={2}
                        dot={{ fill: '#10b981', r: 3 }}
                        name="Actual"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="target" 
                        stroke="#ffc451" 
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={{ fill: '#ffc451', r: 3 }}
                        name="Target"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-3 text-[10px]">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-gray-600">Actual</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-[#ffc451]" />
                        <span className="text-gray-600">Target</span>
                      </div>
                    </div>
                    <div className="text-[10px] text-emerald-600 flex items-center gap-0.5">
                      <ArrowUpRight className="h-2.5 w-2.5" />
                      <span className="font-medium">Above target</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-[#ffc451]/20">
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <Star className="h-3.5 w-3.5 text-[#ffc451]" />
                    Client Satisfaction Trend
                  </CardTitle>
                  <CardDescription className="text-[10px]">
                    Average rating over time
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={clientSatisfactionData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="month" 
                        tick={{ fontSize: 10, fill: '#6b7280' }}
                        axisLine={{ stroke: '#e5e7eb' }}
                      />
                      <YAxis 
                        tick={{ fontSize: 10, fill: '#6b7280' }}
                        axisLine={{ stroke: '#e5e7eb' }}
                        domain={[0, 5]}
                        ticks={[0, 1, 2, 3, 4, 5]}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Line 
                        type="monotone" 
                        dataKey="rating" 
                        stroke="#ffc451" 
                        strokeWidth={2}
                        dot={{ fill: '#ffc451', r: 4 }}
                        name="Rating"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                    <div className="text-[10px]">
                      <span className="text-gray-500">Average Rating:</span>
                      <span className="font-bold text-gray-900 ml-1">{stats.clientSatisfaction}/5.0</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`h-3 w-3 ${
                            i < Math.floor(stats.clientSatisfaction)
                              ? 'fill-[#ffc451] text-[#ffc451]'
                              : 'text-gray-300'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Project Distribution & Skills */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border-[#ffc451]/20">
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-[#ffc451]" />
                    Project Status Distribution
                  </CardTitle>
                  <CardDescription className="text-[10px]">
                    Current portfolio breakdown
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <ResponsiveContainer width="100%" height={200}>
                    <RechartsPieChart>
                      <Pie
                        data={projectStatusData}
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
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
                </CardContent>
              </Card>

              <Card className="border-[#ffc451]/20">
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <Brain className="h-3.5 w-3.5 text-[#ffc451]" />
                    Skills Proficiency Matrix
                  </CardTitle>
                  <CardDescription className="text-[10px]">
                    Core competency assessment
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <ResponsiveContainer width="100%" height={200}>
                    <RadarChart data={skillsProficiencyData}>
                      <PolarGrid stroke="#e5e7eb" />
                      <PolarAngleAxis 
                        dataKey="skill" 
                        tick={{ fontSize: 9, fill: '#6b7280' }}
                      />
                      <PolarRadiusAxis 
                        angle={90} 
                        domain={[0, 100]}
                        tick={{ fontSize: 9, fill: '#6b7280' }}
                      />
                      <Radar 
                        name="Proficiency" 
                        dataKey="proficiency" 
                        stroke="#ffc451" 
                        fill="#ffc451" 
                        fillOpacity={0.3}
                        strokeWidth={2}
                      />
                      <Tooltip content={<CustomTooltip />} />
                    </RadarChart>
                  </ResponsiveContainer>
                  <div className="text-center mt-2 pt-2 border-t border-gray-100">
                    <div className="text-[10px]">
                      <span className="text-gray-500">Average Proficiency:</span>
                      <span className="font-bold text-gray-900 ml-1">
                        {(skillsProficiencyData.reduce((sum, s) => sum + s.proficiency, 0) / skillsProficiencyData.length).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Skills Proficiency */}
            <Card className="border-[#ffc451]/20">
              <CardHeader className="p-3 pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <Brain className="h-3.5 w-3.5 text-[#ffc451]" />
                    Top Skills Proficiency
                  </CardTitle>
                  <Link href="/consultant/skills">
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] text-[#ffc451] hover:text-[#ffb020] hover:bg-[#ffc451]/10 px-2">
                      Manage <ArrowRight className="ml-0.5 h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                {topSkills.length === 0 ? (
                  <div className="text-center py-6">
                    <Brain className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-xs text-gray-500">No skills added yet</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {topSkills.map((skill: any, index: number) => (
                      <div key={index}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-900">{skill.name}</span>
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 capitalize">
                              {skill.proficiencyLevel}
                            </Badge>
                          </div>
                          <span className="text-xs font-bold text-gray-900">
                            {skill.proficiencyLevel === 'expert' ? 95 : 
                             skill.proficiencyLevel === 'advanced' ? 85 : 
                             skill.proficiencyLevel === 'intermediate' ? 70 : 50}%
                          </span>
                        </div>
                        <Progress value={
                          skill.proficiencyLevel === 'expert' ? 95 : 
                          skill.proficiencyLevel === 'advanced' ? 85 : 
                          skill.proficiencyLevel === 'intermediate' ? 70 : 50
                        } className="h-1.5" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Active Assignments */}
            <Card className="border-[#ffc451]/20">
              <CardHeader className="p-3 pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <Briefcase className="h-3.5 w-3.5 text-[#ffc451]" />
                    Active Project Assignments
                  </CardTitle>
                  <Link href="/consultant/assignments">
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] text-[#ffc451] hover:text-[#ffb020] hover:bg-[#ffc451]/10 px-2">
                      View All <ArrowRight className="ml-0.5 h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                {!assignments || assignments.filter(a => a.status === 'active').length === 0 ? (
                  <div className="text-center py-8">
                    <Briefcase className="h-10 w-10 text-gray-400 mx-auto mb-2" />
                    <p className="text-xs font-medium text-gray-500">No active assignments</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">New projects will appear here</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {assignments
                      .filter(a => a.status === 'active')
                      .slice(0, 4)
                      .map((assignment) => (
                        <div key={assignment._id} className="p-2.5 rounded-lg border border-gray-100 hover:border-[#ffc451]/30 bg-white hover:shadow-sm transition-all group">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1 min-w-0">
                              <h4 className="text-xs font-semibold text-gray-900 group-hover:text-[#ffc451] transition-colors truncate">{assignment.project.name}</h4>
                              <p className="text-[10px] text-gray-500 truncate flex items-center gap-1 mt-0.5">
                                <Building2 className="h-2.5 w-2.5" />
                                {assignment.project.client.name}
                              </p>
                            </div>
                            <span className="px-2 py-0.5 rounded-md text-[9px] font-medium bg-[#ffc451]/10 text-[#ffc451] border border-[#ffc451]/20 capitalize whitespace-nowrap ml-2">
                              {assignment.role}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-gray-500">
                            <span className="flex items-center gap-1">
                              <TrendingUp className="h-2.5 w-2.5 text-emerald-500" />
                              {assignment.allocation}% allocated
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-2.5 w-2.5 text-blue-500" />
                              {new Date(assignment.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                          <div className="mt-2 pt-2 border-t border-gray-100">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-gray-500">Progress</span>
                              <span className="font-medium text-gray-900">67%</span>
                            </div>
                            <Progress value={67} className="h-1 mt-1" />
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Feedback */}
            <Card className="border-[#ffc451]/20">
              <CardHeader className="p-3 pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <Star className="h-3.5 w-3.5 text-[#ffc451]" />
                    Recent Client Feedback
                  </CardTitle>
                  <Link href="/consultant/feedback">
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] text-[#ffc451] hover:text-[#ffb020] hover:bg-[#ffc451]/10 px-2">
                      View All <ArrowRight className="ml-0.5 h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                {!consultant?.performance?.feedback || consultant.performance.feedback.length === 0 ? (
                  <div className="text-center py-8">
                    <Star className="h-10 w-10 text-gray-400 mx-auto mb-2" />
                    <p className="text-xs font-medium text-gray-500">No feedback yet</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Client feedback will appear here</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {consultant.performance.feedback.slice(0, 3).map((feedback) => (
                      <div key={feedback._id} className="p-2.5 rounded-lg border border-gray-100 hover:border-[#ffc451]/30 bg-white hover:shadow-sm transition-all">
                        <div className="flex items-start justify-between mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-md text-[9px] font-medium bg-blue-50 text-blue-600 border border-blue-100 capitalize">
                              {feedback.type}
                            </span>
                            {feedback.rating && (
                              <div className="flex items-center gap-0.5">
                                {Array.from({ length: 5 }).map((_, i) => (
                                  <Star
                                    key={i}
                                    className={`h-2.5 w-2.5 ${
                                      i < feedback.rating!
                                        ? 'fill-[#ffc451] text-[#ffc451]'
                                        : 'text-gray-300'
                                    }`}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                          <span className="text-[10px] text-gray-400">
                            {new Date(feedback.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-600 line-clamp-2 leading-relaxed">{feedback.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - 1 column wide */}
          <div className="space-y-4">
            {/* Availability Calendar */}
            <Card className="border-[#ffc451]/20">
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-[#ffc451]" />
                  Availability Calendar
                </CardTitle>
                <CardDescription className="text-[10px]">
                  Click dates to manage your schedule
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <AvailabilityCalendar availabilityData={calendarAvailabilityData} />
              </CardContent>
            </Card>

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
                  <Link href="/consultant/availability">
                    <div className="p-2 rounded-lg border border-gray-200 hover:border-[#ffc451] bg-white hover:bg-[#ffc451]/5 transition-all cursor-pointer group">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-[#ffc451]/10 flex items-center justify-center group-hover:bg-[#ffc451]/20 transition-colors">
                          <Calendar className="h-3.5 w-3.5 text-[#ffc451]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-[10px]">Request Time Off</p>
                          <p className="text-[9px] text-gray-500">Manage availability</p>
                        </div>
                      </div>
                    </div>
                  </Link>
                  
                  <Link href="/consultant/skills">
                    <div className="p-2 rounded-lg border border-gray-200 hover:border-[#ffc451] bg-white hover:bg-[#ffc451]/5 transition-all cursor-pointer group">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                          <Plus className="h-3.5 w-3.5 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-[10px]">Add New Skill</p>
                          <p className="text-[9px] text-gray-500">Update expertise</p>
                        </div>
                      </div>
                    </div>
                  </Link>
                  
                  <Link href="/consultant/certifications">
                    <div className="p-2 rounded-lg border border-gray-200 hover:border-[#ffc451] bg-white hover:bg-[#ffc451]/5 transition-all cursor-pointer group">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                          <Award className="h-3.5 w-3.5 text-emerald-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-[10px]">Add Certification</p>
                          <p className="text-[9px] text-gray-500">Record credentials</p>
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card className="border-[#ffc451]/20">
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-[#ffc451]" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="space-y-2">
                  {recentActivities.map((activity) => {
                    const Icon = activity.icon
                    return (
                      <div key={activity.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                        <div className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <Icon className="h-3 w-3 text-gray-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] text-gray-900 font-medium truncate">{activity.title}</p>
                          <p className="text-[9px] text-gray-500">{activity.time}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Upcoming Events */}
            <Card className="border-[#ffc451]/20">
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-[#ffc451]" />
                  Upcoming Events
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="space-y-2">
                  {upcomingEvents.map((event) => (
                    <div key={event.id} className="p-2 rounded-lg border border-gray-100 bg-white">
                      <p className="text-[10px] font-medium text-gray-900 mb-0.5">{event.title}</p>
                      <div className="flex items-center gap-2 text-[9px] text-gray-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-2.5 w-2.5" />
                          {event.date}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {event.time}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Learning Recommendations */}
            <Card className="border-[#ffc451]/20">
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5 text-[#ffc451]" />
                  Recommended Learning
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="space-y-2">
                  {learningRecommendations.map((course) => (
                    <div key={course.id} className="p-2 rounded-lg border border-gray-100 hover:border-[#ffc451]/30 bg-white hover:shadow-sm transition-all cursor-pointer group">
                      <div className="flex items-start justify-between mb-1">
                        <p className="text-[10px] font-medium text-gray-900 group-hover:text-[#ffc451] transition-colors line-clamp-2 flex-1">{course.title}</p>
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-medium bg-emerald-50 text-emerald-600 whitespace-nowrap ml-1">
                          {course.relevance}% match
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[9px] text-gray-500">
                        <span>{course.provider}</span>
                        <span>•</span>
                        <span>{course.duration}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Achievement Highlights */}
            <Card className="border-[#ffc451]/20 bg-gradient-to-br from-[#ffc451]/5 to-white">
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <Trophy className="h-3.5 w-3.5 text-[#ffc451]" />
                  Recent Achievements
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-white border border-[#ffc451]/20">
                    <div className="w-7 h-7 rounded-lg bg-[#ffc451]/10 flex items-center justify-center">
                      <Flame className="h-3.5 w-3.5 text-[#ffc451]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-medium text-gray-900">Top Performer</p>
                      <p className="text-[9px] text-gray-500">Q4 2025</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-white border border-emerald-500/20">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-medium text-gray-900">100% Delivery</p>
                      <p className="text-[9px] text-gray-500">Last 6 months</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-white border border-blue-500/20">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Star className="h-3.5 w-3.5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-medium text-gray-900">Client Favorite</p>
                      <p className="text-[9px] text-gray-500">5.0 avg rating</p>
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