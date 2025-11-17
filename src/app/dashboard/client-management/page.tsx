'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
  Users,
  FileText,
  StickyNote,
  Plus,
  Search,
  Filter,
  Download,
  Edit,
  Trash2,
  Eye,
  Upload,
  RefreshCw,
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  Briefcase,
  Calendar,
  Tag,
  AlertCircle,
  CheckCircle,
  Clock
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '@/lib/api/client'

// Types - Updated to match MongoDB schema
interface Contact {
  _id: string
  contactId?: string
  personalInfo: {
    firstName: string
    lastName: string
    displayName?: string
    preferredName?: string
  }
  professionalInfo?: {
    jobTitle?: string
    companyName?: string
    department?: string
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
  status: {
    isActive: boolean
  }
  createdAt: string
  updatedAt: string
}

interface Document {
  _id: string
  documentInfo: {
    name: string
    displayName?: string
    description?: string
    type: string
  }
  file: {
    size: number
    mimeType: string
    filename: string
  }
  status: {
    isActive: boolean
  }
  createdAt: string
  updatedAt: string
}

interface Note {
  _id: string
  content: {
    title?: string
    body: string
  }
  classification: {
    type: string
    importance: string
    category?: {
      primary: string
    }
  }
  status: {
    isActive: boolean
  }
  createdAt: string
  updatedAt: string
}

type TabType = 'contacts' | 'documents' | 'notes'

export default function ClientManagementPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<TabType>('contacts')
  
  // Data states
  const [contacts, setContacts] = useState<Contact[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  
  // Loading states
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  
  // Modal states
  const [isContactModalOpen, setIsContactModalOpen] = useState(false)
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false)
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false)
  
  // Search states
  const [searchQuery, setSearchQuery] = useState('')
  
  // Pagination
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0
  })

  // Form states for creating new items
  const [newContact, setNewContact] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    jobTitle: '',
    company: '',
    department: ''
  })

  const [newDocument, setNewDocument] = useState<File | null>(null)
  const [documentMetadata, setDocumentMetadata] = useState({
    displayName: '',
    description: '',
    type: 'general'
  })

  const [newNote, setNewNote] = useState({
    title: '',
    body: '',
    type: 'general',
    importance: 'medium',
    category: 'general'
  })

  // Helper functions to get contact info
  const getPrimaryEmail = (contact: Contact): string => {
    if (!contact.contactDetails?.emails?.length) return 'No email'
    const primary = contact.contactDetails.emails.find(e => e.isPrimary)
    return primary?.address || contact.contactDetails.emails[0]?.address || 'No email'
  }

  const getPrimaryPhone = (contact: Contact): string | null => {
    if (!contact.contactDetails?.phones?.length) return null
    const primary = contact.contactDetails.phones.find(p => p.isPrimary)
    return primary?.number || contact.contactDetails.phones[0]?.number || null
  }

  const getContactDisplayName = (contact: Contact): string => {
    return contact.personalInfo.displayName || 
           contact.personalInfo.preferredName ||
           `${contact.personalInfo.firstName} ${contact.personalInfo.lastName}`
  }

  // Read tab from URL
  useEffect(() => {
    const tab = searchParams.get('tab') as TabType
    if (tab && ['contacts', 'documents', 'notes'].includes(tab)) {
      setActiveTab(tab)
    }
  }, [searchParams])

  // Load data when tab changes
  useEffect(() => {
    loadData()
  }, [activeTab, pagination.page])

  const loadData = async () => {
    setIsLoading(true)
    try {
      switch (activeTab) {
        case 'contacts':
          await loadContacts()
          break
        case 'documents':
          await loadDocuments()
          break
        case 'notes':
          await loadNotes()
          break
      }
    } catch (error) {
      console.error('Failed to load data:', error)
      toast.error('Failed to load data')
    } finally {
      setIsLoading(false)
    }
  }

  const loadContacts = async () => {
    try {
      const response = await api.get(`/clients/contacts?page=${pagination.page}&limit=${pagination.limit}`)
      const contactsData = Array.isArray(response.data) ? response.data : []
      setContacts(contactsData)
      setPagination(prev => ({ ...prev, total: response.metadata?.total || contactsData.length }))
    } catch (error) {
      console.error('Failed to load contacts:', error)
      setContacts([])
    }
  }

  const loadDocuments = async () => {
    try {
      const response = await api.get(`/clients/documents?page=${pagination.page}&limit=${pagination.limit}`)
      const documentsData = Array.isArray(response.data) ? response.data : []
      setDocuments(documentsData)
      setPagination(prev => ({ ...prev, total: response.metadata?.total || documentsData.length }))
    } catch (error) {
      console.error('Failed to load documents:', error)
      setDocuments([])
    }
  }

  const loadNotes = async () => {
    try {
      const response = await api.get(`/clients/notes?page=${pagination.page}&limit=${pagination.limit}`)
      const notesData = Array.isArray(response.data) ? response.data : []
      setNotes(notesData)
      setPagination(prev => ({ ...prev, total: response.metadata?.total || notesData.length }))
    } catch (error) {
      console.error('Failed to load notes:', error)
      setNotes([])
    }
  }

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab)
    router.push(`/dashboard/client-management?tab=${tab}`)
    setPagination(prev => ({ ...prev, page: 1 }))
  }

  const handleCreateContact = async () => {
    if (!newContact.firstName || !newContact.lastName || !newContact.email) {
      toast.error('Please fill in all required fields')
      return
    }

    setIsCreating(true)
    try {
      // Structure data to match MongoDB schema
      const contactData = {
        personalInfo: {
          firstName: newContact.firstName,
          lastName: newContact.lastName,
          displayName: `${newContact.firstName} ${newContact.lastName}`
        },
        professionalInfo: {
          jobTitle: newContact.jobTitle,
          companyName: newContact.company,
          department: newContact.department
        },
        contactDetails: {
          emails: [{
            type: 'work',
            address: newContact.email,
            isPrimary: true,
            isVerified: false
          }],
          phones: newContact.phone ? [{
            type: 'office',
            number: newContact.phone,
            isPrimary: true
          }] : []
        }
      }

      await api.post('/clients/contacts', contactData)
      toast.success('Contact created successfully')
      setIsContactModalOpen(false)
      setNewContact({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        jobTitle: '',
        company: '',
        department: ''
      })
      loadContacts()
    } catch (error: any) {
      console.error('Failed to create contact:', error)
      toast.error(error.response?.data?.message || 'Failed to create contact')
    } finally {
      setIsCreating(false)
    }
  }

  const handleCreateDocument = async () => {
    if (!newDocument) {
      toast.error('Please select a file to upload')
      return
    }

    setIsCreating(true)
    try {
      const formData = new FormData()
      formData.append('file', newDocument)
      formData.append('displayName', documentMetadata.displayName || newDocument.name)
      formData.append('description', documentMetadata.description)
      formData.append('type', documentMetadata.type)

      await api.upload('/clients/documents', newDocument)
      toast.success('Document uploaded successfully')
      setIsDocumentModalOpen(false)
      setNewDocument(null)
      setDocumentMetadata({
        displayName: '',
        description: '',
        type: 'general'
      })
      loadDocuments()
    } catch (error: any) {
      console.error('Failed to upload document:', error)
      toast.error(error.response?.data?.message || 'Failed to upload document')
    } finally {
      setIsCreating(false)
    }
  }

  const handleCreateNote = async () => {
    if (!newNote.body) {
      toast.error('Please enter note content')
      return
    }

    setIsCreating(true)
    try {
      const noteData = {
        content: {
          title: newNote.title,
          body: newNote.body
        },
        classification: {
          type: newNote.type,
          importance: newNote.importance,
          category: {
            primary: newNote.category
          }
        }
      }

      await api.post('/clients/notes', noteData)
      toast.success('Note created successfully')
      setIsNoteModalOpen(false)
      setNewNote({
        title: '',
        body: '',
        type: 'general',
        importance: 'medium',
        category: 'general'
      })
      loadNotes()
    } catch (error: any) {
      console.error('Failed to create note:', error)
      toast.error(error.response?.data?.message || 'Failed to create note')
    } finally {
      setIsCreating(false)
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const getFileIcon = (mimeType: string): string => {
    if (mimeType?.includes('pdf')) return '📄'
    if (mimeType?.includes('word') || mimeType?.includes('document')) return '📝'
    if (mimeType?.includes('sheet') || mimeType?.includes('excel')) return '📊'
    if (mimeType?.includes('image')) return '🖼️'
    if (mimeType?.includes('video')) return '🎥'
    return '📁'
  }

  const getImportanceBadge = (importance: string) => {
    switch (importance.toLowerCase()) {
      case 'critical':
      case 'high':
        return 'bg-red-100 text-red-800'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800'
      case 'low':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getRelativeTime = (dateString: string): string => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffInSeconds < 60) return 'Just now'
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`
    
    return date.toLocaleDateString()
  }

  const handleViewContact = (contactId: string) => {
    router.push(`/dashboard/client-management/contacts/${contactId}`)
  }

  const handleViewDocument = (documentId: string) => {
    router.push(`/dashboard/client-management/documents/${documentId}`)
  }

  const handleViewNote = (noteId: string) => {
    router.push(`/dashboard/client-management/notes/${noteId}`)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-4 mb-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Client Management</h1>
          <p className="text-sm text-gray-600">
            Manage your contacts, documents, and notes all in one place
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => handleTabChange('contacts')}
              className={`${
                activeTab === 'contacts'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2`}
            >
              <Users className="h-4 w-4" />
              <span>Contacts</span>
              <span className="ml-2 bg-gray-100 text-gray-900 py-0.5 px-2 rounded-full text-xs">
                {contacts.length}
              </span>
            </button>
            <button
              onClick={() => handleTabChange('documents')}
              className={`${
                activeTab === 'documents'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2`}
            >
              <FileText className="h-4 w-4" />
              <span>Documents</span>
              <span className="ml-2 bg-gray-100 text-gray-900 py-0.5 px-2 rounded-full text-xs">
                {documents.length}
              </span>
            </button>
            <button
              onClick={() => handleTabChange('notes')}
              className={`${
                activeTab === 'notes'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2`}
            >
              <StickyNote className="h-4 w-4" />
              <span>Notes</span>
              <span className="ml-2 bg-gray-100 text-gray-900 py-0.5 px-2 rounded-full text-xs">
                {notes.length}
              </span>
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {/* Toolbar */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
                <div className="flex-1 max-w-md">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder={`Search ${activeTab}...`}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button variant="outline" size="sm">
                    <Filter className="h-4 w-4 mr-2" />
                    Filter
                  </Button>
                  <Button
                    onClick={() => {
                      if (activeTab === 'contacts') setIsContactModalOpen(true)
                      else if (activeTab === 'documents') setIsDocumentModalOpen(true)
                      else if (activeTab === 'notes') setIsNoteModalOpen(true)
                    }}
                    className="bg-primary hover:bg-primary/90"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create {activeTab === 'contacts' ? 'Contact' : activeTab === 'documents' ? 'Document' : 'Note'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Contacts Tab */}
          {activeTab === 'contacts' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">All Contacts</CardTitle>
                <CardDescription className="text-xs">
                  {pagination.total} total contacts
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
                  </div>
                ) : contacts.length > 0 ? (
                  <div className="space-y-3">
                    {contacts.map((contact) => (
                      <div
                        key={contact._id}
                        onClick={() => handleViewContact(contact._id)}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center space-x-4 flex-1">
                          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-semibold text-blue-600">
                              {contact.personalInfo.firstName?.[0]}{contact.personalInfo.lastName?.[0]}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-medium text-gray-900 truncate">
                              {getContactDisplayName(contact)}
                            </h3>
                            <div className="flex items-center space-x-4 mt-1">
                              <div className="flex items-center space-x-1 text-xs text-gray-600">
                                <Mail className="h-3 w-3" />
                                <span className="truncate">{getPrimaryEmail(contact)}</span>
                              </div>
                              {getPrimaryPhone(contact) && (
                                <div className="flex items-center space-x-1 text-xs text-gray-600">
                                  <Phone className="h-3 w-3" />
                                  <span>{getPrimaryPhone(contact)}</span>
                                </div>
                              )}
                            </div>
                            {contact.professionalInfo?.jobTitle && (
                              <div className="flex items-center space-x-1 text-xs text-gray-500 mt-1">
                                <Briefcase className="h-3 w-3" />
                                <span>{contact.professionalInfo.jobTitle}</span>
                                {contact.professionalInfo.companyName && (
                                  <>
                                    <span>•</span>
                                    <Building2 className="h-3 w-3" />
                                    <span>{contact.professionalInfo.companyName}</span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span
                            className={`px-2 py-1 text-xs rounded-full ${
                              contact.isActive
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {contact.isActive ? 'Active' : 'Inactive'}
                          </span>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleViewContact(contact._id)
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Users className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-sm text-gray-600 mb-4">No contacts found</p>
                    <Button onClick={() => setIsContactModalOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Your First Contact
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Documents Tab */}
          {activeTab === 'documents' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">All Documents</CardTitle>
                <CardDescription className="text-xs">
                  {pagination.total} total documents
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
                  </div>
                ) : documents.length > 0 ? (
                  <div className="space-y-3">
                    {documents.map((doc) => (
                      <div
                        key={doc._id}
                        onClick={() => handleViewDocument(doc._id)}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center space-x-4 flex-1 min-w-0">
                          <div className="text-3xl flex-shrink-0">
                            {getFileIcon(doc?.file?.mimeType)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-medium text-gray-900 truncate">
                              {doc.documentInfo.displayName || doc.documentInfo.name}
                            </h3>
                            {doc.documentInfo.description && (
                              <p className="text-xs text-gray-600 truncate mt-1">
                                {doc.documentInfo.description}
                              </p>
                            )}
                            <div className="flex items-center space-x-3 mt-2 text-xs text-gray-500">
                              <span>{formatFileSize(doc?.file?.size)}</span>
                              <span>•</span>
                              <span>{getRelativeTime(doc?.createdAt)}</span>
                              <span>•</span>
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                                {doc.documentInfo.type}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              // Handle download
                            }}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleViewDocument(doc._id)
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-sm text-gray-600 mb-4">No documents found</p>
                    <Button onClick={() => setIsDocumentModalOpen(true)}>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Your First Document
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Notes Tab */}
          {activeTab === 'notes' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">All Notes</CardTitle>
                <CardDescription className="text-xs">
                  {pagination.total} total notes
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
                  </div>
                ) : notes.length > 0 ? (
                  <div className="space-y-3">
                    {notes.map((note) => (
                      <div
                        key={note._id}
                        onClick={() => handleViewNote(note._id)}
                        className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            {note.content.title && (
                              <h3 className="text-sm font-medium text-gray-900 mb-1">
                                {note.content.title}
                              </h3>
                            )}
                          </div>
                          <span
                            className={`text-xs px-2 py-1 rounded-full ${getImportanceBadge(
                              note.classification.importance
                            )}`}
                          >
                            {note.classification.importance}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                          {note.content.body}
                        </p>
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <div className="flex items-center space-x-3">
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                              {note.classification.type}
                            </span>
                            {note.classification.category?.primary && (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded">
                                {note.classification.category.primary}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-2">
                            <Clock className="h-3 w-3" />
                            <span>{getRelativeTime(note.createdAt)}</span>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-6 w-6 p-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleViewNote(note._id)
                              }}
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <StickyNote className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-sm text-gray-600 mb-4">No notes found</p>
                    <Button onClick={() => setIsNoteModalOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Your First Note
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Create Contact Modal */}
      <Dialog open={isContactModalOpen} onOpenChange={setIsContactModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Contact</DialogTitle>
            <DialogDescription className="text-xs">
              Add a new contact to your network
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-xs">First Name *</Label>
                <Input
                  id="firstName"
                  value={newContact.firstName}
                  onChange={(e) => setNewContact({ ...newContact, firstName: e.target.value })}
                  placeholder="John"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-xs">Last Name *</Label>
                <Input
                  id="lastName"
                  value={newContact.lastName}
                  onChange={(e) => setNewContact({ ...newContact, lastName: e.target.value })}
                  placeholder="Doe"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs">Email *</Label>
              <Input
                id="email"
                type="email"
                value={newContact.email}
                onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                placeholder="john.doe@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-xs">Phone</Label>
              <Input
                id="phone"
                value={newContact.phone}
                onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                placeholder="+1 (555) 123-4567"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jobTitle" className="text-xs">Job Title</Label>
              <Input
                id="jobTitle"
                value={newContact.jobTitle}
                onChange={(e) => setNewContact({ ...newContact, jobTitle: e.target.value })}
                placeholder="Software Engineer"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="company" className="text-xs">Company</Label>
                <Input
                  id="company"
                  value={newContact.company}
                  onChange={(e) => setNewContact({ ...newContact, company: e.target.value })}
                  placeholder="Acme Corp"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="department" className="text-xs">Department</Label>
                <Input
                  id="department"
                  value={newContact.department}
                  onChange={(e) => setNewContact({ ...newContact, department: e.target.value })}
                  placeholder="Engineering"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsContactModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateContact} disabled={isCreating}>
              {isCreating ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Contact'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Document Modal */}
      <Dialog open={isDocumentModalOpen} onOpenChange={setIsDocumentModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription className="text-xs">
              Upload a new document to your collection
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="file" className="text-xs">File *</Label>
              <Input
                id="file"
                type="file"
                onChange={(e) => setNewDocument(e.target.files?.[0] || null)}
              />
              {newDocument && (
                <p className="text-xs text-gray-600">
                  Selected: {newDocument.name} ({formatFileSize(newDocument.size)})
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName" className="text-xs">Display Name</Label>
              <Input
                id="displayName"
                value={documentMetadata.displayName}
                onChange={(e) => setDocumentMetadata({ ...documentMetadata, displayName: e.target.value })}
                placeholder="Optional custom name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description" className="text-xs">Description</Label>
              <Textarea
                id="description"
                value={documentMetadata.description}
                onChange={(e) => setDocumentMetadata({ ...documentMetadata, description: e.target.value })}
                placeholder="Brief description of the document"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type" className="text-xs">Document Type</Label>
              <Select
                value={documentMetadata.type}
                onValueChange={(value) => setDocumentMetadata({ ...documentMetadata, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="report">Report</SelectItem>
                  <SelectItem value="presentation">Presentation</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDocumentModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateDocument} disabled={isCreating || !newDocument}>
              {isCreating ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                'Upload Document'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Note Modal */}
      <Dialog open={isNoteModalOpen} onOpenChange={setIsNoteModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Note</DialogTitle>
            <DialogDescription className="text-xs">
              Add a new note to your collection
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-xs">Title</Label>
              <Input
                id="title"
                value={newNote.title}
                onChange={(e) => setNewNote({ ...newNote, title: e.target.value })}
                placeholder="Note title (optional)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="body" className="text-xs">Content *</Label>
              <Textarea
                id="body"
                value={newNote.body}
                onChange={(e) => setNewNote({ ...newNote, body: e.target.value })}
                placeholder="Enter your note content here..."
                rows={6}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type" className="text-xs">Type</Label>
                <Select
                  value={newNote.type}
                  onValueChange={(value) => setNewNote({ ...newNote, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="call">Call</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="task">Task</SelectItem>
                    <SelectItem value="reminder">Reminder</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="importance" className="text-xs">Importance</Label>
                <Select
                  value={newNote.importance}
                  onValueChange={(value) => setNewNote({ ...newNote, importance: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="category" className="text-xs">Category</Label>
              <Select
                value={newNote.category}
                onValueChange={(value) => setNewNote({ ...newNote, category: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="support">Support</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                  <SelectItem value="financial">Financial</SelectItem>
                  <SelectItem value="relationship">Relationship</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNoteModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateNote} disabled={isCreating}>
              {isCreating ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Note'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}