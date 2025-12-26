'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  Mail,
  Lock,
  User,
  Phone,
  ArrowRight,
  AlertCircle,
  Briefcase,
  GraduationCap,
  Award,
  Building2
} from 'lucide-react'
import toast from 'react-hot-toast'
import { auth } from '@/lib/api/client'

export default function ConsultantRegisterPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    title: '',
    specializations: '',
    bio: '',
    yearsOfExperience: '',
    acceptTerms: false,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [passwordStrength, setPasswordStrength] = useState(0)

  const checkPasswordStrength = (password: string) => {
    let strength = 0
    if (password.length >= 8) strength++
    if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength++
    if (password.match(/[0-9]/)) strength++
    if (password.match(/[@$!%*?&]/)) strength++
    setPasswordStrength(strength)
  }

  const validatePasswordComplexity = (password: string): string[] => {
    const errors: string[] = []

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters')
    }
    if (!/(?=.*[a-z])/.test(password)) {
      errors.push('Password must contain at least one lowercase letter')
    }
    if (!/(?=.*[A-Z])/.test(password)) {
      errors.push('Password must contain at least one uppercase letter')
    }
    if (!/(?=.*\d)/.test(password)) {
      errors.push('Password must contain at least one number')
    }
    if (!/(?=.*[@$!%*?&])/.test(password)) {
      errors.push('Password must contain at least one special character (@$!%*?&)')
    }

    return errors
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))

    if (name === 'password') {
      checkPasswordStrength(value)
      const passwordErrors = validatePasswordComplexity(value)
      setValidationErrors(passwordErrors)
    }
  }

  const validateForm = () => {
    setError('')
    setValidationErrors([])

    if (!formData.firstName.trim()) {
      setError('First name is required')
      return false
    }

    if (!formData.lastName.trim()) {
      setError('Last name is required')
      return false
    }

    if (!formData.email) {
      setError('Email is required')
      return false
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      setError('Please enter a valid email address')
      return false
    }

    if (!formData.password) {
      setError('Password is required')
      return false
    }

    const passwordErrors = validatePasswordComplexity(formData.password)
    if (passwordErrors.length > 0) {
      setValidationErrors(passwordErrors)
      setError('Password does not meet complexity requirements')
      return false
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return false
    }

    if (!formData.acceptTerms) {
      setError('Please accept the terms and conditions')
      return false
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setIsLoading(true)
    setError('')
    setValidationErrors([])

    try {
      const registrationData = {
        email: formData.email.toLowerCase().trim(),
        password: formData.password,
        profile: {
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          bio: formData.bio.trim() || undefined,
        },
        phoneNumber: formData.phone.trim() || undefined,
        userType: 'consultant',
        professional: {
          title: formData.title.trim() || undefined,
          specializations: formData.specializations.trim()
            ? formData.specializations.split(',').map(s => s.trim()).filter(Boolean)
            : undefined,
          yearsOfExperience: formData.yearsOfExperience ? parseInt(formData.yearsOfExperience) : undefined,
        }
      }

      console.log('Sending consultant registration data:', registrationData)

      const response = await auth.register(registrationData)

      console.log('Registration response:', response)

      if (response.data?.tokens?.accessToken) {
        toast.success('Registration successful! Welcome to InsightSerenity.')
        setTimeout(() => {
          router.push('/consultant/dashboard')
        }, 1500)
      } else if (response.data?.requiresAction?.includes('VERIFY_EMAIL') || response.verificationEmailSent) {
        toast.success('Registration successful! Please check your email to verify your account.')
        setTimeout(() => {
          router.push('/awaiting-verification?email=' + encodeURIComponent(formData.email))
        }, 1500)
      } else {
        toast.success('Registration successful! Please log in to continue.')
        setTimeout(() => {
          router.push('/login')
        }, 1500)
      }
    } catch (error: any) {
      console.error('Registration error:', error)

      const errorResponse = error.response?.data

      if (errorResponse?.error?.details && Array.isArray(errorResponse.error.details)) {
        setValidationErrors(errorResponse.error.details)
        setError('Please correct the following errors:')
      } else if (errorResponse?.error?.message) {
        setError(errorResponse.error.message)
      } else if (errorResponse?.message) {
        setError(errorResponse.message)
      } else if (error.message) {
        setError(error.message)
      } else {
        setError('Registration failed. Please try again.')
      }

      toast.error(error.response?.data?.error?.message || error.message || 'Registration failed')
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-background to-secondary/10">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Briefcase className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold">Join as a Consultant</CardTitle>
              <CardDescription className="text-sm">
                Share your expertise and help clients succeed
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex flex-col space-y-2 text-destructive bg-destructive/10 p-3 rounded-lg">
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-4 w-4" />
                <p className="text-sm font-medium">{error}</p>
              </div>
              {validationErrors.length > 0 && (
                <ul className="text-sm space-y-1 ml-6 list-disc">
                  {validationErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Personal Information */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <User className="h-4 w-4" />
                Personal Information
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="text"
                  name="firstName"
                  label="First Name"
                  placeholder="John"
                  value={formData.firstName}
                  onChange={handleChange}
                  leftIcon={<User className="h-3.5 w-3.5" />}
                  required
                  disabled={isLoading}
                />
                <Input
                  type="text"
                  name="lastName"
                  label="Last Name"
                  placeholder="Doe"
                  value={formData.lastName}
                  onChange={handleChange}
                  required
                  disabled={isLoading}
                />
              </div>

              <Input
                type="email"
                name="email"
                label="Professional Email"
                placeholder="john@example.com"
                value={formData.email}
                onChange={handleChange}
                leftIcon={<Mail className="h-3.5 w-3.5" />}
                required
                disabled={isLoading}
                fullWidth
              />

              <Input
                type="tel"
                name="phone"
                label="Phone Number"
                placeholder="+1 (555) 000-0000"
                value={formData.phone}
                onChange={handleChange}
                leftIcon={<Phone className="h-3.5 w-3.5" />}
                disabled={isLoading}
                fullWidth
              />
            </div>

            {/* Professional Information */}
            <div className="space-y-3 pt-4 border-t">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Professional Information
              </h3>

              <Input
                type="text"
                name="title"
                label="Professional Title"
                placeholder="e.g., Senior Business Consultant"
                value={formData.title}
                onChange={handleChange}
                leftIcon={<Award className="h-3.5 w-3.5" />}
                disabled={isLoading}
                fullWidth
              />

              <div className="space-y-2">
                <label className="text-sm font-medium">Specializations</label>
                <Input
                  type="text"
                  name="specializations"
                  placeholder="e.g., Strategy, Marketing, Finance (comma-separated)"
                  value={formData.specializations}
                  onChange={handleChange}
                  leftIcon={<GraduationCap className="h-3.5 w-3.5" />}
                  disabled={isLoading}
                  fullWidth
                />
                <p className="text-xs text-muted-foreground">
                  Enter your areas of expertise separated by commas
                </p>
              </div>

              <Input
                type="number"
                name="yearsOfExperience"
                label="Years of Experience"
                placeholder="e.g., 5"
                value={formData.yearsOfExperience}
                onChange={handleChange}
                leftIcon={<Building2 className="h-3.5 w-3.5" />}
                disabled={isLoading}
                fullWidth
                min="0"
                max="50"
              />

              <div className="space-y-2">
                <label className="text-sm font-medium">Professional Bio</label>
                <Textarea
                  name="bio"
                  placeholder="Tell us about your background and expertise..."
                  value={formData.bio}
                  onChange={handleChange}
                  disabled={isLoading}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  This will be visible to potential clients
                </p>
              </div>
            </div>

            {/* Security */}
            <div className="space-y-3 pt-4 border-t">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Account Security
              </h3>

              <div className="space-y-2">
                <Input
                  type="password"
                  name="password"
                  label="Password"
                  placeholder="Create a strong password"
                  value={formData.password}
                  onChange={handleChange}
                  leftIcon={<Lock className="h-3.5 w-3.5" />}
                  required
                  disabled={isLoading}
                  fullWidth
                />
                {formData.password && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Password strength:</span>
                      <span className="text-xs font-medium">{getPasswordStrengthText()}</span>
                    </div>
                    <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${getPasswordStrengthColor()}`}
                        style={{ width: `${passwordStrength * 25}%` }}
                      />
                    </div>
                    {passwordStrength < 4 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Must include: uppercase, lowercase, number, and special character (@$!%*?&)
                      </p>
                    )}
                  </div>
                )}
              </div>

              <Input
                type="password"
                name="confirmPassword"
                label="Confirm Password"
                placeholder="Re-enter your password"
                value={formData.confirmPassword}
                onChange={handleChange}
                leftIcon={<Lock className="h-3.5 w-3.5" />}
                required
                disabled={isLoading}
                fullWidth
              />
            </div>

            <div className="flex items-start space-x-2 pt-2">
              <input
                type="checkbox"
                id="acceptTerms"
                name="acceptTerms"
                checked={formData.acceptTerms}
                onChange={handleChange}
                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary mt-0.5"
                disabled={isLoading}
              />
              <label htmlFor="acceptTerms" className="text-sm text-muted-foreground">
                I agree to the{' '}
                <Link href="/terms" className="text-primary hover:underline">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className="text-primary hover:underline">
                  Privacy Policy
                </Link>
                , and understand that my profile will be visible to potential clients
              </label>
            </div>

            <Button
              type="submit"
              fullWidth
              loading={isLoading}
              size="lg"
              rightIcon={!isLoading && <ArrowRight className="h-4 w-4" />}
            >
              Create Consultant Account
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <p className="text-sm text-center w-full text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </p>
          <p className="text-sm text-center w-full text-muted-foreground">
            Looking to hire a consultant?{' '}
            <Link href="/register" className="text-primary hover:underline font-medium">
              Register as a client
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
