'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  MessageSquare,
  Edit,
  Trash2,
  ArrowLeft,
  Bell,
  Loader2,
  AlertCircle,
  Calendar,
  User,
  Tag,
  FileText,
  Clock,
  Eye,
  AlertTriangle,
  MessageCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '@/lib/api/client'

interface Note {
  _id: string
  noteId: string
  clientId: string
  content: {
    title?: string
    body: string
    summary?: string
    wordCount?: number
    characterCount?: number
    readingTime?: number
  }
  classification: {
    type: string
    category?: string
    priority?: string
    tags?: string[]
  }
  visibility: {
    scope: string
  }
  importance?: string
  timestamps: {
    createdAt: string
    lastModifiedAt?: string
  }
  createdBy?: {
    name?: string
    userId?: string
  }
  metadata?: {
    viewCount?: number
    wordCount?: number
    readingTime?: number
  }
  analytics?: {
    viewCount?: number
  }
  createdAt: string
  updatedAt: string
}

export default function ViewNotePage() {
  const router = useRouter()
  const params = useParams()
  const clientId = params.id as string
  const noteId = params.noteId as string

  const [note, setNote] = useState<Note | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [clientName, setClientName] = useState('')

  useEffect(() => {
    loadNote()
    loadClientInfo()
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
      
      if (data.note) {
        setNote(data.note)
      } else {
        throw new Error('Note not found')
      }
    } catch (err: any) {
      console.error('Error loading note:', err)
      setError(err.response?.data?.error?.message || err.message || 'Failed to load note')
      toast.error('Failed to load note')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteNote = async () => {
    if (!confirm('Are you sure you want to delete this note? This action cannot be undone.')) return

    try {
      await api.delete(`/notes/${noteId}`)
      toast.success('Note deleted successfully')
      router.push(`/dashboard/core-business/clients/${clientId}/notes`)
    } catch (err: any) {
      console.error('Error deleting note:', err)
      toast.error(err.response?.data?.error?.message || 'Failed to delete note')
    }
  }

  const getPriorityBadge = (priority: string) => {
    const priorityConfig: { [key: string]: { color: string; icon: any } } = {
      critical: { color: 'bg-red-100 text-red-800 border-red-200', icon: AlertTriangle },
      high: { color: 'bg-orange-100 text-orange-800 border-orange-200', icon: AlertCircle },
      medium: { color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: MessageSquare },
      low: { color: 'bg-green-100 text-green-800 border-green-200', icon: MessageSquare },
    }

    const config = priorityConfig[priority] || priorityConfig.medium
    const Icon = config.icon

    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${config.color}`}>
        <Icon className="h-4 w-4 mr-1" />
        {priority.toUpperCase()}
      </span>
    )
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

  if (error || !note) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <Logo href="/" showText={false} />
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => router.push(`/dashboard/core-business/clients/${clientId}/notes`)}
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
                  <p className="font-medium">Error Loading Note</p>
                  <p className="text-sm">{error}</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => router.push(`/dashboard/core-business/clients/${clientId}/notes`)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Notes
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
                <h1 className="text-lg font-semibold text-gray-900">Note Details</h1>
                <p className="text-xs text-gray-500">{clientName}</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => router.push(`/dashboard/core-business/clients/${clientId}/notes`)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Notes
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
        {/* Note Header */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                {note.content.title && (
                  <h2 className="text-2xl font-bold text-gray-900 mb-3">
                    {note.content.title}
                  </h2>
                )}
                <div className="flex items-center space-x-3 mb-3">
                  <span className="text-sm font-medium text-gray-600 capitalize">
                    {note.classification.type.replace(/_/g, ' ')}
                  </span>
                  {note.classification.priority && getPriorityBadge(note.classification.priority)}
                  {note.importance && note.importance !== 'medium' && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                      {note.importance} importance
                    </span>
                  )}
                </div>
                {note.content.summary && (
                  <p className="text-sm text-gray-600 mb-4 italic">
                    {note.content.summary}
                  </p>
                )}
              </div>

              <div className="flex space-x-2 ml-4">
                <Link href={`/dashboard/core-business/clients/${clientId}/notes/${noteId}/edit`}>
                  <Button size="sm" className="bg-primary text-black hover:bg-primary-600">
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                </Link>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={handleDeleteNote}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Note Content */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <CardTitle>Note Content</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="prose max-w-none">
                  <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {note.content.body}
                  </p>
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
                    <p className="text-sm text-gray-500">Type</p>
                    <p className="text-sm font-medium text-gray-900 capitalize">
                      {note.classification.type.replace(/_/g, ' ')}
                    </p>
                  </div>
                  {note.classification.category && (
                    <div>
                      <p className="text-sm text-gray-500">Category</p>
                      <p className="text-sm font-medium text-gray-900">
                        {note.classification.category}
                      </p>
                    </div>
                  )}
                  {note.classification.priority && (
                    <div>
                      <p className="text-sm text-gray-500">Priority</p>
                      <p className="text-sm font-medium text-gray-900 capitalize">
                        {note.classification.priority}
                      </p>
                    </div>
                  )}
                  {note.importance && (
                    <div>
                      <p className="text-sm text-gray-500">Importance</p>
                      <p className="text-sm font-medium text-gray-900 capitalize">
                        {note.importance}
                      </p>
                    </div>
                  )}
                </div>

                {/* Tags */}
                {note.classification.tags && note.classification.tags.length > 0 && (
                  <div className="pt-3 border-t">
                    <p className="text-sm text-gray-500 mb-2">Tags</p>
                    <div className="flex flex-wrap gap-2">
                      {note.classification.tags.map((tag, idx) => (
                        <span key={idx} className="text-xs bg-gray-100 text-gray-700 px-3 py-1 rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Metadata */}
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
                  <span className="text-sm text-gray-600">Created</span>
                  <span className="text-sm font-medium text-gray-900">
                    {formatDate(note.timestamps.createdAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Last Modified</span>
                  <span className="text-sm font-medium text-gray-900">
                    {formatDate(note.timestamps.lastModifiedAt || note.updatedAt)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Author */}
            {note.createdBy && (
              <Card>
                <CardHeader>
                  <div className="flex items-center space-x-2">
                    <User className="h-5 w-5 text-primary" />
                    <CardTitle>Created By</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm font-medium text-gray-900">
                    {note.createdBy.name || 'Unknown User'}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Metadata */}
            {(note.content.wordCount || note.content.readingTime || note.content.characterCount) && (
              <Card>
                <CardHeader>
                  <div className="flex items-center space-x-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <CardTitle>Content Stats</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {note.content.wordCount && (
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm text-gray-600">Words</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {note.content.wordCount}
                      </span>
                    </div>
                  )}
                  {note.content.characterCount && (
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm text-gray-600">Characters</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {note.content.characterCount}
                      </span>
                    </div>
                  )}
                  {note.content.readingTime && (
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm text-gray-600">Reading Time</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {note.content.readingTime} min
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Analytics */}
            {(note.analytics?.viewCount || note.metadata?.viewCount) && (
              <Card>
                <CardHeader>
                  <div className="flex items-center space-x-2">
                    <Eye className="h-5 w-5 text-primary" />
                    <CardTitle>Analytics</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-600">Views</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {note.analytics?.viewCount || note.metadata?.viewCount || 0}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Visibility */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Visibility</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium text-gray-900 capitalize">
                  {note.visibility.scope.replace(/_/g, ' ')}
                </p>
              </CardContent>
            </Card>

            {/* Note ID */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Note ID</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs font-mono text-gray-500 break-all">{note.noteId}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}