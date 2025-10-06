'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Shield,
  Lock,
  Eye,
  FileText,
  Info,
  Mail,
  Phone,
  Globe,
  Building2,
  Calendar,
  ChevronRight,
  Download,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Users,
  Database,
  Server,
  Key,
  UserCheck,
  Settings,
  Trash2,
  RefreshCw,
  MapPin,
  Scale,
  BookOpen,
} from 'lucide-react'

const privacySections = [
  {
    title: 'Information We Collect',
    content: [
      {
        subtitle: 'Information You Provide',
        items: [
          'Account information (name, email, phone number)',
          'Payment and billing information',
          'Profile information and preferences',
          'Communications and support requests',
          'User-generated content and files',
        ],
      },
      {
        subtitle: 'Information We Collect Automatically',
        items: [
          'Usage data and analytics',
          'Device and browser information',
          'IP address and location data',
          'Cookies and similar technologies',
          'Log files and error reports',
        ],
      },
      {
        subtitle: 'Information from Third Parties',
        items: [
          'Social media profiles (when you connect accounts)',
          'Third-party integrations and partners',
          'Public databases and sources',
        ],
      },
    ],
  },
  {
    title: 'How We Use Your Information',
    content: [
      {
        subtitle: 'To Provide Our Services',
        items: [
          'Create and manage your account',
          'Process transactions and payments',
          'Provide customer support',
          'Send service-related communications',
          'Enable platform features and functionality',
        ],
      },
      {
        subtitle: 'To Improve Our Services',
        items: [
          'Analyze usage patterns and trends',
          'Develop new features and products',
          'Conduct research and testing',
          'Personalize your experience',
          'Optimize performance and reliability',
        ],
      },
      {
        subtitle: 'For Legal and Security Purposes',
        items: [
          'Comply with legal obligations',
          'Protect against fraud and abuse',
          'Enforce our terms of service',
          'Respond to legal requests',
          'Ensure platform security',
        ],
      },
    ],
  },
  {
    title: 'Information Sharing',
    content: [
      {
        subtitle: 'We Do Not Sell Your Data',
        items: [
          'We never sell your personal information to third parties',
          'We do not share your data for advertising purposes',
          'Your data remains under your control',
        ],
      },
      {
        subtitle: 'When We May Share Information',
        items: [
          'With your consent or at your direction',
          'With service providers who assist our operations',
          'For legal compliance and law enforcement requests',
          'In connection with business transfers or acquisitions',
          'To protect rights, safety, and property',
        ],
      },
    ],
  },
  {
    title: 'Data Security',
    content: [
      {
        subtitle: 'Security Measures',
        items: [
          'End-to-end encryption for sensitive data',
          'Regular security audits and assessments',
          'Access controls and authentication',
          'Secure data centers and infrastructure',
          'Employee training and confidentiality agreements',
        ],
      },
      {
        subtitle: 'Incident Response',
        items: [
          'Immediate notification of data breaches',
          'Investigation and remediation procedures',
          'Regular security updates and patches',
          'Continuous monitoring and threat detection',
        ],
      },
    ],
  },
  {
    title: 'Your Rights and Choices',
    content: [
      {
        subtitle: 'Your Privacy Rights',
        items: [
          'Access your personal information',
          'Correct or update your data',
          'Delete your account and data',
          'Export your data in portable formats',
          'Opt-out of certain data processing',
          'Lodge complaints with supervisory authorities',
        ],
      },
      {
        subtitle: 'Communication Preferences',
        items: [
          'Manage email notifications and subscriptions',
          'Control marketing communications',
          'Set privacy preferences in your account',
          'Opt-out of analytics and tracking',
        ],
      },
    ],
  },
  {
    title: 'International Data Transfers',
    content: [
      {
        subtitle: 'Global Operations',
        items: [
          'Data may be processed in multiple countries',
          'Standard contractual clauses for EU data transfers',
          'Privacy Shield framework compliance',
          'Adequate safeguards for international transfers',
        ],
      },
    ],
  },
  {
    title: 'Children\'s Privacy',
    content: [
      {
        subtitle: 'Age Restrictions',
        items: [
          'Our services are not directed to children under 13',
          'We do not knowingly collect children\'s data',
          'Parental consent required for minors',
          'Special protections for student data (COPPA/FERPA)',
        ],
      },
    ],
  },
  {
    title: 'Data Retention',
    content: [
      {
        subtitle: 'Retention Periods',
        items: [
          'Active account data retained while account is active',
          'Deleted data removed within 30 days',
          'Backup retention for 90 days',
          'Legal hold data retained as required by law',
          'Analytics data aggregated and anonymized',
        ],
      },
    ],
  },
]

const gdprRights = [
  { right: 'Right to Access', description: 'Request a copy of your personal data' },
  { right: 'Right to Rectification', description: 'Correct inaccurate personal data' },
  { right: 'Right to Erasure', description: 'Request deletion of your data' },
  { right: 'Right to Restrict Processing', description: 'Limit how we use your data' },
  { right: 'Right to Data Portability', description: 'Receive your data in a portable format' },
  { right: 'Right to Object', description: 'Object to certain processing activities' },
]

const ccpaRights = [
  { right: 'Right to Know', description: 'Information about data collection and use' },
  { right: 'Right to Delete', description: 'Request deletion of personal information' },
  { right: 'Right to Opt-Out', description: 'Opt-out of sale of personal information' },
  { right: 'Right to Non-Discrimination', description: 'Equal service regardless of privacy choices' },
]

export default function PrivacyPage() {
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
                <Link href="/privacy" className="text-xs text-primary font-medium">
                  Privacy
                </Link>
                <Link href="/terms" className="text-xs text-gray-600 hover:text-gray-900 transition">
                  Terms
                </Link>
                <Link href="/cookies" className="text-xs text-gray-600 hover:text-gray-900 transition">
                  Cookies
                </Link>
                <Link href="/security" className="text-xs text-gray-600 hover:text-gray-900 transition">
                  Security
                </Link>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Button variant="ghost" size="sm">
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
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center space-x-2 mb-4">
              <Shield className="h-6 w-6 text-primary" />
              <span className="text-sm text-gray-600">Privacy Policy</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6">
              Your Privacy Matters to Us
            </h1>
            <p className="text-base text-gray-600 mb-6">
              At Enterprise Platform, we are committed to protecting your privacy and ensuring
              the security of your personal information. This Privacy Policy explains how we
              collect, use, and safeguard your data.
            </p>
            <div className="flex items-center space-x-6 text-sm text-gray-500">
              <span>Effective Date: January 1, 2024</span>
              <span>Last Updated: January 22, 2024</span>
              <span>Version: 2.3</span>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Navigation */}
      <section className="py-8 border-b sticky top-16 bg-white z-40">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap gap-2 justify-center">
            {privacySections.map((section) => (
              <Link
                key={section.title}
                href={`#${section.title.toLowerCase().replace(/\s+/g, '-')}`}
                className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-full transition"
              >
                {section.title}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Privacy Sections */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            {privacySections.map((section, index) => (
              <div
                key={index}
                id={section.title.toLowerCase().replace(/\s+/g, '-')}
                className="mb-12 scroll-mt-24"
              >
                <h2 className="text-2xl font-bold mb-6">{section.title}</h2>
                {section.content.map((subsection, subIndex) => (
                  <div key={subIndex} className="mb-6">
                    {subsection.subtitle && (
                      <h3 className="text-lg font-semibold mb-3">{subsection.subtitle}</h3>
                    )}
                    <ul className="space-y-2">
                      {subsection.items.map((item, itemIndex) => (
                        <li key={itemIndex} className="flex items-start space-x-2">
                          <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span className="text-sm text-gray-700">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GDPR & CCPA Rights */}
      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold mb-8 text-center">Regional Privacy Rights</h2>

            <div className="grid md:grid-cols-2 gap-8">
              {/* GDPR Rights */}
              <Card>
                <CardHeader>
                  <div className="flex items-center space-x-2">
                    <Globe className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">GDPR Rights (EU)</CardTitle>
                  </div>
                  <CardDescription className="text-xs">
                    For users in the European Union
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {gdprRights.map((item, index) => (
                      <li key={index}>
                        <p className="text-sm font-medium">{item.right}</p>
                        <p className="text-xs text-gray-600">{item.description}</p>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* CCPA Rights */}
              <Card>
                <CardHeader>
                  <div className="flex items-center space-x-2">
                    <MapPin className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">CCPA Rights (California)</CardTitle>
                  </div>
                  <CardDescription className="text-xs">
                    For California residents
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {ccpaRights.map((item, index) => (
                      <li key={index}>
                        <p className="text-sm font-medium">{item.right}</p>
                        <p className="text-xs text-gray-600">{item.description}</p>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Information */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle>Contact Our Privacy Team</CardTitle>
                <CardDescription className="text-xs">
                  For privacy-related questions, requests, or concerns
                </CardDescription>
              </CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold text-sm mb-3">Privacy Office</h3>
                  <div className="space-y-2 text-sm text-gray-600">
                    <p className="flex items-center">
                      <Mail className="h-4 w-4 mr-2" />
                      privacy@enterprise.com
                    </p>
                    <p className="flex items-center">
                      <Phone className="h-4 w-4 mr-2" />
                      +1 (800) 555-PRIVACY
                    </p>
                    <p className="flex items-start">
                      <Building2 className="h-4 w-4 mr-2 mt-0.5" />
                      <span>
                        Enterprise Platform, Inc.<br />
                        Privacy Department<br />
                        100 Market Street, Suite 500<br />
                        San Francisco, CA 94105
                      </span>
                    </p>
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-sm mb-3">Data Protection Officer</h3>
                  <div className="space-y-2 text-sm text-gray-600">
                    <p className="flex items-center">
                      <Mail className="h-4 w-4 mr-2" />
                      dpo@enterprise.com
                    </p>
                    <p className="flex items-start">
                      <Building2 className="h-4 w-4 mr-2 mt-0.5" />
                      <span>
                        EU Representative<br />
                        Enterprise Platform EU Ltd.<br />
                        25 Old Broad Street<br />
                        London EC2N 1HN, UK
                      </span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Updates Section */}
      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl font-bold mb-4">Policy Updates</h2>
            <p className="text-sm text-gray-600 mb-8">
              We may update this Privacy Policy from time to time. We will notify you of any
              changes by posting the new Privacy Policy on this page and updating the
              "Last Updated" date.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button variant="outline">
                <Bell className="mr-2 h-3.5 w-3.5" />
                Subscribe to Updates
              </Button>
              <Link href="/privacy/archive">
                <Button variant="ghost">
                  View Previous Versions
                  <ChevronRight className="ml-2 h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
