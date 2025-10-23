'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  DollarSign,
  Briefcase,
  Activity,
  TrendingUp,
  Users,
  AlertCircle,
  CheckCircle,
  ArrowLeft,
  Edit,
  FileText,
  Calendar,
  Bell,
  LogOut,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '@/lib/api/client'

interface ClientDashboardData {
  client: {
    _id: string
    clientCode: string
    companyName: string
    displayName: string
    legalName: string
    fullAddress: string
    isActive: boolean
    hasOutstandingBalance: boolean
    daysUntilRenewal: number | null
    primaryContact: {
      name: string
      email: string
      phone: string
      preferredContactMethod: string
    }
    relationship: {
      status: string
      tier: string
      accountManager: string | null
      acquisitionDate: string
      acquisitionSource: string
    }
    billing: {
      currency: string
      paymentTerms: string
      taxExempt: boolean
      outstandingBalance: number
      totalRevenue: number
    }
  }
  statistics: {
    overview: {
      clientId: string
      clientCode: string
      companyName: string
      status: string
      tier: string
    }
    financial: {
      totalRevenue: number
      outstandingBalance: number
      currency: string
    }
    engagement: {
      totalProjects: number
      activeProjects: number
      totalEngagements: number
      portalLogins: number
    }
    activity: {
      totalInteractions: number
    }
    health: any
  }
}

export default function ClientDashboardPage() {
  const router = useRouter()
  const params = useParams()
  const clientId = params.id as string

  const [dashboardData, setDashboardData] = useState<ClientDashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadDashboardData()
  }, [clientId])

  const loadDashboardData = async () => {
    setIsLoading(true)
    setError('')

    try {
      const response = await api.get(`/clients/${clientId}/dashboard`)
      const data = response.data || response
      
      if (!data.client || !data.statistics) {
        throw new Error('Invalid response structure')
      }

      setDashboardData(data)
    } catch (err: any) {
      console.error('Failed to load client dashboard:', err)
      setError(err.message || 'Failed to load dashboard data')
      toast.error('Failed to load client dashboard')
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-success-50 text-success-700">
            Active
          </span>
        )
      case 'prospect':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-info-50 text-info-700">
            Prospect
          </span>
        )
      case 'churned':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-error-50 text-error-700">
            Churned
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
            {status}
          </span>
        )
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-gray-600">Loading client dashboard...</p>
        </div>
      </div>
    )
  }

  if (error || !dashboardData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 bg-error-50 rounded-full flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-error-600" />
              </div>
            </div>
            <CardTitle className="text-center text-base">Error Loading Dashboard</CardTitle>
            <CardDescription className="text-center text-xs">
              {error || 'Failed to load dashboard data'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Button onClick={loadDashboardData} className="w-full" size="sm">
                Try Again
              </Button>
              <Button 
                onClick={() => router.push('/dashboard/core-business/clients')} 
                variant="outline" 
                className="w-full"
                size="sm"
              >
                Back to Clients
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { client, statistics } = dashboardData

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/dashboard" className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <span className="text-black font-bold text-sm">E</span>
                </div>
                <span className="text-lg font-bold">Enterprise</span>
              </Link>
            </div>

            <div className="flex items-center space-x-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => router.push('/dashboard/core-business/clients')}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Clients
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
        {/* Client Header Section */}
        <div className="mb-8">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                {client.displayName}
              </h1>
              <div className="flex items-center space-x-3 text-sm text-gray-600">
                <span className="font-medium">{client.clientCode}</span>
                <span>•</span>
                <span className="capitalize">{client.relationship.tier} Tier</span>
                <span>•</span>
                {getStatusBadge(client.relationship.status)}
              </div>
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm" onClick={loadDashboardData}>
                <Activity className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Link href={`/dashboard/core-business/clients/${clientId}/edit`}>
                <Button size="sm" className="bg-primary text-black hover:bg-primary-600">
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Client
                </Button>
              </Link>
            </div>
          </div>

          {client.hasOutstandingBalance && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning-50 border border-warning-200">
              <AlertCircle className="h-4 w-4 text-warning-700" />
              <span className="text-sm font-medium text-warning-700">
                Outstanding balance of {client.billing.currency} {client.billing.outstandingBalance.toLocaleString()}
              </span>
            </div>
          )}
        </div>

        {/* Statistics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Revenue
              </CardTitle>
              <DollarSign className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {statistics.financial.currency} {statistics.financial.totalRevenue.toLocaleString()}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Lifetime value
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Active Projects
              </CardTitle>
              <Briefcase className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {statistics.engagement.activeProjects}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                of {statistics.engagement.totalProjects} total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Engagements
              </CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {statistics.engagement.totalEngagements}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Total interactions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Portal Activity
              </CardTitle>
              <Activity className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {statistics.engagement.portalLogins}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Portal logins
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Two Column Layout for Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Contact Information Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contact Information</CardTitle>
              <CardDescription className="text-xs">
                Primary contact details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center space-x-3 p-3 rounded-lg bg-gray-50">
                  <div className="flex-shrink-0">
                    <Users className="h-5 w-5 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {client.primaryContact.name}
                    </p>
                    <p className="text-xs text-gray-500">Primary Contact</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 p-3 rounded-lg bg-gray-50">
                  <div className="flex-shrink-0">
                    <Mail className="h-5 w-5 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {client.primaryContact.email}
                    </p>
                    <p className="text-xs text-gray-500">Email Address</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 p-3 rounded-lg bg-gray-50">
                  <div className="flex-shrink-0">
                    <Phone className="h-5 w-5 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {client.primaryContact.phone}
                    </p>
                    <p className="text-xs text-gray-500">Phone Number</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 p-3 rounded-lg bg-gray-50">
                  <div className="flex-shrink-0">
                    <MapPin className="h-5 w-5 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {client.fullAddress || 'Not specified'}
                    </p>
                    <p className="text-xs text-gray-500">Business Address</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Business Details Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Business Details</CardTitle>
              <CardDescription className="text-xs">
                Company and billing information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center space-x-3 p-3 rounded-lg bg-gray-50">
                  <div className="flex-shrink-0">
                    <Building2 className="h-5 w-5 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {client.legalName}
                    </p>
                    <p className="text-xs text-gray-500">Legal Name</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 p-3 rounded-lg bg-gray-50">
                  <div className="flex-shrink-0">
                    <FileText className="h-5 w-5 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 uppercase">
                      {client.billing.paymentTerms}
                    </p>
                    <p className="text-xs text-gray-500">Payment Terms</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 p-3 rounded-lg bg-gray-50">
                  <div className="flex-shrink-0">
                    <DollarSign className="h-5 w-5 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {client.billing.currency} {client.billing.outstandingBalance.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">Outstanding Balance</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 p-3 rounded-lg bg-gray-50">
                  <div className="flex-shrink-0">
                    <Calendar className="h-5 w-5 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {new Date(client.relationship.acquisitionDate).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-gray-500">
                      Acquired via {client.relationship.acquisitionSource}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Activity Metrics Card */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-base">Activity Overview</CardTitle>
            <CardDescription className="text-xs">
              Recent engagement metrics and performance indicators
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                <div className="flex items-center justify-between mb-2">
                  <Activity className="h-5 w-5 text-primary" />
                  <TrendingUp className="h-4 w-4 text-success-600" />
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {statistics.activity.totalInteractions}
                </p>
                <p className="text-xs text-gray-600 mt-1">Total Interactions</p>
              </div>

              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                <div className="flex items-center justify-between mb-2">
                  <Briefcase className="h-5 w-5 text-primary" />
                  <CheckCircle className="h-4 w-4 text-success-600" />
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {statistics.engagement.totalProjects}
                </p>
                <p className="text-xs text-gray-600 mt-1">Total Projects</p>
              </div>

              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                <div className="flex items-center justify-between mb-2">
                  <Users className="h-5 w-5 text-primary" />
                  <span className="text-xs font-medium text-gray-700 bg-white px-2 py-1 rounded">
                    {client.relationship.tier.toUpperCase()}
                  </span>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {client.relationship.tier.replace('_', ' ')}
                </p>
                <p className="text-xs text-gray-600 mt-1">Client Tier</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
            <CardDescription className="text-xs">
              Common tasks and navigation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Link href={`/dashboard/core-business/clients/${clientId}/projects`}>
                <Button variant="outline" size="sm" className="w-full">
                  <Briefcase className="h-3.5 w-3.5 mr-2" />
                  Projects
                </Button>
              </Link>
              <Link href={`/dashboard/core-business/clients/${clientId}/documents`}>
                <Button variant="outline" size="sm" className="w-full">
                  <FileText className="h-3.5 w-3.5 mr-2" />
                  Documents
                </Button>
              </Link>
              <Link href={`/dashboard/core-business/clients/${clientId}/contacts`}>
                <Button variant="outline" size="sm" className="w-full">
                  <Users className="h-3.5 w-3.5 mr-2" />
                  Contacts
                </Button>
              </Link>
              <Link href={`/dashboard/core-business/clients/${clientId}/notes`}>
                <Button variant="outline" size="sm" className="w-full">
                  <FileText className="h-3.5 w-3.5 mr-2" />
                  Notes
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}