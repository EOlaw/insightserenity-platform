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
  const [selectedRecord, setSelectedRecord] = useState<AvailabilityRecord | null>(null)

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
      const [profileData, availabilityData] = await Promise.all([
        consultantApi.getMyProfile(),
        consultantApi.getMyAvailability(),
      ])

      setConsultant(profileData)
      setAvailabilityRecords(availabilityData)
      toast.success('Availability data loaded successfully')
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
    setSelectedRecord(null)
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
    const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      pending: { label: 'Pending', variant: 'secondary' },
      approved: { label: 'Approved', variant: 'default' },
      rejected: { label: 'Rejected', variant: 'destructive' },
      cancelled: { label: 'Cancelled', variant: 'outline' },
    }
    
    const config = statusConfig[status] || statusConfig.pending
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'rejected':
        return <XCircle className="h-4 w-4 text-destructive" />
      case 'cancelled':
        return <X className="h-4 w-4 text-muted-foreground" />
      default:
        return <Clock className="h-4 w-4 text-yellow-600" />
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
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Loading availability data...</p>
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
            <h1 className="text-2xl font-bold">Availability Management</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage your time-off requests and availability
            </p>
          </div>
        </div>
        <Button onClick={handleOpenDialog} size="sm">
          <Plus className="mr-2 h-3.5 w-3.5" />
          Request Time Off
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Pending Requests</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingRequests.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Awaiting approval
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Approved Time Off</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{approvedRequests.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Upcoming absences
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Days Off This Year</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {approvedRequests.reduce((total, record) => {
                return total + calculateDays(record.startDate, record.endDate)
              }, 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Total approved days
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending Requests</CardTitle>
          <CardDescription>
            Time-off requests awaiting manager approval
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingRequests.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No pending requests</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map((record) => (
                <div key={record._id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {getStatusIcon(record.status)}
                        <span className="font-medium text-sm capitalize">
                          {record.type.replace('_', ' ')}
                        </span>
                        {getStatusBadge(record.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {new Date(record.startDate).toLocaleDateString()} - {new Date(record.endDate).toLocaleDateString()}
                        <span className="mx-2">·</span>
                        {calculateDays(record.startDate, record.endDate)} days
                      </p>
                      {record.reason && (
                        <p className="text-sm text-muted-foreground mt-2">
                          {record.reason}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancelRequest(record)}
                      className="text-destructive hover:text-destructive"
                    >
                      Cancel
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Requested on {new Date(record.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Approved Time Off</CardTitle>
          <CardDescription>
            Your confirmed upcoming absences
          </CardDescription>
        </CardHeader>
        <CardContent>
          {approvedRequests.length === 0 ? (
            <div className="text-center py-8">
              <CalendarIcon className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No approved time off</p>
            </div>
          ) : (
            <div className="space-y-3">
              {approvedRequests.map((record) => (
                <div key={record._id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {getStatusIcon(record.status)}
                        <span className="font-medium text-sm capitalize">
                          {record.type.replace('_', ' ')}
                        </span>
                        {getStatusBadge(record.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {new Date(record.startDate).toLocaleDateString()} - {new Date(record.endDate).toLocaleDateString()}
                        <span className="mx-2">·</span>
                        {calculateDays(record.startDate, record.endDate)} days
                      </p>
                      {record.reason && (
                        <p className="text-sm text-muted-foreground mt-2">
                          {record.reason}
                        </p>
                      )}
                    </div>
                  </div>
                  {record.approvedBy && record.approvedAt && (
                    <div className="text-xs text-muted-foreground">
                      Approved on {new Date(record.approvedAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {pastRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Request History</CardTitle>
            <CardDescription>
              Past and cancelled requests
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pastRequests.slice(0, 5).map((record) => (
                <div key={record._id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {getStatusIcon(record.status)}
                        <span className="font-medium text-sm capitalize">
                          {record.type.replace('_', ' ')}
                        </span>
                        {getStatusBadge(record.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {new Date(record.startDate).toLocaleDateString()} - {new Date(record.endDate).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request Time Off</DialogTitle>
            <DialogDescription>
              Submit a new time-off request for manager approval
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="type">Type of Time Off *</Label>
              <Select
                value={requestForm.type}
                onValueChange={(value) => setRequestForm({ ...requestForm, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OFF_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date *</Label>
              <Input
                id="startDate"
                type="date"
                value={requestForm.startDate}
                onChange={(e) => setRequestForm({ ...requestForm, startDate: e.target.value })}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">End Date *</Label>
              <Input
                id="endDate"
                type="date"
                value={requestForm.endDate}
                onChange={(e) => setRequestForm({ ...requestForm, endDate: e.target.value })}
                min={requestForm.startDate || new Date().toISOString().split('T')[0]}
              />
            </div>

            {requestForm.startDate && requestForm.endDate && (
              <div className="rounded-lg bg-muted p-3">
                <p className="text-sm">
                  <span className="font-medium">Duration:</span>{' '}
                  {calculateDays(requestForm.startDate, requestForm.endDate)} days
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="reason">Reason (Optional)</Label>
              <Textarea
                id="reason"
                value={requestForm.reason}
                onChange={(e) => setRequestForm({ ...requestForm, reason: e.target.value })}
                placeholder="Provide additional details about your request"
                className="min-h-[80px] resize-none"
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">{requestForm.reason.length}/500 characters</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button onClick={handleSubmitRequest}>
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}