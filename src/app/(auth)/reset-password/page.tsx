'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Lock, ArrowLeft, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { auth } from '@/lib/api/client'

export default function ResetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: '',
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState('')
  const [passwordStrength, setPasswordStrength] = useState(0)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    // Get token from URL parameters
    const resetToken = searchParams.get('token')
    if (!resetToken) {
      setError('Invalid or missing reset token. Please request a new password reset link.')
      toast.error('Invalid reset link')
    } else {
      setToken(resetToken)
    }
  }, [searchParams])

  const checkPasswordStrength = (password: string) => {
    let strength = 0
    if (password.length >= 8) strength++
    if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength++
    if (password.match(/[0-9]/)) strength++
    if (password.match(/[^a-zA-Z0-9]/)) strength++
    setPasswordStrength(strength)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))

    if (name === 'password') {
      checkPasswordStrength(value)
    }
  }

  const validateForm = () => {
    if (!token) {
      setError('Invalid reset token')
      return false
    }

    if (!formData.password) {
      setError('Password is required')
      return false
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long')
      return false
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return false
    }

    if (passwordStrength < 2) {
      setError('Please choose a stronger password')
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
      await auth.resetPassword(token!, formData.password)

      setIsSuccess(true)
      toast.success('Password reset successfully!')
    } catch (error: any) {
      console.error('Reset password failed:', error)

      // Handle specific error messages from backend
      if (error.response?.data?.message) {
        setError(error.response.data.message)
        toast.error(error.response.data.message)
      } else if (error.response?.status === 400) {
        setError('Invalid or expired reset token. Please request a new password reset link.')
        toast.error('Reset link has expired')
      } else if (error.message) {
        setError(error.message)
        toast.error(error.message)
      } else {
        setError('Failed to reset password. Please try again.')
        toast.error('Failed to reset password. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const getPasswordStrengthColor = () => {
    if (passwordStrength === 0) return ''
    if (passwordStrength === 1) return 'bg-red-500'
    if (passwordStrength === 2) return 'bg-orange-500'
    if (passwordStrength === 3) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const getPasswordStrengthText = () => {
    if (passwordStrength === 0) return ''
    if (passwordStrength === 1) return 'Weak'
    if (passwordStrength === 2) return 'Fair'
    if (passwordStrength === 3) return 'Good'
    return 'Strong'
  }

  if (isSuccess) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <CardTitle className="text-xl font-bold text-center">Password reset successful</CardTitle>
          <CardDescription className="text-xs text-center">
            Your password has been updated successfully. You can now sign in with your new password.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Link href="/login">
            <Button fullWidth>
              Continue to sign in
            </Button>
          </Link>

          <div className="text-center">
            <p className="text-2xs text-muted-foreground">
              Need help?{' '}
              <Link href="/contact" className="text-primary hover:underline">
                Contact support
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
        <CardTitle className="text-xl font-bold">Set new password</CardTitle>
        <CardDescription className="text-xs">
          Enter your new password below. Make sure it's strong and secure.
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
          <div className="space-y-2">
            <Input
              type={showPassword ? 'text' : 'password'}
              name="password"
              label="New Password"
              placeholder="Create a strong password"
              value={formData.password}
              onChange={handleChange}
              leftIcon={<Lock className="h-3.5 w-3.5" />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              }
              required
              disabled={isLoading || !token}
              autoComplete="new-password"
              fullWidth
            />
            {formData.password && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-2xs text-muted-foreground">Password strength:</span>
                  <span className="text-2xs font-medium">{getPasswordStrengthText()}</span>
                </div>
                <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${getPasswordStrengthColor()}`}
                    style={{ width: `${passwordStrength * 25}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <Input
            type={showConfirmPassword ? 'text' : 'password'}
            name="confirmPassword"
            label="Confirm New Password"
            placeholder="Re-enter your new password"
            value={formData.confirmPassword}
            onChange={handleChange}
            leftIcon={<Lock className="h-3.5 w-3.5" />}
            rightIcon={
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </button>
            }
            required
            disabled={isLoading || !token}
            autoComplete="new-password"
            fullWidth
          />

          <div className="bg-muted p-3 rounded-lg">
            <p className="text-xs font-medium mb-2">Password requirements:</p>
            <ul className="text-2xs text-muted-foreground space-y-1">
              <li className={`flex items-center ${formData.password.length >= 8 ? 'text-green-600' : ''}`}>
                <CheckCircle className={`h-3 w-3 mr-2 ${formData.password.length >= 8 ? 'text-green-600' : 'text-gray-300'}`} />
                At least 8 characters
              </li>
              <li className={`flex items-center ${formData.password.match(/[a-z]/) && formData.password.match(/[A-Z]/) ? 'text-green-600' : ''}`}>
                <CheckCircle className={`h-3 w-3 mr-2 ${formData.password.match(/[a-z]/) && formData.password.match(/[A-Z]/) ? 'text-green-600' : 'text-gray-300'}`} />
                Uppercase and lowercase letters
              </li>
              <li className={`flex items-center ${formData.password.match(/[0-9]/) ? 'text-green-600' : ''}`}>
                <CheckCircle className={`h-3 w-3 mr-2 ${formData.password.match(/[0-9]/) ? 'text-green-600' : 'text-gray-300'}`} />
                At least one number
              </li>
              <li className={`flex items-center ${formData.password.match(/[^a-zA-Z0-9]/) ? 'text-green-600' : ''}`}>
                <CheckCircle className={`h-3 w-3 mr-2 ${formData.password.match(/[^a-zA-Z0-9]/) ? 'text-green-600' : 'text-gray-300'}`} />
                At least one special character
              </li>
            </ul>
          </div>

          <Button
            type="submit"
            fullWidth
            loading={isLoading}
            disabled={!token}
          >
            Update Password
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
            Need help?{' '}
            <Link href="/contact" className="text-primary hover:underline">
              Contact support
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
