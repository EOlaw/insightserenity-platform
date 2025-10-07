import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Footer from '@/components/Footer'
import Navigation from '@/components/Navigation'
import { FeatureHighlight } from '@/components/FeatureHighlight'
import { HelpTooltip } from '@/components/HelpTooltip'
import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle,
  Globe,
  Rocket,
  Shield,
  Users,
  Zap,
} from 'lucide-react'

const features = [
  {
    icon: Building2,
    title: 'Multi-Tenant Architecture',
    description: 'Isolated environments for each organization with complete data separation.',
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    description: 'Bank-level encryption, SSO, MFA, and comprehensive audit trails.',
  },
  {
    icon: Globe,
    title: 'Global Scale',
    description: 'Deploy across multiple regions with automatic scaling and load balancing.',
  },
  {
    icon: BarChart3,
    title: 'Advanced Analytics',
    description: 'Real-time insights and customizable dashboards for data-driven decisions.',
  },
  {
    icon: Users,
    title: 'Team Collaboration',
    description: 'Built-in tools for seamless communication and project management.',
  },
  {
    icon: Zap,
    title: 'API Integration',
    description: 'RESTful APIs and webhooks for seamless third-party integrations.',
  },
]

const benefits = [
  'Unlimited users and projects',
  '99.9% uptime SLA',
  '24/7 priority support',
  'Custom domain and branding',
  'Advanced reporting tools',
  'API access',
  'Data export capabilities',
  'Compliance certifications',
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background transition-colors">
      {/* Navigation - Now authentication-aware */}
      <Navigation />

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-primary/10" />
        <div className="relative container mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6 text-foreground">
              The Complete Enterprise Platform for
              <span className="text-primary"> Modern Business</span>
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mb-8 max-w-2xl mx-auto">
              Streamline your consulting and recruitment operations with our comprehensive,
              multi-tenant SaaS platform. Built for scale, security, and success.
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
                  <Rocket className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              No credit card required • 14-day free trial • Cancel anytime
            </p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-16 lg:py-24 bg-muted/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="flex items-center justify-center gap-2 mb-4">
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
                Everything you need to succeed
              </h2>
              <HelpTooltip content="Click on any feature card to learn more about our comprehensive platform capabilities" />
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
              Our platform provides all the tools and features required to run a successful
              enterprise operation.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-base">{feature.title}</CardTitle>
                  <CardDescription className="text-xs">
                    {feature.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-16 lg:py-24 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
                Why choose Enterprise Platform?
              </h2>
              <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
                Join thousands of successful organizations that trust our platform to power
                their operations and drive growth.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                {benefits.slice(0, 4).map((benefit, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-foreground">{benefit}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-4">
                {benefits.slice(4).map((benefit, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-foreground">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-12 pt-12 border-t border-border">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary mb-2">10,000+</div>
                <div className="text-xs text-muted-foreground">Active Users</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary mb-2">50,000+</div>
                <div className="text-xs text-muted-foreground">Projects Completed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary mb-2">98%</div>
                <div className="text-xs text-muted-foreground">Client Satisfaction</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary mb-2">99.9%</div>
                <div className="text-xs text-muted-foreground">Uptime SLA</div>
              </div>
            </div>
            <div className="text-center mt-12">
              <Link href="/pricing">
                <Button variant="secondary" size="lg" className="bg-primary text-black hover:bg-primary/90">
                  View Pricing Plans
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 lg:py-24 bg-primary">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-black mb-4">
              Ready to transform your business?
            </h2>
            <p className="text-sm text-black/80 mb-8">
              Join the enterprise revolution. Start your free trial today and experience the
              power of our platform.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/register">
                <Button size="lg" variant="secondary" className="bg-black text-white hover:bg-black/90">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/contact">
                <Button size="lg" variant="outline" className="border-black text-black hover:bg-black/10">
                  Contact Sales
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  )
}