'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail, CheckCircle, AlertCircle, ArrowRight, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { auth } from '@/lib/api/client'

export default function VerifyEmailPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isVerifying, setIsVerifying] = useState(false)
  const [isVerified, setIsVerified] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [isResending, setIsResending] = useState(false)
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    // Get token and email from URL parameters
    const verificationToken = searchParams.get('token')
    const userEmail = searchParams.get('email')

    if (userEmail) {
      setEmail(decodeURIComponent(userEmail))
    }

    if (verificationToken) {
      setToken(verificationToken)
      // Auto-verify if token is present
      verifyEmail(verificationToken)
    } else {
      setError('No verification token found. Please check your email for the verification link.')
    }
  }, [searchParams])

  const verifyEmail = async (verificationToken: string) => {
    setIsVerifying(true)
    setError('')

    try {
      // Use real API call instead of simulation
      await auth.verifyEmail(verificationToken)

      setIsVerified(true)
      toast.success('Email verified successfully!')
    } catch (error: any) {
      console.error('Email verification failed:', error)

      // Handle specific error messages from backend
      if (error.response?.data?.message) {
        setError(error.response.data.message)
        toast.error(error.response.data.message)
      } else if (error.response?.status === 400) {
        setError('Invalid or expired verification token. Please request a new verification email.')
        toast.error('Verification link has expired')
      } else if (error.message) {
        setError(error.message)
        toast.error(error.message)
      } else {
        setError('Failed to verify email. Please try again.')
        toast.error('Email verification failed')
      }
    } finally {
      setIsVerifying(false)
    }
  }

  const handleResendVerification = async () => {
    if (!email) {
      toast.error('Email address not found. Please try registering again.')
      return
    }

    setIsResending(true)

    try {
      // In a real implementation, you would have a separate endpoint for resending verification
      // For now, we'll use the forgot password endpoint as a placeholder
      await auth.forgotPassword(email)
      toast.success('Verification email sent! Please check your inbox.')
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

  if (isVerified) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <CardTitle className="text-xl font-bold text-center">Email verified successfully!</CardTitle>
          <CardDescription className="text-xs text-center">
            Your email address has been verified. You can now access all features of your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-xs text-green-700">
              ✅ Your account is now fully activated and ready to use.
            </p>
          </div>

          <Link href="/dashboard">
            <Button fullWidth rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
              Continue to Dashboard
            </Button>
          </Link>

          <div className="text-center">
            <Link href="/login" className="text-xs text-primary hover:underline">
              Or sign in to your account
            </Link>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (isVerifying) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <RefreshCw className="h-6 w-6 text-blue-600 animate-spin" />
            </div>
          </div>
          <CardTitle className="text-xl font-bold text-center">Verifying your email...</CardTitle>
          <CardDescription className="text-xs text-center">
            Please wait while we verify your email address.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <div className="flex items-center justify-center mb-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
            error ? 'bg-red-100' : 'bg-blue-100'
          }`}>
            {error ? (
              <AlertCircle className="h-6 w-6 text-red-600" />
            ) : (
              <Mail className="h-6 w-6 text-blue-600" />
            )}
          </div>
        </div>
        <CardTitle className="text-xl font-bold text-center">
          {error ? 'Verification failed' : 'Verify your email'}
        </CardTitle>
        <CardDescription className="text-xs text-center">
          {error ? (
            'There was an issue verifying your email address.'
          ) : (
            'Click the verification link in your email to activate your account.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="flex items-center space-x-2 text-destructive bg-destructive/10 p-3 rounded-lg">
            <AlertCircle className="h-4 w-4" />
            <p className="text-xs">{error}</p>
          </div>
        )}

        {!error && email && (
          <div className="bg-muted p-3 rounded-lg">
            <p className="text-xs text-muted-foreground">
              We sent a verification email to{' '}
              <span className="font-medium text-foreground">{email}</span>
            </p>
          </div>
        )}

        <div className="space-y-3">
          {email && (
            <Button
              onClick={handleResendVerification}
              variant="outline"
              loading={isResending}
              disabled={isResending}
              fullWidth
              rightIcon={!isResending && <RefreshCw className="h-3.5 w-3.5" />}
            >
              {isResending ? 'Sending...' : 'Resend verification email'}
            </Button>
          )}

          <Link href="/register">
            <Button variant="ghost" fullWidth>
              Try with a different email
            </Button>
          </Link>

          <Link href="/login">
            <Button variant="ghost" fullWidth>
              Back to sign in
            </Button>
          </Link>
        </div>

        <div className="border-t pt-4">
          <div className="text-center space-y-2">
            <p className="text-2xs text-muted-foreground">
              Having trouble? Check your spam folder or{' '}
              <Link href="/contact" className="text-primary hover:underline">
                contact support
              </Link>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
