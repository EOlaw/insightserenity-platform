'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail, CheckCircle, Clock, RefreshCw, ExternalLink, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { auth } from '@/lib/api/client'

export default function AwaitingVerificationPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [isResending, setIsResending] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [pollCount, setPollCount] = useState(0)
  const [isPolling, setIsPolling] = useState(true)
  const [verificationDetected, setVerificationDetected] = useState(false)

  useEffect(() => {
    const userEmail = searchParams.get('email')
    if (userEmail) {
      setEmail(decodeURIComponent(userEmail))
    } else {
      router.push('/register')
    }
  }, [searchParams, router])

  const checkVerificationStatus = useCallback(async () => {
    if (!email || !isPolling || verificationDetected) return

    try {
      const response = await auth.checkEmailVerificationStatus(email)
      
      if (response.verified || response.data?.verified) {
        setIsPolling(false)
        setVerificationDetected(true)
        toast.success('Email verified! Redirecting to login...')
        
        setTimeout(() => {
          router.push('/login?verified=true')
        }, 2000)
      }
    } catch (error) {
      console.log('Still waiting for verification...')
    }

    setPollCount(prev => prev + 1)
  }, [email, isPolling, verificationDetected, router])

  useEffect(() => {
    if (!email) return

    checkVerificationStatus()

    const intervalId = setInterval(() => {
      if (pollCount < 60) {
        checkVerificationStatus()
      } else {
        setIsPolling(false)
        clearInterval(intervalId)
      }
    }, 5000)

    return () => clearInterval(intervalId)
  }, [email, pollCount, checkVerificationStatus])

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown(prev => prev - 1)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [resendCooldown])

  const handleResendVerification = async () => {
    if (!email || resendCooldown > 0) return

    setIsResending(true)

    try {
      await auth.resendVerificationEmail(email)
      toast.success('Verification email sent! Please check your inbox.')
      setResendCooldown(60)
    } catch (error: any) {
      console.error('Resend verification failed:', error)

      if (error.response?.data?.message) {
        toast.error(error.response.data.message)
      } else {
        toast.error('Failed to resend verification email. Please try again.')
      }
    } finally {
      setIsResending(false)
    }
  }

  const handleOpenEmailClient = () => {
    window.location.href = 'mailto:'
  }

  if (verificationDetected) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-center">
            Email verified!
          </CardTitle>
          <CardDescription className="text-sm text-center">
            Your account has been successfully activated
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg p-4 text-center">
            <p className="text-sm text-green-900 dark:text-green-100">
              Redirecting you to the login page...
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <div className="flex items-center justify-center mb-4">
          <div className="relative">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900 dark:to-blue-800 rounded-full flex items-center justify-center">
              <Mail className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            {isPolling && (
              <div className="absolute -top-1 -right-1">
                <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                  <Clock className="h-3 w-3 text-white animate-pulse" />
                </div>
              </div>
            )}
          </div>
        </div>
        <CardTitle className="text-2xl font-bold text-center">
          Check your email
        </CardTitle>
        <CardDescription className="text-sm text-center">
          We sent a verification link to complete your registration
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="bg-muted/50 p-4 rounded-lg border border-border">
          <div className="flex items-start gap-3">
            <Mail className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Verification email sent to
              </p>
              <p className="text-sm font-medium text-foreground break-all">
                {email}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-bold text-primary">1</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Open your email inbox and look for a message from InsightSerenity
            </p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-bold text-primary">2</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Click the verification link in the email to activate your account
            </p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-bold text-primary">3</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Come back to this page or sign in after verification
            </p>
          </div>
        </div>

        {isPolling && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg py-3">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Waiting for email verification...</span>
          </div>
        )}

        {!isPolling && pollCount >= 60 && (
          <div className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-100 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-3">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium mb-1">Still waiting for verification</p>
              <p className="text-xs">
                If you haven't received the email, try checking your spam folder or resending the verification email.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <Button
            onClick={handleOpenEmailClient}
            variant="default"
            fullWidth
            rightIcon={<ExternalLink className="h-4 w-4" />}
          >
            Open email app
          </Button>

          <Button
            onClick={handleResendVerification}
            variant="outline"
            fullWidth
            loading={isResending}
            disabled={isResending || resendCooldown > 0}
            rightIcon={!isResending && resendCooldown === 0 && <RefreshCw className="h-4 w-4" />}
          >
            {isResending 
              ? 'Sending...' 
              : resendCooldown > 0 
                ? `Resend in ${resendCooldown}s` 
                : 'Resend verification email'}
          </Button>

          <Link href="/login">
            <Button variant="ghost" fullWidth>
              I've already verified - Sign in
            </Button>
          </Link>
        </div>

        <div className="border-t pt-4 space-y-3">
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-3">
            <p className="text-xs text-blue-900 dark:text-blue-100 font-medium mb-2">
              💡 Helpful tips
            </p>
            <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
              <li>Check your spam or junk folder if you don't see the email</li>
              <li>The verification link expires in 24 hours</li>
              <li>You can request a new link if it expires</li>
            </ul>
          </div>

          <div className="text-center space-y-2">
            <p className="text-xs text-muted-foreground">
              Wrong email address?{' '}
              <Link href="/register" className="text-primary hover:underline font-medium">
                Register again
              </Link>
            </p>
            <p className="text-xs text-muted-foreground">
              Need help?{' '}
              <Link href="/contact" className="text-primary hover:underline font-medium">
                Contact support
              </Link>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}