'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  BookOpen,
  Search,
  ChevronRight,
  ChevronDown,
  Rocket,
  Code,
  Settings,
  Shield,
  Database,
  Globe,
  Users,
  Building2,
  CreditCard,
  BarChart3,
  Terminal,
  Package,
  GitBranch,
  FileText,
  Video,
  Download,
  ExternalLink,
  Clock,
  Star,
  ArrowRight,
  Zap,
  Key,
  Lock,
  Server,
  Cloud,
  Layers,
  Network,
  HardDrive,
  Cpu,
  Activity,
  AlertCircle,
  CheckCircle,
  Info,
  HelpCircle,
  MessageSquare,
  Mail,
  Copy,
  Check,
  Book,
  GraduationCap,
  PlayCircle,
  FileCode,
  Workflow,
  Bot,
  Eye
} from 'lucide-react'

const documentationSections = [
  {
    title: 'Getting Started',
    icon: Rocket,
    description: 'Quick start guides and tutorials',
    items: [
      { title: 'Quick Start Guide', link: '/docs/quickstart', time: '5 min' },
      { title: 'Installation', link: '/docs/installation', time: '10 min' },
      { title: 'Your First Project', link: '/docs/first-project', time: '15 min' },
      { title: 'Basic Concepts', link: '/docs/concepts', time: '20 min' },
    ],
  },
  {
    title: 'Platform Guides',
    icon: BookOpen,
    description: 'Comprehensive platform documentation',
    items: [
      { title: 'Dashboard Overview', link: '/docs/dashboard' },
      { title: 'User Management', link: '/docs/users' },
      { title: 'Project Management', link: '/docs/projects' },
      { title: 'Client Management', link: '/docs/clients' },
      { title: 'Recruitment Module', link: '/docs/recruitment' },
      { title: 'Analytics & Reports', link: '/docs/analytics' },
    ],
  },
  {
    title: 'API Reference',
    icon: Code,
    description: 'Complete API documentation',
    items: [
      { title: 'Authentication', link: '/docs/api/auth' },
      { title: 'REST API', link: '/docs/api/rest' },
      { title: 'GraphQL API', link: '/docs/api/graphql' },
      { title: 'Webhooks', link: '/docs/api/webhooks' },
      { title: 'Rate Limits', link: '/docs/api/rate-limits' },
      { title: 'Error Handling', link: '/docs/api/errors' },
    ],
  },
  {
    title: 'Administration',
    icon: Settings,
    description: 'Admin and configuration guides',
    items: [
      { title: 'Organization Settings', link: '/docs/admin/organization' },
      { title: 'Billing & Subscriptions', link: '/docs/admin/billing' },
      { title: 'Security Settings', link: '/docs/admin/security' },
      { title: 'Integrations', link: '/docs/admin/integrations' },
      { title: 'Backup & Recovery', link: '/docs/admin/backup' },
      { title: 'Audit Logs', link: '/docs/admin/audit' },
    ],
  },
  {
    title: 'Integrations',
    icon: Package,
    description: 'Third-party integration guides',
    items: [
      { title: 'Slack Integration', link: '/docs/integrations/slack' },
      { title: 'Microsoft Teams', link: '/docs/integrations/teams' },
      { title: 'Google Workspace', link: '/docs/integrations/google' },
      { title: 'Salesforce', link: '/docs/integrations/salesforce' },
      { title: 'Stripe Payments', link: '/docs/integrations/stripe' },
      { title: 'Zapier', link: '/docs/integrations/zapier' },
    ],
  },
  {
    title: 'Security',
    icon: Shield,
    description: 'Security best practices',
    items: [
      { title: 'Security Overview', link: '/docs/security/overview' },
      { title: 'Authentication Methods', link: '/docs/security/auth' },
      { title: 'Data Encryption', link: '/docs/security/encryption' },
      { title: 'Compliance', link: '/docs/security/compliance' },
      { title: 'Security Checklist', link: '/docs/security/checklist' },
    ],
  },
]

const popularArticles = [
  {
    title: 'How to Set Up SSO Authentication',
    category: 'Security',
    views: 15234,
    link: '/docs/security/sso',
  },
  {
    title: 'Creating Custom Reports',
    category: 'Analytics',
    views: 12456,
    link: '/docs/analytics/custom-reports',
  },
  {
    title: 'API Authentication Guide',
    category: 'API',
    views: 11234,
    link: '/docs/api/authentication',
  },
  {
    title: 'Managing User Permissions',
    category: 'Administration',
    views: 9876,
    link: '/docs/admin/permissions',
  },
  {
    title: 'Webhook Configuration',
    category: 'API',
    views: 8765,
    link: '/docs/api/webhooks-setup',
  },
]

const videoTutorials = [
  {
    title: 'Platform Overview',
    duration: '12:34',
    thumbnail: '/tutorials/overview.jpg',
    link: '/tutorials/overview',
  },
  {
    title: 'Getting Started Tutorial',
    duration: '15:22',
    thumbnail: '/tutorials/getting-started.jpg',
    link: '/tutorials/getting-started',
  },
  {
    title: 'Advanced Features',
    duration: '18:45',
    thumbnail: '/tutorials/advanced.jpg',
    link: '/tutorials/advanced',
  },
  {
    title: 'API Integration',
    duration: '20:15',
    thumbnail: '/tutorials/api.jpg',
    link: '/tutorials/api',
  },
]

const resources = [
  {
    title: 'API Postman Collection',
    description: 'Ready-to-use API collection for testing',
    icon: FileCode,
    link: '/resources/postman-collection.json',
  },
  {
    title: 'SDK Libraries',
    description: 'Official SDKs for popular languages',
    icon: Code,
    link: '/resources/sdks',
  },
  {
    title: 'Code Examples',
    description: 'Sample code and implementation examples',
    icon: GitBranch,
    link: '/resources/examples',
  },
  {
    title: 'Migration Guide',
    description: 'Guide for migrating from other platforms',
    icon: Download,
    link: '/resources/migration',
  },
]

export default function DocumentationPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedSection, setExpandedSection] = useState<string | null>('Getting Started')
  const [copiedCode, setCopiedCode] = useState(false)

  const handleCopyCode = () => {
    navigator.clipboard.writeText('curl -X GET https://api.enterprise.com/v1/users \\\n  -H "Authorization: Bearer YOUR_API_KEY"')
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
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
                <Link href="/docs" className="text-xs text-primary font-medium">
                  Documentation
                </Link>
                <Link href="/api" className="text-xs text-gray-600 hover:text-gray-900 transition">
                  API Reference
                </Link>
                <Link href="/support" className="text-xs text-gray-600 hover:text-gray-900 transition">
                  Support
                </Link>
                <Link href="/status" className="text-xs text-gray-600 hover:text-gray-900 transition">
                  Status
                </Link>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Button variant="ghost" size="sm">
                <Download className="h-3.5 w-3.5 mr-2" />
                Download PDF
              </Button>
              <Link href="/login">
                <Button variant="ghost" size="sm">Sign in</Button>
              </Link>
              <Link href="/register">
                <Button size="sm">Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-gray-50 to-white py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-6">
              <BookOpen className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6">
              Documentation
            </h1>
            <p className="text-base text-gray-600 mb-8">
              Everything you need to know about using Enterprise Platform.
              From getting started to advanced features.
            </p>

            {/* Search Bar */}
            <div className="max-w-xl mx-auto relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search documentation..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex items-center justify-center gap-6 mt-8">
              <Link href="/docs/quickstart" className="text-sm text-primary hover:underline flex items-center">
                <Rocket className="h-4 w-4 mr-1" />
                Quick Start Guide
              </Link>
              <Link href="/docs/api" className="text-sm text-primary hover:underline flex items-center">
                <Code className="h-4 w-4 mr-1" />
                API Reference
              </Link>
              <Link href="/tutorials" className="text-sm text-primary hover:underline flex items-center">
                <PlayCircle className="h-4 w-4 mr-1" />
                Video Tutorials
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Sidebar Navigation */}
            <aside className="lg:col-span-1">
              <div className="sticky top-20">
                <h3 className="text-sm font-semibold mb-4">Documentation</h3>
                <div className="space-y-1">
                  {documentationSections.map((section) => {
                    const Icon = section.icon
                    const isExpanded = expandedSection === section.title
                    return (
                      <div key={section.title}>
                        <button
                          onClick={() => setExpandedSection(isExpanded ? null : section.title)}
                          className="w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg hover:bg-gray-100 transition"
                        >
                          <div className="flex items-center space-x-2">
                            <Icon className="h-4 w-4 text-gray-500" />
                            <span>{section.title}</span>
                          </div>
                          {isExpanded ? (
                            <ChevronDown className="h-3 w-3 text-gray-400" />
                          ) : (
                            <ChevronRight className="h-3 w-3 text-gray-400" />
                          )}
                        </button>
                        {isExpanded && (
                          <div className="ml-6 mt-1 space-y-1">
                            {section.items.map((item) => (
                              <Link
                                key={item.title}
                                href={item.link}
                                className="block px-3 py-1.5 text-xs text-gray-600 hover:text-primary hover:bg-gray-50 rounded"
                              >
                                {item.title}
                                {item.time && (
                                  <span className="text-gray-400 ml-1">• {item.time}</span>
                                )}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </aside>

            {/* Main Documentation Content */}
            <div className="lg:col-span-3">
              {/* Quick Start Section */}
              <Card className="mb-8">
                <CardHeader>
                  <div className="flex items-center space-x-2">
                    <Rocket className="h-5 w-5 text-primary" />
                    <CardTitle>Quick Start</CardTitle>
                  </div>
                  <CardDescription className="text-xs">
                    Get up and running with Enterprise Platform in minutes
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-bold">
                            1
                          </div>
                          <h4 className="text-sm font-semibold">Sign Up</h4>
                        </div>
                        <p className="text-xs text-gray-600">Create your account and choose a plan</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-bold">
                            2
                          </div>
                          <h4 className="text-sm font-semibold">Configure</h4>
                        </div>
                        <p className="text-xs text-gray-600">Set up your organization and team</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-bold">
                            3
                          </div>
                          <h4 className="text-sm font-semibold">Launch</h4>
                        </div>
                        <p className="text-xs text-gray-600">Start using the platform features</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Code Example */}
                  <div className="bg-gray-900 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-400">Example API Request</span>
                      <button
                        onClick={handleCopyCode}
                        className="text-xs text-gray-400 hover:text-white flex items-center"
                      >
                        {copiedCode ? (
                          <>
                            <Check className="h-3 w-3 mr-1" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3 mr-1" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="text-xs text-gray-300 font-mono">
                      <code>{`curl -X GET https://api.enterprise.com/v1/users \\
  -H "Authorization: Bearer YOUR_API_KEY"`}</code>
                    </pre>
                  </div>
                </CardContent>
              </Card>

              {/* Popular Articles */}
              <Card className="mb-8">
                <CardHeader>
                  <CardTitle className="text-base">Popular Articles</CardTitle>
                  <CardDescription className="text-xs">
                    Most viewed documentation articles
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {popularArticles.map((article, index) => (
                      <Link
                        key={index}
                        href={article.link}
                        className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition"
                      >
                        <div>
                          <p className="text-sm font-medium">{article.title}</p>
                          <p className="text-xs text-gray-500">{article.category}</p>
                        </div>
                        <div className="flex items-center space-x-3">
                          <span className="text-xs text-gray-400 flex items-center">
                            <Eye className="h-3 w-3 mr-1" />
                            {article.views.toLocaleString()}
                          </span>
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Video Tutorials */}
              <Card className="mb-8">
                <CardHeader>
                  <CardTitle className="text-base">Video Tutorials</CardTitle>
                  <CardDescription className="text-xs">
                    Learn with step-by-step video guides
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {videoTutorials.map((video, index) => (
                      <Link key={index} href={video.link} className="group">
                        <div className="aspect-video bg-gray-200 rounded-lg mb-2 relative overflow-hidden">
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                            <PlayCircle className="h-8 w-8 text-white" />
                          </div>
                        </div>
                        <p className="text-xs font-medium">{video.title}</p>
                        <p className="text-xs text-gray-500">{video.duration}</p>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Resources */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Developer Resources</CardTitle>
                  <CardDescription className="text-xs">
                    Tools and resources for developers
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {resources.map((resource, index) => {
                      const Icon = resource.icon
                      return (
                        <Link
                          key={index}
                          href={resource.link}
                          className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 transition"
                        >
                          <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                            <Icon className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{resource.title}</p>
                            <p className="text-xs text-gray-600">{resource.description}</p>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Help Section */}
      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              Need Help?
            </h2>
            <p className="text-sm text-gray-600 mb-8">
              Can't find what you're looking for? We're here to help.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <Card>
                <CardContent className="pt-6">
                  <MessageSquare className="h-8 w-8 text-primary mx-auto mb-3" />
                  <h3 className="text-sm font-semibold mb-1">Community Forum</h3>
                  <p className="text-xs text-gray-600 mb-3">Get help from our community</p>
                  <Link href="/community" className="text-xs text-primary hover:underline">
                    Visit Forum →
                  </Link>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <Mail className="h-8 w-8 text-primary mx-auto mb-3" />
                  <h3 className="text-sm font-semibold mb-1">Email Support</h3>
                  <p className="text-xs text-gray-600 mb-3">Get help from our team</p>
                  <Link href="/support" className="text-xs text-primary hover:underline">
                    Contact Support →
                  </Link>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <GraduationCap className="h-8 w-8 text-primary mx-auto mb-3" />
                  <h3 className="text-sm font-semibold mb-1">Training</h3>
                  <p className="text-xs text-gray-600 mb-3">Learn from experts</p>
                  <Link href="/training" className="text-xs text-primary hover:underline">
                    View Courses →
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
