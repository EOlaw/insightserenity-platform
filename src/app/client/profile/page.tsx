'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  User,
  Mail,
  Phone,
  Building2,
  Briefcase,
  Settings,
  Lock,
  Upload,
  Save,
  ArrowLeft,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  Trash2,
  Bell,
  Globe,
  Palette,
  Shield,
  LogOut,
  RefreshCw
} from 'lucide-react'
import toast from 'react-hot-toast'
import { auth, api } from '@/lib/api/client'

interface UserProfile {
  _id: string
  email: string
  firstName: string
  lastName: string
  phone?: string
  profile?: {
    displayName?: string
    firstName?: string
    lastName?: string
    email?: string
    phone?: string
    avatar?: {
      url: string
      alt: string
    }
  }
  professional?: {
    title?: string
    department?: string
    company?: string
    experience?: number
    skills?: string[]
    bio?: string
  }
  preferences?: {
    theme?: string
    language?: string
    timezone?: string
    notifications?: {
      email?: boolean
      push?: boolean
      marketing?: boolean
    }
    privacy?: {
      profileVisibility?: string
      allowSearchIndexing?: boolean
    }
  }
  security?: {
    twoFactorEnabled?: boolean
    lastPasswordChange?: string
  }
  mfa?: {
    enabled?: boolean
  }
  subscription?: {
    plan?: string
    status?: string
  }
  role: string
  status: string
  emailVerified?: boolean
  phoneVerified?: boolean
  verification?: {
    email?: {
      verified?: boolean
    }
    phone?: {
      verified?: boolean
    }
  }
  createdAt: string
  updatedAt: string
}

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('general')
  const [error, setError] = useState('')

  // Form states
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
  })

  const [professionalForm, setProfessionalForm] = useState({
    title: '',
    department: '',
    company: '',
    experience: 0,
    skills: [] as string[],
    bio: '',
  })

  const [preferencesForm, setPreferencesForm] = useState({
    theme: 'light',
    language: 'en',
    timezone: 'UTC',
    notifications: {
      email: true,
      push: false,
      marketing: false,
    },
    privacy: {
      profileVisibility: 'private',
      allowSearchIndexing: false,
    },
  })

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  })

  const [newSkill, setNewSkill] = useState('')

  useEffect(() => {
    loadUserProfile()
  }, [])

  const loadUserProfile = async () => {
    setIsLoading(true)
    setError('')

    try {
      // Use the same method that works in the dashboard
      const response = await auth.getCurrentUser()
      
      console.log('Profile data received:', response)
      
      // Handle different response structures
      let userData: UserProfile
      
      if (response.data?.user) {
        userData = response.data.user
      } else if (response.user) {
        userData = response.user
      } else if (response._id || response.email) {
        userData = response as UserProfile
      } else {
        throw new Error('Invalid user data structure received from server')
      }

      setUser(userData)

      // Populate forms with existing data
      setProfileForm({
        firstName: userData.firstName || userData.profile?.firstName || '',
        lastName: userData.lastName || userData.profile?.lastName || '',
        phone: userData.phone || userData.profile?.phone || '',
      })

      setProfessionalForm({
        title: userData.professional?.title || '',
        department: userData.professional?.department || '',
        company: userData.professional?.company || '',
        experience: userData.professional?.experience || 0,
        skills: userData.professional?.skills || [],
        bio: userData.professional?.bio || '',
      })

      setPreferencesForm({
        theme: userData.preferences?.theme || 'light',
        language: userData.preferences?.language || 'en',
        timezone: userData.preferences?.timezone || 'UTC',
        notifications: {
          email: userData.preferences?.notifications?.email ?? true,
          push: userData.preferences?.notifications?.push ?? false,
          marketing: userData.preferences?.notifications?.marketing ?? false,
        },
        privacy: {
          profileVisibility: userData.preferences?.privacy?.profileVisibility || 'private',
          allowSearchIndexing: userData.preferences?.privacy?.allowSearchIndexing ?? false,
        },
      })
    } catch (error: any) {
      console.error('Failed to load profile:', error)
      if (error.response?.status === 401) {
        toast.error('Please sign in to access your profile')
        router.push('/login')
      } else {
        setError('Failed to load profile data')
        toast.error('Failed to load profile')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    setIsSaving(true)

    try {
      const updateData = {
        firstName: profileForm.firstName,
        lastName: profileForm.lastName,
        phone: profileForm.phone,
        professional: professionalForm,
        preferences: preferencesForm,
      }

      // Try to update profile - adjust the endpoint based on your API
      await api.put('/users/profile', updateData)
      await loadUserProfile() // Reload to get updated data
      toast.success('Profile updated successfully!')
    } catch (error: any) {
      console.error('Failed to update profile:', error)
      
      // Provide more specific error messages
      if (error.response?.status === 404) {
        toast.error('Profile update endpoint not found. Please contact support.')
      } else {
        toast.error(error.response?.data?.message || 'Failed to update profile')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleChangePassword = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast.error('Please fill in all password fields')
      return
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New passwords do not match')
      return
    }

    if (passwordForm.newPassword.length < 8) {
      toast.error('Password must be at least 8 characters long')
      return
    }

    setIsSaving(true)

    try {
      await api.put('/auth/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      })
      
      toast.success('Password changed successfully!')
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      })
    } catch (error: any) {
      console.error('Failed to change password:', error)
      toast.error(error.response?.data?.message || 'Failed to change password')
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddSkill = () => {
    if (!newSkill.trim()) return

    if (professionalForm.skills.includes(newSkill.trim())) {
      toast.error('Skill already added')
      return
    }

    setProfessionalForm(prev => ({
      ...prev,
      skills: [...prev.skills, newSkill.trim()],
    }))
    setNewSkill('')
  }

  const handleRemoveSkill = (skill: string) => {
    setProfessionalForm(prev => ({
      ...prev,
      skills: prev.skills.filter(s => s !== skill),
    }))
  }

  // Check email verification from multiple possible locations
  const isEmailVerified = () => {
    if (!user) return false
    if (user.emailVerified === true) return true
    if (user.verification?.email?.verified === true) return true
    return false
  }

  // Check phone verification from multiple possible locations
  const isPhoneVerified = () => {
    if (!user) return false
    if (user.phoneVerified === true) return true
    if (user.verification?.phone?.verified === true) return true
    return false
  }

  // Check 2FA status
  const is2FAEnabled = () => {
    if (!user) return false
    if (user.security?.twoFactorEnabled === true) return true
    if (user.mfa?.enabled === true) return true
    return false
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-sm text-gray-600">Loading your profile...</p>
        </div>
      </div>
    )
  }

  if (error || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Error Loading Profile</h2>
            <p className="text-sm text-gray-600 mb-4">{error || 'Unable to load profile data'}</p>
            <div className="flex gap-3 justify-center">
              <Button onClick={loadUserProfile} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
              <Link href="/client/dashboard">
                <Button>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link href="/dashboard">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </Button>
              </Link>
              <div className="h-6 w-px bg-gray-300" />
              <h1 className="text-lg font-bold">Edit Profile</h1>
            </div>

            <div className="flex items-center space-x-3">
              <Button variant="ghost" size="sm">
                <Bell className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm">
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <Card>
              <CardContent className="p-4">
                <div className="text-center mb-6">
                  <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                    <User className="h-10 w-10 text-primary" />
                  </div>
                  <h3 className="text-base font-semibold">
                    {user.profile?.displayName || `${user.firstName} ${user.lastName}`}
                  </h3>
                  <p className="text-xs text-gray-600">{user.email}</p>
                  <div className="flex items-center justify-center space-x-2 mt-2">
                    {isEmailVerified() ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Unverified
                      </span>
                    )}
                  </div>
                </div>

                <nav className="space-y-1">
                  <button
                    onClick={() => setActiveTab('general')}
                    className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      activeTab === 'general'
                        ? 'bg-primary text-black'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <User className="h-4 w-4" />
                    <span>General</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('professional')}
                    className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      activeTab === 'professional'
                        ? 'bg-primary text-black'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Briefcase className="h-4 w-4" />
                    <span>Professional</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('preferences')}
                    className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      activeTab === 'preferences'
                        ? 'bg-primary text-black'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Settings className="h-4 w-4" />
                    <span>Preferences</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('security')}
                    className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      activeTab === 'security'
                        ? 'bg-primary text-black'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Lock className="h-4 w-4" />
                    <span>Security</span>
                  </button>
                </nav>
              </CardContent>
            </Card>

            {/* Account Info Card */}
            <Card className="mt-4">
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold mb-3">Account Information</h4>
                <div className="space-y-2 text-xs text-gray-600">
                  <div className="flex justify-between">
                    <span>Plan:</span>
                    <span className="font-medium text-gray-900 capitalize">
                      {user.subscription?.plan || 'Free'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Status:</span>
                    <span className="font-medium text-gray-900 capitalize">{user.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Member Since:</span>
                    <span className="font-medium text-gray-900">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {activeTab === 'general' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">General Information</CardTitle>
                  <CardDescription className="text-sm">
                    Update your personal information and contact details
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="First Name"
                      value={profileForm.firstName}
                      onChange={(e) => setProfileForm(prev => ({ ...prev, firstName: e.target.value }))}
                      leftIcon={<User className="h-3.5 w-3.5" />}
                      required
                    />
                    <Input
                      label="Last Name"
                      value={profileForm.lastName}
                      onChange={(e) => setProfileForm(prev => ({ ...prev, lastName: e.target.value }))}
                      leftIcon={<User className="h-3.5 w-3.5" />}
                      required
                    />
                  </div>

                  <Input
                    label="Email Address"
                    value={user.email}
                    disabled
                    leftIcon={<Mail className="h-3.5 w-3.5" />}
                    rightIcon={
                      isEmailVerified() ? (
                        <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 text-yellow-600" />
                      )
                    }
                  />

                  <Input
                    label="Phone Number"
                    type="tel"
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm(prev => ({ ...prev, phone: e.target.value }))}
                    leftIcon={<Phone className="h-3.5 w-3.5" />}
                    placeholder="+1 (555) 000-0000"
                    rightIcon={
                      isPhoneVerified() ? (
                        <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                      ) : undefined
                    }
                  />

                  <div className="flex justify-end pt-4">
                    <Button onClick={handleSaveProfile} disabled={isSaving}>
                      {isSaving ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-3.5 w-3.5 mr-2" />
                          Save Changes
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeTab === 'professional' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Professional Information</CardTitle>
                  <CardDescription className="text-sm">
                    Manage your work-related details and expertise
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    label="Job Title"
                    value={professionalForm.title}
                    onChange={(e) => setProfessionalForm(prev => ({ ...prev, title: e.target.value }))}
                    leftIcon={<Briefcase className="h-3.5 w-3.5" />}
                    placeholder="e.g. Senior Software Engineer"
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Department"
                      value={professionalForm.department}
                      onChange={(e) => setProfessionalForm(prev => ({ ...prev, department: e.target.value }))}
                      leftIcon={<Building2 className="h-3.5 w-3.5" />}
                      placeholder="e.g. Engineering"
                    />
                    <Input
                      label="Company"
                      value={professionalForm.company}
                      onChange={(e) => setProfessionalForm(prev => ({ ...prev, company: e.target.value }))}
                      leftIcon={<Building2 className="h-3.5 w-3.5" />}
                      placeholder="e.g. TechCorp Inc"
                    />
                  </div>

                  <Input
                    label="Years of Experience"
                    type="number"
                    value={professionalForm.experience}
                    onChange={(e) => setProfessionalForm(prev => ({ ...prev, experience: parseInt(e.target.value) || 0 }))}
                    min="0"
                    max="50"
                  />

                  {/* Skills */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Skills</label>
                    <div className="flex gap-2 mb-3">
                      <Input
                        value={newSkill}
                        onChange={(e) => setNewSkill(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleAddSkill()
                          }
                        }}
                        placeholder="Add a skill..."
                      />
                      <Button onClick={handleAddSkill} size="sm">
                        Add
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {professionalForm.skills.map((skill, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-primary/10 text-primary"
                        >
                          {skill}
                          <button
                            onClick={() => handleRemoveSkill(skill)}
                            className="ml-2 text-primary hover:text-primary/80"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Bio */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Bio</label>
                    <textarea
                      value={professionalForm.bio}
                      onChange={(e) => setProfessionalForm(prev => ({ ...prev, bio: e.target.value }))}
                      rows={4}
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                      placeholder="Tell us about yourself..."
                    />
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button onClick={handleSaveProfile} disabled={isSaving}>
                      {isSaving ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-3.5 w-3.5 mr-2" />
                          Save Changes
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeTab === 'preferences' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Preferences</CardTitle>
                  <CardDescription className="text-sm">
                    Customize your experience and privacy settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Theme & Language */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block flex items-center">
                        <Palette className="h-4 w-4 mr-2" />
                        Theme
                      </label>
                      <select
                        value={preferencesForm.theme}
                        onChange={(e) => setPreferencesForm(prev => ({ ...prev, theme: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                        <option value="auto">Auto</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block flex items-center">
                        <Globe className="h-4 w-4 mr-2" />
                        Language
                      </label>
                      <select
                        value={preferencesForm.language}
                        onChange={(e) => setPreferencesForm(prev => ({ ...prev, language: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="en">English</option>
                        <option value="es">Spanish</option>
                        <option value="fr">French</option>
                        <option value="de">German</option>
                      </select>
                    </div>
                  </div>

                  {/* Timezone */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Timezone</label>
                    <select
                      value={preferencesForm.timezone}
                      onChange={(e) => setPreferencesForm(prev => ({ ...prev, timezone: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="UTC">UTC</option>
                      <option value="America/New_York">Eastern Time</option>
                      <option value="America/Chicago">Central Time</option>
                      <option value="America/Denver">Mountain Time</option>
                      <option value="America/Los_Angeles">Pacific Time</option>
                      <option value="Europe/London">London</option>
                      <option value="Europe/Paris">Paris</option>
                      <option value="Asia/Tokyo">Tokyo</option>
                    </select>
                  </div>

                  {/* Notifications */}
                  <div>
                    <label className="text-sm font-medium mb-3 block flex items-center">
                      <Bell className="h-4 w-4 mr-2" />
                      Notifications
                    </label>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium">Email Notifications</div>
                          <div className="text-xs text-gray-600">Receive important updates via email</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={preferencesForm.notifications.email}
                          onChange={(e) => setPreferencesForm(prev => ({
                            ...prev,
                            notifications: { ...prev.notifications, email: e.target.checked }
                          }))}
                          className="w-4 h-4 text-primary focus:ring-primary border-gray-300 rounded"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium">Push Notifications</div>
                          <div className="text-xs text-gray-600">Get notified in your browser</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={preferencesForm.notifications.push}
                          onChange={(e) => setPreferencesForm(prev => ({
                            ...prev,
                            notifications: { ...prev.notifications, push: e.target.checked }
                          }))}
                          className="w-4 h-4 text-primary focus:ring-primary border-gray-300 rounded"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium">Marketing Communications</div>
                          <div className="text-xs text-gray-600">Receive product updates and offers</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={preferencesForm.notifications.marketing}
                          onChange={(e) => setPreferencesForm(prev => ({
                            ...prev,
                            notifications: { ...prev.notifications, marketing: e.target.checked }
                          }))}
                          className="w-4 h-4 text-primary focus:ring-primary border-gray-300 rounded"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Privacy */}
                  <div>
                    <label className="text-sm font-medium mb-3 block flex items-center">
                      <Shield className="h-4 w-4 mr-2" />
                      Privacy
                    </label>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium mb-2 block">Profile Visibility</label>
                        <select
                          value={preferencesForm.privacy.profileVisibility}
                          onChange={(e) => setPreferencesForm(prev => ({
                            ...prev,
                            privacy: { ...prev.privacy, profileVisibility: e.target.value }
                          }))}
                          className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="public">Public</option>
                          <option value="private">Private</option>
                          <option value="connections">Connections Only</option>
                        </select>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium">Allow Search Engine Indexing</div>
                          <div className="text-xs text-gray-600">Let search engines find your profile</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={preferencesForm.privacy.allowSearchIndexing}
                          onChange={(e) => setPreferencesForm(prev => ({
                            ...prev,
                            privacy: { ...prev.privacy, allowSearchIndexing: e.target.checked }
                          }))}
                          className="w-4 h-4 text-primary focus:ring-primary border-gray-300 rounded"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button onClick={handleSaveProfile} disabled={isSaving}>
                      {isSaving ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-3.5 w-3.5 mr-2" />
                          Save Changes
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeTab === 'security' && (
              <div className="space-y-6">
                {/* Change Password */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Change Password</CardTitle>
                    <CardDescription className="text-sm">
                      Update your password to keep your account secure
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Input
                      type={showPasswords.current ? 'text' : 'password'}
                      label="Current Password"
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                      leftIcon={<Lock className="h-3.5 w-3.5" />}
                      rightIcon={
                        <button
                          type="button"
                          onClick={() => setShowPasswords(prev => ({ ...prev, current: !prev.current }))}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          {showPasswords.current ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      }
                      required
                    />

                    <Input
                      type={showPasswords.new ? 'text' : 'password'}
                      label="New Password"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                      leftIcon={<Lock className="h-3.5 w-3.5" />}
                      rightIcon={
                        <button
                          type="button"
                          onClick={() => setShowPasswords(prev => ({ ...prev, new: !prev.new }))}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          {showPasswords.new ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      }
                      required
                    />

                    <Input
                      type={showPasswords.confirm ? 'text' : 'password'}
                      label="Confirm New Password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      leftIcon={<Lock className="h-3.5 w-3.5" />}
                      rightIcon={
                        <button
                          type="button"
                          onClick={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          {showPasswords.confirm ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      }
                      required
                    />

                    <div className="flex justify-end pt-4">
                      <Button onClick={handleChangePassword} disabled={isSaving}>
                        {isSaving ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" />
                            Changing...
                          </>
                        ) : (
                          <>
                            <Lock className="h-3.5 w-3.5 mr-2" />
                            Change Password
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Account Security */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Account Security</CardTitle>
                    <CardDescription className="text-sm">
                      Monitor and manage your account security
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <div className="text-sm font-medium">Two-Factor Authentication</div>
                        <div className="text-xs text-gray-600">
                          {is2FAEnabled() ? (
                            <span className="text-green-600 flex items-center mt-1">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Enabled
                            </span>
                          ) : (
                            <span className="text-gray-600">Not enabled</span>
                          )}
                        </div>
                      </div>
                      <Button size="sm" variant="outline">
                        {is2FAEnabled() ? 'Manage' : 'Enable'}
                      </Button>
                    </div>

                    {user.security?.lastPasswordChange && (
                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <div className="text-sm font-medium">Last Password Change</div>
                          <div className="text-xs text-gray-600">
                            {new Date(user.security.lastPasswordChange).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <div className="text-sm font-medium">Email Verification</div>
                        <div className="text-xs text-gray-600">
                          {isEmailVerified() ? (
                            <span className="text-green-600 flex items-center mt-1">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Verified
                            </span>
                          ) : (
                            <span className="text-yellow-600 flex items-center mt-1">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Not verified
                            </span>
                          )}
                        </div>
                      </div>
                      {!isEmailVerified() && (
                        <Button size="sm" variant="outline">
                          Verify Email
                        </Button>
                      )}
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <div className="text-sm font-medium">Account Status</div>
                        <div className="text-xs text-gray-600 capitalize">{user.status}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}