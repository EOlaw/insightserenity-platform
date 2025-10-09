import Link from 'next/link'
import { Button } from '../../shared/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../shared/components/ui/card'
import {
  FileText,
  Package,
  Code,
  ExternalLink,
  Download,
  ArrowLeft,
  Calendar,
  Star,
  Users,
  Github,
  CheckCircle,
  Scale,
  Heart,
  Globe,
  Shield,
  Search,
  Filter,
  Eye,
  Copy,
  Check,
  Mail,
  Building2,
  Phone,
  MapPin,
} from 'lucide-react'

const licenseTypes = [
  {
    name: 'MIT License',
    count: 156,
    description: 'Permissive free software license',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    icon: CheckCircle,
  },
  {
    name: 'Apache 2.0',
    count: 43,
    description: 'Patent and trademark protection',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    icon: Shield,
  },
  {
    name: 'BSD 3-Clause',
    count: 28,
    description: 'Revised BSD license with advertising clause',
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    icon: Scale,
  },
  {
    name: 'ISC License',
    count: 12,
    description: 'Internet Software Consortium license',
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    icon: Globe,
  },
]

const majorDependencies = [
  {
    name: 'React',
    version: '18.2.0',
    license: 'MIT',
    description: 'A JavaScript library for building user interfaces',
    homepage: 'https://reactjs.org',
    repository: 'https://github.com/facebook/react',
    author: 'Meta Platforms, Inc.',
    category: 'Frontend Framework',
    stars: 220000,
  },
  {
    name: 'Next.js',
    version: '14.0.4',
    license: 'MIT',
    description: 'The React Framework for Production',
    homepage: 'https://nextjs.org',
    repository: 'https://github.com/vercel/next.js',
    author: 'Vercel',
    category: 'Framework',
    stars: 118000,
  },
  {
    name: 'TypeScript',
    version: '5.3.2',
    license: 'Apache-2.0',
    description: 'TypeScript is a superset of JavaScript that compiles to clean JavaScript output',
    homepage: 'https://www.typescriptlang.org',
    repository: 'https://github.com/microsoft/TypeScript',
    author: 'Microsoft Corporation',
    category: 'Language',
    stars: 97000,
  },
  {
    name: 'Tailwind CSS',
    version: '3.3.6',
    license: 'MIT',
    description: 'A utility-first CSS framework for rapid UI development',
    homepage: 'https://tailwindcss.com',
    repository: 'https://github.com/tailwindlabs/tailwindcss',
    author: 'Tailwind Labs',
    category: 'Styling',
    stars: 78000,
  },
  {
    name: 'Radix UI',
    version: '1.0.4',
    license: 'MIT',
    description: 'Low-level UI primitives with accessibility and keyboard navigation',
    homepage: 'https://radix-ui.com',
    repository: 'https://github.com/radix-ui/primitives',
    author: 'WorkOS',
    category: 'UI Components',
    stars: 14000,
  },
  {
    name: 'Lucide React',
    version: '0.294.0',
    license: 'ISC',
    description: 'Beautiful & consistent icon toolkit made by the community',
    homepage: 'https://lucide.dev',
    repository: 'https://github.com/lucide-icons/lucide',
    author: 'Lucide Contributors',
    category: 'Icons',
    stars: 8500,
  },
]

const allDependencies = [
  ...majorDependencies,
  {
    name: 'axios',
    version: '1.6.2',
    license: 'MIT',
    description: 'Promise based HTTP client for the browser and node.js',
    homepage: 'https://axios-http.com',
    repository: 'https://github.com/axios/axios',
    author: 'Matt Zabriskie',
    category: 'HTTP Client',
    stars: 104000,
  },
  {
    name: 'react-hot-toast',
    version: '2.4.1',
    license: 'MIT',
    description: 'Smoking Hot React Notifications',
    homepage: 'https://react-hot-toast.com',
    repository: 'https://github.com/timolins/react-hot-toast',
    author: 'Timo Lins',
    category: 'Notifications',
    stars: 8900,
  },
  {
    name: 'zustand',
    version: '4.4.7',
    license: 'MIT',
    description: 'Small, fast and scalable bearbones state-management solution',
    homepage: 'https://zustand-demo.pmnd.rs',
    repository: 'https://github.com/pmndrs/zustand',
    author: 'Poimandres',
    category: 'State Management',
    stars: 42000,
  },
  {
    name: 'class-variance-authority',
    version: '0.7.0',
    license: 'Apache-2.0',
    description: 'CVA - Class Variance Authority',
    homepage: 'https://cva.style',
    repository: 'https://github.com/joe-bell/cva',
    author: 'Joe Bell',
    category: 'Utility',
    stars: 4200,
  },
]

export default function LicensesPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <Link href="/" className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <span className="text-black font-bold text-sm">E</span>
                </div>
                <span className="text-lg font-bold text-foreground">Enterprise</span>
              </Link>
            </div>
            <div className="flex items-center space-x-3">
              <Link href="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-3.5 w-3.5 mr-2" />
                  Back to Home
                </Button>
              </Link>
              <Button variant="outline" size="sm">
                <Download className="h-3.5 w-3.5 mr-2" />
                Download Report
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-muted/50 to-background py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-6">
              <Package className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6 text-foreground">
              Open Source Licenses
            </h1>
            <p className="text-base text-muted-foreground mb-8">
              We're built on the shoulders of giants. Here's our attribution to the amazing
              open source projects that make Enterprise Platform possible.
            </p>
            <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center">
                <Calendar className="h-4 w-4 mr-1" />
                Updated: December 2024
              </span>
              <span className="flex items-center">
                <Package className="h-4 w-4 mr-1" />
                {allDependencies.length} dependencies
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* License Summary */}
      <section className="py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">License Distribution</h2>
              <p className="text-sm text-muted-foreground">
                Overview of the different licenses used by our dependencies
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {licenseTypes.map((license, index) => {
                const Icon = license.icon
                return (
                  <Card key={index} className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-6 text-center">
                      <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="font-semibold mb-2 text-foreground">{license.name}</h3>
                      <p className="text-xs text-muted-foreground mb-3">{license.description}</p>
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${license.color}`}>
                        {license.count} packages
                      </span>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Attribution Banner */}
      <section className="py-8 bg-gradient-to-r from-blue-100/50 to-purple-100/50 dark:from-blue-900/20 dark:to-purple-900/20 border-y border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <div className="flex items-center justify-center mb-4">
              <Heart className="h-6 w-6 text-red-500 mr-2" />
              <h3 className="text-lg font-semibold text-foreground">Built with Open Source</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              We believe in giving back to the open source community that has made our platform possible.
              All the projects listed below are essential to our success, and we're grateful to their maintainers
              and contributors.
            </p>
          </div>
        </div>
      </section>

      {/* Major Dependencies */}
      <section className="py-16 bg-muted/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">Major Dependencies</h2>
              <p className="text-sm text-muted-foreground">
                Core technologies that power our platform
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {majorDependencies.map((dep, index) => (
                <Card key={index} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                          <Package className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{dep.name}</CardTitle>
                          <CardDescription className="text-xs">v{dep.version} • {dep.license}</CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs bg-muted px-2 py-1 rounded">{dep.category}</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground mb-3">{dep.description}</p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Author: {dep.author}</span>
                        <span className="flex items-center">
                          <Star className="h-3 w-3 mr-1 text-yellow-500" />
                          {dep.stars.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Link
                          href={dep.homepage}
                          target="_blank"
                          className="text-xs text-primary hover:underline flex items-center"
                        >
                          Homepage
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </Link>
                        <span className="text-xs text-muted-foreground">•</span>
                        <Link
                          href={dep.repository}
                          target="_blank"
                          className="text-xs text-primary hover:underline flex items-center"
                        >
                          <Github className="h-3 w-3 mr-1" />
                          Repository
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* All Dependencies */}
      <section className="py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-bold text-foreground">All Dependencies</h2>
                <p className="text-sm text-muted-foreground">Complete list of open source packages</p>
              </div>
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search packages..."
                    className="pl-10 pr-4 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-background text-foreground"
                  />
                </div>
                <Button variant="outline" size="sm">
                  <Filter className="h-4 w-4 mr-2" />
                  Filter
                </Button>
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th className="text-left p-4 text-xs font-semibold text-foreground">Package</th>
                        <th className="text-left p-4 text-xs font-semibold text-foreground">Version</th>
                        <th className="text-left p-4 text-xs font-semibold text-foreground">License</th>
                        <th className="text-left p-4 text-xs font-semibold text-foreground">Category</th>
                        <th className="text-left p-4 text-xs font-semibold text-foreground">Links</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allDependencies.map((dep, index) => (
                        <tr key={index} className="border-b border-border hover:bg-muted/50">
                          <td className="p-4">
                            <div>
                              <div className="text-sm font-medium text-foreground">{dep.name}</div>
                              <div className="text-xs text-muted-foreground truncate max-w-xs" title={dep.description}>
                                {dep.description}
                              </div>
                            </div>
                          </td>
                          <td className="p-4">
                            <span className="text-xs font-mono bg-muted px-2 py-1 rounded">
                              v{dep.version}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className="text-xs font-medium text-foreground">{dep.license}</span>
                          </td>
                          <td className="p-4">
                            <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-1 rounded">
                              {dep.category}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center space-x-2">
                              <Link
                                href={dep.homepage}
                                target="_blank"
                                className="text-xs text-muted-foreground hover:text-primary"
                                title="Homepage"
                              >
                                <Globe className="h-3 w-3" />
                              </Link>
                              <Link
                                href={dep.repository}
                                target="_blank"
                                className="text-xs text-muted-foreground hover:text-primary"
                                title="Repository"
                              >
                                <Github className="h-3 w-3" />
                              </Link>
                              <button
                                className="text-xs text-muted-foreground hover:text-primary"
                                title="View License"
                              >
                                <Eye className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* License Text Examples */}
      <section className="py-16 bg-muted/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">Common Licenses</h2>
              <p className="text-sm text-muted-foreground">
                Full text of the most common licenses used by our dependencies
              </p>
            </div>

            <div className="space-y-8">
              {/* MIT License */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>MIT License</span>
                    <Button variant="outline" size="sm">
                      <Copy className="h-3 w-3 mr-2" />
                      Copy
                    </Button>
                  </CardTitle>
                  <CardDescription>
                    Used by {licenseTypes.find(l => l.name === 'MIT License')?.count} packages
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted p-4 rounded-lg font-mono text-xs leading-relaxed text-muted-foreground">
                    <p className="mb-3">
                      MIT License
                    </p>
                    <p className="mb-3">
                      Copyright (c) [year] [fullname]
                    </p>
                    <p className="mb-3">
                      Permission is hereby granted, free of charge, to any person obtaining a copy
                      of this software and associated documentation files (the "Software"), to deal
                      in the Software without restriction, including without limitation the rights
                      to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
                      copies of the Software, and to permit persons to whom the Software is
                      furnished to do so, subject to the following conditions:
                    </p>
                    <p className="mb-3">
                      The above copyright notice and this permission notice shall be included in all
                      copies or substantial portions of the Software.
                    </p>
                    <p>
                      THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
                      IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
                      FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
                      AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
                      LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
                      OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
                      SOFTWARE.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Apache 2.0 License */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Apache License 2.0</span>
                    <Button variant="outline" size="sm">
                      <Copy className="h-3 w-3 mr-2" />
                      Copy
                    </Button>
                  </CardTitle>
                  <CardDescription>
                    Used by {licenseTypes.find(l => l.name === 'Apache 2.0')?.count} packages
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted p-4 rounded-lg font-mono text-xs leading-relaxed text-muted-foreground">
                    <p className="mb-3">
                      Apache License Version 2.0, January 2004
                    </p>
                    <p className="mb-3">
                      Licensed under the Apache License, Version 2.0 (the "License");
                      you may not use this file except in compliance with the License.
                      You may obtain a copy of the License at
                    </p>
                    <p className="mb-3 text-blue-600 dark:text-blue-400">
                      http://www.apache.org/licenses/LICENSE-2.0
                    </p>
                    <p>
                      Unless required by applicable law or agreed to in writing, software
                      distributed under the License is distributed on an "AS IS" BASIS,
                      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
                      See the License for the specific language governing permissions and
                      limitations under the License.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Contact & Support */}
      <section className="py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="h-5 w-5 text-primary" />
                  <span>Questions About Licenses?</span>
                </CardTitle>
                <CardDescription>
                  Contact our legal team for license compliance questions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Mail className="h-4 w-4 text-primary" />
                      <span className="text-sm text-foreground">legal@enterprise.com</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Phone className="h-4 w-4 text-primary" />
                      <span className="text-sm text-foreground">+1 (555) 123-4567</span>
                    </div>
                    <div className="flex items-start space-x-2">
                      <MapPin className="h-4 w-4 text-primary mt-0.5" />
                      <div className="text-sm text-foreground">
                        <div>Enterprise Platform Inc.</div>
                        <div>Legal & Compliance</div>
                        <div>123 Business Street</div>
                        <div>San Francisco, CA 94105</div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-blue-100/50 dark:bg-blue-900/20 p-4 rounded-lg">
                    <h4 className="text-sm font-semibold mb-2 text-foreground">License Compliance</h4>
                    <p className="text-xs text-muted-foreground mb-3">
                      We take open source license compliance seriously. All dependencies are
                      regularly audited for license compatibility and compliance.
                    </p>
                    <div className="space-y-2">
                      <Button size="sm" className="w-full">
                        <Download className="h-3 w-3 mr-2" />
                        Download License Report
                      </Button>
                      <Button variant="outline" size="sm" className="w-full">
                        <FileText className="h-3 w-3 mr-2" />
                        View License Policy
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-primary">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-black mb-4">
            Supporting Open Source
          </h2>
          <p className="text-sm text-black/80 mb-8 max-w-2xl mx-auto">
            We're committed to contributing back to the open source community that has made our platform possible.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button variant="secondary" size="lg">
              <Github className="mr-2 h-4 w-4" />
              View Our Contributions
            </Button>
            <Button variant="outline" size="lg" className="bg-black/10 border-black/20 hover:bg-black/20">
              <Heart className="mr-2 h-4 w-4" />
              Sponsor Projects
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}