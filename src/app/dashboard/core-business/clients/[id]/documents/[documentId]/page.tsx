'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  FileText,
  Download,
  Edit,
  Trash2,
  ArrowLeft,
  Bell,
  Loader2,
  AlertCircle,
  File,
  Calendar,
  User,
  Tag,
  Eye,
  Clock,
  Shield,
  CheckCircle,
  GitBranch,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '@/lib/api/client'

interface Document {
  _id: string
  documentId: string
  clientId: string
  metadata: {
    originalName: string
    displayName?: string
    description?: string
  }
  file: {
    size: number
    mimeType: string
    extension: string
    storagePath?: string
  }
  classification: {
    type: string
    category?: string
    tags?: string[]
    confidentialityLevel?: string
  }
  status: {
    current: string
  }
  versioning: {
    currentVersion: number
    versions?: any[]
  }
  timestamps: {
    uploadedAt: string
    lastModifiedAt?: string
    lastAccessedAt?: string
  }
  uploadedBy?: {
    name?: string
    userId?: string
  }
  analytics?: {
    viewCount?: number
    downloadCount?: number
  }
  createdAt: string
  updatedAt: string
}

export default function ViewDocumentPage() {
  const router = useRouter()
  const params = useParams()
  const clientId = params.id as string
  const documentId = params.documentId as string

  const [document, setDocument] = useState<Document | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [clientName, setClientName] = useState('')

  useEffect(() => {
    loadDocument()
    loadClientInfo()
  }, [documentId])

  const loadClientInfo = async () => {
    try {
      const response = await api.get(`/clients/${clientId}`)
      const data = response.data || response
      setClientName(data.client?.companyName || 'Client')
    } catch (err) {
      console.error('Error loading client info:', err)
    }
  }

  const loadDocument = async () => {
    setIsLoading(true)
    setError('')

    try {
      const response = await api.get(`/documents/${documentId}`)
      const data = response.data || response
      
      if (data.document) {
        setDocument(data.document)
      } else {
        throw new Error('Document not found')
      }
    } catch (err: any) {
      console.error('Error loading document:', err)
      setError(err.response?.data?.error?.message || err.message || 'Failed to load document')
      toast.error('Failed to load document')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownload = async () => {
    if (!document) return

    try {
      toast.loading('Preparing download...')
      const response = await api.get(`/documents/${documentId}/download`)
      
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

  const handleDeleteDocument = async () => {
    if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) return

    try {
      await api.delete(`/documents/${documentId}`)
      toast.success('Document deleted successfully')
      router.push(`/dashboard/core-business/clients/${clientId}/documents`)
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
      approved: { color: 'bg-blue-100 text-blue-800 border-blue-200', icon: CheckCircle },
      archived: { color: 'bg-gray-100 text-gray-600 border-gray-200', icon: File },
    }

    const config = statusConfig[status] || statusConfig.active
    const Icon = config.icon

    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${config.color}`}>
        <Icon className="h-4 w-4 mr-1" />
        {status.replace(/_/g, ' ').toUpperCase()}
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
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
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
          <p className="text-sm text-gray-600">Loading document...</p>
        </div>
      </div>
    )
  }

  if (error || !document) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <Logo href="/" showText={false} />
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => router.push(`/dashboard/core-business/clients/${clientId}/documents`)}
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
                  <p className="font-medium">Error Loading Document</p>
                  <p className="text-sm">{error}</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => router.push(`/dashboard/core-business/clients/${clientId}/documents`)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Documents
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
                <h1 className="text-lg font-semibold text-gray-900">Document Details</h1>
                <p className="text-xs text-gray-500">{clientName}</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => router.push(`/dashboard/core-business/clients/${clientId}/documents`)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Documents
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
        {/* Document Header */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start space-x-4">
                <div className="text-5xl">{getFileIcon(document.file.mimeType)}</div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    {document.metadata.displayName || document.metadata.originalName}
                  </h2>
                  <div className="flex items-center space-x-3 text-sm text-gray-600 mb-3">
                    <span className="font-medium">{document.classification.type}</span>
                    <span>•</span>
                    <span>{formatFileSize(document.file.size)}</span>
                    <span>•</span>
                    <span>{document.file.extension.toUpperCase()}</span>
                  </div>
                  {getStatusBadge(document.status.current)}
                </div>
              </div>

              <div className="flex space-x-2">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={handleDownload}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                <Link href={`/dashboard/core-business/clients/${clientId}/documents/${documentId}/edit`}>
                  <Button size="sm" className="bg-primary text-black hover:bg-primary-600">
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                </Link>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={handleDeleteDocument}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>

            {/* Description */}
            {document.metadata.description && (
              <div className="pt-4 border-t">
                <p className="text-sm text-gray-700">{document.metadata.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* File Information */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <CardTitle>File Information</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Original Filename</p>
                    <p className="text-sm font-medium text-gray-900">
                      {document.metadata.originalName}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">File Size</p>
                    <p className="text-sm font-medium text-gray-900">
                      {formatFileSize(document.file.size)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">File Type</p>
                    <p className="text-sm font-medium text-gray-900">
                      {document.file.mimeType}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Extension</p>
                    <p className="text-sm font-medium text-gray-900">
                      {document.file.extension.toUpperCase()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Classification */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Tag className="h-5 w-5 text-primary" />
                  <CardTitle>Classification</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Document Type</p>
                    <p className="text-sm font-medium text-gray-900 capitalize">
                      {document.classification.type}
                    </p>
                  </div>
                  {document.classification.category && (
                    <div>
                      <p className="text-sm text-gray-500">Category</p>
                      <p className="text-sm font-medium text-gray-900">
                        {document.classification.category}
                      </p>
                    </div>
                  )}
                  {document.classification.confidentialityLevel && (
                    <div>
                      <p className="text-sm text-gray-500">Confidentiality</p>
                      <p className="text-sm font-medium text-gray-900 capitalize">
                        {document.classification.confidentialityLevel.replace(/_/g, ' ')}
                      </p>
                    </div>
                  )}
                </div>

                {/* Tags */}
                {document.classification.tags && document.classification.tags.length > 0 && (
                  <div className="pt-3 border-t">
                    <p className="text-sm text-gray-500 mb-2">Tags</p>
                    <div className="flex flex-wrap gap-2">
                      {document.classification.tags.map((tag, idx) => (
                        <span key={idx} className="text-xs bg-gray-100 text-gray-700 px-3 py-1 rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Version History */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <GitBranch className="h-5 w-5 text-primary" />
                  <CardTitle>Version History</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        Version {document.versioning.currentVersion} (Current)
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDate(document.timestamps.uploadedAt)}
                      </p>
                    </div>
                    <Button variant="outline" size="sm">
                      <Download className="h-3 w-3" />
                    </Button>
                  </div>
                  {document.versioning.versions && document.versioning.versions.length > 0 ? (
                    document.versioning.versions.map((version: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            Version {version.versionNumber}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatDate(version.createdAt)}
                          </p>
                        </div>
                        <Button variant="outline" size="sm">
                          <Download className="h-3 w-3" />
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-4">
                      No previous versions
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Timestamps */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  <CardTitle>Timestamps</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Uploaded</span>
                  <span className="text-sm font-medium text-gray-900">
                    {formatDate(document.timestamps.uploadedAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Last Modified</span>
                  <span className="text-sm font-medium text-gray-900">
                    {formatDate(document.timestamps.lastModifiedAt || document.updatedAt)}
                  </span>
                </div>
                {document.timestamps.lastAccessedAt && (
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-600">Last Accessed</span>
                    <span className="text-sm font-medium text-gray-900">
                      {formatDate(document.timestamps.lastAccessedAt)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Uploaded By */}
            {document.uploadedBy && (
              <Card>
                <CardHeader>
                  <div className="flex items-center space-x-2">
                    <User className="h-5 w-5 text-primary" />
                    <CardTitle>Uploaded By</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm font-medium text-gray-900">
                    {document.uploadedBy.name || 'Unknown User'}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Analytics */}
            {document.analytics && (
              <Card>
                <CardHeader>
                  <div className="flex items-center space-x-2">
                    <Eye className="h-5 w-5 text-primary" />
                    <CardTitle>Analytics</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-600">Views</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {document.analytics.viewCount || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-600">Downloads</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {document.analytics.downloadCount || 0}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Document ID */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Document ID</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs font-mono text-gray-500 break-all">{document.documentId}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}