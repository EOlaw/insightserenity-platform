'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Users,
  Building2,
  DollarSign,
  Server,
  Database,
  Activity,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  HardDrive,
  Cpu,
  Globe,
  Shield,
  Package,
  Settings,
  ArrowRight,
  BarChart3,
  Lock,
  Mail,
  CreditCard,
  RefreshCw,
  Download,
} from 'lucide-react'

const systemMetrics = [
  {
    name: 'Total Users',
    value: '12,847',
    change: '+423',
    trend: 'up',
    icon: Users,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  {
    name: 'Organizations',
    value: '1,294',
    change: '+67',
    trend: 'up',
    icon: Building2,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
  {
    name: 'Monthly Revenue',
    value: '$892,451',
    change: '+15.3%',
    trend: 'up',
    icon: DollarSign,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  {
    name: 'System Health',
    value: '99.9%',
    change: '-0.1%',
    trend: 'down',
    icon: Activity,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
  },
]

const serverStatus = [
  { name: 'API Gateway', status: 'operational', load: 45 },
  { name: 'Admin Server', status: 'operational', load: 32 },
  { name: 'Customer Services', status: 'operational', load: 68 },
  { name: 'Database Cluster', status: 'operational', load: 52 },
  { name: 'Cache Layer', status: 'operational', load: 28 },
  { name: 'Queue Service', status: 'maintenance', load: 0 },
]

const recentAlerts = [
  {
    id: 1,
    level: 'warning',
    message: 'High memory usage on Server 3',
    time: '5 minutes ago',
  },
  {
    id: 2,
    level: 'info',
    message: 'Scheduled maintenance window approaching',
    time: '2 hours ago',
  },
  {
    id: 3,
    level: 'error',
    message: 'Failed login attempts from IP 192.168.1.1',
    time: '3 hours ago',
  },
  {
    id: 4,
    level: 'success',
    message: 'Backup completed successfully',
    time: '6 hours ago',
  },
]

export default function AdminDashboard() {
  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Administration</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Monitor and manage the entire platform infrastructure
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" size="sm">
            <Shield className="h-3.5 w-3.5 mr-2" />
            Security Scan
          </Button>
          <Button size="sm" variant="destructive">
            <Server className="h-3.5 w-3.5 mr-2" />
            Emergency Shutdown
          </Button>
        </div>
      </div>

      {/* System Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {systemMetrics.map((metric) => (
          <Card key={metric.name}>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{metric.name}</p>
                  <p className="text-xl sm:text-2xl font-bold">{metric.value}</p>
                  <div className="flex items-center space-x-1">
                    {metric.trend === 'up' ? (
                      <TrendingUp className="h-3 w-3 text-green-600" />
                    ) : (
                      <TrendingDown className="h-3 w-3 text-red-600" />
                    )}
                    <span
                      className={cn(
                        'text-xs font-medium',
                        metric.trend === 'up' ? 'text-green-600' : 'text-red-600'
                      )}
                    >
                      {metric.change}
                    </span>
                  </div>
                </div>
                <div className={cn('p-3 rounded-lg', metric.bgColor)}>
                  <metric.icon className={cn('h-5 w-5', metric.color)} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Infrastructure Status */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Server Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Infrastructure Status</CardTitle>
            <CardDescription className="text-xs">
              Real-time server and service health monitoring
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {serverStatus.map((server) => (
                <div key={server.name} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50">
                  <div className="flex items-center space-x-3">
                    <div className={cn(
                      'w-2 h-2 rounded-full',
                      server.status === 'operational' ? 'bg-green-500' : '',
                      server.status === 'maintenance' ? 'bg-yellow-500' : '',
                      server.status === 'error' ? 'bg-red-500' : ''
                    )} />
                    <span className="text-xs font-medium">{server.name}</span>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="w-24">
                      <div className="flex items-center justify-between text-2xs mb-1">
                        <span className="text-muted-foreground">Load</span>
                        <span className="font-medium">{server.load}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1">
                        <div
                          className={cn(
                            'rounded-full h-1 transition-all',
                            server.load < 60 ? 'bg-green-500' : '',
                            server.load >= 60 && server.load < 80 ? 'bg-yellow-500' : '',
                            server.load >= 80 ? 'bg-red-500' : ''
                          )}
                          style={{ width: `${server.load}%` }}
                        />
                      </div>
                    </div>
                    <span className={cn(
                      'text-2xs px-2 py-0.5 rounded-full',
                      server.status === 'operational' ? 'bg-green-100 text-green-700' : '',
                      server.status === 'maintenance' ? 'bg-yellow-100 text-yellow-700' : '',
                      server.status === 'error' ? 'bg-red-100 text-red-700' : ''
                    )}>
                      {server.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Resource Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resource Usage</CardTitle>
            <CardDescription className="text-xs">
              System resource consumption metrics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Cpu className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-medium">CPU Usage</span>
                  </div>
                  <span className="text-xs font-bold">42%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-blue-600 rounded-full h-2" style={{ width: '42%' }} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <HardDrive className="h-4 w-4 text-purple-600" />
                    <span className="text-xs font-medium">Memory</span>
                  </div>
                  <span className="text-xs font-bold">8.2 GB / 16 GB</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-purple-600 rounded-full h-2" style={{ width: '51%' }} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Database className="h-4 w-4 text-green-600" />
                    <span className="text-xs font-medium">Storage</span>
                  </div>
                  <span className="text-xs font-bold">482 GB / 1 TB</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-green-600 rounded-full h-2" style={{ width: '48%' }} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Globe className="h-4 w-4 text-orange-600" />
                    <span className="text-xs font-medium">Bandwidth</span>
                  </div>
                  <span className="text-xs font-bold">2.4 TB / 5 TB</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-orange-600 rounded-full h-2" style={{ width: '48%' }} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">System Alerts</CardTitle>
          <CardDescription className="text-xs">
            Recent system events and notifications
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentAlerts.map((alert) => (
              <div key={alert.id} className="flex items-start space-x-3 p-3 rounded-lg hover:bg-muted/50">
                {alert.level === 'error' && <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5" />}
                {alert.level === 'warning' && <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />}
                {alert.level === 'info' && <Activity className="h-4 w-4 text-blue-600 mt-0.5" />}
                {alert.level === 'success' && <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />}
                <div className="flex-1">
                  <p className="text-xs font-medium">{alert.message}</p>
                  <p className="text-2xs text-muted-foreground">{alert.time}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Management Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link href="/admin/servers">
          <Card className="hover:shadow-lg transition-all cursor-pointer group">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Server className="h-5 w-5 text-blue-600" />
                </div>
                <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-primary transition-colors" />
              </div>
              <CardTitle className="text-base mt-3">Server Management</CardTitle>
              <CardDescription className="text-xs">
                Monitor and manage all platform servers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xl font-bold">6</p>
                  <p className="text-2xs text-muted-foreground">Running</p>
                </div>
                <div>
                  <p className="text-xl font-bold">1</p>
                  <p className="text-2xs text-muted-foreground">Stopped</p>
                </div>
                <div>
                  <p className="text-xl font-bold">1</p>
                  <p className="text-2xs text-muted-foreground">Maintenance</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/modules">
          <Card className="hover:shadow-lg transition-all cursor-pointer group">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Package className="h-5 w-5 text-purple-600" />
                </div>
                <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-primary transition-colors" />
              </div>
              <CardTitle className="text-base mt-3">Module Management</CardTitle>
              <CardDescription className="text-xs">
                Configure platform modules and features
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xl font-bold">9</p>
                  <p className="text-2xs text-muted-foreground">Total</p>
                </div>
                <div>
                  <p className="text-xl font-bold">7</p>
                  <p className="text-2xs text-muted-foreground">Active</p>
                </div>
                <div>
                  <p className="text-xl font-bold">2</p>
                  <p className="text-2xs text-muted-foreground">Updates</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/tenants">
          <Card className="hover:shadow-lg transition-all cursor-pointer group">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Building2 className="h-5 w-5 text-green-600" />
                </div>
                <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-primary transition-colors" />
              </div>
              <CardTitle className="text-base mt-3">Tenant Management</CardTitle>
              <CardDescription className="text-xs">
                Manage customer organizations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xl font-bold">1,294</p>
                  <p className="text-2xs text-muted-foreground">Tenants</p>
                </div>
                <div>
                  <p className="text-xl font-bold">12.8k</p>
                  <p className="text-2xs text-muted-foreground">Users</p>
                </div>
                <div>
                  <p className="text-xl font-bold">$892k</p>
                  <p className="text-2xs text-muted-foreground">MRR</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/security">
          <Card className="hover:shadow-lg transition-all cursor-pointer group">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="p-2 bg-red-100 rounded-lg">
                  <Shield className="h-5 w-5 text-red-600" />
                </div>
                <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-primary transition-colors" />
              </div>
              <CardTitle className="text-base mt-3">Security Center</CardTitle>
              <CardDescription className="text-xs">
                Security settings and audit logs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div>
                  <p className="text-xl font-bold">99.9%</p>
                  <p className="text-2xs text-muted-foreground">Secure</p>
                </div>
                <div>
                  <p className="text-xl font-bold">0</p>
                  <p className="text-2xs text-muted-foreground">Threats</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/billing">
          <Card className="hover:shadow-lg transition-all cursor-pointer group">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <CreditCard className="h-5 w-5 text-yellow-600" />
                </div>
                <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-primary transition-colors" />
              </div>
              <CardTitle className="text-base mt-3">Billing & Revenue</CardTitle>
              <CardDescription className="text-xs">
                Manage subscriptions and payments
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div>
                  <p className="text-xl font-bold">$892k</p>
                  <p className="text-2xs text-muted-foreground">Monthly</p>
                </div>
                <div>
                  <p className="text-xl font-bold">+15%</p>
                  <p className="text-2xs text-muted-foreground">Growth</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/analytics">
          <Card className="hover:shadow-lg transition-all cursor-pointer group">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <BarChart3 className="h-5 w-5 text-orange-600" />
                </div>
                <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-primary transition-colors" />
              </div>
              <CardTitle className="text-base mt-3">Analytics & Reports</CardTitle>
              <CardDescription className="text-xs">
                Platform analytics and insights
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div>
                  <p className="text-xl font-bold">2.4M</p>
                  <p className="text-2xs text-muted-foreground">Events</p>
                </div>
                <div>
                  <p className="text-xl font-bold">156</p>
                  <p className="text-2xs text-muted-foreground">Reports</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Quick Actions Bar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline">
              <RefreshCw className="h-3.5 w-3.5 mr-2" />
              Restart All Services
            </Button>
            <Button size="sm" variant="outline">
              <Database className="h-3.5 w-3.5 mr-2" />
              Backup Database
            </Button>
            <Button size="sm" variant="outline">
              <Download className="h-3.5 w-3.5 mr-2" />
              Export Logs
            </Button>
            <Button size="sm" variant="outline">
              <Mail className="h-3.5 w-3.5 mr-2" />
              Send System Alert
            </Button>
            <Button size="sm" variant="outline">
              <Lock className="h-3.5 w-3.5 mr-2" />
              Security Scan
            </Button>
            <Button size="sm" variant="outline">
              <Settings className="h-3.5 w-3.5 mr-2" />
              System Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}
