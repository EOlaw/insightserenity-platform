'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Rocket,
  Target,
  Zap,
  Trophy,
  Calendar,
  CheckCircle,
  Clock,
  Play,
  Pause,
  AlertCircle,
  ArrowRight,
  Users,
  Building2,
  Shield,
  Globe,
  Database,
  Code,
  Bot,
  BarChart3,
  Briefcase,
  UserCheck,
  CreditCard,
  Mail,
  MessageSquare,
  FileText,
  Download,
  Upload,
  RefreshCw,
  Settings,
  Package,
  Layers,
  GitBranch,
  Terminal,
  Eye,
  Bell,
  Headphones,
  BookOpen,
  Search,
  Filter,
  PieChart,
  LineChart,
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
  Hash,
  ThumbsUp,
  Star,
  Heart,
  Send,
  ChevronRight,
  TrendingUp,
  Lock
} from 'lucide-react'

const quarters = [
  {
    name: 'Q1 2024',
    status: 'completed',
    theme: 'Foundation & Stability',
    description: 'Core platform improvements and infrastructure upgrades',
    features: [
      {
        title: 'Multi-Tenant Architecture 2.0',
        description: 'Enhanced isolation and resource management',
        status: 'completed',
        impact: 'high',
        category: 'Infrastructure',
        icon: Building2,
      },
      {
        title: 'Advanced Analytics Dashboard',
        description: 'Real-time metrics and custom KPIs',
        status: 'completed',
        impact: 'high',
        category: 'Analytics',
        icon: BarChart3,
      },
      {
        title: 'SSO Integration',
        description: 'Support for major identity providers',
        status: 'completed',
        impact: 'medium',
        category: 'Security',
        icon: Shield,
      },
      {
        title: 'Mobile App Launch',
        description: 'iOS and Android native applications',
        status: 'completed',
        impact: 'high',
        category: 'Platform',
        icon: Rocket,
      },
    ],
  },
  {
    name: 'Q2 2024',
    status: 'completed',
    theme: 'AI & Automation',
    description: 'Intelligent features and workflow automation',
    features: [
      {
        title: 'AI-Powered Insights',
        description: 'Machine learning for predictive analytics',
        status: 'completed',
        impact: 'high',
        category: 'AI/ML',
        icon: Bot,
      },
      {
        title: 'Workflow Automation',
        description: 'Custom automation rules and triggers',
        status: 'completed',
        impact: 'high',
        category: 'Automation',
        icon: Workflow,
      },
      {
        title: 'Smart Notifications',
        description: 'Context-aware alerts and recommendations',
        status: 'completed',
        impact: 'medium',
        category: 'Communication',
        icon: Bell,
      },
      {
        title: 'API v3 Launch',
        description: 'GraphQL support and improved performance',
        status: 'completed',
        impact: 'high',
        category: 'Developer',
        icon: Code,
      },
    ],
  },
  {
    name: 'Q3 2024',
    status: 'current',
    theme: 'Scale & Performance',
    description: 'Optimization for enterprise scale',
    features: [
      {
        title: 'Global CDN Integration',
        description: 'Faster content delivery worldwide',
        status: 'in-progress',
        impact: 'high',
        category: 'Performance',
        icon: Globe,
        progress: 75,
      },
      {
        title: 'Advanced Search',
        description: 'Elasticsearch integration with filters',
        status: 'in-progress',
        impact: 'medium',
        category: 'Features',
        icon: Search,
        progress: 60,
      },
      {
        title: 'Custom Reporting',
        description: 'Build and schedule custom reports',
        status: 'in-progress',
        impact: 'high',
        category: 'Analytics',
        icon: FileText,
        progress: 40,
      },
      {
        title: 'Team Collaboration 2.0',
        description: 'Real-time editing and video calls',
        status: 'planned',
        impact: 'medium',
        category: 'Collaboration',
        icon: Users,
        progress: 0,
      },
    ],
  },
  {
    name: 'Q4 2024',
    status: 'planned',
    theme: 'Enterprise Features',
    description: 'Advanced capabilities for large organizations',
    features: [
      {
        title: 'Multi-Region Deployment',
        description: 'Deploy across multiple geographic regions',
        status: 'planned',
        impact: 'high',
        category: 'Infrastructure',
        icon: Globe,
      },
      {
        title: 'Advanced Compliance Tools',
        description: 'HIPAA, SOX, and industry-specific compliance',
        status: 'planned',
        impact: 'high',
        category: 'Compliance',
        icon: Shield,
      },
      {
        title: 'White Label Solutions',
        description: 'Full customization and branding options',
        status: 'planned',
        impact: 'medium',
        category: 'Platform',
        icon: Package,
      },
      {
        title: 'Enterprise Marketplace',
        description: 'Third-party integrations and extensions',
        status: 'planned',
        impact: 'high',
        category: 'Ecosystem',
        icon: Building2,
      },
    ],
  },
  {
    name: 'Q1 2025',
    status: 'future',
    theme: 'Next Generation Platform',
    description: 'Revolutionary features and capabilities',
    features: [
      {
        title: 'AI Assistant',
        description: 'Natural language interface for platform control',
        status: 'future',
        impact: 'high',
        category: 'AI/ML',
        icon: Bot,
      },
      {
        title: 'Blockchain Integration',
        description: 'Smart contracts and decentralized features',
        status: 'future',
        impact: 'medium',
        category: 'Innovation',
        icon: Link2,
      },
      {
        title: 'AR/VR Support',
        description: 'Immersive data visualization',
        status: 'future',
        impact: 'low',
        category: 'Innovation',
        icon: Eye,
      },
      {
        title: 'Quantum-Ready Encryption',
        description: 'Future-proof security standards',
        status: 'future',
        impact: 'high',
        category: 'Security',
        icon: Lock,
      },
    ],
  },
]

const recentlyShipped = [
  {
    title: 'Two-Factor Authentication',
    date: '2024-01-15',
    category: 'Security',
  },
  {
    title: 'Custom Domain Support',
    date: '2024-01-08',
    category: 'Platform',
  },
  {
    title: 'Advanced Export Options',
    date: '2023-12-20',
    category: 'Features',
  },
  {
    title: 'Dark Mode',
    date: '2023-12-15',
    category: 'UI/UX',
  },
  {
    title: 'Webhook Events',
    date: '2023-12-01',
    category: 'Developer',
  },
]

const categories = [
  'All',
  'Infrastructure',
  'Analytics',
  'Security',
  'Platform',
  'AI/ML',
  'Automation',
  'Communication',
  'Developer',
  'Performance',
  'Features',
  'Collaboration',
  'Compliance',
  'Ecosystem',
  'Innovation',
  'UI/UX',
]

export default function RoadmapPage() {
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [selectedQuarter, setSelectedQuarter] = useState<string | null>(null)

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-950'
      case 'in-progress': return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-950'
      case 'planned': return 'text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-950'
      case 'future': return 'text-purple-600 bg-purple-100 dark:text-purple-400 dark:bg-purple-950'
      default: return 'text-muted-foreground bg-muted'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4" />
      case 'in-progress': return <Play className="h-4 w-4" />
      case 'planned': return <Clock className="h-4 w-4" />
      case 'future': return <Rocket className="h-4 w-4" />
      default: return <AlertCircle className="h-4 w-4" />
    }
  }

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'text-red-600 dark:text-red-400'
      case 'medium': return 'text-yellow-600 dark:text-yellow-400'
      case 'low': return 'text-green-600 dark:text-green-400'
      default: return 'text-muted-foreground'
    }
  }

  const filteredQuarters = quarters.map(quarter => ({
    ...quarter,
    features: quarter.features.filter(feature =>
      selectedCategory === 'All' || feature.category === selectedCategory
    ),
  }))

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <Logo href="/" showText={false} />
              <div className="hidden md:flex items-center space-x-6">
                <Link href="/features" className="text-xs text-muted-foreground hover:text-foreground transition">
                  Features
                </Link>
                <Link href="/pricing" className="text-xs text-muted-foreground hover:text-foreground transition">
                  Pricing
                </Link>
                <Link href="/roadmap" className="text-xs text-primary font-medium">
                  Roadmap
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
              <Rocket className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6 text-foreground">
              Product Roadmap
            </h1>
            <p className="text-base text-muted-foreground mb-8">
              See what we've shipped, what we're building, and what's coming next.
              Your feedback shapes our priorities.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/feedback">
                <Button size="lg">
                  Submit Feedback
                  <MessageSquare className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/changelog">
                <Button variant="outline" size="lg">
                  View Changelog
                  <FileText className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Category Filter */}
      <section className="py-8 border-b border-border sticky top-16 bg-background z-40">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap gap-2 justify-center">
            {categories.map(category => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                  selectedCategory === category
                    ? 'bg-primary text-black'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Roadmap Timeline */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            {/* Timeline */}
            <div className="relative">
              {/* Vertical Line */}
              <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-border" />

              {/* Quarters */}
              {filteredQuarters.map((quarter, quarterIndex) => (
                <div key={quarterIndex} className="relative mb-12">
                  {/* Quarter Header */}
                  <div className="flex items-center mb-6">
                    <div
                      className={`w-16 h-16 rounded-full flex items-center justify-center z-10 ${
                        quarter.status === 'completed'
                          ? 'bg-green-600'
                          : quarter.status === 'current'
                          ? 'bg-blue-600'
                          : quarter.status === 'planned'
                          ? 'bg-orange-600'
                          : 'bg-purple-600'
                      }`}
                    >
                      {quarter.status === 'completed' ? (
                        <CheckCircle className="h-8 w-8 text-white" />
                      ) : quarter.status === 'current' ? (
                        <Play className="h-8 w-8 text-white" />
                      ) : quarter.status === 'planned' ? (
                        <Clock className="h-8 w-8 text-white" />
                      ) : (
                        <Rocket className="h-8 w-8 text-white" />
                      )}
                    </div>
                    <div className="ml-6">
                      <h3 className="text-xl font-bold flex items-center gap-2 text-foreground">
                        {quarter.name}
                        {quarter.status === 'current' && (
                          <span className="text-xs px-2 py-1 bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400 rounded-full">
                            Current
                          </span>
                        )}
                      </h3>
                      <p className="text-sm font-medium text-foreground">{quarter.theme}</p>
                      <p className="text-xs text-muted-foreground">{quarter.description}</p>
                    </div>
                  </div>

                  {/* Features */}
                  {quarter.features.length > 0 && (
                    <div className="ml-20 grid grid-cols-1 md:grid-cols-2 gap-4">
                      {quarter.features.map((feature, featureIndex) => {
                        const Icon = feature.icon
                        return (
                          <Card
                            key={featureIndex}
                            className={`hover:shadow-lg transition-shadow ${
                              feature.status === 'completed' ? 'opacity-75' : ''
                            }`}
                          >
                            <CardHeader>
                              <div className="flex items-start justify-between">
                                <div className="flex items-start space-x-3">
                                  <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                                    <Icon className="h-4 w-4 text-primary" />
                                  </div>
                                  <div className="flex-1">
                                    <CardTitle className="text-sm">{feature.title}</CardTitle>
                                    <CardDescription className="text-xs mt-1">
                                      {feature.description}
                                    </CardDescription>
                                  </div>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                                      feature.status
                                    )}`}
                                  >
                                    {getStatusIcon(feature.status)}
                                    {feature.status.replace('-', ' ')}
                                  </span>
                                  <span className="text-xs text-muted-foreground">{feature.category}</span>
                                </div>
                                <span className={`text-xs font-medium ${getImpactColor(feature.impact)}`}>
                                  {feature.impact} impact
                                </span>
                              </div>
                              {feature.progress !== undefined && (
                                <div className="mt-3">
                                  <div className="flex items-center justify-between text-xs mb-1">
                                    <span className="text-muted-foreground">Progress</span>
                                    <span className="font-medium text-foreground">{feature.progress}%</span>
                                  </div>
                                  <div className="w-full bg-muted rounded-full h-1.5">
                                    <div
                                      className="bg-blue-600 h-1.5 rounded-full transition-all"
                                      style={{ width: `${feature.progress}%` }}
                                    />
                                  </div>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Recently Shipped */}
      <section className="py-16 lg:py-24 bg-muted/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">
                Recently Shipped
              </h2>
              <p className="text-sm text-muted-foreground">
                Features and improvements we've recently delivered
              </p>
            </div>

            <div className="space-y-3">
              {recentlyShipped.map((item, index) => (
                <Card key={index} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                        <div>
                          <p className="text-sm font-medium text-foreground">{item.title}</p>
                          <p className="text-xs text-muted-foreground">{item.category}</p>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">{item.date}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="text-center mt-8">
              <Link href="/changelog">
                <Button variant="outline">
                  View Full Changelog
                  <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Feedback CTA */}
      <section className="py-16 lg:py-24 bg-primary">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-black mb-4">
            Shape Our Roadmap
          </h2>
          <p className="text-sm text-black/80 mb-8 max-w-2xl mx-auto">
            Your feedback directly influences our priorities. Tell us what features
            you need most and vote on upcoming developments.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/feedback">
              <Button variant="secondary" size="lg">
                Submit Feature Request
                <ThumbsUp className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/feedback/vote">
              <Button variant="outline" size="lg" className="bg-black/10 border-black/20 hover:bg-black/20">
                Vote on Features
                <Star className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}