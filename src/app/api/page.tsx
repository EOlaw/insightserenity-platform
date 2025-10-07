'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card'
import {
  Code,
  Terminal,
  FileCode,
  GitBranch,
  Package,
  Key,
  Lock,
  Globe,
  Zap,
  Database,
  Server,
  Cloud,
  Activity,
  AlertCircle,
  CheckCircle,
  Info,
  Copy,
  Check,
  ChevronRight,
  ChevronDown,
  Search,
  Filter,
  Download,
  ExternalLink,
  Book,
  PlayCircle,
  Settings,
  Shield,
  Clock,
  TrendingUp,
  Hash,
  Link2,
  Send,
  RefreshCw,
  Layers,
  Network,
  HardDrive,
  Cpu,
  ArrowRight,
  ArrowUpRight,
} from 'lucide-react'

const apiEndpoints = [
  {
    category: 'Authentication',
    description: 'Endpoints for user authentication and authorization',
    endpoints: [
      {
        method: 'POST',
        path: '/auth/login',
        description: 'Authenticate user and receive access token',
        auth: false,
      },
      {
        method: 'POST',
        path: '/auth/logout',
        description: 'Invalidate current access token',
        auth: true,
      },
      {
        method: 'POST',
        path: '/auth/refresh',
        description: 'Refresh access token using refresh token',
        auth: false,
      },
      {
        method: 'POST',
        path: '/auth/register',
        description: 'Register a new user account',
        auth: false,
      },
      {
        method: 'GET',
        path: '/auth/me',
        description: 'Get current user information',
        auth: true,
      },
    ],
  },
  {
    category: 'Users',
    description: 'User management endpoints',
    endpoints: [
      {
        method: 'GET',
        path: '/users',
        description: 'List all users in organization',
        auth: true,
      },
      {
        method: 'GET',
        path: '/users/{id}',
        description: 'Get specific user details',
        auth: true,
      },
      {
        method: 'POST',
        path: '/users',
        description: 'Create a new user',
        auth: true,
      },
      {
        method: 'PUT',
        path: '/users/{id}',
        description: 'Update user information',
        auth: true,
      },
      {
        method: 'DELETE',
        path: '/users/{id}',
        description: 'Delete a user',
        auth: true,
      },
    ],
  },
  {
    category: 'Projects',
    description: 'Project management endpoints',
    endpoints: [
      {
        method: 'GET',
        path: '/projects',
        description: 'List all projects',
        auth: true,
      },
      {
        method: 'GET',
        path: '/projects/{id}',
        description: 'Get project details',
        auth: true,
      },
      {
        method: 'POST',
        path: '/projects',
        description: 'Create new project',
        auth: true,
      },
      {
        method: 'PUT',
        path: '/projects/{id}',
        description: 'Update project',
        auth: true,
      },
      {
        method: 'DELETE',
        path: '/projects/{id}',
        description: 'Delete project',
        auth: true,
      },
    ],
  },
  {
    category: 'Webhooks',
    description: 'Webhook configuration and management',
    endpoints: [
      {
        method: 'GET',
        path: '/webhooks',
        description: 'List configured webhooks',
        auth: true,
      },
      {
        method: 'POST',
        path: '/webhooks',
        description: 'Create new webhook',
        auth: true,
      },
      {
        method: 'PUT',
        path: '/webhooks/{id}',
        description: 'Update webhook configuration',
        auth: true,
      },
      {
        method: 'DELETE',
        path: '/webhooks/{id}',
        description: 'Delete webhook',
        auth: true,
      },
      {
        method: 'POST',
        path: '/webhooks/{id}/test',
        description: 'Test webhook delivery',
        auth: true,
      },
    ],
  },
]

const codeExamples = {
  curl: `curl -X GET https://api.enterprise.com/v1/users \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"`,

  javascript: `const response = await fetch('https://api.enterprise.com/v1/users', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  }
});

const users = await response.json();`,

  python: `import requests

headers = {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
}

response = requests.get('https://api.enterprise.com/v1/users', headers=headers)
users = response.json()`,

  php: `$curl = curl_init();

curl_setopt_array($curl, [
  CURLOPT_URL => "https://api.enterprise.com/v1/users",
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    "Authorization: Bearer YOUR_API_KEY",
    "Content-Type: application/json"
  ],
]);

$response = curl_exec($curl);
curl_close($curl);`,
}

const sdkLanguages = [
  { name: 'Node.js', icon: FileCode, version: '2.5.0', downloads: '45k/month' },
  { name: 'Python', icon: FileCode, version: '2.3.1', downloads: '38k/month' },
  { name: 'PHP', icon: FileCode, version: '1.8.2', downloads: '22k/month' },
  { name: 'Ruby', icon: FileCode, version: '1.5.0', downloads: '15k/month' },
  { name: 'Java', icon: FileCode, version: '3.1.0', downloads: '31k/month' },
  { name: 'Go', icon: FileCode, version: '1.2.0', downloads: '18k/month' },
]

const rateLimits = [
  { tier: 'Free', requests: '100/hour', burst: '10/second' },
  { tier: 'Starter', requests: '1,000/hour', burst: '50/second' },
  { tier: 'Professional', requests: '10,000/hour', burst: '100/second' },
  { tier: 'Enterprise', requests: 'Unlimited', burst: 'Custom' },
]

const webhookEvents = [
  { event: 'user.created', description: 'New user account created' },
  { event: 'user.updated', description: 'User information updated' },
  { event: 'user.deleted', description: 'User account deleted' },
  { event: 'project.created', description: 'New project created' },
  { event: 'project.updated', description: 'Project details updated' },
  { event: 'project.completed', description: 'Project marked as complete' },
  { event: 'payment.success', description: 'Payment successfully processed' },
  { event: 'payment.failed', description: 'Payment processing failed' },
  { event: 'subscription.updated', description: 'Subscription plan changed' },
  { event: 'team.member.added', description: 'New team member added' },
]

const errorCodes = [
  { code: 400, name: 'Bad Request', description: 'Invalid request parameters' },
  { code: 401, name: 'Unauthorized', description: 'Missing or invalid authentication' },
  { code: 403, name: 'Forbidden', description: 'Insufficient permissions' },
  { code: 404, name: 'Not Found', description: 'Resource not found' },
  { code: 429, name: 'Too Many Requests', description: 'Rate limit exceeded' },
  { code: 500, name: 'Internal Server Error', description: 'Server error occurred' },
  { code: 503, name: 'Service Unavailable', description: 'Service temporarily unavailable' },
]

export default function APIReferencePage() {
  const [selectedLanguage, setSelectedLanguage] = useState('curl')
  const [copiedCode, setCopiedCode] = useState(false)
  const [expandedCategory, setExpandedCategory] = useState<string | null>('Authentication')
  const [searchTerm, setSearchTerm] = useState('')

  const handleCopyCode = () => {
    navigator.clipboard.writeText(codeExamples[selectedLanguage as keyof typeof codeExamples])
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  const getMethodColor = (method: string) => {
    switch (method) {
      case 'GET': return 'text-green-600 bg-green-100'
      case 'POST': return 'text-blue-600 bg-blue-100'
      case 'PUT': return 'text-orange-600 bg-orange-100'
      case 'DELETE': return 'text-red-600 bg-red-100'
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
                <Link href="/docs" className="text-xs text-gray-600 hover:text-gray-900 transition">
                  Documentation
                </Link>
                <Link href="/api" className="text-xs text-primary font-medium">
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
                OpenAPI Spec
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
              <Code className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6">
              API Reference
            </h1>
            <p className="text-base text-gray-600 mb-8">
              Build powerful integrations with our comprehensive REST API.
              Full documentation for all endpoints and features.
            </p>

            {/* Quick Links */}
            <div className="flex items-center justify-center gap-6">
              <Link href="#getting-started" className="text-sm text-primary hover:underline flex items-center">
                <Zap className="h-4 w-4 mr-1" />
                Quick Start
              </Link>
              <Link href="#authentication" className="text-sm text-primary hover:underline flex items-center">
                <Key className="h-4 w-4 mr-1" />
                Authentication
              </Link>
              <Link href="#sdks" className="text-sm text-primary hover:underline flex items-center">
                <Package className="h-4 w-4 mr-1" />
                SDKs
              </Link>
              <Link href="#webhooks" className="text-sm text-primary hover:underline flex items-center">
                <Link2 className="h-4 w-4 mr-1" />
                Webhooks
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* API Info Cards */}
      <section className="py-8 border-y">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">v1</div>
              <div className="text-xs text-gray-600">Current Version</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">REST</div>
              <div className="text-xs text-gray-600">API Type</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">99.99%</div>
              <div className="text-xs text-gray-600">Uptime SLA</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">&lt;100ms</div>
              <div className="text-xs text-gray-600">Avg Response Time</div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Sidebar */}
            <aside className="lg:col-span-1">
              <div className="sticky top-20">
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search endpoints..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                <h3 className="text-sm font-semibold mb-4">Endpoints</h3>
                <div className="space-y-1">
                  {apiEndpoints.map((category) => {
                    const isExpanded = expandedCategory === category.category
                    return (
                      <div key={category.category}>
                        <button
                          onClick={() => setExpandedCategory(isExpanded ? null : category.category)}
                          className="w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg hover:bg-gray-100 transition"
                        >
                          <span>{category.category}</span>
                          {isExpanded ? (
                            <ChevronDown className="h-3 w-3 text-gray-400" />
                          ) : (
                            <ChevronRight className="h-3 w-3 text-gray-400" />
                          )}
                        </button>
                        {isExpanded && (
                          <div className="ml-3 mt-1 space-y-1">
                            {category.endpoints.map((endpoint) => (
                              <Link
                                key={endpoint.path}
                                href={`#${endpoint.path}`}
                                className="block px-3 py-1.5 text-xs text-gray-600 hover:text-primary hover:bg-gray-50 rounded"
                              >
                                <span className={`inline-block w-12 text-2xs font-medium ${getMethodColor(endpoint.method)}`}>
                                  {endpoint.method}
                                </span>
                                <span className="ml-2">{endpoint.path}</span>
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

            {/* Main Content */}
            <div className="lg:col-span-3 space-y-8">
              {/* Getting Started */}
              <Card id="getting-started">
                <CardHeader>
                  <CardTitle>Getting Started</CardTitle>
                  <CardDescription className="text-xs">
                    Quick guide to start using the Enterprise API
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Base URL</h3>
                    <code className="block bg-gray-100 p-2 rounded text-xs">
                      https://api.enterprise.com/v1
                    </code>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Authentication</h3>
                    <p className="text-xs text-gray-600">
                      All API requests require authentication using an API key in the Authorization header:
                    </p>
                    <code className="block bg-gray-100 p-2 rounded text-xs">
                      Authorization: Bearer YOUR_API_KEY
                    </code>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Code Example</h3>
                    <div className="bg-gray-900 rounded-lg">
                      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
                        <div className="flex space-x-2">
                          {Object.keys(codeExamples).map((lang) => (
                            <button
                              key={lang}
                              onClick={() => setSelectedLanguage(lang)}
                              className={`px-2 py-1 text-xs rounded ${
                                selectedLanguage === lang
                                  ? 'bg-primary text-black'
                                  : 'text-gray-400 hover:text-white'
                              }`}
                            >
                              {lang}
                            </button>
                          ))}
                        </div>
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
                      <pre className="p-4 text-xs text-gray-300 font-mono overflow-x-auto">
                        <code>{codeExamples[selectedLanguage as keyof typeof codeExamples]}</code>
                      </pre>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Rate Limits */}
              <Card>
                <CardHeader>
                  <CardTitle>Rate Limits</CardTitle>
                  <CardDescription className="text-xs">
                    API rate limits by subscription tier
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2">Tier</th>
                          <th className="text-left py-2">Requests</th>
                          <th className="text-left py-2">Burst Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rateLimits.map((limit) => (
                          <tr key={limit.tier} className="border-b">
                            <td className="py-2 font-medium">{limit.tier}</td>
                            <td className="py-2">{limit.requests}</td>
                            <td className="py-2">{limit.burst}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                    <p className="text-xs text-blue-800">
                      <Info className="inline h-3 w-3 mr-1" />
                      Rate limit information is included in response headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* SDKs */}
              <Card id="sdks">
                <CardHeader>
                  <CardTitle>Official SDKs</CardTitle>
                  <CardDescription className="text-xs">
                    Use our official SDK libraries for easier integration
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {sdkLanguages.map((sdk) => {
                      const Icon = sdk.icon
                      return (
                        <div key={sdk.name} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                          <div className="flex items-center space-x-3">
                            <Icon className="h-5 w-5 text-gray-600" />
                            <div>
                              <p className="text-sm font-medium">{sdk.name}</p>
                              <p className="text-xs text-gray-500">v{sdk.version}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-500">{sdk.downloads}</p>
                            <a href="#" className="text-xs text-primary hover:underline">Install →</a>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Webhooks */}
              <Card id="webhooks">
                <CardHeader>
                  <CardTitle>Webhook Events</CardTitle>
                  <CardDescription className="text-xs">
                    Available webhook events for real-time notifications
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {webhookEvents.map((event) => (
                      <div key={event.event} className="flex items-center justify-between py-2 border-b">
                        <div>
                          <code className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                            {event.event}
                          </code>
                          <p className="text-xs text-gray-600 mt-1">{event.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Error Codes */}
              <Card>
                <CardHeader>
                  <CardTitle>Error Codes</CardTitle>
                  <CardDescription className="text-xs">
                    Standard HTTP status codes and error responses
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {errorCodes.map((error) => (
                      <div key={error.code} className="flex items-start space-x-3">
                        <span className={`text-xs font-mono px-2 py-1 rounded ${
                          error.code < 400 ? 'bg-green-100 text-green-800' :
                          error.code < 500 ? 'bg-orange-100 text-orange-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {error.code}
                        </span>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{error.name}</p>
                          <p className="text-xs text-gray-600">{error.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 lg:py-24 bg-primary">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-black mb-4">
            Start Building Today
          </h2>
          <p className="text-sm text-black/80 mb-8 max-w-2xl mx-auto">
            Get your API key and start integrating with Enterprise Platform
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/register">
              <Button variant="secondary" size="lg">
                Get API Key
                <Key className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/api/playground">
              <Button variant="outline" size="lg" className="bg-black/10 border-black/20 hover:bg-black/20">
                API Playground
                <PlayCircle className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
