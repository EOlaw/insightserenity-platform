'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@/components/ui/tabs'
import {
    User,
    Mail,
    Phone,
    MapPin,
    Globe,
    Linkedin,
    Github,
    Twitter,
    Save,
    ArrowLeft,
    Loader2,
    Camera,
    Briefcase,
    CheckCircle2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { consultantApi, type ConsultantProfile } from '@/lib/api/consultant'

export default function ConsultantProfilePage() {
    const router = useRouter()
    const [consultant, setConsultant] = useState<ConsultantProfile | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [activeTab, setActiveTab] = useState('personal')

    const [personalForm, setPersonalForm] = useState({
        firstName: '',
        lastName: '',
        middleName: '',
        preferredName: '',
        title: '',
        bio: '',
        summary: '',
    })

    const [contactForm, setContactForm] = useState({
        primaryEmail: '',
        mobile: '',
        work: '',
        linkedin: '',
        github: '',
        twitter: '',
        website: '',
    })

    const [professionalForm, setProfessionalForm] = useState({
        employmentType: 'full_time',
        level: 'mid',
        grade: '',
        department: '',
        yearsOfExperience: 0,
    })

    const [addressForm, setAddressForm] = useState({
        street1: '',
        street2: '',
        city: '',
        state: '',
        postalCode: '',
        country: '',
    })

    useEffect(() => {
        loadProfile()
    }, [])

    const loadProfile = async () => {
        setIsLoading(true)

        try {
            const response = await consultantApi.getMyProfile()

            // Handle both wrapped and unwrapped responses
            const data = response?.data || response

            setConsultant(data)

            setPersonalForm({
                firstName: data.profile?.firstName || '',
                lastName: data.profile?.lastName || '',
                middleName: data.profile?.middleName || '',
                preferredName: data.profile?.preferredName || '',
                title: data.profile?.title || '',
                bio: data.profile?.bio || '',
                summary: data.profile?.summary || '',
            })

            setContactForm({
                primaryEmail: data.contact?.email?.primary || '',
                mobile: data.contact?.phone?.mobile || '',
                work: data.contact?.phone?.work || '',
                linkedin: data.contact?.social?.linkedin || '',
                github: data.contact?.social?.github || '',
                twitter: data.contact?.social?.twitter || '',
                website: data.contact?.social?.website || '',
            })

            setProfessionalForm({
                employmentType: data.professional?.employmentType || 'full_time',
                level: data.professional?.level || 'mid',
                grade: data.professional?.grade || '',
                department: data.professional?.department || '',
                yearsOfExperience: data.professional?.yearsOfExperience || 0,
            })

            setAddressForm({
                street1: data.contact?.address?.current?.street1 || '',
                street2: data.contact?.address?.current?.street2 || '',
                city: data.contact?.address?.current?.city || '',
                state: data.contact?.address?.current?.state || '',
                postalCode: data.contact?.address?.current?.postalCode || '',
                country: data.contact?.address?.current?.country || '',
            })
        } catch (error: any) {
            console.error('Failed to load profile:', error)
            toast.error('Failed to load profile')

            if (error.response?.status === 401) {
                router.push('/login')
            }
        } finally {
            setIsLoading(false)
        }
    }

    const handleSaveProfile = async () => {
        setIsSaving(true)

        try {
            const updates: Partial<ConsultantProfile> = {
                profile: {
                    ...consultant?.profile,
                    firstName: personalForm.firstName,
                    lastName: personalForm.lastName,
                    middleName: personalForm.middleName || undefined,
                    preferredName: personalForm.preferredName || undefined,
                    title: personalForm.title || undefined,
                    bio: personalForm.bio || undefined,
                    summary: personalForm.summary || undefined,
                },
                contact: {
                    email: {
                        primary: contactForm.primaryEmail,
                    },
                    phone: {
                        mobile: contactForm.mobile || undefined,
                        work: contactForm.work || undefined,
                    },
                    social: {
                        linkedin: contactForm.linkedin || undefined,
                        github: contactForm.github || undefined,
                        twitter: contactForm.twitter || undefined,
                        website: contactForm.website || undefined,
                    },
                    address: {
                        current: {
                            street1: addressForm.street1 || undefined,
                            street2: addressForm.street2 || undefined,
                            city: addressForm.city || undefined,
                            state: addressForm.state || undefined,
                            postalCode: addressForm.postalCode || undefined,
                            country: addressForm.country || undefined,
                            type: 'current',
                        },
                    },
                },
                professional: {
                    ...consultant?.professional,
                    employmentType: professionalForm.employmentType as any,
                    level: professionalForm.level as any,
                    grade: professionalForm.grade || undefined,
                    department: professionalForm.department || undefined,
                    yearsOfExperience: professionalForm.yearsOfExperience,
                },
            }

            await consultantApi.updateMyProfile(updates)
            toast.success('Profile updated successfully')

            await loadProfile()
        } catch (error: any) {
            console.error('Failed to update profile:', error)
            toast.error(error.response?.data?.message || 'Failed to update profile')
        } finally {
            setIsSaving(false)
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
                <div className="text-center space-y-3">
                    <div className="relative">
                        <div className="w-12 h-12 mx-auto rounded-full bg-gradient-to-r from-[#ffc451] to-[#ffb020] animate-pulse" />
                        <Loader2 className="h-6 w-6 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white animate-spin" />
                    </div>
                    <p className="text-xs font-medium text-gray-600">Loading profile...</p>
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
                            <h1 className="text-lg font-bold text-gray-900">Manage Profile</h1>
                            <p className="text-xs text-gray-500">
                                Update your professional information and preferences
                            </p>
                        </div>
                    </div>
                    <Button
                        onClick={handleSaveProfile}
                        disabled={isSaving}
                        size="sm"
                        className="bg-gradient-to-r from-[#ffc451] to-[#ffb020] hover:from-[#ffb020] hover:to-[#ffc451] text-black font-medium text-xs h-8"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="mr-1.5 h-3 w-3" />
                                Save Changes
                            </>
                        )}
                    </Button>
                </div>

                {/* Compact Profile Header */}
                <div className="bg-white rounded-lg shadow-sm p-4">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className="h-14 w-14 rounded-full bg-gradient-to-br from-[#ffc451] to-[#ffb020] flex items-center justify-center shadow-sm">
                                <span className="text-base font-bold text-black">
                                    {consultant?.profile?.firstName?.[0]}{consultant?.profile?.lastName?.[0]}
                                </span>
                            </div>
                            <Button
                                size="sm"
                                variant="outline"
                                className="absolute -bottom-1 -right-1 h-6 w-6 p-0 rounded-full border-2 border-white shadow-sm"
                            >
                                <Camera className="h-3 w-3" />
                            </Button>
                        </div>
                        <div className="flex-1">
                            <h2 className="text-sm font-bold text-gray-900">
                                {consultant?.profile?.firstName} {consultant?.profile?.lastName}
                            </h2>
                            <p className="text-xs text-gray-600 capitalize">
                                {consultant?.professional?.level} Consultant
                            </p>
                            <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                                {consultant?.consultantCode}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Compact Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                    <TabsList className="grid w-full grid-cols-4 h-9">
                        <TabsTrigger value="personal" className="text-xs">Personal</TabsTrigger>
                        <TabsTrigger value="contact" className="text-xs">Contact</TabsTrigger>
                        <TabsTrigger value="professional" className="text-xs">Professional</TabsTrigger>
                        <TabsTrigger value="address" className="text-xs">Address</TabsTrigger>
                    </TabsList>

                    <TabsContent value="personal" className="space-y-3">
                        <Card className="border-[#ffc451]/20">
                            <CardHeader className="p-3 pb-2">
                                <CardTitle className="text-xs font-bold text-gray-900">Personal Information</CardTitle>
                                <CardDescription className="text-[10px]">Update your personal details and bio</CardDescription>
                            </CardHeader>
                            <CardContent className="p-3 pt-0 space-y-3">
                                <div className="grid gap-3 md:grid-cols-2">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="firstName" className="text-xs font-medium">First Name *</Label>
                                        <Input
                                            id="firstName"
                                            value={personalForm.firstName}
                                            onChange={(e) => setPersonalForm({ ...personalForm, firstName: e.target.value })}
                                            required
                                            className="h-8 text-xs"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="lastName" className="text-xs font-medium">Last Name *</Label>
                                        <Input
                                            id="lastName"
                                            value={personalForm.lastName}
                                            onChange={(e) => setPersonalForm({ ...personalForm, lastName: e.target.value })}
                                            required
                                            className="h-8 text-xs"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="middleName" className="text-xs font-medium">Middle Name</Label>
                                        <Input
                                            id="middleName"
                                            value={personalForm.middleName}
                                            onChange={(e) => setPersonalForm({ ...personalForm, middleName: e.target.value })}
                                            className="h-8 text-xs"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="preferredName" className="text-xs font-medium">Preferred Name</Label>
                                        <Input
                                            id="preferredName"
                                            value={personalForm.preferredName}
                                            onChange={(e) => setPersonalForm({ ...personalForm, preferredName: e.target.value })}
                                            placeholder="How you'd like to be addressed"
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="title" className="text-xs font-medium">Professional Title</Label>
                                    <Input
                                        id="title"
                                        value={personalForm.title}
                                        onChange={(e) => setPersonalForm({ ...personalForm, title: e.target.value })}
                                        placeholder="e.g., Senior Management Consultant"
                                        className="h-8 text-xs"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="summary" className="text-xs font-medium">Professional Summary</Label>
                                    <Textarea
                                        id="summary"
                                        value={personalForm.summary}
                                        onChange={(e) => setPersonalForm({ ...personalForm, summary: e.target.value })}
                                        placeholder="A brief professional summary (max 1000 characters)"
                                        className="min-h-[60px] resize-none text-xs"
                                        maxLength={1000}
                                    />
                                    <p className="text-[10px] text-gray-400">{personalForm.summary.length}/1000 characters</p>
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="bio" className="text-xs font-medium">Full Bio</Label>
                                    <Textarea
                                        id="bio"
                                        value={personalForm.bio}
                                        onChange={(e) => setPersonalForm({ ...personalForm, bio: e.target.value })}
                                        placeholder="Tell us about yourself, your experience, and what you bring to the table (max 5000 characters)"
                                        className="min-h-[80px] resize-none text-xs"
                                        maxLength={5000}
                                    />
                                    <p className="text-[10px] text-gray-400">{personalForm.bio.length}/5000 characters</p>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="contact" className="space-y-3">
                        <Card className="border-[#ffc451]/20">
                            <CardHeader className="p-3 pb-2">
                                <CardTitle className="text-xs font-bold text-gray-900">Contact Information</CardTitle>
                                <CardDescription className="text-[10px]">Manage your email, phone, and social media links</CardDescription>
                            </CardHeader>
                            <CardContent className="p-3 pt-0 space-y-4">
                                <div className="space-y-3">
                                    <h3 className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                                        <Mail className="h-3 w-3 text-[#ffc451]" />
                                        Email & Phone
                                    </h3>
                                    <div className="grid gap-3 md:grid-cols-2">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="primaryEmail" className="text-xs font-medium">Primary Email *</Label>
                                            <Input
                                                id="primaryEmail"
                                                type="email"
                                                value={contactForm.primaryEmail}
                                                onChange={(e) => setContactForm({ ...contactForm, primaryEmail: e.target.value })}
                                                required
                                                className="h-8 text-xs"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label htmlFor="mobile" className="text-xs font-medium">Mobile Phone</Label>
                                            <Input
                                                id="mobile"
                                                type="tel"
                                                value={contactForm.mobile}
                                                onChange={(e) => setContactForm({ ...contactForm, mobile: e.target.value })}
                                                placeholder="+1 (555) 000-0000"
                                                className="h-8 text-xs"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label htmlFor="work" className="text-xs font-medium">Work Phone</Label>
                                            <Input
                                                id="work"
                                                type="tel"
                                                value={contactForm.work}
                                                onChange={(e) => setContactForm({ ...contactForm, work: e.target.value })}
                                                placeholder="+1 (555) 000-0000"
                                                className="h-8 text-xs"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <Separator />

                                <div className="space-y-3">
                                    <h3 className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                                        <Globe className="h-3 w-3 text-[#ffc451]" />
                                        Social Media & Web
                                    </h3>
                                    <div className="space-y-3">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="linkedin" className="text-xs font-medium flex items-center gap-1.5">
                                                <Linkedin className="h-3 w-3 text-blue-600" />
                                                LinkedIn Profile
                                            </Label>
                                            <Input
                                                id="linkedin"
                                                value={contactForm.linkedin}
                                                onChange={(e) => setContactForm({ ...contactForm, linkedin: e.target.value })}
                                                placeholder="https://linkedin.com/in/yourprofile"
                                                className="h-8 text-xs"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label htmlFor="github" className="text-xs font-medium flex items-center gap-1.5">
                                                <Github className="h-3 w-3" />
                                                GitHub Profile
                                            </Label>
                                            <Input
                                                id="github"
                                                value={contactForm.github}
                                                onChange={(e) => setContactForm({ ...contactForm, github: e.target.value })}
                                                placeholder="https://github.com/yourusername"
                                                className="h-8 text-xs"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label htmlFor="twitter" className="text-xs font-medium flex items-center gap-1.5">
                                                <Twitter className="h-3 w-3 text-blue-400" />
                                                Twitter/X Profile
                                            </Label>
                                            <Input
                                                id="twitter"
                                                value={contactForm.twitter}
                                                onChange={(e) => setContactForm({ ...contactForm, twitter: e.target.value })}
                                                placeholder="https://twitter.com/yourusername"
                                                className="h-8 text-xs"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label htmlFor="website" className="text-xs font-medium flex items-center gap-1.5">
                                                <Globe className="h-3 w-3 text-[#ffc451]" />
                                                Personal Website
                                            </Label>
                                            <Input
                                                id="website"
                                                value={contactForm.website}
                                                onChange={(e) => setContactForm({ ...contactForm, website: e.target.value })}
                                                placeholder="https://yourwebsite.com"
                                                className="h-8 text-xs"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="professional" className="space-y-3">
                        <Card className="border-[#ffc451]/20">
                            <CardHeader className="p-3 pb-2">
                                <CardTitle className="text-xs font-bold text-gray-900">Professional Details</CardTitle>
                                <CardDescription className="text-[10px]">Update your employment and career information</CardDescription>
                            </CardHeader>
                            <CardContent className="p-3 pt-0 space-y-3">
                                <div className="grid gap-3 md:grid-cols-2">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="employmentType" className="text-xs font-medium">Employment Type *</Label>
                                        <Select
                                            value={professionalForm.employmentType}
                                            onValueChange={(value) => setProfessionalForm({ ...professionalForm, employmentType: value })}
                                        >
                                            <SelectTrigger className="h-8 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="full_time" className="text-xs">Full Time</SelectItem>
                                                <SelectItem value="part_time" className="text-xs">Part Time</SelectItem>
                                                <SelectItem value="contract" className="text-xs">Contract</SelectItem>
                                                <SelectItem value="freelance" className="text-xs">Freelance</SelectItem>
                                                <SelectItem value="temporary" className="text-xs">Temporary</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="level" className="text-xs font-medium">Experience Level *</Label>
                                        <Select
                                            value={professionalForm.level}
                                            onValueChange={(value) => setProfessionalForm({ ...professionalForm, level: value })}
                                        >
                                            <SelectTrigger className="h-8 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="junior" className="text-xs">Junior</SelectItem>
                                                <SelectItem value="mid" className="text-xs">Mid-Level</SelectItem>
                                                <SelectItem value="senior" className="text-xs">Senior</SelectItem>
                                                <SelectItem value="lead" className="text-xs">Lead</SelectItem>
                                                <SelectItem value="principal" className="text-xs">Principal</SelectItem>
                                                <SelectItem value="director" className="text-xs">Director</SelectItem>
                                                <SelectItem value="vp" className="text-xs">VP</SelectItem>
                                                <SelectItem value="executive" className="text-xs">Executive</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="department" className="text-xs font-medium">Department</Label>
                                        <Input
                                            id="department"
                                            value={professionalForm.department}
                                            onChange={(e) => setProfessionalForm({ ...professionalForm, department: e.target.value })}
                                            placeholder="e.g., Technology Consulting"
                                            className="h-8 text-xs"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="grade" className="text-xs font-medium">Grade/Band</Label>
                                        <Input
                                            id="grade"
                                            value={professionalForm.grade}
                                            onChange={(e) => setProfessionalForm({ ...professionalForm, grade: e.target.value })}
                                            placeholder="e.g., C3"
                                            className="h-8 text-xs"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="yearsOfExperience" className="text-xs font-medium">Years of Experience</Label>
                                        <Input
                                            id="yearsOfExperience"
                                            type="number"
                                            min="0"
                                            max="50"
                                            value={professionalForm.yearsOfExperience}
                                            onChange={(e) => setProfessionalForm({ ...professionalForm, yearsOfExperience: parseInt(e.target.value) || 0 })}
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="address" className="space-y-3">
                        <Card className="border-[#ffc451]/20">
                            <CardHeader className="p-3 pb-2">
                                <CardTitle className="text-xs font-bold text-gray-900">Current Address</CardTitle>
                                <CardDescription className="text-[10px]">Update your current residence address</CardDescription>
                            </CardHeader>
                            <CardContent className="p-3 pt-0 space-y-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="street1" className="text-xs font-medium">Street Address</Label>
                                    <Input
                                        id="street1"
                                        value={addressForm.street1}
                                        onChange={(e) => setAddressForm({ ...addressForm, street1: e.target.value })}
                                        placeholder="123 Main Street"
                                        className="h-8 text-xs"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="street2" className="text-xs font-medium">Apartment, Suite, etc. (Optional)</Label>
                                    <Input
                                        id="street2"
                                        value={addressForm.street2}
                                        onChange={(e) => setAddressForm({ ...addressForm, street2: e.target.value })}
                                        placeholder="Apt 4B"
                                        className="h-8 text-xs"
                                    />
                                </div>

                                <div className="grid gap-3 md:grid-cols-3">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="city" className="text-xs font-medium">City</Label>
                                        <Input
                                            id="city"
                                            value={addressForm.city}
                                            onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                                            className="h-8 text-xs"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="state" className="text-xs font-medium">State/Province</Label>
                                        <Input
                                            id="state"
                                            value={addressForm.state}
                                            onChange={(e) => setAddressForm({ ...addressForm, state: e.target.value })}
                                            className="h-8 text-xs"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="postalCode" className="text-xs font-medium">Postal Code</Label>
                                        <Input
                                            id="postalCode"
                                            value={addressForm.postalCode}
                                            onChange={(e) => setAddressForm({ ...addressForm, postalCode: e.target.value })}
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="country" className="text-xs font-medium">Country</Label>
                                    <Input
                                        id="country"
                                        value={addressForm.country}
                                        onChange={(e) => setAddressForm({ ...addressForm, country: e.target.value })}
                                        placeholder="United States"
                                        className="h-8 text-xs"
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>

                {/* Compact Footer Action */}
                <div className="flex items-center justify-between pt-2">
                    <p className="text-[10px] text-gray-500 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        All changes are auto-saved
                    </p>
                    <Button
                        onClick={handleSaveProfile}
                        disabled={isSaving}
                        className="bg-gradient-to-r from-[#ffc451] to-[#ffb020] hover:from-[#ffb020] hover:to-[#ffc451] text-black font-medium text-xs h-8"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="mr-1.5 h-3 w-3" />
                                Save All Changes
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    )
}