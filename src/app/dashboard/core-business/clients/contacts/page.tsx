'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
  Search,
  Filter,
  Bell,
  Loader2,
  AlertCircle,
  Star,
  UserCheck,
  Calendar,
  ChevronLeft,
  ChevronRight,
  X,
  Briefcase,
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
  contactDetails: {
    emails?: Array<{
      address: string
      type: string
      isPrimary: boolean
    }>
    phones?: Array<{
      number: string
      type: string
      isPrimary: boolean
    }>
  }
  relationship: {
    status: string
    type?: string
  }
  engagement?: {
    totalInteractions?: number
    lastInteraction?: string
  }
  createdAt: string
  updatedAt: string
}

export default function AllContactsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [contacts, setContacts] = useState<Contact[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '')
  const [roleFilter, setRoleFilter] = useState(searchParams.get('role') || '')
  const [showFilters, setShowFilters] = useState(false)
  
  const [currentPage, setCurrentPage] = useState(1)
  const [totalContacts, setTotalContacts] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const contactsPerPage = 20

  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    primary: 0,
    decisionMakers: 0,
  })

  useEffect(() => {
    loadContacts()
  }, [currentPage, statusFilter, roleFilter])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm !== searchParams.get('search')) {
        setCurrentPage(1)
        loadContacts()
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [searchTerm])

  const loadContacts = async () => {
    setIsLoading(true)
    setError('')

    try {
      const params = new URLSearchParams()
      params.append('limit', contactsPerPage.toString())
      params.append('skip', ((currentPage - 1) * contactsPerPage).toString())
      if (statusFilter) params.append('status', statusFilter)
      if (roleFilter) params.append('role', roleFilter)
      if (searchTerm) params.append('search', searchTerm)
      params.append('sortBy', 'personalInfo.lastName')
      params.append('sortOrder', 'asc')

      const response = await api.get(`/clients/contacts?${params.toString()}`)
      
      let contactsData: Contact[] = []
      let metadata = null

      if (Array.isArray(response)) {
        contactsData = response
      } else if (Array.isArray(response.data)) {
        contactsData = response.data
      } else if (response.data?.success === true) {
        contactsData = Array.isArray(response.data.data) ? response.data.data : response.data.contacts || []
        metadata = response.data.metadata
      } else if (response.success === true) {
        contactsData = Array.isArray(response.data) ? response.data : response.contacts || []
        metadata = response.metadata
      }

      if (!Array.isArray(contactsData)) {
        throw new Error('Unable to parse contacts from server response')
      }

      setContacts(contactsData)
      
      if (metadata) {
        setTotalContacts(metadata.total || contactsData.length)
        setHasMore(metadata.hasMore || false)
      } else {
        setTotalContacts(contactsData.length)
        setHasMore(false)
      }

      loadStats()

    } catch (err: any) {
      const errorMessage = err.response?.data?.error?.message || 
                          err.response?.data?.message || 
                          err.message || 
                          'Failed to load contacts'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      // Make calls without limit to get accurate totals
      // The backend should return metadata.total even with limit=1, but we'll remove limit to be safe
      const responses = await Promise.all([
        api.get('/clients/contacts').catch(() => ({ data: [] })),
        api.get('/clients/contacts?status=active').catch(() => ({ data: [] })),
        api.get('/clients/contacts?role=primary').catch(() => ({ data: [] })),
        api.get('/clients/contacts?role=decision_maker').catch(() => ({ data: [] })),
      ])

      const getCount = (res: any) => {
        // First priority: Check for metadata.total (most reliable)
        if (res.data?.metadata?.total !== undefined) return res.data.metadata.total
        if (res.metadata?.total !== undefined) return res.metadata.total
        
        // Second priority: If direct array response
        if (Array.isArray(res)) return res.length
        
        // Third priority: If data is array
        if (Array.isArray(res.data)) return res.data.length
        
        // Fourth priority: If data.data is array
        if (Array.isArray(res.data?.data)) return res.data.data.length
        
        // Fifth priority: If contacts array exists
        if (Array.isArray(res.data?.contacts)) return res.data.contacts.length
        if (Array.isArray(res.contacts)) return res.contacts.length
        
        return 0
      }

      const totals = {
        total: getCount(responses[0]),
        active: getCount(responses[1]),
        primary: getCount(responses[2]),
        decisionMakers: getCount(responses[3]),
      }

      console.log('Stats calculated:', totals)
      setStats(totals)
    } catch (err) {
      console.error('Error loading stats:', err)
    }
  }

  const handleSearch = (value: string) => setSearchTerm(value)
  const handleStatusFilter = (status: string) => { setStatusFilter(status); setCurrentPage(1) }
  const handleRoleFilter = (role: string) => { setRoleFilter(role); setCurrentPage(1) }
  const clearFilters = () => { setSearchTerm(''); setStatusFilter(''); setRoleFilter(''); setCurrentPage(1) }

  const getContactName = (contact: Contact) => {
    const { prefix, firstName, middleName, lastName, suffix } = contact.personalInfo
    return [prefix, firstName, middleName, lastName, suffix].filter(Boolean).join(' ')
  }

  const getPrimaryEmail = (contact: Contact) => {
    return contact.contactDetails?.emails?.find(e => e.isPrimary)?.address || 
           contact.contactDetails?.emails?.[0]?.address || 
           'No email'
  }

  const getPrimaryPhone = (contact: Contact) => {
    return contact.contactDetails?.phones?.find(p => p.isPrimary)?.number || 
           contact.contactDetails?.phones?.[0]?.number || 
           'No phone'
  }

  const getStatusBadge = (status: string) => {
    const statusConfig: { [key: string]: string } = {
      active: 'bg-green-100 text-green-700 border-green-200',
      inactive: 'bg-gray-100 text-gray-700 border-gray-200',
      left_company: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      do_not_contact: 'bg-red-100 text-red-700 border-red-200',
    }
    return statusConfig[status] || statusConfig.active
  }

  const getRoleBadge = (role: string) => {
    const roleConfig: { [key: string]: { color: string; icon: any } } = {
      primary: { color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Star },
      decision_maker: { color: 'bg-purple-100 text-purple-700 border-purple-200', icon: UserCheck },
      technical_contact: { color: 'bg-cyan-100 text-cyan-700 border-cyan-200', icon: Users },
      billing_contact: { color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: Building2 },
    }
    return roleConfig[role] || null
  }

  const totalPages = Math.ceil(totalContacts / contactsPerPage)

  if (isLoading && contacts.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mb-3" />
          <p className="text-xs text-gray-600">Loading contacts...</p>
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
            <div className="flex items-center space-x-3">
              <Logo href="/" showText={false} />
              <div>
                <h1 className="text-base font-semibold text-gray-900">All Contacts</h1>
                <p className="text-xs text-gray-500">Manage your contact directory</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => router.push('/dashboard/core-business/clients')}
              >
                Back to Clients
              </Button>
              <Button variant="ghost" size="sm">
                <Bell className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-gray-600">
                Total Contacts
              </CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {totalContacts || stats.total || contacts.length}
              </div>
              <p className="text-xs text-gray-500 mt-1">All contacts</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-gray-600">
                Active Contacts
              </CardTitle>
              <UserCheck className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{stats.active}</div>
              <p className="text-xs text-gray-500 mt-1">Currently active</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-gray-600">
                Primary Contacts
              </CardTitle>
              <Star className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{stats.primary}</div>
              <p className="text-xs text-gray-500 mt-1">Key contacts</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-gray-600">
                Decision Makers
              </CardTitle>
              <Briefcase className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{stats.decisionMakers}</div>
              <p className="text-xs text-gray-500 mt-1">Key decision makers</p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <Card className="mb-6">
          <CardContent className="pt-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search by name, email, or job title..."
                  value={searchTerm}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-8 text-sm h-9"
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="text-xs"
              >
                <Filter className="h-3.5 w-3.5 mr-1.5" />
                Filters
                {(statusFilter || roleFilter) && (
                  <span className="ml-1.5 bg-primary text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                    {(statusFilter ? 1 : 0) + (roleFilter ? 1 : 0)}
                  </span>
                )}
              </Button>
            </div>

            {showFilters && (
              <div className="mt-3 pt-3 border-t space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                      Status
                    </label>
                    <select
                      value={statusFilter}
                      onChange={(e) => handleStatusFilter(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-xs"
                    >
                      <option value="">All Statuses</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="left_company">Left Company</option>
                      <option value="do_not_contact">Do Not Contact</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                      Role
                    </label>
                    <select
                      value={roleFilter}
                      onChange={(e) => handleRoleFilter(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-xs"
                    >
                      <option value="">All Roles</option>
                      <option value="primary">Primary</option>
                      <option value="decision_maker">Decision Maker</option>
                      <option value="technical_contact">Technical Contact</option>
                      <option value="billing_contact">Billing Contact</option>
                      <option value="support_contact">Support Contact</option>
                      <option value="executive">Executive</option>
                      <option value="manager">Manager</option>
                      <option value="general">General</option>
                    </select>
                  </div>
                </div>

                {(statusFilter || roleFilter || searchTerm) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="text-xs"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Clear filters
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Error Message */}
        {error && (
          <Card className="mb-6 border-red-200 bg-red-50">
            <CardContent className="pt-4">
              <div className="flex items-start text-red-800">
                <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs font-medium">Error loading contacts</p>
                  <p className="text-xs mt-0.5 text-red-700">{error}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadContacts}
                    className="mt-2 text-xs"
                  >
                    Try Again
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Contacts List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Contacts Directory</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  {totalContacts || contacts.length} total contacts
                  {totalPages > 1 && ` • Page ${currentPage} of ${totalPages}`}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto mb-2" />
                <p className="text-xs text-gray-600">Loading...</p>
              </div>
            ) : contacts.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                <h3 className="text-sm font-medium text-gray-900 mb-1">No contacts found</h3>
                <p className="text-xs text-gray-600">
                  {searchTerm || roleFilter || statusFilter ? 
                    'Try adjusting your filters' : 
                    'Get started by adding your first contact'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {contacts.map((contact) => {
                  const roleBadge = getRoleBadge(contact.professionalInfo.role || '')
                  const RoleIcon = roleBadge?.icon

                  return (
                    <div
                      key={contact._id}
                      className="border border-gray-200 rounded-lg p-3 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer"
                      onClick={() => router.push(`/dashboard/core-business/clients/${contact.clientId}/contacts/${contact._id}`)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <h3 className="text-sm font-semibold text-gray-900">
                              {getContactName(contact)}
                            </h3>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-2xs font-medium border ${getStatusBadge(contact.relationship.status)}`}>
                              {contact.relationship.status.replace(/_/g, ' ').toUpperCase()}
                            </span>
                            {roleBadge && RoleIcon && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-2xs font-medium border ${roleBadge.color}`}>
                                <RoleIcon className="h-2.5 w-2.5 mr-1" />
                                {contact.professionalInfo.role?.replace(/_/g, ' ').toUpperCase()}
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-gray-600 mb-2">
                            {contact.professionalInfo.jobTitle}
                            {contact.professionalInfo.department && ` • ${contact.professionalInfo.department}`}
                          </p>

                          <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                            <div className="flex items-center">
                              <Mail className="h-3 w-3 mr-1 flex-shrink-0" />
                              <span className="truncate">{getPrimaryEmail(contact)}</span>
                            </div>
                            <div className="flex items-center">
                              <Phone className="h-3 w-3 mr-1 flex-shrink-0" />
                              <span>{getPrimaryPhone(contact)}</span>
                            </div>
                            {contact.engagement?.lastInteraction && (
                              <div className="flex items-center">
                                <Calendar className="h-3 w-3 mr-1 flex-shrink-0" />
                                <span>Last: {new Date(contact.engagement.lastInteraction).toLocaleDateString()}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs ml-2"
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push(`/dashboard/core-business/clients/${contact.clientId}/contacts/${contact._id}`)
                          }}
                        >
                          View
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && !isLoading && contacts.length > 0 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="text-xs"
                >
                  <ChevronLeft className="h-3 w-3 mr-1" />
                  Previous
                </Button>

                <span className="text-xs text-gray-600">
                  Page {currentPage} of {totalPages}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={!hasMore && currentPage === totalPages}
                  className="text-xs"
                >
                  Next
                  <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}