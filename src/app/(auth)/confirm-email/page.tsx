'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail, RefreshCw, CheckCircle, Inbox, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ConfirmEmailPage() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email') || 'your email'
  const [isResending, setIsResending] = useState(false)
  const [resendCount, setResendCount] = useState(0)
  const [lastResendTime, setLastResendTime] = useState<Date | null>(null)

  const handleResendEmail = async () => {
    if (resendCount >= 3) {
      toast.error('Too many attempts. Please try again later.')
      return
    }

    setIsResending(true)

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000))

      setResendCount(prev => prev + 1)
      setLastResendTime(new Date())
      toast.success('Verification email resent!')
    } catch (err) {
      toast.error('Failed to resend email. Please try again.')
    } finally {
      setIsResending(false)
    }
  }

  const openEmailClient = () => {
    // Common email providers
    const emailProviders = [
      { name: 'Gmail', url: 'https://mail.google.com' },
      { name: 'Outlook', url: 'https://outlook.live.com' },
      { name: 'Yahoo', url: 'https://mail.yahoo.com' },
      { name: 'Apple Mail', url: 'https://www.icloud.com/mail' },
    ]

    // Try to detect email provider from email domain
    const domain = email.split('@')[1]
    let url = 'https://mail.google.com' // Default to Gmail

    if (domain) {
      if (domain.includes('outlook') || domain.includes('hotmail') || domain.includes('live')) {
        url = 'https://outlook.live.com'
      } else if (domain.includes('yahoo')) {
        url = 'https://mail.yahoo.com'
      } else if (domain.includes('icloud') || domain.includes('me.com')) {
        url = 'https://www.icloud.com/mail'
      }
    }

    window.open(url, '_blank')
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <Mail className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-xl font-bold">Check your email</CardTitle>
        <CardDescription className="text-xs mt-2">
          We've sent a verification link to <span className="font-medium">{email}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-muted p-4 rounded-lg space-y-3">
          <div className="flex items-start space-x-2">
            <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-medium">Next steps:</p>
              <ol className="text-2xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Open your email inbox</li>
                <li>Find the email from Enterprise Platform</li>
                <li>Click the verification link</li>
                <li>You'll be redirected to complete setup</li>
              </ol>
            </div>
          </div>
        </div>

        <Button
          fullWidth
          onClick={openEmailClient}
          variant="outline"
        >
          <Inbox className="mr-2 h-3.5 w-3.5" />
          Open Email Inbox
          <ExternalLink className="ml-2 h-3 w-3" />
        </Button>

        <div className="space-y-2">
          <p className="text-xs text-center text-muted-foreground">
            Didn't receive the email?
          </p>

          <Button
            fullWidth
            variant="ghost"
            onClick={handleResendEmail}
            loading={isResending}
            disabled={isResending}
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Resend verification email
          </Button>

          {resendCount > 0 && (
            <p className="text-2xs text-center text-muted-foreground">
              Email resent {resendCount} {resendCount === 1 ? 'time' : 'times'}
              {resendCount >= 3 && ' (Maximum attempts reached)'}
            </p>
          )}
        </div>

        <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
          <p className="text-2xs text-amber-800">
            <strong>Tip:</strong> Check your spam or junk folder if you don't see the email in your inbox.
          </p>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col space-y-2">
        <Link href="/login" className="w-full">
          <Button variant="ghost" size="sm" fullWidth>
            Back to login
          </Button>
        </Link>
        <p className="text-xs text-center w-full text-muted-foreground">
          Wrong email?{' '}
          <Link href="/register" className="text-primary hover:underline font-medium">
            Sign up again
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
