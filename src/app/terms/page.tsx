'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Scale,
  FileText,
  Shield,
  AlertCircle,
  CheckCircle,
  Info,
  Mail,
  Building2,
  Calendar,
  ChevronRight,
  Download,
  ExternalLink,
  Lock,
  Users,
  CreditCard,
  Globe,
  Gavel,
  BookOpen,
  AlertTriangle,
  Ban,
  UserCheck,
  Key,
  Database,
  Server,
  Clock,
  DollarSign,
  RefreshCw,
  XCircle,
} from 'lucide-react'

const termsSections = [
  {
    title: '1. Acceptance of Terms',
    content: `By accessing or using Enterprise Platform ("Service"), you agree to be bound by these Terms of Service ("Terms"). If you disagree with any part of these terms, you do not have permission to access the Service.

These Terms apply to all visitors, users, and others who access or use the Service. By accessing or using the Service, you agree to be bound by these Terms and our Privacy Policy.

We reserve the right to update and change these Terms at any time without notice. Continued use of the Service after any such changes constitutes your acceptance of the new Terms.`,
  },
  {
    title: '2. Account Registration',
    content: `When you create an account with us, you must provide information that is accurate, complete, and current at all times. You are responsible for safeguarding the password and for all activities that occur under your account.

Requirements:
• You must be at least 18 years old or have parental consent
• You must provide valid contact information
• You must not use false or misleading information
• You must not create accounts for automated or fraudulent purposes
• You are responsible for maintaining account security

You agree to notify us immediately of any unauthorized access to or use of your account. We will not be liable for any loss or damage arising from your failure to comply with this section.`,
  },
  {
    title: '3. Acceptable Use',
    content: `You may use our Service only for lawful purposes and in accordance with these Terms. You agree not to use the Service:

Prohibited Activities:
• To violate any applicable laws or regulations
• To transmit any malicious code, viruses, or destructive nature
• To infringe upon or violate our intellectual property rights or the rights of others
• To harass, abuse, or harm another person
• To spam, phish, or engage in other deceptive practices
• To interfere with or disrupt the Service or servers
• To attempt to gain unauthorized access to any portion of the Service
• To collect or track personal information of other users
• To use the Service for any illegal or unauthorized purpose
• To compete with us or use the Service to build a similar service

We reserve the right to terminate or suspend your account immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.`,
  },
  {
    title: '4. Subscription and Payment',
    content: `Billing and Renewal:
• Subscription fees are billed in advance on a monthly or annual basis
• Subscriptions automatically renew unless cancelled before the renewal date
• You authorize us to charge your payment method for all fees
• All fees are exclusive of taxes unless stated otherwise

Pricing Changes:
• We reserve the right to modify pricing with 30 days notice
• Price changes will take effect at the next billing cycle
• You may cancel your subscription if you disagree with price changes

Refunds:
• Payments are non-refundable except as required by law
• No refunds for partial months or unused features
• We may provide refunds or credits at our sole discretion
• Refund requests must be submitted within 30 days of payment`,
  },
  {
    title: '5. Intellectual Property Rights',
    content: `Service Ownership:
The Service and its original content, features, and functionality are and will remain the exclusive property of Enterprise Platform and its licensors. The Service is protected by copyright, trademark, and other laws. Our trademarks and trade dress may not be used without our prior written consent.

Your Content:
• You retain ownership of content you submit to the Service
• You grant us a worldwide, non-exclusive, royalty-free license to use your content
• This license is solely to operate and improve the Service
• You represent that you have the right to grant this license
• You are responsible for your content's legality and appropriateness

Feedback:
Any feedback, comments, or suggestions you provide regarding the Service is entirely voluntary and we will be free to use such feedback without any obligation to you.`,
  },
  {
    title: '6. Privacy and Data Protection',
    content: `Your use of the Service is also governed by our Privacy Policy. Please review our Privacy Policy, which also governs the Site and informs users of our data collection practices.

Data Processing:
• We process data in accordance with applicable privacy laws
• You are responsible for obtaining necessary consents from your users
• We implement appropriate security measures to protect data
• You must comply with all applicable data protection laws
• We may process data in multiple jurisdictions

Data Ownership:
• You retain all rights to your data
• We claim no ownership over your data
• You can export your data at any time
• We will delete your data upon account termination (subject to legal requirements)`,
  },
  {
    title: '7. Service Level Agreement',
    content: `Service Availability:
• We guarantee 99.9% uptime for paid plans
• Uptime is measured monthly excluding scheduled maintenance
• Scheduled maintenance will be announced 48 hours in advance
• Emergency maintenance may occur without notice

Support:
• Email support for all plans
• Priority support for Professional and Enterprise plans
• 24/7 support for Enterprise plans
• Response times vary by plan level

Service Credits:
• Credits available for uptime below 99.9%
• Credits calculated as percentage of monthly fee
• Credits must be requested within 30 days
• Credits apply to future invoices only`,
  },
  {
    title: '8. Limitation of Liability',
    content: `TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL ENTERPRISE PLATFORM, ITS AFFILIATES, AGENTS, DIRECTORS, EMPLOYEES, SUPPLIERS, OR LICENSORS BE LIABLE FOR ANY INDIRECT, PUNITIVE, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR EXEMPLARY DAMAGES, INCLUDING WITHOUT LIMITATION DAMAGES FOR LOSS OF PROFITS, GOODWILL, USE, DATA, OR OTHER INTANGIBLE LOSSES.

IN NO EVENT SHALL OUR AGGREGATE LIABILITY EXCEED THE GREATER OF ONE HUNDRED DOLLARS ($100) OR THE AMOUNT YOU PAID US IN THE TWELVE MONTHS PRECEDING THE EVENT GIVING RISE TO LIABILITY.

SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OR LIMITATION OF LIABILITY FOR CONSEQUENTIAL OR INCIDENTAL DAMAGES, SO THE ABOVE LIMITATION MAY NOT APPLY TO YOU.`,
  },
  {
    title: '9. Indemnification',
    content: `You agree to defend, indemnify, and hold harmless Enterprise Platform and its licensees, licensors, employees, contractors, agents, officers and directors, from and against any and all claims, damages, obligations, losses, liabilities, costs or debt, and expenses (including but not limited to attorney's fees), resulting from or arising out of:

• Your use and access of the Service
• Your breach of these Terms
• Your violation of any third-party right, including intellectual property rights
• Your violation of any applicable law, rule, or regulation
• Any claim or damage arising from your content
• Your negligent or wrongful conduct`,
  },
  {
    title: '10. Termination',
    content: `Either party may terminate these Terms at any time for any reason.

Termination by You:
• You may cancel your account at any time through your account settings
• Cancellation takes effect at the end of the current billing period
• You remain responsible for all charges incurred before termination
• No refunds for partial periods

Termination by Us:
• We may suspend or terminate your account for Terms violations
• We may terminate for non-payment of fees
• We may terminate for extended inactivity
• We may discontinue the Service with 90 days notice

Effects of Termination:
• Your right to use the Service ceases immediately
• We may delete your data after 30 days
• You can export your data before deletion
• Provisions that should survive termination will survive`,
  },
  {
    title: '11. Warranties and Disclaimers',
    content: `THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS. THE SERVICE IS PROVIDED WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING, BUT NOT LIMITED TO, IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR COURSE OF PERFORMANCE.

We do not warrant that:
• The Service will function uninterrupted, secure, or error-free
• The results obtained from the Service will be accurate or reliable
• The quality of the Service will meet your expectations
• Any errors in the Service will be corrected

You understand and agree that your use of the Service is at your own discretion and risk and that you will be solely responsible for any damage that results from your use of the Service.`,
  },
  {
    title: '12. Governing Law',
    content: `These Terms shall be governed and construed in accordance with the laws of the State of California, United States, without regard to its conflict of law provisions.

Our failure to enforce any right or provision of these Terms will not be considered a waiver of those rights. If any provision of these Terms is held to be invalid or unenforceable by a court, the remaining provisions of these Terms will remain in effect.

Dispute Resolution:
• You agree to first attempt to resolve disputes informally
• If informal resolution fails, disputes will be resolved through binding arbitration
• Arbitration will be conducted in San Francisco, California
• Each party bears its own costs in arbitration
• Class action lawsuits and jury trials are waived`,
  },
]

const contactInfo = {
  legal: {
    email: 'legal@enterprise.com',
    phone: '+1 (415) 555-0105',
    address: [
      'Enterprise Platform, Inc.',
      'Legal Department',
      '100 Market Street, Suite 500',
      'San Francisco, CA 94105',
    ],
  },
  support: {
    email: 'support@enterprise.com',
    phone: '+1 (800) 555-0100',
  },
}

const relatedDocuments = [
  { title: 'Privacy Policy', link: '/privacy', icon: Shield },
  { title: 'Cookie Policy', link: '/cookies', icon: Database },
  { title: 'Data Processing Agreement', link: '/dpa', icon: FileText },
  { title: 'Service Level Agreement', link: '/sla', icon: CheckCircle },
  { title: 'Security Overview', link: '/security', icon: Lock },
  { title: 'Acceptable Use Policy', link: '/aup', icon: UserCheck },
]

export default function TermsPage() {
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
                <Link href="/terms" className="text-xs text-primary font-medium">
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
              <Scale className="h-6 w-6 text-primary" />
              <span className="text-sm text-gray-600">Legal Agreement</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6">
              Terms of Service
            </h1>
            <p className="text-base text-gray-600 mb-6">
              These Terms of Service ("Terms") govern your use of Enterprise Platform's
              products and services. By using our Service, you agree to these Terms.
            </p>
            <div className="flex items-center space-x-6 text-sm text-gray-500">
              <span>Effective Date: January 1, 2024</span>
              <span>Last Updated: January 22, 2024</span>
              <span>Version: 3.1</span>
            </div>

            {/* Important Notice */}
            <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-yellow-900">Important Notice</p>
                  <p className="text-xs text-yellow-800 mt-1">
                    Please read these Terms carefully before using our Service. These Terms
                    include important information about your legal rights, remedies, and
                    obligations. By using the Service, you agree to be bound by these Terms.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Navigation */}
      <section className="py-8 border-b sticky top-16 bg-white z-40">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap gap-2 justify-center">
            {termsSections.map((section, index) => (
              <Link
                key={index}
                href={`#section-${index + 1}`}
                className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-full transition"
              >
                {section.title.split('.')[0]}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Terms Content */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            {termsSections.map((section, index) => (
              <div
                key={index}
                id={`section-${index + 1}`}
                className="mb-12 scroll-mt-24"
              >
                <h2 className="text-xl font-bold mb-4">{section.title}</h2>
                <div className="prose prose-sm max-w-none">
                  {section.content.split('\n\n').map((paragraph, pIndex) => (
                    <p key={pIndex} className="text-sm text-gray-700 mb-4 whitespace-pre-line">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Related Documents */}
      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold mb-8 text-center">Related Documents</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {relatedDocuments.map((doc, index) => {
                const Icon = doc.icon
                return (
                  <Link key={index} href={doc.link}>
                    <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                      <CardContent className="p-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                            <Icon className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium">{doc.title}</p>
                            <p className="text-xs text-gray-500">View document</p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle>Contact Us</CardTitle>
                <CardDescription className="text-xs">
                  For questions about these Terms of Service
                </CardDescription>
              </CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold text-sm mb-3">Legal Department</h3>
                  <div className="space-y-2 text-sm text-gray-600">
                    <p className="flex items-center">
                      <Mail className="h-4 w-4 mr-2" />
                      {contactInfo.legal.email}
                    </p>
                    <p className="flex items-center">
                      <Phone className="h-4 w-4 mr-2" />
                      {contactInfo.legal.phone}
                    </p>
                    <p className="flex items-start">
                      <Building2 className="h-4 w-4 mr-2 mt-0.5" />
                      <span>
                        {contactInfo.legal.address.map((line, i) => (
                          <span key={i}>
                            {line}
                            {i < contactInfo.legal.address.length - 1 && <br />}
                          </span>
                        ))}
                      </span>
                    </p>
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-sm mb-3">General Support</h3>
                  <div className="space-y-2 text-sm text-gray-600">
                    <p className="flex items-center">
                      <Mail className="h-4 w-4 mr-2" />
                      {contactInfo.support.email}
                    </p>
                    <p className="flex items-center">
                      <Phone className="h-4 w-4 mr-2" />
                      {contactInfo.support.phone}
                    </p>
                    <p className="text-xs text-gray-500 mt-3">
                      Available Monday-Friday, 9am-6pm PST
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Agreement Section */}
      <section className="py-16 lg:py-24 bg-primary">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-black mb-4">
            By Using Our Service
          </h2>
          <p className="text-sm text-black/80 mb-8 max-w-2xl mx-auto">
            You acknowledge that you have read, understood, and agree to be bound by these
            Terms of Service and our Privacy Policy.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/register">
              <Button variant="secondary" size="lg">
                Create Account
                <CheckCircle className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/contact">
              <Button variant="outline" size="lg" className="bg-black/10 border-black/20 hover:bg-black/20">
                Contact Legal Team
                <Mail className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
          <p className="text-xs text-black/60 mt-6">
            If you do not agree to these Terms, please do not use our Service
          </p>
        </div>
      </section>
    </div>
  )
}
