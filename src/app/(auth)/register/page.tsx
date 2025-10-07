'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Github, Chrome, Linkedin, Mail, Lock, User, Building2, Phone, ArrowRight, AlertCircle, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { auth } from '@/lib/api/client'

export default function RegisterPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    company: '',
    phone: '',
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target
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
      // Structure data according to backend expectations
      const registrationData = {
        email: formData.email.toLowerCase().trim(),
        password: formData.password,
        profile: {
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
        },
        phoneNumber: formData.phone.trim() || undefined,
        companyName: formData.company.trim() || undefined,
        userType: 'client'
      }

      console.log('Sending registration data:', registrationData)

      const response = await auth.register(registrationData)

      console.log('Registration response:', response)

      toast.success('Registration successful! Please check your email to verify your account.')

      // Handle token storage and redirection
      if (response.data?.tokens?.accessToken) {
        // Tokens are automatically stored by auth.register
        setTimeout(() => {
          router.push('/dashboard')
        }, 2000)
      } else {
        // Redirect to verification page if no immediate login
        setTimeout(() => {
          router.push('/verify-email?email=' + encodeURIComponent(formData.email))
        }, 2000)
      }
    } catch (error: any) {
      console.error('Registration error:', error)

      // Extract detailed error information
      const errorResponse = error.response?.data

      if (errorResponse?.error?.details && Array.isArray(errorResponse.error.details)) {
        // Backend returned validation errors array
        setValidationErrors(errorResponse.error.details)
        setError('Please correct the following errors:')
      } else if (errorResponse?.error?.message) {
        // Backend returned error message
        setError(errorResponse.error.message)
      } else if (errorResponse?.message) {
        // Alternative error message format
        setError(errorResponse.message)
      } else if (error.message) {
        // Generic error message
        setError(error.message)
      } else {
        setError('Registration failed. Please try again.')
      }

      toast.error(error.response?.data?.error?.message || error.message || 'Registration failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSocialSignup = (provider: string) => {
    toast(`${provider} signup coming soon!`, {
      icon: '🚀',
    })
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
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl font-bold">Create an account</CardTitle>
        <CardDescription className="text-xs">
          Enter your details to get started with Enterprise Platform
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="flex flex-col space-y-2 text-destructive bg-destructive/10 p-3 rounded-lg">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-4 w-4" />
              <p className="text-xs font-medium">{error}</p>
            </div>
            {validationErrors.length > 0 && (
              <ul className="text-xs space-y-1 ml-6 list-disc">
                {validationErrors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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
            label="Work Email"
            placeholder="john@company.com"
            value={formData.email}
            onChange={handleChange}
            leftIcon={<Mail className="h-3.5 w-3.5" />}
            required
            disabled={isLoading}
            fullWidth
          />

          <Input
            type="text"
            name="company"
            label="Company Name"
            placeholder="Acme Corporation"
            value={formData.company}
            onChange={handleChange}
            leftIcon={<Building2 className="h-3.5 w-3.5" />}
            disabled={isLoading}
            fullWidth
          />

          <Input
            type="tel"
            name="phone"
            label="Phone Number (Optional)"
            placeholder="+1 (555) 000-0000"
            value={formData.phone}
            onChange={handleChange}
            leftIcon={<Phone className="h-3.5 w-3.5" />}
            disabled={isLoading}
            fullWidth
          />

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
                  <span className="text-2xs text-muted-foreground">Password strength:</span>
                  <span className="text-2xs font-medium">{getPasswordStrengthText()}</span>
                </div>
                <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${getPasswordStrengthColor()}`}
                    style={{ width: `${passwordStrength * 25}%` }}
                  />
                </div>
                {passwordStrength < 4 && (
                  <p className="text-2xs text-muted-foreground mt-1">
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

          <div className="flex items-start space-x-2">
            <input
              type="checkbox"
              id="acceptTerms"
              name="acceptTerms"
              checked={formData.acceptTerms}
              onChange={handleChange}
              className="w-3.5 h-3.5 rounded border-gray-300 text-primary focus:ring-primary mt-0.5"
              disabled={isLoading}
            />
            <label htmlFor="acceptTerms" className="text-xs text-muted-foreground">
              I agree to the{' '}
              <Link href="/terms" className="text-primary hover:underline">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>
            </label>
          </div>

          <Button
            type="submit"
            fullWidth
            loading={isLoading}
            rightIcon={!isLoading && <ArrowRight className="h-3.5 w-3.5" />}
          >
            Create Account
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-2xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              Or sign up with
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleSocialSignup('Google')}
            disabled={isLoading}
          >
            <Chrome className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleSocialSignup('GitHub')}
            disabled={isLoading}
          >
            <Github className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleSocialSignup('LinkedIn')}
            disabled={isLoading}
          >
            <Linkedin className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
      <CardFooter>
        <p className="text-xs text-center w-full text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-primary hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}