'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
    AlertCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { consultantApi, type ConsultantProfile, type AvailabilityRecord } from '@/lib/api/consultant'

const TIME_OFF_TYPES = [
    { value: 'vacation', label: 'Vacation' },
    { value: 'sick_leave', label: 'Sick Leave' },
    { value: 'training', label: 'Training' },
    { value: 'personal', label: 'Personal' },
    { value: 'other', label: 'Other' },
]

export default function AvailabilityManagementPage() {
    const router = useRouter()
    const [consultant, setConsultant] = useState<ConsultantProfile | null>(null)
    const [availabilityRecords, setAvailabilityRecords] = useState<AvailabilityRecord[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isDialogOpen, setIsDialogOpen] = useState(false)

    const [requestForm, setRequestForm] = useState({
        type: 'vacation',
        startDate: '',
        endDate: '',
        reason: '',
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

            // Handle wrapped responses
            const profileData = profileResponse?.data || profileResponse
            setConsultant(profileData)

            let availabilityData: AvailabilityRecord[]
            if (Array.isArray(availabilityResponse)) {
                availabilityData = availabilityResponse
            } else if (availabilityResponse && typeof availabilityResponse === 'object' && 'data' in availabilityResponse) {
                const extracted = (availabilityResponse as any).data
                availabilityData = Array.isArray(extracted) ? extracted : []
            } else {
                availabilityData = []
            }
            
            setAvailabilityRecords(availabilityData)
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

    const resetForm = () => {
        setRequestForm({
            type: 'vacation',
            startDate: '',
            endDate: '',
            reason: '',
        })
    }

    const handleOpenDialog = () => {
        resetForm()
        setIsDialogOpen(true)
    }

    const handleCloseDialog = () => {
        setIsDialogOpen(false)
        setTimeout(resetForm, 300)
    }

    const handleSubmitRequest = async () => {
        if (!requestForm.startDate || !requestForm.endDate) {
            toast.error('Start date and end date are required')
            return
        }

        if (new Date(requestForm.endDate) < new Date(requestForm.startDate)) {
            toast.error('End date must be after start date')
            return
        }

        if (!consultant?._id) {
            toast.error('Consultant ID not found')
            return
        }

        try {
            await consultantApi.requestTimeOff(consultant._id, {
                type: requestForm.type as any,
                startDate: requestForm.startDate,
                endDate: requestForm.endDate,
                reason: requestForm.reason || undefined,
            })

            toast.success('Time-off request submitted successfully')
            handleCloseDialog()
            await loadData()
        } catch (error: any) {
            console.error('Failed to submit request:', error)
            toast.error(error.response?.data?.message || 'Failed to submit request')
        }
    }

    const handleCancelRequest = async (record: AvailabilityRecord) => {
        if (!confirm('Are you sure you want to cancel this time-off request?')) {
            return
        }

        try {
            await consultantApi.cancelAvailabilityRecord(record._id)
            toast.success('Request cancelled successfully')
            await loadData()
        } catch (error: any) {
            console.error('Failed to cancel request:', error)
            toast.error(error.response?.data?.message || 'Failed to cancel request')
        }
    }

    const getStatusBadge = (status: string) => {
        const statusConfig: Record<string, { label: string; className: string }> = {
            pending: { label: 'Pending', className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30' },
            approved: { label: 'Approved', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
            rejected: { label: 'Rejected', className: 'bg-red-500/10 text-red-600 border-red-500/30' },
            cancelled: { label: 'Cancelled', className: 'bg-gray-500/10 text-gray-600 border-gray-500/30' },
        }

        const config = statusConfig[status] || statusConfig.pending
        return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border ${config.className}`}>{config.label}</span>
    }

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'approved':
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
        const diffTime = Math.abs(end.getTime() - start.getTime())
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
        return diffDays
    }

    const pendingRequests = availabilityRecords.filter(r => r.status === 'pending')
    const approvedRequests = availabilityRecords.filter(r => r.status === 'approved')
    const pastRequests = availabilityRecords.filter(r =>
        r.status !== 'pending' && r.status !== 'approved'
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
            <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
                {/* Compact Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link href="/dashboard/consultant">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <ArrowLeft className="h-3.5 w-3.5" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-lg font-bold text-gray-900">Availability Management</h1>
                            <p className="text-xs text-gray-500">
                                Manage your time-off requests and availability
                            </p>
                        </div>
                    </div>
                    <Button 
                        onClick={handleOpenDialog} 
                        size="sm"
                        className="bg-gradient-to-r from-[#ffc451] to-[#ffb020] hover:from-[#ffb020] hover:to-[#ffc451] text-black font-medium text-xs h-8"
                    >
                        <Plus className="mr-1.5 h-3 w-3" />
                        Request Time Off
                    </Button>
                </div>

                {/* Compact Stats Grid */}
                <div className="grid gap-3 md:grid-cols-3">
                    <Card className="border-yellow-500/20">
                        <CardContent className="p-3">
                            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Pending Requests</p>
                            <div className="text-xl font-bold text-gray-900">{pendingRequests.length}</div>
                            <p className="text-[10px] text-gray-400 mt-0.5">Awaiting approval</p>
                        </CardContent>
                    </Card>

                    <Card className="border-emerald-500/20">
                        <CardContent className="p-3">
                            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Approved Time Off</p>
                            <div className="text-xl font-bold text-gray-900">{approvedRequests.length}</div>
                            <p className="text-[10px] text-gray-400 mt-0.5">Upcoming absences</p>
                        </CardContent>
                    </Card>

                    <Card className="border-[#ffc451]/20">
                        <CardContent className="p-3">
                            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Days Off This Year</p>
                            <div className="text-xl font-bold text-gray-900">
                                {approvedRequests.reduce((total, record) => {
                                    return total + calculateDays(record.startDate, record.endDate)
                                }, 0)}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-0.5">Total approved days</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Pending Requests */}
                <Card className="border-[#ffc451]/20">
                    <CardHeader className="p-3 pb-2">
                        <CardTitle className="text-xs font-bold text-gray-900">Pending Requests</CardTitle>
                        <CardDescription className="text-[10px]">
                            Time-off requests awaiting manager approval
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                        {pendingRequests.length === 0 ? (
                            <div className="text-center py-8">
                                <Clock className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                                <p className="text-xs text-gray-500">No pending requests</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {pendingRequests.map((record) => (
                                    <div key={record._id} className="rounded-lg border border-gray-100 hover:border-[#ffc451]/30 p-2.5 space-y-2 bg-white hover:shadow-sm transition-all">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    {getStatusIcon(record.status)}
                                                    <span className="text-xs font-medium text-gray-900 capitalize">
                                                        {record.type.replace('_', ' ')}
                                                    </span>
                                                    {getStatusBadge(record.status)}
                                                </div>
                                                <p className="text-[10px] text-gray-500">
                                                    {new Date(record.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(record.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                    <span className="mx-1.5">·</span>
                                                    {calculateDays(record.startDate, record.endDate)} days
                                                </p>
                                                {record.reason && (
                                                    <p className="text-[10px] text-gray-400 mt-1.5 line-clamp-2">
                                                        {record.reason}
                                                    </p>
                                                )}
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleCancelRequest(record)}
                                                className="h-7 text-[10px] text-red-600 hover:text-red-700 hover:bg-red-50"
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                        <div className="text-[9px] text-gray-400">
                                            Requested on {new Date(record.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Approved Time Off */}
                <Card className="border-[#ffc451]/20">
                    <CardHeader className="p-3 pb-2">
                        <CardTitle className="text-xs font-bold text-gray-900">Approved Time Off</CardTitle>
                        <CardDescription className="text-[10px]">
                            Your confirmed upcoming absences
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                        {approvedRequests.length === 0 ? (
                            <div className="text-center py-8">
                                <CalendarIcon className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                                <p className="text-xs text-gray-500">No approved time off</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {approvedRequests.map((record) => (
                                    <div key={record._id} className="rounded-lg border border-gray-100 hover:border-[#ffc451]/30 p-2.5 space-y-2 bg-white hover:shadow-sm transition-all">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    {getStatusIcon(record.status)}
                                                    <span className="text-xs font-medium text-gray-900 capitalize">
                                                        {record.type.replace('_', ' ')}
                                                    </span>
                                                    {getStatusBadge(record.status)}
                                                </div>
                                                <p className="text-[10px] text-gray-500">
                                                    {new Date(record.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(record.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                    <span className="mx-1.5">·</span>
                                                    {calculateDays(record.startDate, record.endDate)} days
                                                </p>
                                                {record.reason && (
                                                    <p className="text-[10px] text-gray-400 mt-1.5 line-clamp-2">
                                                        {record.reason}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        {record.approvedBy && record.approvedAt && (
                                            <div className="text-[9px] text-gray-400">
                                                Approved on {new Date(record.approvedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Request History */}
                {pastRequests.length > 0 && (
                    <Card className="border-[#ffc451]/20">
                        <CardHeader className="p-3 pb-2">
                            <CardTitle className="text-xs font-bold text-gray-900">Request History</CardTitle>
                            <CardDescription className="text-[10px]">
                                Past and cancelled requests
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                            <div className="space-y-2">
                                {pastRequests.slice(0, 5).map((record) => (
                                    <div key={record._id} className="rounded-lg border border-gray-100 p-2.5 bg-white">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    {getStatusIcon(record.status)}
                                                    <span className="text-xs font-medium text-gray-900 capitalize">
                                                        {record.type.replace('_', ' ')}
                                                    </span>
                                                    {getStatusBadge(record.status)}
                                                </div>
                                                <p className="text-[10px] text-gray-500">
                                                    {new Date(record.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(record.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Request Dialog */}
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle className="text-base">Request Time Off</DialogTitle>
                            <DialogDescription className="text-xs">
                                Submit a new time-off request for manager approval
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-3 py-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="type" className="text-xs font-medium">Type of Time Off *</Label>
                                <Select
                                    value={requestForm.type}
                                    onValueChange={(value) => setRequestForm({ ...requestForm, type: value })}
                                >
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {TIME_OFF_TYPES.map(type => (
                                            <SelectItem key={type.value} value={type.value} className="text-xs">{type.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="startDate" className="text-xs font-medium">Start Date *</Label>
                                <Input
                                    id="startDate"
                                    type="date"
                                    value={requestForm.startDate}
                                    onChange={(e) => setRequestForm({ ...requestForm, startDate: e.target.value })}
                                    min={new Date().toISOString().split('T')[0]}
                                    className="h-8 text-xs"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="endDate" className="text-xs font-medium">End Date *</Label>
                                <Input
                                    id="endDate"
                                    type="date"
                                    value={requestForm.endDate}
                                    onChange={(e) => setRequestForm({ ...requestForm, endDate: e.target.value })}
                                    min={requestForm.startDate || new Date().toISOString().split('T')[0]}
                                    className="h-8 text-xs"
                                />
                            </div>

                            {requestForm.startDate && requestForm.endDate && (
                                <div className="rounded-lg bg-[#ffc451]/10 border border-[#ffc451]/20 p-2.5">
                                    <p className="text-xs">
                                        <span className="font-medium text-gray-900">Duration:</span>{' '}
                                        <span className="text-gray-700">{calculateDays(requestForm.startDate, requestForm.endDate)} days</span>
                                    </p>
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <Label htmlFor="reason" className="text-xs font-medium">Reason (Optional)</Label>
                                <Textarea
                                    id="reason"
                                    value={requestForm.reason}
                                    onChange={(e) => setRequestForm({ ...requestForm, reason: e.target.value })}
                                    placeholder="Provide additional details about your request"
                                    className="min-h-[60px] resize-none text-xs"
                                    maxLength={500}
                                />
                                <p className="text-[10px] text-gray-400">{requestForm.reason.length}/500 characters</p>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={handleCloseDialog} size="sm" className="h-8 text-xs">
                                Cancel
                            </Button>
                            <Button 
                                onClick={handleSubmitRequest} 
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