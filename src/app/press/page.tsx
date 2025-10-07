'use client'

import Link from 'next/link'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/shared/components/ui/card'
import {
  Newspaper,
  Download,
  Image,
  FileText,
  Calendar,
  ExternalLink,
  Award,
  TrendingUp,
  Users,
  Building2,
  Globe,
  Mail,
  Phone,
  MessageSquare,
  Camera,
  Mic,
  Video,
  BookOpen,
  Share2,
  ArrowRight,
  Quote,
  Star,
  Trophy,
  Rocket,
  DollarSign,
  Target,
  Zap,
  Shield,
  CheckCircle,
} from 'lucide-react'

const pressReleases = [
  {
    date: '2024-01-20',
    title: 'Enterprise Platform Announces $50M Series B Funding Round',
    excerpt: 'New funding will accelerate product development and global expansion efforts.',
    category: 'Funding',
    link: '/press/series-b-announcement',
  },
  {
    date: '2024-01-15',
    title: 'Platform Reaches 10,000 Customer Milestone',
    excerpt: 'Significant growth milestone demonstrates strong market demand for enterprise solutions.',
    category: 'Company',
    link: '/press/10000-customers',
  },
  {
    date: '2024-01-08',
    title: 'Launch of AI-Powered Analytics Engine',
    excerpt: 'Revolutionary AI features bring predictive insights to enterprise customers.',
    category: 'Product',
    link: '/press/ai-analytics-launch',
  },
  {
    date: '2023-12-15',
    title: 'Enterprise Platform Named to Forbes Cloud 100',
    excerpt: 'Recognition as one of the top private cloud companies worldwide.',
    category: 'Awards',
    link: '/press/forbes-cloud-100',
  },
  {
    date: '2023-12-01',
    title: 'Opening of New European Headquarters in London',
    excerpt: 'Expansion into European market with new office and local team.',
    category: 'Expansion',
    link: '/press/london-office',
  },
  {
    date: '2023-11-20',
    title: 'Strategic Partnership with Microsoft Azure',
    excerpt: 'Deep integration with Azure services enhances platform capabilities.',
    category: 'Partnership',
    link: '/press/microsoft-partnership',
  },
]

const mediaKitResources = [
  {
    title: 'Company Logos',
    description: 'High-resolution logos in various formats',
    icon: Image,
    formats: ['PNG', 'SVG', 'EPS'],
    link: '/media/logos.zip',
  },
  {
    title: 'Executive Bios',
    description: 'Biographies and headshots of leadership team',
    icon: Users,
    formats: ['PDF', 'DOCX'],
    link: '/media/executive-bios.pdf',
  },
  {
    title: 'Product Screenshots',
    description: 'High-quality product images and UI screenshots',
    icon: Camera,
    formats: ['PNG', 'JPG'],
    link: '/media/screenshots.zip',
  },
  {
    title: 'Company Fact Sheet',
    description: 'Key facts, figures, and company information',
    icon: FileText,
    formats: ['PDF'],
    link: '/media/fact-sheet.pdf',
  },
  {
    title: 'Brand Guidelines',
    description: 'Complete brand style guide and usage rules',
    icon: BookOpen,
    formats: ['PDF'],
    link: '/media/brand-guidelines.pdf',
  },
  {
    title: 'Video Assets',
    description: 'Product demos and company overview videos',
    icon: Video,
    formats: ['MP4', 'MOV'],
    link: '/media/videos',
  },
]

const pressContacts = [
  {
    name: 'Sarah Mitchell',
    role: 'Head of Communications',
    email: 'sarah.mitchell@enterprise.com',
    phone: '+1 (415) 555-0101',
    region: 'Americas',
  },
  {
    name: 'James Chen',
    role: 'PR Manager',
    email: 'james.chen@enterprise.com',
    phone: '+44 20 7123 4568',
    region: 'EMEA',
  },
  {
    name: 'Yuki Tanaka',
    role: 'Communications Lead',
    email: 'yuki.tanaka@enterprise.com',
    phone: '+65 6789 0124',
    region: 'APAC',
  },
]

const mediaCoverage = [
  {
    publication: 'TechCrunch',
    date: '2024-01-20',
    title: 'Enterprise Platform Raises $50M to Expand Its Business Suite',
    link: 'https://techcrunch.com/...',
    logo: '/media/logos/techcrunch.png',
  },
  {
    publication: 'Forbes',
    date: '2024-01-15',
    title: 'How This Startup Is Revolutionizing Enterprise Software',
    link: 'https://forbes.com/...',
    logo: '/media/logos/forbes.png',
  },
  {
    publication: 'Wall Street Journal',
    date: '2024-01-10',
    title: 'The Future of Work: AI-Driven Enterprise Platforms',
    link: 'https://wsj.com/...',
    logo: '/media/logos/wsj.png',
  },
  {
    publication: 'VentureBeat',
    date: '2024-01-05',
    title: 'Enterprise Platform\'s AI Features Set New Industry Standard',
    link: 'https://venturebeat.com/...',
    logo: '/media/logos/venturebeat.png',
  },
  {
    publication: 'Business Insider',
    date: '2023-12-20',
    title: '10 Enterprise Startups to Watch in 2024',
    link: 'https://businessinsider.com/...',
    logo: '/media/logos/businessinsider.png',
  },
  {
    publication: 'The Information',
    date: '2023-12-15',
    title: 'Inside Enterprise Platform\'s Rapid Growth Story',
    link: 'https://theinformation.com/...',
    logo: '/media/logos/theinformation.png',
  },
]

const companyStats = [
  { label: 'Founded', value: '2019' },
  { label: 'Employees', value: '500+' },
  { label: 'Customers', value: '10,000+' },
  { label: 'Countries', value: '120+' },
  { label: 'Funding Raised', value: '$75M' },
  { label: 'Valuation', value: '$500M' },
]

const awards = [
  {
    year: '2023',
    title: 'Forbes Cloud 100',
    description: 'Top 100 Private Cloud Companies',
    icon: Trophy,
  },
  {
    year: '2023',
    title: 'Gartner Cool Vendor',
    description: 'Enterprise Software Category',
    icon: Award,
  },
  {
    year: '2023',
    title: 'Best Workplace',
    description: 'Glassdoor Employees\' Choice',
    icon: Star,
  },
  {
    year: '2022',
    title: 'Fastest Growing SaaS',
    description: 'SaaS 1000 Rankings',
    icon: TrendingUp,
  },
]

const executiveQuotes = [
  {
    quote: 'Our mission is to democratize enterprise software and make powerful tools accessible to businesses of all sizes.',
    author: 'John Smith',
    role: 'CEO & Co-founder',
    image: '/team/ceo.jpg',
  },
  {
    quote: 'We\'re not just building software, we\'re building the future of how businesses operate and collaborate.',
    author: 'Sarah Johnson',
    role: 'CTO & Co-founder',
    image: '/team/cto.jpg',
  },
]

export default function PressPage() {
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
                <Link href="/about" className="text-xs text-gray-600 hover:text-gray-900 transition">
                  About
                </Link>
                <Link href="/press" className="text-xs text-primary font-medium">
                  Press
                </Link>
                <Link href="/blog" className="text-xs text-gray-600 hover:text-gray-900 transition">
                  Blog
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
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-6">
              <Newspaper className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6">
              Press Center
            </h1>
            <p className="text-base text-gray-600 mb-8">
              Latest news, press releases, and media resources about Enterprise Platform.
              For media inquiries, please contact our press team.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="#contact">
                <Button size="lg">
                  Media Inquiries
                  <Mail className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="#media-kit">
                <Button variant="outline" size="lg">
                  Download Media Kit
                  <Download className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Company Stats */}
      <section className="py-16 border-y">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8">
            {companyStats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-2xl font-bold text-primary">{stat.value}</div>
                <div className="text-xs text-gray-600 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Latest Press Releases */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">Latest Press Releases</h2>
            <p className="text-sm text-gray-600">Official announcements and company news</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pressReleases.map((release, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500 flex items-center">
                      <Calendar className="h-3 w-3 mr-1" />
                      {release.date}
                    </span>
                    <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">
                      {release.category}
                    </span>
                  </div>
                  <CardTitle className="text-base">{release.title}</CardTitle>
                  <CardDescription className="text-xs">
                    {release.excerpt}
                  </CardDescription>
                </CardHeader>
                <CardFooter>
                  <Link href={release.link} className="text-xs text-primary hover:underline flex items-center">
                    Read more
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>

          <div className="text-center mt-8">
            <Link href="/press/archive">
              <Button variant="outline">
                View All Press Releases
                <ArrowRight className="ml-2 h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Media Coverage */}
      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">In the News</h2>
            <p className="text-sm text-gray-600">Recent media coverage and mentions</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {mediaCoverage.map((coverage, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardContent className="pt-6">
                  <div className="h-8 mb-4 flex items-center">
                    <div className="text-sm font-semibold">{coverage.publication}</div>
                  </div>
                  <h3 className="text-sm font-medium mb-2 line-clamp-2">{coverage.title}</h3>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">{coverage.date}</span>
                    <a
                      href={coverage.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center"
                    >
                      Read article
                      <ExternalLink className="ml-1 h-3 w-3" />
                    </a>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Executive Quotes */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">Leadership Perspectives</h2>
            <p className="text-sm text-gray-600">Insights from our executive team</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {executiveQuotes.map((item, index) => (
              <Card key={index}>
                <CardContent className="pt-6">
                  <Quote className="h-8 w-8 text-primary/20 mb-4" />
                  <p className="text-sm text-gray-700 italic mb-4">"{item.quote}"</p>
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-gray-200 rounded-full" />
                    <div>
                      <p className="text-sm font-semibold">{item.author}</p>
                      <p className="text-xs text-gray-500">{item.role}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Media Kit */}
      <section id="media-kit" className="py-16 lg:py-24 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">Media Kit</h2>
            <p className="text-sm text-gray-600">Download resources for press and media use</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {mediaKitResources.map((resource, index) => {
              const Icon = resource.icon
              return (
                <Card key={index} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mb-3">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-base">{resource.title}</CardTitle>
                    <CardDescription className="text-xs">
                      {resource.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1">
                        {resource.formats.map((format, idx) => (
                          <span key={idx} className="text-2xs px-2 py-0.5 bg-gray-100 rounded">
                            {format}
                          </span>
                        ))}
                      </div>
                      <Button size="sm" variant="ghost">
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      {/* Awards & Recognition */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">Awards & Recognition</h2>
            <p className="text-sm text-gray-600">Industry recognition for our innovation and excellence</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {awards.map((award, index) => {
              const Icon = award.icon
              return (
                <Card key={index} className="text-center">
                  <CardContent className="pt-6">
                    <Icon className="h-8 w-8 text-primary mx-auto mb-3" />
                    <h3 className="text-sm font-semibold">{award.title}</h3>
                    <p className="text-xs text-gray-600 mt-1">{award.description}</p>
                    <p className="text-xs text-gray-500 mt-2">{award.year}</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      {/* Press Contact */}
      <section id="contact" className="py-16 lg:py-24 bg-black text-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">Press Contact</h2>
            <p className="text-sm text-gray-300">Get in touch with our communications team</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {pressContacts.map((contact, index) => (
              <Card key={index} className="bg-white/10 border-white/20">
                <CardHeader>
                  <CardTitle className="text-base text-white">{contact.name}</CardTitle>
                  <CardDescription className="text-xs text-gray-300">
                    {contact.role}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <a href={`mailto:${contact.email}`} className="flex items-center space-x-2 text-xs text-gray-300 hover:text-white">
                    <Mail className="h-3 w-3" />
                    <span>{contact.email}</span>
                  </a>
                  <a href={`tel:${contact.phone.replace(/\s/g, '')}`} className="flex items-center space-x-2 text-xs text-gray-300 hover:text-white">
                    <Phone className="h-3 w-3" />
                    <span>{contact.phone}</span>
                  </a>
                  <p className="text-xs text-gray-400 pt-2">{contact.region}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center mt-12">
            <p className="text-sm text-gray-300 mb-4">For general inquiries</p>
            <a href="mailto:press@enterprise.com" className="text-primary hover:underline">
              press@enterprise.com
            </a>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 lg:py-24 bg-primary">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-black mb-4">
            Stay Updated
          </h2>
          <p className="text-sm text-black/80 mb-8 max-w-2xl mx-auto">
            Subscribe to our press list to receive the latest news and announcements
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/press/subscribe">
              <Button variant="secondary" size="lg">
                Subscribe to Press List
                <Mail className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/blog">
              <Button variant="outline" size="lg" className="bg-black/10 border-black/20 hover:bg-black/20">
                Read Our Blog
                <BookOpen className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
