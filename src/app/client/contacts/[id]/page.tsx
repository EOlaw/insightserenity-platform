'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  Briefcase,
  MapPin,
  Calendar,
  Clock,
  Edit,
  Trash2,
  Save,
  X,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  MessageSquare,
  FileText,
  User,
  Globe,
  Linkedin,
  Twitter,
  ExternalLink,
  MoreVertical
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '@/lib/api/client'

interface Contact {
  _id: string
  contactId?: string
  clientId: string
  personalInfo: {
    prefix?: string
    firstName: string
    middleName?: string
    lastName: string
    suffix?: string
    displayName?: string
    preferredName?: string
  }
  professionalInfo?: {
    jobTitle?: string
    department?: string
    companyName?: string
    role?: string
  }
  contactDetails?: {
    emails: Array<{
      type: string
      address: string
      isPrimary: boolean
      isVerified: boolean
    }>
    phones: Array<{
      type: string
      number: string
      isPrimary: boolean
      extension?: string
    }>
  }
  address?: {
    street1?: string
    street2?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
  }
  socialProfiles?: {
    linkedin?: string
    twitter?: string
    website?: string
  }
  notes?: string
  tags?: string[]
  status: {
    current?: string
    isActive: boolean
  }
  metadata?: {
    lastContactDate?: string
    nextFollowUpDate?: string
  }
  createdAt: string
  updatedAt: string
}

export default function ContactDetailPage() {
  const router = useRouter()
  const params = useParams()
  const contactId = params.id as string

  const [contact, setContact] = useState<Contact | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  // Edit form state
  const [editedContact, setEditedContact] = useState<Partial<Contact>>({})

  useEffect(() => {
    if (contactId) {
      loadContact()
    }
  }, [contactId])

  const loadContact = async () => {
    setIsLoading(true)
    try {
      const response = await api.get(`/clients/contacts/${contactId}`)
      const contactData = response.data || response
      setContact(contactData)
      setEditedContact(contactData)
    } catch (error: any) {
      console.error('Failed to load contact:', error)
      toast.error('Failed to load contact')
      if (error.response?.status === 404) {
        router.push('/client/dashboard')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    if (!editedContact) return

    setIsSaving(true)
    try {
      const response = await api.put(`/clients/contacts/${contactId}`, editedContact)
      const updatedContact = response.data || response
      setContact(updatedContact)
      setIsEditing(false)
      toast.success('Contact updated successfully')
    } catch (error: any) {
      console.error('Failed to update contact:', error)
      toast.error(error.response?.data?.message || 'Failed to update contact')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await api.delete(`/clients/contacts/${contactId}`)
      toast.success('Contact deleted successfully')
      router.push('/client/dashboard')
    } catch (error: any) {
      console.error('Failed to delete contact:', error)
      toast.error(error.response?.data?.message || 'Failed to delete contact')
      setIsDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  const handleCancelEdit = () => {
    setEditedContact(contact || {})
    setIsEditing(false)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const getFullName = (contact: Contact) => {
    const parts = [
      contact.personalInfo.prefix,
      contact.personalInfo.firstName,
      contact.personalInfo.middleName,
      contact.personalInfo.lastName,
      contact.personalInfo.suffix
    ].filter(Boolean)
    return parts.join(' ')
  }

  const getPrimaryEmail = (contact: Contact) => {
    if (contact.contactDetails?.emails?.length) {
      const primary = contact.contactDetails.emails.find(e => e.isPrimary)
      return primary?.address || contact.contactDetails.emails[0]?.address
    }
    return null
  }

  const getPrimaryPhone = (contact: Contact) => {
    if (contact.contactDetails?.phones?.length) {
      const primary = contact.contactDetails.phones.find(p => p.isPrimary)
      return primary?.number || contact.contactDetails.phones[0]?.number
    }
    return null
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-sm text-gray-600">Loading contact details...</p>
        </div>
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Contact Not Found</h2>
            <p className="text-sm text-gray-600 mb-4">
              The contact you're looking for doesn't exist or has been deleted.
            </p>
            <Link href="/client/dashboard">
              <Button>Back to Dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <Link href="/client/dashboard">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
            <div className="flex items-center space-x-2">
              {!isEditing ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDeleteDialog(true)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={isSaving}>
                    {isSaving ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Contact Header */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start space-x-6">
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl font-bold text-primary">
                    {contact.personalInfo.firstName?.[0]}{contact.personalInfo.lastName?.[0]}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h1 className="text-2xl font-bold text-gray-900 mb-1">
                        {getFullName(contact)}
                      </h1>
                      {contact.personalInfo.preferredName && (
                        <p className="text-sm text-gray-600 mb-2">
                          Preferred: {contact.personalInfo.preferredName}
                        </p>
                      )}
                      {contact.professionalInfo?.jobTitle && (
                        <p className="text-sm text-gray-600">
                          {contact.professionalInfo.jobTitle}
                          {contact.professionalInfo.companyName && (
                            <> at {contact.professionalInfo.companyName}</>
                          )}
                        </p>
                      )}
                    </div>
                    <span
                      className={`px-3 py-1 text-sm rounded-full ${
                        contact.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {contact.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {getPrimaryEmail(contact) && (
                      <div className="flex items-center space-x-2 text-sm text-gray-600">
                        <Mail className="h-4 w-4 text-gray-400" />
                        <a
                          href={`mailto:${getPrimaryEmail(contact)}`}
                          className="hover:text-primary"
                        >
                          {getPrimaryEmail(contact)}
                        </a>
                      </div>
                    )}
                    {getPrimaryPhone(contact) && (
                      <div className="flex items-center space-x-2 text-sm text-gray-600">
                        <Phone className="h-4 w-4 text-gray-400" />
                        <a
                          href={`tel:${getPrimaryPhone(contact)}`}
                          className="hover:text-primary"
                        >
                          {getPrimaryPhone(contact)}
                        </a>
                      </div>
                    )}
                    {contact.professionalInfo?.department && (
                      <div className="flex items-center space-x-2 text-sm text-gray-600">
                        <Briefcase className="h-4 w-4 text-gray-400" />
                        <span>{contact.professionalInfo.department}</span>
                      </div>
                    )}
                    {contact.address?.city && (
                      <div className="flex items-center space-x-2 text-sm text-gray-600">
                        <MapPin className="h-4 w-4 text-gray-400" />
                        <span>
                          {contact.address.city}
                          {contact.address.state && `, ${contact.address.state}`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Personal Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Personal Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isEditing ? (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs">First Name</Label>
                          <Input
                            value={editedContact.personalInfo?.firstName || ''}
                            onChange={(e) =>
                              setEditedContact({
                                ...editedContact,
                                personalInfo: {
                                  ...editedContact.personalInfo!,
                                  firstName: e.target.value
                                }
                              })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Last Name</Label>
                          <Input
                            value={editedContact.personalInfo?.lastName || ''}
                            onChange={(e) =>
                              setEditedContact({
                                ...editedContact,
                                personalInfo: {
                                  ...editedContact.personalInfo!,
                                  lastName: e.target.value
                                }
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Preferred Name</Label>
                        <Input
                          value={editedContact.personalInfo?.preferredName || ''}
                          onChange={(e) =>
                            setEditedContact({
                              ...editedContact,
                              personalInfo: {
                                ...editedContact.personalInfo!,
                                preferredName: e.target.value
                              }
                            })
                          }
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-600">Full Name</span>
                        <span className="text-sm font-medium">{getFullName(contact)}</span>
                      </div>
                      {contact.personalInfo.preferredName && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-600">Preferred Name</span>
                          <span className="text-sm font-medium">
                            {contact.personalInfo.preferredName}
                          </span>
                        </div>
                      )}
                      {contact.personalInfo.displayName && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-600">Display Name</span>
                          <span className="text-sm font-medium">
                            {contact.personalInfo.displayName}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Professional Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Professional Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isEditing ? (
                    <>
                      <div className="space-y-2">
                        <Label className="text-xs">Job Title</Label>
                        <Input
                          value={editedContact.professionalInfo?.jobTitle || ''}
                          onChange={(e) =>
                            setEditedContact({
                              ...editedContact,
                              professionalInfo: {
                                ...editedContact.professionalInfo!,
                                jobTitle: e.target.value
                              }
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Company</Label>
                        <Input
                          value={editedContact.professionalInfo?.companyName || ''}
                          onChange={(e) =>
                            setEditedContact({
                              ...editedContact,
                              professionalInfo: {
                                ...editedContact.professionalInfo!,
                                companyName: e.target.value
                              }
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Department</Label>
                        <Input
                          value={editedContact.professionalInfo?.department || ''}
                          onChange={(e) =>
                            setEditedContact({
                              ...editedContact,
                              professionalInfo: {
                                ...editedContact.professionalInfo!,
                                department: e.target.value
                              }
                            })
                          }
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      {contact.professionalInfo?.jobTitle && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-600">Job Title</span>
                          <span className="text-sm font-medium">
                            {contact.professionalInfo.jobTitle}
                          </span>
                        </div>
                      )}
                      {contact.professionalInfo?.companyName && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-600">Company</span>
                          <span className="text-sm font-medium">
                            {contact.professionalInfo.companyName}
                          </span>
                        </div>
                      )}
                      {contact.professionalInfo?.department && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-600">Department</span>
                          <span className="text-sm font-medium">
                            {contact.professionalInfo.department}
                          </span>
                        </div>
                      )}
                      {contact.professionalInfo?.role && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-600">Role</span>
                          <span className="text-sm font-medium">
                            {contact.professionalInfo.role}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Contact Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Contact Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {contact.contactDetails?.emails && contact.contactDetails.emails.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-gray-700 mb-2">Email Addresses</h4>
                      <div className="space-y-2">
                        {contact.contactDetails.emails.map((email, index) => (
                          <div key={index} className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <Mail className="h-3 w-3 text-gray-400" />
                              <a
                                href={`mailto:${email.address}`}
                                className="text-sm text-primary hover:underline"
                              >
                                {email.address}
                              </a>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="text-xs text-gray-500">{email.type}</span>
                              {email.isPrimary && (
                                <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                                  Primary
                                </span>
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

                  {contact.contactDetails?.phones && contact.contactDetails.phones.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-gray-700 mb-2">Phone Numbers</h4>
                      <div className="space-y-2">
                        {contact.contactDetails.phones.map((phone, index) => (
                          <div key={index} className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <Phone className="h-3 w-3 text-gray-400" />
                              <a
                                href={`tel:${phone.number}`}
                                className="text-sm text-primary hover:underline"
                              >
                                {phone.number}
                                {phone.extension && ` ext. ${phone.extension}`}
                              </a>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="text-xs text-gray-500">{phone.type}</span>
                              {phone.isPrimary && (
                                <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                                  Primary
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Address */}
              {contact.address && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Address</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-start space-x-2">
                      <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
                      <div className="text-sm text-gray-600">
                        {contact.address.street1 && <div>{contact.address.street1}</div>}
                        {contact.address.street2 && <div>{contact.address.street2}</div>}
                        <div>
                          {[
                            contact.address.city,
                            contact.address.state,
                            contact.address.postalCode
                          ]
                            .filter(Boolean)
                            .join(', ')}
                        </div>
                        {contact.address.country && <div>{contact.address.country}</div>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Details Tab */}
          <TabsContent value="details">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Additional Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Social Profiles */}
                {contact.socialProfiles && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Social Profiles</h4>
                    <div className="space-y-2">
                      {contact.socialProfiles.linkedin && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Linkedin className="h-4 w-4 text-blue-600" />
                            <span className="text-sm text-gray-600">LinkedIn</span>
                          </div>
                          <a
                            href={contact.socialProfiles.linkedin}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline flex items-center"
                          >
                            View Profile
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </a>
                        </div>
                      )}
                      {contact.socialProfiles.twitter && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Twitter className="h-4 w-4 text-blue-400" />
                            <span className="text-sm text-gray-600">Twitter</span>
                          </div>
                          <a
                            href={contact.socialProfiles.twitter}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline flex items-center"
                          >
                            View Profile
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </a>
                        </div>
                      )}
                      {contact.socialProfiles.website && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Globe className="h-4 w-4 text-gray-600" />
                            <span className="text-sm text-gray-600">Website</span>
                          </div>
                          <a
                            href={contact.socialProfiles.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline flex items-center"
                          >
                            Visit Website
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Tags */}
                {contact.tags && contact.tags.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Tags</h4>
                    <div className="flex flex-wrap gap-2">
                      {contact.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Metadata */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Record Information</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-600">Created</span>
                      <span className="text-sm text-gray-900">{formatDate(contact.createdAt)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-600">Last Updated</span>
                      <span className="text-sm text-gray-900">{formatDate(contact.updatedAt)}</span>
                    </div>
                    {contact.contactId && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-600">Contact ID</span>
                        <span className="text-sm font-mono text-gray-900">{contact.contactId}</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Activity Timeline</CardTitle>
                <CardDescription className="text-xs">
                  Recent interactions and updates
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12">
                  <Clock className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm text-gray-600">No activity recorded yet</p>
                  <p className="text-xs text-gray-500 mt-2">
                    Activity tracking coming soon
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notes Tab */}
          <TabsContent value="notes">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes</CardTitle>
                <CardDescription className="text-xs">
                  Internal notes and comments about this contact
                </CardDescription>
              </CardHeader>
              <CardContent>
                {contact.notes ? (
                  <div className="prose prose-sm max-w-none">
                    <p className="text-sm text-gray-600">{contact.notes}</p>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-sm text-gray-600">No notes added yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Contact</DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to delete this contact? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-red-900 mb-1">
                    This will permanently delete:
                  </h4>
                  <ul className="text-sm text-red-800 list-disc list-inside space-y-1">
                    <li>Contact information for {getFullName(contact)}</li>
                    <li>All associated contact details</li>
                    <li>Activity history and notes</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Contact'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}