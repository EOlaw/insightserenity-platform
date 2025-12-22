'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AvailabilityData {
  date: Date
  status: 'available' | 'partially_available' | 'unavailable' | 'time_off' | 'on_project'
  hours?: number
  description?: string
}

interface AvailabilityCalendarProps {
  availabilityData?: AvailabilityData[]
  onDateClick?: (date: Date) => void
}

export default function AvailabilityCalendar({ 
  availabilityData = [], 
  onDateClick 
}: AvailabilityCalendarProps) {
  const router = useRouter()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [hoveredDate, setHoveredDate] = useState<Date | null>(null)

  const daysInMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    0
  ).getDate()

  const firstDayOfMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    1
  ).getDay()

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))
  }

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  const getAvailabilityForDate = (day: number): AvailabilityData | undefined => {
    const dateToCheck = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      day
    )
    
    return availabilityData.find(
      (availability) =>
        availability.date.getDate() === dateToCheck.getDate() &&
        availability.date.getMonth() === dateToCheck.getMonth() &&
        availability.date.getFullYear() === dateToCheck.getFullYear()
    )
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      available: 'bg-emerald-500',
      partially_available: 'bg-yellow-500',
      unavailable: 'bg-red-500',
      time_off: 'bg-blue-500',
      on_project: 'bg-[#ffc451]',
    }
    return colors[status] || 'bg-gray-300'
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      available: 'Available',
      partially_available: 'Partially Available',
      unavailable: 'Unavailable',
      time_off: 'Time Off',
      on_project: 'On Project',
    }
    return labels[status] || 'Unknown'
  }

  const handleDateClick = (day: number) => {
    const clickedDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      day
    )
    
    if (onDateClick) {
      onDateClick(clickedDate)
    } else {
      const dateStr = clickedDate.toISOString().split('T')[0]
      router.push(`/consultant/availability?date=${dateStr}`)
    }
  }

  const isToday = (day: number) => {
    const today = new Date()
    return (
      day === today.getDate() &&
      currentDate.getMonth() === today.getMonth() &&
      currentDate.getFullYear() === today.getFullYear()
    )
  }

  const isPastDate = (day: number) => {
    const dateToCheck = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      day
    )
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return dateToCheck < today
  }

  const days = []
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(<div key={`empty-${i}`} className="aspect-square" />)
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const availability = getAvailabilityForDate(day)
    const isCurrentDay = isToday(day)
    const isPast = isPastDate(day)
    const dateObj = new Date(currentDate.getFullYear(), currentDate.getMonth(), day)
    const isHovered = hoveredDate?.getTime() === dateObj.getTime()

    days.push(
      <div
        key={day}
        className="relative group"
        onMouseEnter={() => setHoveredDate(dateObj)}
        onMouseLeave={() => setHoveredDate(null)}
      >
        <button
          onClick={() => handleDateClick(day)}
          className={`
            w-full aspect-square rounded-lg text-[10px] font-medium
            transition-all duration-200 relative
            ${isPast ? 'text-gray-400' : 'text-gray-900'}
            ${isCurrentDay ? 'ring-2 ring-[#ffc451] ring-offset-1' : ''}
            ${availability ? 'hover:scale-110' : 'hover:bg-gray-100'}
            ${isHovered && availability ? 'scale-110 z-10' : ''}
            focus:outline-none focus:ring-2 focus:ring-[#ffc451] focus:ring-offset-1
          `}
        >
          <div className="relative">
            <span className={isCurrentDay ? 'font-bold' : ''}>{day}</span>
            {availability && (
              <div
                className={`
                  absolute -bottom-0.5 left-1/2 transform -translate-x-1/2
                  w-1 h-1 rounded-full ${getStatusColor(availability.status)}
                `}
              />
            )}
          </div>
        </button>

        {/* Hover Tooltip */}
        {isHovered && availability && (
          <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-40 pointer-events-none">
            <div className="bg-gray-900 text-white rounded-lg shadow-xl p-2 text-left">
              <div className="flex items-center gap-1.5 mb-1">
                <div className={`w-2 h-2 rounded-full ${getStatusColor(availability.status)}`} />
                <span className="text-[9px] font-medium">
                  {getStatusLabel(availability.status)}
                </span>
              </div>
              <div className="text-[8px] text-gray-300 space-y-0.5">
                <div className="font-medium">
                  {dateObj.toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                </div>
                {availability.hours && (
                  <div>{availability.hours} hours available</div>
                )}
                {availability.description && (
                  <div className="line-clamp-2 mt-1 pt-1 border-t border-gray-700">
                    {availability.description}
                  </div>
                )}
              </div>
              {/* Tooltip Arrow */}
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-px">
                <div className="border-4 border-transparent border-t-gray-900" />
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={previousMonth}
            className="h-6 w-6 p-0"
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <div className="text-xs font-bold text-gray-900 min-w-[100px] text-center">
            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={nextMonth}
            className="h-6 w-6 p-0"
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={goToToday}
          className="h-6 text-[9px] text-[#ffc451] hover:text-[#ffb020] hover:bg-[#ffc451]/10 px-2"
        >
          Today
        </Button>
      </div>

      {/* Day Names */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {dayNames.map((day, index) => (
          <div
            key={index}
            className="text-center text-[9px] font-medium text-gray-500 uppercase"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">{days}</div>

      {/* Legend */}
      <div className="pt-3 border-t border-gray-100 space-y-1.5">
        <div className="flex items-center justify-between text-[9px]">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-gray-600">Available</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-yellow-500" />
            <span className="text-gray-600">Partial</span>
          </div>
        </div>
        <div className="flex items-center justify-between text-[9px]">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-[#ffc451]" />
            <span className="text-gray-600">On Project</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-gray-600">Time Off</span>
          </div>
        </div>
      </div>

      {/* Action Button */}
      <Button
        onClick={() => router.push('/consultant/availability')}
        size="sm"
        className="w-full bg-gradient-to-r from-[#ffc451] to-[#ffb020] hover:from-[#ffb020] hover:to-[#ffc451] text-black font-medium text-[10px] h-7"
      >
        <CalendarIcon className="mr-1.5 h-3 w-3" />
        Manage Availability
      </Button>
    </div>
  )
}