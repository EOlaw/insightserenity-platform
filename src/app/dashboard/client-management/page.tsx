'use client'

/**
 * @fileoverview Client Management Dashboard
 * @description Comprehensive client management interface for contacts, documents, and notes
 *              with professional modal-based creation workflows and enterprise design
 * @route /dashboard/client-management
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Users,
  FileText,
  StickyNote,
  Plus,
  Search,
  Filter,
  Download,
  Eye,
  Upload,
  RefreshCw,
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  Briefcase,
  Clock,
  X,
  CheckCircle,
  AlertCircle,
  File,
  FileImage,
  FileSpreadsheet,
  FileCode,
  FileArchive,
  Tag,
  FolderOpen,
  Lock,
  Loader2,
  User,
  AtSign,
  Globe,
  MapPin,
  Hash,
  MessageSquare,
  Star,
  Bookmark,
  Info
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '@/lib/api/client'

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

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

interface ContactFormData {
  firstName: string
  lastName: string
  email: string
  emailType: string
  phone: string
  phoneType: string
  jobTitle: string
  company: string
  department: string
  website: string
  address: string
  tags: string[]
}

interface DocumentMetadata {
  displayName: string
  description: string
  type: string
  primaryCategory: string
  classificationLevel: string
  keywords: string[]
  abstract: string
}

interface NoteFormData {
  title: string
  body: string
  type: string
  importance: string
  category: string
  tags: string[]
  isPinned: boolean
}

interface UploadState {
  isUploading: boolean
  progress: number
  status: 'idle' | 'uploading' | 'success' | 'error'
  message: string
}

type TabType = 'contacts' | 'documents' | 'notes'

// =============================================================================
// CONSTANTS
// =============================================================================

const documentTypes = [
  { value: 'contract', label: 'Contract' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'report', label: 'Report' },
  { value: 'presentation', label: 'Presentation' },
  { value: 'specification', label: 'Specification' },
  { value: 'legal', label: 'Legal Document' },
  { value: 'financial', label: 'Financial Document' },
  { value: 'technical', label: 'Technical Documentation' },
  { value: 'other', label: 'Other' }
]

const categoryOptions = [
  { value: 'business', label: 'Business' },
  { value: 'legal', label: 'Legal' },
  { value: 'financial', label: 'Financial' },
  { value: 'technical', label: 'Technical' },
  { value: 'operational', label: 'Operational' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'hr', label: 'Human Resources' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'strategic', label: 'Strategic' },
  { value: 'administrative', label: 'Administrative' }
]

const classificationLevels = [
  { value: 'public', label: 'Public', color: 'bg-green-100 text-green-800' },
  { value: 'internal', label: 'Internal', color: 'bg-blue-100 text-blue-800' },
  { value: 'confidential', label: 'Confidential', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'restricted', label: 'Restricted', color: 'bg-red-100 text-red-800' }
]

const noteTypes = [
  { value: 'general', label: 'General', icon: MessageSquare },
  { value: 'meeting', label: 'Meeting', icon: Users },
  { value: 'call', label: 'Call', icon: Phone },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'task', label: 'Task', icon: CheckCircle },
  { value: 'reminder', label: 'Reminder', icon: Clock }
]

const importanceLevels = [
  { value: 'low', label: 'Low', color: 'bg-gray-100 text-gray-800' },
  { value: 'medium', label: 'Medium', color: 'bg-blue-100 text-blue-800' },
  { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-800' },
  { value: 'critical', label: 'Critical', color: 'bg-red-100 text-red-800' }
]

const noteCategories = [
  { value: 'general', label: 'General' },
  { value: 'sales', label: 'Sales' },
  { value: 'support', label: 'Support' },
  { value: 'technical', label: 'Technical' },
  { value: 'financial', label: 'Financial' },
  { value: 'relationship', label: 'Relationship' },
  { value: 'follow-up', label: 'Follow-up' },
  { value: 'action-item', label: 'Action Item' }
]

const emailTypes = [
  { value: 'work', label: 'Work' },
  { value: 'personal', label: 'Personal' },
  { value: 'other', label: 'Other' }
]

const phoneTypes = [
  { value: 'office', label: 'Office' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'home', label: 'Home' },
  { value: 'fax', label: 'Fax' }
]

const MAX_FILE_SIZE = 50 * 1024 * 1024
const ALLOWED_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.rtf', '.csv', '.json', '.xml',
  '.jpg', '.jpeg', '.png', '.gif', '.svg',
  '.zip', '.rar', '.7z'
]

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function ClientManagementPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fileInputRef = useRef<HTMLInputElement>(null)
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

  // Contact form state
  const [contactForm, setContactForm] = useState<ContactFormData>({
    firstName: '',
    lastName: '',
    email: '',
    emailType: 'work',
    phone: '',
    phoneType: 'office',
    jobTitle: '',
    company: '',
    department: '',
    website: '',
    address: '',
    tags: []
  })
  const [contactTagInput, setContactTagInput] = useState('')

  // Document upload states
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [documentKeywordInput, setDocumentKeywordInput] = useState('')
  const [documentMetadata, setDocumentMetadata] = useState<DocumentMetadata>({
    displayName: '',
    description: '',
    type: 'other',
    primaryCategory: 'business',
    classificationLevel: 'internal',
    keywords: [],
    abstract: ''
  })
  const [uploadState, setUploadState] = useState<UploadState>({
    isUploading: false,
    progress: 0,
    status: 'idle',
    message: ''
  })

  // Note form state
  const [noteForm, setNoteForm] = useState<NoteFormData>({
    title: '',
    body: '',
    type: 'general',
    importance: 'medium',
    category: 'general',
    tags: [],
    isPinned: false
  })
  const [noteTagInput, setNoteTagInput] = useState('')

  // Filter states
  const [contactFilters, setContactFilters] = useState({
    status: 'all',
    hasEmail: 'all',
    hasPhone: 'all'
  })
  const [documentFilters, setDocumentFilters] = useState({
    type: 'all',
    category: 'all',
    classification: 'all'
  })
  const [noteFilters, setNoteFilters] = useState({
    type: 'all',
    importance: 'all',
    category: 'all'
  })
  const [isFilterOpen, setIsFilterOpen] = useState(false)

  // =============================================================================
  // FILTERED DATA COMPUTATIONS
  // =============================================================================

  const filteredContacts = contacts.filter(contact => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const name = getContactDisplayName(contact).toLowerCase()
      const email = getPrimaryEmail(contact).toLowerCase()
      const phone = getPrimaryPhone(contact)?.toLowerCase() || ''
      const company = contact.professionalInfo?.companyName?.toLowerCase() || ''
      const jobTitle = contact.professionalInfo?.jobTitle?.toLowerCase() || ''
      
      if (!name.includes(query) && !email.includes(query) && !phone.includes(query) && !company.includes(query) && !jobTitle.includes(query)) {
        return false
      }
    }
    
    // Status filter
    if (contactFilters.status !== 'all') {
      const isActive = contact.status?.isActive ?? (contact as any).isActive ?? true
      if (contactFilters.status === 'active' && !isActive) return false
      if (contactFilters.status === 'inactive' && isActive) return false
    }
    
    // Has email filter
    if (contactFilters.hasEmail !== 'all') {
      const hasEmail = contact.contactDetails?.emails && contact.contactDetails.emails.length > 0
      if (contactFilters.hasEmail === 'yes' && !hasEmail) return false
      if (contactFilters.hasEmail === 'no' && hasEmail) return false
    }
    
    // Has phone filter
    if (contactFilters.hasPhone !== 'all') {
      const hasPhone = contact.contactDetails?.phones && contact.contactDetails.phones.length > 0
      if (contactFilters.hasPhone === 'yes' && !hasPhone) return false
      if (contactFilters.hasPhone === 'no' && hasPhone) return false
    }
    
    return true
  })

  const filteredDocuments = documents.filter(doc => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const name = (doc.documentInfo.displayName || doc.documentInfo.name).toLowerCase()
      const description = doc.documentInfo.description?.toLowerCase() || ''
      const type = doc.documentInfo.type?.toLowerCase() || ''
      
      if (!name.includes(query) && !description.includes(query) && !type.includes(query)) {
        return false
      }
    }
    
    // Type filter
    if (documentFilters.type !== 'all' && doc.documentInfo.type !== documentFilters.type) {
      return false
    }
    
    return true
  })

  const filteredNotes = notes.filter(note => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const title = note.content.title?.toLowerCase() || ''
      const body = note.content.body.toLowerCase()
      const type = note.classification.type?.toLowerCase() || ''
      
      if (!title.includes(query) && !body.includes(query) && !type.includes(query)) {
        return false
      }
    }
    
    // Type filter
    if (noteFilters.type !== 'all' && note.classification.type !== noteFilters.type) {
      return false
    }
    
    // Importance filter
    if (noteFilters.importance !== 'all' && note.classification.importance !== noteFilters.importance) {
      return false
    }
    
    // Category filter
    if (noteFilters.category !== 'all' && note.classification.category?.primary !== noteFilters.category) {
      return false
    }
    
    return true
  })

  // Check if any filters are active
  const hasActiveContactFilters = contactFilters.status !== 'all' || contactFilters.hasEmail !== 'all' || contactFilters.hasPhone !== 'all'
  const hasActiveDocumentFilters = documentFilters.type !== 'all' || documentFilters.category !== 'all' || documentFilters.classification !== 'all'
  const hasActiveNoteFilters = noteFilters.type !== 'all' || noteFilters.importance !== 'all' || noteFilters.category !== 'all'

  const clearContactFilters = () => {
    setContactFilters({ status: 'all', hasEmail: 'all', hasPhone: 'all' })
  }

  const clearDocumentFilters = () => {
    setDocumentFilters({ type: 'all', category: 'all', classification: 'all' })
  }

  const clearNoteFilters = () => {
    setNoteFilters({ type: 'all', importance: 'all', category: 'all' })
  }

  // =============================================================================
  // HELPER FUNCTIONS
  // =============================================================================

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

  const getFileIconComponent = (file: File) => {
    const type = file.type
    const name = file.name.toLowerCase()

    if (type.includes('pdf')) return <FileText className="h-6 w-6 text-red-500" />
    if (type.includes('image')) return <FileImage className="h-6 w-6 text-blue-500" />
    if (type.includes('spreadsheet') || name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
      return <FileSpreadsheet className="h-6 w-6 text-green-500" />
    }
    if (type.includes('presentation') || name.endsWith('.pptx') || name.endsWith('.ppt')) {
      return <FileText className="h-6 w-6 text-orange-500" />
    }
    if (type.includes('zip') || type.includes('archive') || name.endsWith('.rar') || name.endsWith('.7z')) {
      return <FileArchive className="h-6 w-6 text-yellow-500" />
    }
    if (type.includes('json') || type.includes('xml') || type.includes('javascript')) {
      return <FileCode className="h-6 w-6 text-purple-500" />
    }
    return <File className="h-6 w-6 text-gray-500" />
  }

  const getImportanceBadge = (importance: string) => {
    const level = importanceLevels.find(l => l.value === importance.toLowerCase())
    return level?.color || 'bg-gray-100 text-gray-800'
  }

  const getRelativeTime = (dateString: string): string => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffInSeconds < 60) return 'Just now'
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`
    
    return date.toLocaleDateString()
  }

  // =============================================================================
  // FILE HANDLING
  // =============================================================================

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return `File size exceeds maximum limit of ${formatFileSize(MAX_FILE_SIZE)}`
    }
    const extension = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return `File type not allowed`
    }
    return null
  }

  const handleFileSelect = useCallback((file: File) => {
    const error = validateFile(file)
    if (error) {
      toast.error(error)
      return
    }
    setSelectedFile(file)
    if (!documentMetadata.displayName) {
      const nameWithoutExtension = file.name.replace(/\.[^/.]+$/, '')
      setDocumentMetadata(prev => ({
        ...prev,
        displayName: nameWithoutExtension
      }))
    }
  }, [documentMetadata.displayName])

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  // =============================================================================
  // TAG HANDLERS
  // =============================================================================

  const handleAddContactTag = () => {
    const tag = contactTagInput.trim().toLowerCase()
    if (tag && !contactForm.tags.includes(tag)) {
      setContactForm(prev => ({
        ...prev,
        tags: [...prev.tags, tag]
      }))
      setContactTagInput('')
    }
  }

  const handleRemoveContactTag = (tag: string) => {
    setContactForm(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag)
    }))
  }

  const handleAddDocumentKeyword = () => {
    const keyword = documentKeywordInput.trim().toLowerCase()
    if (keyword && !documentMetadata.keywords.includes(keyword)) {
      setDocumentMetadata(prev => ({
        ...prev,
        keywords: [...prev.keywords, keyword]
      }))
      setDocumentKeywordInput('')
    }
  }

  const handleRemoveDocumentKeyword = (keyword: string) => {
    setDocumentMetadata(prev => ({
      ...prev,
      keywords: prev.keywords.filter(k => k !== keyword)
    }))
  }

  const handleAddNoteTag = () => {
    const tag = noteTagInput.trim().toLowerCase()
    if (tag && !noteForm.tags.includes(tag)) {
      setNoteForm(prev => ({
        ...prev,
        tags: [...prev.tags, tag]
      }))
      setNoteTagInput('')
    }
  }

  const handleRemoveNoteTag = (tag: string) => {
    setNoteForm(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag)
    }))
  }

  // =============================================================================
  // DATA LOADING
  // =============================================================================

  useEffect(() => {
    const tab = searchParams.get('tab') as TabType
    if (tab && ['contacts', 'documents', 'notes'].includes(tab)) {
      setActiveTab(tab)
    }
  }, [searchParams])

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

  // =============================================================================
  // FORM SUBMISSIONS
  // =============================================================================

  const handleCreateContact = async () => {
    if (!contactForm.firstName || !contactForm.lastName || !contactForm.email) {
      toast.error('Please fill in all required fields')
      return
    }

    setIsCreating(true)
    try {
      const contactData = {
        personalInfo: {
          firstName: contactForm.firstName,
          lastName: contactForm.lastName,
          displayName: `${contactForm.firstName} ${contactForm.lastName}`
        },
        professionalInfo: {
          jobTitle: contactForm.jobTitle || undefined,
          companyName: contactForm.company || undefined,
          department: contactForm.department || undefined
        },
        contactDetails: {
          emails: [{
            type: contactForm.emailType,
            address: contactForm.email,
            isPrimary: true,
            isVerified: false
          }],
          phones: contactForm.phone ? [{
            type: contactForm.phoneType,
            number: contactForm.phone,
            isPrimary: true
          }] : []
        },
        metadata: {
          tags: contactForm.tags
        }
      }

      await api.post('/clients/contacts', contactData)
      toast.success('Contact created successfully')
      setIsContactModalOpen(false)
      resetContactForm()
      loadContacts()
    } catch (error: any) {
      console.error('Failed to create contact:', error)
      toast.error(error.response?.data?.message || 'Failed to create contact')
    } finally {
      setIsCreating(false)
    }
  }

  const handleCreateDocument = async () => {
    if (!selectedFile) {
      toast.error('Please select a file to upload')
      return
    }

    setUploadState({
      isUploading: true,
      progress: 0,
      status: 'uploading',
      message: 'Preparing upload...'
    })

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('name', documentMetadata.displayName || selectedFile.name.replace(/\.[^/.]+$/, ''))
      formData.append('displayName', documentMetadata.displayName || selectedFile.name)
      formData.append('type', documentMetadata.type)

      if (documentMetadata.description) {
        formData.append('description', documentMetadata.description)
      }
      if (documentMetadata.primaryCategory) {
        formData.append('primaryCategory', documentMetadata.primaryCategory)
      }
      if (documentMetadata.classificationLevel) {
        formData.append('classificationLevel', documentMetadata.classificationLevel)
      }
      if (documentMetadata.abstract) {
        formData.append('abstract', documentMetadata.abstract)
      }
      if (documentMetadata.keywords.length > 0) {
        formData.append('keywords', JSON.stringify(documentMetadata.keywords))
      }

      const progressInterval = setInterval(() => {
        setUploadState(prev => ({
          ...prev,
          progress: Math.min(prev.progress + 10, 90),
          message: prev.progress < 30 ? 'Uploading file...' :
            prev.progress < 60 ? 'Processing document...' :
              'Finalizing...'
        }))
      }, 300)

      await api.post('/clients/documents', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      clearInterval(progressInterval)

      setUploadState({
        isUploading: false,
        progress: 100,
        status: 'success',
        message: 'Document uploaded successfully!'
      })

      toast.success('Document uploaded successfully')

      setTimeout(() => {
        setIsDocumentModalOpen(false)
        resetDocumentForm()
        loadDocuments()
      }, 1000)

    } catch (error: any) {
      console.error('Upload failed:', error)
      setUploadState({
        isUploading: false,
        progress: 0,
        status: 'error',
        message: error.response?.data?.message || 'Failed to upload document'
      })
      toast.error(error.response?.data?.message || 'Failed to upload document')
    }
  }

  const handleCreateNote = async () => {
    if (!noteForm.body) {
      toast.error('Please enter note content')
      return
    }

    setIsCreating(true)
    try {
      const noteData = {
        content: {
          title: noteForm.title || undefined,
          body: noteForm.body
        },
        classification: {
          type: noteForm.type,
          importance: noteForm.importance,
          category: {
            primary: noteForm.category
          }
        },
        metadata: {
          tags: noteForm.tags,
          isPinned: noteForm.isPinned
        }
      }

      await api.post('/clients/notes', noteData)
      toast.success('Note created successfully')
      setIsNoteModalOpen(false)
      resetNoteForm()
      loadNotes()
    } catch (error: any) {
      console.error('Failed to create note:', error)
      toast.error(error.response?.data?.message || 'Failed to create note')
    } finally {
      setIsCreating(false)
    }
  }

  // =============================================================================
  // FORM RESET FUNCTIONS
  // =============================================================================

  const resetContactForm = () => {
    setContactForm({
      firstName: '',
      lastName: '',
      email: '',
      emailType: 'work',
      phone: '',
      phoneType: 'office',
      jobTitle: '',
      company: '',
      department: '',
      website: '',
      address: '',
      tags: []
    })
    setContactTagInput('')
  }

  const resetDocumentForm = () => {
    setSelectedFile(null)
    setDocumentMetadata({
      displayName: '',
      description: '',
      type: 'other',
      primaryCategory: 'business',
      classificationLevel: 'internal',
      keywords: [],
      abstract: ''
    })
    setDocumentKeywordInput('')
    setUploadState({
      isUploading: false,
      progress: 0,
      status: 'idle',
      message: ''
    })
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const resetNoteForm = () => {
    setNoteForm({
      title: '',
      body: '',
      type: 'general',
      importance: 'medium',
      category: 'general',
      tags: [],
      isPinned: false
    })
    setNoteTagInput('')
  }

  // =============================================================================
  // NAVIGATION HANDLERS
  // =============================================================================

  const handleViewContact = (contactId: string) => {
    router.push(`/dashboard/client-management/contacts/${contactId}`)
  }

  const handleViewDocument = (documentId: string) => {
    router.push(`/dashboard/client-management/documents/${documentId}`)
  }

  const handleViewNote = (noteId: string) => {
    router.push(`/dashboard/client-management/notes/${noteId}`)
  }

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-4 mb-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-900">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Client Management</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Manage your contacts, documents, and notes in one centralized location
              </p>
            </div>
            <div className="hidden sm:flex items-center space-x-2">
              <div className="flex items-center space-x-1 text-xs text-gray-500">
                <div className="w-2 h-2 bg-[#ffc451] rounded-full"></div>
                <span>InsightSerenity Platform</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => handleTabChange('contacts')}
              className={`${
                activeTab === 'contacts'
                  ? 'border-[#ffc451] text-[#ffc451]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors`}
            >
              <Users className="h-4 w-4" />
              <span>Contacts</span>
              <span className={`ml-2 py-0.5 px-2.5 rounded-full text-xs font-medium ${
                activeTab === 'contacts' 
                  ? 'bg-[#ffc451]/10 text-[#ffc451]' 
                  : 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
              }`}>
                {contacts.length}
              </span>
            </button>
            <button
              onClick={() => handleTabChange('documents')}
              className={`${
                activeTab === 'documents'
                  ? 'border-[#ffc451] text-[#ffc451]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors`}
            >
              <FileText className="h-4 w-4" />
              <span>Documents</span>
              <span className={`ml-2 py-0.5 px-2.5 rounded-full text-xs font-medium ${
                activeTab === 'documents' 
                  ? 'bg-[#ffc451]/10 text-[#ffc451]' 
                  : 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
              }`}>
                {documents.length}
              </span>
            </button>
            <button
              onClick={() => handleTabChange('notes')}
              className={`${
                activeTab === 'notes'
                  ? 'border-[#ffc451] text-[#ffc451]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors`}
            >
              <StickyNote className="h-4 w-4" />
              <span>Notes</span>
              <span className={`ml-2 py-0.5 px-2.5 rounded-full text-xs font-medium ${
                activeTab === 'notes' 
                  ? 'bg-[#ffc451]/10 text-[#ffc451]' 
                  : 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
              }`}>
                {notes.length}
              </span>
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {/* Toolbar */}
          <Card className="border-gray-200 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
                <div className="flex-1 max-w-md">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder={`Search ${activeTab}...`}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 border-gray-300 focus:border-[#ffc451] focus:ring-[#ffc451]"
                    />
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {/* Filter Popover */}
                  <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                    <PopoverTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className={`border-gray-300 ${
                          (activeTab === 'contacts' && hasActiveContactFilters) ||
                          (activeTab === 'documents' && hasActiveDocumentFilters) ||
                          (activeTab === 'notes' && hasActiveNoteFilters)
                            ? 'bg-[#ffc451]/10 border-[#ffc451] text-[#ffc451]'
                            : ''
                        }`}
                      >
                        <Filter className="h-4 w-4 mr-2" />
                        Filter
                        {((activeTab === 'contacts' && hasActiveContactFilters) ||
                          (activeTab === 'documents' && hasActiveDocumentFilters) ||
                          (activeTab === 'notes' && hasActiveNoteFilters)) && (
                          <span className="ml-1.5 w-2 h-2 bg-[#ffc451] rounded-full"></span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-4" align="end">
                      {/* Contact Filters */}
                      {activeTab === 'contacts' && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-gray-900">Filter Contacts</h4>
                            {hasActiveContactFilters && (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-auto p-0 text-xs text-[#ffc451] hover:text-[#ffc451]/80"
                                onClick={clearContactFilters}
                              >
                                Clear all
                              </Button>
                            )}
                          </div>
                          <div className="space-y-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs font-medium">Status</Label>
                              <Select
                                value={contactFilters.status}
                                onValueChange={(value) => setContactFilters(prev => ({ ...prev, status: value }))}
                              >
                                <SelectTrigger className="text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All</SelectItem>
                                  <SelectItem value="active">Active</SelectItem>
                                  <SelectItem value="inactive">Inactive</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-medium">Has Email</Label>
                              <Select
                                value={contactFilters.hasEmail}
                                onValueChange={(value) => setContactFilters(prev => ({ ...prev, hasEmail: value }))}
                              >
                                <SelectTrigger className="text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All</SelectItem>
                                  <SelectItem value="yes">Yes</SelectItem>
                                  <SelectItem value="no">No</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-medium">Has Phone</Label>
                              <Select
                                value={contactFilters.hasPhone}
                                onValueChange={(value) => setContactFilters(prev => ({ ...prev, hasPhone: value }))}
                              >
                                <SelectTrigger className="text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All</SelectItem>
                                  <SelectItem value="yes">Yes</SelectItem>
                                  <SelectItem value="no">No</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Document Filters */}
                      {activeTab === 'documents' && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-gray-900">Filter Documents</h4>
                            {hasActiveDocumentFilters && (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-auto p-0 text-xs text-[#ffc451] hover:text-[#ffc451]/80"
                                onClick={clearDocumentFilters}
                              >
                                Clear all
                              </Button>
                            )}
                          </div>
                          <div className="space-y-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs font-medium">Document Type</Label>
                              <Select
                                value={documentFilters.type}
                                onValueChange={(value) => setDocumentFilters(prev => ({ ...prev, type: value }))}
                              >
                                <SelectTrigger className="text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All Types</SelectItem>
                                  {documentTypes.map((type) => (
                                    <SelectItem key={type.value} value={type.value} className="text-sm">
                                      {type.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-medium">Category</Label>
                              <Select
                                value={documentFilters.category}
                                onValueChange={(value) => setDocumentFilters(prev => ({ ...prev, category: value }))}
                              >
                                <SelectTrigger className="text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All Categories</SelectItem>
                                  {categoryOptions.map((cat) => (
                                    <SelectItem key={cat.value} value={cat.value} className="text-sm">
                                      {cat.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-medium">Classification</Label>
                              <Select
                                value={documentFilters.classification}
                                onValueChange={(value) => setDocumentFilters(prev => ({ ...prev, classification: value }))}
                              >
                                <SelectTrigger className="text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All Levels</SelectItem>
                                  {classificationLevels.map((level) => (
                                    <SelectItem key={level.value} value={level.value} className="text-sm">
                                      {level.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Note Filters */}
                      {activeTab === 'notes' && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-gray-900">Filter Notes</h4>
                            {hasActiveNoteFilters && (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-auto p-0 text-xs text-[#ffc451] hover:text-[#ffc451]/80"
                                onClick={clearNoteFilters}
                              >
                                Clear all
                              </Button>
                            )}
                          </div>
                          <div className="space-y-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs font-medium">Type</Label>
                              <Select
                                value={noteFilters.type}
                                onValueChange={(value) => setNoteFilters(prev => ({ ...prev, type: value }))}
                              >
                                <SelectTrigger className="text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All Types</SelectItem>
                                  {noteTypes.map((type) => (
                                    <SelectItem key={type.value} value={type.value} className="text-sm">
                                      {type.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-medium">Importance</Label>
                              <Select
                                value={noteFilters.importance}
                                onValueChange={(value) => setNoteFilters(prev => ({ ...prev, importance: value }))}
                              >
                                <SelectTrigger className="text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All Levels</SelectItem>
                                  {importanceLevels.map((level) => (
                                    <SelectItem key={level.value} value={level.value} className="text-sm">
                                      {level.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-medium">Category</Label>
                              <Select
                                value={noteFilters.category}
                                onValueChange={(value) => setNoteFilters(prev => ({ ...prev, category: value }))}
                              >
                                <SelectTrigger className="text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All Categories</SelectItem>
                                  {noteCategories.map((cat) => (
                                    <SelectItem key={cat.value} value={cat.value} className="text-sm">
                                      {cat.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                  <Button
                    onClick={() => {
                      if (activeTab === 'contacts') setIsContactModalOpen(true)
                      else if (activeTab === 'documents') setIsDocumentModalOpen(true)
                      else if (activeTab === 'notes') setIsNoteModalOpen(true)
                    }}
                    className="bg-[#ffc451] hover:bg-[#ffc451]/90 text-black font-medium"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {activeTab === 'contacts' ? 'New Contact' : activeTab === 'documents' ? 'Upload Document' : 'New Note'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Contacts Tab */}
          {activeTab === 'contacts' && (
            <Card className="border-gray-200 dark:border-gray-700">
              <CardHeader className="border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold">All Contacts</CardTitle>
                    <CardDescription className="text-xs">
                      {filteredContacts.length} of {contacts.length} contacts
                      {(searchQuery || hasActiveContactFilters) && ' (filtered)'}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="text-center">
                      <RefreshCw className="h-8 w-8 animate-spin text-[#ffc451] mx-auto mb-3" />
                      <p className="text-sm text-gray-500">Loading contacts...</p>
                    </div>
                  </div>
                ) : filteredContacts.length > 0 ? (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {filteredContacts.map((contact) => (
                      <div
                        key={contact._id}
                        onClick={() => handleViewContact(contact._id)}
                        className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center space-x-4 flex-1">
                          <div className="w-11 h-11 bg-gradient-to-br from-[#ffc451]/20 to-[#ffc451]/5 rounded-full flex items-center justify-center flex-shrink-0 border border-[#ffc451]/20">
                            <span className="text-sm font-semibold text-[#ffc451]">
                              {contact.personalInfo.firstName?.[0]}{contact.personalInfo.lastName?.[0]}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {getContactDisplayName(contact)}
                            </h3>
                            <div className="flex items-center space-x-4 mt-1">
                              <div className="flex items-center space-x-1.5 text-xs text-gray-500">
                                <Mail className="h-3 w-3" />
                                <span className="truncate max-w-[200px]">{getPrimaryEmail(contact)}</span>
                              </div>
                              {getPrimaryPhone(contact) && (
                                <div className="flex items-center space-x-1.5 text-xs text-gray-500">
                                  <Phone className="h-3 w-3" />
                                  <span>{getPrimaryPhone(contact)}</span>
                                </div>
                              )}
                            </div>
                            {contact.professionalInfo?.jobTitle && (
                              <div className="flex items-center space-x-1.5 text-xs text-gray-400 mt-1">
                                <Briefcase className="h-3 w-3" />
                                <span>{contact.professionalInfo.jobTitle}</span>
                                {contact.professionalInfo.companyName && (
                                  <>
                                    <span className="text-gray-300">•</span>
                                    <span>{contact.professionalInfo.companyName}</span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <span
                            className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                              (contact.status?.isActive ?? (contact as any).isActive ?? true)
                                ? 'bg-green-50 text-green-700 border border-green-200'
                                : 'bg-gray-50 text-gray-600 border border-gray-200'
                            }`}
                          >
                            {(contact.status?.isActive ?? (contact as any).isActive ?? true) ? 'Active' : 'Inactive'}
                          </span>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="text-gray-400 hover:bg-[#ffc451]/10 hover:text-gray-900"
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
                ) : contacts.length > 0 ? (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Search className="h-8 w-8 text-gray-400" />
                    </div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">No contacts found</h3>
                    <p className="text-xs text-gray-500 mb-4">Try adjusting your search or filters</p>
                    <Button 
                      variant="outline"
                      onClick={() => {
                        setSearchQuery('')
                        clearContactFilters()
                      }}
                      className="text-sm"
                    >
                      Clear filters
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 bg-[#ffc451]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Users className="h-8 w-8 text-[#ffc451]" />
                    </div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">No contacts yet</h3>
                    <p className="text-xs text-gray-500 mb-4">Get started by creating your first contact</p>
                    <Button 
                      onClick={() => setIsContactModalOpen(true)}
                      className="bg-[#ffc451] hover:bg-[#ffc451]/90 text-black font-medium"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create Contact
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Documents Tab */}
          {activeTab === 'documents' && (
            <Card className="border-gray-200 dark:border-gray-700">
              <CardHeader className="border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold">All Documents</CardTitle>
                    <CardDescription className="text-xs">
                      {filteredDocuments.length} of {documents.length} documents
                      {(searchQuery || hasActiveDocumentFilters) && ' (filtered)'}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="text-center">
                      <RefreshCw className="h-8 w-8 animate-spin text-[#ffc451] mx-auto mb-3" />
                      <p className="text-sm text-gray-500">Loading documents...</p>
                    </div>
                  </div>
                ) : filteredDocuments.length > 0 ? (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {filteredDocuments.map((doc) => (
                      <div
                        key={doc._id}
                        onClick={() => handleViewDocument(doc._id)}
                        className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center space-x-4 flex-1 min-w-0">
                          <div className="text-2xl flex-shrink-0">
                            {getFileIcon(doc?.file?.mimeType)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {doc.documentInfo.displayName || doc.documentInfo.name}
                            </h3>
                            {doc.documentInfo.description && (
                              <p className="text-xs text-gray-500 truncate mt-0.5">
                                {doc.documentInfo.description}
                              </p>
                            )}
                            <div className="flex items-center space-x-3 mt-2 text-xs text-gray-400">
                              <span>{formatFileSize(doc?.file?.size)}</span>
                              <span className="text-gray-300">•</span>
                              <span>{getRelativeTime(doc?.createdAt)}</span>
                              <span className="text-gray-300">•</span>
                              <span className="px-2 py-0.5 bg-[#ffc451]/10 text-[#ffc451] rounded font-medium">
                                {doc.documentInfo.type}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="text-gray-400 hover:bg-[#ffc451]/10 hover:text-gray-900"
                            onClick={(e) => {
                              e.stopPropagation()
                            }}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="text-gray-400 hover:bg-[#ffc451]/10 hover:text-gray-900"
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
                ) : documents.length > 0 ? (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Search className="h-8 w-8 text-gray-400" />
                    </div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">No documents found</h3>
                    <p className="text-xs text-gray-500 mb-4">Try adjusting your search or filters</p>
                    <Button 
                      variant="outline"
                      onClick={() => {
                        setSearchQuery('')
                        clearDocumentFilters()
                      }}
                      className="text-sm"
                    >
                      Clear filters
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 bg-[#ffc451]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <FileText className="h-8 w-8 text-[#ffc451]" />
                    </div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">No documents yet</h3>
                    <p className="text-xs text-gray-500 mb-4">Upload your first document to get started</p>
                    <Button 
                      onClick={() => setIsDocumentModalOpen(true)}
                      className="bg-[#ffc451] hover:bg-[#ffc451]/90 text-black font-medium"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Document
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Notes Tab */}
          {activeTab === 'notes' && (
            <Card className="border-gray-200 dark:border-gray-700">
              <CardHeader className="border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold">All Notes</CardTitle>
                    <CardDescription className="text-xs">
                      {filteredNotes.length} of {notes.length} notes
                      {(searchQuery || hasActiveNoteFilters) && ' (filtered)'}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="text-center">
                      <RefreshCw className="h-8 w-8 animate-spin text-[#ffc451] mx-auto mb-3" />
                      <p className="text-sm text-gray-500">Loading notes...</p>
                    </div>
                  </div>
                ) : filteredNotes.length > 0 ? (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {filteredNotes.map((note) => (
                      <div
                        key={note._id}
                        onClick={() => handleViewNote(note._id)}
                        className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            {note.content.title ? (
                              <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                                {note.content.title}
                              </h3>
                            ) : (
                              <h3 className="text-sm font-medium text-gray-400 italic">
                                Untitled Note
                              </h3>
                            )}
                          </div>
                          <span
                            className={`text-xs px-2 py-1 rounded-full font-medium ${getImportanceBadge(
                              note.classification.importance
                            )}`}
                          >
                            {note.classification.importance}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 line-clamp-2">
                          {note.content.body}
                        </p>
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center space-x-2">
                            <span className="px-2 py-0.5 bg-[#ffc451]/10 text-[#ffc451] rounded font-medium">
                              {note.classification.type}
                            </span>
                            {note.classification.category?.primary && (
                              <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded font-medium">
                                {note.classification.category.primary}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-2 text-gray-400">
                            <Clock className="h-3 w-3" />
                            <span>{getRelativeTime(note.createdAt)}</span>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-6 w-6 p-0 text-gray-400 hover:bg-[#ffc451]/10 hover:text-gray-900"
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
                ) : notes.length > 0 ? (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Search className="h-8 w-8 text-gray-400" />
                    </div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">No notes found</h3>
                    <p className="text-xs text-gray-500 mb-4">Try adjusting your search or filters</p>
                    <Button 
                      variant="outline"
                      onClick={() => {
                        setSearchQuery('')
                        clearNoteFilters()
                      }}
                      className="text-sm"
                    >
                      Clear filters
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 bg-[#ffc451]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <StickyNote className="h-8 w-8 text-[#ffc451]" />
                    </div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">No notes yet</h3>
                    <p className="text-xs text-gray-500 mb-4">Create your first note to get started</p>
                    <Button 
                      onClick={() => setIsNoteModalOpen(true)}
                      className="bg-[#ffc451] hover:bg-[#ffc451]/90 text-black font-medium"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create Note
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* CREATE CONTACT MODAL */}
      {/* ========================================================================= */}
      <Dialog open={isContactModalOpen} onOpenChange={(open) => {
        setIsContactModalOpen(open)
        if (!open) resetContactForm()
      }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-4 border-b border-gray-100">
            <DialogTitle className="flex items-center text-lg">
              <div className="w-8 h-8 bg-[#ffc451]/10 rounded-lg flex items-center justify-center mr-3">
                <User className="h-4 w-4 text-[#ffc451]" />
              </div>
              Create New Contact
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Add a new contact to your professional network
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-5 py-4">
            {/* Personal Information */}
            <div>
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center">
                <User className="h-3.5 w-3.5 mr-2 text-[#ffc451]" />
                Personal Information
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName" className="text-xs font-medium">
                    First Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="firstName"
                    value={contactForm.firstName}
                    onChange={(e) => setContactForm({ ...contactForm, firstName: e.target.value })}
                    placeholder="John"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName" className="text-xs font-medium">
                    Last Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="lastName"
                    value={contactForm.lastName}
                    onChange={(e) => setContactForm({ ...contactForm, lastName: e.target.value })}
                    placeholder="Doe"
                    className="text-sm"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Contact Details */}
            <div>
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center">
                <AtSign className="h-3.5 w-3.5 mr-2 text-[#ffc451]" />
                Contact Details
              </h4>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <Label htmlFor="email" className="text-xs font-medium">
                      Email <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={contactForm.email}
                      onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                      placeholder="john.doe@example.com"
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="emailType" className="text-xs font-medium">Type</Label>
                    <Select
                      value={contactForm.emailType}
                      onValueChange={(value) => setContactForm({ ...contactForm, emailType: value })}
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {emailTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value} className="text-sm">
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <Label htmlFor="phone" className="text-xs font-medium">Phone</Label>
                    <Input
                      id="phone"
                      value={contactForm.phone}
                      onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                      placeholder="+1 (555) 123-4567"
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phoneType" className="text-xs font-medium">Type</Label>
                    <Select
                      value={contactForm.phoneType}
                      onValueChange={(value) => setContactForm({ ...contactForm, phoneType: value })}
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {phoneTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value} className="text-sm">
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Professional Information */}
            <div>
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center">
                <Briefcase className="h-3.5 w-3.5 mr-2 text-[#ffc451]" />
                Professional Information
              </h4>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="jobTitle" className="text-xs font-medium">Job Title</Label>
                  <Input
                    id="jobTitle"
                    value={contactForm.jobTitle}
                    onChange={(e) => setContactForm({ ...contactForm, jobTitle: e.target.value })}
                    placeholder="Software Engineer"
                    className="text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="company" className="text-xs font-medium">Company</Label>
                    <Input
                      id="company"
                      value={contactForm.company}
                      onChange={(e) => setContactForm({ ...contactForm, company: e.target.value })}
                      placeholder="Acme Corporation"
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="department" className="text-xs font-medium">Department</Label>
                    <Input
                      id="department"
                      value={contactForm.department}
                      onChange={(e) => setContactForm({ ...contactForm, department: e.target.value })}
                      placeholder="Engineering"
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Tags */}
            <div>
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center">
                <Tag className="h-3.5 w-3.5 mr-2 text-[#ffc451]" />
                Tags
              </h4>
              <div className="space-y-2">
                <div className="flex space-x-2">
                  <Input
                    value={contactTagInput}
                    onChange={(e) => setContactTagInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddContactTag())}
                    placeholder="Add tag and press Enter"
                    className="text-sm"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={handleAddContactTag}>
                    Add
                  </Button>
                </div>
                {contactForm.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {contactForm.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="text-xs px-2 py-0.5 bg-[#ffc451]/10 text-[#ffc451] border-[#ffc451]/20 hover:bg-[#ffc451]/20"
                      >
                        {tag}
                        <button
                          onClick={() => handleRemoveContactTag(tag)}
                          className="ml-1.5 hover:text-red-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-gray-100">
            <Button variant="outline" onClick={() => {
              setIsContactModalOpen(false)
              resetContactForm()
            }}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateContact} 
              disabled={isCreating}
              className="bg-[#ffc451] hover:bg-[#ffc451]/90 text-black font-medium"
            >
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Contact
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* UPLOAD DOCUMENT MODAL */}
      {/* ========================================================================= */}
      <Dialog open={isDocumentModalOpen} onOpenChange={(open) => {
        setIsDocumentModalOpen(open)
        if (!open) resetDocumentForm()
      }}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-4 border-b border-gray-100">
            <DialogTitle className="flex items-center text-lg">
              <div className="w-8 h-8 bg-[#ffc451]/10 rounded-lg flex items-center justify-center mr-3">
                <Upload className="h-4 w-4 text-[#ffc451]" />
              </div>
              Upload Document
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Add a new document with metadata to your collection
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-5 py-4">
            {/* File Drop Zone */}
            <div>
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center">
                <File className="h-3.5 w-3.5 mr-2 text-[#ffc451]" />
                Select File
              </h4>
              {!selectedFile ? (
                <div
                  className={`
                    relative border-2 border-dashed rounded-lg p-6 text-center
                    transition-all duration-200 cursor-pointer
                    ${isDragging
                      ? 'border-[#ffc451] bg-[#ffc451]/5'
                      : 'border-gray-300 hover:border-[#ffc451] hover:bg-gray-50'
                    }
                  `}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleFileSelect(file)
                    }}
                    accept={ALLOWED_EXTENSIONS.join(',')}
                  />
                  <div className="space-y-3">
                    <div className="mx-auto w-12 h-12 rounded-full bg-[#ffc451]/10 flex items-center justify-center">
                      <Upload className="h-6 w-6 text-[#ffc451]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {isDragging ? 'Drop your file here' : 'Drag & drop or click to browse'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Max {formatFileSize(MAX_FILE_SIZE)} • PDF, Word, Excel, Images, Archives
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {getFileIconComponent(selectedFile)}
                      <div>
                        <p className="text-sm font-medium text-gray-900 truncate max-w-[350px]">
                          {selectedFile.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatFileSize(selectedFile.size)}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedFile(null)
                        if (fileInputRef.current) fileInputRef.current.value = ''
                      }}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {uploadState.status === 'uploading' && (
                    <div className="mt-3 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-600">{uploadState.message}</span>
                        <span className="text-[#ffc451] font-medium">{uploadState.progress}%</span>
                      </div>
                      <Progress value={uploadState.progress} className="h-1.5" />
                    </div>
                  )}

                  {uploadState.status === 'success' && (
                    <div className="mt-3 flex items-center space-x-2 text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-xs font-medium">{uploadState.message}</span>
                    </div>
                  )}

                  {uploadState.status === 'error' && (
                    <div className="mt-3 flex items-center space-x-2 text-red-600">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-xs font-medium">{uploadState.message}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* Document Information */}
            <div>
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center">
                <Info className="h-3.5 w-3.5 mr-2 text-[#ffc451]" />
                Document Information
              </h4>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="displayName" className="text-xs font-medium">Display Name</Label>
                    <Input
                      id="displayName"
                      value={documentMetadata.displayName}
                      onChange={(e) => setDocumentMetadata(prev => ({ ...prev, displayName: e.target.value }))}
                      placeholder="Document name"
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="docType" className="text-xs font-medium">Document Type</Label>
                    <Select
                      value={documentMetadata.type}
                      onValueChange={(value) => setDocumentMetadata(prev => ({ ...prev, type: value }))}
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {documentTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value} className="text-sm">
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="description" className="text-xs font-medium">Description</Label>
                  <Textarea
                    id="description"
                    value={documentMetadata.description}
                    onChange={(e) => setDocumentMetadata(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Brief description of the document"
                    rows={2}
                    className="text-sm resize-none"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Classification */}
            <div>
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center">
                <FolderOpen className="h-3.5 w-3.5 mr-2 text-[#ffc451]" />
                Classification
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Category</Label>
                  <Select
                    value={documentMetadata.primaryCategory}
                    onValueChange={(value) => setDocumentMetadata(prev => ({ ...prev, primaryCategory: value }))}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value} className="text-sm">
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center">
                    <Lock className="h-3 w-3 mr-1.5 text-[#ffc451]" />
                    Security Level
                  </Label>
                  <Select
                    value={documentMetadata.classificationLevel}
                    onValueChange={(value) => setDocumentMetadata(prev => ({ ...prev, classificationLevel: value }))}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {classificationLevels.map((level) => (
                        <SelectItem key={level.value} value={level.value} className="text-sm">
                          {level.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            {/* Keywords */}
            <div>
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center">
                <Tag className="h-3.5 w-3.5 mr-2 text-[#ffc451]" />
                Keywords
              </h4>
              <div className="space-y-2">
                <div className="flex space-x-2">
                  <Input
                    value={documentKeywordInput}
                    onChange={(e) => setDocumentKeywordInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddDocumentKeyword())}
                    placeholder="Add keyword and press Enter"
                    className="text-sm"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={handleAddDocumentKeyword}>
                    Add
                  </Button>
                </div>
                {documentMetadata.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {documentMetadata.keywords.map((keyword) => (
                      <Badge
                        key={keyword}
                        variant="secondary"
                        className="text-xs px-2 py-0.5 bg-[#ffc451]/10 text-[#ffc451] border-[#ffc451]/20 hover:bg-[#ffc451]/20"
                      >
                        {keyword}
                        <button
                          onClick={() => handleRemoveDocumentKeyword(keyword)}
                          className="ml-1.5 hover:text-red-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Abstract */}
            <div className="space-y-1.5">
              <Label htmlFor="abstract" className="text-xs font-medium">Abstract / Summary</Label>
              <Textarea
                id="abstract"
                value={documentMetadata.abstract}
                onChange={(e) => setDocumentMetadata(prev => ({ ...prev, abstract: e.target.value }))}
                placeholder="Executive summary or abstract of the document"
                rows={3}
                className="text-sm resize-none"
              />
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-gray-100">
            <Button variant="outline" onClick={() => {
              setIsDocumentModalOpen(false)
              resetDocumentForm()
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateDocument}
              disabled={!selectedFile || uploadState.isUploading}
              className="bg-[#ffc451] hover:bg-[#ffc451]/90 text-black font-medium"
            >
              {uploadState.isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Document
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* CREATE NOTE MODAL */}
      {/* ========================================================================= */}
      <Dialog open={isNoteModalOpen} onOpenChange={(open) => {
        setIsNoteModalOpen(open)
        if (!open) resetNoteForm()
      }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-4 border-b border-gray-100">
            <DialogTitle className="flex items-center text-lg">
              <div className="w-8 h-8 bg-[#ffc451]/10 rounded-lg flex items-center justify-center mr-3">
                <StickyNote className="h-4 w-4 text-[#ffc451]" />
              </div>
              Create New Note
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Add a new note to your collection
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-5 py-4">
            {/* Note Content */}
            <div>
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center">
                <MessageSquare className="h-3.5 w-3.5 mr-2 text-[#ffc451]" />
                Note Content
              </h4>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="noteTitle" className="text-xs font-medium">Title</Label>
                  <Input
                    id="noteTitle"
                    value={noteForm.title}
                    onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })}
                    placeholder="Note title (optional)"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="noteBody" className="text-xs font-medium">
                    Content <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    id="noteBody"
                    value={noteForm.body}
                    onChange={(e) => setNoteForm({ ...noteForm, body: e.target.value })}
                    placeholder="Enter your note content here..."
                    rows={6}
                    className="text-sm resize-none"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Classification */}
            <div>
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center">
                <FolderOpen className="h-3.5 w-3.5 mr-2 text-[#ffc451]" />
                Classification
              </h4>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="noteType" className="text-xs font-medium">Type</Label>
                    <Select
                      value={noteForm.type}
                      onValueChange={(value) => setNoteForm({ ...noteForm, type: value })}
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {noteTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value} className="text-sm">
                            <div className="flex items-center">
                              <type.icon className="h-3.5 w-3.5 mr-2 text-gray-500" />
                              {type.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="noteImportance" className="text-xs font-medium">Importance</Label>
                    <Select
                      value={noteForm.importance}
                      onValueChange={(value) => setNoteForm({ ...noteForm, importance: value })}
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {importanceLevels.map((level) => (
                          <SelectItem key={level.value} value={level.value} className="text-sm">
                            {level.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="noteCategory" className="text-xs font-medium">Category</Label>
                  <Select
                    value={noteForm.category}
                    onValueChange={(value) => setNoteForm({ ...noteForm, category: value })}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {noteCategories.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value} className="text-sm">
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            {/* Tags & Options */}
            <div>
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center">
                <Tag className="h-3.5 w-3.5 mr-2 text-[#ffc451]" />
                Tags & Options
              </h4>
              <div className="space-y-3">
                <div className="flex space-x-2">
                  <Input
                    value={noteTagInput}
                    onChange={(e) => setNoteTagInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddNoteTag())}
                    placeholder="Add tag and press Enter"
                    className="text-sm"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={handleAddNoteTag}>
                    Add
                  </Button>
                </div>
                {noteForm.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {noteForm.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="text-xs px-2 py-0.5 bg-[#ffc451]/10 text-[#ffc451] border-[#ffc451]/20 hover:bg-[#ffc451]/20"
                      >
                        {tag}
                        <button
                          onClick={() => handleRemoveNoteTag(tag)}
                          className="ml-1.5 hover:text-red-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex items-center space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setNoteForm({ ...noteForm, isPinned: !noteForm.isPinned })}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                      noteForm.isPinned 
                        ? 'border-[#ffc451] bg-[#ffc451]/10 text-[#ffc451]' 
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <Bookmark className={`h-4 w-4 ${noteForm.isPinned ? 'fill-current' : ''}`} />
                    <span>{noteForm.isPinned ? 'Pinned' : 'Pin this note'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-gray-100">
            <Button variant="outline" onClick={() => {
              setIsNoteModalOpen(false)
              resetNoteForm()
            }}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateNote} 
              disabled={isCreating}
              className="bg-[#ffc451] hover:bg-[#ffc451]/90 text-black font-medium"
            >
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Note
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}