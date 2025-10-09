import Link from 'next/link'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card'
import {
  FileText,
  Scale,
  Shield,
  CreditCard,
  UserCheck,
  AlertTriangle,
  Calendar,
  Download,
  ArrowLeft,
  ExternalLink,
  CheckCircle,
  XCircle,
  Mail,
  Building2,
  Globe,
  Lock,
  RefreshCw,
  Clock,
  Gavel,
  Users,
  Settings,
  Ban,
  Eye,
  Phone,
  MapPin,
} from 'lucide-react'

const termsHighlights = [
  {
    icon: Scale,
    title: 'Fair Terms',
    description: 'Clear, reasonable terms that protect both users and the platform.',
  },
  {
    icon: Shield,
    title: 'User Protection',
    description: 'Your rights and protections when using our services.',
  },
  {
    icon: RefreshCw,
    title: 'Regular Updates',
    description: 'Terms are regularly reviewed and updated for clarity and fairness.',
  },
  {
    icon: Eye,
    title: 'Transparent Policies',
    description: 'Plain language explanations of complex legal concepts.',
  },
]

const serviceFeatures = [
  {
    category: 'Platform Access',
    icon: Globe,
    items: [
      'Web-based dashboard and tools',
      'Mobile-responsive interface',
      'API access and integrations',
      'Multi-user collaboration',
    ],
  },
  {
    category: 'Account Features',
    icon: UserCheck,
    items: [
      'Personal and team accounts',
      'Custom branding options',
      'Data import/export tools',
      'Advanced analytics',
    ],
  },
  {
    category: 'Support Services',
    icon: Users,
    items: [
      '24/7 customer support',
      'Documentation and tutorials',
      'Training and onboarding',
      'Community forums',
    ],
  },
  {
    category: 'Security & Privacy',
    icon: Lock,
    items: [
      'Data encryption and protection',
      'Regular security audits',
      'GDPR and CCPA compliance',
      'Secure payment processing',
    ],
  },
]

export default function TermsPage() {
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
              <FileText className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6 text-foreground">
              Terms of Service
            </h1>
            <p className="text-base text-muted-foreground mb-8">
              These terms govern your use of the Enterprise Platform. By using our services,
              you agree to be bound by these terms.
            </p>
            <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center">
                <Calendar className="h-4 w-4 mr-1" />
                Last updated: December 2024
              </span>
              <span className="flex items-center">
                <Scale className="h-4 w-4 mr-1" />
                Version 2.1
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Terms Highlights */}
      <section className="py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">Our Terms Philosophy</h2>
              <p className="text-sm text-muted-foreground">
                We believe in clear, fair terms that protect everyone in our community
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {termsHighlights.map((highlight, index) => {
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

      {/* Service Overview */}
      <section className="py-16 bg-muted/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">What Our Service Includes</h2>
              <p className="text-sm text-muted-foreground">
                Comprehensive platform features and services covered by these terms
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {serviceFeatures.map((feature, index) => {
                const Icon = feature.icon
                return (
                  <Card key={index} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{feature.category}</CardTitle>
                          <span className="text-xs text-muted-foreground">{feature.items.length} features</span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {feature.items.map((item, idx) => (
                          <li key={idx} className="text-xs text-muted-foreground flex items-center">
                            <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400 mr-2" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Main Terms Content */}
      <section className="py-16">
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
                        'Acceptance of Terms',
                        'Description of Service',
                        'User Accounts',
                        'Acceptable Use',
                        'Payment Terms',
                        'Intellectual Property',
                        'Privacy & Data',
                        'Termination',
                        'Disclaimers',
                        'Limitation of Liability',
                        'Governing Law',
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
                {/* Acceptance of Terms */}
                <Card id="section-1">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <CheckCircle className="h-5 w-5 text-primary" />
                      <span>1. Acceptance of Terms</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      By accessing or using the Enterprise Platform ("Service"), you agree to be bound by these
                      Terms of Service ("Terms"). If you disagree with any part of these terms, you may not
                      access or use our Service.
                    </p>
                    <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg">
                      <h4 className="text-sm font-semibold mb-2 flex items-center text-blue-900 dark:text-blue-100">
                        <AlertTriangle className="h-4 w-4 text-blue-600 dark:text-blue-400 mr-2" />
                        Important Note
                      </h4>
                      <p className="text-xs text-blue-800 dark:text-blue-200">
                        These Terms constitute a legally binding agreement between you and Enterprise Platform Inc.
                        Please read them carefully before using our services.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Description of Service */}
                <Card id="section-2">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Globe className="h-5 w-5 text-primary" />
                      <span>2. Description of Service</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Enterprise Platform is a comprehensive business management solution that provides:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-semibold mb-2 text-foreground">Core Features</h4>
                        <ul className="space-y-1">
                          {[
                            'Project management tools',
                            'Team collaboration features',
                            'Analytics and reporting',
                            'API access and integrations',
                          ].map((item, idx) => (
                            <li key={idx} className="text-xs text-muted-foreground flex items-center">
                              <div className="w-1 h-1 bg-primary rounded-full mr-2" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold mb-2 text-foreground">Additional Services</h4>
                        <ul className="space-y-1">
                          {[
                            'Customer support',
                            'Training and onboarding',
                            'Data backup and recovery',
                            'Security monitoring',
                          ].map((item, idx) => (
                            <li key={idx} className="text-xs text-muted-foreground flex items-center">
                              <div className="w-1 h-1 bg-primary rounded-full mr-2" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* User Accounts */}
                <Card id="section-3">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <UserCheck className="h-5 w-5 text-primary" />
                      <span>3. User Accounts</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      To access certain features of our Service, you must create an account and provide accurate information.
                    </p>
                    <div className="space-y-3">
                      <div className="border-l-4 border-green-500 pl-4">
                        <h4 className="text-sm font-semibold mb-1 text-foreground">Account Requirements</h4>
                        <p className="text-xs text-muted-foreground">
                          You must be at least 18 years old and provide accurate, current information.
                          One person or entity per account.
                        </p>
                      </div>
                      <div className="border-l-4 border-blue-500 pl-4">
                        <h4 className="text-sm font-semibold mb-1 text-foreground">Account Security</h4>
                        <p className="text-xs text-muted-foreground">
                          You are responsible for maintaining the security of your account credentials
                          and all activities under your account.
                        </p>
                      </div>
                      <div className="border-l-4 border-red-500 pl-4">
                        <h4 className="text-sm font-semibold mb-1 text-foreground">Account Termination</h4>
                        <p className="text-xs text-muted-foreground">
                          We may suspend or terminate accounts that violate these Terms or engage
                          in fraudulent or harmful activities.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Acceptable Use */}
                <Card id="section-4">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Shield className="h-5 w-5 text-primary" />
                      <span>4. Acceptable Use</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      You agree to use our Service responsibly and in compliance with all applicable laws.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="text-sm font-semibold mb-3 text-green-700 dark:text-green-400 flex items-center">
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Allowed Activities
                        </h4>
                        <ul className="space-y-1">
                          {[
                            'Business and personal project management',
                            'Team collaboration and communication',
                            'Data analysis and reporting',
                            'Integration with approved third-party services',
                            'Educational and training purposes',
                          ].map((item, idx) => (
                            <li key={idx} className="text-xs text-muted-foreground flex items-start">
                              <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400 mr-2 mt-0.5" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold mb-3 text-red-700 dark:text-red-400 flex items-center">
                          <Ban className="h-4 w-4 mr-2" />
                          Prohibited Activities
                        </h4>
                        <ul className="space-y-1">
                          {[
                            'Illegal activities or content',
                            'Harassment or abusive behavior',
                            'Spam or unauthorized marketing',
                            'Security breaches or hacking attempts',
                            'Sharing copyrighted content without permission',
                          ].map((item, idx) => (
                            <li key={idx} className="text-xs text-muted-foreground flex items-start">
                              <XCircle className="h-3 w-3 text-red-600 dark:text-red-400 mr-2 mt-0.5" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Payment Terms */}
                <Card id="section-5">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <CreditCard className="h-5 w-5 text-primary" />
                      <span>5. Payment Terms</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Paid services are billed according to your selected plan and billing cycle.
                    </p>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-muted p-4 rounded-lg">
                          <h4 className="text-sm font-semibold mb-2 text-foreground">Billing Cycle</h4>
                          <ul className="space-y-1 text-xs text-muted-foreground">
                            <li>• Monthly or annual billing available</li>
                            <li>• Automatic renewal unless cancelled</li>
                            <li>• Pro-rated charges for plan changes</li>
                            <li>• Taxes added where applicable</li>
                          </ul>
                        </div>
                        <div className="bg-muted p-4 rounded-lg">
                          <h4 className="text-sm font-semibold mb-2 text-foreground">Refund Policy</h4>
                          <ul className="space-y-1 text-xs text-muted-foreground">
                            <li>• 30-day money-back guarantee</li>
                            <li>• Pro-rated refunds for cancellations</li>
                            <li>• No refunds for usage-based charges</li>
                            <li>• Refunds processed within 5-10 business days</li>
                          </ul>
                        </div>
                      </div>
                      <div className="border border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/30 p-4 rounded-lg">
                        <h4 className="text-sm font-semibold mb-1 flex items-center text-yellow-800 dark:text-yellow-400">
                          <Clock className="h-4 w-4 mr-2" />
                          Payment Due Dates
                        </h4>
                        <p className="text-xs text-yellow-700 dark:text-yellow-300">
                          Payment is due immediately upon subscription or renewal. Late payments may result
                          in service suspension after a 7-day grace period.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Intellectual Property */}
                <Card id="section-6">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Gavel className="h-5 w-5 text-primary" />
                      <span>6. Intellectual Property</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      The Service and its content are protected by intellectual property laws.
                    </p>
                    <div className="space-y-3">
                      <div className="border-l-4 border-purple-500 pl-4">
                        <h4 className="text-sm font-semibold mb-1 text-foreground">Our Rights</h4>
                        <p className="text-xs text-muted-foreground">
                          We own all rights to the Enterprise Platform software, design, trademarks,
                          and documentation. You receive a limited license to use our Service.
                        </p>
                      </div>
                      <div className="border-l-4 border-blue-500 pl-4">
                        <h4 className="text-sm font-semibold mb-1 text-foreground">Your Rights</h4>
                        <p className="text-xs text-muted-foreground">
                          You retain ownership of all content and data you upload to our Service.
                          You grant us a license to process and store your data to provide the Service.
                        </p>
                      </div>
                      <div className="border-l-4 border-green-500 pl-4">
                        <h4 className="text-sm font-semibold mb-1 text-foreground">Content Guidelines</h4>
                        <p className="text-xs text-muted-foreground">
                          You must have the right to upload any content and ensure it doesn't
                          infringe on third-party intellectual property rights.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Termination */}
                <Card id="section-8">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Ban className="h-5 w-5 text-primary" />
                      <span>8. Termination</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Either party may terminate this agreement under certain circumstances.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-semibold mb-2 text-foreground">Your Rights</h4>
                        <ul className="space-y-1 text-xs text-muted-foreground">
                          <li>• Cancel anytime from account settings</li>
                          <li>• 30-day notice for annual subscriptions</li>
                          <li>• Download your data before cancellation</li>
                          <li>• Request data deletion after termination</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold mb-2 text-foreground">Our Rights</h4>
                        <ul className="space-y-1 text-xs text-muted-foreground">
                          <li>• Suspend service for Terms violations</li>
                          <li>• Terminate accounts for illegal activity</li>
                          <li>• End service with 30-day notice</li>
                          <li>• Retain data as required by law</li>
                        </ul>
                      </div>
                    </div>
                    <div className="bg-red-50 dark:bg-red-950/30 p-4 rounded-lg">
                      <h4 className="text-sm font-semibold mb-1 text-red-800 dark:text-red-400">
                        Effect of Termination
                      </h4>
                      <p className="text-xs text-red-700 dark:text-red-300">
                        Upon termination, your access to the Service will cease, and your data may be
                        deleted after a 30-day retention period, except as required by law.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Contact Information */}
                <Card id="section-12">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Mail className="h-5 w-5 text-primary" />
                      <span>12. Contact Information</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      For questions about these Terms of Service, please contact us:
                    </p>
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
                            <div>Legal Department</div>
                            <div>123 Business Street</div>
                            <div>San Francisco, CA 94105</div>
                          </div>
                        </div>
                      </div>
                      <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg">
                        <h4 className="text-sm font-semibold mb-2 text-blue-900 dark:text-blue-100">Legal Notices</h4>
                        <p className="text-xs text-blue-800 dark:text-blue-200 mb-2">
                          For formal legal notices, please send written correspondence to our legal department
                          at the address provided.
                        </p>
                        <p className="text-xs font-medium text-blue-900 dark:text-blue-100">Response time: 10 business days</p>
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
            Questions About Our Terms?
          </h2>
          <p className="text-sm text-black/80 mb-8 max-w-2xl mx-auto">
            Our legal team is here to help clarify any questions you may have about our terms of service.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button variant="secondary" size="lg">
              <Mail className="mr-2 h-4 w-4" />
              Contact Legal Team
            </Button>
            <Button variant="outline" size="lg" className="bg-black/10 border-black/20 hover:bg-black/20">
              <ExternalLink className="mr-2 h-4 w-4" />
              Legal Resources
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}