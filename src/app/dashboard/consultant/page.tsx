'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
} from 'lucide-react'
import toast from 'react-hot-toast'
import { consultantApi, type ConsultantProfile, type Assignment, type AvailabilityRecord } from '@/lib/api/consultant'

interface DashboardStats {
  activeAssignments: number
  currentUtilization: number
  utilizationTarget: number
  totalSkills: number
  upcomingTimeOff: number
  feedbackCount: number
  completedProjects: number
  certifications: number
}

export default function ConsultantDashboard() {
  const router = useRouter()
  const [consultant, setConsultant] = useState<ConsultantProfile | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [timeOffRequests, setTimeOffRequests] = useState<AvailabilityRecord[]>([])
  const [stats, setStats] = useState<DashboardStats>({
    activeAssignments: 0,
    currentUtilization: 0,
    utilizationTarget: 0,
    totalSkills: 0,
    upcomingTimeOff: 0,
    feedbackCount: 0,
    completedProjects: 0,
    certifications: 0,
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

      const assignmentsData = await consultantApi.getMyAssignments()
      setAssignments(assignmentsData)

      const availabilityData = await consultantApi.getMyAvailability()
      setTimeOffRequests(availabilityData)

      const activeAssignments = assignmentsData.filter((a: Assignment) => a.status === 'active').length
      const upcomingTimeOff = availabilityData.filter(
        (a: AvailabilityRecord) => a.status === 'approved' && new Date(a.startDate) > new Date()
      ).length

      setStats({
        activeAssignments,
        currentUtilization: profileData.availability?.currentUtilization || 0,
        utilizationTarget: profileData.availability?.utilizationTarget || 80,
        totalSkills: profileData.skills?.length || 0,
        upcomingTimeOff,
        feedbackCount: profileData.performance?.feedback?.length || 0,
        completedProjects: assignmentsData.filter((a: Assignment) => a.status === 'completed').length,
        certifications: profileData.certifications?.length || 0,
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

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      available: { label: 'Available', variant: 'default' },
      partially_available: { label: 'Partially Available', variant: 'secondary' },
      unavailable: { label: 'Unavailable', variant: 'destructive' },
      on_leave: { label: 'On Leave', variant: 'secondary' },
      on_project: { label: 'On Project', variant: 'outline' },
    }
    
    const config = statusConfig[status] || statusConfig.available
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (error && !consultant) {
    return (
      <Card className="max-w-md mx-auto mt-8">
        <CardContent className="pt-6 text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <div>
            <h3 className="font-semibold mb-1">Failed to Load Dashboard</h3>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          <Button onClick={loadDashboardData} variant="outline">
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Consultant Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome back, {consultant?.profile?.preferredName || consultant?.profile?.firstName}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/consultant/profile">
            <Edit className="mr-2 h-3.5 w-3.5" />
            Edit Profile
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-semibold text-primary">
                {consultant?.profile?.firstName?.[0]}{consultant?.profile?.lastName?.[0]}
              </div>
              <div>
                <h2 className="text-lg font-semibold">
                  {consultant?.profile?.firstName} {consultant?.profile?.lastName}
                </h2>
                <p className="text-sm text-muted-foreground capitalize">
                  {consultant?.professional?.level} {consultant?.professional?.employmentType?.replace('_', ' ')}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Code: {consultant?.consultantCode}
                </p>
              </div>
            </div>
            <div className="text-right">
              {consultant?.availability?.status && getStatusBadge(consultant.availability.status)}
              <p className="text-xs text-muted-foreground mt-2">
                Member since {new Date(consultant?.createdAt || '').toLocaleDateString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <Briefcase className="h-3.5 w-3.5" />
              Active Projects
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeAssignments}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.completedProjects} completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5" />
              Utilization
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.currentUtilization}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              Target: {stats.utilizationTarget}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <Star className="h-3.5 w-3.5" />
              Skills
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalSkills}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.certifications} certifications
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5" />
              Upcoming Time Off
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.upcomingTimeOff}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Approved requests
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-4">
            <Button variant="outline" size="sm" className="justify-start" asChild>
              <Link href="/dashboard/consultant/availability">
                <Calendar className="mr-2 h-3.5 w-3.5" />
                Request Time Off
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="justify-start" asChild>
              <Link href="/dashboard/consultant/skills">
                <Plus className="mr-2 h-3.5 w-3.5" />
                Add Skill
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="justify-start" asChild>
              <Link href="/dashboard/consultant/certifications">
                <Award className="mr-2 h-3.5 w-3.5" />
                Add Certification
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="justify-start" asChild>
              <Link href="/dashboard/consultant/assignments">
                <Briefcase className="mr-2 h-3.5 w-3.5" />
                View All Projects
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Active Assignments</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/consultant/assignments">
                  View All <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {assignments.filter(a => a.status === 'active').length === 0 ? (
              <div className="text-center py-8">
                <Briefcase className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No active assignments</p>
              </div>
            ) : (
              <div className="space-y-3">
                {assignments
                  .filter(a => a.status === 'active')
                  .slice(0, 3)
                  .map((assignment) => (
                    <div key={assignment._id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="text-sm font-medium">{assignment.project.name}</h4>
                          <p className="text-xs text-muted-foreground">{assignment.project.client.name}</p>
                        </div>
                        <Badge variant="outline" className="text-xs">{assignment.role}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{assignment.allocation}% allocated</span>
                        <span>·</span>
                        <span>{new Date(assignment.startDate).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Feedback</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/consultant/feedback">
                  View All <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!consultant?.performance?.feedback || consultant.performance.feedback.length === 0 ? (
              <div className="text-center py-8">
                <Star className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No feedback yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {consultant.performance.feedback.slice(0, 3).map((feedback) => (
                  <div key={feedback._id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-start justify-between">
                      <Badge variant="secondary" className="text-xs capitalize">{feedback.type}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(feedback.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {feedback.rating && (
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`h-3 w-3 ${
                              i < feedback.rating!
                                ? 'fill-primary text-primary'
                                : 'text-muted-foreground/20'
                            }`}
                          />
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground line-clamp-2">{feedback.content}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}