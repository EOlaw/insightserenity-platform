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
  Save,
  ArrowLeft,
  AlertCircle,
  Loader2,
  Bell,
  Tag,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '@/lib/api/client'

export default function EditDocumentPage() {
  const router = useRouter()
  const params = useParams()
  const clientId = params.id as string
  const documentId = params.documentId as string

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [clientName, setClientName] = useState('')
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
    loadDocument()
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
      
      if (!data.document) {
        throw new Error('Document not found')
      }

      const doc = data.document

      // Populate form with existing data
      setFormData({
        displayName: doc.metadata?.displayName || doc.metadata?.originalName || '',
        description: doc.metadata?.description || '',
        type: doc.classification?.type || 'other',
        category: doc.classification?.category || '',
        tags: doc.classification?.tags?.join(', ') || '',
        status: doc.status?.current || 'active',
        confidentialityLevel: doc.classification?.confidentialityLevel || 'internal',
      })
    } catch (err: any) {
      console.error('Error loading document:', err)
      setError(err.response?.data?.error?.message || err.message || 'Failed to load document')
      toast.error('Failed to load document')
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setError('')

    try {
      const updateData = {
        metadata: {
          displayName: formData.displayName,
          description: formData.description,
        },
        classification: {
          type: formData.type,
          category: formData.category || undefined,
          tags: formData.tags 
            ? formData.tags.split(',').map(tag => tag.trim()).filter(Boolean)
            : [],
          confidentialityLevel: formData.confidentialityLevel,
        },
        status: {
          current: formData.status,
        },
      }

      await api.put(`/documents/${documentId}`, updateData)

      toast.success('Document updated successfully!')
      router.push(`/dashboard/core-business/clients/${clientId}/documents/${documentId}`)
    } catch (err: any) {
      console.error('Error updating document:', err)
      const errorMessage = err.response?.data?.error?.message || err.message || 'Failed to update document'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setIsSaving(false)
    }
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Logo href="/" showText={false} />
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Edit Document</h1>
                <p className="text-xs text-gray-500">{clientName}</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => router.push(`/dashboard/core-business/clients/${clientId}/documents/${documentId}`)}
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
            {/* Document Information */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <CardTitle>Document Information</CardTitle>
                </div>
                <CardDescription>
                  Update document metadata and details
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

            {/* Classification & Security */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Tag className="h-5 w-5 text-primary" />
                  <CardTitle>Classification & Security</CardTitle>
                </div>
                <CardDescription>
                  Document status and access level
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
                      <option value="expired">Expired</option>
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

                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Note:</strong> Changing the confidentiality level may affect who can access this document.
                  </p>
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
                onClick={() => router.push(`/dashboard/core-business/clients/${clientId}/documents/${documentId}`)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Cancel
              </Button>

              <Button 
                type="submit"
                disabled={isSaving}
                className="bg-primary text-black hover:bg-primary-600 font-semibold"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving Changes...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
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