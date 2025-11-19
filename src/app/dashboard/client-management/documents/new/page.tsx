'use client'

/**
 * @fileoverview Document Upload Page - Create and Upload New Documents
 * @description Professional document upload interface with drag-and-drop support,
 *              comprehensive metadata input, and real-time upload progress
 * @route /dashboard/client-management/documents/new
 */

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    ArrowLeft,
    Upload,
    FileText,
    X,
    CheckCircle,
    AlertCircle,
    File,
    FileImage,
    FileSpreadsheet,
    FileCode,
    FileArchive,
    Loader2,
    Info,
    Tag,
    FolderOpen,
    Lock,
    HardDrive
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import api, { documentsApi } from '@/lib/api/client'

/**
 * Document metadata interface
 */
interface DocumentMetadata {
    displayName: string
    description: string
    type: string
    primaryCategory: string
    secondaryCategories: string[]
    classificationLevel: string
    keywords: string[]
    abstract: string
}

/**
 * Upload state interface
 */
interface UploadState {
    isUploading: boolean
    progress: number
    status: 'idle' | 'uploading' | 'success' | 'error'
    message: string
}

/**
 * Document type options - matches backend service validation
 */
const documentTypes = [
    { value: 'contract', label: 'Contract' },
    { value: 'proposal', label: 'Proposal' },
    { value: 'invoice', label: 'Invoice' },
    { value: 'report', label: 'Report' },
    { value: 'presentation', label: 'Presentation' },
    { value: 'specification', label: 'Specification' },
    { value: 'requirement', label: 'Requirement' },
    { value: 'legal', label: 'Legal Document' },
    { value: 'financial', label: 'Financial Document' },
    { value: 'technical', label: 'Technical Documentation' },
    { value: 'other', label: 'Other' }
]

/**
 * Category options - matches backend ClientDocument schema enum
 */
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

/**
 * Classification level options - matches backend ClientDocument schema enum
 */
const classificationLevels = [
    { value: 'public', label: 'Public', description: 'Can be shared externally' },
    { value: 'internal', label: 'Internal', description: 'For internal use only' },
    { value: 'confidential', label: 'Confidential', description: 'Restricted access' },
    { value: 'restricted', label: 'Restricted', description: 'Highly sensitive' },
    { value: 'top_secret', label: 'Top Secret', description: 'Maximum security' }
]

/**
 * Maximum file size (50MB)
 */
const MAX_FILE_SIZE = 50 * 1024 * 1024

/**
 * Allowed file extensions
 */
const ALLOWED_EXTENSIONS = [
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.txt', '.rtf', '.csv', '.json', '.xml',
    '.jpg', '.jpeg', '.png', '.gif', '.svg',
    '.zip', '.rar', '.7z'
]

export default function DocumentUploadPage() {
    const router = useRouter()
    const fileInputRef = useRef<HTMLInputElement>(null)

    // File state
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [isDragging, setIsDragging] = useState(false)

    // Metadata state - updated default type to valid enum value
    const [metadata, setMetadata] = useState<DocumentMetadata>({
        displayName: '',
        description: '',
        type: 'other',  // Valid default
        primaryCategory: 'business',
        secondaryCategories: [],
        classificationLevel: 'internal',
        keywords: [],
        abstract: ''
    })

    // Keyword input state
    const [keywordInput, setKeywordInput] = useState('')

    // Upload state
    const [uploadState, setUploadState] = useState<UploadState>({
        isUploading: false,
        progress: 0,
        status: 'idle',
        message: ''
    })

    /**
     * Format file size for display
     */
    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes'
        const k = 1024
        const sizes = ['Bytes', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    /**
     * Get file icon based on MIME type
     */
    const getFileIcon = (file: File) => {
        const type = file.type
        const name = file.name.toLowerCase()

        if (type.includes('pdf')) return <FileText className="h-8 w-8 text-red-500" />
        if (type.includes('image')) return <FileImage className="h-8 w-8 text-blue-500" />
        if (type.includes('spreadsheet') || name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
            return <FileSpreadsheet className="h-8 w-8 text-green-500" />
        }
        if (type.includes('presentation') || name.endsWith('.pptx') || name.endsWith('.ppt')) {
            return <FileText className="h-8 w-8 text-orange-500" />
        }
        if (type.includes('zip') || type.includes('archive') || name.endsWith('.rar') || name.endsWith('.7z')) {
            return <FileArchive className="h-8 w-8 text-yellow-500" />
        }
        if (type.includes('json') || type.includes('xml') || type.includes('javascript')) {
            return <FileCode className="h-8 w-8 text-purple-500" />
        }
        return <File className="h-8 w-8 text-gray-500" />
    }

    /**
     * Validate selected file
     */
    const validateFile = (file: File): string | null => {
        if (file.size > MAX_FILE_SIZE) {
            return `File size exceeds maximum limit of ${formatFileSize(MAX_FILE_SIZE)}`
        }

        const extension = '.' + file.name.split('.').pop()?.toLowerCase()
        if (!ALLOWED_EXTENSIONS.includes(extension)) {
            return `File type not allowed. Supported types: ${ALLOWED_EXTENSIONS.join(', ')}`
        }

        return null
    }

    /**
     * Handle file selection
     */
    const handleFileSelect = useCallback((file: File) => {
        const error = validateFile(file)
        if (error) {
            toast.error(error)
            return
        }

        setSelectedFile(file)

        // Auto-populate display name if empty
        if (!metadata.displayName) {
            const nameWithoutExtension = file.name.replace(/\.[^/.]+$/, '')
            setMetadata(prev => ({
                ...prev,
                displayName: nameWithoutExtension
            }))
        }
    }, [metadata.displayName])

    /**
     * Handle file input change
     */
    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            handleFileSelect(file)
        }
    }

    /**
     * Handle drag events
     */
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

    /**
     * Handle metadata input changes
     */
    const handleMetadataChange = (field: keyof DocumentMetadata, value: string | string[]) => {
        setMetadata(prev => ({
            ...prev,
            [field]: value
        }))
    }

    /**
     * Add keyword
     */
    const handleAddKeyword = () => {
        const keyword = keywordInput.trim().toLowerCase()
        if (keyword && !metadata.keywords.includes(keyword)) {
            setMetadata(prev => ({
                ...prev,
                keywords: [...prev.keywords, keyword]
            }))
            setKeywordInput('')
        }
    }

    /**
     * Remove keyword
     */
    const handleRemoveKeyword = (keyword: string) => {
        setMetadata(prev => ({
            ...prev,
            keywords: prev.keywords.filter(k => k !== keyword)
        }))
    }

    /**
     * Handle keyword input key press
     */
    const handleKeywordKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            handleAddKeyword()
        }
    }

    /**
     * Clear selected file
     */
    const handleClearFile = () => {
        setSelectedFile(null)
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    /**
     * Handle document upload
     */
    const handleUpload = async () => {
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

            // Use flat field names - the controller will map to nested structure
            formData.append('name', metadata.displayName || selectedFile.name.replace(/\.[^/.]+$/, ''))
            formData.append('displayName', metadata.displayName || selectedFile.name)
            formData.append('type', metadata.type)

            if (metadata.description) {
                formData.append('description', metadata.description)
            }
            if (metadata.primaryCategory) {
                formData.append('primaryCategory', metadata.primaryCategory)
            }
            if (metadata.classificationLevel) {
                formData.append('classificationLevel', metadata.classificationLevel)
            }
            if (metadata.abstract) {
                formData.append('abstract', metadata.abstract)
            }
            if (metadata.keywords.length > 0) {
                formData.append('keywords', JSON.stringify(metadata.keywords))
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

            const response = await api.post('/clients/documents', formData, {
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
                router.push('/dashboard/client-management?tab=documents')
            }, 1500)

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

    /**
     * Reset form
     */
    const handleReset = () => {
        setSelectedFile(null)
        setMetadata({
            displayName: '',
            description: '',
            type: 'other',
            primaryCategory: 'business',
            secondaryCategories: [],
            classificationLevel: 'internal',
            keywords: [],
            abstract: ''
        })
        setKeywordInput('')
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

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            {/* Header */}
            <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <Link href="/dashboard/client-management?tab=documents">
                                <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-900">
                                    <ArrowLeft className="h-4 w-4 mr-2" />
                                    Back to Documents
                                </Button>
                            </Link>
                            <Separator orientation="vertical" className="h-6" />
                            <div>
                                <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Upload Document
                                </h1>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Add a new document to your collection
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column - File Upload */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Drop Zone */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm flex items-center">
                                    <Upload className="h-4 w-4 mr-2 text-[#ffc451]" />
                                    Select File
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    Drag and drop or click to browse
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {!selectedFile ? (
                                    <div
                                        className={`
                                            relative border-2 border-dashed rounded-lg p-8 text-center
                                            transition-all duration-200 cursor-pointer
                                            ${isDragging
                                                ? 'border-[#ffc451] bg-[#ffc451]/5'
                                                : 'border-gray-300 hover:border-[#ffc451] hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800'
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
                                            onChange={handleFileInputChange}
                                            accept={ALLOWED_EXTENSIONS.join(',')}
                                        />
                                        <div className="space-y-4">
                                            <div className="mx-auto w-16 h-16 rounded-full bg-[#ffc451]/10 flex items-center justify-center">
                                                <Upload className="h-8 w-8 text-[#ffc451]" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                                    {isDragging ? 'Drop your file here' : 'Drag & drop your file here'}
                                                </p>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    or click to browse from your computer
                                                </p>
                                            </div>
                                            <div className="text-xs text-gray-400">
                                                <p>Maximum file size: {formatFileSize(MAX_FILE_SIZE)}</p>
                                                <p className="mt-1">
                                                    Supported: PDF, Word, Excel, PowerPoint, Images, Archives
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center space-x-3">
                                                {getFileIcon(selectedFile)}
                                                <div>
                                                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                                                        {selectedFile.name}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        {formatFileSize(selectedFile.size)} • {selectedFile.type || 'Unknown type'}
                                                    </p>
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={handleClearFile}
                                                className="text-gray-400 hover:text-red-500"
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>

                                        {/* Upload Progress */}
                                        {uploadState.status === 'uploading' && (
                                            <div className="mt-4 space-y-2">
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="text-gray-600">{uploadState.message}</span>
                                                    <span className="text-[#ffc451] font-medium">{uploadState.progress}%</span>
                                                </div>
                                                <Progress value={uploadState.progress} className="h-1.5" />
                                            </div>
                                        )}

                                        {/* Success State */}
                                        {uploadState.status === 'success' && (
                                            <div className="mt-4 flex items-center space-x-2 text-green-600">
                                                <CheckCircle className="h-4 w-4" />
                                                <span className="text-xs font-medium">{uploadState.message}</span>
                                            </div>
                                        )}

                                        {/* Error State */}
                                        {uploadState.status === 'error' && (
                                            <div className="mt-4 flex items-center space-x-2 text-red-600">
                                                <AlertCircle className="h-4 w-4" />
                                                <span className="text-xs font-medium">{uploadState.message}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Document Metadata */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm flex items-center">
                                    <Info className="h-4 w-4 mr-2 text-[#ffc451]" />
                                    Document Information
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    Provide details about your document
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* Display Name */}
                                <div className="space-y-1.5">
                                    <Label htmlFor="displayName" className="text-xs font-medium">
                                        Display Name
                                    </Label>
                                    <Input
                                        id="displayName"
                                        value={metadata.displayName}
                                        onChange={(e) => handleMetadataChange('displayName', e.target.value)}
                                        placeholder="Enter a display name for this document"
                                        className="text-sm"
                                    />
                                    <p className="text-xs text-gray-500">
                                        This name will be shown in the document list
                                    </p>
                                </div>

                                {/* Description */}
                                <div className="space-y-1.5">
                                    <Label htmlFor="description" className="text-xs font-medium">
                                        Description
                                    </Label>
                                    <Textarea
                                        id="description"
                                        value={metadata.description}
                                        onChange={(e) => handleMetadataChange('description', e.target.value)}
                                        placeholder="Brief description of the document's contents and purpose"
                                        rows={3}
                                        className="text-sm resize-none"
                                    />
                                </div>

                                {/* Abstract */}
                                <div className="space-y-1.5">
                                    <Label htmlFor="abstract" className="text-xs font-medium">
                                        Abstract / Summary
                                    </Label>
                                    <Textarea
                                        id="abstract"
                                        value={metadata.abstract}
                                        onChange={(e) => handleMetadataChange('abstract', e.target.value)}
                                        placeholder="Executive summary or abstract of the document"
                                        rows={4}
                                        className="text-sm resize-none"
                                    />
                                </div>

                                {/* Keywords */}
                                <div className="space-y-1.5">
                                    <Label htmlFor="keywords" className="text-xs font-medium flex items-center">
                                        <Tag className="h-3 w-3 mr-1.5 text-[#ffc451]" />
                                        Keywords
                                    </Label>
                                    <div className="flex space-x-2">
                                        <Input
                                            id="keywords"
                                            value={keywordInput}
                                            onChange={(e) => setKeywordInput(e.target.value)}
                                            onKeyPress={handleKeywordKeyPress}
                                            placeholder="Add keywords and press Enter"
                                            className="text-sm"
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={handleAddKeyword}
                                        >
                                            Add
                                        </Button>
                                    </div>
                                    {metadata.keywords.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {metadata.keywords.map((keyword) => (
                                                <Badge
                                                    key={keyword}
                                                    variant="secondary"
                                                    className="text-xs px-2 py-0.5 bg-[#ffc451]/10 text-[#ffc451] border-[#ffc451]/20"
                                                >
                                                    {keyword}
                                                    <button
                                                        onClick={() => handleRemoveKeyword(keyword)}
                                                        className="ml-1.5 hover:text-red-500"
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right Column - Classification & Actions */}
                    <div className="space-y-6">
                        {/* Document Type & Category */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm flex items-center">
                                    <FolderOpen className="h-4 w-4 mr-2 text-[#ffc451]" />
                                    Classification
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    Categorize your document
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* Document Type */}
                                <div className="space-y-1.5">
                                    <Label htmlFor="type" className="text-xs font-medium">
                                        Document Type
                                    </Label>
                                    <Select
                                        value={metadata.type}
                                        onValueChange={(value) => handleMetadataChange('type', value)}
                                    >
                                        <SelectTrigger className="text-sm">
                                            <SelectValue placeholder="Select type" />
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

                                {/* Primary Category */}
                                <div className="space-y-1.5">
                                    <Label htmlFor="category" className="text-xs font-medium">
                                        Primary Category
                                    </Label>
                                    <Select
                                        value={metadata.primaryCategory}
                                        onValueChange={(value) => handleMetadataChange('primaryCategory', value)}
                                    >
                                        <SelectTrigger className="text-sm">
                                            <SelectValue placeholder="Select category" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {categoryOptions.map((category) => (
                                                <SelectItem key={category.value} value={category.value} className="text-sm">
                                                    {category.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <Separator />

                                {/* Classification Level */}
                                <div className="space-y-1.5">
                                    <Label htmlFor="classification" className="text-xs font-medium flex items-center">
                                        <Lock className="h-3 w-3 mr-1.5 text-[#ffc451]" />
                                        Security Classification
                                    </Label>
                                    <Select
                                        value={metadata.classificationLevel}
                                        onValueChange={(value) => handleMetadataChange('classificationLevel', value)}
                                    >
                                        <SelectTrigger className="text-sm">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {classificationLevels.map((level) => (
                                                <SelectItem key={level.value} value={level.value}>
                                                    <div>
                                                        <span className="text-sm">{level.label}</span>
                                                        <p className="text-xs text-gray-500">{level.description}</p>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </CardContent>
                        </Card>

                        {/* File Info Summary */}
                        {selectedFile && (
                            <Card className="bg-gray-50 dark:bg-gray-800/50">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm flex items-center">
                                        <HardDrive className="h-4 w-4 mr-2 text-[#ffc451]" />
                                        File Summary
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 text-xs">
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Name</span>
                                        <span className="font-medium text-gray-900 dark:text-white truncate max-w-[150px]">
                                            {selectedFile.name}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Size</span>
                                        <span className="font-medium text-gray-900 dark:text-white">
                                            {formatFileSize(selectedFile.size)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Type</span>
                                        <span className="font-medium text-gray-900 dark:text-white">
                                            {selectedFile.type || 'Unknown'}
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Action Buttons */}
                        <Card>
                            <CardContent className="pt-6 space-y-3">
                                <Button
                                    onClick={handleUpload}
                                    disabled={!selectedFile || uploadState.isUploading}
                                    className="w-full bg-[#ffc451] hover:bg-[#ffc451]/90 text-black font-medium"
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
                                <Button
                                    variant="outline"
                                    onClick={handleReset}
                                    disabled={uploadState.isUploading}
                                    className="w-full"
                                >
                                    Reset Form
                                </Button>
                                <Link href="/dashboard/client-management?tab=documents" className="block">
                                    <Button
                                        variant="ghost"
                                        disabled={uploadState.isUploading}
                                        className="w-full text-gray-600"
                                    >
                                        Cancel
                                    </Button>
                                </Link>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    )
}