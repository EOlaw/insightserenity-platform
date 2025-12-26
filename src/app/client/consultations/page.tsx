'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Calendar,
  Clock,
  User,
  Video,
  Plus,
  Search,
  Filter,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Timer,
  CreditCard,
  ArrowRight,
  RefreshCw
} from 'lucide-react'
import toast from 'react-hot-toast'
import consultationsApi, { Consultation } from '@/lib/api/consultations'

export default function ClientConsultationsPage() {
  const router = useRouter()
  const [consultations, setConsultations] = useState<Consultation[]>([])
  const [filteredConsultations, setFilteredConsultations] = useState<Consultation[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [creditBalance, setCreditBalance] = useState<any>(null)

  useEffect(() => {
    loadConsultations()
    loadCreditBalance()
  }, [])

  useEffect(() => {
    filterConsultations()
  }, [consultations, searchQuery, statusFilter])

  const loadConsultations = async () => {
    try {
      setLoading(true)
      const data = await consultationsApi.getMyConsultations()
      // Ensure data is an array
      setConsultations(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to load consultations:', error)
      toast.error('Failed to load consultations')
      setConsultations([]) // Set to empty array on error
    } finally {
      setLoading(false)
    }
  }

  const loadCreditBalance = async () => {
    try {
      const balance = await consultationsApi.getCreditBalance()
      setCreditBalance(balance)
    } catch (error) {
      console.error('Failed to load credit balance:', error)
    }
  }

  const filterConsultations = () => {
    let filtered = [...consultations]

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (c) =>
          c.details?.topic?.toLowerCase().includes(query) ||
          c.details?.description?.toLowerCase().includes(query) ||
          c.consultationCode?.toLowerCase().includes(query)
      )
    }

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter((c) => c.status?.current === statusFilter)
    }

    setFilteredConsultations(filtered)
  }

  const handleCancelConsultation = async (consultationId: string) => {
    if (!confirm('Are you sure you want to cancel this consultation?')) {
      return
    }

    try {
      await consultationsApi.cancelConsultation(consultationId, 'Client requested cancellation')
      toast.success('Consultation cancelled successfully')
      loadConsultations()
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
        className: 'bg-black/80 text-[#ffc451] border-[#ffc451]/50'
      },
      cancelled: {
        label: 'Cancelled',
        icon: XCircle,
        className: 'bg-gray-100 text-gray-800 border-gray-200'
      },
      no_show: {
        label: 'No Show',
        icon: AlertCircle,
        className: 'bg-gray-100 text-gray-800 border-gray-200'
      }
    }

    const config = statusConfig[status] || statusConfig.scheduled
    const Icon = config.icon

    return (
      <Badge className={`${config.className} flex items-center gap-1`} variant="outline">
        <Icon className="h-3 w-3" />
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

  const pastConsultations = filteredConsultations.filter(
    (c) => isPast(c.schedule?.scheduledStart || '') ||
           ['completed', 'cancelled', 'no_show'].includes(c.status?.current || '')
  )

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-[#ffc451] mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading your consultations...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/10">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-bold mb-1">My Consultations</h1>
            <p className="text-sm text-muted-foreground">
              Manage and track your consultation sessions
            </p>
          </div>
          <Link href="/consultations/packages">
            <Button size="lg" className="bg-[#ffc451] hover:bg-[#ffc451]/90 text-black">
              <Plus className="mr-2 h-4 w-4" />
              Book New Consultation
            </Button>
          </Link>
        </div>

        <div className="grid lg:grid-cols-4 gap-6">
          {/* Left Column - Stats & Filters */}
          <div className="space-y-4">
            {/* Credit Balance Card */}
            {creditBalance && (
              <Card className="border-[#ffc451]/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-[#ffc451]" />
                    Your Credits
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-4 border-b border-[#ffc451]/20 mb-3">
                    <div className="text-2xl font-bold text-[#ffc451] mb-1">
                      {creditBalance.availableCredits}
                    </div>
                    <p className="text-xs text-muted-foreground">Available</p>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Purchased</span>
                      <span className="font-medium">
                        {creditBalance.lifetime?.totalCreditsPurchased || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Used</span>
                      <span className="font-medium">
                        {creditBalance.lifetime?.totalCreditsUsed || 0}
                      </span>
                    </div>
                  </div>
                  <Link href="/consultations/packages">
                    <Button variant="outline" size="sm" className="w-full mt-4 border-[#ffc451]/30 hover:bg-[#ffc451]/10 hover:text-[#ffc451]">
                      <Plus className="mr-2 h-3 w-3" />
                      Buy More Credits
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}

            {/* Stats Card */}
            <Card className="border-[#ffc451]/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs">Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-[#ffc451]/10 rounded-lg border border-[#ffc451]/20">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-[#ffc451]" />
                    <span className="text-xs font-medium">Upcoming</span>
                  </div>
                  <span className="text-sm font-bold text-[#ffc451]">
                    {upcomingConsultations.length}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-[#ffc451]/5 rounded-lg border border-[#ffc451]/10">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#ffc451]" />
                    <span className="text-xs font-medium">Completed</span>
                  </div>
                  <span className="text-sm font-bold text-[#ffc451]">
                    {consultations?.filter(c => c.status?.current === 'completed').length}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800">
                  <div className="flex items-center gap-2">
                    <Video className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                    <span className="text-xs font-medium">Total</span>
                  </div>
                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    {consultations.length}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Filters Card */}
            <Card className="border-[#ffc451]/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs flex items-center gap-2">
                  <Filter className="h-4 w-4 text-[#ffc451]" />
                  Filters
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-xs font-medium mb-2 block">Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background text-xs focus:border-[#ffc451] focus:ring-[#ffc451]"
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
                  className="w-full border-[#ffc451]/30 hover:bg-[#ffc451]/10 hover:text-[#ffc451]"
                  onClick={() => {
                    setSearchQuery('')
                    setStatusFilter('all')
                  }}
                >
                  <RefreshCw className="mr-2 h-3 w-3" />
                  Reset Filters
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Consultations List */}
          <div className="lg:col-span-3 space-y-6">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search consultations by topic, description, or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Upcoming Consultations */}
            {upcomingConsultations.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[#ffc451]" />
                  Upcoming Consultations
                </h2>
                <div className="space-y-4">
                  {upcomingConsultations.map((consultation) => {
                    const { date, time } = formatDateTime(consultation.schedule?.scheduledStart || '')
                    return (
                      <Card key={consultation._id} className="hover:shadow-md transition-shadow border-[#ffc451]/20">
                        <CardContent className="p-6">
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="font-semibold text-sm">
                                  {consultation.details?.topic}
                                </h3>
                                {getStatusBadge(consultation.status?.current || 'scheduled')}
                              </div>
                              <p className="text-xs text-muted-foreground mb-3">
                                {consultation.details?.description || 'No description provided'}
                              </p>
                              <div className="flex flex-wrap gap-4 text-xs">
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <Calendar className="h-3 w-3" />
                                  <span>{date}</span>
                                </div>
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  <span>{time}</span>
                                </div>
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <User className="h-3 w-3" />
                                  <span>Consultant assigned</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-4 border-t border-[#ffc451]/10">
                            <Button size="sm" variant="default" className="bg-[#ffc451] hover:bg-[#ffc451]/90 text-black">
                              <Video className="mr-2 h-3 w-3" />
                              Join Meeting
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCancelConsultation(consultation._id)}
                              className="border-gray-300 hover:bg-gray-100"
                            >
                              Cancel
                            </Button>
                            <span className="text-xs text-muted-foreground ml-auto">
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
                <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  Past Consultations
                </h2>
                <div className="space-y-4">
                  {pastConsultations.map((consultation) => {
                    const { date, time } = formatDateTime(consultation.schedule?.scheduledStart || '')
                    return (
                      <Card key={consultation._id} className="opacity-75 border-gray-200">
                        <CardContent className="p-6">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="font-semibold text-sm">
                                  {consultation.details?.topic}
                                </h3>
                                {getStatusBadge(consultation.status?.current || 'completed')}
                              </div>
                              <p className="text-xs text-muted-foreground mb-3">
                                {consultation.details?.description || 'No description provided'}
                              </p>
                              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  <span>{date}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  <span>{time}</span>
                                </div>
                                <span className="text-xs ml-auto">
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
                <CardContent className="py-12 text-center">
                  <Video className="h-12 w-12 text-[#ffc451]/50 mx-auto mb-4" />
                  <h3 className="text-sm font-semibold mb-2">No Consultations Found</h3>
                  <p className="text-xs text-muted-foreground mb-6 max-w-md mx-auto">
                    {searchQuery || statusFilter !== 'all'
                      ? 'No consultations match your current filters. Try adjusting your search.'
                      : "You haven't booked any consultations yet. Get started by booking your first session!"}
                  </p>
                  <Link href="/consultations/packages">
                    <Button className="bg-[#ffc451] hover:bg-[#ffc451]/90 text-black">
                      <Plus className="mr-2 h-4 w-4" />
                      Book Your First Consultation
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
