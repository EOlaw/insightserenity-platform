import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card'
import {
  Shield,
  Lock,
  Eye,
  Database,
  Globe,
  UserCheck,
  Mail,
  Cookie,
  FileText,
  Calendar,
  ArrowLeft,
  ExternalLink,
  Download,
  Bell,
  Settings,
  AlertTriangle,
  Info,
  CheckCircle,
  Users,
  Building2,
  Phone,
  MapPin,
} from 'lucide-react'

const privacyHighlights = [
  {
    icon: Lock,
    title: 'Data Encryption',
    description: 'All data is encrypted in transit and at rest using industry-standard AES-256 encryption.',
  },
  {
    icon: UserCheck,
    title: 'User Control',
    description: 'You have full control over your data with options to view, edit, or delete at any time.',
  },
  {
    icon: Shield,
    title: 'GDPR Compliant',
    description: 'We are fully compliant with GDPR, CCPA, and other international privacy regulations.',
  },
  {
    icon: Eye,
    title: 'Transparent Processing',
    description: 'We clearly explain what data we collect, why we collect it, and how we use it.',
  },
]

const dataTypes = [
  {
    category: 'Account Information',
    icon: UserCheck,
    items: [
      'Name and email address',
      'Profile picture',
      'Organization details',
      'Account preferences',
    ],
  },
  {
    category: 'Usage Data',
    icon: Database,
    items: [
      'Feature usage analytics',
      'Performance metrics',
      'Error logs',
      'Session information',
    ],
  },
  {
    category: 'Communication Data',
    icon: Mail,
    items: [
      'Support conversations',
      'Email communications',
      'Notification preferences',
      'Feedback and surveys',
    ],
  },
  {
    category: 'Technical Data',
    icon: Settings,
    items: [
      'IP address and location',
      'Device and browser info',
      'Cookies and similar technologies',
      'API usage logs',
    ],
  },
]

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <Logo href="/" showText={false} />
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
      <section className="bg-gradient-to-b from-muted/50 to-background py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-6">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6 text-foreground">
              Privacy Policy
            </h1>
            <p className="text-base text-muted-foreground mb-8">
              Your privacy is important to us. This policy explains how we collect, use,
              and protect your personal information.
            </p>
            <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center">
                <Calendar className="h-4 w-4 mr-1" />
                Last updated: December 2024
              </span>
              <span className="flex items-center">
                <FileText className="h-4 w-4 mr-1" />
                Version 3.2
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Privacy Highlights */}
      <section className="py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">Our Privacy Commitments</h2>
              <p className="text-sm text-muted-foreground">
                We are committed to protecting your privacy and being transparent about our practices
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {privacyHighlights.map((highlight, index) => {
                const Icon = highlight.icon
                return (
                  <Card key={index} className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-6 text-center">
                      <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="font-semibold mb-2 text-foreground">{highlight.title}</h3>
                      <p className="text-xs text-muted-foreground">{highlight.description}</p>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-16 bg-muted/50">
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
                        'Information We Collect',
                        'How We Use Information',
                        'Information Sharing',
                        'Data Security',
                        'Your Rights',
                        'Cookies & Tracking',
                        'International Transfers',
                        'Data Retention',
                        'Children\'s Privacy',
                        'Contact Information',
                      ].map((item, index) => (
                        <Link
                          key={index}
                          href={`#section-${index + 1}`}
                          className="block text-xs text-muted-foreground hover:text-primary py-1"
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
                {/* Information We Collect */}
                <Card id="section-1">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Database className="h-5 w-5 text-primary" />
                      <span>1. Information We Collect</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <p className="text-sm text-foreground">
                      We collect information you provide directly to us, information we obtain automatically
                      when you use our services, and information from third parties.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {dataTypes.map((type, index) => {
                        const Icon = type.icon
                        return (
                          <div key={index} className="border border-border rounded-lg p-4">
                            <div className="flex items-center space-x-2 mb-3">
                              <Icon className="h-4 w-4 text-primary" />
                              <h4 className="text-sm font-semibold text-foreground">{type.category}</h4>
                            </div>
                            <ul className="space-y-1">
                              {type.items.map((item, idx) => (
                                <li key={idx} className="text-xs text-muted-foreground flex items-center">
                                  <div className="w-1 h-1 bg-muted-foreground rounded-full mr-2" />
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* How We Use Information */}
                <Card id="section-2">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Settings className="h-5 w-5 text-primary" />
                      <span>2. How We Use Information</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-foreground">
                      We use the information we collect for the following purposes:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        'Provide and maintain our services',
                        'Process transactions and send confirmations',
                        'Communicate with you about our services',
                        'Improve and optimize our platform',
                        'Ensure security and prevent fraud',
                        'Comply with legal obligations',
                        'Provide customer support',
                        'Send marketing communications (with consent)',
                      ].map((purpose, index) => (
                        <div key={index} className="flex items-start space-x-2">
                          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5" />
                          <span className="text-xs text-foreground">{purpose}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Information Sharing */}
                <Card id="section-3">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Users className="h-5 w-5 text-primary" />
                      <span>3. Information Sharing</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-foreground">
                      We do not sell, trade, or otherwise transfer your personal information to third parties
                      except in the following circumstances:
                    </p>
                    <div className="space-y-3">
                      <div className="border-l-4 border-blue-500 dark:border-blue-400 pl-4">
                        <h4 className="text-sm font-semibold mb-1 text-foreground">Service Providers</h4>
                        <p className="text-xs text-muted-foreground">
                          We may share information with trusted third-party service providers who assist us
                          in operating our platform, conducting business, or serving users.
                        </p>
                      </div>
                      <div className="border-l-4 border-yellow-500 dark:border-yellow-400 pl-4">
                        <h4 className="text-sm font-semibold mb-1 text-foreground">Legal Requirements</h4>
                        <p className="text-xs text-muted-foreground">
                          We may disclose information when required by law, court order, or governmental request.
                        </p>
                      </div>
                      <div className="border-l-4 border-red-500 dark:border-red-400 pl-4">
                        <h4 className="text-sm font-semibold mb-1 text-foreground">Business Transfers</h4>
                        <p className="text-xs text-muted-foreground">
                          In the event of a merger, acquisition, or sale of assets, user information may be transferred.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Data Security */}
                <Card id="section-4">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Lock className="h-5 w-5 text-primary" />
                      <span>4. Data Security</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-foreground">
                      We implement robust security measures to protect your personal information:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="text-sm font-semibold mb-2 text-foreground">Technical Safeguards</h4>
                        <ul className="space-y-1">
                          {[
                            'AES-256 encryption',
                            'TLS 1.3 for data in transit',
                            'Regular security audits',
                            'Intrusion detection systems',
                          ].map((item, idx) => (
                            <li key={idx} className="text-xs text-muted-foreground flex items-center">
                              <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400 mr-2" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold mb-2 text-foreground">Operational Safeguards</h4>
                        <ul className="space-y-1">
                          {[
                            'Access controls and permissions',
                            'Employee security training',
                            'Background checks',
                            'Incident response procedures',
                          ].map((item, idx) => (
                            <li key={idx} className="text-xs text-muted-foreground flex items-center">
                              <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400 mr-2" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Your Rights */}
                <Card id="section-5">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <UserCheck className="h-5 w-5 text-primary" />
                      <span>5. Your Rights</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-foreground">
                      You have the following rights regarding your personal information:
                    </p>
                    <div className="space-y-4">
                      {[
                        {
                          title: 'Access',
                          description: 'Request a copy of the personal information we hold about you',
                          icon: Eye,
                        },
                        {
                          title: 'Rectification',
                          description: 'Request correction of inaccurate or incomplete information',
                          icon: Settings,
                        },
                        {
                          title: 'Erasure',
                          description: 'Request deletion of your personal information (right to be forgotten)',
                          icon: AlertTriangle,
                        },
                        {
                          title: 'Portability',
                          description: 'Request transfer of your data to another service provider',
                          icon: Download,
                        },
                        {
                          title: 'Objection',
                          description: 'Object to processing of your personal information',
                          icon: Bell,
                        },
                      ].map((right, index) => {
                        const Icon = right.icon
                        return (
                          <div key={index} className="flex items-start space-x-3 p-3 bg-muted/50 rounded-lg">
                            <Icon className="h-4 w-4 text-primary mt-0.5" />
                            <div>
                              <h4 className="text-sm font-semibold text-foreground">{right.title}</h4>
                              <p className="text-xs text-muted-foreground">{right.description}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Contact Information */}
                <Card id="section-10">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Mail className="h-5 w-5 text-primary" />
                      <span>10. Contact Information</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-foreground">
                      If you have questions about this Privacy Policy or our data practices, please contact us:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div className="flex items-center space-x-2">
                          <Mail className="h-4 w-4 text-primary" />
                          <span className="text-sm text-foreground">privacy@enterprise.com</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Phone className="h-4 w-4 text-primary" />
                          <span className="text-sm text-foreground">+1 (555) 123-4567</span>
                        </div>
                        <div className="flex items-start space-x-2">
                          <MapPin className="h-4 w-4 text-primary mt-0.5" />
                          <div className="text-sm text-foreground">
                            <div>Enterprise Platform Inc.</div>
                            <div>123 Business Street</div>
                            <div>San Francisco, CA 94105</div>
                          </div>
                        </div>
                      </div>
                      <div className="bg-blue-100/50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                        <h4 className="text-sm font-semibold mb-2 text-foreground">Data Protection Officer</h4>
                        <p className="text-xs text-muted-foreground mb-2">
                          For EU residents, you may also contact our Data Protection Officer:
                        </p>
                        <p className="text-xs text-foreground">dpo@enterprise.com</p>
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
            Questions About Privacy?
          </h2>
          <p className="text-sm text-black/80 mb-8 max-w-2xl mx-auto">
            Our privacy team is here to help. Contact us with any questions or concerns.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button variant="secondary" size="lg">
              <Mail className="mr-2 h-4 w-4" />
              Contact Privacy Team
            </Button>
            <Button variant="outline" size="lg" className="bg-black/10 border-black/20 hover:bg-black/20">
              <ExternalLink className="mr-2 h-4 w-4" />
              Privacy Portal
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}