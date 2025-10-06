'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Headphones,
  MessageSquare,
  Mail,
  Phone,
  Clock,
  Search,
  Book,
  FileText,
  Video,
  Users,
  Shield,
  Settings,
  CreditCard,
  Database,
  Code,
  AlertCircle,
  CheckCircle,
  Info,
  HelpCircle,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  ExternalLink,
  Zap,
  Target,
  BarChart3,
  Building2,
  Globe,
  Calendar,
  Star,
  ThumbsUp,
  MessageCircle,
  Send,
  Upload,
  Download,
  RefreshCw,
  Package,
  Briefcase,
  UserCheck,
  Bot,
  Sparkles,
  LifeBuoy,
  Ticket,
} from 'lucide-react'

const supportCategories = [
  {
    title: 'Getting Started',
    icon: Zap,
    description: 'New to the platform? Start here',
    articles: 42,
    popular: [
      'Quick Start Guide',
      'Account Setup',
      'First Project',
      'Inviting Team Members',
    ],
  },
  {
    title: 'Account & Billing',
    icon: CreditCard,
    description: 'Manage your account and subscriptions',
    articles: 38,
    popular: [
      'Update Payment Method',
      'Change Subscription Plan',
      'Download Invoices',
      'Cancel Subscription',
    ],
  },
  {
    title: 'Technical Support',
    icon: Settings,
    description: 'Technical issues and troubleshooting',
    articles: 67,
    popular: [
      'API Error Codes',
      'Integration Issues',
      'Performance Problems',
      'Data Import/Export',
    ],
  },
  {
    title: 'Security & Privacy',
    icon: Shield,
    description: 'Security settings and data protection',
    articles: 29,
    popular: [
      'Two-Factor Authentication',
      'Data Encryption',
      'GDPR Compliance',
      'Security Best Practices',
    ],
  },
  {
    title: 'Platform Features',
    icon: Package,
    description: 'Learn about platform capabilities',
    articles: 85,
    popular: [
      'Dashboard Overview',
      'Reports & Analytics',
      'Team Collaboration',
      'Custom Workflows',
    ],
  },
  {
    title: 'Integrations',
    icon: Globe,
    description: 'Connect with third-party services',
    articles: 53,
    popular: [
      'Slack Integration',
      'Google Workspace',
      'Microsoft Teams',
      'Zapier Setup',
    ],
  },
]

const contactOptions = [
  {
    title: 'Live Chat',
    description: 'Chat with our support team in real-time',
    icon: MessageSquare,
    availability: '24/7',
    responseTime: 'Instant',
    action: 'Start Chat',
  },
  {
    title: 'Email Support',
    description: 'Send us a detailed message',
    icon: Mail,
    availability: '24/7',
    responseTime: '< 4 hours',
    action: 'Send Email',
  },
  {
    title: 'Phone Support',
    description: 'Talk to our support team',
    icon: Phone,
    availability: 'Mon-Fri, 9am-6pm EST',
    responseTime: '< 5 min wait',
    action: 'Call Now',
  },
  {
    title: 'Schedule Call',
    description: 'Book a support call at your convenience',
    icon: Calendar,
    availability: 'By appointment',
    responseTime: 'Scheduled',
    action: 'Book Call',
  },
]

const popularArticles = [
  {
    title: 'How to Set Up Single Sign-On (SSO)',
    category: 'Security',
    views: 15234,
    helpful: 92,
  },
  {
    title: 'Troubleshooting API Connection Issues',
    category: 'Technical',
    views: 12456,
    helpful: 88,
  },
  {
    title: 'Managing User Permissions and Roles',
    category: 'Account',
    views: 11234,
    helpful: 95,
  },
  {
    title: 'Creating Custom Reports and Dashboards',
    category: 'Features',
    views: 9876,
    helpful: 90,
  },
  {
    title: 'Importing Data from Other Platforms',
    category: 'Getting Started',
    views: 8765,
    helpful: 87,
  },
  {
    title: 'Setting Up Webhook Notifications',
    category: 'Integrations',
    views: 7654,
    helpful: 91,
  },
]

const supportPlans = [
  {
    name: 'Basic',
    description: 'Email support during business hours',
    features: [
      'Email support (48hr response)',
      'Access to knowledge base',
      'Community forum',
    ],
    included: 'Free & Starter plans',
  },
  {
    name: 'Priority',
    description: 'Fast support with priority queue',
    features: [
      'Priority email (4hr response)',
      'Live chat support',
      'Phone support (business hours)',
      'Screen sharing sessions',
    ],
    included: 'Professional plans',
  },
  {
    name: 'Premium',
    description: '24/7 dedicated support',
    features: [
      '24/7 phone & chat support',
      'Dedicated account manager',
      'Custom SLA',
      'On-site training available',
      'Priority bug fixes',
    ],
    included: 'Enterprise plans',
  },
]

const videoTutorials = [
  { title: 'Platform Overview', duration: '12:34', views: 5432 },
  { title: 'Getting Started Guide', duration: '15:22', views: 4321 },
  { title: 'Advanced Features', duration: '18:45', views: 3210 },
  { title: 'API Integration', duration: '20:15', views: 2987 },
]

export default function SupportPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)

  const faqs = [
    {
      question: 'How do I reset my password?',
      answer: 'You can reset your password by clicking the "Forgot Password" link on the login page. Enter your email address and we\'ll send you instructions to reset your password.',
    },
    {
      question: 'How do I upgrade my subscription?',
      answer: 'Go to Settings > Billing > Subscription and click "Change Plan". Select your new plan and follow the prompts to upgrade.',
    },
    {
      question: 'Can I export my data?',
      answer: 'Yes, you can export all your data at any time. Go to Settings > Data > Export and choose your preferred format (CSV, JSON, or XML).',
    },
    {
      question: 'How do I add team members?',
      answer: 'Navigate to Settings > Team > Members and click "Invite Member". Enter their email address and select their role and permissions.',
    },
    {
      question: 'What payment methods do you accept?',
      answer: 'We accept all major credit cards (Visa, MasterCard, American Express), PayPal, and wire transfers for Enterprise customers.',
    },
  ]

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
                <Link href="/docs" className="text-xs text-gray-600 hover:text-gray-900 transition">
                  Documentation
                </Link>
                <Link href="/support" className="text-xs text-primary font-medium">
                  Support
                </Link>
                <Link href="/status" className="text-xs text-gray-600 hover:text-gray-900 transition">
                  Status
                </Link>
                <Link href="/community" className="text-xs text-gray-600 hover:text-gray-900 transition">
                  Community
                </Link>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Button variant="ghost" size="sm">
                <Ticket className="h-3.5 w-3.5 mr-2" />
                My Tickets
              </Button>
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
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-6">
              <Headphones className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6">
              How Can We Help You?
            </h1>
            <p className="text-base text-gray-600 mb-8">
              Get answers from our knowledge base or reach out to our support team.
              We're here to help you succeed.
            </p>

            {/* Search Bar */}
            <div className="max-w-xl mx-auto relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search for help articles..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex items-center justify-center gap-6 mt-8">
              <span className="text-sm text-gray-600 flex items-center">
                <CheckCircle className="h-4 w-4 text-green-600 mr-1" />
                99.9% uptime
              </span>
              <span className="text-sm text-gray-600 flex items-center">
                <Clock className="h-4 w-4 text-blue-600 mr-1" />
                &lt;4hr response time
              </span>
              <span className="text-sm text-gray-600 flex items-center">
                <Star className="h-4 w-4 text-yellow-600 mr-1" />
                4.9/5 satisfaction
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Support Categories */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">Browse Help Topics</h2>
            <p className="text-sm text-gray-600">Find answers organized by category</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {supportCategories.map((category, index) => {
              const Icon = category.icon
              return (
                <Card key={index} className="hover:shadow-lg transition-shadow cursor-pointer">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <span className="text-xs text-gray-500">{category.articles} articles</span>
                    </div>
                    <CardTitle className="text-base mt-3">{category.title}</CardTitle>
                    <CardDescription className="text-xs">
                      {category.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1">
                      {category.popular.slice(0, 3).map((article, idx) => (
                        <li key={idx} className="text-xs text-gray-600 hover:text-primary flex items-center">
                          <ChevronRight className="h-3 w-3 mr-1" />
                          {article}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Link href={`/support/${category.title.toLowerCase().replace(' ', '-')}`} className="text-xs text-primary hover:underline flex items-center">
                      View all articles
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      {/* Contact Options */}
      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">Contact Support</h2>
            <p className="text-sm text-gray-600">Choose your preferred way to get help</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {contactOptions.map((option, index) => {
              const Icon = option.icon
              return (
                <Card key={index} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mb-3">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-base">{option.title}</CardTitle>
                    <CardDescription className="text-xs">
                      {option.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-xs text-gray-600">
                      <div className="flex items-center justify-between">
                        <span>Availability:</span>
                        <span className="font-medium">{option.availability}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Response:</span>
                        <span className="font-medium">{option.responseTime}</span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button size="sm" className="w-full">
                      {option.action}
                    </Button>
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      {/* Popular Articles */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">Popular Articles</h2>
              <p className="text-sm text-gray-600">Most viewed help articles this week</p>
            </div>

            <div className="space-y-3">
              {popularArticles.map((article, index) => (
                <Card key={index} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Link href="#" className="text-sm font-medium hover:text-primary">
                          {article.title}
                        </Link>
                        <div className="flex items-center gap-4 mt-1">
                          <span className="text-xs text-gray-500">{article.category}</span>
                          <span className="text-xs text-gray-500 flex items-center">
                            <Users className="h-3 w-3 mr-1" />
                            {article.views.toLocaleString()} views
                          </span>
                          <span className="text-xs text-green-600 flex items-center">
                            <ThumbsUp className="h-3 w-3 mr-1" />
                            {article.helpful}% helpful
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="text-center mt-8">
              <Link href="/support/articles">
                <Button variant="outline">
                  Browse All Articles
                  <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Support Plans */}
      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">Support Plans</h2>
            <p className="text-sm text-gray-600">Different levels of support for different needs</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {supportPlans.map((plan, index) => (
              <Card key={index} className={index === 2 ? 'border-primary shadow-lg' : ''}>
                {index === 2 && (
                  <div className="bg-primary text-black text-xs text-center py-1 font-medium">
                    Recommended for Enterprises
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  <CardDescription className="text-xs">
                    {plan.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start space-x-2">
                        <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                        <span className="text-xs text-gray-700">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-gray-500 mt-4 pt-4 border-t">
                    Included with: <span className="font-medium">{plan.included}</span>
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Video Tutorials */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">Video Tutorials</h2>
              <p className="text-sm text-gray-600">Learn with step-by-step video guides</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {videoTutorials.map((video, index) => (
                <Card key={index} className="hover:shadow-lg transition-shadow">
                  <div className="aspect-video bg-gray-200 rounded-t-lg flex items-center justify-center">
                    <Video className="h-12 w-12 text-gray-400" />
                  </div>
                  <CardContent className="pt-4">
                    <h3 className="text-sm font-medium">{video.title}</h3>
                    <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                      <span>{video.duration}</span>
                      <span>{video.views.toLocaleString()} views</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="text-center mt-8">
              <Link href="/tutorials">
                <Button variant="outline">
                  View All Tutorials
                  <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">Frequently Asked Questions</h2>
              <p className="text-sm text-gray-600">Quick answers to common questions</p>
            </div>

            <div className="space-y-4">
              {faqs.map((faq, index) => (
                <Card key={index} className="cursor-pointer" onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">{faq.question}</h3>
                      {expandedFaq === index ? (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                  </CardHeader>
                  {expandedFaq === index && (
                    <CardContent>
                      <p className="text-xs text-gray-600">{faq.answer}</p>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 lg:py-24 bg-primary">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-black mb-4">
            Still Need Help?
          </h2>
          <p className="text-sm text-black/80 mb-8 max-w-2xl mx-auto">
            Our support team is standing by to assist you with any questions or issues
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button variant="secondary" size="lg">
              <MessageSquare className="mr-2 h-4 w-4" />
              Start Live Chat
            </Button>
            <Button variant="outline" size="lg" className="bg-black/10 border-black/20 hover:bg-black/20">
              <Ticket className="mr-2 h-4 w-4" />
              Submit Ticket
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
