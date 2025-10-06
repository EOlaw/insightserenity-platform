'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  Users,
  Building2,
  Shield,
  CreditCard,
  Activity,
  HeadphonesIcon,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Bell,
  Search,
  Database,
  Server,
  Lock,
  FileText,
  AlertTriangle,
} from 'lucide-react'

const adminNavigation = [
  {
    name: 'Dashboard',
    href: '/admin',
    icon: LayoutDashboard,
  },
  {
    name: 'Server Management',
    href: '/admin/servers',
    icon: Server,
  },
  {
    name: 'Module Management',
    href: '/admin/modules',
    icon: Database,
  },
  {
    name: 'Tenant Management',
    href: '/admin/tenants',
    icon: Building2,
  },
  {
    name: 'Platform Management',
    href: '/admin/platform-management',
    icon: Server,
    children: [
      { name: 'System Overview', href: '/admin/platform-management' },
      { name: 'Configuration', href: '/admin/platform-management/configuration' },
      { name: 'Maintenance', href: '/admin/platform-management/maintenance' },
    ],
  },
  {
    name: 'User Management',
    href: '/admin/user-management',
    icon: Users,
    children: [
      { name: 'All Users', href: '/admin/user-management' },
      { name: 'Roles & Permissions', href: '/admin/user-management/roles' },
      { name: 'Sessions', href: '/admin/user-management/sessions' },
    ],
  },
  {
    name: 'Organizations',
    href: '/admin/organization-management',
    icon: Building2,
    children: [
      { name: 'All Organizations', href: '/admin/organization-management' },
      { name: 'Tenants', href: '/admin/organization-management/tenants' },
      { name: 'Subscriptions', href: '/admin/organization-management/subscriptions' },
    ],
  },
  {
    name: 'Security',
    href: '/admin/security-administration',
    icon: Shield,
    children: [
      { name: 'Dashboard', href: '/admin/security-administration' },
      { name: 'Access Control', href: '/admin/security-administration/access-control' },
      { name: 'Audit Logs', href: '/admin/security-administration/audit-logs' },
      { name: 'Compliance', href: '/admin/security-administration/compliance' },
    ],
  },
  {
    name: 'Billing',
    href: '/admin/billing-administration',
    icon: CreditCard,
    children: [
      { name: 'Overview', href: '/admin/billing-administration' },
      { name: 'Revenue', href: '/admin/billing-administration/revenue' },
      { name: 'Invoices', href: '/admin/billing-administration/invoices' },
    ],
  },
  {
    name: 'Monitoring',
    href: '/admin/system-monitoring',
    icon: Activity,
    children: [
      { name: 'Health Dashboard', href: '/admin/system-monitoring' },
      { name: 'Performance', href: '/admin/system-monitoring/performance' },
      { name: 'Alerts', href: '/admin/system-monitoring/alerts' },
    ],
  },
  {
    name: 'Support',
    href: '/admin/support-administration',
    icon: HeadphonesIcon,
    children: [
      { name: 'Tickets', href: '/admin/support-administration/tickets' },
      { name: 'Knowledge Base', href: '/admin/support-administration/knowledge-base' },
    ],
  },
  {
    name: 'Reports',
    href: '/admin/reports-analytics',
    icon: BarChart3,
    children: [
      { name: 'Executive', href: '/admin/reports-analytics/executive' },
      { name: 'Operational', href: '/admin/reports-analytics/operational' },
    ],
  },
]

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [expandedItems, setExpandedItems] = useState<string[]>([])

  const toggleExpanded = (name: string) => {
    setExpandedItems(prev =>
      prev.includes(name)
        ? prev.filter(item => item !== name)
        : [...prev, name]
    )
  }

  const isActive = (href: string) => {
    if (href === '/admin') {
      return pathname === '/admin'
    }
    return pathname.startsWith(href)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r transform transition-transform lg:relative lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Admin Header */}
          <div className="flex h-16 items-center justify-between px-6 border-b bg-black text-white">
            <Link href="/admin" className="flex items-center space-x-2">
              <Shield className="h-5 w-5 text-primary" />
              <span className="text-lg font-bold">Admin Panel</span>
            </Link>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-white/60 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Admin Info */}
          <div className="px-4 py-3 border-b bg-red-50">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <p className="text-xs text-red-700 font-medium">Super Admin Mode</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-4 py-4">
            <ul className="space-y-1">
              {adminNavigation.map((item) => (
                <li key={item.name}>
                  <button
                    onClick={() => item.children && toggleExpanded(item.name)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                      isActive(item.href)
                        ? "bg-primary text-black"
                        : "text-gray-700 hover:bg-gray-100"
                    )}
                  >
                    <Link href={item.href} className="flex items-center space-x-3 flex-1">
                      <item.icon className="h-4 w-4" />
                      <span>{item.name}</span>
                    </Link>
                    {item.children && (
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 transition-transform",
                          expandedItems.includes(item.name) && "rotate-180"
                        )}
                      />
                    )}
                  </button>
                  {item.children && expandedItems.includes(item.name) && (
                    <ul className="mt-1 ml-7 space-y-1">
                      {item.children.map((child) => (
                        <li key={child.name}>
                          <Link
                            href={child.href}
                            className={cn(
                              "block px-3 py-1.5 rounded-md text-2xs transition-colors",
                              isActive(child.href)
                                ? "bg-gray-200 text-gray-900"
                                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                            )}
                          >
                            {child.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          {/* Admin User */}
          <div className="border-t px-4 py-4">
            <div className="flex items-center space-x-3 px-3">
              <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                <span className="text-2xs font-medium text-red-700">SA</span>
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium">System Admin</p>
                <p className="text-2xs text-gray-500">admin@system.com</p>
              </div>
              <button className="text-gray-400 hover:text-gray-600">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b h-16 flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-gray-500 hover:text-gray-700"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* System Status */}
            <div className="hidden sm:flex items-center space-x-2">
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs text-gray-600">All Systems Operational</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Quick Actions */}
            <Button variant="outline" size="sm">
              <Database className="h-3.5 w-3.5 mr-2" />
              Backup
            </Button>

            <button className="p-2 text-gray-500 hover:text-gray-700 relative">
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-red-500 rounded-full" />
            </button>

            <Link href="/dashboard">
              <Button variant="ghost" size="sm">
                Exit Admin
              </Button>
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  )
}
