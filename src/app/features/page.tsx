'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Users,
  Briefcase,
  UserCheck,
  BarChart3,
  Shield,
  Globe,
  Zap,
  Database,
  Lock,
  Cloud,
  Settings,
  Building2,
  Calendar,
  Mail,
  Phone,
  MessageSquare,
  CreditCard,
  FileText,
  Download,
  Upload,
  RefreshCw,
  Target,
  TrendingUp,
  Award,
  CheckCircle,
  ArrowRight,
  Code,
  Smartphone,
  Monitor,
  Cpu,
  Server,
  Activity,
  GitBranch,
  Package,
  Layers,
  Terminal,
  Eye,
  Bell,
  Headphones,
  BookOpen,
  Search,
  Filter,
  PieChart,
  LineChart,
  Bot,
  Sparkles,
  Workflow,
  Network,
  FolderTree,
  Key,
  UserPlus,
  Link2,
  Gauge,
  HardDrive,
  Wifi,
  WifiOff,
  Clock,
  Hash,
  AlertTriangle,
  ThumbsUp,
  Star,
  Heart,
  Send,
  Archive,
  Trash2,
  Edit,
  Copy,
  Clipboard,
  CheckSquare,
  Square,
  Circle,
  Info,
  HelpCircle,
  AlertCircle,
  XCircle,
  PlayCircle,
  PauseCircle,
  StopCircle,
  SkipForward,
  Volume2,
  VolumeX,
  Mic,
  Video,
  Image,
  File,
  Folder,
  Grid,
  List,
  Map,
  Navigation,
  Compass,
  Home,
  LogIn,
  LogOut,
  Share2,
  Printer,
  Save,
  X,
  Plus,
  Minus,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  MoreHorizontal,
  MoreVertical,
  Menu,
  Sidebar,
  Command,
  Repeat,
  Shuffle,
  Sliders,
  SlidersHorizontal,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'

const featureCategories = [
  {
    name: 'Core Business Management',
    description: 'Comprehensive tools for managing your consulting operations',
    icon: Briefcase,
    color: 'blue',
    features: [
      {
        title: 'Client Management',
        description: 'Complete CRM system for managing client relationships, contracts, and communications',
        icon: Users,
        capabilities: [
          'Client profiles and history',
          'Contact management',
          'Communication tracking',
          'Document management',
          'Client portal access',
          'Automated notifications',
        ],
      },
      {
        title: 'Project Management',
        description: 'End-to-end project lifecycle management with advanced tracking',
        icon: Target,
        capabilities: [
          'Project planning and scheduling',
          'Task management and assignments',
          'Resource allocation',
          'Budget tracking',
          'Milestone monitoring',
          'Gantt charts and timelines',
        ],
      },
      {
        title: 'Consultant Management',
        description: 'Manage your consulting team efficiently',
        icon: UserCheck,
        capabilities: [
          'Consultant profiles and skills',
          'Availability tracking',
          'Performance metrics',
          'Assignment management',
          'Time tracking',
          'Expense management',
        ],
      },
      {
        title: 'Engagement Analytics',
        description: 'Deep insights into client engagements and project performance',
        icon: BarChart3,
        capabilities: [
          'Real-time dashboards',
          'Custom reports',
          'KPI tracking',
          'Profitability analysis',
          'Client satisfaction metrics',
          'Predictive analytics',
        ],
      },
    ],
  },
  {
    name: 'Recruitment Services',
    description: 'Complete recruitment and talent management platform',
    icon: UserCheck,
    color: 'green',
    features: [
      {
        title: 'Job Board Management',
        description: 'Create and manage job postings across multiple channels',
        icon: Briefcase,
        capabilities: [
          'Multi-channel posting',
          'Custom job templates',
          'SEO optimization',
          'Application tracking',
          'Automated screening',
          'Candidate communication',
        ],
      },
      {
        title: 'Applicant Tracking System',
        description: 'Streamline your entire recruitment workflow',
        icon: Users,
        capabilities: [
          'Resume parsing',
          'Candidate pipeline',
          'Interview scheduling',
          'Evaluation and scoring',
          'Background checks',
          'Offer management',
        ],
      },
      {
        title: 'Partner Management',
        description: 'Collaborate with recruitment partners and agencies',
        icon: Building2,
        capabilities: [
          'Partner portal',
          'Commission tracking',
          'Candidate sharing',
          'Performance metrics',
          'Contract management',
          'Automated payouts',
        ],
      },
      {
        title: 'Talent Analytics',
        description: 'Data-driven insights for better hiring decisions',
        icon: PieChart,
        capabilities: [
          'Sourcing analytics',
          'Time-to-hire metrics',
          'Quality of hire tracking',
          'Diversity reporting',
          'Competitive analysis',
          'Talent pool insights',
        ],
      },
    ],
  },
  {
    name: 'Platform Infrastructure',
    description: 'Enterprise-grade technical foundation',
    icon: Server,
    color: 'purple',
    features: [
      {
        title: 'Multi-Tenant Architecture',
        description: 'Isolated, secure environments for each organization',
        icon: Building2,
        capabilities: [
          'Complete data isolation',
          'Custom domains',
          'White-label options',
          'Tenant-specific configurations',
          'Resource allocation',
          'Usage monitoring',
        ],
      },
      {
        title: 'API & Integrations',
        description: 'Connect with your existing tools and workflows',
        icon: Link2,
        capabilities: [
          'RESTful API',
          'GraphQL support',
          'Webhook events',
          'OAuth 2.0',
          'Pre-built integrations',
          'Custom connectors',
        ],
      },
      {
        title: 'Security & Compliance',
        description: 'Bank-level security and regulatory compliance',
        icon: Shield,
        capabilities: [
          'End-to-end encryption',
          'GDPR compliance',
          'HIPAA ready',
          'SOC 2 certified',
          'Regular security audits',
          'Penetration testing',
        ],
      },
      {
        title: 'Performance & Reliability',
        description: 'Built for scale with guaranteed uptime',
        icon: Activity,
        capabilities: [
          '99.99% uptime SLA',
          'Global CDN',
          'Auto-scaling',
          'Load balancing',
          'Disaster recovery',
          'Real-time monitoring',
        ],
      },
    ],
  },
  {
    name: 'Collaboration & Communication',
    description: 'Keep your team connected and productive',
    icon: MessageSquare,
    color: 'orange',
    features: [
      {
        title: 'Team Collaboration',
        description: 'Real-time collaboration tools for distributed teams',
        icon: Users,
        capabilities: [
          'Team chat',
          'Video conferencing',
          'Screen sharing',
          'File sharing',
          'Shared workspaces',
          'Activity feeds',
        ],
      },
      {
        title: 'Email & Notifications',
        description: 'Intelligent communication management',
        icon: Mail,
        capabilities: [
          'Email integration',
          'Smart notifications',
          'Email templates',
          'Automated workflows',
          'Notification preferences',
          'Mobile push notifications',
        ],
      },
      {
        title: 'Document Management',
        description: 'Centralized document storage and collaboration',
        icon: FileText,
        capabilities: [
          'Version control',
          'Real-time editing',
          'Access controls',
          'Document templates',
          'E-signatures',
          'OCR scanning',
        ],
      },
      {
        title: 'Knowledge Base',
        description: 'Build and maintain organizational knowledge',
        icon: BookOpen,
        capabilities: [
          'Wiki system',
          'FAQ builder',
          'Search functionality',
          'Content management',
          'Access permissions',
          'Analytics',
        ],
      },
    ],
  },
  {
    name: 'Analytics & Reporting',
    description: 'Data-driven insights for informed decision making',
    icon: BarChart3,
    color: 'red',
    features: [
      {
        title: 'Business Intelligence',
        description: 'Comprehensive analytics and visualization',
        icon: LineChart,
        capabilities: [
          'Custom dashboards',
          'Interactive reports',
          'Data visualization',
          'Trend analysis',
          'Forecasting',
          'Anomaly detection',
        ],
      },
      {
        title: 'Real-time Analytics',
        description: 'Live data streaming and monitoring',
        icon: Activity,
        capabilities: [
          'Live dashboards',
          'Real-time alerts',
          'Performance monitoring',
          'User activity tracking',
          'System metrics',
          'Custom KPIs',
        ],
      },
      {
        title: 'Custom Reports',
        description: 'Build and schedule custom reports',
        icon: FileText,
        capabilities: [
          'Report builder',
          'Scheduled reports',
          'Export options',
          'Report templates',
          'Distribution lists',
          'Report sharing',
        ],
      },
      {
        title: 'AI-Powered Insights',
        description: 'Machine learning for predictive analytics',
        icon: Bot,
        capabilities: [
          'Predictive modeling',
          'Pattern recognition',
          'Automated insights',
          'Risk assessment',
          'Opportunity identification',
          'Natural language queries',
        ],
      },
    ],
  },
  {
    name: 'Administration & Control',
    description: 'Complete control over your platform',
    icon: Settings,
    color: 'indigo',
    features: [
      {
        title: 'User Management',
        description: 'Comprehensive user administration',
        icon: Users,
        capabilities: [
          'User provisioning',
          'Role-based access',
          'Permission management',
          'SSO/SAML',
          'Multi-factor authentication',
          'Session management',
        ],
      },
      {
        title: 'Billing & Subscriptions',
        description: 'Flexible billing and subscription management',
        icon: CreditCard,
        capabilities: [
          'Usage-based billing',
          'Subscription management',
          'Invoice generation',
          'Payment processing',
          'Tax calculation',
          'Revenue recognition',
        ],
      },
      {
        title: 'Audit & Compliance',
        description: 'Complete audit trail and compliance tools',
        icon: Shield,
        capabilities: [
          'Audit logs',
          'Compliance reporting',
          'Data retention policies',
          'Access reviews',
          'Change tracking',
          'Export capabilities',
        ],
      },
      {
        title: 'System Configuration',
        description: 'Customize the platform to your needs',
        icon: Sliders,
        capabilities: [
          'Custom fields',
          'Workflow automation',
          'Business rules',
          'Email templates',
          'Branding options',
          'API configuration',
        ],
      },
    ],
  },
]

const additionalFeatures = [
  { name: 'Mobile Apps', description: 'Native iOS and Android apps', icon: Smartphone },
  { name: '24/7 Support', description: 'Round-the-clock customer support', icon: Headphones },
  { name: 'Data Import/Export', description: 'Easy data migration tools', icon: Download },
  { name: 'Backup & Recovery', description: 'Automated backups and recovery', icon: RefreshCw },
  { name: 'Multi-language', description: 'Support for 30+ languages', icon: Globe },
  { name: 'Offline Mode', description: 'Work without internet connection', icon: WifiOff },
]

const integrations = [
  { name: 'Slack', category: 'Communication' },
  { name: 'Microsoft Teams', category: 'Communication' },
  { name: 'Google Workspace', category: 'Productivity' },
  { name: 'Office 365', category: 'Productivity' },
  { name: 'Salesforce', category: 'CRM' },
  { name: 'HubSpot', category: 'CRM' },
  { name: 'Stripe', category: 'Payment' },
  { name: 'PayPal', category: 'Payment' },
  { name: 'QuickBooks', category: 'Accounting' },
  { name: 'Xero', category: 'Accounting' },
  { name: 'LinkedIn', category: 'Social' },
  { name: 'Indeed', category: 'Recruitment' },
  { name: 'Zoom', category: 'Video' },
  { name: 'Calendly', category: 'Scheduling' },
  { name: 'DocuSign', category: 'E-signature' },
  { name: 'Dropbox', category: 'Storage' },
  { name: 'AWS', category: 'Cloud' },
  { name: 'Azure', category: 'Cloud' },
  { name: 'Jira', category: 'Project Management' },
  { name: 'Zapier', category: 'Automation' },
]

export default function FeaturesPage() {
  const [selectedCategory, setSelectedCategory] = useState(0)
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null)

  const toggleFeature = (featureTitle: string) => {
    setExpandedFeature(expandedFeature === featureTitle ? null : featureTitle)
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
                <Link href="/features" className="text-xs text-primary font-medium">
                  Features
                </Link>
                <Link href="/pricing" className="text-xs text-gray-600 hover:text-gray-900 transition">
                  Pricing
                </Link>
                <Link href="/about" className="text-xs text-gray-600 hover:text-gray-900 transition">
                  About
                </Link>
                <Link href="/contact" className="text-xs text-gray-600 hover:text-gray-900 transition">
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
      <section className="bg-gradient-to-b from-gray-50 to-white py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6">
              Everything You Need to
              <span className="text-primary"> Transform Your Business</span>
            </h1>
            <p className="text-base text-gray-600 mb-8">
              Discover our comprehensive suite of features designed to streamline operations,
              boost productivity, and drive growth for enterprises of all sizes.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/register">
                <Button size="lg">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/demo">
                <Button variant="outline" size="lg">
                  Watch Demo
                  <PlayCircle className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Categories */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              Comprehensive Feature Set
            </h2>
            <p className="text-sm text-gray-600 max-w-2xl mx-auto">
              Explore our platform's capabilities organized by category
            </p>
          </div>

          {/* Category Tabs */}
          <div className="flex flex-wrap justify-center gap-2 mb-12">
            {featureCategories.map((category, index) => {
              const Icon = category.icon
              return (
                <button
                  key={index}
                  onClick={() => setSelectedCategory(index)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                    selectedCategory === index
                      ? 'bg-primary text-black shadow'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{category.name}</span>
                </button>
              )
            })}
          </div>

          {/* Selected Category Features */}
          <div className="max-w-6xl mx-auto">
            <div className="mb-8">
              <h3 className="text-xl font-bold mb-2">
                {featureCategories[selectedCategory].name}
              </h3>
              <p className="text-sm text-gray-600">
                {featureCategories[selectedCategory].description}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {featureCategories[selectedCategory].features.map((feature, index) => {
                const Icon = feature.icon
                const isExpanded = expandedFeature === feature.title
                return (
                  <Card
                    key={index}
                    className="hover:shadow-lg transition-shadow cursor-pointer"
                    onClick={() => toggleFeature(feature.title)}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3">
                          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                            <Icon className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1">
                            <CardTitle className="text-base">{feature.title}</CardTitle>
                            <CardDescription className="text-xs mt-1">
                              {feature.description}
                            </CardDescription>
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                    </CardHeader>
                    {isExpanded && (
                      <CardContent>
                        <ul className="space-y-2">
                          {feature.capabilities.map((capability, idx) => (
                            <li key={idx} className="flex items-start space-x-2">
                              <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                              <span className="text-xs text-gray-700">{capability}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    )}
                  </Card>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Additional Features */}
      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              And So Much More
            </h2>
            <p className="text-sm text-gray-600 max-w-2xl mx-auto">
              Additional features that make our platform the complete solution
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {additionalFeatures.map((feature, index) => {
              const Icon = feature.icon
              return (
                <Card key={index} className="hover:shadow-lg transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-start space-x-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold mb-1">{feature.name}</h3>
                        <p className="text-xs text-gray-600">{feature.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              Seamless Integrations
            </h2>
            <p className="text-sm text-gray-600 max-w-2xl mx-auto">
              Connect with your favorite tools and extend functionality
            </p>
          </div>

          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {integrations.map((integration, index) => (
                <div
                  key={index}
                  className="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow text-center"
                >
                  <div className="w-12 h-12 bg-gray-100 rounded-lg mx-auto mb-2 flex items-center justify-center">
                    <Package className="h-6 w-6 text-gray-400" />
                  </div>
                  <p className="text-xs font-medium">{integration.name}</p>
                  <p className="text-2xs text-gray-500">{integration.category}</p>
                </div>
              ))}
            </div>
            <div className="text-center mt-8">
              <p className="text-sm text-gray-600 mb-4">And many more...</p>
              <Link href="/integrations">
                <Button variant="outline">
                  View All Integrations
                  <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Security Features */}
      <section className="py-16 lg:py-24 bg-black text-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <Shield className="h-12 w-12 text-primary mx-auto mb-4" />
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                Enterprise-Grade Security
              </h2>
              <p className="text-sm text-gray-300">
                Your data security is our top priority
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <Lock className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold mb-1">End-to-End Encryption</h3>
                    <p className="text-xs text-gray-400">
                      All data is encrypted at rest and in transit using industry-standard protocols
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <Key className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold mb-1">Multi-Factor Authentication</h3>
                    <p className="text-xs text-gray-400">
                      Additional security layers with MFA and biometric authentication
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <Shield className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold mb-1">SOC 2 Type II Certified</h3>
                    <p className="text-xs text-gray-400">
                      Independently audited and certified for security, availability, and confidentiality
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <Eye className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold mb-1">GDPR Compliant</h3>
                    <p className="text-xs text-gray-400">
                      Full compliance with data protection regulations worldwide
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <Activity className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold mb-1">24/7 Security Monitoring</h3>
                    <p className="text-xs text-gray-400">
                      Round-the-clock monitoring and incident response team
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <RefreshCw className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold mb-1">Regular Security Updates</h3>
                    <p className="text-xs text-gray-400">
                      Continuous security patches and vulnerability assessments
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Performance Stats */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              Built for Performance
            </h2>
            <p className="text-sm text-gray-600 max-w-2xl mx-auto">
              Lightning-fast and reliable at any scale
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary mb-2">99.99%</div>
              <div className="text-xs text-gray-600">Uptime SLA</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary mb-2">&lt;100ms</div>
              <div className="text-xs text-gray-600">Average Response Time</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary mb-2">150+</div>
              <div className="text-xs text-gray-600">Countries Served</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary mb-2">10M+</div>
              <div className="text-xs text-gray-600">API Calls Daily</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 lg:py-24 bg-primary">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-black mb-4">
            Experience the Power of Enterprise Platform
          </h2>
          <p className="text-sm text-black/80 mb-8 max-w-2xl mx-auto">
            See all these features in action with a personalized demo or start your free trial today
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/demo">
              <Button variant="secondary" size="lg">
                Schedule Demo
                <Calendar className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/register">
              <Button variant="outline" size="lg" className="bg-black/10 border-black/20 hover:bg-black/20">
                Start Free Trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black text-white py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-xs font-semibold mb-4">Product</h3>
              <ul className="space-y-2">
                <li><Link href="/features" className="text-xs text-gray-400 hover:text-white">Features</Link></li>
                <li><Link href="/pricing" className="text-xs text-gray-400 hover:text-white">Pricing</Link></li>
                <li><Link href="/security" className="text-xs text-gray-400 hover:text-white">Security</Link></li>
                <li><Link href="/roadmap" className="text-xs text-gray-400 hover:text-white">Roadmap</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold mb-4">Company</h3>
              <ul className="space-y-2">
                <li><Link href="/about" className="text-xs text-gray-400 hover:text-white">About</Link></li>
                <li><Link href="/blog" className="text-xs text-gray-400 hover:text-white">Blog</Link></li>
                <li><Link href="/careers" className="text-xs text-gray-400 hover:text-white">Careers</Link></li>
                <li><Link href="/press" className="text-xs text-gray-400 hover:text-white">Press</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold mb-4">Resources</h3>
              <ul className="space-y-2">
                <li><Link href="/docs" className="text-xs text-gray-400 hover:text-white">Documentation</Link></li>
                <li><Link href="/api" className="text-xs text-gray-400 hover:text-white">API Reference</Link></li>
                <li><Link href="/support" className="text-xs text-gray-400 hover:text-white">Support</Link></li>
                <li><Link href="/status" className="text-xs text-gray-400 hover:text-white">Status</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold mb-4">Legal</h3>
              <ul className="space-y-2">
                <li><Link href="/privacy" className="text-xs text-gray-400 hover:text-white">Privacy</Link></li>
                <li><Link href="/terms" className="text-xs text-gray-400 hover:text-white">Terms</Link></li>
                <li><Link href="/cookies" className="text-xs text-gray-400 hover:text-white">Cookie Policy</Link></li>
                <li><Link href="/licenses" className="text-xs text-gray-400 hover:text-white">Licenses</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 mt-8 pt-8 flex flex-col sm:flex-row items-center justify-between">
            <p className="text-xs text-gray-400">
              © 2024 Enterprise Platform. All rights reserved.
            </p>
            <div className="flex items-center space-x-4 mt-4 sm:mt-0">
              <Lock className="h-4 w-4 text-gray-400" />
              <span className="text-xs text-gray-400">Secured by Enterprise-grade encryption</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
