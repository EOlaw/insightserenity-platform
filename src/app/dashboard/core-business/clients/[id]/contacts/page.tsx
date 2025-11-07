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
  ArrowLeft,
  Plus,
  Search,
  Filter,
  MoreVertical,
  Edit,
  Trash2,
  MessageSquare,
  Bell,
  Loader2,
  AlertCircle,
  Star,
  UserCheck,
  Calendar,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '@/lib/api/client'

interface Contact {
  _id: string
  contactId: string
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
  }
  relationship: {
    status: string
    type?: string
  }
  roleInfluence: {
    isPrimaryContact: boolean
    decisionMakingLevel?: string
    influenceScore?: number
  }
}

export default function ClientContactsPage() {
  const router = useRouter()
  const params = useParams()
  const clientId = params.id as string

  const [contacts, setContacts] = useState<Contact[]>([])
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [clientName, setClientName] = useState('')

  useEffect(() => {
    loadContacts()
    loadClientInfo()
  }, [clientId])

  useEffect(() => {
    filterContacts()
  }, [searchQuery, statusFilter, contacts])

  const loadClientInfo = async () => {
    try {
      const response = await api.get(`/clients/${clientId}`)
      const data = response.data || response
      setClientName(data.client?.companyName || 'Client')
    } catch (err) {
      console.error('Error loading client info:', err)
    }
  }

  const loadContacts = async () => {
    setIsLoading(true)
    setError('')

    try {
      const response = await api.get(`/clients/${clientId}/`)
      const data = response.data || response
      
      if (data.contacts) {
        setContacts(data.contacts)
        setFilteredContacts(data.contacts)
      } else {
        setContacts([])
        setFilteredContacts([])
      }
    } catch (err: any) {
      console.error('Error loading contacts:', err)
      setError(err.response?.data?.error?.message || err.message || 'Failed to load contacts')
      toast.error('Failed to load contacts')
    } finally {
      setIsLoading(false)
    }
  }

  const filterContacts = () => {
    let filtered = [...contacts]

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(contact => {
        const fullName = `${contact.personalInfo.firstName} ${contact.personalInfo.lastName}`.toLowerCase()
        const email = contact.communicationChannels.email.primary?.toLowerCase() || ''
        const jobTitle = contact.professionalInfo.jobTitle?.toLowerCase() || ''
        const query = searchQuery.toLowerCase()

        return fullName.includes(query) || email.includes(query) || jobTitle.includes(query)
      })
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(contact => contact.relationship.status === statusFilter)
    }

    setFilteredContacts(filtered)
  }

  const handleDeleteContact = async (contactId: string) => {
    if (!confirm('Are you sure you want to delete this contact?')) return

    try {
      await api.delete(`/contacts/${contactId}`)
      toast.success('Contact deleted successfully')
      loadContacts()
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
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${statusColors[status] || statusColors.active}`}>
        {status.replace(/_/g, ' ')}
      </span>
    )
  }

  const getFullName = (contact: Contact) => {
    const { prefix, firstName, middleName, lastName, suffix } = contact.personalInfo
    return [prefix, firstName, middleName, lastName, suffix].filter(Boolean).join(' ')
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-sm text-gray-600">Loading contacts...</p>
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
                <h1 className="text-lg font-semibold text-gray-900">Contacts</h1>
                <p className="text-xs text-gray-500">{clientName}</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => router.push(`/dashboard/core-business/clients/${clientId}`)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
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
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Contacts</p>
                  <p className="text-2xl font-bold text-gray-900">{contacts.length}</p>
                </div>
                <Users className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Active</p>
                  <p className="text-2xl font-bold text-green-600">
                    {contacts.filter(c => c.relationship.status === 'active').length}
                  </p>
                </div>
                <UserCheck className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Primary Contacts</p>
                  <p className="text-2xl font-bold text-primary">
                    {contacts.filter(c => c.roleInfluence.isPrimaryContact).length}
                  </p>
                </div>
                <Star className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Decision Makers</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {contacts.filter(c => c.roleInfluence.decisionMakingLevel === 'primary' || c.roleInfluence.decisionMakingLevel === 'executive').length}
                  </p>
                </div>
                <Building2 className="h-8 w-8 text-gray-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Actions */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Search */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search contacts by name, email, or title..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-primary"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="left_company">Left Company</option>
                <option value="on_leave">On Leave</option>
              </select>

              {/* Add Contact Button */}
              <Link href={`/dashboard/core-business/clients/${clientId}/contacts/new`}>
                <Button className="bg-primary text-black hover:bg-primary-600 font-semibold">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Contact
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Contacts List */}
        {error ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-3 text-red-800">
                <AlertCircle className="h-5 w-5" />
                <div>
                  <p className="font-medium">Error Loading Contacts</p>
                  <p className="text-sm">{error}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : filteredContacts.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No contacts found</h3>
                <p className="text-sm text-gray-500 mb-6">
                  {searchQuery || statusFilter !== 'all' 
                    ? 'Try adjusting your search or filters'
                    : 'Get started by adding your first contact'}
                </p>
                {!searchQuery && statusFilter === 'all' && (
                  <Link href={`/dashboard/core-business/clients/${clientId}/contacts/new`}>
                    <Button className="bg-primary text-black hover:bg-primary-600">
                      <Plus className="h-4 w-4 mr-2" />
                      Add First Contact
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredContacts.map((contact) => (
              <Card key={contact._id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <CardTitle className="text-base">{getFullName(contact)}</CardTitle>
                        {contact.roleInfluence.isPrimaryContact && (
                          <Star className="h-4 w-4 text-primary fill-primary" />
                        )}
                      </div>
                      <CardDescription className="text-xs">
                        {contact.professionalInfo.jobTitle}
                      </CardDescription>
                    </div>
                    <div className="relative group">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                      <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border hidden group-hover:block z-10">
                        <Link href={`/dashboard/core-business/clients/${clientId}/contacts/${contact._id}`}>
                          <button className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                            View Details
                          </button>
                        </Link>
                        <Link href={`/dashboard/core-business/clients/${clientId}/contacts/${contact._id}/edit`}>
                          <button className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                            <Edit className="h-3 w-3 inline mr-2" />
                            Edit
                          </button>
                        </Link>
                        <button 
                          onClick={() => handleDeleteContact(contact._id)}
                          className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3 inline mr-2" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2">
                    {getStatusBadge(contact.relationship.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Email */}
                  {contact.communicationChannels.email.primary && (
                    <div className="flex items-center space-x-2 text-sm">
                      <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <a 
                        href={`mailto:${contact.communicationChannels.email.primary}`}
                        className="text-gray-600 hover:text-primary truncate"
                      >
                        {contact.communicationChannels.email.primary}
                      </a>
                    </div>
                  )}

                  {/* Phone */}
                  {contact.communicationChannels.phone.primary && (
                    <div className="flex items-center space-x-2 text-sm">
                      <Phone className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <a 
                        href={`tel:${contact.communicationChannels.phone.primary}`}
                        className="text-gray-600 hover:text-primary"
                      >
                        {contact.communicationChannels.phone.primary}
                      </a>
                    </div>
                  )}

                  {/* Department */}
                  {contact.professionalInfo.department && (
                    <div className="flex items-center space-x-2 text-sm">
                      <Building2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <span className="text-gray-600">{contact.professionalInfo.department}</span>
                    </div>
                  )}

                  {/* Decision Making Level */}
                  {contact.roleInfluence.decisionMakingLevel && (
                    <div className="flex items-center space-x-2 text-sm">
                      <UserCheck className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <span className="text-gray-600 capitalize">
                        {contact.roleInfluence.decisionMakingLevel.replace(/_/g, ' ')}
                      </span>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-3 border-t">
                    <Link 
                      href={`/dashboard/core-business/clients/${clientId}/contacts/${contact._id}`}
                      className="flex-1"
                    >
                      <Button variant="outline" size="sm" className="w-full">
                        View Profile
                      </Button>
                    </Link>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => window.location.href = `mailto:${contact.communicationChannels.email.primary}`}
                    >
                      <Mail className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}