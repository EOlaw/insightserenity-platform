'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { Button } from '../../shared/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../shared/components/ui/card'
import {
  PlayCircle,
  ArrowRight,
  CheckCircle,
  Zap,
  Shield,
  BarChart3,
  Users,
  Globe,
  Lock,
  Cloud,
  Smartphone,
  Calendar,
  Mail,
  Building2,
  ChevronRight,
} from 'lucide-react'

const keyFeatures = [
  {
    icon: Zap,
    title: 'Lightning Fast Performance',
    description: 'Optimized infrastructure ensuring sub-100ms response times for all operations',
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    description: 'SOC 2 Type II certified with end-to-end encryption and advanced access controls',
  },
  {
    icon: BarChart3,
    title: 'Advanced Analytics',
    description: 'Real-time dashboards and customizable reports to track every metric that matters',
  },
  {
    icon: Users,
    title: 'Team Collaboration',
    description: 'Built-in tools for seamless communication and project management across teams',
  },
  {
    icon: Globe,
    title: 'Global Scale',
    description: 'Multi-region deployment with 99.9% uptime SLA and unlimited scalability',
  },
  {
    icon: Lock,
    title: 'Compliance Ready',
    description: 'GDPR, HIPAA, and SOC 2 compliant with comprehensive audit trails',
  },
]

const demoHighlights = [
  {
    title: 'See It In Action',
    description: 'Watch how our platform streamlines workflows and automates processes',
    icon: PlayCircle,
  },
  {
    title: 'Real-World Examples',
    description: 'Learn from case studies of companies achieving 10x productivity gains',
    icon: BarChart3,
  },
  {
    title: 'Expert Guidance',
    description: 'Get personalized recommendations tailored to your business needs',
    icon: Users,
  },
]

const benefits = [
  'Reduce operational costs by up to 40%',
  'Improve team productivity by 10x',
  'Automate repetitive tasks',
  'Scale effortlessly as you grow',
  'Enterprise-grade security',
  '24/7 premium support',
]

export default function DemoPage() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    company: '',
    jobTitle: '',
    phone: '',
    employees: '',
    message: '',
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    
    // Simulate form submission
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    setIsSubmitting(false)
    setIsSubmitted(true)
    
    // Reset form after 3 seconds
    setTimeout(() => {
      setIsSubmitted(false)
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        company: '',
        jobTitle: '',
        phone: '',
        employees: '',
        message: '',
      })
    }, 3000)
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
                <Link href="/pricing" className="text-xs text-muted-foreground hover:text-foreground transition">
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

      {/* Hero Section with Video */}
      <section className="bg-gradient-to-b from-muted/50 to-background py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-6">
                <PlayCircle className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6 text-foreground">
                See <span className="text-primary">Enterprise Platform</span> in Action
              </h1>
              <p className="text-base text-muted-foreground mb-8 max-w-2xl mx-auto">
                Watch our comprehensive platform demo and discover how leading companies are transforming their operations with our enterprise solution.
              </p>
            </div>

            {/* Video Embed */}
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden shadow-2xl mb-8">
              <iframe
                className="w-full h-full"
                src="https://www.youtube.com/embed/dKtSH0dHpL4?start=56"
                title="Enterprise Platform Demo"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>

            {/* Demo Highlights */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              {demoHighlights.map((highlight, index) => {
                const Icon = highlight.icon
                return (
                  <Card key={index} className="text-center">
                    <CardContent className="pt-6">
                      <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="text-sm font-semibold mb-2 text-foreground">{highlight.title}</h3>
                      <p className="text-xs text-muted-foreground">{highlight.description}</p>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Feature Highlights */}
      <section className="py-16 lg:py-24 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">
                Powerful Features Built for Enterprise
              </h2>
              <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
                Everything you need to run your business efficiently, securely, and at scale
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {keyFeatures.map((feature, index) => {
                const Icon = feature.icon
                return (
                  <Card key={index} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <CardTitle className="text-base">{feature.title}</CardTitle>
                      <CardDescription className="text-xs">
                        {feature.description}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                )
              })}
            </div>

            {/* Benefits Section */}
            <div className="mt-16 bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl p-8 md:p-12">
              <div className="max-w-3xl mx-auto">
                <h3 className="text-xl font-bold mb-6 text-center text-foreground">
                  Why Leading Companies Choose Us
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {benefits.map((benefit, index) => (
                    <div key={index} className="flex items-start space-x-3">
                      <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-foreground">{benefit}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Scheduling Form */}
      <section className="py-16 lg:py-24 bg-muted/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">
                Schedule Your Personalized Demo
              </h2>
              <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
                Get a tailored walkthrough of our platform with one of our product experts. We'll show you exactly how our solution fits your unique business needs.
              </p>
            </div>

            <Card>
              <CardContent className="pt-6">
                {isSubmitted ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-green-100 dark:bg-green-950 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                    </div>
                    <h3 className="text-xl font-bold mb-2 text-foreground">Thank You!</h3>
                    <p className="text-sm text-muted-foreground mb-6">
                      We've received your demo request. Our team will contact you within 24 hours to schedule your personalized demo.
                    </p>
                    <Button onClick={() => setIsSubmitted(false)}>
                      Submit Another Request
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="firstName" className="block text-sm font-medium text-foreground mb-2">
                          First Name *
                        </label>
                        <input
                          type="text"
                          id="firstName"
                          name="firstName"
                          value={formData.firstName}
                          onChange={handleInputChange}
                          required
                          className="w-full px-4 py-2 text-sm border border-border bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="John"
                        />
                      </div>
                      <div>
                        <label htmlFor="lastName" className="block text-sm font-medium text-foreground mb-2">
                          Last Name *
                        </label>
                        <input
                          type="text"
                          id="lastName"
                          name="lastName"
                          value={formData.lastName}
                          onChange={handleInputChange}
                          required
                          className="w-full px-4 py-2 text-sm border border-border bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="Smith"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                          Work Email *
                        </label>
                        <input
                          type="email"
                          id="email"
                          name="email"
                          value={formData.email}
                          onChange={handleInputChange}
                          required
                          className="w-full px-4 py-2 text-sm border border-border bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="john.smith@company.com"
                        />
                      </div>
                      <div>
                        <label htmlFor="phone" className="block text-sm font-medium text-foreground mb-2">
                          Phone Number
                        </label>
                        <input
                          type="tel"
                          id="phone"
                          name="phone"
                          value={formData.phone}
                          onChange={handleInputChange}
                          className="w-full px-4 py-2 text-sm border border-border bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="+1 (555) 123-4567"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="company" className="block text-sm font-medium text-foreground mb-2">
                          Company Name *
                        </label>
                        <input
                          type="text"
                          id="company"
                          name="company"
                          value={formData.company}
                          onChange={handleInputChange}
                          required
                          className="w-full px-4 py-2 text-sm border border-border bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="Acme Inc."
                        />
                      </div>
                      <div>
                        <label htmlFor="jobTitle" className="block text-sm font-medium text-foreground mb-2">
                          Job Title *
                        </label>
                        <input
                          type="text"
                          id="jobTitle"
                          name="jobTitle"
                          value={formData.jobTitle}
                          onChange={handleInputChange}
                          required
                          className="w-full px-4 py-2 text-sm border border-border bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="CTO"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="employees" className="block text-sm font-medium text-foreground mb-2">
                        Company Size *
                      </label>
                      <select
                        id="employees"
                        name="employees"
                        value={formData.employees}
                        onChange={handleInputChange}
                        required
                        className="w-full px-4 py-2 text-sm border border-border bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">Select company size</option>
                        <option value="1-10">1-10 employees</option>
                        <option value="11-50">11-50 employees</option>
                        <option value="51-200">51-200 employees</option>
                        <option value="201-500">201-500 employees</option>
                        <option value="501-1000">501-1,000 employees</option>
                        <option value="1001+">1,001+ employees</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="message" className="block text-sm font-medium text-foreground mb-2">
                        Tell us about your needs
                      </label>
                      <textarea
                        id="message"
                        name="message"
                        value={formData.message}
                        onChange={handleInputChange}
                        rows={4}
                        className="w-full px-4 py-2 text-sm border border-border bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                        placeholder="What are your main challenges? What features are you most interested in?"
                      />
                    </div>

                    <div className="pt-4">
                      <Button
                        type="submit"
                        size="lg"
                        className="w-full"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? (
                          <>
                            <span className="animate-pulse">Scheduling Demo...</span>
                          </>
                        ) : (
                          <>
                            Schedule My Demo
                            <Calendar className="ml-2 h-4 w-4" />
                          </>
                        )}
                      </Button>
                    </div>

                    <p className="text-xs text-muted-foreground text-center">
                      By submitting this form, you agree to our Terms of Service and Privacy Policy.
                      We'll never share your information with third parties.
                    </p>
                  </form>
                )}
              </CardContent>
            </Card>

            {/* Additional Info */}
            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Calendar className="h-6 w-6 text-primary" />
                </div>
                <h4 className="text-sm font-semibold mb-1 text-foreground">Flexible Scheduling</h4>
                <p className="text-xs text-muted-foreground">Book a time that works for your schedule</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <h4 className="text-sm font-semibold mb-1 text-foreground">Expert Guidance</h4>
                <p className="text-xs text-muted-foreground">Talk directly with our product specialists</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle className="h-6 w-6 text-primary" />
                </div>
                <h4 className="text-sm font-semibold mb-1 text-foreground">No Commitment</h4>
                <p className="text-xs text-muted-foreground">No credit card required, no pressure</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 lg:py-24 bg-primary">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-black mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-sm text-black/80 mb-8 max-w-2xl mx-auto">
            Join thousands of companies already using Enterprise Platform to transform their operations
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/register">
              <Button variant="secondary" size="lg">
                Start Free Trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/contact">
              <Button variant="outline" size="lg" className="bg-black/10 border-black/20 hover:bg-black/20">
                Contact Sales
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
          <p className="text-xs text-black/60 mt-6">
            No credit card required • 14-day free trial • Cancel anytime
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
                <li><Link href="/licenses" className="text-xs text-muted-foreground hover:text-foreground">Licenses</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border mt-8 pt-8 text-center">
            <p className="text-xs text-muted-foreground">
              © 2024 Enterprise Platform. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}