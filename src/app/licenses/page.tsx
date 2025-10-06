'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  FileText,
  Code,
  Package,
  Github,
  Globe,
  Shield,
  Award,
  Info,
  ExternalLink,
  Download,
  Search,
  Filter,
  ChevronRight,
  ChevronDown,
  CheckCircle,
  Heart,
  Star,
  GitBranch,
  Terminal,
  Layers,
  Database,
  Server,
  Lock,
  Book,
  Coffee,
  Zap,
  Box,
} from 'lucide-react'

const licenses = [
  {
    name: 'React',
    version: '18.2.0',
    license: 'MIT',
    category: 'Frontend Framework',
    description: 'A JavaScript library for building user interfaces',
    url: 'https://reactjs.org/',
    github: 'https://github.com/facebook/react',
  },
  {
    name: 'Next.js',
    version: '14.0.4',
    license: 'MIT',
    category: 'Frontend Framework',
    description: 'The React Framework for Production',
    url: 'https://nextjs.org/',
    github: 'https://github.com/vercel/next.js',
  },
  {
    name: 'TypeScript',
    version: '5.3.3',
    license: 'Apache-2.0',
    category: 'Language',
    description: 'TypeScript is a typed superset of JavaScript',
    url: 'https://www.typescriptlang.org/',
    github: 'https://github.com/microsoft/TypeScript',
  },
  {
    name: 'Tailwind CSS',
    version: '3.4.0',
    license: 'MIT',
    category: 'CSS Framework',
    description: 'A utility-first CSS framework',
    url: 'https://tailwindcss.com/',
    github: 'https://github.com/tailwindlabs/tailwindcss',
  },
  {
    name: 'Radix UI',
    version: '1.0.0',
    license: 'MIT',
    category: 'UI Components',
    description: 'Low-level UI primitives for React',
    url: 'https://www.radix-ui.com/',
    github: 'https://github.com/radix-ui/primitives',
  },
  {
    name: 'Zustand',
    version: '4.4.7',
    license: 'MIT',
    category: 'State Management',
    description: 'Bear necessities for state management in React',
    url: 'https://zustand-demo.pmnd.rs/',
    github: 'https://github.com/pmndrs/zustand',
  },
  {
    name: 'React Query',
    version: '5.17.0',
    license: 'MIT',
    category: 'Data Fetching',
    description: 'Powerful asynchronous state management',
    url: 'https://tanstack.com/query',
    github: 'https://github.com/tanstack/query',
  },
  {
    name: 'Axios',
    version: '1.6.5',
    license: 'MIT',
    category: 'HTTP Client',
    description: 'Promise based HTTP client',
    url: 'https://axios-http.com/',
    github: 'https://github.com/axios/axios',
  },
  {
    name: 'Framer Motion',
    version: '10.17.9',
    license: 'MIT',
    category: 'Animation',
    description: 'Production-ready motion library for React',
    url: 'https://www.framer.com/motion/',
    github: 'https://github.com/framer/motion',
  },
  {
    name: 'Recharts',
    version: '2.10.3',
    license: 'MIT',
    category: 'Data Visualization',
    description: 'A composable charting library built on React components',
    url: 'https://recharts.org/',
    github: 'https://github.com/recharts/recharts',
  },
  {
    name: 'date-fns',
    version: '3.0.6',
    license: 'MIT',
    category: 'Date Utility',
    description: 'Modern JavaScript date utility library',
    url: 'https://date-fns.org/',
    github: 'https://github.com/date-fns/date-fns',
  },
  {
    name: 'React Hook Form',
    version: '7.48.2',
    license: 'MIT',
    category: 'Form Management',
    description: 'Performant forms with easy-to-use validation',
    url: 'https://react-hook-form.com/',
    github: 'https://github.com/react-hook-form/react-hook-form',
  },
  {
    name: 'Zod',
    version: '3.22.4',
    license: 'MIT',
    category: 'Validation',
    description: 'TypeScript-first schema validation',
    url: 'https://zod.dev/',
    github: 'https://github.com/colinhacks/zod',
  },
  {
    name: 'Lucide React',
    version: '0.303.0',
    license: 'ISC',
    category: 'Icons',
    description: 'Beautiful & consistent icon toolkit',
    url: 'https://lucide.dev/',
    github: 'https://github.com/lucide-icons/lucide',
  },
  {
    name: 'Socket.io Client',
    version: '4.5.4',
    license: 'MIT',
    category: 'Real-time',
    description: 'Real-time bidirectional event-based communication',
    url: 'https://socket.io/',
    github: 'https://github.com/socketio/socket.io-client',
  },
]

const licenseTypes = {
  MIT: {
    name: 'MIT License',
    description: 'A permissive license that allows commercial use, modification, distribution, and private use.',
    permissions: ['Commercial use', 'Modification', 'Distribution', 'Private use'],
    conditions: ['License and copyright notice'],
    limitations: ['No liability', 'No warranty'],
  },
  'Apache-2.0': {
    name: 'Apache License 2.0',
    description: 'A permissive license that also provides an express grant of patent rights.',
    permissions: ['Commercial use', 'Modification', 'Distribution', 'Private use', 'Patent use'],
    conditions: ['License and copyright notice', 'State changes'],
    limitations: ['No liability', 'No warranty', 'No trademark use'],
  },
  ISC: {
    name: 'ISC License',
    description: 'A permissive license functionally equivalent to the MIT License.',
    permissions: ['Commercial use', 'Modification', 'Distribution', 'Private use'],
    conditions: ['License and copyright notice'],
    limitations: ['No liability', 'No warranty'],
  },
}

const categories = [
  'All',
  'Frontend Framework',
  'CSS Framework',
  'UI Components',
  'State Management',
  'Data Fetching',
  'HTTP Client',
  'Animation',
  'Data Visualization',
  'Date Utility',
  'Form Management',
  'Validation',
  'Icons',
  'Real-time',
  'Language',
]

export default function LicensesPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [selectedLicense, setSelectedLicense] = useState('All')
  const [expandedLicense, setExpandedLicense] = useState<string | null>(null)

  const filteredLicenses = licenses.filter(license => {
    const matchesSearch = license.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          license.description.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = selectedCategory === 'All' || license.category === selectedCategory
    const matchesLicense = selectedLicense === 'All' || license.license === selectedLicense
    return matchesSearch && matchesCategory && matchesLicense
  })

  const uniqueLicenseTypes = Array.from(new Set(licenses.map(l => l.license)))

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
                <Link href="/licenses" className="text-xs text-primary font-medium">
                  Licenses
                </Link>
                <Link href="/privacy" className="text-xs text-gray-600 hover:text-gray-900 transition">
                  Privacy
                </Link>
                <Link href="/terms" className="text-xs text-gray-600 hover:text-gray-900 transition">
                  Terms
                </Link>
                <Link href="/security" className="text-xs text-gray-600 hover:text-gray-900 transition">
                  Security
                </Link>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Button variant="ghost" size="sm">
                <Download className="h-3.5 w-3.5 mr-2" />
                Export Licenses
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-gray-50 to-white py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-6">
              <Award className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6">
              Open Source Licenses
            </h1>
            <p className="text-base text-gray-600 mb-8">
              Enterprise Platform is built on the shoulders of giants. We're grateful to the
              open source community for their incredible work. Below is a list of the
              third-party libraries and their licenses.
            </p>
            <div className="flex items-center justify-center gap-6">
              <div className="flex items-center space-x-2">
                <Package className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">{licenses.length} Dependencies</span>
              </div>
              <div className="flex items-center space-x-2">
                <Shield className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium">All Compatible</span>
              </div>
              <div className="flex items-center space-x-2">
                <Heart className="h-5 w-5 text-red-600" />
                <span className="text-sm font-medium">Open Source</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="py-8 border-b sticky top-16 bg-white z-40">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search packages..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <select
                value={selectedLicense}
                onChange={(e) => setSelectedLicense(e.target.value)}
                className="px-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="All">All Licenses</option>
                {uniqueLicenseTypes.map(license => (
                  <option key={license} value={license}>{license}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* License List */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="mb-8">
              <h2 className="text-2xl font-bold mb-2">Third-Party Dependencies</h2>
              <p className="text-sm text-gray-600">
                {filteredLicenses.length} packages found
              </p>
            </div>

            <div className="grid gap-4">
              {filteredLicenses.map((pkg) => (
                <Card key={pkg.name} className="hover:shadow-lg transition-shadow">
                  <CardHeader
                    className="cursor-pointer"
                    onClick={() => setExpandedLicense(expandedLicense === pkg.name ? null : pkg.name)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-4">
                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                          <Package className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{pkg.name}</CardTitle>
                          <CardDescription className="text-xs mt-1">
                            {pkg.description}
                          </CardDescription>
                          <div className="flex items-center gap-4 mt-2">
                            <span className="text-xs text-gray-500">v{pkg.version}</span>
                            <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">
                              {pkg.license}
                            </span>
                            <span className="text-xs text-gray-500">{pkg.category}</span>
                          </div>
                        </div>
                      </div>
                      {expandedLicense === pkg.name ? (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                  </CardHeader>
                  {expandedLicense === pkg.name && (
                    <CardContent>
                      <div className="flex items-center gap-4">
                        <a
                          href={pkg.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center"
                        >
                          <Globe className="h-3 w-3 mr-1" />
                          Website
                        </a>
                        <a
                          href={pkg.github}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center"
                        >
                          <Github className="h-3 w-3 mr-1" />
                          GitHub
                        </a>
                        <button className="text-xs text-primary hover:underline flex items-center">
                          <FileText className="h-3 w-3 mr-1" />
                          View License
                        </button>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* License Types */}
      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl font-bold mb-8 text-center">License Types</h2>

            <div className="grid md:grid-cols-3 gap-6">
              {Object.entries(licenseTypes).map(([key, license]) => (
                <Card key={key}>
                  <CardHeader>
                    <CardTitle className="text-base">{license.name}</CardTitle>
                    <CardDescription className="text-xs">
                      {license.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-xs font-semibold text-green-700 mb-2">Permissions</p>
                      <ul className="space-y-1">
                        {license.permissions.map((perm, idx) => (
                          <li key={idx} className="flex items-start space-x-2">
                            <CheckCircle className="h-3 w-3 text-green-600 mt-0.5" />
                            <span className="text-xs text-gray-700">{perm}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-yellow-700 mb-2">Conditions</p>
                      <ul className="space-y-1">
                        {license.conditions.map((cond, idx) => (
                          <li key={idx} className="flex items-start space-x-2">
                            <Info className="h-3 w-3 text-yellow-600 mt-0.5" />
                            <span className="text-xs text-gray-700">{cond}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-red-700 mb-2">Limitations</p>
                      <ul className="space-y-1">
                        {license.limitations.map((limit, idx) => (
                          <li key={idx} className="flex items-start space-x-2">
                            <XCircle className="h-3 w-3 text-red-600 mt-0.5" />
                            <span className="text-xs text-gray-700">{limit}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Our License */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <Card className="border-primary">
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                    <span className="text-black font-bold text-sm">E</span>
                  </div>
                  <div>
                    <CardTitle>Enterprise Platform License</CardTitle>
                    <CardDescription className="text-xs">
                      Our software is provided under a commercial license
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-700">
                  Enterprise Platform is proprietary software. While we use many open source
                  libraries (listed above), our platform itself is not open source.
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-semibold mb-2">What you can do:</h4>
                    <ul className="space-y-1">
                      <li className="flex items-start space-x-2">
                        <CheckCircle className="h-3 w-3 text-green-600 mt-0.5" />
                        <span className="text-xs">Use the platform for your business</span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <CheckCircle className="h-3 w-3 text-green-600 mt-0.5" />
                        <span className="text-xs">Customize your instance</span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <CheckCircle className="h-3 w-3 text-green-600 mt-0.5" />
                        <span className="text-xs">Integrate with other services</span>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold mb-2">What you cannot do:</h4>
                    <ul className="space-y-1">
                      <li className="flex items-start space-x-2">
                        <XCircle className="h-3 w-3 text-red-600 mt-0.5" />
                        <span className="text-xs">Redistribute our software</span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <XCircle className="h-3 w-3 text-red-600 mt-0.5" />
                        <span className="text-xs">Reverse engineer the platform</span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <XCircle className="h-3 w-3 text-red-600 mt-0.5" />
                        <span className="text-xs">Create derivative works</span>
                      </li>
                    </ul>
                  </div>
                </div>
                <div className="pt-4 border-t">
                  <p className="text-xs text-gray-600">
                    For full license terms, please refer to your subscription agreement.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Attribution */}
      <section className="py-16 lg:py-24 bg-primary">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Heart className="h-8 w-8 text-red-600 mx-auto mb-4" />
          <h2 className="text-2xl sm:text-3xl font-bold text-black mb-4">
            Thank You, Open Source Community
          </h2>
          <p className="text-sm text-black/80 mb-8 max-w-2xl mx-auto">
            We're grateful for the amazing open source projects that make Enterprise Platform
            possible. Consider supporting these projects if you find them valuable.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="https://github.com/sponsors"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="secondary" size="lg">
                <Github className="mr-2 h-4 w-4" />
                Support Open Source
              </Button>
            </a>
            <Link href="/contact">
              <Button variant="outline" size="lg" className="bg-black/10 border-black/20 hover:bg-black/20">
                Contact Legal Team
                <Mail className="mr-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
