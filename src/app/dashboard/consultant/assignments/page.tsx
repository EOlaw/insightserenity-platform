'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Briefcase,
  Calendar,
  Clock,
  TrendingUp,
  Building2,
  ArrowLeft,
  Loader2,
  CheckCircle,
  Circle,
  XCircle,
  Pause,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { consultantApi, type Assignment } from '@/lib/api/consultant'

export default function AssignmentsPage() {
  const router = useRouter()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    loadAssignments()
  }, [])

  const loadAssignments = async () => {
    setIsLoading(true)

    try {
      const data = await consultantApi.getMyAssignments()
      setAssignments(data)
      toast.success('Assignments loaded successfully')
    } catch (error: any) {
      console.error('Failed to load assignments:', error)
      toast.error('Failed to load assignments')
      
      if (error.response?.status === 401) {
        router.push('/login')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      scheduled: { label: 'Scheduled', variant: 'secondary' },
      active: { label: 'Active', variant: 'default' },
      completed: { label: 'Completed', variant: 'outline' },
      cancelled: { label: 'Cancelled', variant: 'destructive' },
      on_hold: { label: 'On Hold', variant: 'secondary' },
    }
    
    const config = statusConfig[status] || statusConfig.scheduled
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'completed':
        return <Circle className="h-4 w-4 text-muted-foreground" />
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-destructive" />
      case 'on_hold':
        return <Pause className="h-4 w-4 text-yellow-600" />
      default:
        return <Clock className="h-4 w-4 text-blue-600" />
    }
  }

  const calculateDuration = (startDate: string, endDate?: string) => {
    const start = new Date(startDate)
    const end = endDate ? new Date(endDate) : new Date()
    const diffTime = Math.abs(end.getTime() - start.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    const months = Math.floor(diffDays / 30)
    
    if (months === 0) {
      return `${diffDays} days`
    }
    return `${months} ${months === 1 ? 'month' : 'months'}`
  }

  const filteredAssignments = statusFilter === 'all' 
    ? assignments 
    : assignments.filter(a => a.status === statusFilter)

  const activeAssignments = assignments.filter(a => a.status === 'active')
  const completedAssignments = assignments.filter(a => a.status === 'completed')
  const upcomingAssignments = assignments.filter(a => a.status === 'scheduled')

  const totalAllocation = activeAssignments.reduce((sum, a) => sum + a.allocation, 0)
  const averageAllocation = activeAssignments.length > 0 
    ? Math.round(totalAllocation / activeAssignments.length) 
    : 0

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Loading assignments...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/consultant">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Project Assignments</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              View and manage your project engagements
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Active Projects</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeAssignments.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Currently assigned
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Allocation</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAllocation}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              Across all projects
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Completed Projects</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedAssignments.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Successfully delivered
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Upcoming Projects</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{upcomingAssignments.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Starting soon
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">All Assignments</CardTitle>
              <CardDescription className="mt-1">
                Complete list of your project engagements
              </CardDescription>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredAssignments.length === 0 ? (
            <div className="text-center py-12">
              <Briefcase className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
              <h3 className="font-semibold mb-2">No assignments found</h3>
              <p className="text-sm text-muted-foreground">
                {statusFilter === 'all' 
                  ? 'You have no project assignments yet' 
                  : `No ${statusFilter} assignments`}
              </p>
            </div>
          ) : (
            <Tabs defaultValue="active" className="space-y-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="active">
                  Active ({activeAssignments.length})
                </TabsTrigger>
                <TabsTrigger value="upcoming">
                  Upcoming ({upcomingAssignments.length})
                </TabsTrigger>
                <TabsTrigger value="completed">
                  Completed ({completedAssignments.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="active" className="space-y-4">
                {activeAssignments.length === 0 ? (
                  <div className="text-center py-8">
                    <Briefcase className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No active assignments</p>
                  </div>
                ) : (
                  activeAssignments.map((assignment) => (
                    <Card key={assignment._id}>
                      <CardContent className="pt-6">
                        <div className="space-y-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                {getStatusIcon(assignment.status)}
                                <h3 className="font-semibold">{assignment.project.name}</h3>
                                {getStatusBadge(assignment.status)}
                              </div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Building2 className="h-3.5 w-3.5" />
                                <span>{assignment.project.client.name}</span>
                              </div>
                            </div>
                            <Badge variant="outline" className="capitalize">
                              {assignment.role}
                            </Badge>
                          </div>

                          <Separator />

                          <div className="grid gap-4 md:grid-cols-3">
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Allocation</p>
                              <div className="flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-primary" />
                                <span className="font-semibold">{assignment.allocation}%</span>
                              </div>
                            </div>

                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Duration</p>
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-primary" />
                                <span className="font-semibold">
                                  {calculateDuration(assignment.startDate, assignment.endDate)}
                                </span>
                              </div>
                            </div>

                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Start Date</p>
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-primary" />
                                <span className="font-semibold">
                                  {new Date(assignment.startDate).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          </div>

                          {assignment.billableRate && (
                            <>
                              <Separator />
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Billable Rate</span>
                                <span className="font-semibold">${assignment.billableRate}/hour</span>
                              </div>
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              <TabsContent value="upcoming" className="space-y-4">
                {upcomingAssignments.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No upcoming assignments</p>
                  </div>
                ) : (
                  upcomingAssignments.map((assignment) => (
                    <Card key={assignment._id}>
                      <CardContent className="pt-6">
                        <div className="space-y-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                {getStatusIcon(assignment.status)}
                                <h3 className="font-semibold">{assignment.project.name}</h3>
                                {getStatusBadge(assignment.status)}
                              </div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Building2 className="h-3.5 w-3.5" />
                                <span>{assignment.project.client.name}</span>
                              </div>
                            </div>
                            <Badge variant="outline" className="capitalize">
                              {assignment.role}
                            </Badge>
                          </div>

                          <Separator />

                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Start Date</p>
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-primary" />
                                <span className="font-semibold">
                                  {new Date(assignment.startDate).toLocaleDateString()}
                                </span>
                              </div>
                            </div>

                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Allocation</p>
                              <div className="flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-primary" />
                                <span className="font-semibold">{assignment.allocation}%</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              <TabsContent value="completed" className="space-y-4">
                {completedAssignments.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No completed assignments</p>
                  </div>
                ) : (
                  completedAssignments.slice(0, 10).map((assignment) => (
                    <Card key={assignment._id}>
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              {getStatusIcon(assignment.status)}
                              <h3 className="font-semibold">{assignment.project.name}</h3>
                              {getStatusBadge(assignment.status)}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Building2 className="h-3.5 w-3.5" />
                              <span>{assignment.project.client.name}</span>
                              <span>·</span>
                              <span className="capitalize">{assignment.role}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                              <span>
                                {new Date(assignment.startDate).toLocaleDateString()} - {assignment.endDate ? new Date(assignment.endDate).toLocaleDateString() : 'Present'}
                              </span>
                              <span>·</span>
                              <span>{assignment.allocation}% allocation</span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  )
}