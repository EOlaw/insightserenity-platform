'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Github, Chrome, Linkedin, Mail, Lock, ArrowRight, AlertCircle, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { auth } from '@/lib/api/client'

export default function LoginPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const validateForm = () => {
    if (!formData.email) {
      setError('Email is required')
      return false
    }

    if (!formData.password) {
      setError('Password is required')
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
      const response = await auth.login(formData.email, formData.password)

      toast.success('Login successful! Welcome back.')

      // Redirect to dashboard
      router.push('/dashboard')
    } catch (error: any) {
      console.error('Login failed:', error)

      // Handle specific error messages from backend
      if (error.response?.data?.message) {
        setError(error.response.data.message)
        toast.error(error.response.data.message)
      } else if (error.response?.status === 401) {
        setError('Invalid email or password')
        toast.error('Invalid email or password')
      } else if (error.message) {
        setError(error.message)
        toast.error(error.message)
      } else {
        setError('Login failed. Please try again.')
        toast.error('Login failed. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleSocialLogin = (provider: string) => {
    toast(`${provider} login coming soon!`, {
      icon: '🚀',
    })
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl font-bold">Welcome back</CardTitle>
        <CardDescription className="text-xs">
          Sign in to your Enterprise Platform account
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
            name="email"
            label="Email"
            placeholder="john@company.com"
            value={formData.email}
            onChange={handleChange}
            leftIcon={<Mail className="h-3.5 w-3.5" />}
            required
            disabled={isLoading}
            autoComplete="email"
            fullWidth
          />

          <div className="space-y-2">
            <Input
              type={showPassword ? 'text' : 'password'}
              name="password"
              label="Password"
              placeholder="Enter your password"
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
              disabled={isLoading}
              autoComplete="current-password"
              fullWidth
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="rememberMe"
                name="rememberMe"
                checked={formData.rememberMe}
                onChange={handleChange}
                className="w-3.5 h-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                disabled={isLoading}
              />
              <label htmlFor="rememberMe" className="text-xs text-muted-foreground">
                Remember me
              </label>
            </div>
            <Link
              href="/forgot-password"
              className="text-xs text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          <Button
            type="submit"
            fullWidth
            loading={isLoading}
            rightIcon={!isLoading && <ArrowRight className="h-3.5 w-3.5" />}
          >
            Sign In
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-2xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              Or sign in with
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleSocialLogin('Google')}
            disabled={isLoading}
          >
            <Chrome className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleSocialLogin('GitHub')}
            disabled={isLoading}
          >
            <Github className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleSocialLogin('LinkedIn')}
            disabled={isLoading}
          >
            <Linkedin className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
      <CardFooter>
        <p className="text-xs text-center w-full text-muted-foreground">
          Don't have an account?{' '}
          <Link href="/register" className="text-primary hover:underline font-medium">
            Sign up
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
