'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Shield,
  Lock,
  Key,
  Eye,
  Server,
  Database,
  Globe,
  Activity,
  CheckCircle,
  Award,
  FileText,
  Users,
  Building2,
  AlertTriangle,
  RefreshCw,
  Cpu,
  HardDrive,
  Wifi,
  Cloud,
  GitBranch,
  Terminal,
  Code,
  Layers,
  Network,
  Fingerprint,
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  FileCheck,
  ClipboardCheck,
  BadgeCheck,
  LockKeyhole,
  KeyRound,
  Unlock,
  ArrowRight,
  Download,
  ExternalLink,
  Mail,
  Phone,
  MessageSquare,
} from 'lucide-react'

const securityFeatures = [
  {
    category: 'Data Protection',
    icon: Database,
    features: [
      {
        title: 'End-to-End Encryption',
        description: 'AES-256 encryption for data at rest and TLS 1.3 for data in transit',
        icon: Lock,
      },
      {
        title: 'Data Isolation',
        description: 'Complete tenant isolation with dedicated database schemas',
        icon: Shield,
      },
      {
        title: 'Backup & Recovery',
        description: 'Automated backups with point-in-time recovery and geo-redundancy',
        icon: RefreshCw,
      },
      {
        title: 'Data Residency',
        description: 'Choose where your data is stored with regional data centers',
        icon: Globe,
      },
    ],
  },
  {
    category: 'Access Control',
    icon: Key,
    features: [
      {
        title: 'Single Sign-On (SSO)',
        description: 'SAML 2.0 and OAuth 2.0 support for enterprise identity providers',
        icon: UserCheck,
      },
      {
        title: 'Multi-Factor Authentication',
        description: 'Support for TOTP, SMS, biometric, and hardware security keys',
        icon: Fingerprint,
      },
      {
        title: 'Role-Based Access Control',
        description: 'Granular permissions with custom roles and access policies',
        icon: Users,
      },
      {
        title: 'Session Management',
        description: 'Secure session handling with automatic timeout and device tracking',
        icon: Activity,
      },
    ],
  },
  {
    category: 'Infrastructure Security',
    icon: Server,
    features: [
      {
        title: 'Network Security',
        description: 'DDoS protection, WAF, and intrusion detection systems',
        icon: Network,
      },
      {
        title: 'Container Security',
        description: 'Isolated containers with security scanning and runtime protection',
        icon: Layers,
      },
      {
        title: 'API Security',
        description: 'Rate limiting, API keys, OAuth, and webhook signatures',
        icon: Code,
      },
      {
        title: 'Cloud Security',
        description: 'AWS/Azure/GCP security best practices and compliance',
        icon: Cloud,
      },
    ],
  },
  {
    category: 'Monitoring & Compliance',
    icon: Eye,
    features: [
      {
        title: 'Security Monitoring',
        description: '24/7 security operations center with real-time threat detection',
        icon: ShieldAlert,
      },
      {
        title: 'Audit Logging',
        description: 'Comprehensive audit trails for all system and user activities',
        icon: ClipboardCheck,
      },
      {
        title: 'Vulnerability Management',
        description: 'Regular security assessments and penetration testing',
        icon: AlertTriangle,
      },
      {
        title: 'Compliance Reporting',
        description: 'Automated compliance reports for audits and certifications',
        icon: FileCheck,
      },
    ],
  },
]

const certifications = [
  {
    name: 'SOC 2 Type II',
    description: 'Audited for security, availability, and confidentiality',
    icon: Award,
    status: 'Certified',
  },
  {
    name: 'ISO 27001',
    description: 'International standard for information security management',
    icon: BadgeCheck,
    status: 'Certified',
  },
  {
    name: 'GDPR Compliant',
    description: 'Full compliance with EU data protection regulations',
    icon: Shield,
    status: 'Compliant',
  },
  {
    name: 'HIPAA Ready',
    description: 'Healthcare data protection standards',
    icon: FileText,
    status: 'Ready',
  },
  {
    name: 'PCI DSS',
    description: 'Payment card industry data security standards',
    icon: LockKeyhole,
    status: 'Level 1',
  },
  {
    name: 'CCPA Compliant',
    description: 'California Consumer Privacy Act compliance',
    icon: Building2,
    status: 'Compliant',
  },
]

const securityPractices = [
  {
    title: 'Security by Design',
    points: [
      'Security considered at every stage of development',
      'Threat modeling for all new features',
      'Secure coding practices and guidelines',
      'Regular security training for all engineers',
    ],
  },
  {
    title: 'Zero Trust Architecture',
    points: [
      'Never trust, always verify approach',
      'Micro-segmentation of network resources',
      'Least privilege access principles',
      'Continuous verification of user identity',
    ],
  },
  {
    title: 'Incident Response',
    points: [
      '24/7 incident response team',
      'Defined escalation procedures',
      'Regular incident response drills',
      'Transparent security incident reporting',
    ],
  },
  {
    title: 'Third-Party Security',
    points: [
      'Vendor security assessments',
      'Supply chain security monitoring',
      'Regular third-party audits',
      'Secure integration protocols',
    ],
  },
]

const securityStats = [
  { label: 'Uptime SLA', value: '99.99%' },
  { label: 'Security Incidents', value: '0' },
  { label: 'Average Response Time', value: '<15min' },
  { label: 'Security Updates', value: 'Weekly' },
]

export default function SecurityPage() {
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
              <div className="hidden md:flex items-center space-x-6">
                <Link href="/features" className="text-xs text-muted-foreground hover:text-foreground transition">
                  Features
                </Link>
                <Link href="/pricing" className="text-xs text-muted-foreground hover:text-foreground transition">
                  Pricing
                </Link>
                <Link href="/security" className="text-xs text-primary font-medium">
                  Security
                </Link>
                <Link href="/about" className="text-xs text-muted-foreground hover:text-foreground transition">
                  About
                </Link>
                <Link href="/contact" className="text-xs text-muted-foreground hover:text-foreground transition">
                  Contact
                </Link>
              </div>
            </div>
            <div className="flex items-center space-x-3">
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
      <section className="bg-gradient-to-b from-muted/50 to-background py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-6">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6 text-foreground">
              Enterprise-Grade Security
              <span className="text-primary"> You Can Trust</span>
            </h1>
            <p className="text-base text-muted-foreground mb-8">
              We take security seriously. Our platform is built with multiple layers of protection
              to keep your data safe, secure, and compliant with global standards.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/docs/security">
                <Button size="lg">
                  Security Documentation
                  <FileText className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/contact?type=security">
                <Button variant="outline" size="lg">
                  Security Audit Request
                  <Shield className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Security Stats */}
      <section className="py-16 border-y border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {securityStats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-primary mb-2">{stat.value}</div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security Features */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">
              Comprehensive Security Features
            </h2>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
              Multiple layers of security to protect your business
            </p>
          </div>

          <div className="space-y-12">
            {securityFeatures.map((category, index) => {
              const CategoryIcon = category.icon
              return (
                <div key={index}>
                  <div className="flex items-center space-x-3 mb-6">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                      <CategoryIcon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="text-xl font-bold text-foreground">{category.category}</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {category.features.map((feature, idx) => {
                      const FeatureIcon = feature.icon
                      return (
                        <Card key={idx} className="hover:shadow-lg transition-shadow">
                          <CardHeader>
                            <div className="flex items-start space-x-3">
                              <FeatureIcon className="h-5 w-5 text-primary mt-0.5" />
                              <div>
                                <CardTitle className="text-base">{feature.title}</CardTitle>
                                <CardDescription className="text-xs mt-1">
                                  {feature.description}
                                </CardDescription>
                              </div>
                            </div>
                          </CardHeader>
                        </Card>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Certifications */}
      <section className="py-16 lg:py-24 bg-muted/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">
              Certifications & Compliance
            </h2>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
              Meeting and exceeding industry standards for security and compliance
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {certifications.map((cert, index) => {
              const Icon = cert.icon
              return (
                <Card key={index} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{cert.name}</CardTitle>
                          <CardDescription className="text-xs mt-1">
                            {cert.description}
                          </CardDescription>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400">
                      {cert.status}
                    </span>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <div className="text-center mt-8">
            <Link href="/compliance">
              <Button variant="outline">
                View All Compliance Documents
                <ArrowRight className="ml-2 h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Security Practices */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">
              Our Security Practices
            </h2>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
              Best practices and methodologies we follow to ensure your security
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {securityPractices.map((practice, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="text-base">{practice.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {practice.points.map((point, idx) => (
                      <li key={idx} className="flex items-start space-x-2">
                        <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5" />
                        <span className="text-xs text-muted-foreground">{point}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Security Resources */}
      <section className="py-16 lg:py-24 bg-black dark:bg-gray-950 text-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              Security Resources
            </h2>
            <p className="text-sm text-gray-300 max-w-2xl mx-auto">
              Download our security documentation and reports
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <Card className="bg-white/10 border-white/20">
              <CardHeader>
                <FileText className="h-8 w-8 text-primary mb-3" />
                <CardTitle className="text-base text-white">Security Whitepaper</CardTitle>
                <CardDescription className="text-xs text-gray-300">
                  Detailed overview of our security architecture
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="secondary" size="sm" className="w-full">
                  <Download className="mr-2 h-3.5 w-3.5" />
                  Download PDF
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-white/10 border-white/20">
              <CardHeader>
                <ClipboardCheck className="h-8 w-8 text-primary mb-3" />
                <CardTitle className="text-base text-white">SOC 2 Report</CardTitle>
                <CardDescription className="text-xs text-gray-300">
                  Latest SOC 2 Type II audit report
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="secondary" size="sm" className="w-full">
                  <Mail className="mr-2 h-3.5 w-3.5" />
                  Request Access
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-white/10 border-white/20">
              <CardHeader>
                <Shield className="h-8 w-8 text-primary mb-3" />
                <CardTitle className="text-base text-white">Pen Test Results</CardTitle>
                <CardDescription className="text-xs text-gray-300">
                  Recent penetration testing summary
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="secondary" size="sm" className="w-full">
                  <Mail className="mr-2 h-3.5 w-3.5" />
                  Request Access
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Security Contact */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">
              Security Questions?
            </h2>
            <p className="text-sm text-muted-foreground mb-8">
              Our security team is here to answer your questions and provide additional information
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <div className="flex items-center space-x-2">
                <Mail className="h-4 w-4 text-primary" />
                <a href="mailto:security@enterprise.com" className="text-sm text-muted-foreground hover:text-primary">
                  security@enterprise.com
                </a>
              </div>
              <div className="flex items-center space-x-2">
                <Shield className="h-4 w-4 text-primary" />
                <a href="/security/report" className="text-sm text-muted-foreground hover:text-primary">
                  Report a Security Issue
                </a>
              </div>
              <div className="flex items-center space-x-2">
                <FileText className="h-4 w-4 text-primary" />
                <a href="/security/disclosure" className="text-sm text-muted-foreground hover:text-primary">
                  Responsible Disclosure
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 lg:py-24 bg-primary">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-black mb-4">
            Security You Can Count On
          </h2>
          <p className="text-sm text-black/80 mb-8 max-w-2xl mx-auto">
            Join thousands of enterprises that trust our platform with their most sensitive data
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/register">
              <Button variant="secondary" size="lg">
                Start Secure Trial
                <Lock className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/demo">
              <Button variant="outline" size="lg" className="bg-black/10 border-black/20 hover:bg-black/20">
                Security Demo
                <Shield className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}