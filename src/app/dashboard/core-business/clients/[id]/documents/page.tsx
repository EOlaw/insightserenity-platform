'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  FileText,
  Upload,
  Search,
  Filter,
  MoreVertical,
  Download,
  Edit,
  Trash2,
  ArrowLeft,
  Bell,
  Loader2,
  AlertCircle,
  File,
  CheckCircle,
  Clock,
  Eye,
  Calendar,
  FileCheck,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '@/lib/api/client'

interface Document {
  _id: string
  documentId: string
  metadata: {
    originalName: string
    displayName?: string
    description?: string
  }
  file: {
    size: number
    mimeType: string
    extension: string
  }
  classification: {
    type: string
    category?: string
    tags?: string[]
  }
  status: {
    current: string
  }
  versioning: {
    currentVersion: number
  }
  timestamps: {
    uploadedAt: string
  }
  uploadedBy?: {
    name?: string
    userId?: string
  }
}

export default function ClientDocumentsPage() {
  const router = useRouter()
  const params = useParams()
  const clientId = params.id as string

  const [documents, setDocuments] = useState<Document[]>([])
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [clientName, setClientName] = useState('')

  useEffect(() => {
    loadDocuments()
    loadClientInfo()
  }, [clientId])

  useEffect(() => {
    filterDocuments()
  }, [searchQuery, typeFilter, documents])

  const loadClientInfo = async () => {
    try {
      const response = await api.get(`/clients/${clientId}`)
      const data = response.data || response
      setClientName(data.client?.companyName || 'Client')
    } catch (err) {
      console.error('Error loading client info:', err)
    }
  }

  const loadDocuments = async () => {
    setIsLoading(true)
    setError('')

    try {
      const response = await api.get(`/clients/${clientId}/documents`)
      const data = response.data || response
      
      if (data.documents) {
        setDocuments(data.documents)
        setFilteredDocuments(data.documents)
      } else {
        setDocuments([])
        setFilteredDocuments([])
      }
    } catch (err: any) {
      console.error('Error loading documents:', err)
      setError(err.response?.data?.error?.message || err.message || 'Failed to load documents')
      toast.error('Failed to load documents')
    } finally {
      setIsLoading(false)
    }
  }

  const filterDocuments = () => {
    let filtered = [...documents]

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(doc => {
        const name = doc.metadata.displayName?.toLowerCase() || doc.metadata.originalName?.toLowerCase() || ''
        const description = doc.metadata.description?.toLowerCase() || ''
        const type = doc.classification.type?.toLowerCase() || ''
        const query = searchQuery.toLowerCase()

        return name.includes(query) || description.includes(query) || type.includes(query)
      })
    }

    // Apply type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(doc => doc.classification.type === typeFilter)
    }

    setFilteredDocuments(filtered)
  }

  const handleDownload = async (documentId: string, fileName: string) => {
    try {
      toast.loading('Preparing download...')
      const response = await api.get(`/documents/${documentId}/download`)
      
      // Handle download URL or stream
      if (response.data.downloadUrl) {
        window.open(response.data.downloadUrl, '_blank')
      }
      
      toast.dismiss()
      toast.success('Download started')
    } catch (err: any) {
      console.error('Error downloading document:', err)
      toast.dismiss()
      toast.error(err.response?.data?.error?.message || 'Failed to download document')
    }
  }

  const handleDeleteDocument = async (documentId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return

    try {
      await api.delete(`/documents/${documentId}`)
      toast.success('Document deleted successfully')
      loadDocuments()
    } catch (err: any) {
      console.error('Error deleting document:', err)
      toast.error(err.response?.data?.error?.message || 'Failed to delete document')
    }
  }

  const getStatusBadge = (status: string) => {
    const statusConfig: { [key: string]: { color: string; icon: any } } = {
      active: { color: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle },
      draft: { color: 'bg-gray-100 text-gray-800 border-gray-200', icon: Edit },
      pending_review: { color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: Clock },
      approved: { color: 'bg-blue-100 text-blue-800 border-blue-200', icon: FileCheck },
      archived: { color: 'bg-gray-100 text-gray-600 border-gray-200', icon: File },
    }

    const config = statusConfig[status] || statusConfig.active
    const Icon = config.icon

    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${config.color}`}>
        <Icon className="h-3 w-3 mr-1" />
        {status.replace(/_/g, ' ')}
      </span>
    )
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('pdf')) return '📄'
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝'
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊'
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📈'
    if (mimeType.includes('image')) return '🖼️'
    if (mimeType.includes('video')) return '🎥'
    return '📁'
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-sm text-gray-600">Loading documents...</p>
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
                <h1 className="text-lg font-semibold text-gray-900">Documents</h1>
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
                  <p className="text-sm text-gray-600">Total Documents</p>
                  <p className="text-2xl font-bold text-gray-900">{documents.length}</p>
                </div>
                <FileText className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Active</p>
                  <p className="text-2xl font-bold text-green-600">
                    {documents.filter(d => d.status.current === 'active').length}
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Pending Review</p>
                  <p className="text-2xl font-bold text-yellow-600">
                    {documents.filter(d => d.status.current === 'pending_review').length}
                  </p>
                </div>
                <Clock className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">This Month</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {documents.filter(d => {
                      const uploadDate = new Date(d.timestamps.uploadedAt)
                      const now = new Date()
                      return uploadDate.getMonth() === now.getMonth() && 
                             uploadDate.getFullYear() === now.getFullYear()
                    }).length}
                  </p>
                </div>
                <Calendar className="h-8 w-8 text-gray-400" />
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
                  placeholder="Search documents by name, type, or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Type Filter */}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-primary"
              >
                <option value="all">All Types</option>
                <option value="contract">Contracts</option>
                <option value="invoice">Invoices</option>
                <option value="proposal">Proposals</option>
                <option value="report">Reports</option>
                <option value="presentation">Presentations</option>
                <option value="other">Other</option>
              </select>

              {/* Upload Button */}
              <Link href={`/dashboard/core-business/clients/${clientId}/documents/upload`}>
                <Button className="bg-primary text-black hover:bg-primary-600 font-semibold">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Document
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Documents List */}
        {error ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-3 text-red-800">
                <AlertCircle className="h-5 w-5" />
                <div>
                  <p className="font-medium">Error Loading Documents</p>
                  <p className="text-sm">{error}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : filteredDocuments.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No documents found</h3>
                <p className="text-sm text-gray-500 mb-6">
                  {searchQuery || typeFilter !== 'all' 
                    ? 'Try adjusting your search or filters'
                    : 'Get started by uploading your first document'}
                </p>
                {!searchQuery && typeFilter === 'all' && (
                  <Link href={`/dashboard/core-business/clients/${clientId}/documents/upload`}>
                    <Button className="bg-primary text-black hover:bg-primary-600">
                      <Upload className="h-4 w-4 mr-2" />
                      Upload First Document
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDocuments.map((document) => (
              <Card key={document._id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <div className="text-3xl">{getFileIcon(document.file.mimeType)}</div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base truncate">
                          {document.metadata.displayName || document.metadata.originalName}
                        </CardTitle>
                        <CardDescription className="text-xs truncate">
                          {document.classification.type} • {formatFileSize(document.file.size)}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="relative group">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                      <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border hidden group-hover:block z-10">
                        <Link href={`/dashboard/core-business/clients/${clientId}/documents/${document._id}`}>
                          <button className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                            <Eye className="h-3 w-3 inline mr-2" />
                            View Details
                          </button>
                        </Link>
                        <button 
                          onClick={() => handleDownload(document._id, document.metadata.originalName)}
                          className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <Download className="h-3 w-3 inline mr-2" />
                          Download
                        </button>
                        <Link href={`/dashboard/core-business/clients/${clientId}/documents/${document._id}/edit`}>
                          <button className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                            <Edit className="h-3 w-3 inline mr-2" />
                            Edit
                          </button>
                        </Link>
                        <button 
                          onClick={() => handleDeleteDocument(document._id)}
                          className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3 inline mr-2" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    {getStatusBadge(document.status.current)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Description */}
                  {document.metadata.description && (
                    <p className="text-xs text-gray-600 line-clamp-2">
                      {document.metadata.description}
                    </p>
                  )}

                  {/* Metadata */}
                  <div className="space-y-2 text-xs text-gray-500">
                    <div className="flex items-center justify-between">
                      <span>Version {document.versioning.currentVersion}</span>
                      <span>{document.file.extension.toUpperCase()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Uploaded {formatDate(document.timestamps.uploadedAt)}</span>
                    </div>
                    {document.uploadedBy?.name && (
                      <div className="flex items-center">
                        <span className="text-gray-400">By:</span>
                        <span className="ml-1">{document.uploadedBy.name}</span>
                      </div>
                    )}
                  </div>

                  {/* Tags */}
                  {document.classification.tags && document.classification.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-2 border-t">
                      {document.classification.tags.slice(0, 3).map((tag, idx) => (
                        <span key={idx} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                          {tag}
                        </span>
                      ))}
                      {document.classification.tags.length > 3 && (
                        <span className="text-xs text-gray-400">
                          +{document.classification.tags.length - 3} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-3 border-t">
                    <Link 
                      href={`/dashboard/core-business/clients/${clientId}/documents/${document._id}`}
                      className="flex-1"
                    >
                      <Button variant="outline" size="sm" className="w-full">
                        View Details
                      </Button>
                    </Link>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleDownload(document._id, document.metadata.originalName)}
                    >
                      <Download className="h-3 w-3" />
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