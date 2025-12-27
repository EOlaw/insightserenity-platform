'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Calendar,
  Clock,
  User,
  Video,
  Search,
  Filter,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Timer,
  BarChart3,
  TrendingUp,
  DollarSign,
  Users,
  RefreshCw,
  PlayCircle,
  StopCircle,
  FileText,
  UserCheck,
  Star,
  MessageSquare,
  ArrowRight
} from 'lucide-react'
import toast from 'react-hot-toast'
import consultationsApi, { Consultation, ConsultationMetrics } from '@/lib/api/consultations'

export default function ConsultantConsultationsPage() {
  const router = useRouter()
  const [consultations, setConsultations] = useState<Consultation[]>([])
  const [filteredConsultations, setFilteredConsultations] = useState<Consultation[]>([])
  const [metrics, setMetrics] = useState<ConsultationMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null)
  const [noteContent, setNoteContent] = useState('')
  const [noteDialogOpen, setNoteDialogOpen] = useState(false)
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false)
  const [completionSummary, setCompletionSummary] = useState('')

  useEffect(() => {
    loadConsultations()
    loadMetrics()
  }, [])

  useEffect(() => {
    filterConsultations()
  }, [consultations, searchQuery, statusFilter])

  const loadConsultations = async () => {
    try {
      setLoading(true)
      const data = await consultationsApi.getMyConsultations()
      setConsultations(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to load consultations:', error)
      toast.error('Failed to load consultations')
      setConsultations([])
    } finally {
      setLoading(false)
    }
  }

  const loadMetrics = async () => {
    try {
      const data = await consultationsApi.getMetrics()
      setMetrics(data)
    } catch (error) {
      console.error('Failed to load metrics:', error)
    }
  }

  const filterConsultations = () => {
    let filtered = [...consultations]

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (c) =>
          c.details?.title?.toLowerCase().includes(query) ||
          c.details?.description?.toLowerCase().includes(query) ||
          c.consultationCode?.toLowerCase().includes(query)
      )
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((c) => c.status?.current === statusFilter)
    }

    setFilteredConsultations(filtered)
  }

  const handleStartConsultation = async (consultationId: string) => {
    try {
      await consultationsApi.startConsultation(consultationId)
      toast.success('Consultation started')
      loadConsultations()
      loadMetrics()
    } catch (error) {
      console.error('Failed to start consultation:', error)
      toast.error('Failed to start consultation')
    }
  }

  const handleCompleteConsultation = async () => {
    if (!selectedConsultation) return

    try {
      await consultationsApi.completeConsultation(selectedConsultation._id, {
        summary: completionSummary,
        overallStatus: 'successful'
      })
      toast.success('Consultation completed successfully')
      setCompletionDialogOpen(false)
      setCompletionSummary('')
      setSelectedConsultation(null)
      loadConsultations()
      loadMetrics()
    } catch (error) {
      console.error('Failed to complete consultation:', error)
      toast.error('Failed to complete consultation')
    }
  }

  const handleAddNote = async () => {
    if (!selectedConsultation || !noteContent.trim()) return

    try {
      await consultationsApi.addNote(selectedConsultation._id, {
        content: noteContent,
        type: 'general',
        visibility: 'internal'
      })
      toast.success('Note added successfully')
      setNoteDialogOpen(false)
      setNoteContent('')
      setSelectedConsultation(null)
      loadConsultations()
    } catch (error) {
      console.error('Failed to add note:', error)
      toast.error('Failed to add note')
    }
  }

  const handleCancelConsultation = async (consultationId: string) => {
    if (!confirm('Are you sure you want to cancel this consultation?')) {
      return
    }

    try {
      await consultationsApi.cancelConsultation(consultationId, 'Consultant requested cancellation')
      toast.success('Consultation cancelled successfully')
      loadConsultations()
      loadMetrics()
    } catch (error) {
      console.error('Failed to cancel consultation:', error)
      toast.error('Failed to cancel consultation')
    }
  }

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; icon: any; className: string }> = {
      scheduled: {
        label: 'Scheduled',
        icon: Calendar,
        className: 'bg-[#ffc451]/10 text-[#ffc451] border-[#ffc451]/30'
      },
      confirmed: {
        label: 'Confirmed',
        icon: CheckCircle2,
        className: 'bg-[#ffc451]/20 text-[#ffc451] border-[#ffc451]/40'
      },
      in_progress: {
        label: 'In Progress',
        icon: Timer,
        className: 'bg-[#ffc451] text-black border-[#ffc451]'
      },
      completed: {
        label: 'Completed',
        icon: CheckCircle2,
        className: 'bg-black text-[#ffc451] border-[#ffc451]/50'
      },
      cancelled: {
        label: 'Cancelled',
        icon: XCircle,
        className: 'bg-gray-100 text-gray-600 border-gray-300'
      },
      no_show: {
        label: 'No Show',
        icon: AlertCircle,
        className: 'bg-red-50 text-red-600 border-red-200'
      }
    }

    const config = statusConfig[status] || statusConfig.scheduled
    const Icon = config.icon

    return (
      <Badge className={`${config.className} flex items-center gap-1 text-[10px] px-2 py-0.5`} variant="outline">
        <Icon className="h-2.5 w-2.5" />
        {config.label}
      </Badge>
    )
  }

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString)
    return {
      date: date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }),
      time: date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      })
    }
  }

  const isUpcoming = (dateString: string) => {
    return new Date(dateString) > new Date()
  }

  const isPast = (dateString: string) => {
    return new Date(dateString) < new Date()
  }

  const upcomingConsultations = filteredConsultations.filter(
    (c) => isUpcoming(c.schedule?.scheduledStart || '') &&
           ['scheduled', 'confirmed'].includes(c.status?.current || '')
  )

  const inProgressConsultations = filteredConsultations.filter(
    (c) => c.status?.current === 'in_progress'
  )

  const pastConsultations = filteredConsultations.filter(
    (c) => isPast(c.schedule?.scheduledStart || '') ||
           ['completed', 'cancelled', 'no_show'].includes(c.status?.current || '')
  )

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-[#ffc451] mx-auto mb-3" />
          <p className="text-xs text-muted-foreground">Loading consultations...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/10">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-lg font-bold mb-1">Consultant Dashboard</h1>
          <p className="text-xs text-muted-foreground">
            Manage your consultation sessions and track performance
          </p>
        </div>

        {/* Metrics Cards */}
        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Card className="border-[#ffc451]/20 bg-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <BarChart3 className="h-4 w-4 text-[#ffc451]" />
                  <TrendingUp className="h-3 w-3 text-[#ffc451]/70" />
                </div>
                <div className="text-xl font-bold text-[#ffc451] mb-0.5">
                  {metrics.totalConsultations}
                </div>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Total Sessions</p>
              </CardContent>
            </Card>

            <Card className="border-[#ffc451]/20 bg-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <CheckCircle2 className="h-4 w-4 text-[#ffc451]" />
                  <span className="text-[9px] text-[#ffc451] font-medium">
                    {metrics.completionRate.toFixed(0)}%
                  </span>
                </div>
                <div className="text-xl font-bold text-[#ffc451] mb-0.5">
                  {metrics.completedConsultations}
                </div>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Completed</p>
              </CardContent>
            </Card>

            <Card className="border-[#ffc451]/20 bg-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Users className="h-4 w-4 text-[#ffc451]" />
                  <Star className="h-3 w-3 text-[#ffc451]/70" />
                </div>
                <div className="text-xl font-bold text-[#ffc451] mb-0.5">
                  {metrics.uniqueClients}
                </div>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Unique Clients</p>
              </CardContent>
            </Card>

            <Card className="border-[#ffc451]/20 bg-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Star className="h-4 w-4 text-[#ffc451]" />
                  <span className="text-[9px] text-[#ffc451] font-medium">
                    / 5.0
                  </span>
                </div>
                <div className="text-xl font-bold text-[#ffc451] mb-0.5">
                  {metrics.averageRating.toFixed(1)}
                </div>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Avg Rating</p>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid lg:grid-cols-4 gap-4">
          {/* Left Sidebar - Filters */}
          <div className="space-y-3">
            <Card className="border-[#ffc451]/20">
              <CardHeader className="pb-2 px-3 pt-3">
                <CardTitle className="text-xs flex items-center gap-2">
                  <Filter className="h-3 w-3 text-[#ffc451]" />
                  Filters
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 px-3 pb-3">
                <div>
                  <label className="text-[10px] font-medium mb-1 block text-muted-foreground">Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-2 py-1.5 border border-input rounded-md bg-background text-[10px] focus:border-[#ffc451] focus:ring-1 focus:ring-[#ffc451]"
                  >
                    <option value="all">All Statuses</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-[10px] h-7 border-[#ffc451]/30 hover:bg-[#ffc451]/10 hover:text-[#ffc451] hover:border-[#ffc451]/50"
                  onClick={() => {
                    setSearchQuery('')
                    setStatusFilter('all')
                  }}
                >
                  <RefreshCw className="mr-1.5 h-3 w-3" />
                  Reset Filters
                </Button>
              </CardContent>
            </Card>

            <Card className="border-[#ffc451]/20">
              <CardHeader className="pb-2 px-3 pt-3">
                <CardTitle className="text-xs">Quick Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 px-3 pb-3">
                <div className="flex items-center justify-between p-2 bg-[#ffc451]/10 rounded border border-[#ffc451]/20">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3 w-3 text-[#ffc451]" />
                    <span className="text-[10px] font-medium">Upcoming</span>
                  </div>
                  <span className="text-xs font-bold text-[#ffc451]">
                    {upcomingConsultations.length}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 bg-[#ffc451]/5 rounded border border-[#ffc451]/10">
                  <div className="flex items-center gap-1.5">
                    <Timer className="h-3 w-3 text-[#ffc451]" />
                    <span className="text-[10px] font-medium">In Progress</span>
                  </div>
                  <span className="text-xs font-bold text-[#ffc451]">
                    {inProgressConsultations.length}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 bg-secondary rounded border border-border">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] font-medium">Past</span>
                  </div>
                  <span className="text-xs font-bold text-muted-foreground">
                    {pastConsultations.length}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by title, description, or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9 text-xs"
              />
            </div>

            {/* In Progress Consultations */}
            {inProgressConsultations.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold mb-2 flex items-center gap-2 text-[#ffc451]">
                  <Timer className="h-3.5 w-3.5" />
                  Active Sessions
                </h2>
                <div className="space-y-2">
                  {inProgressConsultations.map((consultation) => {
                    const { date, time } = formatDateTime(consultation.schedule?.scheduledStart || '')
                    return (
                      <Card key={consultation._id} className="border-[#ffc451]/30 hover:shadow-md transition-shadow">
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-xs">
                                  {consultation.details?.title}
                                </h3>
                                {getStatusBadge(consultation.status?.current || 'in_progress')}
                              </div>
                              <p className="text-[10px] text-muted-foreground mb-2 line-clamp-1">
                                {consultation.details?.description || 'No description'}
                              </p>
                              <div className="flex flex-wrap gap-3 text-[10px]">
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <Calendar className="h-2.5 w-2.5" />
                                  <span>{date}</span>
                                </div>
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <Clock className="h-2.5 w-2.5" />
                                  <span>{time}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-2 border-t border-[#ffc451]/10">
                            <Button
                              size="sm"
                              className="bg-[#ffc451] hover:bg-[#ffc451]/90 text-black text-[10px] h-7 px-3"
                              onClick={() => {
                                setSelectedConsultation(consultation)
                                setCompletionDialogOpen(true)
                              }}
                            >
                              <StopCircle className="mr-1.5 h-3 w-3" />
                              Complete
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-[10px] h-7 px-3 border-gray-300 hover:bg-gray-100"
                              onClick={() => {
                                setSelectedConsultation(consultation)
                                setNoteDialogOpen(true)
                              }}
                            >
                              <FileText className="mr-1.5 h-3 w-3" />
                              Add Note
                            </Button>
                            <span className="text-[9px] text-muted-foreground ml-auto font-mono">
                              {consultation.consultationCode}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Upcoming Consultations */}
            {upcomingConsultations.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold mb-2 flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-[#ffc451]" />
                  Upcoming Sessions
                </h2>
                <div className="space-y-2">
                  {upcomingConsultations.map((consultation) => {
                    const { date, time } = formatDateTime(consultation.schedule?.scheduledStart || '')
                    return (
                      <Card key={consultation._id} className="border-[#ffc451]/20 hover:shadow-md transition-shadow">
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-xs">
                                  {consultation.details?.title}
                                </h3>
                                {getStatusBadge(consultation.status?.current || 'scheduled')}
                              </div>
                              <p className="text-[10px] text-muted-foreground mb-2 line-clamp-1">
                                {consultation.details?.description || 'No description'}
                              </p>
                              <div className="flex flex-wrap gap-3 text-[10px]">
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <Calendar className="h-2.5 w-2.5" />
                                  <span>{date}</span>
                                </div>
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <Clock className="h-2.5 w-2.5" />
                                  <span>{time}</span>
                                </div>
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <User className="h-2.5 w-2.5" />
                                  <span>Client Confirmed</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-2 border-t border-[#ffc451]/10">
                            <Button
                              size="sm"
                              className="bg-[#ffc451] hover:bg-[#ffc451]/90 text-black text-[10px] h-7 px-3"
                              onClick={() => handleStartConsultation(consultation._id)}
                            >
                              <PlayCircle className="mr-1.5 h-3 w-3" />
                              Start Session
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-[10px] h-7 px-3 border-gray-300 hover:bg-gray-100"
                              onClick={() => handleCancelConsultation(consultation._id)}
                            >
                              Cancel
                            </Button>
                            <span className="text-[9px] text-muted-foreground ml-auto font-mono">
                              {consultation.consultationCode}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Past Consultations */}
            {pastConsultations.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold mb-2 flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Past Sessions
                </h2>
                <div className="space-y-2">
                  {pastConsultations.slice(0, 5).map((consultation) => {
                    const { date, time } = formatDateTime(consultation.schedule?.scheduledStart || '')
                    return (
                      <Card key={consultation._id} className="opacity-75 border-gray-200">
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-xs">
                                  {consultation.details?.title}
                                </h3>
                                {getStatusBadge(consultation.status?.current || 'completed')}
                              </div>
                              <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-2.5 w-2.5" />
                                  <span>{date}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Clock className="h-2.5 w-2.5" />
                                  <span>{time}</span>
                                </div>
                                <span className="ml-auto text-[9px] font-mono">
                                  {consultation.consultationCode}
                                </span>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Empty State */}
            {filteredConsultations.length === 0 && (
              <Card className="border-[#ffc451]/20">
                <CardContent className="py-10 text-center">
                  <Video className="h-10 w-10 text-[#ffc451]/50 mx-auto mb-3" />
                  <h3 className="text-xs font-semibold mb-1">No Consultations Found</h3>
                  <p className="text-[10px] text-muted-foreground max-w-md mx-auto">
                    {searchQuery || statusFilter !== 'all'
                      ? 'No consultations match your current filters.'
                      : 'You have no scheduled consultations yet.'}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Add Note Dialog */}
      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm text-[#ffc451]">Add Consultation Note</DialogTitle>
            <DialogDescription className="text-[10px]">
              Add internal notes about this consultation session.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-medium mb-1.5 block">Note Content</label>
              <Textarea
                placeholder="Enter your notes here..."
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                className="min-h-[120px] text-xs"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setNoteDialogOpen(false)
                  setNoteContent('')
                  setSelectedConsultation(null)
                }}
                className="text-[10px] h-8"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAddNote}
                disabled={!noteContent.trim()}
                className="bg-[#ffc451] hover:bg-[#ffc451]/90 text-black text-[10px] h-8"
              >
                <FileText className="mr-1.5 h-3 w-3" />
                Save Note
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Complete Consultation Dialog */}
      <Dialog open={completionDialogOpen} onOpenChange={setCompletionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm text-[#ffc451]">Complete Consultation</DialogTitle>
            <DialogDescription className="text-[10px]">
              Mark this consultation as completed and add a summary.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-medium mb-1.5 block">Session Summary</label>
              <Textarea
                placeholder="Summarize what was discussed and accomplished..."
                value={completionSummary}
                onChange={(e) => setCompletionSummary(e.target.value)}
                className="min-h-[120px] text-xs"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCompletionDialogOpen(false)
                  setCompletionSummary('')
                  setSelectedConsultation(null)
                }}
                className="text-[10px] h-8"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCompleteConsultation}
                className="bg-[#ffc451] hover:bg-[#ffc451]/90 text-black text-[10px] h-8"
              >
                <CheckCircle2 className="mr-1.5 h-3 w-3" />
                Complete Session
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
