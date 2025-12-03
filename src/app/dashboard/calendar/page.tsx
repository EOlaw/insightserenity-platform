'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  MapPin,
  Users,
  Video,
  FileText,
  Loader2,
} from 'lucide-react'
import toast from 'react-hot-toast'

interface CalendarEvent {
  id: string
  title: string
  date: Date
  startTime: string
  endTime: string
  type: 'meeting' | 'call' | 'deadline' | 'reminder'
  location?: string
  description?: string
  attendees?: string[]
}

const mockEvents: CalendarEvent[] = [
  {
    id: '1',
    title: 'Project Kickoff Meeting',
    date: new Date(2025, 10, 29),
    startTime: '10:00 AM',
    endTime: '11:00 AM',
    type: 'meeting',
    location: 'Virtual Meeting Room',
    description: 'Initial project discussion and requirements gathering',
    attendees: ['John Smith', 'Sarah Johnson'],
  },
  {
    id: '2',
    title: 'Quarterly Review',
    date: new Date(2025, 10, 30),
    startTime: '2:00 PM',
    endTime: '3:30 PM',
    type: 'meeting',
    location: 'Conference Room A',
  },
  {
    id: '3',
    title: 'Document Submission Deadline',
    date: new Date(2025, 11, 1),
    startTime: '5:00 PM',
    endTime: '5:00 PM',
    type: 'deadline',
  },
]

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [events, setEvents] = useState<CalendarEvent[]>(mockEvents)
  const [showEventDialog, setShowEventDialog] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [loading, setLoading] = useState(false)
  const [eventForm, setEventForm] = useState({
    title: '',
    date: '',
    startTime: '',
    endTime: '',
    type: 'meeting' as CalendarEvent['type'],
    location: '',
    description: '',
  })

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const daysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  }

  const firstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay()
  }

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))
  }

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))
  }

  const getEventsForDate = (date: Date) => {
    return events.filter(event => 
      event.date.getDate() === date.getDate() &&
      event.date.getMonth() === date.getMonth() &&
      event.date.getFullYear() === date.getFullYear()
    )
  }

  const handleDateClick = (day: number) => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day)
    setSelectedDate(date)
  }

  const handleAddEvent = () => {
    setEventForm({
      title: '',
      date: selectedDate ? selectedDate.toISOString().split('T')[0] : '',
      startTime: '',
      endTime: '',
      type: 'meeting',
      location: '',
      description: '',
    })
    setSelectedEvent(null)
    setShowEventDialog(true)
  }

  const handleSaveEvent = async () => {
    setLoading(true)
    try {
      // TODO: Save event to API
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const newEvent: CalendarEvent = {
        id: Date.now().toString(),
        title: eventForm.title,
        date: new Date(eventForm.date),
        startTime: eventForm.startTime,
        endTime: eventForm.endTime,
        type: eventForm.type,
        location: eventForm.location,
        description: eventForm.description,
      }
      
      setEvents([...events, newEvent])
      toast.success('Event created successfully')
      setShowEventDialog(false)
    } catch (error) {
      toast.error('Failed to create event')
    } finally {
      setLoading(false)
    }
  }

  const renderCalendarDays = () => {
    const days = []
    const totalDays = daysInMonth(currentDate)
    const startDay = firstDayOfMonth(currentDate)
    
    // Empty cells for days before month starts
    for (let i = 0; i < startDay; i++) {
      days.push(
        <div key={`empty-${i}`} className="aspect-square p-2" />
      )
    }
    
    // Days of the month
    for (let day = 1; day <= totalDays; day++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day)
      const dayEvents = getEventsForDate(date)
      const isToday = 
        date.getDate() === new Date().getDate() &&
        date.getMonth() === new Date().getMonth() &&
        date.getFullYear() === new Date().getFullYear()
      const isSelected = 
        selectedDate &&
        date.getDate() === selectedDate.getDate() &&
        date.getMonth() === selectedDate.getMonth() &&
        date.getFullYear() === selectedDate.getFullYear()
      
      days.push(
        <button
          key={day}
          onClick={() => handleDateClick(day)}
          className={`aspect-square p-2 rounded-lg border text-left transition-colors ${
            isSelected
              ? 'bg-[#ffc451] border-[#ffc451] text-black'
              : isToday
              ? 'border-[#ffc451] bg-[#ffc451]/10'
              : 'border-gray-200 dark:border-gray-700 hover:border-[#ffc451]/50'
          }`}
        >
          <div className="text-xs font-medium mb-1">{day}</div>
          <div className="space-y-0.5">
            {dayEvents.slice(0, 2).map(event => (
              <div
                key={event.id}
                className={`text-xs px-1 py-0.5 rounded truncate ${
                  event.type === 'meeting'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                    : event.type === 'deadline'
                    ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                    : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                }`}
              >
                {event.title}
              </div>
            ))}
            {dayEvents.length > 2 && (
              <div className="text-xs text-gray-500 px-1">+{dayEvents.length - 2} more</div>
            )}
          </div>
        </button>
      )
    }
    
    return days
  }

  const selectedDateEvents = selectedDate ? getEventsForDate(selectedDate) : []

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Calendar</h1>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            Manage your schedule and upcoming events
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar Grid */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                  </CardTitle>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={previousMonth}
                      className="h-7 w-7 p-0"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentDate(new Date())}
                      className="text-xs h-7 px-3"
                    >
                      Today
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={nextMonth}
                      className="h-7 w-7 p-0"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div
                      key={day}
                      className="text-center text-xs font-semibold text-gray-600 dark:text-gray-400 py-2"
                    >
                      {day}
                    </div>
                  ))}
                  {renderCalendarDays()}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Event Details Sidebar */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {selectedDate
                      ? `${monthNames[selectedDate.getMonth()]} ${selectedDate.getDate()}`
                      : 'Select a Date'}
                  </CardTitle>
                  {selectedDate && (
                    <Button
                      size="sm"
                      onClick={handleAddEvent}
                      className="bg-[#ffc451] hover:bg-[#e6b048] text-black text-xs h-7 px-3"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {selectedDateEvents.length > 0 ? (
                  <div className="space-y-3">
                    {selectedDateEvents.map(event => (
                      <div
                        key={event.id}
                        className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-[#ffc451] dark:hover:border-[#ffc451] transition-colors cursor-pointer"
                        onClick={() => {
                          setSelectedEvent(event)
                          setShowEventDialog(true)
                        }}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="text-xs font-semibold text-gray-900 dark:text-white">
                            {event.title}
                          </h4>
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              event.type === 'meeting'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                : event.type === 'deadline'
                                ? 'border-red-500 text-red-600 dark:text-red-400'
                                : 'border-green-500 text-green-600 dark:text-green-400'
                            }`}
                          >
                            {event.type}
                          </Badge>
                        </div>
                        <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                          <div className="flex items-center space-x-2">
                            <Clock className="h-3 w-3" />
                            <span>{event.startTime} - {event.endTime}</span>
                          </div>
                          {event.location && (
                            <div className="flex items-center space-x-2">
                              <MapPin className="h-3 w-3" />
                              <span>{event.location}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CalendarIcon className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {selectedDate ? 'No events scheduled' : 'Select a date to view events'}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Upcoming Events</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {events.slice(0, 3).map(event => (
                    <div key={event.id} className="flex items-start space-x-2 text-xs">
                      <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#ffc451] mt-1.5" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white truncate">
                          {event.title}
                        </p>
                        <p className="text-gray-600 dark:text-gray-400">
                          {monthNames[event.date.getMonth()]} {event.date.getDate()}, {event.startTime}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Event Dialog */}
        <Dialog open={showEventDialog} onOpenChange={setShowEventDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base">
                {selectedEvent ? 'Event Details' : 'Create Event'}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {selectedEvent ? 'View event information' : 'Add a new event to your calendar'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="title" className="text-xs">Title</Label>
                <Input
                  id="title"
                  value={selectedEvent ? selectedEvent.title : eventForm.title}
                  onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                  disabled={!!selectedEvent}
                  className="text-xs h-8"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="startTime" className="text-xs">Start Time</Label>
                  <Input
                    id="startTime"
                    type="time"
                    value={selectedEvent ? selectedEvent.startTime : eventForm.startTime}
                    onChange={(e) => setEventForm({ ...eventForm, startTime: e.target.value })}
                    disabled={!!selectedEvent}
                    className="text-xs h-8"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="endTime" className="text-xs">End Time</Label>
                  <Input
                    id="endTime"
                    type="time"
                    value={selectedEvent ? selectedEvent.endTime : eventForm.endTime}
                    onChange={(e) => setEventForm({ ...eventForm, endTime: e.target.value })}
                    disabled={!!selectedEvent}
                    className="text-xs h-8"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="type" className="text-xs">Type</Label>
                <Select
                  value={selectedEvent ? selectedEvent.type : eventForm.type}
                  onValueChange={(value: CalendarEvent['type']) => 
                    setEventForm({ ...eventForm, type: value })
                  }
                  disabled={!!selectedEvent}
                >
                  <SelectTrigger className="text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meeting" className="text-xs">Meeting</SelectItem>
                    <SelectItem value="call" className="text-xs">Call</SelectItem>
                    <SelectItem value="deadline" className="text-xs">Deadline</SelectItem>
                    <SelectItem value="reminder" className="text-xs">Reminder</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="location" className="text-xs">Location</Label>
                <Input
                  id="location"
                  value={selectedEvent ? selectedEvent.location || '' : eventForm.location}
                  onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })}
                  disabled={!!selectedEvent}
                  placeholder="Optional"
                  className="text-xs h-8"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description" className="text-xs">Description</Label>
                <Textarea
                  id="description"
                  value={selectedEvent ? selectedEvent.description || '' : eventForm.description}
                  onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                  disabled={!!selectedEvent}
                  placeholder="Optional"
                  rows={3}
                  className="text-xs resize-none"
                />
              </div>
            </div>
            <DialogFooter>
              {!selectedEvent && (
                <Button
                  onClick={handleSaveEvent}
                  disabled={loading}
                  className="bg-[#ffc451] hover:bg-[#e6b048] text-black text-xs h-8 px-4"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Event'
                  )}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}