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
  BarChart3,
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
      // Fetch dashboard data from the API
      const response = await api.get(`/clients/${clientId}/dashboard`)
      
      // Handle the nested data structure from the API response
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (error || !dashboardData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Error Loading Dashboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              {error || 'Failed to load dashboard data'}
            </p>
            <div className="flex gap-2">
              <Button onClick={loadDashboardData} variant="outline">
                Try Again
              </Button>
              <Button onClick={() => router.back()} variant="ghost">
                Go Back
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { client, statistics } = dashboardData
  const statusColor = client.relationship.status === 'active' ? 'text-green-600' : 
                      client.relationship.status === 'prospect' ? 'text-blue-600' : 
                      'text-gray-600'

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/dashboard/core-business/clients')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Clients
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{client.displayName}</h1>
            <p className="text-muted-foreground">
              {client.clientCode} • {client.relationship.tier} Tier
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadDashboardData}>
            <Activity className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Link href={`/dashboard/core-business/clients/${clientId}/edit`}>
            <Button>
              <Edit className="h-4 w-4 mr-2" />
              Edit Client
            </Button>
          </Link>
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex items-center gap-4">
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full bg-background border ${statusColor}`}>
          <CheckCircle className="h-4 w-4" />
          <span className="text-sm font-medium capitalize">{client.relationship.status}</span>
        </div>
        {client.hasOutstandingBalance && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-destructive/10 text-destructive border border-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm font-medium">Outstanding Balance</span>
          </div>
        )}
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statistics.financial.currency} {statistics.financial.totalRevenue.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Lifetime value
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statistics.engagement.activeProjects}</div>
            <p className="text-xs text-muted-foreground">
              {statistics.engagement.totalProjects} total projects
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Engagements</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statistics.engagement.totalEngagements}</div>
            <p className="text-xs text-muted-foreground">
              Total engagements
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Portal Logins</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statistics.engagement.portalLogins}</div>
            <p className="text-xs text-muted-foreground">
              Total portal visits
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Client Information */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
            <CardDescription>Primary contact details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <Users className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">{client.primaryContact.name}</p>
                <p className="text-sm text-muted-foreground">Primary Contact</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">{client.primaryContact.email}</p>
                <p className="text-sm text-muted-foreground">Email Address</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">{client.primaryContact.phone}</p>
                <p className="text-sm text-muted-foreground">Phone Number</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">{client.fullAddress || 'Not specified'}</p>
                <p className="text-sm text-muted-foreground">Address</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Business Information */}
        <Card>
          <CardHeader>
            <CardTitle>Business Information</CardTitle>
            <CardDescription>Company and billing details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <Building2 className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">{client.legalName}</p>
                <p className="text-sm text-muted-foreground">Legal Name</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">{client.billing.paymentTerms.toUpperCase()}</p>
                <p className="text-sm text-muted-foreground">Payment Terms</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <DollarSign className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">
                  {client.billing.currency} {client.billing.outstandingBalance.toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground">Outstanding Balance</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">
                  {new Date(client.relationship.acquisitionDate).toLocaleDateString()}
                </p>
                <p className="text-sm text-muted-foreground">
                  Acquired via {client.relationship.acquisitionSource}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Summary</CardTitle>
          <CardDescription>Recent interactions and engagement metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col items-center p-4 bg-muted rounded-lg">
              <Activity className="h-8 w-8 text-primary mb-2" />
              <p className="text-2xl font-bold">{statistics.activity.totalInteractions}</p>
              <p className="text-sm text-muted-foreground">Total Interactions</p>
            </div>

            <div className="flex flex-col items-center p-4 bg-muted rounded-lg">
              <BarChart3 className="h-8 w-8 text-primary mb-2" />
              <p className="text-2xl font-bold">{statistics.engagement.totalProjects}</p>
              <p className="text-sm text-muted-foreground">Total Projects</p>
            </div>

            <div className="flex flex-col items-center p-4 bg-muted rounded-lg">
              <TrendingUp className="h-8 w-8 text-primary mb-2" />
              <p className="text-2xl font-bold">
                {client.relationship.tier.replace('_', ' ').toUpperCase()}
              </p>
              <p className="text-sm text-muted-foreground">Client Tier</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link href={`/dashboard/core-business/clients/${clientId}/projects`}>
            <Button variant="outline">
              <Briefcase className="h-4 w-4 mr-2" />
              View Projects
            </Button>
          </Link>
          <Link href={`/dashboard/core-business/clients/${clientId}/documents`}>
            <Button variant="outline">
              <FileText className="h-4 w-4 mr-2" />
              Documents
            </Button>
          </Link>
          <Link href={`/dashboard/core-business/clients/${clientId}/contacts`}>
            <Button variant="outline">
              <Users className="h-4 w-4 mr-2" />
              Contacts
            </Button>
          </Link>
          <Link href={`/dashboard/core-business/clients/${clientId}/notes`}>
            <Button variant="outline">
              <FileText className="h-4 w-4 mr-2" />
              Notes
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}