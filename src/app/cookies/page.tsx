'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Cookie,
  Shield,
  Settings,
  Info,
  CheckCircle,
  XCircle,
  AlertCircle,
  Globe,
  Lock,
  Eye,
  Database,
  Server,
  Smartphone,
  Monitor,
  BarChart3,
  Users,
  Target,
  Clock,
  RefreshCw,
  Trash2,
  Download,
  ExternalLink,
  Mail,
  ChevronRight,
  Toggle,
  ToggleLeft,
  ToggleRight,
  Chrome,
  Compass,
  HardDrive,
} from 'lucide-react'

const cookieCategories = [
  {
    name: 'Essential Cookies',
    icon: Lock,
    required: true,
    description: 'Required for the website to function properly',
    purposes: [
      'User authentication and security',
      'Session management',
      'Load balancing and server allocation',
      'Security token storage',
      'Language and region preferences',
      'Cookie consent preferences',
    ],
    examples: [
      { name: 'session_id', duration: 'Session', purpose: 'Maintains user session' },
      { name: 'auth_token', duration: '7 days', purpose: 'Keeps you logged in' },
      { name: 'csrf_token', duration: 'Session', purpose: 'Security protection' },
      { name: 'cookie_consent', duration: '1 year', purpose: 'Stores cookie preferences' },
    ],
  },
  {
    name: 'Performance Cookies',
    icon: BarChart3,
    required: false,
    description: 'Help us understand how visitors interact with our website',
    purposes: [
      'Website performance monitoring',
      'Error tracking and debugging',
      'Page load time analysis',
      'Feature usage statistics',
      'A/B testing and optimization',
      'Server response monitoring',
    ],
    examples: [
      { name: '_ga', duration: '2 years', purpose: 'Google Analytics tracking' },
      { name: '_gid', duration: '24 hours', purpose: 'Google Analytics session' },
      { name: 'perf_metrics', duration: '30 days', purpose: 'Performance data' },
      { name: 'ab_test', duration: '90 days', purpose: 'A/B testing variant' },
    ],
  },
  {
    name: 'Functional Cookies',
    icon: Settings,
    required: false,
    description: 'Enable enhanced functionality and personalization',
    purposes: [
      'Remember user preferences',
      'Personalized user interface',
      'Recently viewed items',
      'Saved searches and filters',
      'Form auto-fill data',
      'Timezone and date format',
    ],
    examples: [
      { name: 'user_prefs', duration: '1 year', purpose: 'UI preferences' },
      { name: 'recent_items', duration: '30 days', purpose: 'Recently viewed' },
      { name: 'saved_filters', duration: '90 days', purpose: 'Search preferences' },
      { name: 'theme', duration: '1 year', purpose: 'Dark/light mode' },
    ],
  },
  {
    name: 'Marketing Cookies',
    icon: Target,
    required: false,
    description: 'Used to deliver relevant advertisements',
    purposes: [
      'Measure advertising effectiveness',
      'Deliver personalized ads',
      'Retargeting campaigns',
      'Social media integration',
      'Conversion tracking',
      'Audience insights',
    ],
    examples: [
      { name: 'fb_pixel', duration: '90 days', purpose: 'Facebook advertising' },
      { name: 'li_sugr', duration: '90 days', purpose: 'LinkedIn insights' },
      { name: 'google_ads', duration: '540 days', purpose: 'Google Ads tracking' },
      { name: 'utm_params', duration: '6 months', purpose: 'Campaign tracking' },
    ],
  },
]

const browserSettings = [
  {
    browser: 'Google Chrome',
    icon: Chrome,
    instructions: 'Settings > Privacy and security > Cookies and other site data',
    link: 'https://support.google.com/chrome/answer/95647',
  },
  {
    browser: 'Safari',
    icon: Compass,
    instructions: 'Preferences > Privacy > Manage Website Data',
    link: 'https://support.apple.com/guide/safari/manage-cookies-and-website-data-sfri11471/mac',
  },
  {
    browser: 'Firefox',
    icon: Globe,
    instructions: 'Settings > Privacy & Security > Cookies and Site Data',
    link: 'https://support.mozilla.org/en-US/kb/clear-cookies-and-site-data-firefox',
  },
  {
    browser: 'Microsoft Edge',
    icon: Globe,
    instructions: 'Settings > Privacy, search, and services > Cookies and site permissions',
    link: 'https://support.microsoft.com/en-us/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09',
  },
]

const thirdPartyServices = [
  {
    service: 'Google Analytics',
    purpose: 'Website analytics and performance',
    optOut: 'https://tools.google.com/dlpage/gaoptout',
  },
  {
    service: 'Facebook Pixel',
    purpose: 'Social media advertising',
    optOut: 'https://www.facebook.com/settings/?tab=ads',
  },
  {
    service: 'LinkedIn Insight',
    purpose: 'Professional network advertising',
    optOut: 'https://www.linkedin.com/psettings/guest-controls',
  },
  {
    service: 'Hotjar',
    purpose: 'User behavior analytics',
    optOut: 'https://www.hotjar.com/privacy/do-not-track/',
  },
  {
    service: 'Stripe',
    purpose: 'Payment processing',
    optOut: 'Essential service - cannot opt out',
  },
]

export default function CookiesPage() {
  const [expandedCategory, setExpandedCategory] = useState<string | null>('Essential Cookies')
  const [cookiePreferences, setCookiePreferences] = useState({
    essential: true,
    performance: true,
    functional: true,
    marketing: false,
  })

  const handlePreferenceChange = (category: string) => {
    if (category === 'essential') return // Can't disable essential cookies
    setCookiePreferences(prev => ({
      ...prev,
      [category]: !prev[category as keyof typeof prev],
    }))
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
                <Link href="/privacy" className="text-xs text-gray-600 hover:text-gray-900 transition">
                  Privacy
                </Link>
                <Link href="/terms" className="text-xs text-gray-600 hover:text-gray-900 transition">
                  Terms
                </Link>
                <Link href="/cookies" className="text-xs text-primary font-medium">
                  Cookies
                </Link>
                <Link href="/security" className="text-xs text-gray-600 hover:text-gray-900 transition">
                  Security
                </Link>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Button variant="ghost" size="sm">
                <Settings className="h-3.5 w-3.5 mr-2" />
                Cookie Settings
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-gray-50 to-white py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center space-x-2 mb-4">
              <Cookie className="h-6 w-6 text-primary" />
              <span className="text-sm text-gray-600">Cookie Policy</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6">
              How We Use Cookies
            </h1>
            <p className="text-base text-gray-600 mb-6">
              This Cookie Policy explains how Enterprise Platform uses cookies and similar
              technologies to recognize you when you visit our website. It explains what these
              technologies are and why we use them, as well as your rights to control our use of them.
            </p>
            <div className="flex items-center space-x-6 text-sm text-gray-500">
              <span>Effective Date: January 1, 2024</span>
              <span>Last Updated: January 22, 2024</span>
            </div>
          </div>
        </div>
      </section>

      {/* What Are Cookies */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle>What Are Cookies?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-700">
                  Cookies are small data files that are placed on your computer or mobile device
                  when you visit a website. Cookies are widely used by website owners in order to
                  make their websites work, or to work more efficiently, as well as to provide
                  reporting information.
                </p>
                <div className="grid md:grid-cols-2 gap-4 mt-6">
                  <div className="flex items-start space-x-3">
                    <HardDrive className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold">First-party cookies</p>
                      <p className="text-xs text-gray-600">
                        Set by the website you are visiting directly
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <Globe className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold">Third-party cookies</p>
                      <p className="text-xs text-gray-600">
                        Set by services we integrate with our website
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <Clock className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold">Session cookies</p>
                      <p className="text-xs text-gray-600">
                        Deleted when you close your browser
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <Database className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold">Persistent cookies</p>
                      <p className="text-xs text-gray-600">
                        Remain on your device for a set period
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Cookie Categories */}
      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold mb-8 text-center">Cookie Categories</h2>

            <div className="space-y-4">
              {cookieCategories.map((category) => {
                const Icon = category.icon
                const isExpanded = expandedCategory === category.name
                const preferenceKey = category.name.toLowerCase().split(' ')[0] as keyof typeof cookiePreferences
                const isEnabled = cookiePreferences[preferenceKey]

                return (
                  <Card key={category.name} className="overflow-hidden">
                    <CardHeader
                      className="cursor-pointer"
                      onClick={() => setExpandedCategory(isExpanded ? null : category.name)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                            <Icon className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <CardTitle className="text-base">{category.name}</CardTitle>
                            <CardDescription className="text-xs">
                              {category.description}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          {category.required ? (
                            <span className="text-xs px-2 py-1 bg-gray-100 rounded">Required</span>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handlePreferenceChange(preferenceKey)
                              }}
                              className={`p-1 rounded ${isEnabled ? 'text-green-600' : 'text-gray-400'}`}
                            >
                              {isEnabled ? (
                                <ToggleRight className="h-6 w-6" />
                              ) : (
                                <ToggleLeft className="h-6 w-6" />
                              )}
                            </button>
                          )}
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    {isExpanded && (
                      <CardContent>
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-sm font-semibold mb-2">Purposes:</h4>
                            <ul className="space-y-1">
                              {category.purposes.map((purpose, idx) => (
                                <li key={idx} className="flex items-start space-x-2">
                                  <CheckCircle className="h-3 w-3 text-green-600 mt-0.5" />
                                  <span className="text-xs text-gray-700">{purpose}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold mb-2">Examples:</h4>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b">
                                    <th className="text-left py-2">Cookie Name</th>
                                    <th className="text-left py-2">Duration</th>
                                    <th className="text-left py-2">Purpose</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {category.examples.map((example, idx) => (
                                    <tr key={idx} className="border-b">
                                      <td className="py-2 font-mono">{example.name}</td>
                                      <td className="py-2">{example.duration}</td>
                                      <td className="py-2">{example.purpose}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                )
              })}
            </div>

            {/* Save Preferences */}
            <div className="mt-6 text-center">
              <Button size="lg">
                Save Cookie Preferences
                <CheckCircle className="ml-2 h-4 w-4" />
              </Button>
              <p className="text-xs text-gray-500 mt-2">
                Your preferences will be saved for 1 year
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Third-Party Services */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold mb-8 text-center">Third-Party Services</h2>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-gray-700 mb-6">
                  We use the following third-party services that may set cookies on your device:
                </p>
                <div className="space-y-3">
                  {thirdPartyServices.map((service, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium">{service.service}</p>
                        <p className="text-xs text-gray-600">{service.purpose}</p>
                      </div>
                      {service.optOut !== 'Essential service - cannot opt out' ? (
                        <a
                          href={service.optOut}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center"
                        >
                          Opt-out
                          <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-gray-500">{service.optOut}</span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Managing Cookies */}
      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold mb-8 text-center">How to Manage Cookies</h2>

            <div className="grid md:grid-cols-2 gap-6 mb-8">
              {browserSettings.map((browser, index) => {
                const Icon = browser.icon
                return (
                  <Card key={index}>
                    <CardHeader>
                      <div className="flex items-center space-x-3">
                        <Icon className="h-5 w-5 text-primary" />
                        <CardTitle className="text-base">{browser.browser}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-gray-600 mb-3">{browser.instructions}</p>
                      <a
                        href={browser.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center"
                      >
                        View instructions
                        <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="pt-6">
                <div className="flex items-start space-x-3">
                  <Info className="h-5 w-5 text-blue-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-blue-900 mb-1">
                      Impact of Disabling Cookies
                    </p>
                    <p className="text-xs text-blue-800">
                      Please note that if you disable cookies, some features of our website may not
                      function properly. Essential cookies cannot be disabled as they are required
                      for the website to operate.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl font-bold mb-4">Questions About Our Cookie Policy?</h2>
            <p className="text-sm text-gray-600 mb-8">
              If you have any questions about how we use cookies or your privacy choices,
              please contact our privacy team.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/privacy">
                <Button variant="outline">
                  View Privacy Policy
                  <ChevronRight className="ml-2 h-3.5 w-3.5" />
                </Button>
              </Link>
              <a href="mailto:privacy@enterprise.com">
                <Button>
                  Contact Privacy Team
                  <Mail className="ml-2 h-3.5 w-3.5" />
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
