'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Footer from '@/components/Footer'
import Navigation from '@/components/Navigation'
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
  TrendingUp,
  Clock,
  Award,
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

const rotatingValues = [
  'Modern Business',
  'Growing Teams',
  'Global Operations',
  'Enterprise Success',
]

const trustedCompanies = [
  'Acme Corp',
  'TechStart Inc',
  'Global Solutions',
  'Enterprise Co',
  'Innovation Labs',
  'Digital Ventures',
]

const liveStats = [
  { icon: Users, label: 'Active Users', value: 10000, suffix: '+', duration: 2000 },
  { icon: TrendingUp, label: 'Projects Completed', value: 50000, suffix: '+', duration: 2500 },
  { icon: Clock, label: 'Uptime SLA', value: 99.9, suffix: '%', duration: 2000 },
  { icon: Award, label: 'Client Satisfaction', value: 98, suffix: '%', duration: 1800 },
]

function AnimatedCounter({ target, suffix, duration }: { target: number; suffix: string; duration: number }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const increment = target / (duration / 16)
    let current = 0
    const timer = setInterval(() => {
      current += increment
      if (current >= target) {
        setCount(target)
        clearInterval(timer)
      } else {
        setCount(current)
      }
    }, 16)
    return () => clearInterval(timer)
  }, [target, duration])

  const displayValue = target % 1 !== 0 ? count.toFixed(1) : Math.floor(count).toLocaleString()
  return (
    <span className="text-2xl font-bold text-primary">
      {displayValue}{suffix}
    </span>
  )
}

function RotatingText({ words, interval = 3000 }: { words: string[]; interval?: number }) {
  const [index, setIndex] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => {
      setIsAnimating(true)
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % words.length)
        setIsAnimating(false)
      }, 500)
    }, interval)
    return () => clearInterval(timer)
  }, [words, interval])

  return (
    <span
      className={`text-primary transition-all duration-500 ${
        isAnimating ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
      }`}
    >
      {' '}
      {words[index]}
    </span>
  )
}

function FloatingElement({ delay, children }: { delay: number; children: React.ReactNode }) {
  return (
    <div
      className="animate-float"
      style={{
        animationDelay: `${delay}s`,
        animationDuration: '3s',
      }}
    >
      {children}
    </div>
  )
}

export default function LandingPage() {
  const [currentCompany, setCurrentCompany] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentCompany((prev) => (prev + 1) % trustedCompanies.length)
    }, 2500)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="min-h-screen bg-background transition-colors">
      <style jsx global>{`
        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
        }
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
        @keyframes gradient {
          0%, 100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }
        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient 8s ease infinite;
        }
      `}</style>

      <Navigation />

      {/* Enhanced Hero Section */}
      <section className="relative overflow-hidden">
        {/* Animated background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 animate-gradient" />
        
        {/* Floating decorative elements */}
        <div className="absolute top-20 left-10 w-20 h-20 bg-primary/10 rounded-full blur-xl" />
        <div className="absolute bottom-20 right-10 w-32 h-32 bg-primary/10 rounded-full blur-xl" />
        
        <div className="relative container mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="max-w-4xl mx-auto text-center">
            {/* Main headline with rotating text */}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6 text-foreground">
              The Complete Enterprise Platform for
              <RotatingText words={rotatingValues} />
            </h1>
            
            <p className="text-sm sm:text-base text-muted-foreground mb-8 max-w-2xl mx-auto">
              Streamline your consulting and recruitment operations with our comprehensive,
              multi-tenant SaaS platform. Built for scale, security, and success.
            </p>
            
            {/* CTA buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
              <Link href="/register">
                <Button size="lg" className="group">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link href="/demo">
                <Button variant="outline" size="lg" className="group">
                  Watch Demo
                  <Rocket className="ml-2 h-4 w-4 group-hover:rotate-12 transition-transform" />
                </Button>
              </Link>
            </div>
            
            <p className="text-xs text-muted-foreground mb-8">
              No credit card required • 14-day free trial • Cancel anytime
            </p>

            {/* Rotating trusted companies */}
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <span>Trusted by</span>
              <span
                className="font-semibold text-foreground transition-all duration-500"
                key={currentCompany}
              >
                {trustedCompanies[currentCompany]}
              </span>
              <span>and thousands more</span>
            </div>
          </div>

          {/* Floating feature highlights */}
          <div className="max-w-6xl mx-auto mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
            <FloatingElement delay={0}>
              <Card className="bg-background/80 backdrop-blur-sm border-primary/20">
                <CardContent className="pt-6 text-center">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Zap className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold mb-1 text-foreground">Lightning Fast</h3>
                  <p className="text-xs text-muted-foreground">Sub-100ms response times</p>
                </CardContent>
              </Card>
            </FloatingElement>

            <FloatingElement delay={0.5}>
              <Card className="bg-background/80 backdrop-blur-sm border-primary/20">
                <CardContent className="pt-6 text-center">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Shield className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold mb-1 text-foreground">Enterprise Security</h3>
                  <p className="text-xs text-muted-foreground">SOC 2 Type II certified</p>
                </CardContent>
              </Card>
            </FloatingElement>

            <FloatingElement delay={1}>
              <Card className="bg-background/80 backdrop-blur-sm border-primary/20">
                <CardContent className="pt-6 text-center">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Globe className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold mb-1 text-foreground">Global Scale</h3>
                  <p className="text-xs text-muted-foreground">Multi-region deployment</p>
                </CardContent>
              </Card>
            </FloatingElement>
          </div>
        </div>
      </section>

      {/* Animated Statistics Section */}
      <section className="py-12 border-y border-border bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-5xl mx-auto">
            {liveStats.map((stat, index) => {
              const Icon = stat.icon
              return (
                <div key={index} className="text-center">
                  <div className="flex items-center justify-center mb-2">
                    <Icon className="h-5 w-5 text-primary mr-2" />
                    <AnimatedCounter
                      target={stat.value}
                      suffix={stat.suffix}
                      duration={stat.duration}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-16 lg:py-24 bg-background">
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
              <Card
                key={index}
                className="hover:shadow-lg hover:scale-105 transition-all duration-300 hover:border-primary/50"
              >
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
      <section className="py-16 lg:py-24 bg-muted/50">
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
                  <div
                    key={index}
                    className="flex items-start space-x-3 opacity-0 animate-fade-in"
                    style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'forwards' }}
                  >
                    <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-foreground">{benefit}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-4">
                {benefits.slice(4).map((benefit, index) => (
                  <div
                    key={index}
                    className="flex items-start space-x-3 opacity-0 animate-fade-in"
                    style={{ animationDelay: `${(index + 4) * 100}ms`, animationFillMode: 'forwards' }}
                  >
                    <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-foreground">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="text-center mt-12">
              <Link href="/pricing">
                <Button
                  variant="secondary"
                  size="lg"
                  className="bg-primary text-black hover:bg-primary/90 group"
                >
                  View Pricing Plans
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 lg:py-24 bg-primary relative overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute top-0 left-0 w-64 h-64 bg-black/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-black/5 rounded-full blur-3xl" />
        
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
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
                <Button
                  size="lg"
                  variant="secondary"
                  className="bg-black text-white hover:bg-black/90 group"
                >
                  Start Free Trial
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link href="/contact">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-black text-black hover:bg-black/10"
                >
                  Contact Sales
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />

      <style jsx global>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.6s ease-out;
        }
      `}</style>
    </div>
  )
}