'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ArrowLeft,
  Shield,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Info
} from 'lucide-react'

export default function BillingPolicyPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/10">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="mb-4 hover:text-[#ffc451]"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <h1 className="text-xl font-bold mb-1">Refund & Cancellation Policy</h1>
          <p className="text-sm text-muted-foreground">
            Effective Date: December 26, 2025
          </p>
        </div>

        <div className="space-y-6">
          {/* Overview */}
          <Card className="border-[#ffc451]/20">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="h-4 w-4 text-[#ffc451]" />
                Policy Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-3 text-muted-foreground">
              <p>
                We understand that plans change. Our refund policy is designed to be fair to both clients
                and consultants while maintaining the quality of our service. Please read this policy
                carefully before booking a consultation.
              </p>
            </CardContent>
          </Card>

          {/* Refund Schedule */}
          <Card className="border-[#ffc451]/20">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#ffc451]" />
                Cancellation Refund Schedule
              </CardTitle>
              <CardDescription className="text-xs">
                Refund amounts are calculated based on when you cancel relative to your scheduled consultation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 24+ Hours */}
              <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-1">
                      24+ Hours Before: 100% Refund
                    </h3>
                    <p className="text-xs text-green-700 dark:text-green-300">
                      Cancel 24 hours or more before your scheduled consultation to receive a full refund.
                      No questions asked.
                    </p>
                  </div>
                </div>
              </div>

              {/* 12-24 Hours */}
              <div className="p-4 bg-[#ffc451]/10 rounded-lg border border-[#ffc451]/30">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-[#ffc451] mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="text-sm font-semibold mb-1">
                      12-24 Hours Before: 75% Refund
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Cancellations made between 12 and 24 hours before the consultation will receive a 75% refund.
                      A 25% administrative fee applies to cover consultant preparation time.
                    </p>
                  </div>
                </div>
              </div>

              {/* 6-12 Hours */}
              <div className="p-4 bg-orange-50 dark:bg-orange-950 rounded-lg border border-orange-200 dark:border-orange-800">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="text-sm font-semibold text-orange-900 dark:text-orange-100 mb-1">
                      6-12 Hours Before: 50% Refund
                    </h3>
                    <p className="text-xs text-orange-700 dark:text-orange-300">
                      Cancellations made between 6 and 12 hours before the consultation will receive a 50% refund.
                      The consultant has already dedicated significant preparation time.
                    </p>
                  </div>
                </div>
              </div>

              {/* 3-6 Hours */}
              <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-800">
                <div className="flex items-start gap-3">
                  <XCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="text-sm font-semibold text-red-900 dark:text-red-100 mb-1">
                      3-6 Hours Before: 25% Refund
                    </h3>
                    <p className="text-xs text-red-700 dark:text-red-300">
                      Cancellations made between 3 and 6 hours before the consultation will receive a 25% refund.
                      At this point, it's very difficult for consultants to adjust their schedule.
                    </p>
                  </div>
                </div>
              </div>

              {/* Less than 3 Hours / No Show */}
              <div className="p-4 bg-gray-100 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-700">
                <div className="flex items-start gap-3">
                  <XCircle className="h-5 w-5 text-gray-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
                      Less than 3 Hours or No Show: No Refund
                    </h3>
                    <p className="text-xs text-gray-700 dark:text-gray-300">
                      Cancellations made less than 3 hours before the consultation or failure to attend (no-show)
                      are not eligible for a refund. The full consultation fee will be charged.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Emergency Situations */}
          <Card className="border-[#ffc451]/20">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Info className="h-4 w-4 text-[#ffc451]" />
                Emergency Situations
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-3 text-muted-foreground">
              <p>
                We understand that genuine emergencies happen. In cases of medical emergencies, family emergencies,
                or other extraordinary circumstances beyond your control, please contact our support team within
                24 hours of the scheduled consultation.
              </p>
              <p>
                We will review your situation on a case-by-case basis and may offer a full refund or reschedule
                at no additional cost. Documentation may be required for emergency refund requests.
              </p>
            </CardContent>
          </Card>

          {/* Rescheduling */}
          <Card className="border-[#ffc451]/20">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#ffc451]" />
                Rescheduling Policy
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-3 text-muted-foreground">
              <p>
                <strong>Free Rescheduling:</strong> You may reschedule your consultation once for free if done at
                least 24 hours before the scheduled time. The new appointment must be within 30 days of the
                original booking.
              </p>
              <p>
                <strong>Late Rescheduling:</strong> Rescheduling requests made less than 24 hours before the
                consultation are subject to the same refund schedule as cancellations. You'll receive a credit
                according to the refund schedule and can use it to book a new consultation.
              </p>
            </CardContent>
          </Card>

          {/* Consultant Cancellations */}
          <Card className="border-[#ffc451]/20">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="h-4 w-4 text-[#ffc451]" />
                Consultant-Initiated Cancellations
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-3 text-muted-foreground">
              <p>
                If a consultant needs to cancel your consultation for any reason, you will receive:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>A full 100% refund of your payment</li>
                <li>An additional 10% credit bonus to use on future consultations</li>
                <li>Priority booking for rescheduling with the same or another consultant</li>
              </ul>
            </CardContent>
          </Card>

          {/* Technical Issues */}
          <Card className="border-[#ffc451]/20">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-[#ffc451]" />
                Technical Issues
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-3 text-muted-foreground">
              <p>
                If you experience technical difficulties that prevent you from attending your consultation
                (such as platform issues, video connection problems, etc.):
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>Contact support immediately during your scheduled time</li>
                <li>We'll work to resolve the issue or reschedule at no charge</li>
                <li>If the issue is on our end, you'll receive a full refund plus credit compensation</li>
              </ul>
            </CardContent>
          </Card>

          {/* Refund Processing */}
          <Card className="border-[#ffc451]/20">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#ffc451]" />
                Refund Processing
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-3 text-muted-foreground">
              <p>
                <strong>Processing Time:</strong> Refunds are processed within 3-5 business days of cancellation.
                The refund will be credited to your original payment method.
              </p>
              <p>
                <strong>Bank Processing:</strong> Depending on your bank or card issuer, it may take an additional
                5-10 business days for the refund to appear in your account.
              </p>
              <p>
                <strong>Credits:</strong> If you choose to receive your refund as platform credits instead of a
                payment refund, the credits will be applied to your account immediately.
              </p>
            </CardContent>
          </Card>

          {/* Contact Information */}
          <Card className="border-[#ffc451]/20">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Info className="h-4 w-4 text-[#ffc451]" />
                Questions or Concerns?
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-3 text-muted-foreground">
              <p>
                If you have any questions about our refund policy or need assistance with a cancellation,
                please contact our support team:
              </p>
              <div className="space-y-2">
                <p>
                  <strong>Email:</strong> support@insightserenity.com
                </p>
                <p>
                  <strong>Support Hours:</strong> Monday - Friday, 9:00 AM - 6:00 PM EST
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Back Button */}
          <div className="flex justify-center pt-4">
            <Link href="/client/billing">
              <Button className="bg-[#ffc451] hover:bg-[#ffc451]/90 text-black">
                View Billing History
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
