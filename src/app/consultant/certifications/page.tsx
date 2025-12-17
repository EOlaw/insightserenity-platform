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
            const profileData = await consultantApi.getMyProfile()
            setConsultant(profileData)
            setCertifications(profileData.data.certifications || [])
            
            console.log('Loaded certifications:', profileData.certifications?.length || 0)
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

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
                <div className="text-center space-y-3">
                    <div className="relative">
                        <div className="w-12 h-12 mx-auto rounded-full bg-gradient-to-r from-[#ffc451] to-[#ffb020] animate-pulse" />
                        <Loader2 className="h-6 w-6 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white animate-spin" />
                    </div>
                    <p className="text-xs font-medium text-gray-600">Loading certifications...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
            <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
                {/* Compact Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link href="/consultant/dashboard">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <ArrowLeft className="h-3.5 w-3.5" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-lg font-bold text-gray-900">Certifications</h1>
                            <p className="text-xs text-gray-500">
                                Manage your professional certifications and credentials
                            </p>
                        </div>
                    </div>
                    <Button 
                        onClick={() => handleOpenDialog()} 
                        size="sm"
                        className="bg-gradient-to-r from-[#ffc451] to-[#ffb020] hover:from-[#ffb020] hover:to-[#ffc451] text-black font-medium text-xs h-8"
                    >
                        <Plus className="mr-1.5 h-3 w-3" />
                        Add Certification
                    </Button>
                </div>

                {/* Compact Stats Grid */}
                <div className="grid gap-3 md:grid-cols-3">
                    <Card className="border-emerald-500/20">
                        <CardContent className="p-3">
                            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Active Certifications</p>
                            <div className="text-xl font-bold text-gray-900">{activeCerts.length}</div>
                            <p className="text-[10px] text-gray-400 mt-0.5">Currently valid</p>
                        </CardContent>
                    </Card>

                    <Card className="border-yellow-500/20">
                        <CardContent className="p-3">
                            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Expiring Soon</p>
                            <div className="text-xl font-bold text-gray-900">{expiringSoonCerts.length}</div>
                            <p className="text-[10px] text-gray-400 mt-0.5">Within 30 days</p>
                        </CardContent>
                    </Card>

                    <Card className="border-[#ffc451]/20">
                        <CardContent className="p-3">
                            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Total Certifications</p>
                            <div className="text-xl font-bold text-gray-900">{certifications.length}</div>
                            <p className="text-[10px] text-gray-400 mt-0.5">All credentials</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Expiring Soon Alert */}
                {expiringSoonCerts.length > 0 && (
                    <Card className="border-yellow-500/50 bg-yellow-50/50">
                        <CardHeader className="p-3 pb-2">
                            <div className="flex items-center gap-1.5">
                                <AlertCircle className="h-3.5 w-3.5 text-yellow-600" />
                                <CardTitle className="text-xs font-bold text-gray-900">Expiring Soon</CardTitle>
                            </div>
                            <CardDescription className="text-[10px]">
                                The following certifications will expire within 30 days
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                            <div className="space-y-2">
                                {expiringSoonCerts.map((cert) => {
                                    const expirationDate = new Date(cert.expirationDate!)
                                    const daysUntilExpiration = Math.ceil((expirationDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))

                                    return (
                                        <div key={cert._id} className="rounded-lg border border-yellow-500/30 bg-white p-2.5">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="text-xs font-medium text-gray-900 truncate">{cert.name}</h4>
                                                    <p className="text-[10px] text-gray-500 truncate">{cert.issuingOrganization}</p>
                                                    <p className="text-[10px] text-yellow-600 mt-1">
                                                        Expires in {daysUntilExpiration} days ({expirationDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})
                                                    </p>
                                                </div>
                                                <Button variant="outline" size="sm" className="h-7 text-[10px] whitespace-nowrap ml-2">
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

                {/* All Certifications */}
                <Card className="border-[#ffc451]/20">
                    <CardHeader className="p-3 pb-2">
                        <CardTitle className="text-xs font-bold text-gray-900">All Certifications</CardTitle>
                        <CardDescription className="text-[10px]">
                            Your complete professional credentials portfolio
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                        {certifications.length === 0 ? (
                            <div className="text-center py-10">
                                <Award className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                                <h3 className="text-xs font-semibold text-gray-700 mb-1">No certifications yet</h3>
                                <p className="text-xs text-gray-500 mb-4">
                                    Start building your professional credentials portfolio
                                </p>
                                <Button 
                                    onClick={() => handleOpenDialog()} 
                                    size="sm"
                                    className="bg-gradient-to-r from-[#ffc451] to-[#ffb020] hover:from-[#ffb020] hover:to-[#ffc451] text-black font-medium text-xs h-8"
                                >
                                    <Plus className="mr-1.5 h-3 w-3" />
                                    Add Your First Certification
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-2">
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
                                            <div key={cert._id} className="rounded-lg border border-gray-100 hover:border-[#ffc451]/30 p-3 space-y-2 bg-white hover:shadow-sm transition-all">
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5 mb-1">
                                                            <StatusIcon className={`h-3 w-3 ${statusInfo.status === 'active' ? 'text-emerald-600' :
                                                                    statusInfo.status === 'expiring_soon' ? 'text-yellow-600' :
                                                                        'text-red-600'
                                                                }`} />
                                                            <h3 className="text-xs font-semibold text-gray-900 truncate">{cert.name}</h3>
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-medium border capitalize ${statusInfo.status === 'active' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' :
                                                                    statusInfo.status === 'expiring_soon' ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30' :
                                                                        'bg-red-500/10 text-red-600 border-red-500/30'
                                                                }`}>
                                                                {statusInfo.status.replace('_', ' ')}
                                                            </span>
                                                        </div>
                                                        <p className="text-[10px] text-gray-500 truncate">
                                                            {cert.issuingOrganization}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-0.5 ml-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleOpenDialog(cert)}
                                                            className="h-7 w-7 p-0"
                                                        >
                                                            <Edit className="h-3 w-3" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleDeleteCert(cert)}
                                                            className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                                        >
                                                            <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                </div>

                                                <div className="grid gap-2 md:grid-cols-2 text-xs">
                                                    <div>
                                                        <p className="text-[10px] text-gray-400 mb-0.5">Issued</p>
                                                        <div className="flex items-center gap-1">
                                                            <Calendar className="h-3 w-3 text-gray-400" />
                                                            <span className="text-[10px] text-gray-700">{new Date(cert.issueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                                        </div>
                                                    </div>

                                                    {cert.expirationDate && (
                                                        <div>
                                                            <p className="text-[10px] text-gray-400 mb-0.5">Expires</p>
                                                            <div className="flex items-center gap-1">
                                                                <Calendar className="h-3 w-3 text-gray-400" />
                                                                <span className="text-[10px] text-gray-700">{new Date(cert.expirationDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {cert.credentialId && (
                                                        <div>
                                                            <p className="text-[10px] text-gray-400 mb-0.5">Credential ID</p>
                                                            <span className="text-[10px] font-mono text-gray-700">{cert.credentialId}</span>
                                                        </div>
                                                    )}

                                                    {cert.credentialUrl && (
                                                        <div>
                                                            <p className="text-[10px] text-gray-400 mb-0.5">Verification</p>
                                                            <a
                                                                href={cert.credentialUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-[10px] text-[#ffc451] hover:text-[#ffb020] inline-flex items-center gap-1"
                                                            >
                                                                View Credential <ExternalLink className="h-2.5 w-2.5" />
                                                            </a>
                                                        </div>
                                                    )}
                                                </div>

                                                {cert.description && (
                                                    <div className="text-[10px] text-gray-500 pt-2 border-t border-gray-100 line-clamp-2">
                                                        {cert.description}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Certification Dialog */}
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="text-base">
                                {isEditMode ? 'Edit Certification' : 'Add New Certification'}
                            </DialogTitle>
                            <DialogDescription className="text-xs">
                                {isEditMode ? 'Update certification details' : 'Add a new professional certification to your profile'}
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-3 py-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="name" className="text-xs font-medium">Certification Name *</Label>
                                <Input
                                    id="name"
                                    value={certForm.name}
                                    onChange={(e) => setCertForm({ ...certForm, name: e.target.value })}
                                    placeholder="e.g., AWS Certified Solutions Architect"
                                    className="h-8 text-xs"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="organization" className="text-xs font-medium">Issuing Organization *</Label>
                                <Input
                                    id="organization"
                                    value={certForm.issuingOrganization}
                                    onChange={(e) => setCertForm({ ...certForm, issuingOrganization: e.target.value })}
                                    placeholder="e.g., Amazon Web Services"
                                    className="h-8 text-xs"
                                />
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label htmlFor="issueDate" className="text-xs font-medium">Issue Date *</Label>
                                    <Input
                                        id="issueDate"
                                        type="date"
                                        value={certForm.issueDate}
                                        onChange={(e) => setCertForm({ ...certForm, issueDate: e.target.value })}
                                        className="h-8 text-xs"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="expirationDate" className="text-xs font-medium">Expiration Date</Label>
                                    <Input
                                        id="expirationDate"
                                        type="date"
                                        value={certForm.expirationDate}
                                        onChange={(e) => setCertForm({ ...certForm, expirationDate: e.target.value })}
                                        className="h-8 text-xs"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="credentialId" className="text-xs font-medium">Credential ID</Label>
                                <Input
                                    id="credentialId"
                                    value={certForm.credentialId}
                                    onChange={(e) => setCertForm({ ...certForm, credentialId: e.target.value })}
                                    placeholder="Optional verification ID"
                                    className="h-8 text-xs"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="credentialUrl" className="text-xs font-medium">Credential URL</Label>
                                <Input
                                    id="credentialUrl"
                                    type="url"
                                    value={certForm.credentialUrl}
                                    onChange={(e) => setCertForm({ ...certForm, credentialUrl: e.target.value })}
                                    placeholder="https://verify.example.com/credential"
                                    className="h-8 text-xs"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="description" className="text-xs font-medium">Description</Label>
                                <Textarea
                                    id="description"
                                    value={certForm.description}
                                    onChange={(e) => setCertForm({ ...certForm, description: e.target.value })}
                                    placeholder="Additional details about this certification"
                                    className="min-h-[60px] resize-none text-xs"
                                    maxLength={500}
                                />
                                <p className="text-[10px] text-gray-400">{certForm.description.length}/500 characters</p>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={handleCloseDialog} size="sm" className="h-8 text-xs">
                                Cancel
                            </Button>
                            <Button 
                                onClick={handleSubmit} 
                                size="sm"
                                className="bg-gradient-to-r from-[#ffc451] to-[#ffb020] hover:from-[#ffb020] hover:to-[#ffc451] text-black font-medium h-8 text-xs"
                            >
                                {isEditMode ? 'Update' : 'Add'} Certification
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    )
}