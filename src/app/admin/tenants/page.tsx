'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Building2,
  Users,
  Database,
  Globe,
  Shield,
  CreditCard,
  Calendar,
  Activity,
  Settings,
  MoreVertical,
  Search,
  Filter,
  Plus,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  TrendingUp,
  HardDrive,
  Mail,
  Phone,
  MapPin,
  DollarSign,
  Package,
  Key,
  Download,
  Upload,
  RefreshCw,
  Lock,
  Unlock,
} from 'lucide-react'

const tenantsList = [
  {
    id: 1,
    name: 'TechCorp Inc',
    slug: 'techcorp',
    domain: 'techcorp.enterprise.com',
    customDomain: 'app.techcorp.com',
    status: 'active',
    plan: 'Enterprise',
    seats: 250,
    usedSeats: 187,
    storage: { used: 45, total: 100, unit: 'GB' },
    monthlyRevenue: 4999,
    createdAt: '2023-06-15',
    lastActive: '2 minutes ago',
    contact: {
      name: 'John Smith',
      email: 'john@techcorp.com',
      phone: '+1 555-0100',
    },
    address: {
      city: 'San Francisco',
      country: 'USA',
    },
    modules: ['Core Business', 'Recruitment', 'Analytics'],
    features: {
      customDomain: true,
      sso: true,
      apiAccess: true,
      advancedSecurity: true,
    },
  },
  {
    id: 2,
    name: 'Global Retail Co',
    slug: 'globalretail',
    domain: 'globalretail.enterprise.com',
    customDomain: null,
    status: 'active',
    plan: 'Professional',
    seats: 100,
    usedSeats: 78,
    storage: { used: 28, total: 50, unit: 'GB' },
    monthlyRevenue: 1999,
    createdAt: '2023-08-22',
    lastActive: '1 hour ago',
    contact: {
      name: 'Sarah Johnson',
      email: 'sarah@globalretail.com',
      phone: '+1 555-0101',
    },
    address: {
      city: 'New York',
      country: 'USA',
    },
    modules: ['Core Business', 'Analytics'],
    features: {
      customDomain: false,
      sso: true,
      apiAccess: true,
      advancedSecurity: false,
    },
  },
  {
    id: 3,
    name: 'StartUp Ventures',
    slug: 'startupventures',
    domain: 'startupventures.enterprise.com',
    customDomain: null,
    status: 'trial',
    plan: 'Starter',
    seats: 10,
    usedSeats: 8,
    storage: { used: 2, total: 10, unit: 'GB' },
    monthlyRevenue: 0,
    createdAt: '2024-01-10',
    lastActive: '3 days ago',
    contact: {
      name: 'Mike Chen',
      email: 'mike@startupventures.com',
      phone: '+1 555-0102',
    },
    address: {
      city: 'Austin',
      country: 'USA',
    },
    modules: ['Core Business'],
    features: {
      customDomain: false,
      sso: false,
      apiAccess: false,
      advancedSecurity: false,
    },
    trialEndsIn: 7,
  },
  {
    id: 4,
    name: 'Manufacturing Ltd',
    slug: 'manufacturing',
    domain: 'manufacturing.enterprise.com',
    customDomain: 'portal.manufacturing.com',
    status: 'active',
    plan: 'Enterprise',
    seats: 500,
    usedSeats: 423,
    storage: { used: 89, total: 200, unit: 'GB' },
    monthlyRevenue: 9999,
    createdAt: '2023-03-10',
    lastActive: '15 minutes ago',
    contact: {
      name: 'David Brown',
      email: 'david@manufacturing.com',
      phone: '+44 20 7123 4567',
    },
    address: {
      city: 'London',
      country: 'UK',
    },
    modules: ['Core Business', 'Recruitment', 'Analytics', 'Billing'],
    features: {
      customDomain: true,
      sso: true,
      apiAccess: true,
      advancedSecurity: true,
    },
  },
  {
    id: 5,
    name: 'Finance Corp',
    slug: 'financecorp',
    domain: 'financecorp.enterprise.com',
    customDomain: 'secure.financecorp.com',
    status: 'suspended',
    plan: 'Professional',
    seats: 150,
    usedSeats: 0,
    storage: { used: 67, total: 100, unit: 'GB' },
    monthlyRevenue: 0,
    createdAt: '2023-09-05',
    lastActive: '2 weeks ago',
    contact: {
      name: 'Emily Wilson',
      email: 'emily@financecorp.com',
      phone: '+1 555-0103',
    },
    address: {
      city: 'Chicago',
      country: 'USA',
    },
    modules: ['Core Business', 'Analytics', 'Audit'],
    features: {
      customDomain: true,
      sso: true,
      apiAccess: true,
      advancedSecurity: true,
    },
    suspendedReason: 'Payment failed',
  },
]

export default function TenantsPage() {
  const [tenants, setTenants] = useState(tenantsList)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPlan, setFilterPlan] = useState('all')

  const filteredTenants = tenants.filter(tenant => {
    const matchesSearch = tenant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          tenant.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          tenant.contact.email.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = filterStatus === 'all' || tenant.status === filterStatus
    const matchesPlan = filterPlan === 'all' || tenant.plan === filterPlan
    return matchesSearch && matchesStatus && matchesPlan
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-100'
      case 'trial': return 'text-blue-600 bg-blue-100'
      case 'suspended': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'trial': return <Clock className="h-4 w-4 text-blue-600" />
      case 'suspended': return <XCircle className="h-4 w-4 text-red-600" />
      default: return null
    }
  }

  const getPlanColor = (plan: string) => {
    switch (plan) {
      case 'Enterprise': return 'text-purple-600 bg-purple-100'
      case 'Professional': return 'text-blue-600 bg-blue-100'
      case 'Starter': return 'text-gray-600 bg-gray-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const totalRevenue = tenants.reduce((acc, tenant) => acc + tenant.monthlyRevenue, 0)
  const totalUsers = tenants.reduce((acc, tenant) => acc + tenant.usedSeats, 0)
  const activeTenants = tenants.filter(t => t.status === 'active').length

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tenant Management</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Manage customer organizations and subscriptions
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline">
            <Download className="h-3.5 w-3.5 mr-2" />
            Export
          </Button>
          <Button size="sm">
            <Plus className="h-3.5 w-3.5 mr-2" />
            Add Tenant
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Tenants</p>
                <p className="text-2xl font-bold">{tenants.length}</p>
                <p className="text-2xs text-muted-foreground mt-1">
                  {activeTenants} active
                </p>
              </div>
              <Building2 className="h-8 w-8 text-primary/20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Users</p>
                <p className="text-2xl font-bold">{totalUsers.toLocaleString()}</p>
                <p className="text-2xs text-green-600 mt-1 flex items-center">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  +12% this month
                </p>
              </div>
              <Users className="h-8 w-8 text-blue-600/20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Monthly Revenue</p>
                <p className="text-2xl font-bold">${totalRevenue.toLocaleString()}</p>
                <p className="text-2xs text-green-600 mt-1 flex items-center">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  +8% this month
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-green-600/20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Storage Used</p>
                <p className="text-2xl font-bold">326 GB</p>
                <p className="text-2xs text-muted-foreground mt-1">
                  of 660 GB total
                </p>
              </div>
              <HardDrive className="h-8 w-8 text-purple-600/20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tenants..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <select
            className="px-3 py-1.5 text-xs border rounded-lg"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="trial">Trial</option>
            <option value="suspended">Suspended</option>
          </select>
          <select
            className="px-3 py-1.5 text-xs border rounded-lg"
            value={filterPlan}
            onChange={(e) => setFilterPlan(e.target.value)}
          >
            <option value="all">All Plans</option>
            <option value="Enterprise">Enterprise</option>
            <option value="Professional">Professional</option>
            <option value="Starter">Starter</option>
          </select>
        </div>
      </div>

      {/* Tenants List */}
      <div className="space-y-4">
        {filteredTenants.map((tenant) => (
          <Card key={tenant.id} className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                {/* Tenant Info */}
                <div className="flex-1 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-base">{tenant.name}</h3>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-muted-foreground">{tenant.domain}</span>
                          {tenant.customDomain && (
                            <>
                              <span className="text-xs text-muted-foreground">•</span>
                              <span className="text-xs text-primary flex items-center gap-1">
                                <Globe className="h-3 w-3" />
                                {tenant.customDomain}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <button className="lg:hidden text-gray-400 hover:text-gray-600">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Contact & Location */}
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {tenant.contact.name}
                    </div>
                    <div className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {tenant.contact.email}
                    </div>
                    <div className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {tenant.contact.phone}
                    </div>
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {tenant.address.city}, {tenant.address.country}
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <p className="text-2xs text-muted-foreground">Users</p>
                      <p className="text-sm font-medium">
                        {tenant.usedSeats} / {tenant.seats}
                      </p>
                      <div className="h-1 bg-gray-200 rounded-full mt-1 overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${(tenant.usedSeats / tenant.seats) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-2xs text-muted-foreground">Storage</p>
                      <p className="text-sm font-medium">
                        {tenant.storage.used} / {tenant.storage.total} {tenant.storage.unit}
                      </p>
                      <div className="h-1 bg-gray-200 rounded-full mt-1 overflow-hidden">
                        <div
                          className="h-full bg-blue-500"
                          style={{ width: `${(tenant.storage.used / tenant.storage.total) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-2xs text-muted-foreground">Monthly</p>
                      <p className="text-sm font-medium">
                        ${tenant.monthlyRevenue.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-2xs text-muted-foreground">Last Active</p>
                      <p className="text-sm font-medium flex items-center gap-1">
                        <Activity className="h-3 w-3" />
                        {tenant.lastActive}
                      </p>
                    </div>
                  </div>

                  {/* Modules */}
                  <div className="flex flex-wrap gap-1">
                    {tenant.modules.map((module, idx) => (
                      <span key={idx} className="text-2xs px-2 py-1 bg-muted rounded">
                        {module}
                      </span>
                    ))}
                  </div>

                  {/* Special Status Messages */}
                  {tenant.status === 'trial' && tenant.trialEndsIn && (
                    <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded-lg">
                      <Clock className="h-3.5 w-3.5" />
                      Trial ends in {tenant.trialEndsIn} days
                    </div>
                  )}
                  {tenant.status === 'suspended' && tenant.suspendedReason && (
                    <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {tenant.suspendedReason}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(tenant.status)}
                    <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(tenant.status)}`}>
                      {tenant.status}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded-full ${getPlanColor(tenant.plan)}`}>
                      {tenant.plan}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" variant="outline">
                      <Settings className="h-3 w-3 mr-1" />
                      Manage
                    </Button>
                    {tenant.status === 'suspended' ? (
                      <Button size="sm" variant="default">
                        <Unlock className="h-3 w-3 mr-1" />
                        Reactivate
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost">
                        <Lock className="h-3 w-3 mr-1" />
                        Suspend
                      </Button>
                    )}
                  </div>

                  <button className="hidden lg:block text-gray-400 hover:text-gray-600">
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
