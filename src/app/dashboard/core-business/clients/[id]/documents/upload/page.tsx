'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Upload,
  FileText,
  ArrowLeft,
  Save,
  AlertCircle,
  Loader2,
  Bell,
  X,
  File,
  CheckCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '@/lib/api/client'

export default function UploadDocumentPage() {
  const router = useRouter()
  const params = useParams()
  const clientId = params.id as string

  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState('')
  const [clientName, setClientName] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [formData, setFormData] = useState({
    displayName: '',
    description: '',
    type: 'other',
    category: '',
    tags: '',
    status: 'active',
    confidentialityLevel: 'internal',
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      // Auto-populate display name from filename if empty
      if (!formData.displayName) {
        setFormData(prev => ({
          ...prev,
          displayName: file.name.replace(/\.[^/.]+$/, '')
        }))
      }
    }
  }

  const handleRemoveFile = () => {
    setSelectedFile(null)
    const fileInput = document.getElementById('file-upload') as HTMLInputElement
    if (fileInput) fileInput.value = ''
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedFile) {
      setError('Please select a file to upload')
      return
    }

    setIsUploading(true)
    setError('')

    try {
      // Create FormData for file upload
      const uploadFormData = new FormData()
      uploadFormData.append('file', selectedFile)
      uploadFormData.append('clientId', clientId)
      uploadFormData.append('displayName', formData.displayName || selectedFile.name)
      uploadFormData.append('description', formData.description)
      uploadFormData.append('type', formData.type)
      uploadFormData.append('category', formData.category)
      uploadFormData.append('status', formData.status)
      uploadFormData.append('confidentialityLevel', formData.confidentialityLevel)
      
      // Add tags as array
      if (formData.tags) {
        const tagsArray = formData.tags.split(',').map(tag => tag.trim()).filter(Boolean)
        uploadFormData.append('tags', JSON.stringify(tagsArray))
      }

      const response = await api.post('/documents', uploadFormData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      const newDocument = response.data?.document || response.data

      toast.success('Document uploaded successfully!')
      router.push(`/dashboard/core-business/clients/${clientId}/documents/${newDocument._id}`)
    } catch (err: any) {
      console.error('Error uploading document:', err)
      const errorMessage = err.response?.data?.error?.message || err.message || 'Failed to upload document'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setIsUploading(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
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
                <h1 className="text-lg font-semibold text-gray-900">Upload Document</h1>
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
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            {/* File Upload Area */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Upload className="h-5 w-5 text-primary" />
                  <CardTitle>Select File</CardTitle>
                </div>
                <CardDescription>
                  Upload a document to your client account
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!selectedFile ? (
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-primary transition-colors">
                    <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <div className="mb-4">
                      <label 
                        htmlFor="file-upload" 
                        className="cursor-pointer text-primary hover:text-primary-600 font-medium"
                      >
                        Click to upload
                      </label>
                      <span className="text-gray-500"> or drag and drop</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, CSV up to 100MB
                    </p>
                    <input
                      id="file-upload"
                      type="file"
                      className="hidden"
                      onChange={handleFileSelect}
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                    />
                  </div>
                ) : (
                  <div className="border border-gray-300 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                          <File className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                          <p className="text-xs text-gray-500">{formatFileSize(selectedFile.size)}</p>
                        </div>
                      </div>
                      <Button 
                        type="button"
                        variant="ghost" 
                        size="sm"
                        onClick={handleRemoveFile}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Document Information */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <CardTitle>Document Information</CardTitle>
                </div>
                <CardDescription>
                  Provide details about the document
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
                    Display Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="displayName"
                    name="displayName"
                    value={formData.displayName}
                    onChange={handleInputChange}
                    required
                    placeholder="Document name"
                  />
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-primary resize-none"
                    placeholder="Brief description of the document..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
                      Document Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="type"
                      name="type"
                      value={formData.type}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                    >
                      <option value="contract">Contract</option>
                      <option value="invoice">Invoice</option>
                      <option value="proposal">Proposal</option>
                      <option value="report">Report</option>
                      <option value="presentation">Presentation</option>
                      <option value="agreement">Agreement</option>
                      <option value="sow">Statement of Work</option>
                      <option value="nda">NDA</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
                      Category
                    </label>
                    <Input
                      id="category"
                      name="category"
                      value={formData.category}
                      onChange={handleInputChange}
                      placeholder="e.g., Legal, Financial"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="tags" className="block text-sm font-medium text-gray-700 mb-1">
                    Tags
                  </label>
                  <Input
                    id="tags"
                    name="tags"
                    value={formData.tags}
                    onChange={handleInputChange}
                    placeholder="Separate tags with commas"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Example: legal, contract, 2024
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Document Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Document Settings</CardTitle>
                <CardDescription>
                  Configure document status and access level
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      <option value="draft">Draft</option>
                      <option value="active">Active</option>
                      <option value="pending_review">Pending Review</option>
                      <option value="approved">Approved</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="confidentialityLevel" className="block text-sm font-medium text-gray-700 mb-1">
                      Confidentiality Level
                    </label>
                    <select
                      id="confidentialityLevel"
                      name="confidentialityLevel"
                      value={formData.confidentialityLevel}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                    >
                      <option value="public">Public</option>
                      <option value="internal">Internal</option>
                      <option value="confidential">Confidential</option>
                      <option value="restricted">Restricted</option>
                      <option value="top_secret">Top Secret</option>
                    </select>
                  </div>
                </div>
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
                onClick={() => router.push(`/dashboard/core-business/clients/${clientId}/documents`)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Cancel
              </Button>

              <Button 
                type="submit"
                disabled={isUploading || !selectedFile}
                className="bg-primary text-black hover:bg-primary-600 font-semibold"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Document
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