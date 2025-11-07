'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Users,
  Mail,
  Phone,
  Building2,
  Save,
  ArrowLeft,
  AlertCircle,
  Loader2,
  Bell,
  Star,
  Briefcase,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '@/lib/api/client'

export default function NewContactPage() {
  const router = useRouter()
  const params = useParams()
  const clientId = params.id as string

  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [clientName, setClientName] = useState('')
  const [formData, setFormData] = useState({
    prefix: '',
    firstName: '',
    middleName: '',
    lastName: '',
    suffix: '',
    jobTitle: '',
    department: '',
    role: '',
    primaryEmail: '',
    secondaryEmail: '',
    primaryPhone: '',
    mobilePhone: '',
    directPhone: '',
    workAddress: '',
    linkedin: '',
    twitter: '',
    status: 'active',
    type: 'primary',
    isPrimaryContact: false,
    decisionMakingLevel: '',
    influenceScore: '',
    notes: '',
  })

  useEffect(() => {
    loadClientInfo()
  }, [clientId])

  const loadClientInfo = async () => {
    try {
      const response = await api.get(`/clients/${clientId}`)
      const data = response.data || response
      setClientName(data.client?.companyName || 'Client')
    } catch (err) {
      console.error('Error loading client info:', err)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked
      setFormData(prev => ({ ...prev, [name]: checked }))
    } else {
      setFormData(prev => ({ ...prev, [name]: value }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setError('')

    try {
      const contactData = {
        clientId,
        personalInfo: {
          prefix: formData.prefix || undefined,
          firstName: formData.firstName,
          middleName: formData.middleName || undefined,
          lastName: formData.lastName,
          suffix: formData.suffix || undefined,
        },
        professionalInfo: {
          jobTitle: formData.jobTitle,
          department: formData.department || undefined,
          role: formData.role || undefined,
        },
        communicationChannels: {
          email: {
            primary: formData.primaryEmail,
            secondary: formData.secondaryEmail || undefined,
          },
          phone: {
            primary: formData.primaryPhone || undefined,
            mobile: formData.mobilePhone || undefined,
            direct: formData.directPhone || undefined,
          },
          address: {
            work: formData.workAddress || undefined,
          },
          socialMedia: {
            linkedin: formData.linkedin || undefined,
            twitter: formData.twitter || undefined,
          },
        },
        relationship: {
          status: formData.status,
          type: formData.type || undefined,
        },
        roleInfluence: {
          isPrimaryContact: formData.isPrimaryContact,
          decisionMakingLevel: formData.decisionMakingLevel || undefined,
          influenceScore: formData.influenceScore ? parseInt(formData.influenceScore) : undefined,
        },
        notes: formData.notes || undefined,
      }

      const response = await api.post('/contacts', contactData)
      const newContact = response.data?.contact || response.data

      toast.success('Contact created successfully!')
      router.push(`/dashboard/core-business/clients/${clientId}/contacts/${newContact._id}`)
    } catch (err: any) {
      console.error('Error creating contact:', err)
      const errorMessage = err.response?.data?.error?.message || err.message || 'Failed to create contact'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Logo href="/" showText={false} />
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Add New Contact</h1>
                <p className="text-xs text-gray-500">{clientName}</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => router.push(`/dashboard/core-business/clients/${clientId}/contacts`)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button variant="ghost" size="sm">
                <Bell className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            {/* Personal Information */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Users className="h-5 w-5 text-primary" />
                  <CardTitle>Personal Information</CardTitle>
                </div>
                <CardDescription>
                  Basic contact details and personal information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div>
                    <label htmlFor="prefix" className="block text-sm font-medium text-gray-700 mb-1">
                      Prefix
                    </label>
                    <select
                      id="prefix"
                      name="prefix"
                      value={formData.prefix}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                    >
                      <option value="">Select</option>
                      <option value="Mr">Mr</option>
                      <option value="Ms">Ms</option>
                      <option value="Mrs">Mrs</option>
                      <option value="Dr">Dr</option>
                      <option value="Prof">Prof</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                      First Name <span className="text-red-500">*</span>
                    </label>
                    <Input
                      id="firstName"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleInputChange}
                      required
                      placeholder="First name"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name <span className="text-red-500">*</span>
                    </label>
                    <Input
                      id="lastName"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleInputChange}
                      required
                      placeholder="Last name"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="middleName" className="block text-sm font-medium text-gray-700 mb-1">
                      Middle Name
                    </label>
                    <Input
                      id="middleName"
                      name="middleName"
                      value={formData.middleName}
                      onChange={handleInputChange}
                      placeholder="Middle name (optional)"
                    />
                  </div>

                  <div>
                    <label htmlFor="suffix" className="block text-sm font-medium text-gray-700 mb-1">
                      Suffix
                    </label>
                    <Input
                      id="suffix"
                      name="suffix"
                      value={formData.suffix}
                      onChange={handleInputChange}
                      placeholder="Jr., Sr., III, etc."
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Professional Information */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Briefcase className="h-5 w-5 text-primary" />
                  <CardTitle>Professional Information</CardTitle>
                </div>
                <CardDescription>
                  Job title, department, and role details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="jobTitle" className="block text-sm font-medium text-gray-700 mb-1">
                      Job Title <span className="text-red-500">*</span>
                    </label>
                    <Input
                      id="jobTitle"
                      name="jobTitle"
                      value={formData.jobTitle}
                      onChange={handleInputChange}
                      required
                      placeholder="e.g., Chief Technology Officer"
                    />
                  </div>

                  <div>
                    <label htmlFor="department" className="block text-sm font-medium text-gray-700 mb-1">
                      Department
                    </label>
                    <Input
                      id="department"
                      name="department"
                      value={formData.department}
                      onChange={handleInputChange}
                      placeholder="e.g., Engineering, Sales"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
                      Role Description
                    </label>
                    <Input
                      id="role"
                      name="role"
                      value={formData.role}
                      onChange={handleInputChange}
                      placeholder="Brief role description"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contact Information */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Mail className="h-5 w-5 text-primary" />
                  <CardTitle>Contact Information</CardTitle>
                </div>
                <CardDescription>
                  Email addresses and phone numbers
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="primaryEmail" className="block text-sm font-medium text-gray-700 mb-1">
                      Primary Email <span className="text-red-500">*</span>
                    </label>
                    <Input
                      id="primaryEmail"
                      name="primaryEmail"
                      type="email"
                      value={formData.primaryEmail}
                      onChange={handleInputChange}
                      required
                      placeholder="email@example.com"
                    />
                  </div>

                  <div>
                    <label htmlFor="secondaryEmail" className="block text-sm font-medium text-gray-700 mb-1">
                      Secondary Email
                    </label>
                    <Input
                      id="secondaryEmail"
                      name="secondaryEmail"
                      type="email"
                      value={formData.secondaryEmail}
                      onChange={handleInputChange}
                      placeholder="alternate@example.com"
                    />
                  </div>

                  <div>
                    <label htmlFor="primaryPhone" className="block text-sm font-medium text-gray-700 mb-1">
                      Primary Phone
                    </label>
                    <Input
                      id="primaryPhone"
                      name="primaryPhone"
                      type="tel"
                      value={formData.primaryPhone}
                      onChange={handleInputChange}
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>

                  <div>
                    <label htmlFor="mobilePhone" className="block text-sm font-medium text-gray-700 mb-1">
                      Mobile Phone
                    </label>
                    <Input
                      id="mobilePhone"
                      name="mobilePhone"
                      type="tel"
                      value={formData.mobilePhone}
                      onChange={handleInputChange}
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>

                  <div>
                    <label htmlFor="directPhone" className="block text-sm font-medium text-gray-700 mb-1">
                      Direct Line
                    </label>
                    <Input
                      id="directPhone"
                      name="directPhone"
                      type="tel"
                      value={formData.directPhone}
                      onChange={handleInputChange}
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>

                  <div>
                    <label htmlFor="workAddress" className="block text-sm font-medium text-gray-700 mb-1">
                      Work Address
                    </label>
                    <Input
                      id="workAddress"
                      name="workAddress"
                      value={formData.workAddress}
                      onChange={handleInputChange}
                      placeholder="Office location"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="linkedin" className="block text-sm font-medium text-gray-700 mb-1">
                      LinkedIn Profile
                    </label>
                    <Input
                      id="linkedin"
                      name="linkedin"
                      type="url"
                      value={formData.linkedin}
                      onChange={handleInputChange}
                      placeholder="https://linkedin.com/in/..."
                    />
                  </div>

                  <div>
                    <label htmlFor="twitter" className="block text-sm font-medium text-gray-700 mb-1">
                      Twitter Handle
                    </label>
                    <Input
                      id="twitter"
                      name="twitter"
                      value={formData.twitter}
                      onChange={handleInputChange}
                      placeholder="@username"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Relationship & Role */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  <CardTitle>Relationship & Role</CardTitle>
                </div>
                <CardDescription>
                  Contact status, type, and influence level
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                      Status
                    </label>
                    <select
                      id="status"
                      name="status"
                      value={formData.status}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="on_leave">On Leave</option>
                      <option value="left_company">Left Company</option>
                      <option value="do_not_contact">Do Not Contact</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
                      Contact Type
                    </label>
                    <select
                      id="type"
                      name="type"
                      value={formData.type}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                    >
                      <option value="primary">Primary</option>
                      <option value="secondary">Secondary</option>
                      <option value="technical">Technical</option>
                      <option value="billing">Billing</option>
                      <option value="legal">Legal</option>
                      <option value="emergency">Emergency</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="decisionMakingLevel" className="block text-sm font-medium text-gray-700 mb-1">
                      Decision Making Level
                    </label>
                    <select
                      id="decisionMakingLevel"
                      name="decisionMakingLevel"
                      value={formData.decisionMakingLevel}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                    >
                      <option value="">Select level</option>
                      <option value="executive">Executive</option>
                      <option value="primary">Primary</option>
                      <option value="secondary">Secondary</option>
                      <option value="influencer">Influencer</option>
                      <option value="none">None</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="influenceScore" className="block text-sm font-medium text-gray-700 mb-1">
                      Influence Score (0-100)
                    </label>
                    <Input
                      id="influenceScore"
                      name="influenceScore"
                      type="number"
                      value={formData.influenceScore}
                      onChange={handleInputChange}
                      min="0"
                      max="100"
                      placeholder="0-100"
                    />
                  </div>

                  <div className="flex items-center space-x-2 pt-6">
                    <input
                      type="checkbox"
                      id="isPrimaryContact"
                      name="isPrimaryContact"
                      checked={formData.isPrimaryContact}
                      onChange={handleInputChange}
                      className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-2 focus:ring-primary"
                    />
                    <label htmlFor="isPrimaryContact" className="text-sm text-gray-700 flex items-center">
                      <Star className="h-4 w-4 text-primary mr-1" />
                      Mark as Primary Contact
                    </label>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader>
                <CardTitle>Additional Notes</CardTitle>
                <CardDescription>
                  Any additional information about this contact
                </CardDescription>
              </CardHeader>
              <CardContent>
                <textarea
                  id="notes"
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-primary resize-none"
                  placeholder="Add any relevant notes or observations..."
                />
              </CardContent>
            </Card>

            {/* Error Display */}
            {error && (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="pt-6">
                  <div className="flex items-center space-x-3 text-red-800">
                    <AlertCircle className="h-5 w-5" />
                    <p className="text-sm">{error}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-4 pb-8">
              <Button 
                type="button"
                variant="outline"
                onClick={() => router.push(`/dashboard/core-business/clients/${clientId}/contacts`)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Cancel
              </Button>

              <Button 
                type="submit"
                disabled={isSaving}
                className="bg-primary text-black hover:bg-primary-600 font-semibold"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating Contact...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Create Contact
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </main>
    </div>
  )
}