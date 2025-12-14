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
            const response = await consultantApi.getMyAssignments()
            
            // Handle both wrapped and unwrapped responses
            let assignmentsData: Assignment[]
            if (Array.isArray(response)) {
                assignmentsData = response
            } else if (response && typeof response === 'object' && 'data' in response) {
                const extracted = (response as any).data
                assignmentsData = Array.isArray(extracted) ? extracted : []
            } else {
                assignmentsData = []
            }
            
            setAssignments(assignmentsData)
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
        const statusConfig: Record<string, { label: string; className: string }> = {
            scheduled: { label: 'Scheduled', className: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
            active: { label: 'Active', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
            completed: { label: 'Completed', className: 'bg-gray-500/10 text-gray-600 border-gray-500/30' },
            cancelled: { label: 'Cancelled', className: 'bg-red-500/10 text-red-600 border-red-500/30' },
            on_hold: { label: 'On Hold', className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30' },
        }

        const config = statusConfig[status] || statusConfig.scheduled
        return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border ${config.className}`}>{config.label}</span>
    }

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'active':
                return <CheckCircle className="h-3 w-3 text-emerald-600" />
            case 'completed':
                return <Circle className="h-3 w-3 text-gray-500" />
            case 'cancelled':
                return <XCircle className="h-3 w-3 text-red-600" />
            case 'on_hold':
                return <Pause className="h-3 w-3 text-yellow-600" />
            default:
                return <Clock className="h-3 w-3 text-blue-600" />
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

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
                <div className="text-center space-y-3">
                    <div className="relative">
                        <div className="w-12 h-12 mx-auto rounded-full bg-gradient-to-r from-[#ffc451] to-[#ffb020] animate-pulse" />
                        <Loader2 className="h-6 w-6 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white animate-spin" />
                    </div>
                    <p className="text-xs font-medium text-gray-600">Loading assignments...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
            <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
                {/* Compact Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link href="/dashboard/consultant">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <ArrowLeft className="h-3.5 w-3.5" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-lg font-bold text-gray-900">Project Assignments</h1>
                            <p className="text-xs text-gray-500">
                                View and manage your project engagements
                            </p>
                        </div>
                    </div>
                </div>

                {/* Compact Stats Grid */}
                <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                    <Card className="border-[#ffc451]/20">
                        <CardContent className="p-3">
                            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Active Projects</p>
                            <div className="text-xl font-bold text-gray-900">{activeAssignments.length}</div>
                            <p className="text-[10px] text-gray-400 mt-0.5">Currently assigned</p>
                        </CardContent>
                    </Card>

                    <Card className="border-emerald-500/20">
                        <CardContent className="p-3">
                            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Total Allocation</p>
                            <div className="text-xl font-bold text-gray-900">{totalAllocation}%</div>
                            <p className="text-[10px] text-gray-400 mt-0.5">Across all projects</p>
                        </CardContent>
                    </Card>

                    <Card className="border-blue-500/20">
                        <CardContent className="p-3">
                            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Completed</p>
                            <div className="text-xl font-bold text-gray-900">{completedAssignments.length}</div>
                            <p className="text-[10px] text-gray-400 mt-0.5">Successfully delivered</p>
                        </CardContent>
                    </Card>

                    <Card className="border-purple-500/20">
                        <CardContent className="p-3">
                            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Upcoming</p>
                            <div className="text-xl font-bold text-gray-900">{upcomingAssignments.length}</div>
                            <p className="text-[10px] text-gray-400 mt-0.5">Starting soon</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Assignments List */}
                <Card className="border-[#ffc451]/20">
                    <CardHeader className="p-3 pb-2">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-xs font-bold text-gray-900">All Assignments</CardTitle>
                                <CardDescription className="text-[10px] mt-0.5">
                                    Complete list of your project engagements
                                </CardDescription>
                            </div>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-[140px] h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all" className="text-xs">All Status</SelectItem>
                                    <SelectItem value="active" className="text-xs">Active</SelectItem>
                                    <SelectItem value="scheduled" className="text-xs">Scheduled</SelectItem>
                                    <SelectItem value="completed" className="text-xs">Completed</SelectItem>
                                    <SelectItem value="on_hold" className="text-xs">On Hold</SelectItem>
                                    <SelectItem value="cancelled" className="text-xs">Cancelled</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                        {filteredAssignments.length === 0 ? (
                            <div className="text-center py-10">
                                <Briefcase className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                                <h3 className="text-xs font-semibold text-gray-700 mb-1">No assignments found</h3>
                                <p className="text-xs text-gray-500">
                                    {statusFilter === 'all'
                                        ? 'You have no project assignments yet'
                                        : `No ${statusFilter} assignments`}
                                </p>
                            </div>
                        ) : (
                            <Tabs defaultValue="active" className="space-y-3">
                                <TabsList className="grid w-full grid-cols-3 h-8">
                                    <TabsTrigger value="active" className="text-xs">
                                        Active ({activeAssignments.length})
                                    </TabsTrigger>
                                    <TabsTrigger value="upcoming" className="text-xs">
                                        Upcoming ({upcomingAssignments.length})
                                    </TabsTrigger>
                                    <TabsTrigger value="completed" className="text-xs">
                                        Completed ({completedAssignments.length})
                                    </TabsTrigger>
                                </TabsList>

                                <TabsContent value="active" className="space-y-2">
                                    {activeAssignments.length === 0 ? (
                                        <div className="text-center py-8">
                                            <Briefcase className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                                            <p className="text-xs text-gray-500">No active assignments</p>
                                        </div>
                                    ) : (
                                        activeAssignments.map((assignment) => (
                                            <div key={assignment._id} className="rounded-lg border border-gray-100 hover:border-[#ffc451]/30 p-3 space-y-2 bg-white hover:shadow-sm transition-all">
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5 mb-1">
                                                            {getStatusIcon(assignment.status)}
                                                            <h3 className="text-xs font-semibold text-gray-900 truncate">{assignment.project.name}</h3>
                                                            {getStatusBadge(assignment.status)}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                                                            <Building2 className="h-2.5 w-2.5" />
                                                            <span className="truncate">{assignment.project.client.name}</span>
                                                        </div>
                                                    </div>
                                                    <span className="px-2 py-0.5 rounded-md text-[9px] font-medium bg-[#ffc451]/10 text-[#ffc451] border border-[#ffc451]/20 capitalize whitespace-nowrap ml-2">
                                                        {assignment.role}
                                                    </span>
                                                </div>

                                                <Separator />

                                                <div className="grid gap-2 grid-cols-3 text-xs">
                                                    <div>
                                                        <p className="text-[10px] text-gray-400 mb-0.5">Allocation</p>
                                                        <div className="flex items-center gap-1">
                                                            <TrendingUp className="h-3 w-3 text-emerald-500" />
                                                            <span className="font-medium text-gray-900">{assignment.allocation}%</span>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <p className="text-[10px] text-gray-400 mb-0.5">Duration</p>
                                                        <div className="flex items-center gap-1">
                                                            <Calendar className="h-3 w-3 text-blue-500" />
                                                            <span className="font-medium text-gray-900">
                                                                {calculateDuration(assignment.startDate, assignment.endDate)}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <p className="text-[10px] text-gray-400 mb-0.5">Start Date</p>
                                                        <div className="flex items-center gap-1">
                                                            <Clock className="h-3 w-3 text-purple-500" />
                                                            <span className="font-medium text-gray-900 text-[10px]">
                                                                {new Date(assignment.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {assignment.billableRate && (
                                                    <>
                                                        <Separator />
                                                        <div className="flex items-center justify-between text-xs">
                                                            <span className="text-gray-500">Billable Rate</span>
                                                            <span className="font-semibold text-gray-900">${assignment.billableRate}/hour</span>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </TabsContent>

                                <TabsContent value="upcoming" className="space-y-2">
                                    {upcomingAssignments.length === 0 ? (
                                        <div className="text-center py-8">
                                            <Clock className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                                            <p className="text-xs text-gray-500">No upcoming assignments</p>
                                        </div>
                                    ) : (
                                        upcomingAssignments.map((assignment) => (
                                            <div key={assignment._id} className="rounded-lg border border-gray-100 hover:border-[#ffc451]/30 p-3 space-y-2 bg-white hover:shadow-sm transition-all">
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5 mb-1">
                                                            {getStatusIcon(assignment.status)}
                                                            <h3 className="text-xs font-semibold text-gray-900 truncate">{assignment.project.name}</h3>
                                                            {getStatusBadge(assignment.status)}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                                                            <Building2 className="h-2.5 w-2.5" />
                                                            <span className="truncate">{assignment.project.client.name}</span>
                                                        </div>
                                                    </div>
                                                    <span className="px-2 py-0.5 rounded-md text-[9px] font-medium bg-[#ffc451]/10 text-[#ffc451] border border-[#ffc451]/20 capitalize whitespace-nowrap ml-2">
                                                        {assignment.role}
                                                    </span>
                                                </div>

                                                <Separator />

                                                <div className="grid gap-2 grid-cols-2 text-xs">
                                                    <div>
                                                        <p className="text-[10px] text-gray-400 mb-0.5">Start Date</p>
                                                        <div className="flex items-center gap-1">
                                                            <Calendar className="h-3 w-3 text-blue-500" />
                                                            <span className="font-medium text-gray-900 text-[10px]">
                                                                {new Date(assignment.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <p className="text-[10px] text-gray-400 mb-0.5">Allocation</p>
                                                        <div className="flex items-center gap-1">
                                                            <TrendingUp className="h-3 w-3 text-emerald-500" />
                                                            <span className="font-medium text-gray-900">{assignment.allocation}%</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </TabsContent>

                                <TabsContent value="completed" className="space-y-2">
                                    {completedAssignments.length === 0 ? (
                                        <div className="text-center py-8">
                                            <CheckCircle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                                            <p className="text-xs text-gray-500">No completed assignments</p>
                                        </div>
                                    ) : (
                                        completedAssignments.slice(0, 10).map((assignment) => (
                                            <div key={assignment._id} className="rounded-lg border border-gray-100 hover:border-[#ffc451]/30 p-3 bg-white hover:shadow-sm transition-all">
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5 mb-1">
                                                            {getStatusIcon(assignment.status)}
                                                            <h3 className="text-xs font-semibold text-gray-900 truncate">{assignment.project.name}</h3>
                                                            {getStatusBadge(assignment.status)}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 flex-wrap">
                                                            <Building2 className="h-2.5 w-2.5" />
                                                            <span className="truncate">{assignment.project.client.name}</span>
                                                            <span>·</span>
                                                            <span className="capitalize">{assignment.role}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mt-1.5 flex-wrap">
                                                            <span>
                                                                {new Date(assignment.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {assignment.endDate ? new Date(assignment.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Present'}
                                                            </span>
                                                            <span>·</span>
                                                            <span>{assignment.allocation}% allocation</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </TabsContent>
                            </Tabs>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}