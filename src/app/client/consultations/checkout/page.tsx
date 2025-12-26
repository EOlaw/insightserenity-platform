'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  CreditCard,
  Lock,
  CheckCircle2,
  Clock,
  User,
  Calendar,
  Shield
} from 'lucide-react'
import toast from 'react-hot-toast'
import consultationsApi, { ConsultationPackage } from '@/lib/api/consultations'

export default function CheckoutPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const packageId = searchParams.get('packageId')
  const consultantId = searchParams.get('consultantId')
  const scheduledStart = searchParams.get('start')
  const scheduledEnd = searchParams.get('end')
  const topic = searchParams.get('topic')
  const description = searchParams.get('description')

  const [selectedPackage, setSelectedPackage] = useState<ConsultationPackage | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)

  // Card information
  const [cardNumber, setCardNumber] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvc, setCardCvc] = useState('')
  const [cardName, setCardName] = useState('')
  const [agreedToPolicy, setAgreedToPolicy] = useState(false)

  useEffect(() => {
    loadPackageData()
  }, [packageId])

  const loadPackageData = async () => {
    try {
      setLoading(true)
      if (!packageId) {
        throw new Error('Package ID is required')
      }

      const packages = await consultationsApi.getPackages()
      const pkg = packages.find((p: ConsultationPackage) => p.packageId === packageId)

      if (!pkg) {
        throw new Error('Package not found')
      }

      setSelectedPackage(pkg)
    } catch (error) {
      console.error('Failed to load package:', error)
      toast.error('Failed to load package information')
      router.push('/consultations/packages')
    } finally {
      setLoading(false)
    }
  }

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '')
    const matches = v.match(/\d{4,16}/g)
    const match = (matches && matches[0]) || ''
    const parts = []

    for (let i = 0; i < match.length; i += 4) {
      parts.push(match.substring(i, i + 4))
    }

    if (parts.length) {
      return parts.join(' ')
    } else {
      return value
    }
  }

  const formatExpiry = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '')
    if (v.length >= 2) {
      return v.slice(0, 2) + '/' + v.slice(2, 4)
    }
    return v
  }

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCardNumber(e.target.value)
    if (formatted.replace(/\s/g, '').length <= 16) {
      setCardNumber(formatted)
    }
  }

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatExpiry(e.target.value)
    if (formatted.replace(/\//g, '').length <= 4) {
      setCardExpiry(formatted)
    }
  }

  const handleCvcChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/gi, '')
    if (value.length <= 4) {
      setCardCvc(value)
    }
  }

  const validateCard = () => {
    const cardNumberClean = cardNumber.replace(/\s/g, '')
    const expiryParts = cardExpiry.split('/')

    if (cardNumberClean.length < 13 || cardNumberClean.length > 19) {
      toast.error('Please enter a valid card number')
      return false
    }

    if (!cardExpiry.includes('/') || expiryParts.length !== 2) {
      toast.error('Please enter a valid expiry date (MM/YY)')
      return false
    }

    const month = parseInt(expiryParts[0])
    const year = parseInt('20' + expiryParts[1])
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1

    if (month < 1 || month > 12) {
      toast.error('Invalid expiry month')
      return false
    }

    if (year < currentYear || (year === currentYear && month < currentMonth)) {
      toast.error('Card has expired')
      return false
    }

    if (cardCvc.length < 3 || cardCvc.length > 4) {
      toast.error('Please enter a valid CVC')
      return false
    }

    if (!cardName.trim()) {
      toast.error('Please enter the cardholder name')
      return false
    }

    if (!agreedToPolicy) {
      toast.error('Please agree to the refund policy')
      return false
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateCard()) {
      return
    }

    if (!selectedPackage || !consultantId || !scheduledStart || !scheduledEnd) {
      toast.error('Missing booking information')
      return
    }

    try {
      setProcessing(true)

      // Create payment intent
      const paymentIntent = await consultationsApi.createPaymentIntent({
        packageId: selectedPackage.packageId,
        amount: selectedPackage.pricing.amount,
        currency: 'USD',
        quantity: 1
      })

      // In a real implementation, you would use Stripe.js to create a payment method
      // and confirm the payment. For now, we'll simulate the process.

      // Book the consultation after successful payment
      const bookingData = {
        packageId: selectedPackage.packageId,
        consultantId: consultantId,
        scheduledStart: scheduledStart,
        scheduledEnd: scheduledEnd,
        topic: topic || selectedPackage.details.name,
        description: description || undefined,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }

      const result = await consultationsApi.bookConsultationWithPackage(bookingData)

      toast.success('Payment successful! Consultation booked.')
      router.push('/client/consultations')
    } catch (error: any) {
      console.error('Payment failed:', error)
      const errorMessage = error.response?.data?.error?.message || 'Payment failed. Please try again.'
      toast.error(errorMessage)
    } finally {
      setProcessing(false)
    }
  }

  const formatPrice = (amount: number) => {
    return (amount / 100).toFixed(2)
  }

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-[#ffc451] mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading checkout...</p>
        </div>
      </div>
    )
  }

  if (!selectedPackage) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-[#ffc451]/20">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-[#ffc451]/50 mx-auto mb-4" />
            <h3 className="text-sm font-semibold mb-2">Payment Information Missing</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Unable to load payment information. Please try booking again.
            </p>
            <Link href="/consultations/packages">
              <Button className="bg-[#ffc451] hover:bg-[#ffc451]/90 text-black">
                Back to Packages
              </Button>
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
          <Link href={`/client/consultations/book?packageId=${packageId}`}>
            <Button variant="ghost" size="sm" className="mb-4 hover:text-[#ffc451]">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Booking
            </Button>
          </Link>
          <h1 className="text-xl font-bold mb-1">Secure Checkout</h1>
          <p className="text-sm text-muted-foreground">
            Complete your payment to confirm your consultation
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Left Column - Payment Form */}
          <div className="md:col-span-2">
            <form onSubmit={handleSubmit}>
              <Card className="border-[#ffc451]/20">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Lock className="h-4 w-4 text-[#ffc451]" />
                    Payment Information
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Your payment information is securely encrypted
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Card Number */}
                  <div className="space-y-2">
                    <Label htmlFor="cardNumber" className="text-xs">
                      Card Number <span className="text-destructive">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="cardNumber"
                        value={cardNumber}
                        onChange={handleCardNumberChange}
                        placeholder="1234 5678 9012 3456"
                        className="pl-10 text-xs focus:border-[#ffc451] focus:ring-[#ffc451]"
                        required
                      />
                      <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>

                  {/* Cardholder Name */}
                  <div className="space-y-2">
                    <Label htmlFor="cardName" className="text-xs">
                      Cardholder Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="cardName"
                      value={cardName}
                      onChange={(e) => setCardName(e.target.value)}
                      placeholder="John Doe"
                      className="text-xs focus:border-[#ffc451] focus:ring-[#ffc451]"
                      required
                    />
                  </div>

                  {/* Expiry and CVC */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="cardExpiry" className="text-xs">
                        Expiry Date <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="cardExpiry"
                        value={cardExpiry}
                        onChange={handleExpiryChange}
                        placeholder="MM/YY"
                        className="text-xs focus:border-[#ffc451] focus:ring-[#ffc451]"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cardCvc" className="text-xs">
                        CVC <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="cardCvc"
                        value={cardCvc}
                        onChange={handleCvcChange}
                        placeholder="123"
                        className="text-xs focus:border-[#ffc451] focus:ring-[#ffc451]"
                        required
                      />
                    </div>
                  </div>

                  {/* Refund Policy Agreement */}
                  <div className="p-4 bg-[#ffc451]/5 rounded-lg border border-[#ffc451]/20">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="policy"
                        checked={agreedToPolicy}
                        onChange={(e) => setAgreedToPolicy(e.target.checked)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <Label htmlFor="policy" className="text-xs font-medium cursor-pointer">
                          I agree to the refund and cancellation policy
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Cancellations made 24+ hours before the consultation receive a full refund.
                          Cancellations within 24 hours receive a partial refund based on timing.
                          No refunds for no-shows.{' '}
                          <Link href="/client/billing/policy" className="text-[#ffc451] hover:underline">
                            View full policy
                          </Link>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Security Notice */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Shield className="h-4 w-4 text-[#ffc451]" />
                    <span>Secured by 256-bit SSL encryption</span>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    type="submit"
                    className="w-full bg-[#ffc451] hover:bg-[#ffc451]/90 text-black"
                    size="lg"
                    disabled={processing}
                  >
                    {processing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing Payment...
                      </>
                    ) : (
                      <>
                        <Lock className="mr-2 h-4 w-4" />
                        Pay ${formatPrice(selectedPackage.pricing.amount)}
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </form>
          </div>

          {/* Right Column - Order Summary */}
          <div>
            <Card className="border-[#ffc451]/20">
              <CardHeader>
                <CardTitle className="text-xs">Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Package Info */}
                <div>
                  <h3 className="text-sm font-semibold mb-1">{selectedPackage.details.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {selectedPackage.credits.total} {selectedPackage.credits.total === 1 ? 'credit' : 'credits'}
                  </p>
                </div>

                {/* Consultation Details */}
                {scheduledStart && (
                  <div className="space-y-2 text-xs">
                    <div className="flex items-start gap-2">
                      <Calendar className="h-3 w-3 text-[#ffc451] mt-0.5" />
                      <div>
                        <p className="font-medium">Date & Time</p>
                        <p className="text-muted-foreground">{formatDateTime(scheduledStart)}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Clock className="h-3 w-3 text-[#ffc451] mt-0.5" />
                      <div>
                        <p className="font-medium">Duration</p>
                        <p className="text-muted-foreground">
                          {selectedPackage.credits.duration.minutes} minutes
                        </p>
                      </div>
                    </div>
                    {topic && (
                      <div className="flex items-start gap-2">
                        <User className="h-3 w-3 text-[#ffc451] mt-0.5" />
                        <div>
                          <p className="font-medium">Topic</p>
                          <p className="text-muted-foreground">{topic}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-4 border-t border-[#ffc451]/20">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>${formatPrice(selectedPackage.pricing.amount)}</span>
                  </div>
                  <div className="flex justify-between text-xs mb-3">
                    <span className="text-muted-foreground">Tax</span>
                    <span>$0.00</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold pt-3 border-t border-[#ffc451]/20">
                    <span>Total</span>
                    <span className="text-[#ffc451]">${formatPrice(selectedPackage.pricing.amount)}</span>
                  </div>
                </div>

                {/* Benefits */}
                <div className="pt-4 border-t border-[#ffc451]/20 space-y-2">
                  <p className="text-xs font-medium">What's included:</p>
                  <div className="space-y-1.5">
                    <div className="flex items-start gap-2 text-xs">
                      <CheckCircle2 className="h-3 w-3 text-[#ffc451] mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">Video consultation</span>
                    </div>
                    <div className="flex items-start gap-2 text-xs">
                      <CheckCircle2 className="h-3 w-3 text-[#ffc451] mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">Session recording available</span>
                    </div>
                    <div className="flex items-start gap-2 text-xs">
                      <CheckCircle2 className="h-3 w-3 text-[#ffc451] mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">Follow-up notes and action items</span>
                    </div>
                    <div className="flex items-start gap-2 text-xs">
                      <CheckCircle2 className="h-3 w-3 text-[#ffc451] mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">Full refund if cancelled 24+ hours before</span>
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
