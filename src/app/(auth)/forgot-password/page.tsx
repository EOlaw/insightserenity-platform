'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail, ArrowLeft, Send, AlertCircle, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { auth } from '@/lib/api/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState('')

  const validateForm = () => {
    if (!email) {
      setError('Email is required')
      return false
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email address')
      return false
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!validateForm()) return

    setIsLoading(true)

    try {
      // Use real API call instead of simulation
      await auth.forgotPassword(email)

      setIsSubmitted(true)
      toast.success('Password reset instructions sent!')
    } catch (error: any) {
      console.error('Forgot password failed:', error)

      // Handle specific error messages from backend
      if (error.response?.data?.message) {
        setError(error.response.data.message)
        toast.error(error.response.data.message)
      } else if (error.message) {
        setError(error.message)
        toast.error(error.message)
      } else {
        setError('Failed to send password reset email. Please try again.')
        toast.error('Failed to send password reset email. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    setIsLoading(true)
    setError('')

    try {
      await auth.forgotPassword(email)
      toast.success('Password reset instructions sent again!')
    } catch (error: any) {
      console.error('Resend failed:', error)

      if (error.response?.data?.message) {
        toast.error(error.response.data.message)
      } else {
        toast.error('Failed to resend email. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  if (isSubmitted) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <CardTitle className="text-xl font-bold text-center">Check your email</CardTitle>
          <CardDescription className="text-xs text-center">
            We've sent password reset instructions to{' '}
            <span className="font-medium text-foreground">{email}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center space-y-4">
            <p className="text-xs text-muted-foreground">
              Didn't receive the email? Check your spam folder or click below to resend.
            </p>

            <div className="space-y-2">
              <Button
                onClick={handleResend}
                variant="outline"
                disabled={isLoading}
                loading={isLoading}
                fullWidth
                rightIcon={!isLoading && <Send className="h-3.5 w-3.5" />}
              >
                Resend email
              </Button>

              <Link href="/login">
                <Button variant="ghost" size="sm" fullWidth>
                  <ArrowLeft className="mr-2 h-3.5 w-3.5" />
                  Back to sign in
                </Button>
              </Link>
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-2xs text-center text-muted-foreground">
              If you continue to have problems, please{' '}
              <Link href="/contact" className="text-primary hover:underline">
                contact our support team
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl font-bold">Reset your password</CardTitle>
        <CardDescription className="text-xs">
          Enter your email address and we'll send you instructions to reset your password
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="flex items-center space-x-2 text-destructive bg-destructive/10 p-3 rounded-lg">
            <AlertCircle className="h-4 w-4" />
            <p className="text-xs">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="email"
            label="Email Address"
            placeholder="john@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon={<Mail className="h-3.5 w-3.5" />}
            required
            disabled={isLoading}
            autoComplete="email"
            fullWidth
          />

          <Button
            type="submit"
            fullWidth
            loading={isLoading}
            rightIcon={!isLoading && <Send className="h-3.5 w-3.5" />}
          >
            Send reset instructions
          </Button>
        </form>

        <div className="border-t pt-4">
          <Link href="/login">
            <Button variant="ghost" size="sm" fullWidth>
              <ArrowLeft className="mr-2 h-3.5 w-3.5" />
              Back to sign in
            </Button>
          </Link>
        </div>

        <div className="text-center">
          <p className="text-2xs text-muted-foreground">
            Remember your password?{' '}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
