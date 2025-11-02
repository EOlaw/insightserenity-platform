'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Footer from '@/components/Footer'
import {
  Mail,
  Phone,
  MapPin,
  Clock,
  Send,
  MessageSquare,
  Headphones,
  FileText,
  Users,
  Globe,
  Calendar,
  CheckCircle,
  ArrowRight,
  Building2,
  Linkedin,
  Twitter,
  Github,
} from 'lucide-react'
import toast from 'react-hot-toast'

const contactOptions = [
  {
    icon: MessageSquare,
    title: 'Sales Inquiries',
    description: 'Interested in our enterprise solutions? Our sales team is here to help.',
    email: 'sales@enterprise.com',
    responseTime: 'Within 1 business day',
  },
  {
    icon: Headphones,
    title: 'Technical Support',
    description: '24/7 support for all technical issues and questions.',
    email: 'support@enterprise.com',
    responseTime: 'Within 2 hours',
  },
  {
    icon: Users,
    title: 'Partnerships',
    description: 'Explore partnership and integration opportunities.',
    email: 'partners@enterprise.com',
    responseTime: 'Within 2 business days',
  },
  {
    icon: FileText,
    title: 'Media & Press',
    description: 'Press inquiries and media resources.',
    email: 'press@enterprise.com',
    responseTime: 'Within 1 business day',
  },
]

const offices = [
  {
    location: 'San Francisco (HQ)',
    address: '100 Market Street, Suite 500',
    city: 'San Francisco, CA 94105',
    country: 'United States',
    phone: '+1 (415) 555-0100',
    hours: 'Mon-Fri: 9:00 AM - 6:00 PM PST',
  },
  {
    location: 'New York',
    address: '350 Fifth Avenue, Floor 75',
    city: 'New York, NY 10118',
    country: 'United States',
    phone: '+1 (212) 555-0200',
    hours: 'Mon-Fri: 9:00 AM - 6:00 PM EST',
  },
  {
    location: 'London',
    address: '25 Old Broad Street',
    city: 'London EC2N 1HN',
    country: 'United Kingdom',
    phone: '+44 20 7123 4567',
    hours: 'Mon-Fri: 9:00 AM - 6:00 PM GMT',
  },
  {
    location: 'Singapore',
    address: '1 Raffles Place, Tower One',
    city: 'Singapore 048616',
    country: 'Singapore',
    phone: '+65 6789 0123',
    hours: 'Mon-Fri: 9:00 AM - 6:00 PM SGT',
  },
]

export default function ContactPage() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    company: '',
    phone: '',
    subject: '',
    message: '',
    type: 'sales',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000))

      toast.success('Message sent successfully! We\'ll get back to you soon.')

      // Reset form
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        company: '',
        phone: '',
        subject: '',
        message: '',
        type: 'sales',
      })
    } catch (error) {
      toast.error('Failed to send message. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
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
                <Link href="/contact" className="text-xs text-primary font-medium">
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
              Get in Touch
            </h1>
            <p className="text-base text-muted-foreground mb-8">
              Have questions about our platform? We're here to help. Reach out to our team
              and we'll get back to you as soon as possible.
            </p>
            <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
              <a href="mailto:hello@enterprise.com" className="flex items-center gap-2 hover:text-primary transition">
                <Mail className="h-4 w-4" />
                hello@enterprise.com
              </a>
              <a href="tel:+14155550100" className="flex items-center gap-2 hover:text-primary transition">
                <Phone className="h-4 w-4" />
                +1 (415) 555-0100
              </a>
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                24/7 Support Available
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Form and Info */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Contact Form */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Send us a Message</CardTitle>
                  <CardDescription className="text-xs">
                    Fill out the form below and we'll get back to you shortly
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input
                        type="text"
                        name="firstName"
                        label="First Name"
                        placeholder="John"
                        value={formData.firstName}
                        onChange={handleChange}
                        required
                        disabled={isSubmitting}
                      />
                      <Input
                        type="text"
                        name="lastName"
                        label="Last Name"
                        placeholder="Doe"
                        value={formData.lastName}
                        onChange={handleChange}
                        required
                        disabled={isSubmitting}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input
                        type="email"
                        name="email"
                        label="Email"
                        placeholder="john@company.com"
                        value={formData.email}
                        onChange={handleChange}
                        required
                        disabled={isSubmitting}
                      />
                      <Input
                        type="text"
                        name="company"
                        label="Company"
                        placeholder="Acme Inc."
                        value={formData.company}
                        onChange={handleChange}
                        required
                        disabled={isSubmitting}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input
                        type="tel"
                        name="phone"
                        label="Phone (Optional)"
                        placeholder="+1 (555) 000-0000"
                        value={formData.phone}
                        onChange={handleChange}
                        disabled={isSubmitting}
                      />
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-foreground">Inquiry Type</label>
                        <select
                          name="type"
                          value={formData.type}
                          onChange={handleChange}
                          className="w-full px-3 py-2 text-xs border border-border bg-background text-foreground rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                          disabled={isSubmitting}
                        >
                          <option value="sales">Sales Inquiry</option>
                          <option value="support">Technical Support</option>
                          <option value="partnership">Partnership</option>
                          <option value="media">Media/Press</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                    </div>

                    <Input
                      type="text"
                      name="subject"
                      label="Subject"
                      placeholder="How can we help you?"
                      value={formData.subject}
                      onChange={handleChange}
                      required
                      disabled={isSubmitting}
                      fullWidth
                    />

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">Message</label>
                      <textarea
                        name="message"
                        value={formData.message}
                        onChange={handleChange}
                        rows={6}
                        className="w-full px-3 py-2 text-xs border border-border bg-background text-foreground rounded-md focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                        placeholder="Tell us more about your inquiry..."
                        required
                        disabled={isSubmitting}
                      />
                    </div>

                    <Button
                      type="submit"
                      fullWidth
                      loading={isSubmitting}
                      rightIcon={!isSubmitting && <Send className="h-3.5 w-3.5" />}
                    >
                      Send Message
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* Contact Information */}
            <div className="space-y-6">
              {/* Quick Contact */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Quick Contact</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <Mail className="h-4 w-4 text-primary mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-foreground">Email</p>
                      <a href="mailto:hello@enterprise.com" className="text-xs text-muted-foreground hover:text-primary">
                        hello@enterprise.com
                      </a>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <Phone className="h-4 w-4 text-primary mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-foreground">Phone</p>
                      <a href="tel:+14155550100" className="text-xs text-muted-foreground hover:text-primary">
                        +1 (415) 555-0100
                      </a>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <Headphones className="h-4 w-4 text-primary mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-foreground">Support</p>
                      <p className="text-xs text-muted-foreground">24/7 Live Chat Available</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Social Links */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Follow Us</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex space-x-3">
                    <a href="#" className="p-2 bg-muted rounded-lg hover:bg-primary hover:text-white transition">
                      <Linkedin className="h-4 w-4" />
                    </a>
                    <a href="#" className="p-2 bg-muted rounded-lg hover:bg-primary hover:text-white transition">
                      <Twitter className="h-4 w-4" />
                    </a>
                    <a href="#" className="p-2 bg-muted rounded-lg hover:bg-primary hover:text-white transition">
                      <Github className="h-4 w-4" />
                    </a>
                  </div>
                </CardContent>
              </Card>

              {/* Office Hours */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Office Hours</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Monday - Friday</span>
                    <span className="font-medium text-foreground">9:00 AM - 6:00 PM</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Saturday</span>
                    <span className="font-medium text-foreground">10:00 AM - 4:00 PM</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Sunday</span>
                    <span className="font-medium text-foreground">Closed</span>
                  </div>
                  <p className="text-2xs text-muted-foreground pt-2">
                    * Support available 24/7 for enterprise customers
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Options */}
      <section className="py-16 lg:py-24 bg-muted/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">How Can We Help?</h2>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
              Choose the department that best fits your needs
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
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
                    <a href={`mailto:${option.email}`} className="text-xs text-primary hover:underline">
                      {option.email}
                    </a>
                    <p className="text-2xs text-muted-foreground mt-2">
                      Response time: {option.responseTime}
                    </p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      {/* Office Locations */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">Our Offices</h2>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
              Visit us at any of our global locations
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {offices.map((office, index) => (
              <Card key={index}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{office.location}</CardTitle>
                      <div className="flex items-center gap-1 mt-1">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        <span className="text-2xs text-muted-foreground">{office.country}</span>
                      </div>
                    </div>
                    <Globe className="h-4 w-4 text-primary" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-foreground">Address</p>
                    <p className="text-xs text-muted-foreground">{office.address}</p>
                    <p className="text-xs text-muted-foreground">{office.city}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">Phone</p>
                    <a href={`tel:${office.phone.replace(/\s/g, '')}`} className="text-xs text-primary hover:underline">
                      {office.phone}
                    </a>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">Hours</p>
                    <p className="text-xs text-muted-foreground">{office.hours}</p>
                  </div>
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
            Ready to Get Started?
          </h2>
          <p className="text-sm text-black/80 mb-8 max-w-2xl mx-auto">
            Join thousands of companies already using Enterprise Platform
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/register">
              <Button variant="secondary" size="lg">
                Start Free Trial
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
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  )
}