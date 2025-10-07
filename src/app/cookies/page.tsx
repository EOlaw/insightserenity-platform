import Link from 'next/link'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card'
import {
  Cookie,
  Settings,
  Shield,
  Eye,
  BarChart3,
  Target,
  Calendar,
  Download,
  ArrowLeft,
  ExternalLink,
  CheckCircle,
  XCircle,
  Mail,
  Toggle,
  AlertTriangle,
  Info,
  Clock,
  Globe,
  Lock,
  Users,
  Building2,
  Phone,
  MapPin,
  RefreshCw,
} from 'lucide-react'

const cookieTypes = [
  {
    id: 'essential',
    title: 'Essential Cookies',
    icon: Shield,
    description: 'Required for basic website functionality and security',
    required: true,
    examples: [
      'User authentication tokens',
      'Session management',
      'Security preferences',
      'Load balancing',
    ],
    retention: 'Session or 1 year',
    count: 8,
  },
  {
    id: 'functional',
    title: 'Functional Cookies',
    icon: Settings,
    description: 'Enable enhanced functionality and personalization',
    required: false,
    examples: [
      'Language preferences',
      'Theme settings',
      'Region selection',
      'Accessibility options',
    ],
    retention: '1 year',
    count: 12,
  },
  {
    id: 'analytics',
    title: 'Analytics Cookies',
    icon: BarChart3,
    description: 'Help us understand how visitors use our website',
    required: false,
    examples: [
      'Page views and traffic',
      'User behavior tracking',
      'Performance monitoring',
      'Error reporting',
    ],
    retention: '2 years',
    count: 6,
  },
  {
    id: 'marketing',
    title: 'Marketing Cookies',
    icon: Target,
    description: 'Used for advertising and marketing purposes',
    required: false,
    examples: [
      'Ad personalization',
      'Campaign tracking',
      'Social media integration',
      'Cross-site tracking',
    ],
    retention: '1 year',
    count: 15,
  },
]

const thirdPartyProviders = [
  {
    name: 'Google Analytics',
    purpose: 'Website analytics and user behavior tracking',
    cookies: ['_ga', '_gid', '_gat'],
    retention: '2 years',
    privacyUrl: 'https://policies.google.com/privacy',
  },
  {
    name: 'Intercom',
    purpose: 'Customer support and messaging',
    cookies: ['intercom-*'],
    retention: '1 year',
    privacyUrl: 'https://www.intercom.com/legal/privacy',
  },
  {
    name: 'Stripe',
    purpose: 'Payment processing and fraud prevention',
    cookies: ['__stripe_*'],
    retention: 'Session',
    privacyUrl: 'https://stripe.com/privacy',
  },
  {
    name: 'Cloudflare',
    purpose: 'CDN and security services',
    cookies: ['__cf_bm', '__cflb'],
    retention: '30 minutes',
    privacyUrl: 'https://www.cloudflare.com/privacypolicy/',
  },
]

export default function CookiesPage() {
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
                Download PDF
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
              <Cookie className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6">
              Cookie Policy
            </h1>
            <p className="text-base text-gray-600 mb-8">
              Learn about how we use cookies and similar technologies to improve your experience
              and provide our services.
            </p>
            <div className="flex items-center justify-center gap-4 text-sm text-gray-500">
              <span className="flex items-center">
                <Calendar className="h-4 w-4 mr-1" />
                Last updated: December 2024
              </span>
              <span className="flex items-center">
                <Cookie className="h-4 w-4 mr-1" />
                Version 1.3
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Cookie Banner Simulation */}
      <section className="py-8 bg-blue-50 border-y border-blue-200">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-lg p-6 shadow-lg border">
              <div className="flex items-start space-x-4">
                <Cookie className="h-8 w-8 text-primary flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-2">We use cookies to enhance your experience</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    This website uses cookies to ensure you get the best experience. You can customize
                    your cookie preferences or accept all cookies.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button size="sm">Accept All</Button>
                    <Button variant="outline" size="sm">Customize</Button>
                    <Button variant="ghost" size="sm">Reject Non-Essential</Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Cookie Controls */}
      <section className="py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">Cookie Preferences</h2>
              <p className="text-sm text-gray-600">
                Control which cookies we can use to improve your experience
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {cookieTypes.map((type) => {
                const Icon = type.icon
                return (
                  <Card key={type.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                            <Icon className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <CardTitle className="text-base">{type.title}</CardTitle>
                            <span className="text-xs text-gray-500">{type.count} cookies</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {type.required ? (
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                              Required
                            </span>
                          ) : (
                            <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
                              <span className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform translate-x-1" />
                            </button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-gray-600 mb-3">{type.description}</p>
                      <div className="space-y-2">
                        <div className="text-xs text-gray-500">
                          <strong>Retention:</strong> {type.retention}
                        </div>
                        <div>
                          <p className="text-xs font-medium mb-1">Examples:</p>
                          <ul className="space-y-1">
                            {type.examples.map((example, idx) => (
                              <li key={idx} className="text-xs text-gray-600 flex items-center">
                                <div className="w-1 h-1 bg-gray-400 rounded-full mr-2" />
                                {example}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            <div className="mt-8 text-center">
              <div className="flex flex-wrap justify-center gap-3">
                <Button>Save Preferences</Button>
                <Button variant="outline">Accept All</Button>
                <Button variant="ghost">Reset to Defaults</Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              {/* Table of Contents */}
              <aside className="lg:col-span-1">
                <Card className="sticky top-20">
                  <CardHeader>
                    <CardTitle className="text-base">Table of Contents</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <nav className="space-y-2">
                      {[
                        'What Are Cookies',
                        'Why We Use Cookies',
                        'Types of Cookies',
                        'Third-Party Cookies',
                        'Cookie Management',
                        'Updates to Policy',
                        'Contact Information',
                      ].map((item, index) => (
                        <Link
                          key={index}
                          href={`#section-${index + 1}`}
                          className="block text-xs text-gray-600 hover:text-primary py-1"
                        >
                          {item}
                        </Link>
                      ))}
                    </nav>
                  </CardContent>
                </Card>
              </aside>

              {/* Content */}
              <div className="lg:col-span-3 space-y-8">
                {/* What Are Cookies */}
                <Card id="section-1">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Info className="h-5 w-5 text-primary" />
                      <span>1. What Are Cookies</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-gray-700">
                      Cookies are small text files that are stored on your device when you visit our website.
                      They help us provide you with a better experience by remembering your preferences and
                      understanding how you use our site.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <h4 className="text-sm font-semibold mb-2 flex items-center">
                          <Globe className="h-4 w-4 text-blue-600 mr-2" />
                          First-Party Cookies
                        </h4>
                        <p className="text-xs text-gray-700">
                          Set directly by our website to enable core functionality and remember your preferences.
                        </p>
                      </div>
                      <div className="bg-green-50 p-4 rounded-lg">
                        <h4 className="text-sm font-semibold mb-2 flex items-center">
                          <Users className="h-4 w-4 text-green-600 mr-2" />
                          Third-Party Cookies
                        </h4>
                        <p className="text-xs text-gray-700">
                          Set by external services we use for analytics, support, and other features.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Why We Use Cookies */}
                <Card id="section-2">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Target className="h-5 w-5 text-primary" />
                      <span>2. Why We Use Cookies</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-gray-700">
                      We use cookies for several important purposes to enhance your experience:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        {
                          title: 'Essential Functionality',
                          description: 'Keep you logged in and remember your settings',
                          icon: Lock,
                        },
                        {
                          title: 'Improve Performance',
                          description: 'Monitor site performance and fix issues',
                          icon: BarChart3,
                        },
                        {
                          title: 'Personalize Experience',
                          description: 'Remember your preferences and language',
                          icon: Settings,
                        },
                        {
                          title: 'Security',
                          description: 'Protect against fraud and unauthorized access',
                          icon: Shield,
                        },
                      ].map((purpose, index) => {
                        const Icon = purpose.icon
                        return (
                          <div key={index} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                            <Icon className="h-4 w-4 text-primary mt-0.5" />
                            <div>
                              <h4 className="text-sm font-semibold">{purpose.title}</h4>
                              <p className="text-xs text-gray-600">{purpose.description}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Third-Party Cookies */}
                <Card id="section-4">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Globe className="h-5 w-5 text-primary" />
                      <span>4. Third-Party Cookies</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-gray-700">
                      We work with trusted third-party services that may set their own cookies:
                    </p>
                    <div className="space-y-4">
                      {thirdPartyProviders.map((provider, index) => (
                        <div key={index} className="border rounded-lg p-4">
                          <div className="flex items-start justify-between mb-2">
                            <h4 className="text-sm font-semibold">{provider.name}</h4>
                            <Link
                              href={provider.privacyUrl}
                              target="_blank"
                              className="text-xs text-primary hover:underline flex items-center"
                            >
                              Privacy Policy
                              <ExternalLink className="h-3 w-3 ml-1" />
                            </Link>
                          </div>
                          <p className="text-xs text-gray-600 mb-2">{provider.purpose}</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            <div>
                              <span className="font-medium">Cookies:</span> {provider.cookies.join(', ')}
                            </div>
                            <div>
                              <span className="font-medium">Retention:</span> {provider.retention}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Cookie Management */}
                <Card id="section-5">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Settings className="h-5 w-5 text-primary" />
                      <span>5. Cookie Management</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-gray-700">
                      You have several options to control cookies on our website:
                    </p>
                    <div className="space-y-4">
                      <div className="border-l-4 border-blue-500 pl-4">
                        <h4 className="text-sm font-semibold mb-1">Cookie Preferences</h4>
                        <p className="text-xs text-gray-600">
                          Use our cookie preference center (shown above) to enable or disable
                          different types of cookies.
                        </p>
                      </div>
                      <div className="border-l-4 border-green-500 pl-4">
                        <h4 className="text-sm font-semibold mb-1">Browser Settings</h4>
                        <p className="text-xs text-gray-600">
                          Configure your browser to block or delete cookies. Note that this may
                          affect website functionality.
                        </p>
                      </div>
                      <div className="border-l-4 border-purple-500 pl-4">
                        <h4 className="text-sm font-semibold mb-1">Opt-out Tools</h4>
                        <p className="text-xs text-gray-600">
                          Use industry opt-out tools for advertising cookies and tracking.
                        </p>
                      </div>
                    </div>
                    <div className="bg-yellow-50 p-4 rounded-lg">
                      <h4 className="text-sm font-semibold mb-1 flex items-center text-yellow-800">
                        <AlertTriangle className="h-4 w-4 mr-2" />
                        Important Note
                      </h4>
                      <p className="text-xs text-yellow-700">
                        Disabling cookies may limit your ability to use certain features of our website.
                        Essential cookies cannot be disabled as they are required for basic functionality.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Updates to Policy */}
                <Card id="section-6">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <RefreshCw className="h-5 w-5 text-primary" />
                      <span>6. Updates to This Policy</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-gray-700">
                      We may update this Cookie Policy from time to time to reflect changes in our
                      practices or legal requirements.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="text-sm font-semibold mb-2">Notification</h4>
                        <ul className="space-y-1 text-xs text-gray-600">
                          <li>• Email notification for major changes</li>
                          <li>• Website banner for minor updates</li>
                          <li>• Updated policy posted on this page</li>
                        </ul>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="text-sm font-semibold mb-2">Your Options</h4>
                        <ul className="space-y-1 text-xs text-gray-600">
                          <li>• Review changes when notified</li>
                          <li>• Update your cookie preferences</li>
                          <li>• Contact us with questions</li>
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Contact Information */}
                <Card id="section-7">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Mail className="h-5 w-5 text-primary" />
                      <span>7. Contact Information</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-gray-700">
                      If you have questions about our use of cookies, please contact us:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div className="flex items-center space-x-2">
                          <Mail className="h-4 w-4 text-primary" />
                          <span className="text-sm">privacy@enterprise.com</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Phone className="h-4 w-4 text-primary" />
                          <span className="text-sm">+1 (555) 123-4567</span>
                        </div>
                        <div className="flex items-start space-x-2">
                          <MapPin className="h-4 w-4 text-primary mt-0.5" />
                          <div className="text-sm">
                            <div>Enterprise Platform Inc.</div>
                            <div>Privacy Team</div>
                            <div>123 Business Street</div>
                            <div>San Francisco, CA 94105</div>
                          </div>
                        </div>
                      </div>
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <h4 className="text-sm font-semibold mb-2">Quick Actions</h4>
                        <div className="space-y-2">
                          <Button size="sm" className="w-full">
                            <Settings className="h-3 w-3 mr-2" />
                            Manage Cookie Preferences
                          </Button>
                          <Button variant="outline" size="sm" className="w-full">
                            <Download className="h-3 w-3 mr-2" />
                            Download Cookie Data
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-primary">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-black mb-4">
            Take Control of Your Privacy
          </h2>
          <p className="text-sm text-black/80 mb-8 max-w-2xl mx-auto">
            Manage your cookie preferences and privacy settings to customize your experience.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button variant="secondary" size="lg">
              <Settings className="mr-2 h-4 w-4" />
              Cookie Settings
            </Button>
            <Button variant="outline" size="lg" className="bg-black/10 border-black/20 hover:bg-black/20">
              <Shield className="mr-2 h-4 w-4" />
              Privacy Center
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
