'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  Save,
  ArrowLeft,
  AlertCircle,
  Loader2,
  DollarSign,
  Users,
  Globe,
  FileText,
  Calendar,
  Bell,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '@/lib/api/client'

interface ClientData {
  _id: string
  clientCode: string
  companyName: string
  legalName: string
  tradingName: string
  businessDetails: {
    registrationNumber: string
    taxId: string
    businessType: string
    industry: string
    yearFounded: number
    numberOfEmployees: number
    website: string
    description: string
  }
  primaryContact: {
    name: string
    email: string
    phone: string
    position: string
    preferredContactMethod: string
  }
  addresses: {
    headquarters: {
      street1: string
      street2: string
      city: string
      state: string
      postalCode: string
      country: string
    }
    billing?: {
      street1: string
      street2: string
      city: string
      state: string
      postalCode: string
      country: string
    }
  }
  billing: {
    currency: string
    paymentTerms: string
    creditLimit: number
    taxExempt: boolean
  }
  relationship: {
    status: string
    tier: string
    acquisitionSource: string
  }
}

export default function EditClientPage() {
  const router = useRouter()
  const params = useParams()
  const clientId = params.id as string

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [clientData, setClientData] = useState<ClientData | null>(null)
  const [formData, setFormData] = useState({
    companyName: '',
    legalName: '',
    tradingName: '',
    registrationNumber: '',
    taxId: '',
    businessType: '',
    industry: '',
    yearFounded: '',
    numberOfEmployees: '',
    website: '',
    description: '',
    primaryContactName: '',
    primaryContactEmail: '',
    primaryContactPhone: '',
    primaryContactPosition: '',
    preferredContactMethod: 'email',
    street1: '',
    street2: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
    billingStreet1: '',
    billingStreet2: '',
    billingCity: '',
    billingState: '',
    billingPostalCode: '',
    billingCountry: '',
    currency: 'USD',
    paymentTerms: 'NET_30',
    creditLimit: '',
    taxExempt: false,
    relationshipStatus: 'active',
    tier: 'standard',
    acquisitionSource: ''
  })
  const [sameAsBilling, setSameAsBilling] = useState(false)

  useEffect(() => {
    loadClientData()
  }, [clientId])

  const loadClientData = async () => {
    setIsLoading(true)
    setError('')

    try {
      const response = await api.get(`/clients/${clientId}`)
      const data = response.data || response
      
      if (!data.client) {
        throw new Error('Invalid response structure')
      }

      const client = data.client
      setClientData(client)

      // Populate form with existing data
      setFormData({
        companyName: client.companyName || '',
        legalName: client.legalName || '',
        tradingName: client.tradingName || '',
        registrationNumber: client.businessDetails?.registrationNumber || '',
        taxId: client.businessDetails?.taxId || '',
        businessType: client.businessDetails?.businessType || '',
        industry: client.businessDetails?.industry || '',
        yearFounded: client.businessDetails?.yearFounded?.toString() || '',
        numberOfEmployees: client.businessDetails?.numberOfEmployees?.toString() || '',
        website: client.businessDetails?.website || '',
        description: client.businessDetails?.description || '',
        primaryContactName: client.primaryContact?.name || '',
        primaryContactEmail: client.primaryContact?.email || '',
        primaryContactPhone: client.primaryContact?.phone || '',
        primaryContactPosition: client.primaryContact?.position || '',
        preferredContactMethod: client.primaryContact?.preferredContactMethod || 'email',
        street1: client.addresses?.headquarters?.street1 || '',
        street2: client.addresses?.headquarters?.street2 || '',
        city: client.addresses?.headquarters?.city || '',
        state: client.addresses?.headquarters?.state || '',
        postalCode: client.addresses?.headquarters?.postalCode || '',
        country: client.addresses?.headquarters?.country || '',
        billingStreet1: client.addresses?.billing?.street1 || '',
        billingStreet2: client.addresses?.billing?.street2 || '',
        billingCity: client.addresses?.billing?.city || '',
        billingState: client.addresses?.billing?.state || '',
        billingPostalCode: client.addresses?.billing?.postalCode || '',
        billingCountry: client.addresses?.billing?.country || '',
        currency: client.billing?.currency || 'USD',
        paymentTerms: client.billing?.paymentTerms || 'NET_30',
        creditLimit: client.billing?.creditLimit?.toString() || '',
        taxExempt: client.billing?.taxExempt || false,
        relationshipStatus: client.relationship?.status || 'active',
        tier: client.relationship?.tier || 'standard',
        acquisitionSource: client.relationship?.acquisitionSource || ''
      })
    } catch (err: any) {
      console.error('Error loading client:', err)
      setError(err.response?.data?.error?.message || err.message || 'Failed to load client data')
      toast.error('Failed to load client data')
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked
      setFormData(prev => ({ ...prev, [name]: checked }))
    } else {
      setFormData(prev => ({ ...prev, [name]: value }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setError('')

    try {
      const updateData = {
        companyName: formData.companyName,
        legalName: formData.legalName,
        tradingName: formData.tradingName,
        businessDetails: {
          registrationNumber: formData.registrationNumber,
          taxId: formData.taxId,
          businessType: formData.businessType,
          industry: formData.industry,
          yearFounded: formData.yearFounded ? parseInt(formData.yearFounded) : undefined,
          numberOfEmployees: formData.numberOfEmployees ? parseInt(formData.numberOfEmployees) : undefined,
          website: formData.website,
          description: formData.description
        },
        primaryContact: {
          name: formData.primaryContactName,
          email: formData.primaryContactEmail,
          phone: formData.primaryContactPhone,
          position: formData.primaryContactPosition,
          preferredContactMethod: formData.preferredContactMethod
        },
        addresses: {
          headquarters: {
            street1: formData.street1,
            street2: formData.street2,
            city: formData.city,
            state: formData.state,
            postalCode: formData.postalCode,
            country: formData.country
          },
          billing: sameAsBilling ? {
            street1: formData.street1,
            street2: formData.street2,
            city: formData.city,
            state: formData.state,
            postalCode: formData.postalCode,
            country: formData.country
          } : {
            street1: formData.billingStreet1,
            street2: formData.billingStreet2,
            city: formData.billingCity,
            state: formData.billingState,
            postalCode: formData.billingPostalCode,
            country: formData.billingCountry
          }
        },
        billing: {
          currency: formData.currency,
          paymentTerms: formData.paymentTerms,
          creditLimit: formData.creditLimit ? parseFloat(formData.creditLimit) : undefined,
          taxExempt: formData.taxExempt
        },
        relationship: {
          status: formData.relationshipStatus,
          tier: formData.tier,
          acquisitionSource: formData.acquisitionSource
        }
      }

      await api.put(`/clients/${clientId}`, updateData)
      
      toast.success('Client profile updated successfully!')
      router.push(`/dashboard/core-business/clients/${clientId}`)
    } catch (err: any) {
      console.error('Error updating client:', err)
      const errorMessage = err.response?.data?.error?.message || err.message || 'Failed to update client'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-sm text-gray-600">Loading client data...</p>
        </div>
      </div>
    )
  }

  if (error && !clientData) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <Logo href="/" showText={false} />
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => router.push(`/dashboard/core-business/clients/${clientId}`)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </div>
          </div>
        </header>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-3 text-red-800">
                <AlertCircle className="h-5 w-5" />
                <div>
                  <p className="font-medium">Error Loading Client</p>
                  <p className="text-sm">{error}</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => router.push(`/dashboard/core-business/clients/${clientId}`)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Logo href="/" showText={false} />
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Edit Company Profile</h1>
                <p className="text-xs text-gray-500">{clientData?.companyName}</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => router.push(`/dashboard/core-business/clients/${clientId}`)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button variant="ghost" size="sm">
                <Bell className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            {/* Company Information */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  <CardTitle>Company Information</CardTitle>
                </div>
                <CardDescription>
                  Update your company's basic information and business details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-1">
                      Company Name <span className="text-red-500">*</span>
                    </label>
                    <Input
                      id="companyName"
                      name="companyName"
                      value={formData.companyName}
                      onChange={handleInputChange}
                      required
                      placeholder="Enter company name"
                    />
                  </div>

                  <div>
                    <label htmlFor="legalName" className="block text-sm font-medium text-gray-700 mb-1">
                      Legal Name
                    </label>
                    <Input
                      id="legalName"
                      name="legalName"
                      value={formData.legalName}
                      onChange={handleInputChange}
                      placeholder="Enter legal business name"
                    />
                  </div>

                  <div>
                    <label htmlFor="tradingName" className="block text-sm font-medium text-gray-700 mb-1">
                      Trading Name
                    </label>
                    <Input
                      id="tradingName"
                      name="tradingName"
                      value={formData.tradingName}
                      onChange={handleInputChange}
                      placeholder="Enter trading name"
                    />
                  </div>

                  <div>
                    <label htmlFor="registrationNumber" className="block text-sm font-medium text-gray-700 mb-1">
                      Registration Number
                    </label>
                    <Input
                      id="registrationNumber"
                      name="registrationNumber"
                      value={formData.registrationNumber}
                      onChange={handleInputChange}
                      placeholder="Business registration number"
                    />
                  </div>

                  <div>
                    <label htmlFor="taxId" className="block text-sm font-medium text-gray-700 mb-1">
                      Tax ID / EIN
                    </label>
                    <Input
                      id="taxId"
                      name="taxId"
                      value={formData.taxId}
                      onChange={handleInputChange}
                      placeholder="Tax identification number"
                    />
                  </div>

                  <div>
                    <label htmlFor="businessType" className="block text-sm font-medium text-gray-700 mb-1">
                      Business Type
                    </label>
                    <select
                      id="businessType"
                      name="businessType"
                      value={formData.businessType}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                    >
                      <option value="">Select business type</option>
                      <option value="sole_proprietorship">Sole Proprietorship</option>
                      <option value="partnership">Partnership</option>
                      <option value="llc">LLC</option>
                      <option value="corporation">Corporation</option>
                      <option value="nonprofit">Non-Profit</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="industry" className="block text-sm font-medium text-gray-700 mb-1">
                      Industry
                    </label>
                    <Input
                      id="industry"
                      name="industry"
                      value={formData.industry}
                      onChange={handleInputChange}
                      placeholder="e.g., Technology, Healthcare"
                    />
                  </div>

                  <div>
                    <label htmlFor="yearFounded" className="block text-sm font-medium text-gray-700 mb-1">
                      Year Founded
                    </label>
                    <Input
                      id="yearFounded"
                      name="yearFounded"
                      type="number"
                      value={formData.yearFounded}
                      onChange={handleInputChange}
                      placeholder="YYYY"
                      min="1800"
                      max={new Date().getFullYear()}
                    />
                  </div>

                  <div>
                    <label htmlFor="numberOfEmployees" className="block text-sm font-medium text-gray-700 mb-1">
                      Number of Employees
                    </label>
                    <Input
                      id="numberOfEmployees"
                      name="numberOfEmployees"
                      type="number"
                      value={formData.numberOfEmployees}
                      onChange={handleInputChange}
                      placeholder="Employee count"
                      min="0"
                    />
                  </div>

                  <div>
                    <label htmlFor="website" className="block text-sm font-medium text-gray-700 mb-1">
                      Website
                    </label>
                    <Input
                      id="website"
                      name="website"
                      type="url"
                      value={formData.website}
                      onChange={handleInputChange}
                      placeholder="https://www.example.com"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                    Company Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-primary resize-none"
                    placeholder="Brief description of your company..."
                  />
                </div>
              </CardContent>
            </Card>

            {/* Primary Contact */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Users className="h-5 w-5 text-primary" />
                  <CardTitle>Primary Contact</CardTitle>
                </div>
                <CardDescription>
                  Main point of contact for your organization
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="primaryContactName" className="block text-sm font-medium text-gray-700 mb-1">
                      Contact Name <span className="text-red-500">*</span>
                    </label>
                    <Input
                      id="primaryContactName"
                      name="primaryContactName"
                      value={formData.primaryContactName}
                      onChange={handleInputChange}
                      required
                      placeholder="Full name"
                    />
                  </div>

                  <div>
                    <label htmlFor="primaryContactEmail" className="block text-sm font-medium text-gray-700 mb-1">
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <Input
                      id="primaryContactEmail"
                      name="primaryContactEmail"
                      type="email"
                      value={formData.primaryContactEmail}
                      onChange={handleInputChange}
                      required
                      placeholder="email@example.com"
                    />
                  </div>

                  <div>
                    <label htmlFor="primaryContactPhone" className="block text-sm font-medium text-gray-700 mb-1">
                      Phone Number
                    </label>
                    <Input
                      id="primaryContactPhone"
                      name="primaryContactPhone"
                      type="tel"
                      value={formData.primaryContactPhone}
                      onChange={handleInputChange}
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>

                  <div>
                    <label htmlFor="primaryContactPosition" className="block text-sm font-medium text-gray-700 mb-1">
                      Position / Title
                    </label>
                    <Input
                      id="primaryContactPosition"
                      name="primaryContactPosition"
                      value={formData.primaryContactPosition}
                      onChange={handleInputChange}
                      placeholder="e.g., CEO, Manager"
                    />
                  </div>

                  <div>
                    <label htmlFor="preferredContactMethod" className="block text-sm font-medium text-gray-700 mb-1">
                      Preferred Contact Method
                    </label>
                    <select
                      id="preferredContactMethod"
                      name="preferredContactMethod"
                      value={formData.preferredContactMethod}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                    >
                      <option value="email">Email</option>
                      <option value="phone">Phone</option>
                      <option value="video_call">Video Call</option>
                      <option value="in_person">In Person</option>
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Headquarters Address */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  <CardTitle>Headquarters Address</CardTitle>
                </div>
                <CardDescription>
                  Primary business location
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label htmlFor="street1" className="block text-sm font-medium text-gray-700 mb-1">
                      Street Address <span className="text-red-500">*</span>
                    </label>
                    <Input
                      id="street1"
                      name="street1"
                      value={formData.street1}
                      onChange={handleInputChange}
                      required
                      placeholder="Street address"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label htmlFor="street2" className="block text-sm font-medium text-gray-700 mb-1">
                      Street Address Line 2
                    </label>
                    <Input
                      id="street2"
                      name="street2"
                      value={formData.street2}
                      onChange={handleInputChange}
                      placeholder="Apt, suite, unit, building, floor, etc."
                    />
                  </div>

                  <div>
                    <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">
                      City <span className="text-red-500">*</span>
                    </label>
                    <Input
                      id="city"
                      name="city"
                      value={formData.city}
                      onChange={handleInputChange}
                      required
                      placeholder="City"
                    />
                  </div>

                  <div>
                    <label htmlFor="state" className="block text-sm font-medium text-gray-700 mb-1">
                      State / Province <span className="text-red-500">*</span>
                    </label>
                    <Input
                      id="state"
                      name="state"
                      value={formData.state}
                      onChange={handleInputChange}
                      required
                      placeholder="State / Province"
                    />
                  </div>

                  <div>
                    <label htmlFor="postalCode" className="block text-sm font-medium text-gray-700 mb-1">
                      Postal Code <span className="text-red-500">*</span>
                    </label>
                    <Input
                      id="postalCode"
                      name="postalCode"
                      value={formData.postalCode}
                      onChange={handleInputChange}
                      required
                      placeholder="Postal code"
                    />
                  </div>

                  <div>
                    <label htmlFor="country" className="block text-sm font-medium text-gray-700 mb-1">
                      Country <span className="text-red-500">*</span>
                    </label>
                    <Input
                      id="country"
                      name="country"
                      value={formData.country}
                      onChange={handleInputChange}
                      required
                      placeholder="Country"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Billing Address */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <DollarSign className="h-5 w-5 text-primary" />
                      <CardTitle>Billing Address</CardTitle>
                    </div>
                    <CardDescription>
                      Address for invoices and billing correspondence
                    </CardDescription>
                  </div>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sameAsBilling}
                      onChange={(e) => setSameAsBilling(e.target.checked)}
                      className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-2 focus:ring-primary"
                    />
                    <span className="text-sm text-gray-700">Same as headquarters</span>
                  </label>
                </div>
              </CardHeader>
              {!sameAsBilling && (
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label htmlFor="billingStreet1" className="block text-sm font-medium text-gray-700 mb-1">
                        Street Address
                      </label>
                      <Input
                        id="billingStreet1"
                        name="billingStreet1"
                        value={formData.billingStreet1}
                        onChange={handleInputChange}
                        placeholder="Street address"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label htmlFor="billingStreet2" className="block text-sm font-medium text-gray-700 mb-1">
                        Street Address Line 2
                      </label>
                      <Input
                        id="billingStreet2"
                        name="billingStreet2"
                        value={formData.billingStreet2}
                        onChange={handleInputChange}
                        placeholder="Apt, suite, unit, building, floor, etc."
                      />
                    </div>

                    <div>
                      <label htmlFor="billingCity" className="block text-sm font-medium text-gray-700 mb-1">
                        City
                      </label>
                      <Input
                        id="billingCity"
                        name="billingCity"
                        value={formData.billingCity}
                        onChange={handleInputChange}
                        placeholder="City"
                      />
                    </div>

                    <div>
                      <label htmlFor="billingState" className="block text-sm font-medium text-gray-700 mb-1">
                        State / Province
                      </label>
                      <Input
                        id="billingState"
                        name="billingState"
                        value={formData.billingState}
                        onChange={handleInputChange}
                        placeholder="State / Province"
                      />
                    </div>

                    <div>
                      <label htmlFor="billingPostalCode" className="block text-sm font-medium text-gray-700 mb-1">
                        Postal Code
                      </label>
                      <Input
                        id="billingPostalCode"
                        name="billingPostalCode"
                        value={formData.billingPostalCode}
                        onChange={handleInputChange}
                        placeholder="Postal code"
                      />
                    </div>

                    <div>
                      <label htmlFor="billingCountry" className="block text-sm font-medium text-gray-700 mb-1">
                        Country
                      </label>
                      <Input
                        id="billingCountry"
                        name="billingCountry"
                        value={formData.billingCountry}
                        onChange={handleInputChange}
                        placeholder="Country"
                      />
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Billing & Payment Settings */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <CardTitle>Billing & Payment Settings</CardTitle>
                </div>
                <CardDescription>
                  Configure billing preferences and payment terms
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="currency" className="block text-sm font-medium text-gray-700 mb-1">
                      Currency
                    </label>
                    <select
                      id="currency"
                      name="currency"
                      value={formData.currency}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                    >
                      <option value="USD">USD - US Dollar</option>
                      <option value="EUR">EUR - Euro</option>
                      <option value="GBP">GBP - British Pound</option>
                      <option value="CAD">CAD - Canadian Dollar</option>
                      <option value="AUD">AUD - Australian Dollar</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="paymentTerms" className="block text-sm font-medium text-gray-700 mb-1">
                      Payment Terms
                    </label>
                    <select
                      id="paymentTerms"
                      name="paymentTerms"
                      value={formData.paymentTerms}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                    >
                      <option value="DUE_ON_RECEIPT">Due on Receipt</option>
                      <option value="NET_15">Net 15</option>
                      <option value="NET_30">Net 30</option>
                      <option value="NET_45">Net 45</option>
                      <option value="NET_60">Net 60</option>
                      <option value="NET_90">Net 90</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="creditLimit" className="block text-sm font-medium text-gray-700 mb-1">
                      Credit Limit
                    </label>
                    <Input
                      id="creditLimit"
                      name="creditLimit"
                      type="number"
                      value={formData.creditLimit}
                      onChange={handleInputChange}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                    />
                  </div>

                  <div className="flex items-center space-x-2 pt-6">
                    <input
                      type="checkbox"
                      id="taxExempt"
                      name="taxExempt"
                      checked={formData.taxExempt}
                      onChange={handleInputChange}
                      className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-2 focus:ring-primary"
                    />
                    <label htmlFor="taxExempt" className="text-sm text-gray-700">
                      Tax Exempt Organization
                    </label>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Relationship Settings */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Globe className="h-5 w-5 text-primary" />
                  <CardTitle>Relationship Settings</CardTitle>
                </div>
                <CardDescription>
                  Manage relationship status and client tier
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="relationshipStatus" className="block text-sm font-medium text-gray-700 mb-1">
                      Relationship Status
                    </label>
                    <select
                      id="relationshipStatus"
                      name="relationshipStatus"
                      value={formData.relationshipStatus}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                    >
                      <option value="prospect">Prospect</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="churned">Churned</option>
                      <option value="on_hold">On Hold</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="tier" className="block text-sm font-medium text-gray-700 mb-1">
                      Client Tier
                    </label>
                    <select
                      id="tier"
                      name="tier"
                      value={formData.tier}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                    >
                      <option value="bronze">Bronze</option>
                      <option value="silver">Silver</option>
                      <option value="gold">Gold</option>
                      <option value="platinum">Platinum</option>
                      <option value="enterprise">Enterprise</option>
                      <option value="standard">Standard</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="acquisitionSource" className="block text-sm font-medium text-gray-700 mb-1">
                      Acquisition Source
                    </label>
                    <select
                      id="acquisitionSource"
                      name="acquisitionSource"
                      value={formData.acquisitionSource}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                    >
                      <option value="">Select source</option>
                      <option value="referral">Referral</option>
                      <option value="website">Website</option>
                      <option value="cold_call">Cold Call</option>
                      <option value="marketing">Marketing Campaign</option>
                      <option value="partner">Partner</option>
                      <option value="social_media">Social Media</option>
                      <option value="trade_show">Trade Show</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-4 pb-8">
              <Button 
                type="button"
                variant="outline"
                onClick={() => router.push(`/dashboard/core-business/clients/${clientId}`)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Cancel
              </Button>

              <Button 
                type="submit"
                disabled={isSaving}
                className="bg-primary text-black hover:bg-primary-600 font-semibold"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving Changes...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </main>
    </div>
  )
}