'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Search,
  Send,
  Paperclip,
  MoreVertical,
  Phone,
  Video,
  Info,
  Star,
  Archive,
  Trash2,
  Circle,
} from 'lucide-react'

interface Contact {
  id: string
  name: string
  role: string
  lastMessage: string
  timestamp: string
  unread: number
  online: boolean
  avatar: string
}

interface Message {
  id: string
  senderId: string
  text: string
  timestamp: string
  isOwn: boolean
}

const mockContacts: Contact[] = [
  {
    id: '1',
    name: 'Sarah Johnson',
    role: 'Senior Consultant',
    lastMessage: 'I have reviewed the documents and everything looks good',
    timestamp: '2m ago',
    unread: 2,
    online: true,
    avatar: 'SJ',
  },
  {
    id: '2',
    name: 'Michael Chen',
    role: 'Project Manager',
    lastMessage: 'Can we schedule a meeting for next week?',
    timestamp: '1h ago',
    unread: 0,
    online: true,
    avatar: 'MC',
  },
  {
    id: '3',
    name: 'Emily Rodriguez',
    role: 'Account Manager',
    lastMessage: 'Thank you for the update',
    timestamp: '3h ago',
    unread: 0,
    online: false,
    avatar: 'ER',
  },
  {
    id: '4',
    name: 'David Park',
    role: 'Technical Specialist',
    lastMessage: 'The implementation is complete',
    timestamp: 'Yesterday',
    unread: 0,
    online: false,
    avatar: 'DP',
  },
]

const mockMessages: Message[] = [
  {
    id: '1',
    senderId: '1',
    text: 'Hi, I wanted to follow up on the project timeline',
    timestamp: '10:30 AM',
    isOwn: false,
  },
  {
    id: '2',
    senderId: 'me',
    text: 'Sure, I can provide an update. We are currently on track for the December deadline',
    timestamp: '10:32 AM',
    isOwn: true,
  },
  {
    id: '3',
    senderId: '1',
    text: 'Great to hear. Could you send over the latest documents?',
    timestamp: '10:35 AM',
    isOwn: false,
  },
  {
    id: '4',
    senderId: 'me',
    text: 'I will upload them to the client portal this afternoon',
    timestamp: '10:37 AM',
    isOwn: true,
  },
  {
    id: '5',
    senderId: '1',
    text: 'I have reviewed the documents and everything looks good',
    timestamp: '2:15 PM',
    isOwn: false,
  },
]

export default function MessagesPage() {
  const [contacts] = useState<Contact[]>(mockContacts)
  const [messages] = useState<Message[]>(mockMessages)
  const [selectedContact, setSelectedContact] = useState<Contact | null>(contacts[0])
  const [searchQuery, setSearchQuery] = useState('')
  const [messageText, setMessageText] = useState('')

  const handleSendMessage = () => {
    if (messageText.trim()) {
      // TODO: Send message via API
      setMessageText('')
    }
  }

  const filteredContacts = contacts.filter(contact =>
    contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.role.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Messages</h1>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            Communicate with your team and consultants
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <Card className="h-[calc(100vh-12rem)]">
              <CardHeader className="pb-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <Input
                    placeholder="Search conversations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 text-xs h-8"
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="space-y-1 px-3 pb-3 overflow-y-auto max-h-[calc(100vh-18rem)]">
                  {filteredContacts.map((contact) => (
                    <button
                      key={contact.id}
                      onClick={() => setSelectedContact(contact)}
                      className={`w-full flex items-start space-x-3 p-3 rounded-lg transition-colors ${
                        selectedContact?.id === contact.id
                          ? 'bg-[#ffc451]/10 border border-[#ffc451]'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      <div className="relative flex-shrink-0">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-[#ffc451] text-black text-xs font-medium">
                            {contact.avatar}
                          </AvatarFallback>
                        </Avatar>
                        {contact.online && (
                          <Circle className="absolute -bottom-0.5 -right-0.5 h-3 w-3 fill-green-500 text-green-500 bg-white dark:bg-gray-900 rounded-full" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center justify-between mb-0.5">
                          <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                            {contact.name}
                          </p>
                          <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 ml-2">
                            {contact.timestamp}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 truncate">
                          {contact.role}
                        </p>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-gray-500 dark:text-gray-500 truncate flex-1">
                            {contact.lastMessage}
                          </p>
                          {contact.unread > 0 && (
                            <Badge className="bg-[#ffc451] text-black text-xs ml-2 h-5 min-w-[20px] flex items-center justify-center">
                              {contact.unread}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            {selectedContact ? (
              <Card className="h-[calc(100vh-12rem)] flex flex-col">
                <CardHeader className="pb-3 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="relative">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-[#ffc451] text-black text-xs font-medium">
                            {selectedContact.avatar}
                          </AvatarFallback>
                        </Avatar>
                        {selectedContact.online && (
                          <Circle className="absolute -bottom-0.5 -right-0.5 h-3 w-3 fill-green-500 text-green-500 bg-white dark:bg-gray-900 rounded-full" />
                        )}
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                          {selectedContact.name}
                        </h3>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {selectedContact.online ? 'Active now' : 'Offline'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                        <Phone className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                        <Video className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                        <Info className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.isOwn ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-lg px-3 py-2 ${
                          message.isOwn
                            ? 'bg-[#ffc451] text-black'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
                        }`}
                      >
                        <p className="text-xs">{message.text}</p>
                        <p
                          className={`text-xs mt-1 ${
                            message.isOwn
                              ? 'text-black/70'
                              : 'text-gray-500 dark:text-gray-400'
                          }`}
                        >
                          {message.timestamp}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>

                <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-end space-x-2">
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0 flex-shrink-0">
                      <Paperclip className="h-3.5 w-3.5" />
                    </Button>
                    <Textarea
                      placeholder="Type your message..."
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSendMessage()
                        }
                      }}
                      rows={2}
                      className="text-xs resize-none"
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={!messageText.trim()}
                      className="bg-[#ffc451] hover:bg-[#e6b048] text-black h-8 px-4 flex-shrink-0"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Press Enter to send, Shift + Enter for new line
                  </p>
                </div>
              </Card>
            ) : (
              <Card className="h-[calc(100vh-12rem)] flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Send className="h-8 w-8 text-gray-400" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                    No Conversation Selected
                  </h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Choose a contact to start messaging
                  </p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}