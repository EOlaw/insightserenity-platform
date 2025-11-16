'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
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
  Bell,
  Loader2,
  AlertCircle,
  Star,
  MapPin,
  Briefcase,
  Linkedin,
  Twitter,
  Activity,
  MessageSquare,
  Clock,
  User,
  Award,
  GraduationCap,
  Target,
  TrendingUp,
  Calendar,
  Hash,
  Globe,
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
  Tag,
  Layers,
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
    nickname?: string
    pronouns?: string
    languages?: Array<{
      language: string
      proficiency: string
      isPrimary: boolean
    }>
  }
  professionalInfo: {
    jobTitle: string
    department?: string
    division?: string
    seniority?: string
    responsibilities?: string[]
    specializations?: string[]
    certifications?: Array<{
      name: string
      issuingOrganization: string
      issueDate: string
      expiryDate?: string
    }>
    education?: Array<{
      degree: string
      field: string
      institution: string
      graduationYear: number
    }>
  }
  contactDetails: {
    emails?: Array<{
      address: string
      type: string
      isPrimary: boolean
      isVerified: boolean
    }>
    phones?: Array<{
      number: string
      type: string
      isPrimary: boolean
      extension?: string
      canText: boolean
    }>
    addresses?: Array<{
      type: string
      street1?: string
      street2?: string
      city?: string
      state?: string
      postalCode?: string
      country?: string
      isPrimary: boolean
    }>
    socialProfiles?: Array<{
      platform: string
      url?: string
      handle?: string
      verified: boolean
    }>
    instantMessaging?: Array<{
      platform: string
      identifier: string
      isPrimary: boolean
    }>
    website?: string
    assistantInfo?: {
      name: string
      email: string
      phone: string
    }
  }
  roleInfluence: {
    isPrimaryContact: boolean
    isBillingContact: boolean
    isTechnicalContact: boolean
    isDecisionMaker: boolean
    decisionAuthority?: string
    influence?: {
      level: string
      score: number
    }
    stakeholderType?: string
    buyingRole?: string
    engagementLevel?: string
  }
  relationship: {
    status: string
    type?: string
    strength?: {
      score: number
      level: string
    }
    lastInteraction?: {
      date: string
      type: string
      outcome: string
    }
    relationshipOwner?: string
  }
  interactions?: Array<{
    date: string
    type: string
    outcome: string
    notes: string
  }>
  scoring?: {
    engagementScore?: {
      score: number
      lastCalculated: string
    }
    leadScore?: {
      score: number
      trend: string
    }
    influenceScore?: {
      overall: number
    }
  }
  tags?: string[]
  categories?: string[]
  notes?: Array<{
    content: string
    type: string
    createdAt: string
    createdBy: string
  }>
  createdAt: string
  updatedAt: string
}

export default function ContactDetailPage() {
  const router = useRouter()
  const params = useParams()
  const clientId = params.id as string
  const contactId = params.contactId as string

  const [contact, setContact] = useState<Contact | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [clientName, setClientName] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'professional' | 'activity' | 'notes'>('overview')

  useEffect(() => {
    if (contactId) {
      loadContact()
      loadClientInfo()
    }
  }, [contactId])

  const loadContact = async () => {
    setIsLoading(true)
    setError('')

    try {
      const response = await api.get(`/clients/contacts/${contactId}`)
      const data = response.data || response

      if (data) {
        setContact(data)
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

  const loadClientInfo = async () => {
    try {
      const response = await api.get(`/clients/${clientId}`)
      const data = response.data || response
      setClientName(data.client?.companyName || data.companyName || 'Client')
    } catch (err) {
      console.error('Error loading client info:', err)
    }
  }

  const handleDeleteContact = async () => {
    if (!confirm('Are you sure you want to delete this contact? This action cannot be undone.')) {
      return
    }

    try {
      await api.delete(`/clients/contacts/${contactId}`)
      toast.success('Contact deleted successfully')
      router.push(`/dashboard/core-business/clients/${clientId}/contacts`)
    } catch (err: any) {
      console.error('Error deleting contact:', err)
      toast.error(err.response?.data?.error?.message || 'Failed to delete contact')
    }
  }

  const getContactName = () => {
    if (!contact) return ''
    const { prefix, firstName, middleName, lastName, suffix } = contact.personalInfo
    return [prefix, firstName, middleName, lastName, suffix].filter(Boolean).join(' ')
  }

  const getStatusBadge = (status: string) => {
    const statusConfig: { [key: string]: { color: string; icon: any } } = {
      active: { color: 'bg-green-50 text-green-700 border-green-200', icon: CheckCircle },
      inactive: { color: 'bg-gray-50 text-gray-600 border-gray-200', icon: XCircle },
      left_company: { color: 'bg-amber-50 text-amber-700 border-amber-200', icon: AlertTriangle },
      on_leave: { color: 'bg-blue-50 text-blue-700 border-blue-200', icon: Clock },
      do_not_contact: { color: 'bg-red-50 text-red-700 border-red-200', icon: XCircle },
    }
    return statusConfig[status] || statusConfig.active
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto mb-2" />
          <p className="text-xs text-gray-600">Loading contact details...</p>
        </div>
      </div>
    )
  }

  if (error || !contact) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-14">
              <div className="flex items-center space-x-3">
                <Logo href="/" showText={false} />
                <div>
                  <h1 className="text-sm font-semibold text-gray-900">Contact Details</h1>
                  <p className="text-xs text-gray-500">{clientName}</p>
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => router.push(`/dashboard/core-business/clients/contacts`)}
              >
                <ArrowLeft className="h-3 w-3 mr-1.5" />
                <span className="text-xs">Back</span>
              </Button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center text-red-800">
                <AlertCircle className="h-4 w-4 mr-2" />
                <div>
                  <p className="text-xs font-medium">Error Loading Contact</p>
                  <p className="text-xs mt-0.5 text-red-600">{error || 'Contact not found'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  const statusBadge = getStatusBadge(contact.relationship.status)
  const StatusIcon = statusBadge.icon

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14">
            <div className="flex items-center space-x-3">
              <Logo href="/" showText={false} />
              <div>
                <h1 className="text-sm font-semibold text-gray-900">Contact Details</h1>
                <p className="text-xs text-gray-500">{clientName}</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => router.push(`/dashboard/core-business/clients/contacts`)}
              >
                <ArrowLeft className="h-3 w-3 mr-1.5" />
                <span className="text-xs">Back</span>
              </Button>
              <Button variant="ghost" size="sm">
                <Bell className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
        {/* Contact Header Card */}
        <Card className="mb-5 border-primary/20 shadow-sm">
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3">
                <div className="w-14 h-14 bg-gradient-to-br from-primary/20 to-primary/10 rounded-lg flex items-center justify-center">
                  <User className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <h2 className="text-lg font-bold text-gray-900">
                      {getContactName()}
                    </h2>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${statusBadge.color}`}>
                      <StatusIcon className="h-2.5 w-2.5 mr-1" />
                      {contact.relationship.status.replace(/_/g, ' ').toUpperCase()}
                    </span>
                    {contact.roleInfluence.isPrimaryContact && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border bg-blue-50 text-blue-700 border-blue-200">
                        <Star className="h-2.5 w-2.5 mr-1" />
                        PRIMARY
                      </span>
                    )}
                    {contact.roleInfluence.isDecisionMaker && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border bg-purple-50 text-purple-700 border-purple-200">
                        <Target className="h-2.5 w-2.5 mr-1" />
                        DECISION MAKER
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 mb-0.5 font-medium">
                    {contact.professionalInfo.jobTitle}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {contact.professionalInfo.department && (
                      <>
                        <span>{contact.professionalInfo.department}</span>
                        {contact.professionalInfo.division && <span>•</span>}
                      </>
                    )}
                    {contact.professionalInfo.division && (
                      <span>{contact.professionalInfo.division}</span>
                    )}
                    {contact.professionalInfo.seniority && (
                      <>
                        <span>•</span>
                        <span className="capitalize">{contact.professionalInfo.seniority.replace(/_/g, ' ')}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/dashboard/core-business/clients/${clientId}/contacts/${contactId}/edit`)}
                >
                  <Edit className="h-3 w-3 mr-1.5" />
                  <span className="text-xs">Edit</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeleteContact}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-3 w-3 mr-1.5" />
                  <span className="text-xs">Delete</span>
                </Button>
              </div>
            </div>

            {/* Tags and Categories */}
            {(contact.tags?.length || contact.categories?.length) && (
              <div className="mt-3 pt-3 border-t flex items-center gap-2 flex-wrap">
                {contact.tags?.map((tag, index) => (
                  <span key={index} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">
                    <Tag className="h-2.5 w-2.5 mr-1" />
                    {tag}
                  </span>
                ))}
                {contact.categories?.map((category, index) => (
                  <span key={index} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary font-medium">
                    <Layers className="h-2.5 w-2.5 mr-1" />
                    {category.replace(/_/g, ' ').toUpperCase()}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tab Navigation */}
        <div className="mb-5 bg-white rounded-lg border shadow-sm">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2.5 text-xs font-medium transition-colors ${
                activeTab === 'overview'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Users className="h-3.5 w-3.5 inline mr-1.5" />
              Overview
            </button>
            <button
              onClick={() => setActiveTab('professional')}
              className={`px-4 py-2.5 text-xs font-medium transition-colors ${
                activeTab === 'professional'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Briefcase className="h-3.5 w-3.5 inline mr-1.5" />
              Professional
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              className={`px-4 py-2.5 text-xs font-medium transition-colors ${
                activeTab === 'activity'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Activity className="h-3.5 w-3.5 inline mr-1.5" />
              Activity
            </button>
            <button
              onClick={() => setActiveTab('notes')}
              className={`px-4 py-2.5 text-xs font-medium transition-colors ${
                activeTab === 'notes'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <FileText className="h-3.5 w-3.5 inline mr-1.5" />
              Notes
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-5">
            {activeTab === 'overview' && (
              <>
                {/* Contact Information */}
                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center">
                      <Mail className="h-4 w-4 mr-2 text-primary" />
                      Contact Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Emails */}
                    {contact.contactDetails.emails && contact.contactDetails.emails.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-700 mb-2">Email Addresses</p>
                        <div className="space-y-1.5">
                          {contact.contactDetails.emails.map((email, index) => (
                            <div key={index} className="flex items-center justify-between p-2 rounded-md bg-gray-50 hover:bg-gray-100 transition-colors">
                              <div className="flex items-center space-x-2 flex-1 min-w-0">
                                <Mail className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <a href={`mailto:${email.address}`} className="text-xs text-primary hover:underline truncate block">
                                    {email.address}
                                  </a>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                                <span className="text-xs text-gray-500 capitalize">{email.type}</span>
                                {email.isPrimary && (
                                  <span className="px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700 font-medium">Primary</span>
                                )}
                                {email.isVerified && (
                                  <CheckCircle className="h-3 w-3 text-green-600" />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Phones */}
                    {contact.contactDetails.phones && contact.contactDetails.phones.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-700 mb-2">Phone Numbers</p>
                        <div className="space-y-1.5">
                          {contact.contactDetails.phones.map((phone, index) => (
                            <div key={index} className="flex items-center justify-between p-2 rounded-md bg-gray-50 hover:bg-gray-100 transition-colors">
                              <div className="flex items-center space-x-2 flex-1">
                                <Phone className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                                <div className="flex-1">
                                  <a href={`tel:${phone.number}`} className="text-xs text-primary hover:underline">
                                    {phone.number}
                                    {phone.extension && <span className="text-gray-500"> ext. {phone.extension}</span>}
                                  </a>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                                <span className="text-xs text-gray-500 capitalize">{phone.type}</span>
                                {phone.isPrimary && (
                                  <span className="px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700 font-medium">Primary</span>
                                )}
                                {phone.canText && (
                                  <MessageSquare className="h-3 w-3 text-green-600" />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Addresses */}
                    {contact.contactDetails.addresses && contact.contactDetails.addresses.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-700 mb-2">Addresses</p>
                        <div className="space-y-2">
                          {contact.contactDetails.addresses.map((address, index) => (
                            <div key={index} className="flex items-start space-x-2 p-2 rounded-md bg-gray-50">
                              <MapPin className="h-3.5 w-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs text-gray-500 capitalize">{address.type}</span>
                                  {address.isPrimary && (
                                    <span className="px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700 font-medium">Primary</span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-900">
                                  {address.street1}
                                  {address.street2 && <><br />{address.street2}</>}
                                </p>
                                <p className="text-xs text-gray-900">
                                  {[address.city, address.state, address.postalCode].filter(Boolean).join(', ')}
                                </p>
                                {address.country && (
                                  <p className="text-xs text-gray-500">{address.country}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Social Profiles */}
                    {contact.contactDetails.socialProfiles && contact.contactDetails.socialProfiles.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-700 mb-2">Social Profiles</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {contact.contactDetails.socialProfiles.map((profile, index) => {
                            const icons: { [key: string]: any } = {
                              linkedin: Linkedin,
                              twitter: Twitter,
                              facebook: Users,
                              instagram: Users,
                              github: Globe,
                            }
                            const Icon = icons[profile.platform] || Globe
                            return (
                              <div key={index} className="flex items-center space-x-2 p-2 rounded-md bg-gray-50 hover:bg-gray-100 transition-colors">
                                <Icon className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <a 
                                    href={profile.url || `https://${profile.platform}.com/${profile.handle?.replace('@', '')}`} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-xs text-primary hover:underline truncate block"
                                  >
                                    {profile.handle || profile.url || profile.platform}
                                  </a>
                                </div>
                                {profile.verified && (
                                  <CheckCircle className="h-3 w-3 text-blue-600 flex-shrink-0" />
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Instant Messaging */}
                    {contact.contactDetails.instantMessaging && contact.contactDetails.instantMessaging.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-700 mb-2">Instant Messaging</p>
                        <div className="space-y-1.5">
                          {contact.contactDetails.instantMessaging.map((im, index) => (
                            <div key={index} className="flex items-center justify-between p-2 rounded-md bg-gray-50">
                              <div className="flex items-center space-x-2">
                                <MessageSquare className="h-3.5 w-3.5 text-gray-400" />
                                <span className="text-xs text-gray-900">{im.identifier}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-gray-500 capitalize">{im.platform}</span>
                                {im.isPrimary && (
                                  <span className="px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700 font-medium">Primary</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Website */}
                    {contact.contactDetails.website && (
                      <div>
                        <p className="text-xs font-semibold text-gray-700 mb-2">Website</p>
                        <div className="flex items-center space-x-2 p-2 rounded-md bg-gray-50">
                          <Globe className="h-3.5 w-3.5 text-gray-400" />
                          <a 
                            href={contact.contactDetails.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline"
                          >
                            {contact.contactDetails.website}
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Assistant Info */}
                    {contact.contactDetails.assistantInfo && (
                      <div>
                        <p className="text-xs font-semibold text-gray-700 mb-2">Assistant Information</p>
                        <div className="p-2 rounded-md bg-gray-50 space-y-1">
                          <p className="text-xs text-gray-900 font-medium">{contact.contactDetails.assistantInfo.name}</p>
                          {contact.contactDetails.assistantInfo.email && (
                            <p className="text-xs text-gray-600">{contact.contactDetails.assistantInfo.email}</p>
                          )}
                          {contact.contactDetails.assistantInfo.phone && (
                            <p className="text-xs text-gray-600">{contact.contactDetails.assistantInfo.phone}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Personal Information */}
                {(contact.personalInfo.nickname || contact.personalInfo.pronouns || contact.personalInfo.languages?.length) && (
                  <Card className="shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center">
                        <User className="h-4 w-4 mr-2 text-primary" />
                        Personal Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {contact.personalInfo.nickname && (
                        <div className="flex items-center justify-between p-2 rounded-md bg-gray-50">
                          <span className="text-xs text-gray-600">Nickname</span>
                          <span className="text-xs text-gray-900 font-medium">{contact.personalInfo.nickname}</span>
                        </div>
                      )}
                      {contact.personalInfo.pronouns && (
                        <div className="flex items-center justify-between p-2 rounded-md bg-gray-50">
                          <span className="text-xs text-gray-600">Pronouns</span>
                          <span className="text-xs text-gray-900 font-medium">{contact.personalInfo.pronouns}</span>
                        </div>
                      )}
                      {contact.personalInfo.languages && contact.personalInfo.languages.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-700 mb-2">Languages</p>
                          <div className="space-y-1">
                            {contact.personalInfo.languages.map((lang, index) => (
                              <div key={index} className="flex items-center justify-between p-2 rounded-md bg-gray-50">
                                <span className="text-xs text-gray-900">{lang.language}</span>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-gray-600 capitalize">{lang.proficiency}</span>
                                  {lang.isPrimary && (
                                    <span className="px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700 font-medium">Primary</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {activeTab === 'professional' && (
              <>
                {/* Education */}
                {contact.professionalInfo.education && contact.professionalInfo.education.length > 0 && (
                  <Card className="shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center">
                        <GraduationCap className="h-4 w-4 mr-2 text-primary" />
                        Education
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {contact.professionalInfo.education.map((edu, index) => (
                          <div key={index} className="p-2.5 rounded-md bg-gray-50 border-l-2 border-primary">
                            <p className="text-xs font-semibold text-gray-900">{edu.degree} in {edu.field}</p>
                            <p className="text-xs text-gray-600">{edu.institution}</p>
                            <p className="text-xs text-gray-500">Graduated {edu.graduationYear}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Certifications */}
                {contact.professionalInfo.certifications && contact.professionalInfo.certifications.length > 0 && (
                  <Card className="shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center">
                        <Award className="h-4 w-4 mr-2 text-primary" />
                        Certifications
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {contact.professionalInfo.certifications.map((cert, index) => (
                          <div key={index} className="p-2.5 rounded-md bg-gray-50">
                            <p className="text-xs font-semibold text-gray-900">{cert.name}</p>
                            <p className="text-xs text-gray-600">{cert.issuingOrganization}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-gray-500">Issued {formatDate(cert.issueDate)}</span>
                              {cert.expiryDate && (
                                <>
                                  <span className="text-gray-400">•</span>
                                  <span className="text-xs text-gray-500">Expires {formatDate(cert.expiryDate)}</span>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Responsibilities */}
                {contact.professionalInfo.responsibilities && contact.professionalInfo.responsibilities.length > 0 && (
                  <Card className="shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center">
                        <Briefcase className="h-4 w-4 mr-2 text-primary" />
                        Responsibilities
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-1.5">
                        {contact.professionalInfo.responsibilities.map((resp, index) => (
                          <li key={index} className="flex items-start space-x-2 text-xs text-gray-700">
                            <span className="text-primary mt-0.5">•</span>
                            <span>{resp}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* Specializations */}
                {contact.professionalInfo.specializations && contact.professionalInfo.specializations.length > 0 && (
                  <Card className="shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center">
                        <Target className="h-4 w-4 mr-2 text-primary" />
                        Specializations
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-1.5">
                        {contact.professionalInfo.specializations.map((spec, index) => (
                          <span key={index} className="px-2 py-1 rounded-md bg-primary/10 text-xs text-primary font-medium">
                            {spec}
                          </span>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {activeTab === 'activity' && (
              <>
                {/* Recent Interactions */}
                {contact.interactions && contact.interactions.length > 0 && (
                  <Card className="shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center">
                        <Activity className="h-4 w-4 mr-2 text-primary" />
                        Recent Interactions
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {contact.interactions.slice(0, 10).map((interaction, index) => (
                          <div key={index} className="p-2.5 rounded-md bg-gray-50 border-l-2 border-primary/50">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold text-gray-900 capitalize">{interaction.type}</span>
                              <span className="text-xs text-gray-500">{formatDateTime(interaction.date)}</span>
                            </div>
                            {interaction.outcome && (
                              <span className={`inline-block px-1.5 py-0.5 rounded text-xs mb-1 ${
                                interaction.outcome === 'successful' ? 'bg-green-100 text-green-700' :
                                interaction.outcome === 'follow_up_required' ? 'bg-amber-100 text-amber-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {interaction.outcome.replace(/_/g, ' ')}
                              </span>
                            )}
                            {interaction.notes && (
                              <p className="text-xs text-gray-600 mt-1">{interaction.notes}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Last Interaction */}
                {contact.relationship.lastInteraction && (
                  <Card className="shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center">
                        <Clock className="h-4 w-4 mr-2 text-primary" />
                        Last Interaction
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="p-2.5 rounded-md bg-gray-50">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-gray-900 capitalize">
                            {contact.relationship.lastInteraction.type}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatDateTime(contact.relationship.lastInteraction.date)}
                          </span>
                        </div>
                        {contact.relationship.lastInteraction.outcome && (
                          <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700 mb-1">
                            {contact.relationship.lastInteraction.outcome}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {activeTab === 'notes' && (
              <>
                {contact.notes && contact.notes.length > 0 ? (
                  <Card className="shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center">
                        <FileText className="h-4 w-4 mr-2 text-primary" />
                        Contact Notes
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {contact.notes.map((note, index) => (
                          <div key={index} className="p-2.5 rounded-md bg-gray-50 border-l-2 border-primary/50">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                note.type === 'warning' ? 'bg-red-100 text-red-700' :
                                note.type === 'opportunity' ? 'bg-green-100 text-green-700' :
                                note.type === 'strategic' ? 'bg-purple-100 text-purple-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {note.type}
                              </span>
                              <span className="text-xs text-gray-500">{formatDateTime(note.createdAt)}</span>
                            </div>
                            <p className="text-xs text-gray-900 leading-relaxed">{note.content}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="shadow-sm">
                    <CardContent className="pt-6">
                      <div className="text-center py-6">
                        <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-xs text-gray-500">No notes available</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            {/* Role & Influence */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center">
                  <Target className="h-4 w-4 mr-2 text-primary" />
                  Role & Influence
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {contact.roleInfluence.stakeholderType && (
                  <div className="flex items-center justify-between p-2 rounded-md bg-gray-50">
                    <span className="text-xs text-gray-600">Stakeholder Type</span>
                    <span className="text-xs text-gray-900 font-medium capitalize">
                      {contact.roleInfluence.stakeholderType.replace(/_/g, ' ')}
                    </span>
                  </div>
                )}
                {contact.roleInfluence.buyingRole && (
                  <div className="flex items-center justify-between p-2 rounded-md bg-gray-50">
                    <span className="text-xs text-gray-600">Buying Role</span>
                    <span className="text-xs text-gray-900 font-medium capitalize">
                      {contact.roleInfluence.buyingRole.replace(/_/g, ' ')}
                    </span>
                  </div>
                )}
                {contact.roleInfluence.decisionAuthority && (
                  <div className="flex items-center justify-between p-2 rounded-md bg-gray-50">
                    <span className="text-xs text-gray-600">Decision Authority</span>
                    <span className="text-xs text-gray-900 font-medium capitalize">
                      {contact.roleInfluence.decisionAuthority}
                    </span>
                  </div>
                )}
                {contact.roleInfluence.engagementLevel && (
                  <div className="flex items-center justify-between p-2 rounded-md bg-gray-50">
                    <span className="text-xs text-gray-600">Engagement</span>
                    <span className="text-xs text-gray-900 font-medium capitalize">
                      {contact.roleInfluence.engagementLevel.replace(/_/g, ' ')}
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 pt-2">
                  {contact.roleInfluence.isBillingContact && (
                    <div className="text-center p-2 rounded-md bg-emerald-50">
                      <Building2 className="h-3.5 w-3.5 text-emerald-600 mx-auto mb-1" />
                      <p className="text-xs text-emerald-700 font-medium">Billing</p>
                    </div>
                  )}
                  {contact.roleInfluence.isTechnicalContact && (
                    <div className="text-center p-2 rounded-md bg-cyan-50">
                      <Briefcase className="h-3.5 w-3.5 text-cyan-600 mx-auto mb-1" />
                      <p className="text-xs text-cyan-700 font-medium">Technical</p>
                    </div>
                  )}
                  {contact.roleInfluence.isDecisionMaker && (
                    <div className="text-center p-2 rounded-md bg-purple-50">
                      <Target className="h-3.5 w-3.5 text-purple-600 mx-auto mb-1" />
                      <p className="text-xs text-purple-700 font-medium">Decision</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Scoring */}
            {contact.scoring && (
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center">
                    <TrendingUp className="h-4 w-4 mr-2 text-primary" />
                    Scores
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {contact.scoring.engagementScore && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-600">Engagement Score</span>
                        <span className="text-xs font-bold text-gray-900">{contact.scoring.engagementScore.score}/100</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div 
                          className="bg-primary h-1.5 rounded-full transition-all"
                          style={{ width: `${contact.scoring.engagementScore.score}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {contact.scoring.leadScore && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-600">Lead Score</span>
                        <span className="text-xs font-bold text-gray-900">{contact.scoring.leadScore.score}/100</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div 
                          className="bg-green-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${contact.scoring.leadScore.score}%` }}
                        />
                      </div>
                      {contact.scoring.leadScore.trend && (
                        <p className="text-xs text-gray-500 mt-1 capitalize">
                          Trend: {contact.scoring.leadScore.trend}
                        </p>
                      )}
                    </div>
                  )}
                  {contact.scoring.influenceScore && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-600">Influence Score</span>
                        <span className="text-xs font-bold text-gray-900">{contact.scoring.influenceScore.overall}/100</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div 
                          className="bg-purple-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${contact.scoring.influenceScore.overall}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {contact.roleInfluence.influence && (
                    <div className="p-2 rounded-md bg-gray-50">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-600">Influence Level</span>
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          contact.roleInfluence.influence.level === 'champion' ? 'bg-green-100 text-green-700' :
                          contact.roleInfluence.influence.level === 'supporter' ? 'bg-blue-100 text-blue-700' :
                          contact.roleInfluence.influence.level === 'neutral' ? 'bg-gray-100 text-gray-700' :
                          contact.roleInfluence.influence.level === 'skeptic' ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {contact.roleInfluence.influence.level}
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Relationship Strength */}
            {contact.relationship.strength && (
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center">
                    <Users className="h-4 w-4 mr-2 text-primary" />
                    Relationship
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between p-2 rounded-md bg-gray-50">
                    <span className="text-xs text-gray-600">Strength</span>
                    <span className="text-xs text-gray-900 font-medium capitalize">
                      {contact.relationship.strength.level}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600">Score</span>
                      <span className="text-xs font-bold text-gray-900">{contact.relationship.strength.score}/100</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div 
                        className="bg-primary h-1.5 rounded-full transition-all"
                        style={{ width: `${contact.relationship.strength.score}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Record Information */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center">
                  <Hash className="h-4 w-4 mr-2 text-primary" />
                  Record Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="p-2 rounded-md bg-gray-50">
                  <p className="text-xs text-gray-600 mb-0.5">Contact ID</p>
                  <p className="text-xs font-mono text-gray-900">{contact.contactId || contact._id}</p>
                </div>
                <div className="p-2 rounded-md bg-gray-50">
                  <p className="text-xs text-gray-600 mb-0.5">Created</p>
                  <p className="text-xs text-gray-900">{formatDateTime(contact.createdAt)}</p>
                </div>
                <div className="p-2 rounded-md bg-gray-50">
                  <p className="text-xs text-gray-600 mb-0.5">Last Updated</p>
                  <p className="text-xs text-gray-900">{formatDateTime(contact.updatedAt)}</p>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center">
                  <Activity className="h-4 w-4 mr-2 text-primary" />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full justify-start text-xs h-8"
                  onClick={() => {
                    const primaryEmail = contact.contactDetails.emails?.find(e => e.isPrimary)?.address
                    if (primaryEmail) window.location.href = `mailto:${primaryEmail}`
                  }}
                >
                  <Mail className="h-3 w-3 mr-2" />
                  Send Email
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full justify-start text-xs h-8"
                  onClick={() => {
                    const primaryPhone = contact.contactDetails.phones?.find(p => p.isPrimary)?.number
                    if (primaryPhone) window.location.href = `tel:${primaryPhone}`
                  }}
                >
                  <Phone className="h-3 w-3 mr-2" />
                  Call Contact
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full justify-start text-xs h-8"
                  onClick={() => router.push(`/dashboard/core-business/clients/${clientId}`)}
                >
                  <Building2 className="h-3 w-3 mr-2" />
                  View Client
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}