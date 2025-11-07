'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Users,
  Mail,
  Phone,
  Building2,
  ArrowLeft,
  Edit,
  Trash2,
  MessageSquare,
  Calendar,
  Bell,
  Loader2,
  AlertCircle,
  Star,
  MapPin,
  Briefcase,
  Globe,
  Linkedin,
  Twitter,
  Activity,
  TrendingUp,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '@/lib/api/client'

interface Contact {
  _id: string
  contactId: string
  clientId: string
  personalInfo: {
    prefix?: string
    firstName: string
    middleName?: string
    lastName: string
    suffix?: string
  }
  professionalInfo: {
    jobTitle: string
    department?: string
    role?: string
  }
  communicationChannels: {
    email: {
      primary: string
      secondary?: string
    }
    phone: {
      primary?: string
      mobile?: string
      direct?: string
    }
    address?: {
      work?: string
    }
    socialMedia?: {
      linkedin?: string
      twitter?: string
    }
  }
  relationship: {
    status: string
    type?: string
    lastInteraction?: {
      date: string
      type: string
    }
  }
  roleInfluence: {
    isPrimaryContact: boolean
    decisionMakingLevel?: string
    influenceScore?: number
  }
  createdAt: string
  updatedAt: string
}

export default function ViewContactPage() {
  const router = useRouter()
  const params = useParams()
  const clientId = params.id as string
  const contactId = params.contactId as string

  const [contact, setContact] = useState<Contact | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [clientName, setClientName] = useState('')

  useEffect(() => {
    loadContact()
    loadClientInfo()
  }, [contactId])

  const loadClientInfo = async () => {
    try {
      const response = await api.get(`/clients/${clientId}`)
      const data = response.data || response
      setClientName(data.client?.companyName || 'Client')
    } catch (err) {
      console.error('Error loading client info:', err)
    }
  }

  const loadContact = async () => {
    setIsLoading(true)
    setError('')

    try {
      const response = await api.get(`/contacts/${contactId}`)
      const data = response.data || response
      
      if (data.contact) {
        setContact(data.contact)
      } else {
        throw new Error('Contact not found')
      }
    } catch (err: any) {
      console.error('Error loading contact:', err)
      setError(err.response?.data?.error?.message || err.message || 'Failed to load contact')
      toast.error('Failed to load contact')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteContact = async () => {
    if (!confirm('Are you sure you want to delete this contact? This action cannot be undone.')) return

    try {
      await api.delete(`/contacts/${contactId}`)
      toast.success('Contact deleted successfully')
      router.push(`/dashboard/core-business/clients/${clientId}/contacts`)
    } catch (err: any) {
      console.error('Error deleting contact:', err)
      toast.error(err.response?.data?.error?.message || 'Failed to delete contact')
    }
  }

  const getStatusBadge = (status: string) => {
    const statusColors: { [key: string]: string } = {
      active: 'bg-green-100 text-green-800 border-green-200',
      inactive: 'bg-gray-100 text-gray-800 border-gray-200',
      left_company: 'bg-red-100 text-red-800 border-red-200',
      on_leave: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      do_not_contact: 'bg-red-100 text-red-800 border-red-200',
    }

    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${statusColors[status] || statusColors.active}`}>
        {status.replace(/_/g, ' ').toUpperCase()}
      </span>
    )
  }

  const getFullName = (contact: Contact) => {
    const { prefix, firstName, middleName, lastName, suffix } = contact.personalInfo
    return [prefix, firstName, middleName, lastName, suffix].filter(Boolean).join(' ')
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-sm text-gray-600">Loading contact details...</p>
        </div>
      </div>
    )
  }

  if (error || !contact) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <Logo href="/" showText={false} />
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => router.push(`/dashboard/core-business/clients/${clientId}/contacts`)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </div>
          </div>
        </header>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-3 text-red-800">
                <AlertCircle className="h-5 w-5" />
                <div>
                  <p className="font-medium">Error Loading Contact</p>
                  <p className="text-sm">{error}</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => router.push(`/dashboard/core-business/clients/${clientId}/contacts`)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Contacts
              </Button>
            </CardContent>
          </Card>
        </div>
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
              <Logo href="/" showText={false} />
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Contact Profile</h1>
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
                Back to Contacts
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
        {/* Contact Header */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start space-x-4">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                  <Users className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <div className="flex items-center space-x-2 mb-2">
                    <h2 className="text-2xl font-bold text-gray-900">{getFullName(contact)}</h2>
                    {contact.roleInfluence.isPrimaryContact && (
                      <Star className="h-5 w-5 text-primary fill-primary" />
                    )}
                  </div>
                  <p className="text-gray-600 mb-2">{contact.professionalInfo.jobTitle}</p>
                  {contact.professionalInfo.department && (
                    <p className="text-sm text-gray-500">
                      {contact.professionalInfo.department}
                    </p>
                  )}
                  <div className="mt-3">
                    {getStatusBadge(contact.relationship.status)}
                  </div>
                </div>
              </div>

              <div className="flex space-x-2">
                <Link href={`/dashboard/core-business/clients/${clientId}/contacts/${contactId}/edit`}>
                  <Button size="sm" className="bg-primary text-black hover:bg-primary-600">
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                </Link>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={handleDeleteContact}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-3 pt-4 border-t">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.location.href = `mailto:${contact.communicationChannels.email.primary}`}
              >
                <Mail className="h-4 w-4 mr-2" />
                Send Email
              </Button>
              {contact.communicationChannels.phone.primary && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => window.location.href = `tel:${contact.communicationChannels.phone.primary}`}
                >
                  <Phone className="h-4 w-4 mr-2" />
                  Call
                </Button>
              )}
              <Button variant="outline" size="sm">
                <Calendar className="h-4 w-4 mr-2" />
                Schedule Meeting
              </Button>
              <Button variant="outline" size="sm">
                <MessageSquare className="h-4 w-4 mr-2" />
                Add Note
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Contact Information */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Mail className="h-5 w-5 text-primary" />
                  <CardTitle>Contact Information</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Email Addresses */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Email Addresses</h4>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Mail className="h-4 w-4 text-gray-400" />
                      <a 
                        href={`mailto:${contact.communicationChannels.email.primary}`}
                        className="text-sm text-primary hover:underline"
                      >
                        {contact.communicationChannels.email.primary}
                      </a>
                      <span className="text-xs text-gray-500">(Primary)</span>
                    </div>
                    {contact.communicationChannels.email.secondary && (
                      <div className="flex items-center space-x-2">
                        <Mail className="h-4 w-4 text-gray-400" />
                        <a 
                          href={`mailto:${contact.communicationChannels.email.secondary}`}
                          className="text-sm text-primary hover:underline"
                        >
                          {contact.communicationChannels.email.secondary}
                        </a>
                        <span className="text-xs text-gray-500">(Secondary)</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Phone Numbers */}
                {(contact.communicationChannels.phone.primary || 
                  contact.communicationChannels.phone.mobile || 
                  contact.communicationChannels.phone.direct) && (
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Phone Numbers</h4>
                    <div className="space-y-2">
                      {contact.communicationChannels.phone.primary && (
                        <div className="flex items-center space-x-2">
                          <Phone className="h-4 w-4 text-gray-400" />
                          <a 
                            href={`tel:${contact.communicationChannels.phone.primary}`}
                            className="text-sm text-primary hover:underline"
                          >
                            {contact.communicationChannels.phone.primary}
                          </a>
                          <span className="text-xs text-gray-500">(Primary)</span>
                        </div>
                      )}
                      {contact.communicationChannels.phone.mobile && (
                        <div className="flex items-center space-x-2">
                          <Phone className="h-4 w-4 text-gray-400" />
                          <a 
                            href={`tel:${contact.communicationChannels.phone.mobile}`}
                            className="text-sm text-primary hover:underline"
                          >
                            {contact.communicationChannels.phone.mobile}
                          </a>
                          <span className="text-xs text-gray-500">(Mobile)</span>
                        </div>
                      )}
                      {contact.communicationChannels.phone.direct && (
                        <div className="flex items-center space-x-2">
                          <Phone className="h-4 w-4 text-gray-400" />
                          <a 
                            href={`tel:${contact.communicationChannels.phone.direct}`}
                            className="text-sm text-primary hover:underline"
                          >
                            {contact.communicationChannels.phone.direct}
                          </a>
                          <span className="text-xs text-gray-500">(Direct)</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Work Address */}
                {contact.communicationChannels.address?.work && (
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Work Address</h4>
                    <div className="flex items-start space-x-2">
                      <MapPin className="h-4 w-4 text-gray-400 mt-1" />
                      <p className="text-sm text-gray-600">
                        {contact.communicationChannels.address.work}
                      </p>
                    </div>
                  </div>
                )}

                {/* Social Media */}
                {(contact.communicationChannels.socialMedia?.linkedin || 
                  contact.communicationChannels.socialMedia?.twitter) && (
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Social Media</h4>
                    <div className="space-y-2">
                      {contact.communicationChannels.socialMedia.linkedin && (
                        <div className="flex items-center space-x-2">
                          <Linkedin className="h-4 w-4 text-gray-400" />
                          <a 
                            href={contact.communicationChannels.socialMedia.linkedin}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline"
                          >
                            LinkedIn Profile
                          </a>
                        </div>
                      )}
                      {contact.communicationChannels.socialMedia.twitter && (
                        <div className="flex items-center space-x-2">
                          <Twitter className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-600">
                            {contact.communicationChannels.socialMedia.twitter}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Professional Details */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Briefcase className="h-5 w-5 text-primary" />
                  <CardTitle>Professional Details</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Job Title</p>
                    <p className="text-sm font-medium text-gray-900">
                      {contact.professionalInfo.jobTitle}
                    </p>
                  </div>
                  {contact.professionalInfo.department && (
                    <div>
                      <p className="text-sm text-gray-500">Department</p>
                      <p className="text-sm font-medium text-gray-900">
                        {contact.professionalInfo.department}
                      </p>
                    </div>
                  )}
                  {contact.relationship.type && (
                    <div>
                      <p className="text-sm text-gray-500">Contact Type</p>
                      <p className="text-sm font-medium text-gray-900 capitalize">
                        {contact.relationship.type}
                      </p>
                    </div>
                  )}
                  {contact.roleInfluence.decisionMakingLevel && (
                    <div>
                      <p className="text-sm text-gray-500">Decision Making Level</p>
                      <p className="text-sm font-medium text-gray-900 capitalize">
                        {contact.roleInfluence.decisionMakingLevel.replace(/_/g, ' ')}
                      </p>
                    </div>
                  )}
                </div>

                {contact.professionalInfo.role && (
                  <div className="pt-3 border-t">
                    <p className="text-sm text-gray-500 mb-1">Role Description</p>
                    <p className="text-sm text-gray-700">{contact.professionalInfo.role}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Influence & Role */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <CardTitle>Influence & Role</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {contact.roleInfluence.isPrimaryContact && (
                  <div className="flex items-center space-x-2 p-3 bg-primary/10 rounded-lg">
                    <Star className="h-5 w-5 text-primary fill-primary" />
                    <span className="text-sm font-medium text-gray-900">Primary Contact</span>
                  </div>
                )}

                {contact.roleInfluence.influenceScore !== undefined && (
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-gray-500">Influence Score</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {contact.roleInfluence.influenceScore}/100
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-primary rounded-full h-2"
                        style={{ width: `${contact.roleInfluence.influenceScore}%` }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Activity Summary */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Activity className="h-5 w-5 text-primary" />
                  <CardTitle>Activity Summary</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Created</span>
                  <span className="text-sm font-medium text-gray-900">
                    {formatDate(contact.createdAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Last Updated</span>
                  <span className="text-sm font-medium text-gray-900">
                    {formatDate(contact.updatedAt)}
                  </span>
                </div>
                {contact.relationship.lastInteraction && (
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-600">Last Interaction</span>
                    <span className="text-sm font-medium text-gray-900">
                      {formatDate(contact.relationship.lastInteraction.date)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Contact ID */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Contact ID</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs font-mono text-gray-500">{contact.contactId}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}