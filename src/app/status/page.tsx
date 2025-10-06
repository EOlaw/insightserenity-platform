'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Activity,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Info,
  Clock,
  TrendingUp,
  Server,
  Database,
  Globe,
  Shield,
  Cloud,
  Wifi,
  RefreshCw,
  Calendar,
  Bell,
  Mail,
  Rss,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Minus,
  BarChart3,
  Users,
  Code,
  Package,
  Settings,
  Zap,
  Network,
  HardDrive,
  Cpu,
  AlertCircle,
  CheckCircle2,
  Circle,
  Timer,
} from 'lucide-react'

const currentStatus = {
  overall: 'operational',
  message: 'All systems operational',
  lastUpdated: '2024-01-22T15:30:00Z',
}

const services = [
  {
    name: 'API',
    status: 'operational',
    description: 'Core API endpoints',
    uptime: 99.99,
    responseTime: 92,
    lastIncident: '15 days ago',
  },
  {
    name: 'Web Application',
    status: 'operational',
    description: 'Main web application',
    uptime: 99.98,
    responseTime: 145,
    lastIncident: '8 days ago',
  },
  {
    name: 'Database',
    status: 'operational',
    description: 'Primary database cluster',
    uptime: 99.99,
    responseTime: 12,
    lastIncident: '45 days ago',
  },
  {
    name: 'Authentication',
    status: 'operational',
    description: 'Auth & SSO services',
    uptime: 100,
    responseTime: 78,
    lastIncident: 'No incidents',
  },
  {
    name: 'Email Service',
    status: 'operational',
    description: 'Email delivery system',
    uptime: 99.95,
    responseTime: 234,
    lastIncident: '3 days ago',
  },
  {
    name: 'CDN',
    status: 'operational',
    description: 'Content delivery network',
    uptime: 100,
    responseTime: 28,
    lastIncident: 'No incidents',
  },
  {
    name: 'Webhooks',
    status: 'operational',
    description: 'Webhook delivery service',
    uptime: 99.97,
    responseTime: 156,
    lastIncident: '12 days ago',
  },
  {
    name: 'Analytics',
    status: 'operational',
    description: 'Analytics and reporting',
    uptime: 99.96,
    responseTime: 198,
    lastIncident: '5 days ago',
  },
]

const incidents = [
  {
    id: 1,
    date: '2024-01-19',
    title: 'Elevated API response times',
    status: 'resolved',
    severity: 'minor',
    duration: '45 minutes',
    affectedServices: ['API', 'Web Application'],
    description: 'Some users experienced slower API responses due to increased traffic.',
    updates: [
      { time: '14:30', message: 'Investigating elevated response times' },
      { time: '14:45', message: 'Identified cause as traffic spike' },
      { time: '15:00', message: 'Scaled resources to handle load' },
      { time: '15:15', message: 'Performance back to normal' },
    ],
  },
  {
    id: 2,
    date: '2024-01-14',
    title: 'Email delivery delays',
    status: 'resolved',
    severity: 'minor',
    duration: '2 hours',
    affectedServices: ['Email Service'],
    description: 'Email notifications were delayed due to queue processing issues.',
    updates: [
      { time: '09:00', message: 'Reports of delayed emails' },
      { time: '09:30', message: 'Identified queue backlog' },
      { time: '10:30', message: 'Queue processing normalized' },
      { time: '11:00', message: 'All emails delivered' },
    ],
  },
  {
    id: 3,
    date: '2024-01-07',
    title: 'Database maintenance',
    status: 'completed',
    severity: 'maintenance',
    duration: '30 minutes',
    affectedServices: ['Database', 'API', 'Web Application'],
    description: 'Scheduled database maintenance for performance improvements.',
    updates: [
      { time: '03:00', message: 'Maintenance started' },
      { time: '03:15', message: 'Database upgrades in progress' },
      { time: '03:30', message: 'Maintenance completed successfully' },
    ],
  },
]

const uptimeHistory = [
  { month: 'Jan', uptime: 99.98 },
  { month: 'Dec', uptime: 99.99 },
  { month: 'Nov', uptime: 99.97 },
  { month: 'Oct', uptime: 100 },
  { month: 'Sep', uptime: 99.99 },
  { month: 'Aug', uptime: 99.98 },
]

const metrics = [
  { label: 'Current Uptime', value: '99.99%', trend: 'up' },
  { label: 'Avg Response Time', value: '98ms', trend: 'down' },
  { label: 'Error Rate', value: '0.01%', trend: 'down' },
  { label: 'Active Monitors', value: '42', trend: 'neutral' },
]

const maintenanceSchedule = [
  {
    date: '2024-02-01',
    time: '03:00 - 03:30 UTC',
    title: 'Database optimization',
    impact: 'Low',
    services: ['Database'],
  },
  {
    date: '2024-02-15',
    time: '02:00 - 04:00 UTC',
    title: 'Infrastructure upgrades',
    impact: 'Medium',
    services: ['API', 'Web Application'],
  },
]

export default function StatusPage() {
  const [selectedService, setSelectedService] = useState<string | null>(null)
  const [expandedIncident, setExpandedIncident] = useState<number | null>(null)
  const [timeRange, setTimeRange] = useState('24h')

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'operational': return 'text-green-600'
      case 'degraded': return 'text-yellow-600'
      case 'partial': return 'text-orange-600'
      case 'major': return 'text-red-600'
      default: return 'text-gray-600'
    }
  }

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'operational': return 'bg-green-100'
      case 'degraded': return 'bg-yellow-100'
      case 'partial': return 'bg-orange-100'
      case 'major': return 'bg-red-100'
      default: return 'bg-gray-100'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'operational': return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'degraded': return <AlertTriangle className="h-5 w-5 text-yellow-600" />
      case 'partial': return <AlertCircle className="h-5 w-5 text-orange-600" />
      case 'major': return <XCircle className="h-5 w-5 text-red-600" />
      default: return <Info className="h-5 w-5 text-gray-600" />
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'minor': return 'text-yellow-600 bg-yellow-100'
      case 'major': return 'text-red-600 bg-red-100'
      case 'maintenance': return 'text-blue-600 bg-blue-100'
      case 'resolved': return 'text-green-600 bg-green-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <Link href="/" className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <span className="text-black font-bold text-sm">E</span>
                </div>
                <span className="text-lg font-bold">Enterprise</span>
              </Link>
              <div className="hidden md:flex items-center space-x-6">
                <Link href="/status" className="text-xs text-primary font-medium">
                  Status
                </Link>
                <Link href="/status/history" className="text-xs text-gray-600 hover:text-gray-900 transition">
                  History
                </Link>
                <Link href="/status/subscribe" className="text-xs text-gray-600 hover:text-gray-900 transition">
                  Subscribe
                </Link>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Button variant="ghost" size="sm">
                <Rss className="h-3.5 w-3.5 mr-2" />
                RSS
              </Button>
              <Button variant="ghost" size="sm">
                <Bell className="h-3.5 w-3.5 mr-2" />
                Subscribe
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Current Status Hero */}
      <section className={`py-16 ${currentStatus.overall === 'operational' ? 'bg-green-50' : 'bg-yellow-50'}`}>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <div className="flex items-center justify-center mb-4">
              {getStatusIcon(currentStatus.overall)}
            </div>
            <h1 className={`text-3xl sm:text-4xl font-bold mb-2 ${getStatusColor(currentStatus.overall)}`}>
              {currentStatus.message}
            </h1>
            <p className="text-sm text-gray-600">
              Last updated: {new Date(currentStatus.lastUpdated).toLocaleString()}
            </p>
            <div className="flex items-center justify-center gap-6 mt-6">
              <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                <RefreshCw className="h-3.5 w-3.5 mr-2" />
                Refresh
              </Button>
              <Link href="/status/subscribe">
                <Button size="sm">
                  <Mail className="h-3.5 w-3.5 mr-2" />
                  Get Updates
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Metrics Overview */}
      <section className="py-8 border-b">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {metrics.map((metric, index) => (
              <div key={index} className="text-center">
                <div className="flex items-center justify-center">
                  <span className="text-2xl font-bold">{metric.value}</span>
                  {metric.trend === 'up' && <ArrowUp className="h-4 w-4 text-green-600 ml-2" />}
                  {metric.trend === 'down' && <ArrowDown className="h-4 w-4 text-red-600 ml-2" />}
                  {metric.trend === 'neutral' && <Minus className="h-4 w-4 text-gray-400 ml-2" />}
                </div>
                <p className="text-xs text-gray-600 mt-1">{metric.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services Status */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="mb-8">
              <h2 className="text-2xl font-bold mb-2">Services</h2>
              <p className="text-sm text-gray-600">Current status of all services</p>
            </div>

            <div className="grid gap-4">
              {services.map((service, index) => (
                <Card key={index} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className={`w-3 h-3 rounded-full ${
                          service.status === 'operational' ? 'bg-green-500' : 'bg-yellow-500'
                        }`} />
                        <div>
                          <h3 className="text-sm font-semibold">{service.name}</h3>
                          <p className="text-xs text-gray-500">{service.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-6">
                        <div className="text-right">
                          <p className="text-xs text-gray-500">Uptime</p>
                          <p className="text-sm font-medium">{service.uptime}%</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500">Response</p>
                          <p className="text-sm font-medium">{service.responseTime}ms</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500">Last incident</p>
                          <p className="text-sm font-medium">{service.lastIncident}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Uptime History */}
      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="mb-8">
              <h2 className="text-2xl font-bold mb-2">Uptime History</h2>
              <p className="text-sm text-gray-600">Monthly uptime over the past 6 months</p>
            </div>

            <Card>
              <CardContent className="p-6">
                <div className="grid grid-cols-6 gap-4 mb-6">
                  {uptimeHistory.map((month, index) => (
                    <div key={index} className="text-center">
                      <div className="text-xs text-gray-500 mb-2">{month.month}</div>
                      <div className={`text-lg font-bold ${
                        month.uptime >= 99.9 ? 'text-green-600' : 'text-yellow-600'
                      }`}>
                        {month.uptime}%
                      </div>
                      <div className="mt-2 h-24 bg-gray-200 rounded relative">
                        <div
                          className={`absolute bottom-0 left-0 right-0 rounded ${
                            month.uptime >= 99.9 ? 'bg-green-500' : 'bg-yellow-500'
                          }`}
                          style={{ height: `${month.uptime - 99}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="text-sm">
                    <span className="font-medium">Average uptime:</span>
                    <span className="ml-2 text-green-600 font-bold">99.98%</span>
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">SLA target:</span>
                    <span className="ml-2">99.9%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Recent Incidents */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="mb-8">
              <h2 className="text-2xl font-bold mb-2">Recent Incidents</h2>
              <p className="text-sm text-gray-600">Past incidents and their resolutions</p>
            </div>

            <div className="space-y-4">
              {incidents.map((incident) => (
                <Card key={incident.id} className="cursor-pointer" onClick={() => setExpandedIncident(expandedIncident === incident.id ? null : incident.id)}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-xs text-gray-500">{incident.date}</span>
                          <span className={`text-xs px-2 py-1 rounded-full ${getSeverityColor(incident.severity)}`}>
                            {incident.severity}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            incident.status === 'resolved' ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'
                          }`}>
                            {incident.status}
                          </span>
                        </div>
                        <CardTitle className="text-base">{incident.title}</CardTitle>
                        <CardDescription className="text-xs mt-1">
                          Duration: {incident.duration} • Affected: {incident.affectedServices.join(', ')}
                        </CardDescription>
                      </div>
                      {expandedIncident === incident.id ? (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                  </CardHeader>
                  {expandedIncident === incident.id && (
                    <CardContent>
                      <p className="text-xs text-gray-600 mb-4">{incident.description}</p>
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold">Timeline:</h4>
                        {incident.updates.map((update, idx) => (
                          <div key={idx} className="flex items-start space-x-3 text-xs">
                            <span className="text-gray-500 font-mono">{update.time}</span>
                            <span className="text-gray-700">{update.message}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>

            <div className="text-center mt-8">
              <Link href="/status/history">
                <Button variant="outline">
                  View All Incidents
                  <ChevronRight className="ml-2 h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Scheduled Maintenance */}
      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="mb-8">
              <h2 className="text-2xl font-bold mb-2">Scheduled Maintenance</h2>
              <p className="text-sm text-gray-600">Upcoming maintenance windows</p>
            </div>

            <div className="space-y-4">
              {maintenanceSchedule.map((maintenance, index) => (
                <Card key={index}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold">{maintenance.title}</h3>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
                          <span className="flex items-center">
                            <Calendar className="h-3 w-3 mr-1" />
                            {maintenance.date}
                          </span>
                          <span className="flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            {maintenance.time}
                          </span>
                          <span>Impact: <span className={maintenance.impact === 'Low' ? 'text-green-600' : 'text-yellow-600'}>{maintenance.impact}</span></span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Affected services: {maintenance.services.join(', ')}
                        </p>
                      </div>
                      <Button size="sm" variant="outline">
                        <Bell className="h-3.5 w-3.5 mr-2" />
                        Remind Me
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Subscribe Section */}
      <section className="py-16 lg:py-24 bg-primary">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-black mb-4">
            Stay Informed
          </h2>
          <p className="text-sm text-black/80 mb-8 max-w-2xl mx-auto">
            Get real-time updates about service status, incidents, and maintenance
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button variant="secondary" size="lg">
              <Mail className="mr-2 h-4 w-4" />
              Email Updates
            </Button>
            <Button variant="outline" size="lg" className="bg-black/10 border-black/20 hover:bg-black/20">
              <Rss className="mr-2 h-4 w-4" />
              RSS Feed
            </Button>
          </div>
          <p className="text-xs text-black/60 mt-6">
            Also available: Webhook notifications for automated monitoring
          </p>
        </div>
      </section>
    </div>
  )
}
