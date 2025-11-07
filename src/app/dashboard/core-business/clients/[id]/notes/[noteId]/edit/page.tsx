'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  MessageSquare,
  Save,
  ArrowLeft,
  AlertCircle,
  Loader2,
  Bell,
  FileText,
  Tag,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '@/lib/api/client'

export default function EditNotePage() {
  const router = useRouter()
  const params = useParams()
  const clientId = params.id as string
  const noteId = params.noteId as string

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [clientName, setClientName] = useState('')
  const [formData, setFormData] = useState({
    title: '',
    body: '',
    summary: '',
    type: 'general',
    category: '',
    priority: 'medium',
    tags: '',
    visibility: 'team',
    importance: 'medium',
  })

  useEffect(() => {
    loadClientInfo()
    loadNote()
  }, [noteId])

  const loadClientInfo = async () => {
    try {
      const response = await api.get(`/clients/${clientId}`)
      const data = response.data || response
      setClientName(data.client?.companyName || 'Client')
    } catch (err) {
      console.error('Error loading client info:', err)
    }
  }

  const loadNote = async () => {
    setIsLoading(true)
    setError('')

    try {
      const response = await api.get(`/notes/${noteId}`)
      const data = response.data || response
      
      if (!data.note) {
        throw new Error('Note not found')
      }

      const note = data.note

      // Populate form with existing data
      setFormData({
        title: note.content?.title || '',
        body: note.content?.body || '',
        summary: note.content?.summary || '',
        type: note.classification?.type || 'general',
        category: note.classification?.category || '',
        priority: note.classification?.priority || 'medium',
        tags: note.classification?.tags?.join(', ') || '',
        visibility: note.visibility?.scope || 'team',
        importance: note.importance || 'medium',
      })
    } catch (err: any) {
      console.error('Error loading note:', err)
      setError(err.response?.data?.error?.message || err.message || 'Failed to load note')
      toast.error('Failed to load note')
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
        content: {
          title: formData.title || undefined,
          body: formData.body,
          summary: formData.summary || undefined,
        },
        classification: {
          type: formData.type,
          category: formData.category || undefined,
          priority: formData.priority,
          tags: formData.tags 
            ? formData.tags.split(',').map(tag => tag.trim()).filter(Boolean)
            : [],
        },
        visibility: {
          scope: formData.visibility,
        },
        importance: formData.importance,
      }

      await api.put(`/notes/${noteId}`, updateData)

      toast.success('Note updated successfully!')
      router.push(`/dashboard/core-business/clients/${clientId}/notes/${noteId}`)
    } catch (err: any) {
      console.error('Error updating note:', err)
      const errorMessage = err.response?.data?.error?.message || err.message || 'Failed to update note'
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
          <p className="text-sm text-gray-600">Loading note...</p>
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
                <h1 className="text-lg font-semibold text-gray-900">Edit Note</h1>
                <p className="text-xs text-gray-500">{clientName}</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => router.push(`/dashboard/core-business/clients/${clientId}/notes/${noteId}`)}
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
            {/* Note Content */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  <CardTitle>Note Content</CardTitle>
                </div>
                <CardDescription>
                  Update note content and details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                    Title
                  </label>
                  <Input
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleInputChange}
                    placeholder="Note title (optional)"
                  />
                </div>

                <div>
                  <label htmlFor="body" className="block text-sm font-medium text-gray-700 mb-1">
                    Content <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="body"
                    name="body"
                    value={formData.body}
                    onChange={handleInputChange}
                    required
                    rows={8}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-primary resize-none"
                    placeholder="Write your note content here..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.body.length} characters
                  </p>
                </div>

                <div>
                  <label htmlFor="summary" className="block text-sm font-medium text-gray-700 mb-1">
                    Summary
                  </label>
                  <textarea
                    id="summary"
                    name="summary"
                    value={formData.summary}
                    onChange={handleInputChange}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-primary resize-none"
                    placeholder="Brief summary (optional)"
                  />
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
                <CardDescription>
                  Update categorization and priority
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
                      Note Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="type"
                      name="type"
                      value={formData.type}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                    >
                      <option value="meeting">Meeting</option>
                      <option value="call">Call</option>
                      <option value="email">Email</option>
                      <option value="general">General</option>
                      <option value="follow_up">Follow Up</option>
                      <option value="action_item">Action Item</option>
                      <option value="decision">Decision</option>
                      <option value="update">Update</option>
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
                      placeholder="e.g., Sales, Support"
                    />
                  </div>

                  <div>
                    <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-1">
                      Priority
                    </label>
                    <select
                      id="priority"
                      name="priority"
                      value={formData.priority}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="importance" className="block text-sm font-medium text-gray-700 mb-1">
                      Importance
                    </label>
                    <select
                      id="importance"
                      name="importance"
                      value={formData.importance}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
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
                    Example: project-update, milestone, client-feedback
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Visibility Settings */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <CardTitle>Visibility Settings</CardTitle>
                </div>
                <CardDescription>
                  Control who can see this note
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div>
                  <label htmlFor="visibility" className="block text-sm font-medium text-gray-700 mb-1">
                    Visibility Scope
                  </label>
                  <select
                    id="visibility"
                    name="visibility"
                    value={formData.visibility}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                  >
                    <option value="private">Private (Only me)</option>
                    <option value="team">Team</option>
                    <option value="department">Department</option>
                    <option value="organization">Organization</option>
                    <option value="client_visible">Client Visible</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Choose who can view this note
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
                onClick={() => router.push(`/dashboard/core-business/clients/${clientId}/notes/${noteId}`)}
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