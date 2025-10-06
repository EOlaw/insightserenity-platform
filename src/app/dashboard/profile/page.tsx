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
  LogOut
} from 'lucide-react'
import toast from 'react-hot-toast'
import { auth, api } from '@/lib/api/client'

interface UserProfile {
  _id: string
  email: string
  firstName: string
  lastName: string
  phone: string
  profile: {
    displayName: string
    firstName: string
    lastName: string
    email: string
    phone: string
    avatar: {
      url: string
      alt: string
    }
  }
  professional: {
    title: string
    department: string
    company: string
    experience: number
    skills: string[]
    bio: string
  }
  preferences: {
    theme: string
    language: string
    timezone: string
    notifications: {
      email: boolean
      push: boolean
      marketing: boolean
    }
    privacy: {
      profileVisibility: string
      allowSearchIndexing: boolean
    }
  }
  security: {
    twoFactorEnabled: boolean
    lastPasswordChange: string
  }
  subscription: {
    plan: string
    status: string
  }
  role: string
  status: string
  emailVerified: boolean
  phoneVerified: boolean
  createdAt: string
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
      const response = await api.get('/profile')
      const userData = response.data.user

      setUser(userData)

      // Populate forms
      setProfileForm({
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        phone: userData.phone || '',
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

      await api.put('/profile', updateData)
      await loadUserProfile() // Reload to get updated data
      toast.success('Profile updated successfully!')
    } catch (error: any) {
      console.error('Failed to update profile:', error)
      toast.error(error.response?.data?.message || 'Failed to update profile')
    } finally {
      setIsSaving(false)
    }
  }

  const handleChangePassword = async () => {
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
      await api.post('/profile/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      })

      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      })

      toast.success('Password changed successfully!')
    } catch (error: any) {
      console.error('Failed to change password:', error)
      toast.error(error.response?.data?.message || 'Failed to change password')
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddSkill = () => {
    if (newSkill.trim() && !professionalForm.skills.includes(newSkill.trim())) {
      setProfessionalForm(prev => ({
        ...prev,
        skills: [...prev.skills, newSkill.trim()]
      }))
      setNewSkill('')
    }
  }

  const handleRemoveSkill = (skillToRemove: string) => {
    setProfessionalForm(prev => ({
      ...prev,
      skills: prev.skills.filter(skill => skill !== skillToRemove)
    }))
  }

  const handleLogout = async () => {
    try {
      await auth.logout()
      toast.success('Logged out successfully')
      router.push('/')
    } catch (error) {
      console.error('Logout failed:', error)
      router.push('/')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-gray-600">Loading profile...</p>
        </div>
      </div>
    )
  }

  if (error || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center justify-center mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
            </div>
            <CardTitle className="text-center">Error Loading Profile</CardTitle>
            <CardDescription className="text-center">{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Button onClick={loadUserProfile} fullWidth>
                Try Again
              </Button>
              <Link href="/dashboard">
                <Button variant="outline" fullWidth>
                  Back to Dashboard
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const tabs = [
    { id: 'general', label: 'General', icon: User },
    { id: 'professional', label: 'Professional', icon: Briefcase },
    { id: 'preferences', label: 'Preferences', icon: Settings },
    { id: 'security', label: 'Security', icon: Lock },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link href="/dashboard" className="flex items-center space-x-2 text-gray-600 hover:text-gray-900">
                <ArrowLeft className="h-4 w-4" />
                <span className="text-sm">Back to Dashboard</span>
              </Link>
            </div>

            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">Welcome, {user.profile.displayName}</span>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Profile Settings</h1>
          <p className="text-sm text-gray-600">Manage your account settings and preferences</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <Card>
              <CardContent className="p-4">
                <div className="space-y-2">
                  {tabs.map((tab) => {
                    const Icon = tab.icon
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`w-full flex items-center space-x-3 px-3 py-2 text-sm rounded-lg transition-colors ${
                          activeTab === tab.id
                            ? 'bg-primary text-black font-medium'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{tab.label}</span>
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Profile Summary */}
            <Card className="mt-6">
              <CardContent className="p-4">
                <div className="text-center">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                    <User className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="font-medium">{user.profile.displayName}</h3>
                  <p className="text-xs text-gray-600">{user.email}</p>
                  <div className="flex items-center justify-center space-x-1 mt-2">
                    {user.emailVerified ? (
                      <CheckCircle className="h-3 w-3 text-green-600" />
                    ) : (
                      <AlertCircle className="h-3 w-3 text-yellow-600" />
                    )}
                    <span className="text-xs text-gray-600">
                      {user.emailVerified ? 'Verified' : 'Unverified'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Content */}
          <div className="lg:col-span-3">
            {activeTab === 'general' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">General Information</CardTitle>
                  <CardDescription className="text-sm">
                    Update your basic profile information
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
                      required
                    />
                  </div>

                  <Input
                    label="Email Address"
                    value={user.email}
                    leftIcon={<Mail className="h-3.5 w-3.5" />}
                    disabled
                    hint="Email cannot be changed. Contact support if you need to update your email."
                  />

                  <Input
                    label="Phone Number"
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm(prev => ({ ...prev, phone: e.target.value }))}
                    leftIcon={<Phone className="h-3.5 w-3.5" />}
                    placeholder="+1 (555) 000-0000"
                  />

                  <div className="flex justify-end pt-4">
                    <Button onClick={handleSaveProfile} loading={isSaving}>
                      <Save className="h-3.5 w-3.5 mr-2" />
                      Save Changes
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
                    Update your work-related information
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    label="Job Title"
                    value={professionalForm.title}
                    onChange={(e) => setProfessionalForm(prev => ({ ...prev, title: e.target.value }))}
                    leftIcon={<Briefcase className="h-3.5 w-3.5" />}
                    placeholder="Software Engineer"
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Department"
                      value={professionalForm.department}
                      onChange={(e) => setProfessionalForm(prev => ({ ...prev, department: e.target.value }))}
                      placeholder="Engineering"
                    />
                    <Input
                      label="Company"
                      value={professionalForm.company}
                      onChange={(e) => setProfessionalForm(prev => ({ ...prev, company: e.target.value }))}
                      leftIcon={<Building2 className="h-3.5 w-3.5" />}
                      placeholder="Acme Corporation"
                    />
                  </div>

                  <Input
                    type="number"
                    label="Years of Experience"
                    value={professionalForm.experience.toString()}
                    onChange={(e) => setProfessionalForm(prev => ({ ...prev, experience: parseInt(e.target.value) || 0 }))}
                    min="0"
                    max="50"
                  />

                  {/* Skills */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Skills</label>
                    <div className="flex gap-2 mb-2">
                      <Input
                        value={newSkill}
                        onChange={(e) => setNewSkill(e.target.value)}
                        placeholder="Add a skill"
                        onKeyPress={(e) => e.key === 'Enter' && handleAddSkill()}
                      />
                      <Button type="button" onClick={handleAddSkill} size="sm">
                        Add
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {professionalForm.skills.map((skill, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-primary/10 text-primary"
                        >
                          {skill}
                          <button
                            onClick={() => handleRemoveSkill(skill)}
                            className="ml-1 hover:text-red-600"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Bio</label>
                    <textarea
                      value={professionalForm.bio}
                      onChange={(e) => setProfessionalForm(prev => ({ ...prev, bio: e.target.value }))}
                      rows={4}
                      className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                      placeholder="Tell us about yourself..."
                    />
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button onClick={handleSaveProfile} loading={isSaving}>
                      <Save className="h-3.5 w-3.5 mr-2" />
                      Save Changes
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
                    Customize your experience
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Theme */}
                  <div>
                    <label className="text-sm font-medium mb-3 block flex items-center">
                      <Palette className="h-4 w-4 mr-2" />
                      Theme
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setPreferencesForm(prev => ({ ...prev, theme: 'light' }))}
                        className={`p-3 rounded-lg border text-left ${
                          preferencesForm.theme === 'light' ? 'border-primary bg-primary/5' : 'border-gray-200'
                        }`}
                      >
                        <div className="text-sm font-medium">Light</div>
                        <div className="text-xs text-gray-600">Bright and clean</div>
                      </button>
                      <button
                        onClick={() => setPreferencesForm(prev => ({ ...prev, theme: 'dark' }))}
                        className={`p-3 rounded-lg border text-left ${
                          preferencesForm.theme === 'dark' ? 'border-primary bg-primary/5' : 'border-gray-200'
                        }`}
                      >
                        <div className="text-sm font-medium">Dark</div>
                        <div className="text-xs text-gray-600">Easy on the eyes</div>
                      </button>
                    </div>
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
                    <Button onClick={handleSaveProfile} loading={isSaving}>
                      <Save className="h-3.5 w-3.5 mr-2" />
                      Save Changes
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
                      <Button onClick={handleChangePassword} loading={isSaving}>
                        <Lock className="h-3.5 w-3.5 mr-2" />
                        Change Password
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
                          {user.security.twoFactorEnabled ? 'Enabled' : 'Not enabled'}
                        </div>
                      </div>
                      <Button size="sm" variant="outline">
                        {user.security.twoFactorEnabled ? 'Manage' : 'Enable'}
                      </Button>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <div className="text-sm font-medium">Last Password Change</div>
                        <div className="text-xs text-gray-600">
                          {new Date(user.security.lastPasswordChange).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <div className="text-sm font-medium">Email Verification</div>
                        <div className="text-xs text-gray-600">
                          {user.emailVerified ? 'Verified' : 'Not verified'}
                        </div>
                      </div>
                      {!user.emailVerified && (
                        <Button size="sm" variant="outline">
                          Verify Email
                        </Button>
                      )}
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
