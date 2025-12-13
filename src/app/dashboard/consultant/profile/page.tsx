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
      const data = await consultantApi.getMyProfile()
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
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Loading profile...</p>
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
            <h1 className="text-2xl font-bold">Manage Profile</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Update your professional information and preferences
            </p>
          </div>
        </div>
        <Button onClick={handleSaveProfile} disabled={isSaving} size="sm">
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-3.5 w-3.5" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-xl font-semibold text-primary">
                {consultant?.profile?.firstName?.[0]}{consultant?.profile?.lastName?.[0]}
              </div>
              <Button
                size="icon"
                variant="outline"
                className="absolute bottom-0 right-0 h-6 w-6 rounded-full"
              >
                <Camera className="h-3 w-3" />
              </Button>
            </div>
            <div>
              <h2 className="text-lg font-semibold">
                {consultant?.profile?.firstName} {consultant?.profile?.lastName}
              </h2>
              <p className="text-sm text-muted-foreground capitalize">
                {consultant?.professional?.level} Consultant
              </p>
              <p className="text-xs text-muted-foreground">
                Code: {consultant?.consultantCode}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="contact">Contact</TabsTrigger>
          <TabsTrigger value="professional">Professional</TabsTrigger>
          <TabsTrigger value="address">Address</TabsTrigger>
        </TabsList>

        <TabsContent value="personal" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Personal Information</CardTitle>
              <CardDescription>Update your personal details and bio</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    value={personalForm.firstName}
                    onChange={(e) => setPersonalForm({ ...personalForm, firstName: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    value={personalForm.lastName}
                    onChange={(e) => setPersonalForm({ ...personalForm, lastName: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="middleName">Middle Name</Label>
                  <Input
                    id="middleName"
                    value={personalForm.middleName}
                    onChange={(e) => setPersonalForm({ ...personalForm, middleName: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="preferredName">Preferred Name</Label>
                  <Input
                    id="preferredName"
                    value={personalForm.preferredName}
                    onChange={(e) => setPersonalForm({ ...personalForm, preferredName: e.target.value })}
                    placeholder="How you'd like to be addressed"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Professional Title</Label>
                <Input
                  id="title"
                  value={personalForm.title}
                  onChange={(e) => setPersonalForm({ ...personalForm, title: e.target.value })}
                  placeholder="e.g., Senior Management Consultant"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="summary">Professional Summary</Label>
                <Textarea
                  id="summary"
                  value={personalForm.summary}
                  onChange={(e) => setPersonalForm({ ...personalForm, summary: e.target.value })}
                  placeholder="A brief professional summary (max 1000 characters)"
                  className="min-h-[80px] resize-none"
                  maxLength={1000}
                />
                <p className="text-xs text-muted-foreground">{personalForm.summary.length}/1000 characters</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">Full Bio</Label>
                <Textarea
                  id="bio"
                  value={personalForm.bio}
                  onChange={(e) => setPersonalForm({ ...personalForm, bio: e.target.value })}
                  placeholder="Tell us about yourself, your experience, and what you bring to the table (max 5000 characters)"
                  className="min-h-[120px] resize-none"
                  maxLength={5000}
                />
                <p className="text-xs text-muted-foreground">{personalForm.bio.length}/5000 characters</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contact" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contact Information</CardTitle>
              <CardDescription>Manage your email, phone, and social media links</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-sm font-medium">Email & Phone</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="primaryEmail">Primary Email *</Label>
                    <Input
                      id="primaryEmail"
                      type="email"
                      value={contactForm.primaryEmail}
                      onChange={(e) => setContactForm({ ...contactForm, primaryEmail: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mobile">Mobile Phone</Label>
                    <Input
                      id="mobile"
                      type="tel"
                      value={contactForm.mobile}
                      onChange={(e) => setContactForm({ ...contactForm, mobile: e.target.value })}
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="work">Work Phone</Label>
                    <Input
                      id="work"
                      type="tel"
                      value={contactForm.work}
                      onChange={(e) => setContactForm({ ...contactForm, work: e.target.value })}
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-sm font-medium">Social Media & Web</h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="linkedin" className="flex items-center gap-2">
                      <Linkedin className="h-3.5 w-3.5" />
                      LinkedIn Profile
                    </Label>
                    <Input
                      id="linkedin"
                      value={contactForm.linkedin}
                      onChange={(e) => setContactForm({ ...contactForm, linkedin: e.target.value })}
                      placeholder="https://linkedin.com/in/yourprofile"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="github" className="flex items-center gap-2">
                      <Github className="h-3.5 w-3.5" />
                      GitHub Profile
                    </Label>
                    <Input
                      id="github"
                      value={contactForm.github}
                      onChange={(e) => setContactForm({ ...contactForm, github: e.target.value })}
                      placeholder="https://github.com/yourusername"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="twitter" className="flex items-center gap-2">
                      <Twitter className="h-3.5 w-3.5" />
                      Twitter/X Profile
                    </Label>
                    <Input
                      id="twitter"
                      value={contactForm.twitter}
                      onChange={(e) => setContactForm({ ...contactForm, twitter: e.target.value })}
                      placeholder="https://twitter.com/yourusername"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="website" className="flex items-center gap-2">
                      <Globe className="h-3.5 w-3.5" />
                      Personal Website
                    </Label>
                    <Input
                      id="website"
                      value={contactForm.website}
                      onChange={(e) => setContactForm({ ...contactForm, website: e.target.value })}
                      placeholder="https://yourwebsite.com"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="professional" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Professional Details</CardTitle>
              <CardDescription>Update your employment and career information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="employmentType">Employment Type *</Label>
                  <Select
                    value={professionalForm.employmentType}
                    onValueChange={(value) => setProfessionalForm({ ...professionalForm, employmentType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full_time">Full Time</SelectItem>
                      <SelectItem value="part_time">Part Time</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="freelance">Freelance</SelectItem>
                      <SelectItem value="temporary">Temporary</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="level">Experience Level *</Label>
                  <Select
                    value={professionalForm.level}
                    onValueChange={(value) => setProfessionalForm({ ...professionalForm, level: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="junior">Junior</SelectItem>
                      <SelectItem value="mid">Mid-Level</SelectItem>
                      <SelectItem value="senior">Senior</SelectItem>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="principal">Principal</SelectItem>
                      <SelectItem value="director">Director</SelectItem>
                      <SelectItem value="vp">VP</SelectItem>
                      <SelectItem value="executive">Executive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="department">Department</Label>
                  <Input
                    id="department"
                    value={professionalForm.department}
                    onChange={(e) => setProfessionalForm({ ...professionalForm, department: e.target.value })}
                    placeholder="e.g., Technology Consulting"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="grade">Grade/Band</Label>
                  <Input
                    id="grade"
                    value={professionalForm.grade}
                    onChange={(e) => setProfessionalForm({ ...professionalForm, grade: e.target.value })}
                    placeholder="e.g., C3"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="yearsOfExperience">Years of Experience</Label>
                  <Input
                    id="yearsOfExperience"
                    type="number"
                    min="0"
                    max="50"
                    value={professionalForm.yearsOfExperience}
                    onChange={(e) => setProfessionalForm({ ...professionalForm, yearsOfExperience: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="address" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Current Address</CardTitle>
              <CardDescription>Update your current residence address</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="street1">Street Address</Label>
                <Input
                  id="street1"
                  value={addressForm.street1}
                  onChange={(e) => setAddressForm({ ...addressForm, street1: e.target.value })}
                  placeholder="123 Main Street"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="street2">Apartment, Suite, etc. (Optional)</Label>
                <Input
                  id="street2"
                  value={addressForm.street2}
                  onChange={(e) => setAddressForm({ ...addressForm, street2: e.target.value })}
                  placeholder="Apt 4B"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={addressForm.city}
                    onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="state">State/Province</Label>
                  <Input
                    id="state"
                    value={addressForm.state}
                    onChange={(e) => setAddressForm({ ...addressForm, state: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="postalCode">Postal Code</Label>
                  <Input
                    id="postalCode"
                    value={addressForm.postalCode}
                    onChange={(e) => setAddressForm({ ...addressForm, postalCode: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={addressForm.country}
                  onChange={(e) => setAddressForm({ ...addressForm, country: e.target.value })}
                  placeholder="United States"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button onClick={handleSaveProfile} disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save All Changes
            </>
          )}
        </Button>
      </div>
    </div>
  )
}