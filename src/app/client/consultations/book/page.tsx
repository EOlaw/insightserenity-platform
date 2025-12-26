'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Calendar,
  Clock,
  CheckCircle2,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Sparkles,
  Video
} from 'lucide-react'
import toast from 'react-hot-toast'
import consultationsApi, { ConsultationPackage } from '@/lib/api/consultations'
import consultantApi, { ConsultantProfile } from '@/lib/api/consultant'

export default function BookConsultationPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const packageId = searchParams.get('packageId')

  const [selectedPackage, setSelectedPackage] = useState<ConsultationPackage | null>(null)
  const [consultants, setConsultants] = useState<ConsultantProfile[]>([])
  const [selectedConsultant, setSelectedConsultant] = useState<string>('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [topic, setTopic] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [creditBalance, setCreditBalance] = useState<any>(null)

  useEffect(() => {
    loadBookingData()
  }, [packageId])

  const loadBookingData = async () => {
    try {
      setLoading(true)

      // Fetch package details, consultants, and credit balance in parallel
      const [packagesData, consultantsResponse, balanceData] = await Promise.all([
        packageId ? consultationsApi.getPackages() : Promise.resolve([]),
        consultantApi.getAllConsultants({ availabilityStatus: 'available', limit: 100 }),
        consultationsApi.getCreditBalance().catch(() => null)
      ])

      if (packageId) {
        const pkg = packagesData.find((p: ConsultationPackage) => p.packageId === packageId)
        if (pkg) {
          setSelectedPackage(pkg)
          setTopic(pkg.details.name)
        } else {
          toast.error('Package not found')
          router.push('/consultations/packages')
        }
      }

      // Handle different response formats from the API
      console.log('Consultants API Response:', consultantsResponse)
      let consultantsData: any[] = []
      if (Array.isArray(consultantsResponse)) {
        consultantsData = consultantsResponse
      } else if (consultantsResponse && typeof consultantsResponse === 'object') {
        // Check for common nested data patterns
        if ('data' in consultantsResponse && Array.isArray(consultantsResponse.data)) {
          consultantsData = consultantsResponse.data
        } else if ('consultants' in consultantsResponse && Array.isArray(consultantsResponse.consultants)) {
          consultantsData = consultantsResponse.consultants
        }
      }
      console.log('Extracted consultants data:', consultantsData)

      setConsultants(consultantsData)
      setCreditBalance(balanceData)
    } catch (error) {
      console.error('Failed to load booking data:', error)
      toast.error('Failed to load booking information')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedConsultant) {
      toast.error('Please select a consultant')
      return
    }

    if (!scheduledDate || !scheduledTime) {
      toast.error('Please select date and time')
      return
    }

    if (!topic.trim()) {
      toast.error('Please enter a topic')
      return
    }

    try {
      setSubmitting(true)

      // Combine date and time into ISO strings
      const startDateTime = new Date(`${scheduledDate}T${scheduledTime}:00`)

      // Calculate end time based on package duration
      const durationMinutes = selectedPackage?.credits.duration.minutes || 60
      const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60000)

      // Check if this is a free package (free trial)
      if (isFreePackage) {
        // Book directly for free consultations
        const bookingData = {
          packageId: selectedPackage?.packageId || '',
          consultantId: selectedConsultant,
          scheduledStart: startDateTime.toISOString(),
          scheduledEnd: endDateTime.toISOString(),
          topic: topic.trim(),
          description: description.trim() || undefined,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }

        await consultationsApi.bookConsultationWithPackage(bookingData)

        toast.success('Free consultation booked successfully!')
        router.push('/client/consultations')
      } else {
        // Redirect to checkout for paid consultations
        const checkoutParams = new URLSearchParams({
          packageId: selectedPackage?.packageId || '',
          consultantId: selectedConsultant,
          start: startDateTime.toISOString(),
          end: endDateTime.toISOString(),
          topic: topic.trim(),
          ...(description.trim() && { description: description.trim() })
        })

        router.push(`/client/consultations/checkout?${checkoutParams.toString()}`)
      }
    } catch (error: any) {
      console.error('Failed to process booking:', error)
      const errorMessage = error.response?.data?.error?.message || 'Failed to process booking'
      toast.error(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  const formatPrice = (amount: number) => {
    return (amount / 100).toFixed(2)
  }

  const isFreePackage = selectedPackage?.pricing.amount === 0

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading booking information...</p>
        </div>
      </div>
    )
  }

  if (!selectedPackage) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Package Not Found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              The consultation package you selected could not be found.
            </p>
            <Link href="/consultations/packages">
              <Button>View Available Packages</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/10">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <div className="mb-6">
          <Link href="/consultations/packages">
            <Button variant="ghost" size="sm" className="mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Packages
            </Button>
          </Link>
          <h1 className="text-3xl font-bold mb-2">Book Your Consultation</h1>
          <p className="text-muted-foreground">
            Schedule your consultation session with an expert
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Left Column - Booking Form */}
          <div className="md:col-span-2">
            <form onSubmit={handleSubmit}>
              <Card>
                <CardHeader>
                  <CardTitle>Consultation Details</CardTitle>
                  <CardDescription>
                    Fill in the details to schedule your consultation
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Package Info */}
                  <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          {isFreePackage && (
                            <Sparkles className="h-4 w-4 text-green-600" />
                          )}
                          <h3 className="font-semibold">{selectedPackage.details.name}</h3>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          {selectedPackage.details.description}
                        </p>
                        <div className="flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span>{selectedPackage.credits.duration.minutes} minutes</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Video className="h-4 w-4 text-muted-foreground" />
                            <span>Video call</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        {isFreePackage ? (
                          <Badge className="bg-green-600">Free Trial</Badge>
                        ) : (
                          <div className="text-2xl font-bold">
                            ${formatPrice(selectedPackage.pricing.amount)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Select Consultant */}
                  <div className="space-y-2">
                    <Label htmlFor="consultant">
                      Select Consultant <span className="text-destructive">*</span>
                    </Label>
                    <select
                      id="consultant"
                      value={selectedConsultant}
                      onChange={(e) => setSelectedConsultant(e.target.value)}
                      className="w-full px-3 py-2 border border-input rounded-md bg-background"
                      required
                    >
                      <option value="">Choose a consultant...</option>
                      {consultants.map((consultant) => (
                        <option key={consultant._id} value={consultant._id}>
                          {consultant.profile.firstName} {consultant.profile.lastName}
                        </option>
                      ))}
                    </select>
                    {consultants.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No consultants available at the moment
                      </p>
                    )}
                  </div>

                  {/* Date and Time */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="date">
                        Date <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="date"
                        type="date"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="time">
                        Time <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="time"
                        type="time"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {/* Topic */}
                  <div className="space-y-2">
                    <Label htmlFor="topic">
                      Consultation Topic <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="topic"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="e.g., Strategy planning, Technical review"
                      required
                    />
                  </div>

                  {/* Description */}
                  <div className="space-y-2">
                    <Label htmlFor="description">
                      Additional Details <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Provide any additional context or specific questions you'd like to discuss..."
                      rows={4}
                    />
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-4">
                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    disabled={submitting || consultants.length === 0}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Booking...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        {isFreePackage ? 'Book Free Trial' : 'Confirm Booking'}
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">
                    By booking, you agree to our terms of service and cancellation policy
                  </p>
                </CardFooter>
              </Card>
            </form>
          </div>

          {/* Right Column - Summary & Info */}
          <div className="space-y-4">
            {/* Credit Balance */}
            {creditBalance && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Your Credits</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-4">
                    <div className="text-3xl font-bold text-primary mb-2">
                      {creditBalance.availableCredits}
                    </div>
                    <p className="text-sm text-muted-foreground">Available Credits</p>
                  </div>
                  {creditBalance.freeTrial?.eligible && !creditBalance.freeTrial?.used && (
                    <div className="mt-4 p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                      <div className="flex items-start gap-2">
                        <Sparkles className="h-4 w-4 text-green-600 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-green-900 dark:text-green-100">
                            Free Trial Available
                          </p>
                          <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                            You're eligible for a free trial consultation!
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Package Features */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">What's Included</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {selectedPackage.details.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Important Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Important Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <Calendar className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <p>You can reschedule up to 24 hours before your session</p>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <p>Please join 5 minutes before your scheduled time</p>
                </div>
                <div className="flex items-start gap-2">
                  <Video className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <p>Meeting link will be sent to your email</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
