'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Award,
  Plus,
  Edit,
  Trash2,
  Calendar,
  CheckCircle,
  AlertCircle,
  XCircle,
  ArrowLeft,
  Loader2,
  ExternalLink,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { consultantApi, type ConsultantProfile, type Certification } from '@/lib/api/consultant'

export default function CertificationsPage() {
  const router = useRouter()
  const [consultant, setConsultant] = useState<ConsultantProfile | null>(null)
  const [certifications, setCertifications] = useState<Certification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [selectedCert, setSelectedCert] = useState<Certification | null>(null)

  const [certForm, setCertForm] = useState({
    name: '',
    issuingOrganization: '',
    issueDate: '',
    expirationDate: '',
    credentialId: '',
    credentialUrl: '',
    description: '',
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setIsLoading(true)

    try {
      const data = await consultantApi.getMyProfile()
      setConsultant(data)
      setCertifications(data.certifications || [])
      toast.success('Certifications loaded successfully')
    } catch (error: any) {
      console.error('Failed to load certifications:', error)
      toast.error('Failed to load certifications')
      
      if (error.response?.status === 401) {
        router.push('/login')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setCertForm({
      name: '',
      issuingOrganization: '',
      issueDate: '',
      expirationDate: '',
      credentialId: '',
      credentialUrl: '',
      description: '',
    })
    setSelectedCert(null)
    setIsEditMode(false)
  }

  const handleOpenDialog = (cert?: Certification) => {
    if (cert) {
      setIsEditMode(true)
      setSelectedCert(cert)
      setCertForm({
        name: cert.name,
        issuingOrganization: cert.issuingOrganization,
        issueDate: new Date(cert.issueDate).toISOString().split('T')[0],
        expirationDate: cert.expirationDate ? new Date(cert.expirationDate).toISOString().split('T')[0] : '',
        credentialId: cert.credentialId || '',
        credentialUrl: cert.credentialUrl || '',
        description: cert.description || '',
      })
    } else {
      resetForm()
    }
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setTimeout(resetForm, 300)
  }

  const handleSubmit = async () => {
    if (!certForm.name.trim() || !certForm.issuingOrganization.trim() || !certForm.issueDate) {
      toast.error('Please fill in all required fields')
      return
    }

    if (!consultant?._id) {
      toast.error('Consultant ID not found')
      return
    }

    try {
      const certData = {
        name: certForm.name,
        issuingOrganization: certForm.issuingOrganization,
        issueDate: certForm.issueDate,
        expirationDate: certForm.expirationDate || undefined,
        credentialId: certForm.credentialId || undefined,
        credentialUrl: certForm.credentialUrl || undefined,
        description: certForm.description || undefined,
        status: 'active' as const,
      }

      if (isEditMode && selectedCert?._id) {
        await consultantApi.updateCertification(consultant._id, selectedCert._id, certData)
        toast.success('Certification updated successfully')
      } else {
        await consultantApi.addCertification(consultant._id, certData)
        toast.success('Certification added successfully')
      }

      handleCloseDialog()
      await loadData()
    } catch (error: any) {
      console.error('Failed to save certification:', error)
      toast.error(error.response?.data?.message || 'Failed to save certification')
    }
  }

  const handleDeleteCert = async (cert: Certification) => {
    if (!consultant?._id || !cert._id) {
      toast.error('Missing required information')
      return
    }

    if (!confirm(`Are you sure you want to remove "${cert.name}"?`)) {
      return
    }

    try {
      await consultantApi.removeCertification(consultant._id, cert._id)
      toast.success('Certification removed successfully')
      await loadData()
    } catch (error: any) {
      console.error('Failed to delete certification:', error)
      toast.error(error.response?.data?.message || 'Failed to delete certification')
    }
  }

  const getCertificationStatus = (cert: Certification) => {
    if (cert.status === 'expired' || cert.status === 'revoked') {
      return { status: cert.status, variant: 'destructive' as const, icon: XCircle }
    }

    if (!cert.expirationDate) {
      return { status: 'active', variant: 'default' as const, icon: CheckCircle }
    }

    const expirationDate = new Date(cert.expirationDate)
    const today = new Date()
    const daysUntilExpiration = Math.ceil((expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    if (daysUntilExpiration < 0) {
      return { status: 'expired', variant: 'destructive' as const, icon: XCircle }
    } else if (daysUntilExpiration <= 30) {
      return { status: 'expiring_soon', variant: 'secondary' as const, icon: AlertCircle }
    } else {
      return { status: 'active', variant: 'default' as const, icon: CheckCircle }
    }
  }

  const activeCerts = certifications.filter(c => getCertificationStatus(c).status === 'active')
  const expiringSoonCerts = certifications.filter(c => getCertificationStatus(c).status === 'expiring_soon')
  const expiredCerts = certifications.filter(c => getCertificationStatus(c).status === 'expired')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Loading certifications...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/consultant">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Certifications</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage your professional certifications and credentials
            </p>
          </div>
        </div>
        <Button onClick={() => handleOpenDialog()} size="sm">
          <Plus className="mr-2 h-3.5 w-3.5" />
          Add Certification
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Active Certifications</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCerts.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Currently valid
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Expiring Soon</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{expiringSoonCerts.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Within 30 days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Certifications</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{certifications.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              All credentials
            </p>
          </CardContent>
        </Card>
      </div>

      {expiringSoonCerts.length > 0 && (
        <Card className="border-yellow-600">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <CardTitle className="text-base">Expiring Soon</CardTitle>
            </div>
            <CardDescription>
              The following certifications will expire within 30 days
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {expiringSoonCerts.map((cert) => {
                const expirationDate = new Date(cert.expirationDate!)
                const daysUntilExpiration = Math.ceil((expirationDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                
                return (
                  <div key={cert._id} className="rounded-lg border border-yellow-600/20 p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium text-sm">{cert.name}</h4>
                        <p className="text-xs text-muted-foreground">{cert.issuingOrganization}</p>
                        <p className="text-xs text-yellow-600 mt-1">
                          Expires in {daysUntilExpiration} days ({expirationDate.toLocaleDateString()})
                        </p>
                      </div>
                      <Button variant="outline" size="sm">
                        Renew
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Certifications</CardTitle>
          <CardDescription>
            Your complete professional credentials portfolio
          </CardDescription>
        </CardHeader>
        <CardContent>
          {certifications.length === 0 ? (
            <div className="text-center py-12">
              <Award className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
              <h3 className="font-semibold mb-2">No certifications yet</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Start building your professional credentials portfolio
              </p>
              <Button onClick={() => handleOpenDialog()} size="sm">
                <Plus className="mr-2 h-3.5 w-3.5" />
                Add Your First Certification
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {certifications
                .sort((a, b) => {
                  const statusA = getCertificationStatus(a).status
                  const statusB = getCertificationStatus(b).status
                  if (statusA === 'expiring_soon' && statusB !== 'expiring_soon') return -1
                  if (statusA !== 'expiring_soon' && statusB === 'expiring_soon') return 1
                  return new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime()
                })
                .map((cert) => {
                  const statusInfo = getCertificationStatus(cert)
                  const StatusIcon = statusInfo.icon

                  return (
                    <Card key={cert._id}>
                      <CardContent className="pt-6">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <StatusIcon className={`h-4 w-4 ${
                                  statusInfo.status === 'active' ? 'text-green-600' :
                                  statusInfo.status === 'expiring_soon' ? 'text-yellow-600' :
                                  'text-destructive'
                                }`} />
                                <h3 className="font-semibold">{cert.name}</h3>
                                <Badge variant={statusInfo.variant} className="capitalize">
                                  {statusInfo.status.replace('_', ' ')}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {cert.issuingOrganization}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenDialog(cert)}
                                className="h-8 w-8"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteCert(cert)}
                                className="h-8 w-8 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2 text-sm">
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Issued</p>
                              <div className="flex items-center gap-2">
                                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>{new Date(cert.issueDate).toLocaleDateString()}</span>
                              </div>
                            </div>

                            {cert.expirationDate && (
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Expires</p>
                                <div className="flex items-center gap-2">
                                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span>{new Date(cert.expirationDate).toLocaleDateString()}</span>
                                </div>
                              </div>
                            )}

                            {cert.credentialId && (
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Credential ID</p>
                                <span className="text-xs font-mono">{cert.credentialId}</span>
                              </div>
                            )}

                            {cert.credentialUrl && (
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Verification</p>
                                <a 
                                  href={cert.credentialUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                                >
                                  View Credential <ExternalLink className="h-3 w-3" />
                                </a>
                              </div>
                            )}
                          </div>

                          {cert.description && (
                            <div className="text-sm text-muted-foreground pt-2 border-t">
                              {cert.description}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditMode ? 'Edit Certification' : 'Add New Certification'}
            </DialogTitle>
            <DialogDescription>
              {isEditMode ? 'Update certification details' : 'Add a new professional certification to your profile'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Certification Name *</Label>
              <Input
                id="name"
                value={certForm.name}
                onChange={(e) => setCertForm({ ...certForm, name: e.target.value })}
                placeholder="e.g., AWS Certified Solutions Architect"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="organization">Issuing Organization *</Label>
              <Input
                id="organization"
                value={certForm.issuingOrganization}
                onChange={(e) => setCertForm({ ...certForm, issuingOrganization: e.target.value })}
                placeholder="e.g., Amazon Web Services"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="issueDate">Issue Date *</Label>
                <Input
                  id="issueDate"
                  type="date"
                  value={certForm.issueDate}
                  onChange={(e) => setCertForm({ ...certForm, issueDate: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="expirationDate">Expiration Date</Label>
                <Input
                  id="expirationDate"
                  type="date"
                  value={certForm.expirationDate}
                  onChange={(e) => setCertForm({ ...certForm, expirationDate: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="credentialId">Credential ID</Label>
              <Input
                id="credentialId"
                value={certForm.credentialId}
                onChange={(e) => setCertForm({ ...certForm, credentialId: e.target.value })}
                placeholder="Optional verification ID"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="credentialUrl">Credential URL</Label>
              <Input
                id="credentialUrl"
                type="url"
                value={certForm.credentialUrl}
                onChange={(e) => setCertForm({ ...certForm, credentialUrl: e.target.value })}
                placeholder="https://verify.example.com/credential"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={certForm.description}
                onChange={(e) => setCertForm({ ...certForm, description: e.target.value })}
                placeholder="Additional details about this certification"
                className="min-h-[80px] resize-none"
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">{certForm.description.length}/500 characters</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {isEditMode ? 'Update' : 'Add'} Certification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}