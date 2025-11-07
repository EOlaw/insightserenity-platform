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
  Plus,
  Search,
  Filter,
  MoreVertical,
  Edit,
  Trash2,
  ArrowLeft,
  Bell,
  Loader2,
  AlertCircle,
  MessageSquare,
  Calendar,
  Tag,
  User,
  Clock,
  Star,
  AlertTriangle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '@/lib/api/client'

interface Note {
  _id: string
  noteId: string
  content: {
    title?: string
    body: string
    summary?: string
  }
  classification: {
    type: string
    category?: string
    priority?: string
    tags?: string[]
  }
  timestamps: {
    createdAt: string
    lastModifiedAt?: string
  }
  createdBy?: {
    name?: string
    userId?: string
  }
  metadata?: {
    wordCount?: number
    readingTime?: number
  }
}

export default function ClientNotesPage() {
  const router = useRouter()
  const params = useParams()
  const clientId = params.id as string

  const [notes, setNotes] = useState<Note[]>([])
  const [filteredNotes, setFilteredNotes] = useState<Note[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [clientName, setClientName] = useState('')

  useEffect(() => {
    loadNotes()
    loadClientInfo()
  }, [clientId])

  useEffect(() => {
    filterNotes()
  }, [searchQuery, typeFilter, priorityFilter, notes])

  const loadClientInfo = async () => {
    try {
      const response = await api.get(`/clients/${clientId}`)
      const data = response.data || response
      setClientName(data.client?.companyName || 'Client')
    } catch (err) {
      console.error('Error loading client info:', err)
    }
  }

  const loadNotes = async () => {
    setIsLoading(true)
    setError('')

    try {
      const response = await api.get(`/clients/${clientId}/notes`)
      const data = response.data || response
      
      if (data.notes) {
        setNotes(data.notes)
        setFilteredNotes(data.notes)
      } else {
        setNotes([])
        setFilteredNotes([])
      }
    } catch (err: any) {
      console.error('Error loading notes:', err)
      setError(err.response?.data?.error?.message || err.message || 'Failed to load notes')
      toast.error('Failed to load notes')
    } finally {
      setIsLoading(false)
    }
  }

  const filterNotes = () => {
    let filtered = [...notes]

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(note => {
        const title = note.content.title?.toLowerCase() || ''
        const body = note.content.body?.toLowerCase() || ''
        const summary = note.content.summary?.toLowerCase() || ''
        const query = searchQuery.toLowerCase()

        return title.includes(query) || body.includes(query) || summary.includes(query)
      })
    }

    // Apply type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(note => note.classification.type === typeFilter)
    }

    // Apply priority filter
    if (priorityFilter !== 'all') {
      filtered = filtered.filter(note => note.classification.priority === priorityFilter)
    }

    setFilteredNotes(filtered)
  }

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note?')) return

    try {
      await api.delete(`/notes/${noteId}`)
      toast.success('Note deleted successfully')
      loadNotes()
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
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${config.color}`}>
        <Icon className="h-3 w-3 mr-1" />
        {priority}
      </span>
    )
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-sm text-gray-600">Loading notes...</p>
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
                <h1 className="text-lg font-semibold text-gray-900">Notes</h1>
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
                  <p className="text-sm text-gray-600">Total Notes</p>
                  <p className="text-2xl font-bold text-gray-900">{notes.length}</p>
                </div>
                <MessageSquare className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Critical Priority</p>
                  <p className="text-2xl font-bold text-red-600">
                    {notes.filter(n => n.classification.priority === 'critical').length}
                  </p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">High Priority</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {notes.filter(n => n.classification.priority === 'high').length}
                  </p>
                </div>
                <AlertCircle className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">This Week</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {notes.filter(n => {
                      const createdDate = new Date(n.timestamps.createdAt)
                      const now = new Date()
                      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
                      return createdDate >= weekAgo
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
                  placeholder="Search notes by title or content..."
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
                <option value="meeting">Meeting</option>
                <option value="call">Call</option>
                <option value="email">Email</option>
                <option value="general">General</option>
                <option value="follow_up">Follow Up</option>
                <option value="action_item">Action Item</option>
              </select>

              {/* Priority Filter */}
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-primary"
              >
                <option value="all">All Priorities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>

              {/* Add Note Button */}
              <Link href={`/dashboard/core-business/clients/${clientId}/notes/new`}>
                <Button className="bg-primary text-black hover:bg-primary-600 font-semibold">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Note
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Notes List */}
        {error ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-3 text-red-800">
                <AlertCircle className="h-5 w-5" />
                <div>
                  <p className="font-medium">Error Loading Notes</p>
                  <p className="text-sm">{error}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : filteredNotes.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No notes found</h3>
                <p className="text-sm text-gray-500 mb-6">
                  {searchQuery || typeFilter !== 'all' || priorityFilter !== 'all'
                    ? 'Try adjusting your search or filters'
                    : 'Get started by adding your first note'}
                </p>
                {!searchQuery && typeFilter === 'all' && priorityFilter === 'all' && (
                  <Link href={`/dashboard/core-business/clients/${clientId}/notes/new`}>
                    <Button className="bg-primary text-black hover:bg-primary-600">
                      <Plus className="h-4 w-4 mr-2" />
                      Add First Note
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredNotes.map((note) => (
              <Card key={note._id} className="hover:shadow-lg transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-3 mb-2">
                        {note.content.title && (
                          <h3 className="text-lg font-semibold text-gray-900 truncate">
                            {note.content.title}
                          </h3>
                        )}
                        {note.classification.priority && getPriorityBadge(note.classification.priority)}
                        <span className="text-xs text-gray-500 capitalize">
                          {note.classification.type}
                        </span>
                      </div>

                      <p className="text-sm text-gray-700 mb-3 line-clamp-2">
                        {note.content.summary || truncateText(note.content.body, 150)}
                      </p>

                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <div className="flex items-center space-x-1">
                          <Calendar className="h-3 w-3" />
                          <span>{formatDate(note.timestamps.createdAt)}</span>
                        </div>
                        {note.createdBy?.name && (
                          <div className="flex items-center space-x-1">
                            <User className="h-3 w-3" />
                            <span>{note.createdBy.name}</span>
                          </div>
                        )}
                        {note.metadata?.wordCount && (
                          <div className="flex items-center space-x-1">
                            <FileText className="h-3 w-3" />
                            <span>{note.metadata.wordCount} words</span>
                          </div>
                        )}
                        {note.metadata?.readingTime && (
                          <div className="flex items-center space-x-1">
                            <Clock className="h-3 w-3" />
                            <span>{note.metadata.readingTime} min read</span>
                          </div>
                        )}
                      </div>

                      {/* Tags */}
                      {note.classification.tags && note.classification.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-3">
                          {note.classification.tags.slice(0, 5).map((tag, idx) => (
                            <span key={idx} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                              {tag}
                            </span>
                          ))}
                          {note.classification.tags.length > 5 && (
                            <span className="text-xs text-gray-400">
                              +{note.classification.tags.length - 5} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-start space-x-2 ml-4">
                      <Link href={`/dashboard/core-business/clients/${clientId}/notes/${note._id}`}>
                        <Button variant="outline" size="sm">
                          View
                        </Button>
                      </Link>
                      <div className="relative group">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                        <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border hidden group-hover:block z-10">
                          <Link href={`/dashboard/core-business/clients/${clientId}/notes/${note._id}/edit`}>
                            <button className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                              <Edit className="h-3 w-3 inline mr-2" />
                              Edit
                            </button>
                          </Link>
                          <button 
                            onClick={() => handleDeleteNote(note._id)}
                            className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-3 w-3 inline mr-2" />
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
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