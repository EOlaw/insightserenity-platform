'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Briefcase,
  MapPin,
  Clock,
  DollarSign,
  Users,
  Heart,
  Star,
  Trophy,
  Target,
  Zap,
  Coffee,
  Home,
  Globe,
  Shield,
  Rocket,
  Gift,
  Calendar,
  BookOpen,
  Code,
  Palette,
  Megaphone,
  Calculator,
  HeartHandshake,
  Building2,
  ArrowRight,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  Sparkles,
  Laptop,
  GraduationCap,
  Award,
  Smile,
  Gamepad2,
  Plane,
  Baby,
  Stethoscope,
  Dumbbell,
  Pizza,
  PartyPopper,
  Mountain,
  TreePine,
  Sun,
} from 'lucide-react'

const jobOpenings = [
  {
    id: 1,
    title: 'Senior Full Stack Engineer',
    department: 'Engineering',
    location: 'San Francisco, CA',
    type: 'Full-time',
    level: 'Senior',
    salary: '$150k - $200k',
    description: 'Join our core engineering team to build scalable, enterprise-grade features.',
    requirements: [
      '5+ years of experience with React, Node.js, and TypeScript',
      'Experience with cloud platforms (AWS/GCP/Azure)',
      'Strong understanding of distributed systems',
      'Excellent problem-solving skills',
    ],
    benefits: ['Equity', 'Health Insurance', 'Remote Work', '401k'],
    posted: '2 days ago',
  },
  {
    id: 2,
    title: 'Product Manager - Platform',
    department: 'Product',
    location: 'Remote',
    type: 'Full-time',
    level: 'Mid-Senior',
    salary: '$130k - $170k',
    description: 'Drive product strategy and roadmap for our core platform capabilities.',
    requirements: [
      '4+ years of product management experience',
      'B2B SaaS experience required',
      'Strong analytical and communication skills',
      'Technical background preferred',
    ],
    benefits: ['Equity', 'Health Insurance', 'Remote Work', '401k'],
    posted: '5 days ago',
  },
  {
    id: 3,
    title: 'DevOps Engineer',
    department: 'Engineering',
    location: 'New York, NY',
    type: 'Full-time',
    level: 'Mid',
    salary: '$120k - $160k',
    description: 'Build and maintain our cloud infrastructure and CI/CD pipelines.',
    requirements: [
      '3+ years of DevOps experience',
      'Expertise in Kubernetes and Docker',
      'Experience with Infrastructure as Code',
      'Strong scripting skills',
    ],
    benefits: ['Equity', 'Health Insurance', 'Hybrid Work', '401k'],
    posted: '1 week ago',
  },
  {
    id: 4,
    title: 'Senior UX Designer',
    department: 'Design',
    location: 'Remote',
    type: 'Full-time',
    level: 'Senior',
    salary: '$130k - $160k',
    description: 'Design intuitive, beautiful experiences for enterprise users.',
    requirements: [
      '5+ years of UX design experience',
      'Strong portfolio of B2B products',
      'Proficiency in Figma and design systems',
      'Experience with user research',
    ],
    benefits: ['Equity', 'Health Insurance', 'Remote Work', '401k'],
    posted: '1 week ago',
  },
  {
    id: 5,
    title: 'Customer Success Manager',
    department: 'Customer Success',
    location: 'San Francisco, CA',
    type: 'Full-time',
    level: 'Mid',
    salary: '$90k - $120k',
    description: 'Help our enterprise customers achieve success with our platform.',
    requirements: [
      '3+ years in customer success or account management',
      'Experience with enterprise customers',
      'Strong communication and relationship skills',
      'Technical aptitude',
    ],
    benefits: ['Equity', 'Health Insurance', 'Hybrid Work', '401k'],
    posted: '2 weeks ago',
  },
  {
    id: 6,
    title: 'Data Scientist',
    department: 'Engineering',
    location: 'Remote',
    type: 'Full-time',
    level: 'Senior',
    salary: '$140k - $180k',
    description: 'Build ML models and analytics to power our AI features.',
    requirements: [
      '4+ years of data science experience',
      'Strong Python and SQL skills',
      'Experience with ML frameworks',
      'Statistics and mathematics background',
    ],
    benefits: ['Equity', 'Health Insurance', 'Remote Work', '401k'],
    posted: '2 weeks ago',
  },
]

const departments = [
  'All Departments',
  'Engineering',
  'Product',
  'Design',
  'Customer Success',
  'Sales',
  'Marketing',
  'Operations',
]

const locations = [
  'All Locations',
  'San Francisco, CA',
  'New York, NY',
  'Remote',
  'London, UK',
  'Singapore',
]

const benefits = [
  {
    icon: Heart,
    title: 'Health & Wellness',
    description: 'Comprehensive health, dental, and vision coverage for you and your family',
  },
  {
    icon: Home,
    title: 'Flexible Work',
    description: 'Remote-first culture with optional access to beautiful offices',
  },
  {
    icon: Calendar,
    title: 'Unlimited PTO',
    description: 'Take the time you need to recharge and maintain work-life balance',
  },
  {
    icon: DollarSign,
    title: 'Competitive Compensation',
    description: 'Top-tier salaries and meaningful equity in a growing company',
  },
  {
    icon: GraduationCap,
    title: 'Learning & Development',
    description: '$2,000 annual budget for courses, conferences, and books',
  },
  {
    icon: Baby,
    title: 'Parental Leave',
    description: '16 weeks paid leave for all new parents',
  },
  {
    icon: Laptop,
    title: 'Equipment',
    description: 'Top-of-the-line equipment and $1,000 home office stipend',
  },
  {
    icon: Plane,
    title: 'Team Retreats',
    description: 'Quarterly team gatherings and annual company-wide retreat',
  },
]

const values = [
  {
    icon: Users,
    title: 'Customer First',
    description: 'Every decision starts with how it impacts our customers',
  },
  {
    icon: Rocket,
    title: 'Move Fast',
    description: 'Ship quickly, learn faster, and iterate constantly',
  },
  {
    icon: Heart,
    title: 'Care Deeply',
    description: 'Care about your work, your teammates, and our mission',
  },
  {
    icon: Trophy,
    title: 'Raise the Bar',
    description: 'Continuously improve and never settle for good enough',
  },
  {
    icon: Sparkles,
    title: 'Be Transparent',
    description: 'Share openly, give feedback, and communicate clearly',
  },
  {
    icon: Target,
    title: 'Own It',
    description: 'Take ownership and be accountable for outcomes',
  },
]

const lifeAtCompany = [
  {
    title: 'Engineering Blog',
    description: 'Our engineers share technical insights and learnings',
    link: '/blog/engineering',
  },
  {
    title: 'Diversity Report',
    description: 'Our commitment to building a diverse and inclusive team',
    link: '/diversity',
  },
  {
    title: 'Culture Handbook',
    description: 'Learn about our values, practices, and how we work',
    link: '/culture',
  },
  {
    title: 'Meet the Team',
    description: 'Get to know the people behind the platform',
    link: '/team',
  },
]

const hiringProcess = [
  {
    step: 1,
    title: 'Application Review',
    description: 'We review every application and respond within 3 days',
    duration: '1-3 days',
  },
  {
    step: 2,
    title: 'Initial Call',
    description: '30-min call with our recruiting team to discuss your background',
    duration: '30 minutes',
  },
  {
    step: 3,
    title: 'Technical/Role Interview',
    description: 'Deep dive into your skills with the hiring manager',
    duration: '1 hour',
  },
  {
    step: 4,
    title: 'Team Interviews',
    description: 'Meet potential teammates and assess cultural fit',
    duration: '2-3 hours',
  },
  {
    step: 5,
    title: 'Decision & Offer',
    description: 'We make decisions quickly and extend competitive offers',
    duration: '1-2 days',
  },
]

export default function CareersPage() {
  const [selectedDepartment, setSelectedDepartment] = useState('All Departments')
  const [selectedLocation, setSelectedLocation] = useState('All Locations')
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedJob, setExpandedJob] = useState<number | null>(null)

  const filteredJobs = jobOpenings.filter(job => {
    const matchesDepartment = selectedDepartment === 'All Departments' || job.department === selectedDepartment
    const matchesLocation = selectedLocation === 'All Locations' || job.location === selectedLocation
    const matchesSearch = job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          job.description.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesDepartment && matchesLocation && matchesSearch
  })

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
                <Link href="/about" className="text-xs text-muted-foreground hover:text-foreground transition">
                  About
                </Link>
                <Link href="/careers" className="text-xs text-primary font-medium">
                  Careers
                </Link>
                <Link href="/blog" className="text-xs text-muted-foreground hover:text-foreground transition">
                  Blog
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
              Join Our Mission to
              <span className="text-primary"> Transform Enterprise Software</span>
            </h1>
            <p className="text-base text-muted-foreground mb-8">
              We're building the future of work. Join a team of passionate innovators
              creating tools that empower businesses worldwide.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="#openings">
                <Button size="lg">
                  View Open Positions
                  <Briefcase className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/culture">
                <Button variant="outline" size="lg">
                  Learn About Our Culture
                  <Heart className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
            <div className="flex items-center justify-center gap-6 mt-8 text-sm text-muted-foreground">
              <span className="flex items-center">
                <Users className="h-4 w-4 mr-1" />
                500+ employees
              </span>
              <span className="flex items-center">
                <Globe className="h-4 w-4 mr-1" />
                5 offices globally
              </span>
              <span className="flex items-center">
                <Trophy className="h-4 w-4 mr-1" />
                Best workplace 2023
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Company Values */}
      <section className="py-16 lg:py-24 border-b border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">Our Values</h2>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
              The principles that guide how we work and make decisions
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {values.map((value, index) => {
              const Icon = value.icon
              return (
                <Card key={index} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mb-3">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-base">{value.title}</CardTitle>
                    <CardDescription className="text-xs">
                      {value.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      {/* Job Openings */}
      <section id="openings" className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">Open Positions</h2>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
              Find your next role and help us build the future
            </p>
          </div>

          {/* Filters */}
          <div className="max-w-4xl mx-auto mb-8">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search positions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm border border-border bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="px-4 py-2 text-sm border border-border bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {departments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="px-4 py-2 text-sm border border-border bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {locations.map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Job Listings */}
          <div className="max-w-4xl mx-auto space-y-4">
            {filteredJobs.length > 0 ? (
              filteredJobs.map((job) => (
                <Card key={job.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader
                    className="cursor-pointer"
                    onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{job.title}</CardTitle>
                        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center">
                            <Briefcase className="h-3 w-3 mr-1" />
                            {job.department}
                          </span>
                          <span className="flex items-center">
                            <MapPin className="h-3 w-3 mr-1" />
                            {job.location}
                          </span>
                          <span className="flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            {job.type}
                          </span>
                          <span className="flex items-center">
                            <DollarSign className="h-3 w-3 mr-1" />
                            {job.salary}
                          </span>
                        </div>
                      </div>
                      {expandedJob === job.id ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  </CardHeader>
                  {expandedJob === job.id && (
                    <CardContent>
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-sm font-semibold mb-2 text-foreground">About the Role</h4>
                          <p className="text-xs text-muted-foreground">{job.description}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold mb-2 text-foreground">Requirements</h4>
                          <ul className="space-y-1">
                            {job.requirements.map((req, idx) => (
                              <li key={idx} className="flex items-start space-x-2">
                                <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400 mt-0.5" />
                                <span className="text-xs text-muted-foreground">{req}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold mb-2 text-foreground">Benefits</h4>
                          <div className="flex flex-wrap gap-2">
                            {job.benefits.map((benefit, idx) => (
                              <span key={idx} className="text-xs px-2 py-1 bg-muted rounded-full text-foreground">
                                {benefit}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-4 border-t border-border">
                          <span className="text-xs text-muted-foreground">Posted {job.posted}</span>
                          <Button size="sm">
                            Apply Now
                            <ArrowRight className="ml-2 h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))
            ) : (
              <div className="text-center py-12">
                <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No positions found</p>
                <p className="text-sm text-muted-foreground mt-1">Try adjusting your filters</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16 lg:py-24 bg-muted/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">Benefits & Perks</h2>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
              We take care of our team so they can take care of our customers
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {benefits.map((benefit, index) => {
              const Icon = benefit.icon
              return (
                <Card key={index}>
                  <CardContent className="pt-6">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mb-3">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="text-sm font-semibold mb-1 text-foreground">{benefit.title}</h3>
                    <p className="text-xs text-muted-foreground">{benefit.description}</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      {/* Hiring Process */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">Our Hiring Process</h2>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
              We've designed our process to be transparent, efficient, and respectful of your time
            </p>
          </div>
          <div className="max-w-4xl mx-auto">
            <div className="relative">
              {/* Horizontal Line */}
              <div className="absolute top-8 left-8 right-8 h-0.5 bg-border hidden lg:block" />

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {hiringProcess.map((step, index) => (
                  <div key={index} className="relative">
                    <div className="flex flex-col items-center text-center">
                      <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center text-black font-bold text-lg z-10">
                        {step.step}
                      </div>
                      <h3 className="text-sm font-semibold mt-4 text-foreground">{step.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{step.description}</p>
                      <span className="text-xs text-primary mt-2">{step.duration}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Life at Company */}
      <section className="py-16 lg:py-24 bg-black dark:bg-gray-950 text-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">Life at Enterprise</h2>
            <p className="text-sm text-gray-300 max-w-2xl mx-auto">
              Get a glimpse into our culture and what makes us unique
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {lifeAtCompany.map((item, index) => (
              <Card key={index} className="bg-white/10 border-white/20 hover:bg-white/20 transition">
                <CardHeader>
                  <CardTitle className="text-base text-white">{item.title}</CardTitle>
                  <CardDescription className="text-xs text-gray-300">
                    {item.description}
                  </CardDescription>
                </CardHeader>
                <CardFooter>
                  <Link href={item.link} className="text-xs text-primary hover:underline flex items-center">
                    Learn more
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 lg:py-24 bg-primary">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-black mb-4">
            Ready to Join Us?
          </h2>
          <p className="text-sm text-black/80 mb-8 max-w-2xl mx-auto">
            Can't find the perfect role? We're always looking for talented people.
            Send us your resume and we'll keep you in mind for future opportunities.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/careers/apply">
              <Button variant="secondary" size="lg">
                Submit Your Resume
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/careers/referrals">
              <Button variant="outline" size="lg" className="bg-black/10 border-black/20 hover:bg-black/20">
                Refer a Friend
                <HeartHandshake className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}