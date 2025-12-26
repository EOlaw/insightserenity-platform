'use client'

/**
 * @fileoverview Document Detail Page - View and Edit Single Document
 * @description Comprehensive document detail page with view/edit modes, version history,
 *              download capabilities, and metadata management
 * @route /dashboard/client-management/documents/[id]
 */

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
    ArrowLeft,
    Edit,
    Save,
    X,
    FileText,
    Download,
    Eye,
    Trash2,
    Clock,
    Upload,
    Lock,
    Unlock,
    Tag,
    User,
    Building,
    Calendar,
    FileType,
    HardDrive,
    History
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { documentsApi } from '@/lib/api/client'
import type { Document } from '@/lib/api/client'

/**
 * Document form data interface for editing
 */
interface DocumentFormData {
    name: string
    displayName: string
    description: string
    type: string
    primaryCategory: string
    secondaryCategories: string[]
    classificationLevel: string
    keywords: string[]
    abstract: string
}

export default function DocumentDetailPage() {
    const params = useParams()
    const router = useRouter()
    const documentId = params.id as string

    // State management
    const [document, setDocument] = useState<Document | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isEditing, setIsEditing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [isDownloading, setIsDownloading] = useState(false)
    const [error, setError] = useState('')

    // Form data state
    const [formData, setFormData] = useState<DocumentFormData>({
        name: '',
        displayName: '',
        description: '',
        type: '',
        primaryCategory: '',
        secondaryCategories: [],
        classificationLevel: '',
        keywords: [],
        abstract: ''
    })

    // Temporary state for array inputs
    const [keywordInput, setKeywordInput] = useState('')
    const [secondaryCategoryInput, setSecondaryCategoryInput] = useState('')

    useEffect(() => {
        if (documentId) {
            loadDocument()
        }
    }, [documentId])

    /**
     * Load document details from API
     */
    const loadDocument = async () => {
        setIsLoading(true)
        setError('')

        try {
            const response = await documentsApi.getById(documentId)
            const docData = response.data?.document || response.document || response.data || response

            setDocument(docData)

            // Initialize form data
            setFormData({
                name: docData.documentInfo?.name || '',
                displayName: docData.documentInfo?.displayName || '',
                description: docData.documentInfo?.description || '',
                type: docData.documentInfo?.type || '',
                primaryCategory: docData.documentInfo?.category?.primary || '',
                secondaryCategories: docData.documentInfo?.category?.secondary || [],
                classificationLevel: docData.documentInfo?.classification?.level || '',
                keywords: docData.documentInfo?.keywords || [],
                abstract: docData.documentInfo?.abstract || ''
            })
        } catch (error: any) {
            console.error('Failed to load document:', error)
            setError(error.response?.data?.message || 'Failed to load document details')
            toast.error('Failed to load document')
        } finally {
            setIsLoading(false)
        }
    }

    /**
     * Handle input changes for simple fields
     */
    const handleInputChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const { name, value } = e.target
        setFormData(prev => ({
            ...prev,
            [name]: value
        }))
    }

    /**
     * Handle select changes
     */
    const handleSelectChange = (name: string, value: string) => {
        setFormData(prev => ({
            ...prev,
            [name]: value
        }))
    }

    /**
     * Add keyword to the list
     */
    const handleAddKeyword = () => {
        const trimmed = keywordInput.trim()
        if (trimmed && !formData.keywords.includes(trimmed)) {
            setFormData(prev => ({
                ...prev,
                keywords: [...prev.keywords, trimmed]
            }))
            setKeywordInput('')
        }
    }

    /**
     * Remove keyword from the list
     */
    const handleRemoveKeyword = (keyword: string) => {
        setFormData(prev => ({
            ...prev,
            keywords: prev.keywords.filter(k => k !== keyword)
        }))
    }

    /**
     * Add secondary category
     */
    const handleAddSecondaryCategory = () => {
        const trimmed = secondaryCategoryInput.trim()
        if (trimmed && !formData.secondaryCategories.includes(trimmed)) {
            setFormData(prev => ({
                ...prev,
                secondaryCategories: [...prev.secondaryCategories, trimmed]
            }))
            setSecondaryCategoryInput('')
        }
    }

    /**
     * Remove secondary category
     */
    const handleRemoveSecondaryCategory = (category: string) => {
        setFormData(prev => ({
            ...prev,
            secondaryCategories: prev.secondaryCategories.filter(c => c !== category)
        }))
    }

    /**
     * Save document updates
     */
    const handleSave = async () => {
        setIsSaving(true)

        try {
            const updateData = {
                documentInfo: {
                    name: formData.name,
                    displayName: formData.displayName,
                    description: formData.description,
                    type: formData.type,
                    category: {
                        primary: formData.primaryCategory,
                        secondary: formData.secondaryCategories
                    },
                    classification: {
                        level: formData.classificationLevel
                    },
                    keywords: formData.keywords,
                    abstract: formData.abstract
                }
            }

            await documentsApi.update(documentId, updateData)
            toast.success('Document updated successfully')
            setIsEditing(false)
            await loadDocument()
        } catch (error: any) {
            console.error('Failed to update document:', error)
            toast.error(error.response?.data?.message || 'Failed to update document')
        } finally {
            setIsSaving(false)
        }
    }

    /**
     * Cancel editing and revert changes
     */
    const handleCancelEdit = () => {
        if (document) {
            setFormData({
                name: document.documentInfo?.name || '',
                displayName: document.documentInfo?.displayName || '',
                description: document.documentInfo?.description || '',
                type: document.documentInfo?.type || '',
                primaryCategory: document.documentInfo?.category?.primary || '',
                secondaryCategories: document.documentInfo?.category?.secondary || [],
                classificationLevel: document.documentInfo?.classification?.level || '',
                keywords: document.documentInfo?.keywords || [],
                abstract: document.documentInfo?.abstract || ''
            })
        }
        setIsEditing(false)
    }

    /**
     * Handle document download using pre-signed URL
     */
    const handleDownload = async () => {
        if (!document?._id) {
            toast.error('Document ID not available')
            return
        }

        setIsDownloading(true)

        try {
            const response = await documentsApi.download(document._id)

            // Handle different response structures
            const downloadData = response.data || response

            if (downloadData?.downloadUrl) {
                // Open the pre-signed URL in a new tab to initiate download
                window.open(downloadData.downloadUrl, '_blank')
                toast.success('Download started')
            } else {
                toast.error('Download URL not available')
            }
        } catch (error: any) {
            console.error('Download error:', error)
            toast.error(error.response?.data?.message || 'Failed to download document')
        } finally {
            setIsDownloading(false)
        }
    }

    /**
     * Format file size for display
     */
    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes'
        const k = 1024
        const sizes = ['Bytes', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
    }

    /**
     * Get status badge variant
     */
    const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
        switch (status?.toLowerCase()) {
            case 'active':
            case 'published':
            case 'approved':
                return 'default'
            case 'draft':
            case 'review':
                return 'outline'
            case 'archived':
            case 'obsolete':
                return 'outline'
            case 'deleted':
                return 'destructive'
            default:
                return 'outline'
        }
    }

    /**
     * Get classification badge color
     */
    const getClassificationColor = (level: string): string => {
        switch (level?.toLowerCase()) {
            case 'public':
                return 'bg-green-100 text-green-700'
            case 'internal':
                return 'bg-blue-100 text-blue-700'
            case 'confidential':
                return 'bg-yellow-100 text-yellow-700'
            case 'restricted':
                return 'bg-orange-100 text-orange-700'
            case 'top_secret':
                return 'bg-red-100 text-red-700'
            default:
                return 'bg-gray-100 text-gray-700'
        }
    }

    // Loading state
    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading document details...</p>
                </div>
            </div>
        )
    }

    // Error state
    if (error || !document) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle className="text-red-600">Error</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-gray-600 mb-4">{error || 'Document not found'}</p>
                        <Button onClick={() => router.push('/client/dashboard')}>
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Dashboard
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => router.push('/client/dashboard')}
                            >
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Back
                            </Button>
                            <Separator orientation="vertical" className="h-6" />
                            <div>
                                <h1 className="text-xl font-semibold text-gray-900">
                                    {document.documentInfo?.displayName || document.documentInfo?.name || 'Untitled Document'}
                                </h1>
                                <p className="text-sm text-gray-500 mt-0.5">Document ID: {document.documentId}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {!isEditing ? (
                                <>
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        onClick={handleDownload}
                                        disabled={isDownloading}
                                    >
                                        <Download className="h-4 w-4 mr-2" />
                                        {isDownloading ? 'Downloading...' : 'Download'}
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                                        <Edit className="h-4 w-4 mr-2" />
                                        Edit
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button variant="outline" size="sm" onClick={handleCancelEdit} disabled={isSaving}>
                                        <X className="h-4 w-4 mr-2" />
                                        Cancel
                                    </Button>
                                    <Button size="sm" onClick={handleSave} disabled={isSaving}>
                                        <Save className="h-4 w-4 mr-2" />
                                        {isSaving ? 'Saving...' : 'Save Changes'}
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Content - Left Column (2/3) */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Document Information */}
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                        <FileText className="h-5 w-5 text-primary" />
                                        <CardTitle>Document Information</CardTitle>
                                    </div>
                                    <Badge variant={getStatusVariant(document.lifecycle?.status || 'active')}>
                                        {document.lifecycle?.status || 'Active'}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {!isEditing ? (
                                    // View Mode
                                    <>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Document Name</label>
                                            <p className="text-sm text-gray-900">{document.documentInfo?.name || 'N/A'}</p>
                                        </div>

                                        {document.documentInfo?.displayName && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                                                <p className="text-sm text-gray-900">{document.documentInfo.displayName}</p>
                                            </div>
                                        )}

                                        {document.documentInfo?.description && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                                <p className="text-sm text-gray-900 whitespace-pre-wrap">{document.documentInfo.description}</p>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                                                <p className="text-sm text-gray-900 capitalize">{document.documentInfo?.type?.replace(/_/g, ' ') || 'N/A'}</p>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Primary Category</label>
                                                <p className="text-sm text-gray-900 capitalize">{document.documentInfo?.category?.primary || 'N/A'}</p>
                                            </div>
                                        </div>

                                        {document.documentInfo?.category?.secondary && document.documentInfo.category.secondary.length > 0 && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Categories</label>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {document.documentInfo.category.secondary.map((cat, index) => (
                                                        <Badge key={index} variant="outline" className="text-xs">{cat}</Badge>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {document.documentInfo?.keywords && document.documentInfo.keywords.length > 0 && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Keywords</label>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {document.documentInfo.keywords.map((keyword, index) => (
                                                        <Badge key={index} variant="default" className="text-xs">
                                                            <Tag className="h-3 w-3 mr-1" />
                                                            {keyword}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {document.documentInfo?.abstract && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Abstract</label>
                                                <p className="text-sm text-gray-900 whitespace-pre-wrap">{document.documentInfo.abstract}</p>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    // Edit Mode
                                    <>
                                        <div>
                                            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                                                Document Name <span className="text-red-500">*</span>
                                            </label>
                                            <Input
                                                id="name"
                                                name="name"
                                                value={formData.name}
                                                onChange={handleInputChange}
                                                required
                                            />
                                        </div>

                                        <div>
                                            <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
                                                Display Name
                                            </label>
                                            <Input
                                                id="displayName"
                                                name="displayName"
                                                value={formData.displayName}
                                                onChange={handleInputChange}
                                            />
                                        </div>

                                        <div>
                                            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                                                Description
                                            </label>
                                            <Textarea
                                                id="description"
                                                name="description"
                                                value={formData.description}
                                                onChange={handleInputChange}
                                                rows={3}
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
                                                    Type <span className="text-red-500">*</span>
                                                </label>
                                                <Select value={formData.type} onValueChange={(value) => handleSelectChange('type', value)}>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select type" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="contract">Contract</SelectItem>
                                                        <SelectItem value="proposal">Proposal</SelectItem>
                                                        <SelectItem value="invoice">Invoice</SelectItem>
                                                        <SelectItem value="report">Report</SelectItem>
                                                        <SelectItem value="presentation">Presentation</SelectItem>
                                                        <SelectItem value="specification">Specification</SelectItem>
                                                        <SelectItem value="legal">Legal</SelectItem>
                                                        <SelectItem value="financial">Financial</SelectItem>
                                                        <SelectItem value="technical">Technical</SelectItem>
                                                        <SelectItem value="other">Other</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div>
                                                <label htmlFor="primaryCategory" className="block text-sm font-medium text-gray-700 mb-1">
                                                    Primary Category <span className="text-red-500">*</span>
                                                </label>
                                                <Select value={formData.primaryCategory} onValueChange={(value) => handleSelectChange('primaryCategory', value)}>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select category" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="business">Business</SelectItem>
                                                        <SelectItem value="legal">Legal</SelectItem>
                                                        <SelectItem value="financial">Financial</SelectItem>
                                                        <SelectItem value="technical">Technical</SelectItem>
                                                        <SelectItem value="operational">Operational</SelectItem>
                                                        <SelectItem value="marketing">Marketing</SelectItem>
                                                        <SelectItem value="hr">HR</SelectItem>
                                                        <SelectItem value="compliance">Compliance</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        <div>
                                            <label htmlFor="classificationLevel" className="block text-sm font-medium text-gray-700 mb-1">
                                                Classification Level
                                            </label>
                                            <Select value={formData.classificationLevel} onValueChange={(value) => handleSelectChange('classificationLevel', value)}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select classification" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="public">Public</SelectItem>
                                                    <SelectItem value="internal">Internal</SelectItem>
                                                    <SelectItem value="confidential">Confidential</SelectItem>
                                                    <SelectItem value="restricted">Restricted</SelectItem>
                                                    <SelectItem value="top_secret">Top Secret</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Categories</label>
                                            <div className="flex gap-2 mb-2">
                                                <Input
                                                    value={secondaryCategoryInput}
                                                    onChange={(e) => setSecondaryCategoryInput(e.target.value)}
                                                    placeholder="Add category"
                                                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSecondaryCategory())}
                                                />
                                                <Button type="button" onClick={handleAddSecondaryCategory} variant="outline" size="sm">
                                                    Add
                                                </Button>
                                            </div>
                                            <div className="flex flex-wrap gap-1.5">
                                                {formData.secondaryCategories.map((cat, index) => (
                                                    <Badge key={index} variant="outline" className="text-xs">
                                                        {cat}
                                                        <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => handleRemoveSecondaryCategory(cat)} />
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Keywords</label>
                                            <div className="flex gap-2 mb-2">
                                                <Input
                                                    value={keywordInput}
                                                    onChange={(e) => setKeywordInput(e.target.value)}
                                                    placeholder="Add keyword"
                                                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddKeyword())}
                                                />
                                                <Button type="button" onClick={handleAddKeyword} variant="outline" size="sm">
                                                    Add
                                                </Button>
                                            </div>
                                            <div className="flex flex-wrap gap-1.5">
                                                {formData.keywords.map((keyword, index) => (
                                                    <Badge key={index} variant="secondary" className="text-xs">
                                                        <Tag className="h-3 w-3 mr-1" />
                                                        {keyword}
                                                        <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => handleRemoveKeyword(keyword)} />
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <label htmlFor="abstract" className="block text-sm font-medium text-gray-700 mb-1">
                                                Abstract / Summary
                                            </label>
                                            <Textarea
                                                id="abstract"
                                                name="abstract"
                                                value={formData.abstract}
                                                onChange={handleInputChange}
                                                rows={4}
                                                maxLength={2000}
                                            />
                                            <p className="text-xs text-gray-500 mt-1">{formData.abstract.length}/2000 characters</p>
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>

                        {/* File Details */}
                        <Card>
                            <CardHeader>
                                <div className="flex items-center space-x-2">
                                    <HardDrive className="h-5 w-5 text-primary" />
                                    <CardTitle>File Details</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Original Filename</label>
                                        <p className="text-sm text-gray-900 break-all">{document.fileDetails?.originalName || 'N/A'}</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">File Type</label>
                                        <p className="text-sm text-gray-900">{document.fileDetails?.mimeType || 'N/A'}</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">File Size</label>
                                        <p className="text-sm text-gray-900">{document.fileDetails?.size ? formatFileSize(document.fileDetails.size) : 'N/A'}</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Extension</label>
                                        <p className="text-sm text-gray-900 uppercase">{document.fileDetails?.fileExtension || 'N/A'}</p>
                                    </div>

                                    {document.fileDetails?.encoding && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Encoding</label>
                                            <p className="text-sm text-gray-900">{document.fileDetails.encoding}</p>
                                        </div>
                                    )}

                                    {document.storage?.provider && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Storage Provider</label>
                                            <p className="text-sm text-gray-900 capitalize">{document.storage.provider.replace(/_/g, ' ')}</p>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Sidebar - Right Column (1/3) */}
                    <div className="space-y-6">
                        {/* Classification & Security */}
                        <Card>
                            <CardHeader>
                                <div className="flex items-center space-x-2">
                                    <Lock className="h-5 w-5 text-primary" />
                                    <CardTitle>Security</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Classification</label>
                                    <Badge className={getClassificationColor(document.documentInfo?.classification?.level || 'internal')}>
                                        {document.documentInfo?.classification?.level?.replace(/_/g, ' ').toUpperCase() || 'INTERNAL'}
                                    </Badge>
                                </div>

                                {document.documentInfo?.classification?.handling && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Handling Instructions</label>
                                        <p className="text-sm text-gray-900 capitalize">{document.documentInfo.classification.handling.replace(/_/g, ' ')}</p>
                                    </div>
                                )}

                                {document.storage?.encryption?.enabled && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Encryption</label>
                                        <div className="flex items-center space-x-2">
                                            <Lock className="h-4 w-4 text-green-600" />
                                            <span className="text-sm text-gray-900">Enabled</span>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Version Information */}
                        <Card>
                            <CardHeader>
                                <div className="flex items-center space-x-2">
                                    <History className="h-5 w-5 text-primary" />
                                    <CardTitle>Version</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Current Version</label>
                                    <p className="text-sm text-gray-900">{document.versioning?.versionString || '1.0.0'}</p>
                                </div>

                                <div className="flex items-center gap-2">
                                    {document.versioning?.isLatest && (
                                        <Badge variant="default" className="text-xs">Latest Version</Badge>
                                    )}
                                    {document.versioning?.isDraft && (
                                        <Badge variant="default" className="text-xs">Draft</Badge>
                                    )}
                                </div>

                                {document.versioning?.versionHistory && document.versioning.versionHistory.length > 0 && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">History</label>
                                        <p className="text-xs text-gray-600">{document.versioning.versionHistory.length} previous version(s)</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Metadata */}
                        <Card>
                            <CardHeader>
                                <div className="flex items-center space-x-2">
                                    <User className="h-5 w-5 text-primary" />
                                    <CardTitle>Metadata</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Uploaded By</label>
                                    <p className="text-sm text-gray-900">{document.metadata?.uploadedBy || 'Unknown'}</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Created</label>
                                    <p className="text-sm text-gray-900">
                                        {document.createdAt ? new Date(document.createdAt).toLocaleString() : 'N/A'}
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Updated</label>
                                    <p className="text-sm text-gray-900">
                                        {document.updatedAt ? new Date(document.updatedAt).toLocaleString() : 'N/A'}
                                    </p>
                                </div>

                                {document.metadata?.source && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
                                        <p className="text-sm text-gray-900 capitalize">{document.metadata.source.replace(/_/g, ' ')}</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    )
}