'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Package,
  Settings,
  ToggleLeft,
  ToggleRight,
  Download,
  Upload,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Info,
  Search,
  Filter,
  MoreVertical,
  Code,
  Database,
  Shield,
  Mail,
  CreditCard,
  Users,
  BarChart3,
  Briefcase,
  UserCheck,
  Building2,
  Globe,
  Lock,
  Unlock,
  Clock,
  ArrowUpRight,
} from 'lucide-react'

const modulesList = [
  {
    id: 1,
    name: 'Core Business',
    description: 'Client, project, and consultant management',
    category: 'Business',
    status: 'active',
    version: '4.2.0',
    lastUpdated: '2024-01-20',
    dependencies: ['Authentication', 'Database'],
    icon: Briefcase,
    features: ['Client Management', 'Project Tracking', 'Consultant Portal', 'Engagement Analytics'],
    usage: 892,
    health: 'healthy',
  },
  {
    id: 2,
    name: 'Recruitment Services',
    description: 'Job posting and candidate management system',
    category: 'Business',
    status: 'active',
    version: '3.8.1',
    lastUpdated: '2024-01-18',
    dependencies: ['Authentication', 'Email Service'],
    icon: UserCheck,
    features: ['Job Board', 'Applicant Tracking', 'Interview Scheduling', 'Partnership Management'],
    usage: 567,
    health: 'healthy',
  },
  {
    id: 3,
    name: 'Authentication',
    description: 'User authentication and authorization system',
    category: 'Security',
    status: 'active',
    version: '5.0.0',
    lastUpdated: '2024-01-15',
    dependencies: ['Database', 'Cache'],
    icon: Shield,
    features: ['SSO', 'MFA', 'JWT Tokens', 'Session Management', 'OAuth 2.0'],
    usage: 1294,
    health: 'healthy',
  },
  {
    id: 4,
    name: 'Email Service',
    description: 'Email sending and template management',
    category: 'Communication',
    status: 'active',
    version: '2.5.3',
    lastUpdated: '2024-01-10',
    dependencies: [],
    icon: Mail,
    features: ['SMTP Integration', 'Template Engine', 'Queue Management', 'Tracking'],
    usage: 1150,
    health: 'warning',
  },
  {
    id: 5,
    name: 'Billing & Payments',
    description: 'Subscription and payment processing',
    category: 'Finance',
    status: 'active',
    version: '3.1.0',
    lastUpdated: '2024-01-08',
    dependencies: ['Authentication', 'Database'],
    icon: CreditCard,
    features: ['Stripe Integration', 'Invoice Generation', 'Subscription Management', 'Tax Calculation'],
    usage: 423,
    health: 'healthy',
  },
  {
    id: 6,
    name: 'Analytics Engine',
    description: 'Business intelligence and reporting',
    category: 'Analytics',
    status: 'maintenance',
    version: '2.0.0-beta',
    lastUpdated: '2024-01-22',
    dependencies: ['Database', 'Cache'],
    icon: BarChart3,
    features: ['Real-time Dashboards', 'Custom Reports', 'Data Export', 'Predictive Analytics'],
    usage: 312,
    health: 'maintenance',
  },
  {
    id: 7,
    name: 'Tenant Management',
    description: 'Multi-tenant infrastructure management',
    category: 'Infrastructure',
    status: 'active',
    version: '4.0.2',
    lastUpdated: '2024-01-12',
    dependencies: ['Database', 'Authentication'],
    icon: Building2,
    features: ['Tenant Isolation', 'Resource Allocation', 'Custom Domains', 'Backup Management'],
    usage: 1294,
    health: 'healthy',
  },
  {
    id: 8,
    name: 'API Gateway',
    description: 'API routing and rate limiting',
    category: 'Infrastructure',
    status: 'active',
    version: '3.2.1',
    lastUpdated: '2024-01-05',
    dependencies: ['Cache', 'Authentication'],
    icon: Globe,
    features: ['Rate Limiting', 'API Versioning', 'Request Routing', 'Circuit Breaker'],
    usage: 1294,
    health: 'healthy',
  },
  {
    id: 9,
    name: 'Audit & Compliance',
    description: 'System audit trails and compliance reporting',
    category: 'Security',
    status: 'inactive',
    version: '1.8.0',
    lastUpdated: '2023-12-20',
    dependencies: ['Database', 'Authentication'],
    icon: Lock,
    features: ['Audit Logs', 'GDPR Compliance', 'HIPAA Reports', 'Access Control'],
    usage: 0,
    health: 'inactive',
  },
]

export default function ModulesPage() {
  const [modules, setModules] = useState(modulesList)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [selectedModule, setSelectedModule] = useState<number | null>(null)

  const categories = ['all', 'Business', 'Security', 'Communication', 'Finance', 'Analytics', 'Infrastructure']

  const filteredModules = modules.filter(module => {
    const matchesSearch = module.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          module.description.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = filterCategory === 'all' || module.category === filterCategory
    return matchesSearch && matchesCategory
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-100'
      case 'inactive': return 'text-gray-600 bg-gray-100'
      case 'maintenance': return 'text-orange-600 bg-orange-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getHealthIcon = (health: string) => {
    switch (health) {
      case 'healthy': return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'warning': return <AlertTriangle className="h-4 w-4 text-orange-600" />
      case 'maintenance': return <Settings className="h-4 w-4 text-gray-600" />
      case 'inactive': return <Info className="h-4 w-4 text-gray-400" />
      default: return null
    }
  }

  const toggleModuleStatus = (moduleId: number) => {
    setModules(prev => prev.map(module => {
      if (module.id === moduleId) {
        return {
          ...module,
          status: module.status === 'active' ? 'inactive' : 'active',
          health: module.status === 'active' ? 'inactive' : 'healthy',
        }
      }
      return module
    }))
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Module Management</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Configure and manage platform modules and features
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline">
            <Upload className="h-3.5 w-3.5 mr-2" />
            Install Module
          </Button>
          <Button size="sm">
            <RefreshCw className="h-3.5 w-3.5 mr-2" />
            Check Updates
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Modules</p>
                <p className="text-2xl font-bold">{modules.length}</p>
              </div>
              <Package className="h-8 w-8 text-primary/20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Active</p>
                <p className="text-2xl font-bold text-green-600">
                  {modules.filter(m => m.status === 'active').length}
                </p>
              </div>
              <ToggleRight className="h-8 w-8 text-green-600/20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Maintenance</p>
                <p className="text-2xl font-bold text-orange-600">
                  {modules.filter(m => m.status === 'maintenance').length}
                </p>
              </div>
              <Settings className="h-8 w-8 text-orange-600/20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Usage</p>
                <p className="text-2xl font-bold">
                  {modules.reduce((acc, m) => acc + m.usage, 0).toLocaleString()}
                </p>
              </div>
              <Users className="h-8 w-8 text-blue-600/20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search modules..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {categories.map(category => (
            <Button
              key={category}
              variant={filterCategory === category ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterCategory(category)}
            >
              {category}
            </Button>
          ))}
        </div>
      </div>

      {/* Modules Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredModules.map((module) => {
          const Icon = module.icon
          return (
            <Card key={module.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{module.name}</CardTitle>
                      <CardDescription className="text-xs mt-1">
                        {module.description}
                      </CardDescription>
                    </div>
                  </div>
                  <button className="text-gray-400 hover:text-gray-600">
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Status and Health */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getHealthIcon(module.health)}
                    <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(module.status)}`}>
                      {module.status}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleModuleStatus(module.id)}
                    disabled={module.status === 'maintenance'}
                  >
                    {module.status === 'active' ? (
                      <ToggleRight className="h-4 w-4 text-green-600" />
                    ) : (
                      <ToggleLeft className="h-4 w-4 text-gray-400" />
                    )}
                  </Button>
                </div>

                {/* Module Info */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Version</span>
                    <span className="font-medium">{module.version}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Category</span>
                    <span className="font-medium">{module.category}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Active Users</span>
                    <span className="font-medium">{module.usage.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Last Updated</span>
                    <span className="font-medium flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {module.lastUpdated}
                    </span>
                  </div>
                </div>

                {/* Features */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Features</p>
                  <div className="flex flex-wrap gap-1">
                    {module.features.slice(0, 3).map((feature, idx) => (
                      <span key={idx} className="text-2xs px-2 py-1 bg-muted rounded-full">
                        {feature}
                      </span>
                    ))}
                    {module.features.length > 3 && (
                      <span className="text-2xs px-2 py-1 bg-muted rounded-full">
                        +{module.features.length - 3} more
                      </span>
                    )}
                  </div>
                </div>

                {/* Dependencies */}
                {module.dependencies.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Dependencies</p>
                    <div className="flex flex-wrap gap-1">
                      {module.dependencies.map((dep, idx) => (
                        <span key={idx} className="text-2xs px-2 py-1 border rounded">
                          {dep}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t">
                  <Button size="sm" variant="outline" className="flex-1">
                    <Settings className="h-3 w-3 mr-1" />
                    Configure
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1">
                    <ArrowUpRight className="h-3 w-3 mr-1" />
                    View Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
