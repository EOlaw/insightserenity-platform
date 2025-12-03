'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Bell,
  CheckCircle2,
  FileText,
  Users,
  Calendar,
  AlertCircle,
  TrendingUp,
  MessageSquare,
  Archive,
  Trash2,
  Settings,
  Clock,
  Circle,
} from 'lucide-react'
import toast from 'react-hot-toast'

interface Notification {
  id: string
  type: 'info' | 'success' | 'warning' | 'message'
  title: string
  description: string
  timestamp: string
  read: boolean
  icon: React.ElementType
}

const mockNotifications: Notification[] = [
  {
    id: '1',
    type: 'success',
    title: 'Document Uploaded Successfully',
    description: 'Your Q4 report has been uploaded to the client portal',
    timestamp: '5 minutes ago',
    read: false,
    icon: FileText,
  },
  {
    id: '2',
    type: 'message',
    title: 'New Message from Sarah Johnson',
    description: 'I have reviewed the documents and everything looks good',
    timestamp: '1 hour ago',
    read: false,
    icon: MessageSquare,
  },
  {
    id: '3',
    type: 'info',
    title: 'Project Update Available',
    description: 'Your consultant has updated the project timeline and milestones',
    timestamp: '2 hours ago',
    read: true,
    icon: TrendingUp,
  },
  {
    id: '4',
    type: 'warning',
    title: 'Upcoming Meeting Reminder',
    description: 'Project kickoff meeting scheduled for tomorrow at 10:00 AM',
    timestamp: '3 hours ago',
    read: true,
    icon: Calendar,
  },
  {
    id: '5',
    type: 'info',
    title: 'New Team Member Added',
    description: 'Emily Rodriguez has been added to your organization',
    timestamp: '1 day ago',
    read: true,
    icon: Users,
  },
  {
    id: '6',
    type: 'success',
    title: 'Payment Processed',
    description: 'Your monthly subscription payment has been successfully processed',
    timestamp: '2 days ago',
    read: true,
    icon: CheckCircle2,
  },
]

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications)
  const [activeTab, setActiveTab] = useState('all')

  const unreadCount = notifications.filter(n => !n.read).length

  const handleMarkAsRead = (id: string) => {
    setNotifications(notifications.map(n => 
      n.id === id ? { ...n, read: true } : n
    ))
  }

  const handleMarkAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })))
    toast.success('All notifications marked as read')
  }

  const handleDeleteNotification = (id: string) => {
    setNotifications(notifications.filter(n => n.id !== id))
    toast.success('Notification deleted')
  }

  const getNotificationIcon = (notification: Notification) => {
    const Icon = notification.icon
    const baseClasses = "h-4 w-4"
    
    switch (notification.type) {
      case 'success':
        return <Icon className={`${baseClasses} text-green-600 dark:text-green-400`} />
      case 'warning':
        return <Icon className={`${baseClasses} text-yellow-600 dark:text-yellow-400`} />
      case 'message':
        return <Icon className={`${baseClasses} text-blue-600 dark:text-blue-400`} />
      default:
        return <Icon className={`${baseClasses} text-gray-600 dark:text-gray-400`} />
    }
  }

  const getNotificationBadge = (type: Notification['type']) => {
    switch (type) {
      case 'success':
        return <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-xs">Success</Badge>
      case 'warning':
        return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300 text-xs">Alert</Badge>
      case 'message':
        return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 text-xs">Message</Badge>
      default:
        return <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 text-xs">Info</Badge>
    }
  }

  const filteredNotifications = notifications.filter(n => {
    if (activeTab === 'unread') return !n.read
    if (activeTab === 'messages') return n.type === 'message'
    return true
  })

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Notifications</h1>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Stay updated with your latest activity
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkAllAsRead}
                disabled={unreadCount === 0}
                className="text-xs h-8 px-3"
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
                Mark All Read
              </Button>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                <Settings className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-[#ffc451]/10 rounded-lg flex items-center justify-center">
                    <Bell className="h-5 w-5 text-[#ffc451]" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-0.5">Total</p>
                  <p className="text-base font-bold text-gray-900 dark:text-white">{notifications.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                    <Circle className="h-5 w-5 text-blue-600 dark:text-blue-300 fill-current" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-0.5">Unread</p>
                  <p className="text-base font-bold text-gray-900 dark:text-white">{unreadCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
                    <MessageSquare className="h-5 w-5 text-green-600 dark:text-green-300" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-0.5">Messages</p>
                  <p className="text-base font-bold text-gray-900 dark:text-white">
                    {notifications.filter(n => n.type === 'message').length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-yellow-100 dark:bg-yellow-900 rounded-lg flex items-center justify-center">
                    <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-300" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-0.5">Alerts</p>
                  <p className="text-base font-bold text-gray-900 dark:text-white">
                    {notifications.filter(n => n.type === 'warning').length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="h-8">
                <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                <TabsTrigger value="unread" className="text-xs">
                  Unread {unreadCount > 0 && `(${unreadCount})`}
                </TabsTrigger>
                <TabsTrigger value="messages" className="text-xs">Messages</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {filteredNotifications.length > 0 ? (
                filteredNotifications.map((notification, index) => (
                  <div key={notification.id}>
                    <div
                      className={`flex items-start space-x-3 p-3 rounded-lg transition-colors ${
                        !notification.read
                          ? 'bg-[#ffc451]/5 border border-[#ffc451]/20'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <div className="flex-shrink-0">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          !notification.read 
                            ? 'bg-[#ffc451]/10' 
                            : 'bg-gray-100 dark:bg-gray-800'
                        }`}>
                          {getNotificationIcon(notification)}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-1">
                          <div className="flex items-center space-x-2">
                            <h4 className={`text-xs font-semibold ${
                              !notification.read 
                                ? 'text-gray-900 dark:text-white' 
                                : 'text-gray-700 dark:text-gray-300'
                            }`}>
                              {notification.title}
                            </h4>
                            {!notification.read && (
                              <div className="w-1.5 h-1.5 bg-[#ffc451] rounded-full" />
                            )}
                          </div>
                          {getNotificationBadge(notification.type)}
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                          {notification.description}
                        </p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-1 text-xs text-gray-500 dark:text-gray-500">
                            <Clock className="h-3 w-3" />
                            <span>{notification.timestamp}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            {!notification.read && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleMarkAsRead(notification.id)}
                                className="text-xs h-6 px-2 text-[#ffc451] hover:text-[#e6b048]"
                              >
                                Mark as Read
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteNotification(notification.id)}
                              className="text-xs h-6 px-2 text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                    {index < filteredNotifications.length - 1 && (
                      <Separator className="my-2" />
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Bell className="h-8 w-8 text-gray-400" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                    No Notifications
                  </h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {activeTab === 'unread' 
                      ? "You're all caught up!" 
                      : "You don't have any notifications yet"}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}