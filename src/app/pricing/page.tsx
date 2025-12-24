'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Check,
  X,
  ArrowRight,
  Star,
  Shield,
  Zap,
  Building2,
  Users,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Rocket,
  Globe,
  Lock,
  Headphones,
  Database,
  BarChart3,
  CreditCard,
  Award,
  TrendingUp,
  Calendar,
  Download,
  Package,
  Code,
  Settings,
  Mail,
  Phone,
  MessageSquare,
  UserCheck,
  Briefcase,
  Target,
  FileText,
} from 'lucide-react'
import toast from 'react-hot-toast'

const plans = [
  {
    name: 'Starter',
    description: 'Perfect for boutique consulting firms and specialized agencies',
    price: { monthly: 39, annual: 32 },
    popular: false,
    userLimit: 'Up to 25 users',
    targetAudience: 'Boutique firms with 10-25 employees',
    features: [
      { name: 'Up to 25 users', included: true },
      { name: '5 GB storage', included: true },
      { name: 'Core consultant profile management', included: true },
      { name: 'Basic client relationship tracking', included: true },
      { name: 'Simple project assignment workflows', included: true },
      { name: 'Standard reporting', included: true },
      { name: 'Email support (48-hour response)', included: true },
      { name: 'Consultant availability calendar', included: true },
      { name: 'Basic recruitment pipeline', included: true },
      { name: 'Mobile app access', included: true },
      { name: 'SSL encryption', included: true },
      { name: 'Advanced analytics dashboards', included: false },
      { name: 'Custom branding', included: false },
      { name: 'API access', included: false },
      { name: 'SSO authentication', included: false },
      { name: 'Priority support', included: false },
      { name: 'Dedicated account manager', included: false },
      { name: 'Custom integrations', included: false },
      { name: 'SLA guarantee', included: false },
    ],
    cta: 'Start Free Trial',
    color: 'gray',
  },
  {
    name: 'Professional',
    description: 'For growing firms scaling their consulting and recruitment operations',
    price: { monthly: 119, annual: 99 },
    popular: true,
    userLimit: 'Up to 200 users',
    targetAudience: 'Growing firms with 25-150 employees',
    features: [
      { name: 'Up to 200 users', included: true },
      { name: '250 GB storage', included: true },
      { name: 'Advanced consultant profile system', included: true },
      { name: 'Comprehensive client management', included: true },
      { name: 'Advanced project assignment & tracking', included: true },
      { name: 'Advanced analytics & dashboards', included: true },
      { name: 'Email & chat support (8-hour response)', included: true },
      { name: 'Consultant utilization tracking', included: true },
      { name: 'Full recruitment pipeline management', included: true },
      { name: 'Mobile app access', included: true },
      { name: 'SSL encryption & advanced security', included: true },
      { name: 'Project profitability analysis', included: true },
      { name: 'Custom branding options', included: true },
      { name: 'Full API access', included: true },
      { name: 'SSO authentication', included: true },
      { name: 'Extended business hour support', included: true },
      { name: 'Client engagement metrics', included: true },
      { name: 'Role-based access controls', included: true },
      { name: 'Custom integrations (limited)', included: false },
      { name: 'Dedicated account manager', included: false },
      { name: '99.9% SLA guarantee', included: false },
    ],
    cta: 'Start Free Trial',
    color: 'primary',
  },
  {
    name: 'Enterprise',
    description: 'Tailored solutions for large consulting firms and global agencies',
    price: { monthly: 'Custom', annual: 'Custom' },
    popular: false,
    userLimit: 'Unlimited users',
    targetAudience: 'Enterprise firms with 150+ employees',
    minimumContract: '$60,000 annual minimum',
    features: [
      { name: 'Unlimited users', included: true },
      { name: 'Unlimited storage', included: true },
      { name: 'Enterprise consultant management', included: true },
      { name: 'Multi-office client relationship system', included: true },
      { name: 'Complex project delivery workflows', included: true },
      { name: 'Custom analytics & reporting', included: true },
      { name: '24/7 phone & chat support (1-hour response)', included: true },
      { name: 'Real-time utilization dashboards', included: true },
      { name: 'Enterprise recruitment operations', included: true },
      { name: 'Mobile app with offline capabilities', included: true },
      { name: 'Enterprise-grade security & compliance', included: true },
      { name: 'Revenue forecasting & predictive analytics', included: true },
      { name: 'Complete white-label branding', included: true },
      { name: 'Unlimited API access', included: true },
      { name: 'SAML authentication', included: true },
      { name: 'Dedicated customer success manager', included: true },
      { name: 'Custom consultant matching algorithms', included: true },
      { name: 'Advanced audit logging', included: true },
      { name: 'Unlimited custom integrations', included: true },
      { name: 'On-premise deployment option', included: true },
      { name: '99.99% SLA guarantee', included: true },
      { name: 'SOC 2, ISO 27001, GDPR compliance', included: true },
    ],
    cta: 'Contact Sales',
    color: 'purple',
  },
]

const addons = [
  {
    name: 'Consultant Skills Assessment',
    description: 'Advanced skills testing and certification tracking for consultants',
    price: '$299/month',
    icon: Award,
  },
  {
    name: 'Client Portal Plus',
    description: 'Enhanced client self-service with custom branding and advanced features',
    price: '$199/month',
    icon: Building2,
  },
  {
    name: 'Compliance & Audit Suite',
    description: 'Industry-specific compliance tracking and audit trail management',
    price: '$399/month',
    icon: Shield,
  },
  {
    name: 'Advanced Recruitment Analytics',
    description: 'AI-powered recruitment insights and candidate sourcing optimization',
    price: '$249/month',
    icon: TrendingUp,
  },
]

const faqs = [
  {
    question: 'How quickly can we migrate our existing consultant database?',
    answer: 'Most firms complete data migration within 2-3 business days using our guided import tools. Professional and Enterprise customers receive dedicated migration support to ensure zero downtime and data integrity throughout the process.',
  },
  {
    question: 'Can consultants update their own profiles and availability?',
    answer: 'Yes, all plans include consultant self-service portals where consultants can update their profiles, mark availability, submit time entries, and track assignments. Administrators maintain oversight and approval capabilities as needed.',
  },
  {
    question: 'How does the platform handle client confidentiality?',
    answer: 'InsightSerenity implements enterprise-grade security with tenant isolation, role-based access controls, and comprehensive audit logging. All data is encrypted in transit and at rest, with SOC 2 and ISO 27001 compliance available for Enterprise customers.',
  },
  {
    question: 'Does the system integrate with our existing billing and accounting software?',
    answer: 'Professional and Enterprise plans include API access for custom integrations. We provide pre-built connectors for major accounting platforms like QuickBooks, Xero, and NetSuite. Enterprise customers can request custom integration development.',
  },
  {
    question: 'What happens during the free trial period?',
    answer: 'The 14-day trial includes full access to all features in your selected plan tier. You can import real data, configure workflows, and invite your team. No credit card is required to start, and you can upgrade, downgrade, or cancel at any time.',
  },
  {
    question: 'How does pricing work as our firm grows?',
    answer: 'You only pay for active users. As you add consultants or staff, your monthly cost scales proportionally. Professional customers can add users up to 200 before needing to upgrade to Enterprise. We offer volume discounts for larger deployments.',
  },
  {
    question: 'Can we track consultant performance and client feedback?',
    answer: 'Yes, all plans include performance tracking capabilities. Professional and Enterprise tiers provide advanced analytics on consultant utilization, client satisfaction ratings, project success metrics, and individual consultant performance trends over time.',
  },
  {
    question: 'What support is included for implementation and training?',
    answer: 'Starter customers receive comprehensive documentation and video tutorials. Professional customers get email and chat support with 8-hour response times. Enterprise customers receive dedicated onboarding, custom training sessions, and a dedicated customer success manager.',
  },
]

const testimonials = [
  {
    quote: 'InsightSerenity transformed our consultant management overnight. We increased utilization rates by 23% in the first quarter and can now handle twice the client volume with the same team.',
    author: 'David Morrison',
    role: 'Managing Partner, Strategic Advisors Group',
    rating: 5,
  },
  {
    quote: 'The recruitment pipeline features cut our time-to-hire in half. We track candidates from sourcing through onboarding seamlessly, and the integration with our consultant profiles is brilliant.',
    author: 'Jennifer Wu',
    role: 'Head of Talent Acquisition, Executive Search Partners',
    rating: 5,
  },
  {
    quote: 'As a global consulting firm, we needed enterprise-grade security and multi-office capabilities. InsightSerenity delivered both while remaining intuitive enough for our entire team to adopt within weeks.',
    author: 'Robert Callahan',
    role: 'COO, International Consulting Associates',
    rating: 5,
  },
]

export default function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('annual')
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)

  const handlePlanSelect = (planName: string) => {
    if (planName === 'Enterprise') {
      window.location.href = '/contact?type=sales'
    } else {
      window.location.href = `/register?plan=${planName.toLowerCase()}`
    }
  }

  const toggleFaq = (index: number) => {
    setExpandedFaq(expandedFaq === index ? null : index)
  }

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
                <Link href="/pricing" className="text-xs text-primary font-medium">
                  Pricing
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
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center space-x-2 bg-primary/10 rounded-full px-4 py-2 mb-6">
              <Briefcase className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-primary">Purpose-Built for Professional Services</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6 text-foreground">
              Pricing for Consulting & Recruitment Firms
            </h1>
            <p className="text-base text-muted-foreground mb-8">
              Transparent pricing designed for firms managing consultants and recruitment operations. 
              From boutique agencies to global enterprises, choose the plan that matches your scale.
            </p>

            {/* Billing Toggle */}
            <div className="inline-flex items-center space-x-4 bg-gray-100 dark:bg-gray-800 rounded-full p-1">
              <button
                onClick={() => setBillingPeriod('monthly')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                  billingPeriod === 'monthly'
                    ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingPeriod('annual')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                  billingPeriod === 'annual'
                    ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Annual
                <span className="ml-2 text-xs text-green-600 dark:text-green-400">Save 18%</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {plans.map((plan, index) => (
              <Card
                key={index}
                className={`relative ${
                  plan.popular ? 'shadow-xl border-primary' : 'hover:shadow-lg'
                } transition-shadow`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-primary text-black text-xs font-semibold px-3 py-1 rounded-full flex items-center">
                      <Star className="h-3 w-3 mr-1" />
                      Most Popular
                    </span>
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription className="text-xs">
                    {plan.description}
                  </CardDescription>
                  <div className="mt-2 pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground">{plan.targetAudience}</p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <div className="flex items-baseline">
                      {typeof plan.price.monthly === 'number' ? (
                        <>
                          <span className="text-3xl font-bold text-foreground">
                            ${billingPeriod === 'monthly' ? plan.price.monthly : plan.price.annual}
                          </span>
                          <span className="text-sm text-muted-foreground ml-2">
                            per user/month
                          </span>
                        </>
                      ) : (
                        <span className="text-3xl font-bold text-foreground">{plan.price.monthly}</span>
                      )}
                    </div>
                    {billingPeriod === 'annual' && typeof plan.price.monthly === 'number' && (
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                        Save ${(plan.price.monthly - plan.price.annual) * 12} per user/year
                      </p>
                    )}
                    {plan.minimumContract && (
                      <p className="text-xs text-muted-foreground mt-2">{plan.minimumContract}</p>
                    )}
                  </div>

                  <div className="bg-muted/30 rounded-lg p-3">
                    <div className="flex items-center space-x-2">
                      <Users className="h-4 w-4 text-primary" />
                      <span className="text-xs font-medium text-foreground">{plan.userLimit}</span>
                    </div>
                  </div>

                  <Button
                    fullWidth
                    variant={plan.popular ? 'default' : 'outline'}
                    onClick={() => handlePlanSelect(plan.name)}
                  >
                    {plan.cta}
                    <ArrowRight className="ml-2 h-3.5 w-3.5" />
                  </Button>

                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-foreground">Key features included:</p>
                    <ul className="space-y-2">
                      {plan.features.slice(0, 10).map((feature, idx) => (
                        <li key={idx} className="flex items-start space-x-2">
                          {feature.included ? (
                            <Check className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                          ) : (
                            <X className="h-4 w-4 text-muted-foreground/30 mt-0.5 flex-shrink-0" />
                          )}
                          <span className={`text-xs ${
                            feature.included ? 'text-foreground' : 'text-muted-foreground'
                          }`}>
                            {feature.name}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
                <CardFooter>
                  <Link
                    href="#features-comparison"
                    className="text-xs text-primary hover:underline flex items-center mx-auto"
                  >
                    See all features
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>

          {/* Value Proposition Banner */}
          <div className="mt-12 max-w-4xl mx-auto">
            <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Target className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-1">Purpose-Built Platform</h3>
                      <p className="text-xs text-muted-foreground">
                        Designed specifically for consulting and recruitment firms, not generic project management
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <BarChart3 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-1">Consultant-Centric Analytics</h3>
                      <p className="text-xs text-muted-foreground">
                        Track utilization, profitability, and performance with industry-specific metrics
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <UserCheck className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-1">Integrated Recruitment</h3>
                      <p className="text-xs text-muted-foreground">
                        Manage the entire lifecycle from candidate sourcing to active consultant
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features Comparison */}
      <section id="features-comparison" className="py-16 lg:py-24 bg-muted/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">
              Detailed Features Comparison
            </h2>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
              Compare all capabilities across our plans to find the perfect fit for your firm
            </p>
          </div>

          <div className="max-w-6xl mx-auto overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-4 px-4 text-sm font-semibold text-foreground">Features</th>
                  {plans.map((plan, idx) => (
                    <th key={idx} className="text-center py-4 px-4">
                      <div className="text-sm font-semibold text-foreground">{plan.name}</div>
                      {typeof plan.price.monthly === 'number' && (
                        <div className="text-xs text-muted-foreground mt-1">
                          ${billingPeriod === 'monthly' ? plan.price.monthly : plan.price.annual}/mo
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plans[0].features.map((_, featureIdx) => (
                  <tr key={featureIdx} className="border-b border-border hover:bg-muted/20">
                    <td className="py-3 px-4 text-xs text-foreground">{plans[0].features[featureIdx].name}</td>
                    {plans.map((plan, planIdx) => (
                      <td key={planIdx} className="text-center py-3 px-4">
                        {plan.features[featureIdx].included ? (
                          <Check className="h-4 w-4 text-green-600 dark:text-green-400 mx-auto" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground/30 mx-auto" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Add-ons */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">
              Specialized Add-ons for Professional Services
            </h2>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
              Enhance your platform with industry-specific capabilities designed for consulting and recruitment excellence
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {addons.map((addon, index) => {
              const Icon = addon.icon
              return (
                <Card key={index} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mb-3">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-base">{addon.name}</CardTitle>
                    <CardDescription className="text-xs">
                      {addon.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm font-semibold text-primary">{addon.price}</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-16 lg:py-24 bg-muted/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">
              Trusted by Consulting and Recruitment Leaders
            </h2>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
              See how professional services firms are transforming their operations with InsightSerenity
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {testimonials.map((testimonial, index) => (
              <Card key={index}>
                <CardContent className="pt-6">
                  <div className="flex mb-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 text-yellow-500 fill-current" />
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground mb-4 italic">"{testimonial.quote}"</p>
                  <div>
                    <p className="text-xs font-semibold text-foreground">{testimonial.author}</p>
                    <p className="text-xs text-muted-foreground">{testimonial.role}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">
              Frequently Asked Questions
            </h2>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
              Common questions from consulting and recruitment firms about our platform
            </p>
          </div>

          <div className="max-w-3xl mx-auto space-y-4">
            {faqs.map((faq, index) => (
              <Card key={index} className="cursor-pointer" onClick={() => toggleFaq(index)}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">{faq.question}</h3>
                    {expandedFaq === index ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                  </div>
                </CardHeader>
                {expandedFaq === index && (
                  <CardContent>
                    <p className="text-xs text-muted-foreground">{faq.answer}</p>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>

          <div className="text-center mt-12">
            <p className="text-sm text-muted-foreground mb-4">Need specific information for your firm?</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/contact">
                <Button variant="outline">
                  <MessageSquare className="mr-2 h-3.5 w-3.5" />
                  Contact Support
                </Button>
              </Link>
              <Link href="/contact?type=sales">
                <Button>
                  <Phone className="mr-2 h-3.5 w-3.5" />
                  Talk to Sales Team
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 lg:py-24 bg-primary">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-black mb-4">
            Transform Your Consulting Operations Today
          </h2>
          <p className="text-sm text-black/80 mb-8 max-w-2xl mx-auto">
            Join hundreds of consulting and recruitment firms already maximizing consultant utilization 
            and streamlining their operations with InsightSerenity.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/register">
              <Button variant="secondary" size="lg">
                Start 14-Day Free Trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/demo">
              <Button variant="outline" size="lg" className="bg-black/10 border-black/20 hover:bg-black/20">
                Schedule a Demo
                <Calendar className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
          <p className="text-xs text-black/60 mt-6">
            No credit card required • Full feature access • Guided onboarding included
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-secondary dark:bg-gray-950 text-secondary-foreground py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-xs font-semibold mb-4">Product</h3>
              <ul className="space-y-2">
                <li><Link href="/features" className="text-xs text-muted-foreground hover:text-foreground">Features</Link></li>
                <li><Link href="/pricing" className="text-xs text-muted-foreground hover:text-foreground">Pricing</Link></li>
                <li><Link href="/security" className="text-xs text-muted-foreground hover:text-foreground">Security</Link></li>
                <li><Link href="/integrations" className="text-xs text-muted-foreground hover:text-foreground">Integrations</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold mb-4">Solutions</h3>
              <ul className="space-y-2">
                <li><Link href="/consulting-firms" className="text-xs text-muted-foreground hover:text-foreground">Consulting Firms</Link></li>
                <li><Link href="/recruitment-agencies" className="text-xs text-muted-foreground hover:text-foreground">Recruitment Agencies</Link></li>
                <li><Link href="/enterprise" className="text-xs text-muted-foreground hover:text-foreground">Enterprise</Link></li>
                <li><Link href="/case-studies" className="text-xs text-muted-foreground hover:text-foreground">Case Studies</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold mb-4">Resources</h3>
              <ul className="space-y-2">
                <li><Link href="/docs" className="text-xs text-muted-foreground hover:text-foreground">Documentation</Link></li>
                <li><Link href="/api" className="text-xs text-muted-foreground hover:text-foreground">API Reference</Link></li>
                <li><Link href="/support" className="text-xs text-muted-foreground hover:text-foreground">Support Center</Link></li>
                <li><Link href="/blog" className="text-xs text-muted-foreground hover:text-foreground">Blog</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold mb-4">Company</h3>
              <ul className="space-y-2">
                <li><Link href="/about" className="text-xs text-muted-foreground hover:text-foreground">About Us</Link></li>
                <li><Link href="/contact" className="text-xs text-muted-foreground hover:text-foreground">Contact</Link></li>
                <li><Link href="/careers" className="text-xs text-muted-foreground hover:text-foreground">Careers</Link></li>
                <li><Link href="/privacy" className="text-xs text-muted-foreground hover:text-foreground">Privacy Policy</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 dark:border-border mt-8 pt-8 flex flex-col sm:flex-row items-center justify-between">
            <p className="text-xs text-muted-foreground">
              © 2024 InsightSerenity. All rights reserved.
            </p>
            <div className="flex items-center space-x-4 mt-4 sm:mt-0">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">SOC 2 & ISO 27001 Certified</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}