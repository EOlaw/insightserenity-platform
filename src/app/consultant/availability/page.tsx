'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Calendar as CalendarIcon,
    Plus,
    X,
    CheckCircle,
    XCircle,
    Clock,
    ArrowLeft,
    Loader2,
    Edit,
    Trash2,
    MapPin,
    Briefcase,
    Users,
    Percent,
    CalendarCheck,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { consultantApi, type ConsultantProfile, type AvailabilityRecord } from '@/lib/api/consultant'

const TIME_OFF_REASONS = {
    vacation: 'Vacation',
    sick: 'Sick Leave',
    personal: 'Personal',
    training: 'Training',
    conference: 'Conference',
    bereavement: 'Bereavement',
    parental: 'Parental Leave',
    other: 'Other',
}

const WORK_LOCATIONS = {
    remote: 'Remote',
    office: 'Office',
    client_site: 'Client Site',
    hybrid: 'Hybrid',
    flexible: 'Flexible',
}

const PROJECT_TYPES = {
    implementation: 'Implementation',
    strategy: 'Strategy',
    advisory: 'Advisory',
    training: 'Training',
    support: 'Support',
    audit: 'Audit',
    transformation: 'Transformation',
    integration: 'Integration',
}

const CLIENT_TYPES = {
    enterprise: 'Enterprise',
    mid_market: 'Mid-Market',
    startup: 'Startup',
    government: 'Government',
    non_profit: 'Non-Profit',
    education: 'Education',
}

const TRAVEL_WILLINGNESS = {
    none: 'No Travel',
    local: 'Local Only',
    regional: 'Regional',
    national: 'National',
    international: 'International',
}

export default function AvailabilityManagementPage() {
    const router = useRouter()
    const [consultant, setConsultant] = useState<ConsultantProfile | null>(null)
    const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilityRecord[]>([])
    const [timeOffRequests, setTimeOffRequests] = useState<AvailabilityRecord[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [activeTab, setActiveTab] = useState('availability')
    
    const [isAvailabilityDialogOpen, setIsAvailabilityDialogOpen] = useState(false)
    const [isTimeOffDialogOpen, setIsTimeOffDialogOpen] = useState(false)
    const [editingSlot, setEditingSlot] = useState<AvailabilityRecord | null>(null)

    const [availabilityForm, setAvailabilityForm] = useState({
        startDate: '',
        endDate: '',
        startTime: '09:00',
        endTime: '17:00',
        timezone: 'America/New_York',
        allDay: false,
        hoursAvailable: 40,
        percentageAvailable: 100,
        maxProjects: 3,
        preferredHoursPerDay: 8,
        billableTarget: 80,
        workLocation: 'hybrid',
        preferredLocations: [] as string[],
        projectTypes: [] as string[],
        clientTypes: [] as string[],
        travelWillingness: 'regional',
        travelPercentage: 25,
    })

    const [timeOffForm, setTimeOffForm] = useState({
        reason: 'vacation',
        startDate: '',
        endDate: '',
        description: '',
    })

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        setIsLoading(true)

        try {
            const [profileResponse, availabilityResponse] = await Promise.all([
                consultantApi.getMyProfile(),
                consultantApi.getMyAvailability(),
            ])

            const profileData = profileResponse?.data || profileResponse
            setConsultant(profileData)

            let availabilityData: AvailabilityRecord[] = []

            if (availabilityResponse) {
                if ('data' in availabilityResponse && availabilityResponse.data && 'data' in availabilityResponse.data) {
                    availabilityData = Array.isArray(availabilityResponse.data.data)
                        ? availabilityResponse.data.data
                        : []
                } else if ('data' in availabilityResponse && Array.isArray(availabilityResponse.data)) {
                    availabilityData = availabilityResponse.data
                } else if (Array.isArray(availabilityResponse)) {
                    availabilityData = availabilityResponse
                }
            }

            const timeOffRequests = availabilityData.filter(r => 
                r.timeOff?.reason !== undefined && r.timeOff?.reason !== null && r.timeOff?.reason !== ''
            )

            const availabilitySlots = availabilityData.filter(r => 
                !r.timeOff?.reason && r.availabilityStatus !== 'unavailable'
            )

            console.log('Total records loaded:', availabilityData.length)
            console.log('Availability slots:', availabilitySlots.length)
            console.log('Time-off requests:', timeOffRequests.length)
            
            setAvailabilitySlots(availabilitySlots)
            setTimeOffRequests(timeOffRequests)
        } catch (error: any) {
            console.error('Failed to load availability data:', error)
            toast.error('Failed to load availability data')

            if (error.response?.status === 401) {
                router.push('/login')
            }
        } finally {
            setIsLoading(false)
        }
    }

    const resetAvailabilityForm = () => {
        setAvailabilityForm({
            startDate: '',
            endDate: '',
            startTime: '09:00',
            endTime: '17:00',
            timezone: 'America/New_York',
            allDay: false,
            hoursAvailable: 40,
            percentageAvailable: 100,
            maxProjects: 3,
            preferredHoursPerDay: 8,
            billableTarget: 80,
            workLocation: 'hybrid',
            preferredLocations: [],
            projectTypes: [],
            clientTypes: [],
            travelWillingness: 'regional',
            travelPercentage: 25,
        })
        setEditingSlot(null)
    }

    const handleOpenAvailabilityDialog = (slot?: AvailabilityRecord) => {
        if (slot) {
            setEditingSlot(slot)
            setAvailabilityForm({
                startDate: slot.period.startDate.split('T')[0],
                endDate: slot.period.endDate.split('T')[0],
                startTime: slot.period.startTime || '09:00',
                endTime: slot.period.endTime || '17:00',
                timezone: slot.period.timezone || 'America/New_York',
                allDay: slot.period.allDay || false,
                hoursAvailable: slot.capacity?.hoursAvailable || 40,
                percentageAvailable: slot.capacity?.percentageAvailable || 100,
                maxProjects: slot.capacity?.maxProjects || 3,
                preferredHoursPerDay: slot.capacity?.preferredHoursPerDay || 8,
                billableTarget: slot.capacity?.billableTarget || 80,
                workLocation: slot.preferences?.workLocation || 'hybrid',
                preferredLocations: slot.preferences?.preferredLocations || [],
                projectTypes: slot.preferences?.projectTypes || [],
                clientTypes: slot.preferences?.clientTypes || [],
                travelWillingness: slot.preferences?.travelWillingness || 'regional',
                travelPercentage: slot.preferences?.travelPercentage || 25,
            })
        } else {
            resetAvailabilityForm()
        }
        setIsAvailabilityDialogOpen(true)
    }

    const handleCloseAvailabilityDialog = () => {
        setIsAvailabilityDialogOpen(false)
        setTimeout(resetAvailabilityForm, 300)
    }

    const handleSubmitAvailabilitySlot = async () => {
        if (!availabilityForm.startDate || !availabilityForm.endDate) {
            toast.error('Start date and end date are required')
            return
        }

        if (new Date(availabilityForm.endDate) < new Date(availabilityForm.startDate)) {
            toast.error('End date must be after start date')
            return
        }

        if (!consultant?._id) {
            toast.error('Consultant ID not found')
            return
        }

        try {
            const payload = {
                period: {
                    startDate: availabilityForm.startDate,
                    endDate: availabilityForm.endDate,
                    startTime: availabilityForm.allDay ? undefined : availabilityForm.startTime,
                    endTime: availabilityForm.allDay ? undefined : availabilityForm.endTime,
                    timezone: availabilityForm.timezone,
                    allDay: availabilityForm.allDay,
                },
                capacity: {
                    hoursAvailable: availabilityForm.hoursAvailable,
                    percentageAvailable: availabilityForm.percentageAvailable,
                    maxProjects: availabilityForm.maxProjects,
                    preferredHoursPerDay: availabilityForm.preferredHoursPerDay,
                    billableTarget: availabilityForm.billableTarget,
                },
                preferences: {
                    workLocation: availabilityForm.workLocation,
                    preferredLocations: availabilityForm.preferredLocations,
                    projectTypes: availabilityForm.projectTypes,
                    clientTypes: availabilityForm.clientTypes,
                    travelWillingness: availabilityForm.travelWillingness,
                    travelPercentage: availabilityForm.travelPercentage,
                },
            }

            if (editingSlot) {
                await consultantApi.updateAvailabilitySlot(editingSlot._id, payload)
                toast.success('Availability slot updated successfully')
            } else {
                await consultantApi.createAvailabilitySlot(consultant._id, payload)
                toast.success('Availability slot created successfully')
            }

            handleCloseAvailabilityDialog()
            await loadData()
        } catch (error: any) {
            console.error('Failed to save availability slot:', error)
            toast.error(error.response?.data?.error?.message || 'Failed to save availability slot')
        }
    }

    const handleDeleteAvailabilitySlot = async (slotId: string) => {
        if (!confirm('Are you sure you want to delete this availability slot?')) {
            return
        }

        try {
            await consultantApi.deleteAvailabilityRecord(slotId)
            toast.success('Availability slot deleted successfully')
            await loadData()
        } catch (error: any) {
            console.error('Failed to delete availability slot:', error)
            toast.error(error.response?.data?.error?.message || 'Failed to delete availability slot')
        }
    }

    const resetTimeOffForm = () => {
        setTimeOffForm({
            reason: 'vacation',
            startDate: '',
            endDate: '',
            description: '',
        })
    }

    const handleOpenTimeOffDialog = () => {
        resetTimeOffForm()
        setIsTimeOffDialogOpen(true)
    }

    const handleCloseTimeOffDialog = () => {
        setIsTimeOffDialogOpen(false)
        setTimeout(resetTimeOffForm, 300)
    }

    const handleSubmitTimeOffRequest = async () => {
        if (!timeOffForm.startDate || !timeOffForm.endDate) {
            toast.error('Start date and end date are required')
            return
        }

        if (new Date(timeOffForm.endDate) < new Date(timeOffForm.startDate)) {
            toast.error('End date must be after start date')
            return
        }

        if (!consultant?._id) {
            toast.error('Consultant ID not found')
            return
        }

        try {
            await consultantApi.requestTimeOff(consultant._id, {
                period: {
                    startDate: timeOffForm.startDate,
                    endDate: timeOffForm.endDate,
                    allDay: true
                },
                timeOff: {
                    reason: timeOffForm.reason,
                    description: timeOffForm.description || undefined,
                }
            })

            toast.success('Time-off request submitted successfully')
            handleCloseTimeOffDialog()
            await loadData()
        } catch (error: any) {
            console.error('Failed to submit time-off request:', error)
            toast.error(error.response?.data?.error?.message || 'Failed to submit request')
        }
    }

    const handleCancelTimeOffRequest = async (record: AvailabilityRecord) => {
        if (!confirm('Are you sure you want to cancel this time-off request?')) {
            return
        }

        try {
            await consultantApi.cancelTimeOff(record._id)
            toast.success('Time-off request cancelled successfully')
            await loadData()
        } catch (error: any) {
            console.error('Failed to cancel request:', error)
            toast.error(error.response?.data?.error?.message || 'Failed to cancel request')
        }
    }

    const getApprovalStatus = (record: AvailabilityRecord): string | null => {
        return record.timeOff?.approvalStatus || null
    }

    const getDisplayType = (record: AvailabilityRecord): string => {
        if (record.timeOff?.reason) {
            return TIME_OFF_REASONS[record.timeOff.reason as keyof typeof TIME_OFF_REASONS] || record.timeOff.reason
        }
        return record.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
    }

    const getStatusBadge = (status: string | null) => {
        if (!status) return null
        
        const statusConfig: Record<string, { label: string; className: string }> = {
            pending: { label: 'Pending', className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30' },
            approved: { label: 'Approved', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
            auto_approved: { label: 'Approved', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
            rejected: { label: 'Rejected', className: 'bg-red-500/10 text-red-600 border-red-500/30' },
            cancelled: { label: 'Cancelled', className: 'bg-gray-500/10 text-gray-600 border-gray-500/30' },
        }

        const config = statusConfig[status] || { label: status, className: 'bg-gray-500/10 text-gray-600 border-gray-500/30' }
        return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border ${config.className}`}>{config.label}</span>
    }

    const getAvailabilityStatusBadge = (status: string) => {
        const statusConfig: Record<string, { label: string; className: string }> = {
            available: { label: 'Available', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
            partially_available: { label: 'Partially Available', className: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
            tentative: { label: 'Tentative', className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30' },
        }

        const config = statusConfig[status] || { label: status, className: 'bg-gray-500/10 text-gray-600 border-gray-500/30' }
        return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border ${config.className}`}>{config.label}</span>
    }

    const getStatusIcon = (status: string | null) => {
        if (!status) return <Clock className="h-3 w-3 text-gray-400" />
        
        switch (status) {
            case 'approved':
            case 'auto_approved':
                return <CheckCircle className="h-3 w-3 text-emerald-600" />
            case 'rejected':
                return <XCircle className="h-3 w-3 text-red-600" />
            case 'cancelled':
                return <X className="h-3 w-3 text-gray-500" />
            default:
                return <Clock className="h-3 w-3 text-yellow-600" />
        }
    }

    const calculateDays = (startDate: string, endDate: string) => {
        const start = new Date(startDate)
        const end = new Date(endDate)
        
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return 0
        }
        
        const diffTime = Math.abs(end.getTime() - start.getTime())
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
        return diffDays
    }

    const formatDate = (dateString: string) => {
        const date = new Date(dateString)
        if (isNaN(date.getTime())) {
            return 'Invalid Date'
        }
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }

    const formatTime = (time: string) => {
        const [hours, minutes] = time.split(':')
        const hour = parseInt(hours)
        const ampm = hour >= 12 ? 'PM' : 'AM'
        const displayHour = hour % 12 || 12
        return `${displayHour}:${minutes} ${ampm}`
    }

    const pendingTimeOff = timeOffRequests.filter(r => 
        r.timeOff?.approvalStatus === 'pending'
    )
    
    const approvedTimeOff = timeOffRequests.filter(r => 
        r.timeOff?.approvalStatus === 'approved' || r.timeOff?.approvalStatus === 'auto_approved'
    )
    
    const pastTimeOff = timeOffRequests.filter(r =>
        r.timeOff?.approvalStatus && !['pending', 'approved', 'auto_approved'].includes(r.timeOff.approvalStatus)
    )

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
                <div className="text-center space-y-3">
                    <div className="relative">
                        <div className="w-12 h-12 mx-auto rounded-full bg-gradient-to-r from-[#ffc451] to-[#ffb020] animate-pulse" />
                        <Loader2 className="h-6 w-6 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white animate-spin" />
                    </div>
                    <p className="text-xs font-medium text-gray-600">Loading availability data...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
            <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link href="/consultant/dashboard">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <ArrowLeft className="h-3.5 w-3.5" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-lg font-bold text-gray-900">Availability & Time-Off Management</h1>
                            <p className="text-xs text-gray-500">
                                Manage your availability windows and time-off requests
                            </p>
                        </div>
                    </div>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 h-9">
                        <TabsTrigger value="availability" className="text-xs">
                            <CalendarCheck className="h-3 w-3 mr-1.5" />
                            My Availability
                        </TabsTrigger>
                        <TabsTrigger value="timeoff" className="text-xs">
                            <CalendarIcon className="h-3 w-3 mr-1.5" />
                            Time-Off Requests
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="availability" className="space-y-4 mt-4">
                        <div className="flex items-center justify-between">
                            <p className="text-xs text-gray-600">
                                Create availability windows to indicate when you have capacity for new projects
                            </p>
                            <Button
                                onClick={() => handleOpenAvailabilityDialog()}
                                size="sm"
                                className="bg-gradient-to-r from-[#ffc451] to-[#ffb020] hover:from-[#ffb020] hover:to-[#ffc451] text-black font-medium text-xs h-8"
                            >
                                <Plus className="mr-1.5 h-3 w-3" />
                                Add Availability
                            </Button>
                        </div>

                        <div className="grid gap-3 md:grid-cols-3">
                            <Card className="border-emerald-500/20">
                                <CardContent className="p-3">
                                    <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Active Slots</p>
                                    <div className="text-xl font-bold text-gray-900">{availabilitySlots.length}</div>
                                    <p className="text-[10px] text-gray-400 mt-0.5">Current availability windows</p>
                                </CardContent>
                            </Card>

                            <Card className="border-blue-500/20">
                                <CardContent className="p-3">
                                    <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Average Capacity</p>
                                    <div className="text-xl font-bold text-gray-900">
                                        {availabilitySlots.length > 0
                                            ? Math.round(
                                                  availabilitySlots.reduce((sum, slot) => sum + (slot.capacity?.percentageAvailable || 0), 0) /
                                                      availabilitySlots.length
                                              )
                                            : 0}%
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-0.5">Across all slots</p>
                                </CardContent>
                            </Card>

                            <Card className="border-[#ffc451]/20">
                                <CardContent className="p-3">
                                    <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Hours Available</p>
                                    <div className="text-xl font-bold text-gray-900">
                                        {availabilitySlots.reduce((sum, slot) => sum + (slot.capacity?.hoursAvailable || 0), 0)}
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-0.5">Total hours per week</p>
                                </CardContent>
                            </Card>
                        </div>

                        <Card className="border-[#ffc451]/20">
                            <CardHeader className="p-3 pb-2">
                                <CardTitle className="text-xs font-bold text-gray-900">Availability Windows</CardTitle>
                                <CardDescription className="text-[10px]">
                                    Time periods when you are available for project assignments
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-3 pt-0">
                                {availabilitySlots.length === 0 ? (
                                    <div className="text-center py-8">
                                        <CalendarCheck className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                                        <p className="text-xs text-gray-500 mb-3">No availability windows defined</p>
                                        <Button
                                            onClick={() => handleOpenAvailabilityDialog()}
                                            size="sm"
                                            variant="outline"
                                            className="text-xs h-7"
                                        >
                                            <Plus className="mr-1.5 h-3 w-3" />
                                            Create Your First Availability Window
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {availabilitySlots.map((slot) => (
                                            <div
                                                key={slot._id}
                                                className="rounded-lg border border-emerald-100 hover:border-emerald-300 bg-gradient-to-r from-emerald-50/50 to-white p-3 space-y-2.5 hover:shadow-sm transition-all"
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1 space-y-2">
                                                        <div className="flex items-center gap-2">
                                                            <CalendarCheck className="h-3.5 w-3.5 text-emerald-600" />
                                                            <span className="text-xs font-semibold text-gray-900">
                                                                {formatDate(slot.period.startDate)} - {formatDate(slot.period.endDate)}
                                                            </span>
                                                            {getAvailabilityStatusBadge(slot.availabilityStatus)}
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                                                            <div className="flex items-center gap-1.5 text-gray-600">
                                                                <Clock className="h-3 w-3" />
                                                                <span>
                                                                    {slot.period.allDay
                                                                        ? 'All Day'
                                                                        : `${formatTime(slot.period.startTime || '09:00')} - ${formatTime(slot.period.endTime || '17:00')}`}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 text-gray-600">
                                                                <Percent className="h-3 w-3" />
                                                                <span>{slot.capacity?.percentageAvailable || 0}% Capacity</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 text-gray-600">
                                                                <MapPin className="h-3 w-3" />
                                                                <span>
                                                                    {WORK_LOCATIONS[slot.preferences?.workLocation as keyof typeof WORK_LOCATIONS] || 'Not specified'}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 text-gray-600">
                                                                <Briefcase className="h-3 w-3" />
                                                                <span>{slot.capacity?.maxProjects || 0} Max Projects</span>
                                                            </div>
                                                        </div>

                                                        {slot.preferences?.projectTypes && slot.preferences.projectTypes.length > 0 && (
                                                            <div className="flex items-start gap-1.5 text-[10px]">
                                                                <Users className="h-3 w-3 text-gray-500 mt-0.5" />
                                                                <div className="flex flex-wrap gap-1">
                                                                    {slot.preferences.projectTypes.map((type) => (
                                                                        <span
                                                                            key={type}
                                                                            className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200"
                                                                        >
                                                                            {PROJECT_TYPES[type as keyof typeof PROJECT_TYPES] || type}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-1 ml-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleOpenAvailabilityDialog(slot)}
                                                            className="h-7 w-7 p-0 text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                                                        >
                                                            <Edit className="h-3 w-3" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleDeleteAvailabilitySlot(slot._id)}
                                                            className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                                        >
                                                            <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="timeoff" className="space-y-4 mt-4">
                        <div className="flex items-center justify-between">
                            <p className="text-xs text-gray-600">
                                Request time off for vacation, sick leave, or other absences
                            </p>
                            <Button
                                onClick={handleOpenTimeOffDialog}
                                size="sm"
                                className="bg-gradient-to-r from-[#ffc451] to-[#ffb020] hover:from-[#ffb020] hover:to-[#ffc451] text-black font-medium text-xs h-8"
                            >
                                <Plus className="mr-1.5 h-3 w-3" />
                                Request Time Off
                            </Button>
                        </div>

                        <div className="grid gap-3 md:grid-cols-3">
                            <Card className="border-yellow-500/20">
                                <CardContent className="p-3">
                                    <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Pending Requests</p>
                                    <div className="text-xl font-bold text-gray-900">{pendingTimeOff.length}</div>
                                    <p className="text-[10px] text-gray-400 mt-0.5">Awaiting approval</p>
                                </CardContent>
                            </Card>

                            <Card className="border-emerald-500/20">
                                <CardContent className="p-3">
                                    <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Approved Time Off</p>
                                    <div className="text-xl font-bold text-gray-900">{approvedTimeOff.length}</div>
                                    <p className="text-[10px] text-gray-400 mt-0.5">Upcoming absences</p>
                                </CardContent>
                            </Card>

                            <Card className="border-[#ffc451]/20">
                                <CardContent className="p-3">
                                    <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Days Off This Year</p>
                                    <div className="text-xl font-bold text-gray-900">
                                        {approvedTimeOff.reduce((total, record) => {
                                            return total + calculateDays(record.period.startDate, record.period.endDate)
                                        }, 0)}
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-0.5">Total approved days</p>
                                </CardContent>
                            </Card>
                        </div>

                        <Card className="border-[#ffc451]/20">
                            <CardHeader className="p-3 pb-2">
                                <CardTitle className="text-xs font-bold text-gray-900">Pending Requests</CardTitle>
                                <CardDescription className="text-[10px]">
                                    Time-off requests awaiting manager approval
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-3 pt-0">
                                {pendingTimeOff.length === 0 ? (
                                    <div className="text-center py-8">
                                        <Clock className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                                        <p className="text-xs text-gray-500">No pending requests</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {pendingTimeOff.map((record) => (
                                            <div key={record._id} className="rounded-lg border border-gray-100 hover:border-[#ffc451]/30 p-2.5 space-y-2 bg-white hover:shadow-sm transition-all">
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5 mb-1">
                                                            {getStatusIcon(getApprovalStatus(record))}
                                                            <span className="text-xs font-medium text-gray-900 capitalize">
                                                                {getDisplayType(record)}
                                                            </span>
                                                            {getStatusBadge(getApprovalStatus(record))}
                                                        </div>
                                                        <p className="text-[10px] text-gray-500">
                                                            {formatDate(record.period.startDate)} - {formatDate(record.period.endDate)}
                                                            <span className="mx-1.5">·</span>
                                                            {calculateDays(record.period.startDate, record.period.endDate)} days
                                                        </p>
                                                        {record.timeOff?.description && (
                                                            <p className="text-[10px] text-gray-400 mt-1.5 line-clamp-2">
                                                                {record.timeOff.description}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleCancelTimeOffRequest(record)}
                                                        className="h-7 text-[10px] text-red-600 hover:text-red-700 hover:bg-red-50"
                                                    >
                                                        Cancel
                                                    </Button>
                                                </div>
                                                <div className="text-[9px] text-gray-400">
                                                    Requested on {formatDate(record.createdAt)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="border-[#ffc451]/20">
                            <CardHeader className="p-3 pb-2">
                                <CardTitle className="text-xs font-bold text-gray-900">Approved Time Off</CardTitle>
                                <CardDescription className="text-[10px]">
                                    Your confirmed upcoming absences
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-3 pt-0">
                                {approvedTimeOff.length === 0 ? (
                                    <div className="text-center py-8">
                                        <CalendarIcon className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                                        <p className="text-xs text-gray-500">No approved time off</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {approvedTimeOff.map((record) => (
                                            <div key={record._id} className="rounded-lg border border-gray-100 hover:border-[#ffc451]/30 p-2.5 space-y-2 bg-white hover:shadow-sm transition-all">
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-1.5 mb-1">
                                                            {getStatusIcon(getApprovalStatus(record))}
                                                            <span className="text-xs font-medium text-gray-900 capitalize">
                                                                {getDisplayType(record)}
                                                            </span>
                                                            {getStatusBadge(getApprovalStatus(record))}
                                                        </div>
                                                        <p className="text-[10px] text-gray-500">
                                                            {formatDate(record.period.startDate)} - {formatDate(record.period.endDate)}
                                                            <span className="mx-1.5">·</span>
                                                            {calculateDays(record.period.startDate, record.period.endDate)} days
                                                        </p>
                                                        {record.timeOff?.description && (
                                                            <p className="text-[10px] text-gray-400 mt-1.5 line-clamp-2">
                                                                {record.timeOff.description}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                {record.timeOff?.approvedAt && (
                                                    <div className="text-[9px] text-gray-400">
                                                        Approved on {formatDate(record.timeOff.approvedAt)}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {pastTimeOff.length > 0 && (
                            <Card className="border-[#ffc451]/20">
                                <CardHeader className="p-3 pb-2">
                                    <CardTitle className="text-xs font-bold text-gray-900">Request History</CardTitle>
                                    <CardDescription className="text-[10px]">
                                        Past and cancelled requests
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="p-3 pt-0">
                                    <div className="space-y-2">
                                        {pastTimeOff.slice(0, 5).map((record) => (
                                            <div key={record._id} className="rounded-lg border border-gray-100 p-2.5 bg-white">
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-1.5 mb-1">
                                                            {getStatusIcon(getApprovalStatus(record))}
                                                            <span className="text-xs font-medium text-gray-900 capitalize">
                                                                {getDisplayType(record)}
                                                            </span>
                                                            {getStatusBadge(getApprovalStatus(record))}
                                                        </div>
                                                        <p className="text-[10px] text-gray-500">
                                                            {formatDate(record.period.startDate)} - {formatDate(record.period.endDate)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>
                </Tabs>

                <Dialog open={isAvailabilityDialogOpen} onOpenChange={setIsAvailabilityDialogOpen}>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="text-base">
                                {editingSlot ? 'Edit Availability Window' : 'Create Availability Window'}
                            </DialogTitle>
                            <DialogDescription className="text-xs">
                                Define when you are available for project assignments
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            <div className="space-y-3">
                                <h3 className="text-xs font-semibold text-gray-900 border-b pb-1">Time Period</h3>
                                
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="av-startDate" className="text-xs font-medium">Start Date *</Label>
                                        <Input
                                            id="av-startDate"
                                            type="date"
                                            value={availabilityForm.startDate}
                                            onChange={(e) => setAvailabilityForm({ ...availabilityForm, startDate: e.target.value })}
                                            className="h-8 text-xs"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="av-endDate" className="text-xs font-medium">End Date *</Label>
                                        <Input
                                            id="av-endDate"
                                            type="date"
                                            value={availabilityForm.endDate}
                                            onChange={(e) => setAvailabilityForm({ ...availabilityForm, endDate: e.target.value })}
                                            min={availabilityForm.startDate}
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="av-allDay"
                                        checked={availabilityForm.allDay}
                                        onChange={(e) => setAvailabilityForm({ ...availabilityForm, allDay: e.target.checked })}
                                        className="h-3.5 w-3.5 rounded border-gray-300"
                                    />
                                    <Label htmlFor="av-allDay" className="text-xs font-medium cursor-pointer">
                                        All Day Availability
                                    </Label>
                                </div>

                                {!availabilityForm.allDay && (
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="av-startTime" className="text-xs font-medium">Start Time</Label>
                                            <Input
                                                id="av-startTime"
                                                type="time"
                                                value={availabilityForm.startTime}
                                                onChange={(e) => setAvailabilityForm({ ...availabilityForm, startTime: e.target.value })}
                                                className="h-8 text-xs"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label htmlFor="av-endTime" className="text-xs font-medium">End Time</Label>
                                            <Input
                                                id="av-endTime"
                                                type="time"
                                                value={availabilityForm.endTime}
                                                onChange={(e) => setAvailabilityForm({ ...availabilityForm, endTime: e.target.value })}
                                                className="h-8 text-xs"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label htmlFor="av-timezone" className="text-xs font-medium">Timezone</Label>
                                            <Select
                                                value={availabilityForm.timezone}
                                                onValueChange={(value) => setAvailabilityForm({ ...availabilityForm, timezone: value })}
                                            >
                                                <SelectTrigger className="h-8 text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="America/New_York" className="text-xs">Eastern</SelectItem>
                                                    <SelectItem value="America/Chicago" className="text-xs">Central</SelectItem>
                                                    <SelectItem value="America/Denver" className="text-xs">Mountain</SelectItem>
                                                    <SelectItem value="America/Los_Angeles" className="text-xs">Pacific</SelectItem>
                                                    <SelectItem value="UTC" className="text-xs">UTC</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-3">
                                <h3 className="text-xs font-semibold text-gray-900 border-b pb-1">Capacity</h3>
                                
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="av-hoursAvailable" className="text-xs font-medium">Hours Per Week</Label>
                                        <Input
                                            id="av-hoursAvailable"
                                            type="number"
                                            min="0"
                                            max="168"
                                            value={availabilityForm.hoursAvailable}
                                            onChange={(e) => setAvailabilityForm({ ...availabilityForm, hoursAvailable: parseInt(e.target.value) || 0 })}
                                            className="h-8 text-xs"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="av-percentageAvailable" className="text-xs font-medium">Capacity Percentage</Label>
                                        <Input
                                            id="av-percentageAvailable"
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={availabilityForm.percentageAvailable}
                                            onChange={(e) => setAvailabilityForm({ ...availabilityForm, percentageAvailable: parseInt(e.target.value) || 0 })}
                                            className="h-8 text-xs"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="av-maxProjects" className="text-xs font-medium">Max Projects</Label>
                                        <Input
                                            id="av-maxProjects"
                                            type="number"
                                            min="0"
                                            max="10"
                                            value={availabilityForm.maxProjects}
                                            onChange={(e) => setAvailabilityForm({ ...availabilityForm, maxProjects: parseInt(e.target.value) || 0 })}
                                            className="h-8 text-xs"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="av-preferredHoursPerDay" className="text-xs font-medium">Hours Per Day</Label>
                                        <Input
                                            id="av-preferredHoursPerDay"
                                            type="number"
                                            min="0"
                                            max="24"
                                            value={availabilityForm.preferredHoursPerDay}
                                            onChange={(e) => setAvailabilityForm({ ...availabilityForm, preferredHoursPerDay: parseInt(e.target.value) || 0 })}
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="av-billableTarget" className="text-xs font-medium">Billable Target (%)</Label>
                                    <Input
                                        id="av-billableTarget"
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={availabilityForm.billableTarget}
                                        onChange={(e) => setAvailabilityForm({ ...availabilityForm, billableTarget: parseInt(e.target.value) || 0 })}
                                        className="h-8 text-xs"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <h3 className="text-xs font-semibold text-gray-900 border-b pb-1">Work Preferences</h3>
                                
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="av-workLocation" className="text-xs font-medium">Work Location</Label>
                                        <Select
                                            value={availabilityForm.workLocation}
                                            onValueChange={(value) => setAvailabilityForm({ ...availabilityForm, workLocation: value })}
                                        >
                                            <SelectTrigger className="h-8 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {Object.entries(WORK_LOCATIONS).map(([value, label]) => (
                                                    <SelectItem key={value} value={value} className="text-xs">{label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="av-travelWillingness" className="text-xs font-medium">Travel Willingness</Label>
                                        <Select
                                            value={availabilityForm.travelWillingness}
                                            onValueChange={(value) => setAvailabilityForm({ ...availabilityForm, travelWillingness: value })}
                                        >
                                            <SelectTrigger className="h-8 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {Object.entries(TRAVEL_WILLINGNESS).map(([value, label]) => (
                                                    <SelectItem key={value} value={value} className="text-xs">{label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="av-travelPercentage" className="text-xs font-medium">Travel Percentage (%)</Label>
                                    <Input
                                        id="av-travelPercentage"
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={availabilityForm.travelPercentage}
                                        onChange={(e) => setAvailabilityForm({ ...availabilityForm, travelPercentage: parseInt(e.target.value) || 0 })}
                                        className="h-8 text-xs"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium">Preferred Locations</Label>
                                    <Input
                                        placeholder="e.g., New York, San Francisco (comma-separated)"
                                        value={availabilityForm.preferredLocations.join(', ')}
                                        onChange={(e) => setAvailabilityForm({ 
                                            ...availabilityForm, 
                                            preferredLocations: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                                        })}
                                        className="h-8 text-xs"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium">Preferred Project Types</Label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {Object.entries(PROJECT_TYPES).map(([value, label]) => (
                                            <div key={value} className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    id={`project-${value}`}
                                                    checked={availabilityForm.projectTypes.includes(value)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setAvailabilityForm({
                                                                ...availabilityForm,
                                                                projectTypes: [...availabilityForm.projectTypes, value]
                                                            })
                                                        } else {
                                                            setAvailabilityForm({
                                                                ...availabilityForm,
                                                                projectTypes: availabilityForm.projectTypes.filter(t => t !== value)
                                                            })
                                                        }
                                                    }}
                                                    className="h-3.5 w-3.5 rounded border-gray-300"
                                                />
                                                <Label htmlFor={`project-${value}`} className="text-xs cursor-pointer">{label}</Label>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium">Preferred Client Types</Label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {Object.entries(CLIENT_TYPES).map(([value, label]) => (
                                            <div key={value} className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    id={`client-${value}`}
                                                    checked={availabilityForm.clientTypes.includes(value)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setAvailabilityForm({
                                                                ...availabilityForm,
                                                                clientTypes: [...availabilityForm.clientTypes, value]
                                                            })
                                                        } else {
                                                            setAvailabilityForm({
                                                                ...availabilityForm,
                                                                clientTypes: availabilityForm.clientTypes.filter(t => t !== value)
                                                            })
                                                        }
                                                    }}
                                                    className="h-3.5 w-3.5 rounded border-gray-300"
                                                />
                                                <Label htmlFor={`client-${value}`} className="text-xs cursor-pointer">{label}</Label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={handleCloseAvailabilityDialog} size="sm" className="h-8 text-xs">
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSubmitAvailabilitySlot}
                                size="sm"
                                className="bg-gradient-to-r from-[#ffc451] to-[#ffb020] hover:from-[#ffb020] hover:to-[#ffc451] text-black font-medium h-8 text-xs"
                            >
                                {editingSlot ? 'Update' : 'Create'} Availability
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog open={isTimeOffDialogOpen} onOpenChange={setIsTimeOffDialogOpen}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle className="text-base">Request Time Off</DialogTitle>
                            <DialogDescription className="text-xs">
                                Submit a new time-off request for manager approval
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-3 py-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="to-reason" className="text-xs font-medium">Type of Time Off *</Label>
                                <Select
                                    value={timeOffForm.reason}
                                    onValueChange={(value) => setTimeOffForm({ ...timeOffForm, reason: value })}
                                >
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(TIME_OFF_REASONS).map(([value, label]) => (
                                            <SelectItem key={value} value={value} className="text-xs">{label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="to-startDate" className="text-xs font-medium">Start Date *</Label>
                                <Input
                                    id="to-startDate"
                                    type="date"
                                    value={timeOffForm.startDate}
                                    onChange={(e) => setTimeOffForm({ ...timeOffForm, startDate: e.target.value })}
                                    min={new Date().toISOString().split('T')[0]}
                                    className="h-8 text-xs"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="to-endDate" className="text-xs font-medium">End Date *</Label>
                                <Input
                                    id="to-endDate"
                                    type="date"
                                    value={timeOffForm.endDate}
                                    onChange={(e) => setTimeOffForm({ ...timeOffForm, endDate: e.target.value })}
                                    min={timeOffForm.startDate || new Date().toISOString().split('T')[0]}
                                    className="h-8 text-xs"
                                />
                            </div>

                            {timeOffForm.startDate && timeOffForm.endDate && (
                                <div className="rounded-lg bg-[#ffc451]/10 border border-[#ffc451]/20 p-2.5">
                                    <p className="text-xs">
                                        <span className="font-medium text-gray-900">Duration:</span>{' '}
                                        <span className="text-gray-700">{calculateDays(timeOffForm.startDate, timeOffForm.endDate)} days</span>
                                    </p>
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <Label htmlFor="to-description" className="text-xs font-medium">Reason (Optional)</Label>
                                <Textarea
                                    id="to-description"
                                    value={timeOffForm.description}
                                    onChange={(e) => setTimeOffForm({ ...timeOffForm, description: e.target.value })}
                                    placeholder="Provide additional details about your request"
                                    className="min-h-[60px] resize-none text-xs"
                                    maxLength={500}
                                />
                                <p className="text-[10px] text-gray-400">{timeOffForm.description.length}/500 characters</p>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={handleCloseTimeOffDialog} size="sm" className="h-8 text-xs">
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSubmitTimeOffRequest}
                                size="sm"
                                className="bg-gradient-to-r from-[#ffc451] to-[#ffb020] hover:from-[#ffb020] hover:to-[#ffc451] text-black font-medium h-8 text-xs"
                            >
                                Submit Request
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    )
}