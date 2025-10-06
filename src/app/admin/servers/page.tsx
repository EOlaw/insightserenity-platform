'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Server,
  Activity,
  HardDrive,
  Cpu,
  Wifi,
  WifiOff,
  Power,
  RefreshCw,
  Terminal,
  Settings,
  AlertTriangle,
  CheckCircle,
  XCircle,
  MoreVertical,
  Search,
  Filter,
  Plus,
  Database,
  Globe,
  Shield,
  Clock,
} from 'lucide-react'

const serverList = [
  {
    id: 1,
    name: 'API Gateway',
    type: 'Gateway',
    status: 'running',
    health: 'healthy',
    ip: '10.0.1.10',
    region: 'us-east-1',
    cpu: 45,
    memory: 62,
    disk: 38,
    uptime: '15d 7h 23m',
    lastDeployed: '2024-01-10',
    version: 'v3.2.1',
  },
  {
    id: 2,
    name: 'Admin Server',
    type: 'Application',
    status: 'running',
    health: 'healthy',
    ip: '10.0.1.11',
    region: 'us-east-1',
    cpu: 32,
    memory: 48,
    disk: 42,
    uptime: '30d 2h 15m',
    lastDeployed: '2023-12-28',
    version: 'v2.8.4',
  },
  {
    id: 3,
    name: 'Customer Services',
    type: 'Application',
    status: 'running',
    health: 'warning',
    ip: '10.0.1.12',
    region: 'us-east-1',
    cpu: 78,
    memory: 85,
    disk: 55,
    uptime: '7d 14h 45m',
    lastDeployed: '2024-01-18',
    version: 'v4.1.0',
  },
  {
    id: 4,
    name: 'Database Primary',
    type: 'Database',
    status: 'running',
    health: 'healthy',
    ip: '10.0.2.10',
    region: 'us-east-1',
    cpu: 52,
    memory: 73,
    disk: 68,
    uptime: '45d 0h 0m',
    lastDeployed: '2023-12-01',
    version: 'PostgreSQL 15.2',
  },
  {
    id: 5,
    name: 'Redis Cache',
    type: 'Cache',
    status: 'running',
    health: 'healthy',
    ip: '10.0.2.20',
    region: 'us-east-1',
    cpu: 15,
    memory: 42,
    disk: 12,
    uptime: '60d 12h 30m',
    lastDeployed: '2023-11-15',
    version: 'Redis 7.0',
  },
  {
    id: 6,
    name: 'Load Balancer',
    type: 'Network',
    status: 'running',
    health: 'healthy',
    ip: '10.0.0.5',
    region: 'global',
    cpu: 25,
    memory: 35,
    disk: 8,
    uptime: '90d 0h 0m',
    lastDeployed: '2023-10-01',
    version: 'nginx/1.24',
  },
  {
    id: 7,
    name: 'Backup Server',
    type: 'Storage',
    status: 'stopped',
    health: 'offline',
    ip: '10.0.3.10',
    region: 'us-west-2',
    cpu: 0,
    memory: 0,
    disk: 92,
    uptime: '0d 0h 0m',
    lastDeployed: '2024-01-01',
    version: 'v1.5.2',
  },
  {
    id: 8,
    name: 'Analytics Engine',
    type: 'Application',
    status: 'maintenance',
    health: 'maintenance',
    ip: '10.0.1.15',
    region: 'eu-central-1',
    cpu: 0,
    memory: 0,
    disk: 45,
    uptime: '0d 0h 0m',
    lastDeployed: '2024-01-20',
    version: 'v3.0.0-beta',
  },
]

export default function ServersPage() {
  const [servers, setServers] = useState(serverList)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [selectedServer, setSelectedServer] = useState<number | null>(null)

  const filteredServers = servers.filter(server => {
    const matchesSearch = server.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          server.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          server.ip.includes(searchTerm)
    const matchesStatus = filterStatus === 'all' || server.status === filterStatus
    return matchesSearch && matchesStatus
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-green-600'
      case 'stopped': return 'text-red-600'
      case 'maintenance': return 'text-orange-600'
      default: return 'text-gray-600'
    }
  }

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'running': return 'bg-green-100'
      case 'stopped': return 'bg-red-100'
      case 'maintenance': return 'bg-orange-100'
      default: return 'bg-gray-100'
    }
  }

  const getHealthIcon = (health: string) => {
    switch (health) {
      case 'healthy': return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'warning': return <AlertTriangle className="h-4 w-4 text-orange-600" />
      case 'offline': return <XCircle className="h-4 w-4 text-red-600" />
      case 'maintenance': return <Settings className="h-4 w-4 text-gray-600" />
      default: return null
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'Gateway': return <Globe className="h-4 w-4" />
      case 'Application': return <Server className="h-4 w-4" />
      case 'Database': return <Database className="h-4 w-4" />
      case 'Cache': return <HardDrive className="h-4 w-4" />
      case 'Network': return <Wifi className="h-4 w-4" />
      case 'Storage': return <HardDrive className="h-4 w-4" />
      default: return <Server className="h-4 w-4" />
    }
  }

  const getUsageColor = (value: number) => {
    if (value < 50) return 'bg-green-500'
    if (value < 75) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const handleServerAction = (serverId: number, action: string) => {
    console.log(`Performing ${action} on server ${serverId}`)
    // Implement server actions here
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Server Management</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Monitor and manage all platform servers and infrastructure
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline">
            <RefreshCw className="h-3.5 w-3.5 mr-2" />
            Refresh
          </Button>
          <Button size="sm">
            <Plus className="h-3.5 w-3.5 mr-2" />
            Add Server
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Servers</p>
                <p className="text-2xl font-bold">{servers.length}</p>
              </div>
              <Server className="h-8 w-8 text-primary/20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Running</p>
                <p className="text-2xl font-bold text-green-600">
                  {servers.filter(s => s.status === 'running').length}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600/20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Stopped</p>
                <p className="text-2xl font-bold text-red-600">
                  {servers.filter(s => s.status === 'stopped').length}
                </p>
              </div>
              <XCircle className="h-8 w-8 text-red-600/20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Maintenance</p>
                <p className="text-2xl font-bold text-orange-600">
                  {servers.filter(s => s.status === 'maintenance').length}
                </p>
              </div>
              <Settings className="h-8 w-8 text-orange-600/20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search servers by name, type, or IP..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={filterStatus === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus('all')}
          >
            All
          </Button>
          <Button
            variant={filterStatus === 'running' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus('running')}
          >
            Running
          </Button>
          <Button
            variant={filterStatus === 'stopped' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus('stopped')}
          >
            Stopped
          </Button>
          <Button
            variant={filterStatus === 'maintenance' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus('maintenance')}
          >
            Maintenance
          </Button>
        </div>
      </div>

      {/* Server Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredServers.map((server) => (
          <Card key={server.id} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {getTypeIcon(server.type)}
                    <CardTitle className="text-base">{server.name}</CardTitle>
                  </div>
                  <CardDescription className="text-xs">
                    {server.type} • {server.ip} • {server.region}
                  </CardDescription>
                </div>
                <button
                  className="text-gray-400 hover:text-gray-600"
                  onClick={() => setSelectedServer(server.id)}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getHealthIcon(server.health)}
                  <span className="text-xs capitalize">{server.health}</span>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${getStatusBg(server.status)} ${getStatusColor(server.status)}`}>
                  {server.status}
                </span>
              </div>

              {/* Resource Usage */}
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-3 w-3 text-muted-foreground" />
                      <span className="text-2xs text-muted-foreground">CPU</span>
                    </div>
                    <span className="text-2xs font-medium">{server.cpu}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getUsageColor(server.cpu)}`}
                      style={{ width: `${server.cpu}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Activity className="h-3 w-3 text-muted-foreground" />
                      <span className="text-2xs text-muted-foreground">Memory</span>
                    </div>
                    <span className="text-2xs font-medium">{server.memory}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getUsageColor(server.memory)}`}
                      style={{ width: `${server.memory}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <HardDrive className="h-3 w-3 text-muted-foreground" />
                      <span className="text-2xs text-muted-foreground">Disk</span>
                    </div>
                    <span className="text-2xs font-medium">{server.disk}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getUsageColor(server.disk)}`}
                      style={{ width: `${server.disk}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Info */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                <div>
                  <p className="text-2xs text-muted-foreground">Uptime</p>
                  <p className="text-xs font-medium flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {server.uptime}
                  </p>
                </div>
                <div>
                  <p className="text-2xs text-muted-foreground">Version</p>
                  <p className="text-xs font-medium">{server.version}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                {server.status === 'running' ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleServerAction(server.id, 'restart')}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Restart
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleServerAction(server.id, 'stop')}
                    >
                      <Power className="h-3 w-3 mr-1" />
                      Stop
                    </Button>
                  </>
                ) : server.status === 'stopped' ? (
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => handleServerAction(server.id, 'start')}
                  >
                    <Power className="h-3 w-3 mr-1" />
                    Start
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    disabled
                  >
                    <Settings className="h-3 w-3 mr-1" />
                    In Maintenance
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleServerAction(server.id, 'terminal')}
                >
                  <Terminal className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
