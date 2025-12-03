'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  CreditCard,
  Download,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Calendar,
  DollarSign,
  TrendingUp,
  Settings,
  Loader2,
} from 'lucide-react'
import toast from 'react-hot-toast'

interface Invoice {
  id: string
  invoiceNumber: string
  date: Date
  amount: number
  status: 'paid' | 'pending' | 'overdue'
  description: string
  pdfUrl?: string
}

const mockInvoices: Invoice[] = [
  {
    id: '1',
    invoiceNumber: 'INV-2025-001',
    date: new Date(2025, 10, 1),
    amount: 299.00,
    status: 'paid',
    description: 'Professional Plan - November 2025',
    pdfUrl: '#',
  },
  {
    id: '2',
    invoiceNumber: 'INV-2025-002',
    date: new Date(2025, 9, 1),
    amount: 299.00,
    status: 'paid',
    description: 'Professional Plan - October 2025',
    pdfUrl: '#',
  },
  {
    id: '3',
    invoiceNumber: 'INV-2025-003',
    date: new Date(2025, 8, 1),
    amount: 299.00,
    status: 'paid',
    description: 'Professional Plan - September 2025',
    pdfUrl: '#',
  },
]

const plans = [
  {
    name: 'Starter',
    price: 99,
    features: [
      'Up to 5 projects',
      'Basic analytics',
      '5 GB storage',
      'Email support',
      'Core business features',
    ],
  },
  {
    name: 'Professional',
    price: 299,
    features: [
      'Unlimited projects',
      'Advanced analytics',
      '50 GB storage',
      'Priority support',
      'All core features',
      'Recruitment module',
    ],
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 999,
    features: [
      'Unlimited everything',
      'Custom analytics',
      'Unlimited storage',
      '24/7 dedicated support',
      'All features',
      'Custom integrations',
      'SLA guarantee',
    ],
  },
]

export default function BillingPage() {
  const [currentPlan] = useState('Professional')
  const [invoices] = useState<Invoice[]>(mockInvoices)
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState('')
  const [loading, setLoading] = useState(false)

  const handleDownloadInvoice = (invoice: Invoice) => {
    toast.success(`Downloading invoice ${invoice.invoiceNumber}`)
  }

  const handleUpgradePlan = async () => {
    setLoading(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 1500))
      toast.success(`Successfully upgraded to ${selectedPlan} plan`)
      setShowUpgradeDialog(false)
    } catch (error) {
      toast.error('Failed to upgrade plan')
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: Invoice['status']) => {
    switch (status) {
      case 'paid':
        return (
          <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-xs">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Paid
          </Badge>
        )
      case 'pending':
        return (
          <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300 text-xs">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        )
      case 'overdue':
        return (
          <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 text-xs">
            <AlertCircle className="h-3 w-3 mr-1" />
            Overdue
          </Badge>
        )
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Billing & Subscription</h1>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            Manage your subscription, invoices, and payment methods
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-[#ffc451]/10 rounded-lg flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-[#ffc451]" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-0.5">Current Plan</p>
                  <p className="text-base font-bold text-gray-900 dark:text-white">{currentPlan}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">$299/month</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                    <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-0.5">Next Billing Date</p>
                  <p className="text-base font-bold text-gray-900 dark:text-white">Dec 1, 2025</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Auto-renewal enabled</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-green-600 dark:text-green-300" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-0.5">Total Spent</p>
                  <p className="text-base font-bold text-gray-900 dark:text-white">$897.00</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Last 3 months</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Invoices</CardTitle>
                <CardDescription className="text-xs">
                  View and download your billing history
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {invoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-[#ffc451] dark:hover:border-[#ffc451] transition-colors"
                    >
                      <div className="flex items-start space-x-3 flex-1 min-w-0">
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
                            <FileText className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            <p className="text-xs font-medium text-gray-900 dark:text-white">
                              {invoice.invoiceNumber}
                            </p>
                            {getStatusBadge(invoice.status)}
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                            {invoice.description}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                            {invoice.date.toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric', 
                              year: 'numeric' 
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3 ml-3">
                        <div className="text-right">
                          <p className="text-xs font-bold text-gray-900 dark:text-white">
                            ${invoice.amount.toFixed(2)}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadInvoice(invoice)}
                          className="text-xs h-7 px-3"
                        >
                          <Download className="h-3 w-3 mr-1" />
                          PDF
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Available Plans</CardTitle>
                <CardDescription className="text-xs">
                  Upgrade or change your subscription plan
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {plans.map((plan) => (
                    <div
                      key={plan.name}
                      className={`relative p-4 rounded-lg border-2 transition-all ${
                        plan.name === currentPlan
                          ? 'border-[#ffc451] bg-[#ffc451]/5'
                          : 'border-gray-200 dark:border-gray-700 hover:border-[#ffc451]/50'
                      }`}
                    >
                      {plan.popular && (
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                          <Badge className="bg-[#ffc451] text-black text-xs">Popular</Badge>
                        </div>
                      )}
                      <div className="text-center mb-3">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">
                          {plan.name}
                        </h3>
                        <div className="flex items-baseline justify-center">
                          <span className="text-2xl font-bold text-gray-900 dark:text-white">
                            ${plan.price}
                          </span>
                          <span className="text-xs text-gray-600 dark:text-gray-400 ml-1">/mo</span>
                        </div>
                      </div>
                      <ul className="space-y-2 mb-4">
                        {plan.features.map((feature, index) => (
                          <li key={index} className="flex items-start space-x-2 text-xs">
                            <CheckCircle2 className="h-3 w-3 text-[#ffc451] flex-shrink-0 mt-0.5" />
                            <span className="text-gray-700 dark:text-gray-300">{feature}</span>
                          </li>
                        ))}
                      </ul>
                      <Button
                        variant={plan.name === currentPlan ? 'outline' : 'default'}
                        className={`w-full text-xs h-8 ${
                          plan.name === currentPlan
                            ? ''
                            : 'bg-[#ffc451] hover:bg-[#e6b048] text-black'
                        }`}
                        disabled={plan.name === currentPlan}
                        onClick={() => {
                          setSelectedPlan(plan.name)
                          setShowUpgradeDialog(true)
                        }}
                      >
                        {plan.name === currentPlan ? 'Current Plan' : 'Upgrade'}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Payment Method</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start space-x-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
                      <CreditCard className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 dark:text-white mb-0.5">
                      Visa •••• 4242
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Expires 12/2026
                    </p>
                  </div>
                </div>
                <Button variant="outline" className="w-full text-xs h-8">
                  <Settings className="h-3 w-3 mr-2" />
                  Update Payment Method
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Usage Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-600 dark:text-gray-400">Projects</span>
                    <span className="text-xs font-medium text-gray-900 dark:text-white">
                      8 / Unlimited
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-[#ffc451] w-[20%]" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-600 dark:text-gray-400">Storage</span>
                    <span className="text-xs font-medium text-gray-900 dark:text-white">
                      12 GB / 50 GB
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-[#ffc451] w-[24%]" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-600 dark:text-gray-400">Team Members</span>
                    <span className="text-xs font-medium text-gray-900 dark:text-white">
                      5 / Unlimited
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-[#ffc451] w-[15%]" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Billing Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start text-xs h-8">
                  <FileText className="h-3 w-3 mr-2" />
                  View All Invoices
                </Button>
                <Button variant="outline" className="w-full justify-start text-xs h-8">
                  <Download className="h-3 w-3 mr-2" />
                  Download Tax Documents
                </Button>
                <Button variant="outline" className="w-full justify-start text-xs h-8">
                  <Settings className="h-3 w-3 mr-2" />
                  Billing Preferences
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        <Dialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base">Upgrade to {selectedPlan}</DialogTitle>
              <DialogDescription className="text-xs">
                Confirm your plan upgrade
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-600 dark:text-gray-400">Current Plan</span>
                  <span className="text-xs font-medium text-gray-900 dark:text-white">{currentPlan}</span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-600 dark:text-gray-400">New Plan</span>
                  <span className="text-xs font-medium text-[#ffc451]">{selectedPlan}</span>
                </div>
                <Separator className="my-2" />
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-900 dark:text-white">
                    Monthly Charge
                  </span>
                  <span className="text-base font-bold text-gray-900 dark:text-white">
                    ${plans.find(p => p.name === selectedPlan)?.price}/mo
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Your plan will be upgraded immediately. The new charge will be prorated for the current billing period.
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowUpgradeDialog(false)}
                className="text-xs h-8 px-4"
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpgradePlan}
                disabled={loading}
                className="bg-[#ffc451] hover:bg-[#e6b048] text-black text-xs h-8 px-4"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Confirm Upgrade'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}