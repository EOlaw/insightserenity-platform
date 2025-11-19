'use client'

/**
 * @fileoverview Note Detail Page - View and Edit Single Note
 * @description Comprehensive note detail page with view/edit modes, rich metadata,
 *              importance/urgency tracking, and tag management
 * @route /dashboard/client-management/notes/[id]
 */

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { 
  ArrowLeft, 
  Edit, 
  Save, 
  X, 
  FileText, 
  Tag, 
  AlertCircle,
  Clock,
  User,
  Calendar,
  Zap,
  Star,
  Eye,
  Trash2,
  BookOpen,
  Link as LinkIcon
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { notesApi } from '@/lib/api/client'
import type { Note } from '@/lib/api/client'

/**
 * Note form data interface for editing
 */
interface NoteFormData {
  title: string
  body: string
  summary: string
  type: string
  primaryCategory: string
  secondaryCategories: string[]
  importance: string
  urgency: string
  systemTags: string[]
  userTags: string[]
}

export default function NoteDetailPage() {
  const params = useParams()
  const router = useRouter()
  const noteId = params.id as string

  // State management
  const [note, setNote] = useState<Note | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  // Form data state
  const [formData, setFormData] = useState<NoteFormData>({
    title: '',
    body: '',
    summary: '',
    type: '',
    primaryCategory: '',
    secondaryCategories: [],
    importance: '',
    urgency: '',
    systemTags: [],
    userTags: []
  })

  // Temporary state for array inputs
  const [userTagInput, setUserTagInput] = useState('')
  const [secondaryCategoryInput, setSecondaryCategoryInput] = useState('')

  useEffect(() => {
    if (noteId) {
      loadNote()
    }
  }, [noteId])

  /**
   * Load note details from API
   */
  const loadNote = async () => {
    setIsLoading(true)
    setError('')

    try {
      const response = await notesApi.getById(noteId)
      const noteData = response.data?.note || response.note || response

      setNote(noteData)

      // Initialize form data
      setFormData({
        title: noteData.content?.title || '',
        body: noteData.content?.body || '',
        summary: noteData.content?.summary || '',
        type: noteData.classification?.type || '',
        primaryCategory: noteData.classification?.category?.primary || '',
        secondaryCategories: noteData.classification?.category?.secondary || [],
        importance: noteData.classification?.importance || '',
        urgency: noteData.classification?.urgency || '',
        systemTags: noteData.classification?.tags?.system || [],
        userTags: noteData.classification?.tags?.user || []
      })
    } catch (error: any) {
      console.error('Failed to load note:', error)
      setError(error.response?.data?.message || 'Failed to load note details')
      toast.error('Failed to load note')
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
   * Add user tag to the list
   */
  const handleAddUserTag = () => {
    const trimmed = userTagInput.trim()
    if (trimmed && !formData.userTags.includes(trimmed)) {
      setFormData(prev => ({
        ...prev,
        userTags: [...prev.userTags, trimmed]
      }))
      setUserTagInput('')
    }
  }

  /**
   * Remove user tag from the list
   */
  const handleRemoveUserTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      userTags: prev.userTags.filter(t => t !== tag)
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
   * Save note updates
   */
  const handleSave = async () => {
    setIsSaving(true)

    try {
      const updateData = {
        content: {
          title: formData.title,
          body: formData.body,
          summary: formData.summary
        },
        classification: {
          type: formData.type,
          category: {
            primary: formData.primaryCategory,
            secondary: formData.secondaryCategories
          },
          importance: formData.importance,
          urgency: formData.urgency,
          tags: {
            system: formData.systemTags,
            user: formData.userTags
          }
        }
      }

      await notesApi.update(noteId, updateData)
      toast.success('Note updated successfully')
      setIsEditing(false)
      await loadNote()
    } catch (error: any) {
      console.error('Failed to update note:', error)
      toast.error(error.response?.data?.message || 'Failed to update note')
    } finally {
      setIsSaving(false)
    }
  }

  /**
   * Cancel editing and revert changes
   */
  const handleCancelEdit = () => {
    if (note) {
      setFormData({
        title: note.content?.title || '',
        body: note.content?.body || '',
        summary: note.content?.summary || '',
        type: note.classification?.type || '',
        primaryCategory: note.classification?.category?.primary || '',
        secondaryCategories: note.classification?.category?.secondary || [],
        importance: note.classification?.importance || '',
        urgency: note.classification?.urgency || '',
        systemTags: note.classification?.tags?.system || [],
        userTags: note.classification?.tags?.user || []
      })
    }
    setIsEditing(false)
  }

  /**
   * Get importance badge color
   */
  const getImportanceBadge = (importance: string) => {
    switch (importance?.toLowerCase()) {
      case 'critical':
        return { variant: 'destructive' as const, icon: AlertCircle, color: 'text-red-600' }
      case 'high':
        return { variant: 'default' as const, icon: Zap, color: 'text-orange-600' }
      case 'medium':
        return { variant: 'default' as const, icon: Star, color: 'text-yellow-600' }
      case 'low':
        return { variant: 'outline' as const, icon: Star, color: 'text-gray-600' }
      default:
        return { variant: 'default' as const, icon: Star, color: 'text-gray-600' }
    }
  }

  /**
   * Get urgency badge color
   */
  const getUrgencyBadge = (urgency: string) => {
    switch (urgency?.toLowerCase()) {
      case 'immediate':
        return { variant: 'destructive' as const, color: 'text-red-600' }
      case 'urgent':
        return { variant: 'default' as const, color: 'text-orange-600' }
      case 'normal':
        return { variant: 'default' as const, color: 'text-blue-600' }
      case 'low':
        return { variant: 'outline' as const, color: 'text-gray-600' }
      default:
        return { variant: 'default' as const, color: 'text-gray-600' }
    }
  }

  /**
   * Get status badge variant
   */
  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'default'
      case 'draft':
        return 'secondary'
      case 'archived':
        return 'outline'
      case 'deleted':
        return 'destructive'
      default:
        return 'secondary'
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading note details...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error || !note) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">{error || 'Note not found'}</p>
            <Button onClick={() => router.push('/dashboard/client-management?tab=notes')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Notes
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const importanceBadge = getImportanceBadge(note.classification?.importance || 'medium')
  const urgencyBadge = getUrgencyBadge(note.classification?.urgency || 'normal')

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
                onClick={() => router.push('/dashboard/client-management?tab=notes')}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Separator orientation="vertical" className="h-6" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  {note.content?.title || 'Untitled Note'}
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">Note ID: {note.noteId}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!isEditing ? (
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
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
            {/* Note Content */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <CardTitle>Note Content</CardTitle>
                  </div>
                  <Badge variant={getStatusVariant(note.status?.current || 'active')}>
                    {note.status?.current || 'Active'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {!isEditing ? (
                  // View Mode
                  <>
                    {note.content?.title && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                        <h2 className="text-lg font-semibold text-gray-900">{note.content.title}</h2>
                      </div>
                    )}

                    {note.content?.summary && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Summary</label>
                        <p className="text-sm text-gray-700 italic">{note.content.summary}</p>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Note Body</label>
                      <div className="prose prose-sm max-w-none">
                        <p className="text-sm text-gray-900 whitespace-pre-wrap">{note.content?.body || 'No content'}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  // Edit Mode
                  <>
                    <div>
                      <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                        Title
                      </label>
                      <Input
                        id="title"
                        name="title"
                        value={formData.title}
                        onChange={handleInputChange}
                        placeholder="Enter note title (optional)"
                      />
                    </div>

                    <div>
                      <label htmlFor="summary" className="block text-sm font-medium text-gray-700 mb-1">
                        Summary
                      </label>
                      <Textarea
                        id="summary"
                        name="summary"
                        value={formData.summary}
                        onChange={handleInputChange}
                        rows={2}
                        placeholder="Brief summary of the note"
                      />
                    </div>

                    <div>
                      <label htmlFor="body" className="block text-sm font-medium text-gray-700 mb-1">
                        Note Body <span className="text-red-500">*</span>
                      </label>
                      <Textarea
                        id="body"
                        name="body"
                        value={formData.body}
                        onChange={handleInputChange}
                        rows={12}
                        required
                        placeholder="Enter your note content here..."
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Classification */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <BookOpen className="h-5 w-5 text-primary" />
                  <CardTitle>Classification</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {!isEditing ? (
                  // View Mode
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                        <p className="text-sm text-gray-900 capitalize">{note.classification?.type?.replace(/_/g, ' ') || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Primary Category</label>
                        <p className="text-sm text-gray-900 capitalize">{note.classification?.category?.primary || 'N/A'}</p>
                      </div>
                    </div>

                    {note.classification?.category?.secondary && note.classification.category.secondary.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Categories</label>
                        <div className="flex flex-wrap gap-1.5">
                          {note.classification.category.secondary.map((cat, index) => (
                            <Badge key={index} variant="outline" className="text-xs">{cat}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Importance</label>
                        <div className="flex items-center gap-2">
                          <importanceBadge.icon className={`h-4 w-4 ${importanceBadge.color}`} />
                          <Badge variant={importanceBadge.variant} className="capitalize">
                            {note.classification?.importance || 'Medium'}
                          </Badge>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Urgency</label>
                        <div className="flex items-center gap-2">
                          <Clock className={`h-4 w-4 ${urgencyBadge.color}`} />
                          <Badge variant={urgencyBadge.variant} className="capitalize">
                            {note.classification?.urgency || 'Normal'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  // Edit Mode
                  <>
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
                            <SelectItem value="general">General</SelectItem>
                            <SelectItem value="meeting">Meeting</SelectItem>
                            <SelectItem value="call">Call</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="task">Task</SelectItem>
                            <SelectItem value="idea">Idea</SelectItem>
                            <SelectItem value="decision">Decision</SelectItem>
                            <SelectItem value="action_item">Action Item</SelectItem>
                            <SelectItem value="issue">Issue</SelectItem>
                            <SelectItem value="observation">Observation</SelectItem>
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
                            <SelectItem value="technical">Technical</SelectItem>
                            <SelectItem value="strategic">Strategic</SelectItem>
                            <SelectItem value="operational">Operational</SelectItem>
                            <SelectItem value="financial">Financial</SelectItem>
                            <SelectItem value="administrative">Administrative</SelectItem>
                            <SelectItem value="personal">Personal</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
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

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="importance" className="block text-sm font-medium text-gray-700 mb-1">
                          Importance <span className="text-red-500">*</span>
                        </label>
                        <Select value={formData.importance} onValueChange={(value) => handleSelectChange('importance', value)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select importance" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="critical">Critical</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label htmlFor="urgency" className="block text-sm font-medium text-gray-700 mb-1">
                          Urgency <span className="text-red-500">*</span>
                        </label>
                        <Select value={formData.urgency} onValueChange={(value) => handleSelectChange('urgency', value)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select urgency" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="immediate">Immediate</SelectItem>
                            <SelectItem value="urgent">Urgent</SelectItem>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Tags */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Tag className="h-5 w-5 text-primary" />
                  <CardTitle>Tags</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {!isEditing ? (
                  // View Mode
                  <>
                    {note.classification?.tags?.system && note.classification.tags.system.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">System Tags</label>
                        <div className="flex flex-wrap gap-1.5">
                          {note.classification.tags.system.map((tag, index) => (
                            <Badge key={index} variant="default" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {note.classification?.tags?.user && note.classification.tags.user.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">User Tags</label>
                        <div className="flex flex-wrap gap-1.5">
                          {note.classification.tags.user.map((tag, index) => (
                            <Badge key={index} variant="secondary" className="text-xs">
                              <Tag className="h-3 w-3 mr-1" />
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {(!note.classification?.tags?.system || note.classification.tags.system.length === 0) &&
                     (!note.classification?.tags?.user || note.classification.tags.user.length === 0) && (
                      <p className="text-sm text-gray-500">No tags assigned</p>
                    )}
                  </>
                ) : (
                  // Edit Mode
                  <>
                    {formData.systemTags && formData.systemTags.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">System Tags (read-only)</label>
                        <div className="flex flex-wrap gap-1.5">
                          {formData.systemTags.map((tag, index) => (
                            <Badge key={index} variant="default" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">User Tags</label>
                      <div className="flex gap-2 mb-2">
                        <Input
                          value={userTagInput}
                          onChange={(e) => setUserTagInput(e.target.value)}
                          placeholder="Add tag"
                          onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddUserTag())}
                        />
                        <Button type="button" onClick={handleAddUserTag} variant="outline" size="sm">
                          Add
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {formData.userTags.map((tag, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            <Tag className="h-3 w-3 mr-1" />
                            {tag}
                            <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => handleRemoveUserTag(tag)} />
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Right Column (1/3) */}
          <div className="space-y-6">
            {/* Priority Overview */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <AlertCircle className="h-5 w-5 text-primary" />
                  <CardTitle>Priority</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Importance Level</label>
                  <div className="flex items-center gap-2">
                    <importanceBadge.icon className={`h-5 w-5 ${importanceBadge.color}`} />
                    <Badge variant={importanceBadge.variant} className="capitalize text-sm">
                      {note.classification?.importance || 'Medium'}
                    </Badge>
                  </div>
                </div>

                <Separator />

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Urgency Level</label>
                  <div className="flex items-center gap-2">
                    <Clock className={`h-5 w-5 ${urgencyBadge.color}`} />
                    <Badge variant={urgencyBadge.variant} className="capitalize text-sm">
                      {note.classification?.urgency || 'Normal'}
                    </Badge>
                  </div>
                </div>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Created By</label>
                  <p className="text-sm text-gray-900">{note.createdBy || 'Unknown'}</p>
                </div>

                {note.metadata?.source && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
                    <p className="text-sm text-gray-900 capitalize">{note.metadata.source.replace(/_/g, ' ')}</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Created</label>
                  <p className="text-sm text-gray-900">
                    {note.createdAt ? new Date(note.createdAt).toLocaleString() : 'N/A'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Updated</label>
                  <p className="text-sm text-gray-900">
                    {note.updatedAt ? new Date(note.updatedAt).toLocaleString() : 'N/A'}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Visibility & Scope */}
            {note.visibility && (
              <Card>
                <CardHeader>
                  <div className="flex items-center space-x-2">
                    <Eye className="h-5 w-5 text-primary" />
                    <CardTitle>Visibility</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
                    <Badge variant="outline" className="capitalize">
                      {note.visibility.scope?.replace(/_/g, ' ') || 'Private'}
                    </Badge>
                  </div>

                  {note.visibility.isPublic !== undefined && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Public Access</label>
                      <Badge variant={note.visibility.isPublic ? 'default' : 'secondary'}>
                        {note.visibility.isPublic ? 'Public' : 'Private'}
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}