'use client'

import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Footer from '@/components/Footer'
import {
  Users,
  Target,
  Award,
  Globe,
  TrendingUp,
  Shield,
  Heart,
  Zap,
  Building2,
  CheckCircle,
  ArrowRight,
  Briefcase,
  Calendar,
  Star,
  Trophy,
  Rocket,
  Code,
  Coffee,
  Linkedin,
  Twitter,
  Github,
} from 'lucide-react'

const stats = [
  { label: 'Customers', value: '10,000+', icon: Users },
  { label: 'Countries', value: '120+', icon: Globe },
  { label: 'Team Members', value: '500+', icon: Briefcase },
  { label: 'Uptime', value: '99.99%', icon: Shield },
]

const values = [
  {
    icon: Heart,
    title: 'Customer First',
    description: 'We prioritize our customers\' success above all else, ensuring their needs drive our innovation.',
  },
  {
    icon: Zap,
    title: 'Innovation',
    description: 'We constantly push boundaries to deliver cutting-edge solutions that transform businesses.',
  },
  {
    icon: Shield,
    title: 'Trust & Security',
    description: 'We maintain the highest standards of data security and build trust through transparency.',
  },
  {
    icon: Users,
    title: 'Collaboration',
    description: 'We believe in the power of teamwork and foster a culture of open communication.',
  },
  {
    icon: Target,
    title: 'Excellence',
    description: 'We strive for excellence in everything we do, from code quality to customer service.',
  },
  {
    icon: Trophy,
    title: 'Growth Mindset',
    description: 'We embrace challenges as opportunities to learn, adapt, and continuously improve.',
  },
]

const timeline = [
  {
    year: '2019',
    title: 'Company Founded',
    description: 'Started with a vision to revolutionize enterprise software.',
    icon: Rocket,
  },
  {
    year: '2020',
    title: 'Series A Funding',
    description: 'Raised $15M to accelerate product development.',
    icon: TrendingUp,
  },
  {
    year: '2021',
    title: 'Global Expansion',
    description: 'Opened offices in London and Singapore.',
    icon: Globe,
  },
  {
    year: '2022',
    title: '1,000 Customers',
    description: 'Reached major milestone serving enterprises worldwide.',
    icon: Trophy,
  },
  {
    year: '2023',
    title: 'Series B Funding',
    description: 'Raised $50M to scale operations globally.',
    icon: Rocket,
  },
  {
    year: '2024',
    title: 'AI Integration',
    description: 'Launched AI-powered features across the platform.',
    icon: Zap,
  },
]

const leadership = [
  {
    name: 'Sarah Johnson',
    role: 'Chief Executive Officer',
    bio: 'Former VP at Microsoft with 15+ years in enterprise software.',
    image: '/team/ceo.jpg',
    linkedin: '#',
    twitter: '#',
  },
  {
    name: 'Michael Chen',
    role: 'Chief Technology Officer',
    bio: 'Ex-Google engineer, expert in distributed systems and AI.',
    image: '/team/cto.jpg',
    linkedin: '#',
    twitter: '#',
  },
  {
    name: 'Emily Rodriguez',
    role: 'Chief Product Officer',
    bio: 'Product visionary with experience at Amazon and Salesforce.',
    image: '/team/cpo.jpg',
    linkedin: '#',
    twitter: '#',
  },
  {
    name: 'David Kim',
    role: 'Chief Financial Officer',
    bio: 'Former Goldman Sachs executive with expertise in SaaS finance.',
    image: '/team/cfo.jpg',
    linkedin: '#',
    twitter: '#',
  },
  {
    name: 'Lisa Thompson',
    role: 'Chief Marketing Officer',
    bio: 'Marketing leader with successful exits at multiple startups.',
    image: '/team/cmo.jpg',
    linkedin: '#',
    twitter: '#',
  },
  {
    name: 'James Wilson',
    role: 'Chief Customer Officer',
    bio: 'Customer success expert with 20+ years in B2B software.',
    image: '/team/cco.jpg',
    linkedin: '#',
    twitter: '#',
  },
]

const awards = [
  { title: 'Best Enterprise Software', org: 'TechCrunch', year: '2023' },
  { title: 'Fastest Growing SaaS', org: 'Forbes', year: '2023' },
  { title: 'Top 100 Startups', org: 'Inc. Magazine', year: '2022' },
  { title: 'Best Workplace', org: 'Glassdoor', year: '2023' },
]

export default function AboutPage() {
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
                <Link href="/about" className="text-xs text-primary font-medium">
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
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6 text-foreground">
              Building the Future of
              <span className="text-primary"> Enterprise Software</span>
            </h1>
            <p className="text-base text-muted-foreground mb-8">
              We're on a mission to empower businesses with innovative solutions that drive growth,
              efficiency, and success in the digital age.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/careers">
                <Button size="lg">
                  Join Our Team
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/contact">
                <Button variant="outline" size="lg">
                  Get in Touch
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 lg:py-24 border-y border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map((stat, index) => {
              const Icon = stat.icon
              return (
                <div key={index} className="text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-lg mb-3">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-foreground mb-1">{stat.value}</div>
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-foreground">Our Mission</h2>
              <p className="text-sm text-muted-foreground mb-6">
                To democratize enterprise software by making powerful, scalable solutions accessible
                to businesses of all sizes. We believe that every company deserves world-class tools
                to compete and thrive in today's digital economy.
              </p>
              <p className="text-sm text-muted-foreground mb-6">
                Through continuous innovation and a deep understanding of our customers' needs, we're
                building a platform that transforms how businesses operate, collaborate, and grow.
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Customer-Centric Innovation</p>
                    <p className="text-xs text-muted-foreground">Every feature is built with our customers in mind</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Global Accessibility</p>
                    <p className="text-xs text-muted-foreground">Making enterprise tools available worldwide</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Sustainable Growth</p>
                    <p className="text-xs text-muted-foreground">Building for long-term success and impact</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-primary/5 rounded-2xl" />
              <Card className="relative">
                <CardHeader>
                  <CardTitle className="text-xl">Our Vision</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    To be the most trusted and innovative enterprise platform, empowering millions of
                    businesses to achieve their full potential through technology.
                  </p>
                  <div className="pt-4 border-t border-border">
                    <h4 className="font-semibold text-sm mb-3 text-foreground">By 2030, we aim to:</h4>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span className="text-xs text-muted-foreground">Serve 1 million businesses globally</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span className="text-xs text-muted-foreground">Achieve carbon neutrality in all operations</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span className="text-xs text-muted-foreground">Create 10,000+ jobs worldwide</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span className="text-xs text-muted-foreground">Establish presence in 50+ countries</span>
                      </li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-16 lg:py-24 bg-muted/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">Our Core Values</h2>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
              These principles guide everything we do, from product development to customer relationships
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {values.map((value, index) => {
              const Icon = value.icon
              return (
                <Card key={index} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mb-3">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-base">{value.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">{value.description}</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">Our Journey</h2>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
              From startup to industry leader, here's how we've grown
            </p>
          </div>
          <div className="max-w-4xl mx-auto">
            <div className="relative">
              {/* Vertical Line */}
              <div className="absolute left-1/2 transform -translate-x-1/2 h-full w-0.5 bg-gray-200 dark:bg-gray-700" />

              {/* Timeline Items */}
              {timeline.map((item, index) => {
                const Icon = item.icon
                return (
                  <div key={index} className={`relative flex items-center ${index % 2 === 0 ? 'justify-start' : 'justify-end'} mb-8`}>
                    <div className={`w-5/12 ${index % 2 === 0 ? 'text-right pr-8' : 'text-left pl-8 order-1'}`}>
                      <div className={`inline-block ${index % 2 === 0 ? 'text-right' : 'text-left'}`}>
                        <span className="text-xs text-primary font-semibold">{item.year}</span>
                        <h3 className="text-base font-semibold mt-1 text-foreground">{item.title}</h3>
                        <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                      </div>
                    </div>
                    <div className="absolute left-1/2 transform -translate-x-1/2 w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                      <Icon className="h-5 w-5 text-black" />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Leadership Team */}
      <section className="py-16 lg:py-24 bg-muted/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">Leadership Team</h2>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
              Meet the visionaries driving our mission forward
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {leadership.map((member, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="w-20 h-20 bg-muted rounded-full mx-auto mb-4 flex items-center justify-center">
                    <Users className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <CardTitle className="text-base text-center">{member.name}</CardTitle>
                  <CardDescription className="text-xs text-center">
                    {member.role}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground text-center mb-4">{member.bio}</p>
                  <div className="flex justify-center space-x-2">
                    <a href={member.linkedin} className="p-1.5 bg-muted rounded hover:bg-primary hover:text-white transition">
                      <Linkedin className="h-3 w-3" />
                    </a>
                    <a href={member.twitter} className="p-1.5 bg-muted rounded hover:bg-primary hover:text-white transition">
                      <Twitter className="h-3 w-3" />
                    </a>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Awards & Recognition */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">Awards & Recognition</h2>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
              Industry recognition for our innovation and excellence
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {awards.map((award, index) => (
              <Card key={index} className="text-center">
                <CardContent className="pt-6">
                  <Trophy className="h-8 w-8 text-primary mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-foreground">{award.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{award.org}</p>
                  <p className="text-2xs text-muted-foreground mt-1">{award.year}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 lg:py-24 bg-primary">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-black mb-4">
            Join Us on Our Mission
          </h2>
          <p className="text-sm text-black/80 mb-8 max-w-2xl mx-auto">
            Be part of the team that's transforming how businesses operate
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/careers">
              <Button variant="secondary" size="lg">
                View Open Positions
                <Briefcase className="ml-2 h-4 w-4" />
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
      <Footer />
    </div>
  )
}