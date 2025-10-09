'use client'

import { useState } from 'react'
import Link from 'next/link'
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
} from 'lucide-react'
import toast from 'react-hot-toast'

const plans = [
  {
    name: 'Starter',
    description: 'Perfect for small teams getting started',
    price: { monthly: 29, annual: 24 },
    popular: false,
    features: [
      { name: 'Up to 10 users', included: true },
      { name: '5 GB storage', included: true },
      { name: 'Basic analytics', included: true },
      { name: 'Email support', included: true },
      { name: 'API access', included: true },
      { name: 'Mobile app', included: true },
      { name: 'SSL encryption', included: true },
      { name: 'Daily backups', included: true },
      { name: 'Custom domain', included: false },
      { name: 'SSO authentication', included: false },
      { name: 'Advanced security', included: false },
      { name: 'Priority support', included: false },
      { name: 'Custom integrations', included: false },
      { name: 'Dedicated account manager', included: false },
      { name: 'SLA guarantee', included: false },
    ],
    cta: 'Start Free Trial',
    color: 'gray',
  },
  {
    name: 'Professional',
    description: 'For growing businesses with advanced needs',
    price: { monthly: 99, annual: 84 },
    popular: true,
    features: [
      { name: 'Up to 50 users', included: true },
      { name: '100 GB storage', included: true },
      { name: 'Advanced analytics', included: true },
      { name: 'Priority email & chat support', included: true },
      { name: 'Full API access', included: true },
      { name: 'Mobile app', included: true },
      { name: 'SSL encryption', included: true },
      { name: 'Hourly backups', included: true },
      { name: 'Custom domain', included: true },
      { name: 'SSO authentication', included: true },
      { name: 'Advanced security', included: true },
      { name: 'Priority support', included: true },
      { name: 'Custom integrations', included: false },
      { name: 'Dedicated account manager', included: false },
      { name: '99.9% SLA guarantee', included: false },
    ],
    cta: 'Start Free Trial',
    color: 'primary',
  },
  {
    name: 'Enterprise',
    description: 'Tailored solutions for large organizations',
    price: { monthly: 'Custom', annual: 'Custom' },
    popular: false,
    features: [
      { name: 'Unlimited users', included: true },
      { name: 'Unlimited storage', included: true },
      { name: 'Custom analytics & reporting', included: true },
      { name: '24/7 phone & chat support', included: true },
      { name: 'Full API access', included: true },
      { name: 'Mobile app', included: true },
      { name: 'SSL encryption', included: true },
      { name: 'Real-time backups', included: true },
      { name: 'Multiple custom domains', included: true },
      { name: 'SSO & SAML authentication', included: true },
      { name: 'Enterprise security', included: true },
      { name: 'Dedicated priority support', included: true },
      { name: 'Unlimited custom integrations', included: true },
      { name: 'Dedicated account manager', included: true },
      { name: '99.99% SLA guarantee', included: true },
    ],
    cta: 'Contact Sales',
    color: 'purple',
  },
]

const addons = [
  {
    name: 'Additional Storage',
    description: 'Expand your storage capacity',
    price: '$10/month per 100 GB',
    icon: Database,
  },
  {
    name: 'Advanced Analytics',
    description: 'Deeper insights and custom reports',
    price: '$29/month',
    icon: BarChart3,
  },
  {
    name: 'White Label',
    description: 'Remove our branding and use yours',
    price: '$49/month',
    icon: Award,
  },
  {
    name: 'API Rate Limit Increase',
    description: 'Higher API request limits',
    price: '$19/month',
    icon: Zap,
  },
]

const faqs = [
  {
    question: 'Can I change my plan later?',
    answer: 'Yes, you can upgrade or downgrade your plan at any time. Changes will be reflected in your next billing cycle.',
  },
  {
    question: 'Is there a free trial?',
    answer: 'Yes, we offer a 14-day free trial for all plans except Enterprise. No credit card required.',
  },
  {
    question: 'What payment methods do you accept?',
    answer: 'We accept all major credit cards, PayPal, and wire transfers for Enterprise plans.',
  },
  {
    question: 'Can I cancel my subscription?',
    answer: 'Yes, you can cancel your subscription at any time. You\'ll continue to have access until the end of your billing period.',
  },
  {
    question: 'Do you offer discounts for nonprofits?',
    answer: 'Yes, we offer a 30% discount for registered nonprofits. Contact our sales team for more information.',
  },
  {
    question: 'What happens to my data if I cancel?',
    answer: 'You can export all your data before cancellation. We keep your data for 30 days after cancellation in case you want to reactivate.',
  },
  {
    question: 'Is there a setup fee?',
    answer: 'No, there are no setup fees for any of our plans. Enterprise customers may opt for professional onboarding services.',
  },
  {
    question: 'Do you offer custom contracts?',
    answer: 'Yes, for Enterprise customers we can create custom contracts with specific terms, pricing, and SLAs.',
  },
]

const testimonials = [
  {
    quote: 'The platform has transformed how we manage our consulting projects. ROI was evident within the first month.',
    author: 'Sarah Chen',
    role: 'CEO, TechConsult Inc',
    rating: 5,
  },
  {
    quote: 'Best investment we\'ve made. The recruitment module alone saved us 40% in operational costs.',
    author: 'Michael Rodriguez',
    role: 'HR Director, Global Staffing',
    rating: 5,
  },
  {
    quote: 'Enterprise-grade security and compliance features gave us the confidence to migrate our entire operation.',
    author: 'Emma Thompson',
    role: 'CTO, Finance Corp',
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
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6 text-foreground">
              Simple, Transparent Pricing
            </h1>
            <p className="text-base text-muted-foreground mb-8">
              Choose the perfect plan for your business. All plans include core features,
              with no hidden fees or surprises.
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
                <span className="ml-2 text-xs text-green-600 dark:text-green-400">Save 20%</span>
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
                    <p className="text-xs font-semibold text-foreground">Features included:</p>
                    <ul className="space-y-2">
                      {plan.features.slice(0, 8).map((feature, idx) => (
                        <li key={idx} className="flex items-start space-x-2">
                          {feature.included ? (
                            <Check className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5" />
                          ) : (
                            <X className="h-4 w-4 text-muted-foreground/30 mt-0.5" />
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
              Compare all features across our plans to find the perfect fit
            </p>
          </div>

          <div className="max-w-5xl mx-auto overflow-x-auto">
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
                  <tr key={featureIdx} className="border-b border-border">
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
              Power Up with Add-ons
            </h2>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
              Enhance your plan with additional features and capabilities
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
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
              Trusted by Industry Leaders
            </h2>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
              See what our customers have to say about their experience
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
              Everything you need to know about our pricing and plans
            </p>
          </div>

          <div className="max-w-3xl mx-auto space-y-4">
            {faqs.map((faq, index) => (
              <Card key={index} className="cursor-pointer" onClick={() => toggleFaq(index)}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">{faq.question}</h3>
                    {expandedFaq === index ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
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
            <p className="text-sm text-muted-foreground mb-4">Still have questions?</p>
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
                  Talk to Sales
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
            Start Your Free Trial Today
          </h2>
          <p className="text-sm text-black/80 mb-8 max-w-2xl mx-auto">
            Join thousands of businesses already using our platform. No credit card required.
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
                Schedule Demo
                <Calendar className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
          <p className="text-xs text-black/60 mt-6">
            No credit card required • Setup in minutes • Cancel anytime
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
                <li><Link href="/roadmap" className="text-xs text-muted-foreground hover:text-foreground">Roadmap</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold mb-4">Company</h3>
              <ul className="space-y-2">
                <li><Link href="/about" className="text-xs text-muted-foreground hover:text-foreground">About</Link></li>
                <li><Link href="/blog" className="text-xs text-muted-foreground hover:text-foreground">Blog</Link></li>
                <li><Link href="/careers" className="text-xs text-muted-foreground hover:text-foreground">Careers</Link></li>
                <li><Link href="/press" className="text-xs text-muted-foreground hover:text-foreground">Press</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold mb-4">Resources</h3>
              <ul className="space-y-2">
                <li><Link href="/docs" className="text-xs text-muted-foreground hover:text-foreground">Documentation</Link></li>
                <li><Link href="/api" className="text-xs text-muted-foreground hover:text-foreground">API Reference</Link></li>
                <li><Link href="/support" className="text-xs text-muted-foreground hover:text-foreground">Support</Link></li>
                <li><Link href="/status" className="text-xs text-muted-foreground hover:text-foreground">Status</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold mb-4">Legal</h3>
              <ul className="space-y-2">
                <li><Link href="/privacy" className="text-xs text-muted-foreground hover:text-foreground">Privacy</Link></li>
                <li><Link href="/terms" className="text-xs text-muted-foreground hover:text-foreground">Terms</Link></li>
                <li><Link href="/cookies" className="text-xs text-muted-foreground hover:text-foreground">Cookie Policy</Link></li>
                <li><Link href="/licenses" className="text-xs text-muted-foreground hover:text-foreground">Licenses</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 dark:border-border mt-8 pt-8 flex flex-col sm:flex-row items-center justify-between">
            <p className="text-xs text-muted-foreground">
              © 2024 Enterprise Platform. All rights reserved.
            </p>
            <div className="flex items-center space-x-4 mt-4 sm:mt-0">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Secured by Enterprise-grade encryption</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}