'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  HelpCircle,
  MessageCircle,
  Mail,
  Phone,
  FileText,
  Video,
  Book,
  Search,
  Send,
  Loader2,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react'
import toast from 'react-hot-toast'

const faqItems = [
  {
    question: 'How do I update my profile information?',
    answer: 'Navigate to Settings from the dashboard menu, then select the Profile tab. You can update your personal information, contact details, and preferences. Remember to save your changes before leaving the page.',
  },
  {
    question: 'How do I upload and manage documents?',
    answer: 'Go to Client Management and select the Documents tab. Click the "Add Document" button to upload new files. You can organize documents with tags, add descriptions, and control access permissions. Supported file types include PDF, Word documents, Excel spreadsheets, and images.',
  },
  {
    question: 'What should I do if I forget my password?',
    answer: 'Click the "Forgot Password" link on the login page. Enter your email address, and you will receive a password reset link. Follow the instructions in the email to create a new password. For security reasons, reset links expire after 24 hours.',
  },
  {
    question: 'How do I contact my assigned consultant?',
    answer: 'You can reach your consultant through the Messages feature in your dashboard. Click on Messages in the main navigation, then select your consultant from the contacts list. You can also find their contact information in your project details.',
  },
  {
    question: 'Can I add additional team members to my account?',
    answer: 'Yes, you can invite team members through the Organization section. Navigate to Organization > Members and click "Invite Member". They will receive an email invitation to join your organization with appropriate access permissions.',
  },
  {
    question: 'How do I track project progress?',
    answer: 'Project progress can be monitored through the Projects section under Core Business. Each project displays its current status, milestones, deliverables, and timeline. You can view detailed analytics and reports for comprehensive project insights.',
  },
  {
    question: 'What are the different subscription plans?',
    answer: 'We offer multiple subscription tiers to match your business needs. Visit the Billing section to view available plans, compare features, and upgrade or downgrade your subscription. Changes take effect at the start of your next billing cycle.',
  },
  {
    question: 'How do I export my data?',
    answer: 'Data export functionality is available in the Settings section. You can export contacts, documents, and project data in various formats including CSV and PDF. Large exports may take some time to process and will be sent to your email.',
  },
]

const resources = [
  {
    title: 'Getting Started Guide',
    description: 'Learn the basics of using the InsightSerenity platform',
    icon: Book,
    link: '#',
  },
  {
    title: 'Video Tutorials',
    description: 'Watch step-by-step tutorials for common tasks',
    icon: Video,
    link: '#',
  },
  {
    title: 'Documentation',
    description: 'Comprehensive guides and API documentation',
    icon: FileText,
    link: '#',
  },
]

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [contactForm, setContactForm] = useState({
    subject: '',
    message: '',
    priority: 'normal',
  })

  const handleSubmitContact = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // TODO: Submit contact form to API
      await new Promise(resolve => setTimeout(resolve, 1500))
      toast.success('Your message has been sent. We will get back to you shortly.')
      setContactForm({ subject: '', message: '', priority: 'normal' })
    } catch (error) {
      toast.error('Failed to send message. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const filteredFAQs = faqItems.filter(
    item =>
      item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Help & Support</h1>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            Find answers to common questions and get assistance
          </p>
        </div>

        {/* Quick Contact Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-[#ffc451]/10 rounded-lg flex items-center justify-center">
                    <MessageCircle className="h-4 w-4 text-[#ffc451]" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xs font-semibold text-gray-900 dark:text-white mb-1">Live Chat</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                    Chat with our support team
                  </p>
                  <Button variant="outline" size="sm" className="text-xs h-7 px-3">
                    Start Chat
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-[#ffc451]/10 rounded-lg flex items-center justify-center">
                    <Mail className="h-4 w-4 text-[#ffc451]" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xs font-semibold text-gray-900 dark:text-white mb-1">Email Support</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                    support@insightserenity.com
                  </p>
                  <Button variant="outline" size="sm" className="text-xs h-7 px-3">
                    Send Email
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-[#ffc451]/10 rounded-lg flex items-center justify-center">
                    <Phone className="h-4 w-4 text-[#ffc451]" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xs font-semibold text-gray-900 dark:text-white mb-1">Phone Support</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                    +1 (555) 123-4567
                  </p>
                  <Button variant="outline" size="sm" className="text-xs h-7 px-3">
                    Call Now
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* FAQ Section */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Frequently Asked Questions</CardTitle>
                <CardDescription className="text-xs">
                  Quick answers to common questions
                </CardDescription>
                <div className="pt-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <Input
                      placeholder="Search FAQs..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 text-xs h-8"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="space-y-2">
                  {filteredFAQs.map((item, index) => (
                    <AccordionItem
                      key={index}
                      value={`item-${index}`}
                      className="border border-gray-200 dark:border-gray-700 rounded-lg px-4"
                    >
                      <AccordionTrigger className="text-xs font-medium hover:no-underline py-3">
                        {item.question}
                      </AccordionTrigger>
                      <AccordionContent className="text-xs text-gray-600 dark:text-gray-400 pb-3">
                        {item.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>

                {filteredFAQs.length === 0 && (
                  <div className="text-center py-8">
                    <HelpCircle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      No FAQs found matching your search
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Contact Form */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contact Support</CardTitle>
                <CardDescription className="text-xs">
                  Send us a message and we will get back to you as soon as possible
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmitContact} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="subject" className="text-xs">Subject</Label>
                    <Input
                      id="subject"
                      value={contactForm.subject}
                      onChange={(e) => setContactForm({ ...contactForm, subject: e.target.value })}
                      placeholder="Brief description of your issue"
                      required
                      className="text-xs h-8"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="message" className="text-xs">Message</Label>
                    <Textarea
                      id="message"
                      value={contactForm.message}
                      onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                      placeholder="Describe your issue in detail..."
                      rows={5}
                      required
                      className="text-xs resize-none"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[#ffc451] hover:bg-[#e6b048] text-black text-xs h-8"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-3 w-3" />
                        Send Message
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Resources Sidebar */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resources</CardTitle>
                <CardDescription className="text-xs">
                  Helpful guides and documentation
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {resources.map((resource, index) => (
                  <a
                    key={index}
                    href={resource.link}
                    className="flex items-start space-x-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-[#ffc451] dark:hover:border-[#ffc451] transition-colors group"
                  >
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center group-hover:bg-[#ffc451]/10 transition-colors">
                        <resource.icon className="h-4 w-4 text-gray-600 dark:text-gray-400 group-hover:text-[#ffc451]" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-semibold text-gray-900 dark:text-white mb-0.5">
                        {resource.title}
                      </h4>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {resource.description}
                      </p>
                    </div>
                    <ExternalLink className="h-3 w-3 text-gray-400 flex-shrink-0" />
                  </a>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">System Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-xs text-gray-900 dark:text-white">Platform</span>
                  </div>
                  <span className="text-xs text-green-600 dark:text-green-400">Operational</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-xs text-gray-900 dark:text-white">API</span>
                  </div>
                  <span className="text-xs text-green-600 dark:text-green-400">Operational</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-xs text-gray-900 dark:text-white">File Storage</span>
                  </div>
                  <span className="text-xs text-green-600 dark:text-green-400">Operational</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Support Hours</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Monday - Friday</span>
                  <span className="font-medium text-gray-900 dark:text-white">9:00 AM - 6:00 PM</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Saturday</span>
                  <span className="font-medium text-gray-900 dark:text-white">10:00 AM - 4:00 PM</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Sunday</span>
                  <span className="font-medium text-gray-900 dark:text-white">Closed</span>
                </div>
                <Separator className="my-2" />
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  All times are in Eastern Time (ET)
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}