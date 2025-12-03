'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  User,
  Bell,
  Shield,
  Globe,
  Moon,
  Sun,
  Mail,
  Smartphone,
  Lock,
  Eye,
  EyeOff,
  Save,
  Loader2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useTheme } from 'next-themes'

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const [activeTab, setActiveTab] = useState('profile')
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Profile settings
  const [profileData, setProfileData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    language: 'en',
    timezone: 'UTC',
  })

  // Notification settings
  const [notifications, setNotifications] = useState({
    emailNotifications: true,
    smsNotifications: false,
    projectUpdates: true,
    documentAlerts: true,
    weeklyReports: true,
    marketingEmails: false,
  })

  // Security settings
  const [security, setSecurity] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    twoFactorEnabled: false,
  })

  useEffect(() => {
    setMounted(true)
    loadUserSettings()
  }, [])

  const loadUserSettings = async () => {
    // TODO: Load actual user settings from API
    setProfileData({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      phone: '+1 (555) 123-4567',
      language: 'en',
      timezone: 'America/New_York',
    })
  }

  const handleSaveProfile = async () => {
    setLoading(true)
    try {
      // TODO: Save profile data to API
      await new Promise(resolve => setTimeout(resolve, 1000))
      toast.success('Profile updated successfully')
    } catch (error) {
      toast.error('Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveNotifications = async () => {
    setLoading(true)
    try {
      // TODO: Save notification preferences to API
      await new Promise(resolve => setTimeout(resolve, 1000))
      toast.success('Notification preferences updated')
    } catch (error) {
      toast.error('Failed to update preferences')
    } finally {
      setLoading(false)
    }
  }

  const handleChangePassword = async () => {
    if (security.newPassword !== security.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      // TODO: Change password via API
      await new Promise(resolve => setTimeout(resolve, 1000))
      toast.success('Password changed successfully')
      setSecurity({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
        twoFactorEnabled: security.twoFactorEnabled,
      })
    } catch (error) {
      toast.error('Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  if (!mounted) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            Manage your account settings and preferences
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1">
            <Card>
              <CardContent className="p-3">
                <nav className="space-y-1">
                  <button
                    onClick={() => setActiveTab('profile')}
                    className={`w-full flex items-center space-x-2 px-3 py-2 rounded-md text-xs transition-colors ${
                      activeTab === 'profile'
                        ? 'bg-[#ffc451] text-black font-medium'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <User className="h-3.5 w-3.5" />
                    <span>Profile</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('notifications')}
                    className={`w-full flex items-center space-x-2 px-3 py-2 rounded-md text-xs transition-colors ${
                      activeTab === 'notifications'
                        ? 'bg-[#ffc451] text-black font-medium'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <Bell className="h-3.5 w-3.5" />
                    <span>Notifications</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('security')}
                    className={`w-full flex items-center space-x-2 px-3 py-2 rounded-md text-xs transition-colors ${
                      activeTab === 'security'
                        ? 'bg-[#ffc451] text-black font-medium'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <Shield className="h-3.5 w-3.5" />
                    <span>Security</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('preferences')}
                    className={`w-full flex items-center space-x-2 px-3 py-2 rounded-md text-xs transition-colors ${
                      activeTab === 'preferences'
                        ? 'bg-[#ffc451] text-black font-medium'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <Globe className="h-3.5 w-3.5" />
                    <span>Preferences</span>
                  </button>
                </nav>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {activeTab === 'profile' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Profile Information</CardTitle>
                  <CardDescription className="text-xs">
                    Update your personal information and contact details
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="firstName" className="text-xs">First Name</Label>
                      <Input
                        id="firstName"
                        value={profileData.firstName}
                        onChange={(e) => setProfileData({ ...profileData, firstName: e.target.value })}
                        className="text-xs h-8"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="lastName" className="text-xs">Last Name</Label>
                      <Input
                        id="lastName"
                        value={profileData.lastName}
                        onChange={(e) => setProfileData({ ...profileData, lastName: e.target.value })}
                        className="text-xs h-8"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profileData.email}
                      onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                      className="text-xs h-8"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="phone" className="text-xs">Phone Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={profileData.phone}
                      onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                      className="text-xs h-8"
                    />
                  </div>

                  <Separator />

                  <div className="flex justify-end">
                    <Button
                      onClick={handleSaveProfile}
                      disabled={loading}
                      className="bg-[#ffc451] hover:bg-[#e6b048] text-black text-xs h-8 px-4"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-3 w-3" />
                          Save Changes
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeTab === 'notifications' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Notification Preferences</CardTitle>
                  <CardDescription className="text-xs">
                    Choose how you want to receive updates and alerts
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="email-notifications" className="text-xs font-medium">
                          Email Notifications
                        </Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Receive notifications via email
                        </p>
                      </div>
                      <Switch
                        id="email-notifications"
                        checked={notifications.emailNotifications}
                        onCheckedChange={(checked) =>
                          setNotifications({ ...notifications, emailNotifications: checked })
                        }
                      />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="sms-notifications" className="text-xs font-medium">
                          SMS Notifications
                        </Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Receive notifications via text message
                        </p>
                      </div>
                      <Switch
                        id="sms-notifications"
                        checked={notifications.smsNotifications}
                        onCheckedChange={(checked) =>
                          setNotifications({ ...notifications, smsNotifications: checked })
                        }
                      />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="project-updates" className="text-xs font-medium">
                          Project Updates
                        </Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Get notified about project status changes
                        </p>
                      </div>
                      <Switch
                        id="project-updates"
                        checked={notifications.projectUpdates}
                        onCheckedChange={(checked) =>
                          setNotifications({ ...notifications, projectUpdates: checked })
                        }
                      />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="document-alerts" className="text-xs font-medium">
                          Document Alerts
                        </Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Notifications when documents are shared with you
                        </p>
                      </div>
                      <Switch
                        id="document-alerts"
                        checked={notifications.documentAlerts}
                        onCheckedChange={(checked) =>
                          setNotifications({ ...notifications, documentAlerts: checked })
                        }
                      />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="weekly-reports" className="text-xs font-medium">
                          Weekly Reports
                        </Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Receive weekly summary of your activity
                        </p>
                      </div>
                      <Switch
                        id="weekly-reports"
                        checked={notifications.weeklyReports}
                        onCheckedChange={(checked) =>
                          setNotifications({ ...notifications, weeklyReports: checked })
                        }
                      />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="marketing-emails" className="text-xs font-medium">
                          Marketing Emails
                        </Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Receive updates about new features and offers
                        </p>
                      </div>
                      <Switch
                        id="marketing-emails"
                        checked={notifications.marketingEmails}
                        onCheckedChange={(checked) =>
                          setNotifications({ ...notifications, marketingEmails: checked })
                        }
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="flex justify-end">
                    <Button
                      onClick={handleSaveNotifications}
                      disabled={loading}
                      className="bg-[#ffc451] hover:bg-[#e6b048] text-black text-xs h-8 px-4"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-3 w-3" />
                          Save Preferences
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeTab === 'security' && (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Change Password</CardTitle>
                    <CardDescription className="text-xs">
                      Update your password to keep your account secure
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="current-password" className="text-xs">Current Password</Label>
                      <div className="relative">
                        <Input
                          id="current-password"
                          type={showPassword ? 'text' : 'password'}
                          value={security.currentPassword}
                          onChange={(e) => setSecurity({ ...security, currentPassword: e.target.value })}
                          className="text-xs h-8 pr-8"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                        >
                          {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="new-password" className="text-xs">New Password</Label>
                      <Input
                        id="new-password"
                        type={showPassword ? 'text' : 'password'}
                        value={security.newPassword}
                        onChange={(e) => setSecurity({ ...security, newPassword: e.target.value })}
                        className="text-xs h-8"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="confirm-password" className="text-xs">Confirm New Password</Label>
                      <Input
                        id="confirm-password"
                        type={showPassword ? 'text' : 'password'}
                        value={security.confirmPassword}
                        onChange={(e) => setSecurity({ ...security, confirmPassword: e.target.value })}
                        className="text-xs h-8"
                      />
                    </div>

                    <Separator />

                    <div className="flex justify-end">
                      <Button
                        onClick={handleChangePassword}
                        disabled={loading}
                        className="bg-[#ffc451] hover:bg-[#e6b048] text-black text-xs h-8 px-4"
                      >
                        {loading ? (
                          <>
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                            Updating...
                          </>
                        ) : (
                          <>
                            <Lock className="mr-2 h-3 w-3" />
                            Update Password
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Two-Factor Authentication</CardTitle>
                    <CardDescription className="text-xs">
                      Add an extra layer of security to your account
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="two-factor" className="text-xs font-medium">
                          Enable Two-Factor Authentication
                        </Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Require a verification code in addition to your password
                        </p>
                      </div>
                      <Switch
                        id="two-factor"
                        checked={security.twoFactorEnabled}
                        onCheckedChange={(checked) =>
                          setSecurity({ ...security, twoFactorEnabled: checked })
                        }
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === 'preferences' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">General Preferences</CardTitle>
                  <CardDescription className="text-xs">
                    Customize your experience and regional settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="language" className="text-xs">Language</Label>
                    <Select value={profileData.language} onValueChange={(value) => setProfileData({ ...profileData, language: value })}>
                      <SelectTrigger id="language" className="text-xs h-8">
                        <SelectValue placeholder="Select language" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en" className="text-xs">English</SelectItem>
                        <SelectItem value="es" className="text-xs">Spanish</SelectItem>
                        <SelectItem value="fr" className="text-xs">French</SelectItem>
                        <SelectItem value="de" className="text-xs">German</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="timezone" className="text-xs">Timezone</Label>
                    <Select value={profileData.timezone} onValueChange={(value) => setProfileData({ ...profileData, timezone: value })}>
                      <SelectTrigger id="timezone" className="text-xs h-8">
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="America/New_York" className="text-xs">Eastern Time (ET)</SelectItem>
                        <SelectItem value="America/Chicago" className="text-xs">Central Time (CT)</SelectItem>
                        <SelectItem value="America/Denver" className="text-xs">Mountain Time (MT)</SelectItem>
                        <SelectItem value="America/Los_Angeles" className="text-xs">Pacific Time (PT)</SelectItem>
                        <SelectItem value="UTC" className="text-xs">UTC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="theme" className="text-xs">Theme</Label>
                    <Select value={theme} onValueChange={setTheme}>
                      <SelectTrigger id="theme" className="text-xs h-8">
                        <SelectValue placeholder="Select theme" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light" className="text-xs">
                          <div className="flex items-center">
                            <Sun className="mr-2 h-3.5 w-3.5" />
                            Light
                          </div>
                        </SelectItem>
                        <SelectItem value="dark" className="text-xs">
                          <div className="flex items-center">
                            <Moon className="mr-2 h-3.5 w-3.5" />
                            Dark
                          </div>
                        </SelectItem>
                        <SelectItem value="system" className="text-xs">
                          <div className="flex items-center">
                            <Globe className="mr-2 h-3.5 w-3.5" />
                            System
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  <div className="flex justify-end">
                    <Button
                      onClick={handleSaveProfile}
                      disabled={loading}
                      className="bg-[#ffc451] hover:bg-[#e6b048] text-black text-xs h-8 px-4"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-3 w-3" />
                          Save Preferences
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}