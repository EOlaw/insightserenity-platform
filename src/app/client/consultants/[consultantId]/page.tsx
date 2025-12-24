/**
 * @fileoverview Consultant Public Profile Page (Client View)
 * @description Displays comprehensive consultant profile information for clients
 *              including skills, certifications, experience, and availability
 * @version 2.0.0
 */

'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { 
  User, 
  Users,
  Briefcase, 
  Award, 
  GraduationCap, 
  Clock, 
  Mail, 
  Phone,
  Calendar,
  CheckCircle,
  XCircle,
  ArrowLeft,
  Building,
  Target,
  TrendingUp,
  Shield,
  Code,
  Globe,
  Star,
  Zap,
  MapPin,
  Loader2
} from 'lucide-react'
import { consultantSearchApi } from '@/lib/api/client'

// Define the consultant profile interface
interface ConsultantProfile {
  _id: string
  consultantCode: string
  profile?: {
    firstName?: string
    lastName?: string
    preferredName?: string
    title?: string
    bio?: string
    avatar?: string
  }
  professional?: {
    level?: string
    specialization?: string
    department?: string
    team?: string
    yearsOfExperience?: number
    employmentType?: string
    startDate?: string
    industryExperience?: Array<{
      industry: string
      years: number
    }>
  }
  contact?: {
    email?: {
      primary?: string
    }
    phone?: {
      work?: string
    }
  }
  skills?: Array<{
    _id?: string
    name: string
    proficiencyLevel: string
    category?: string
    yearsOfExperience?: number
    verified?: boolean
  }>
  certifications?: Array<{
    _id?: string
    name: string
    issuingOrganization: string
    issueDate: string
    expirationDate?: string
    status: string
    credentialUrl?: string
  }>
  education?: Array<{
    _id?: string
    degree: string
    fieldOfStudy: string
    institution: string
    startDate: string
    endDate?: string
    grade?: string
  }>
  workHistory?: Array<{
    _id?: string
    position: string
    company: string
    startDate: string
    endDate?: string
    description?: string
    technologies?: string[]
  }>
}

interface ConsultantPublicProfile extends ConsultantProfile {
  publicBio?: string
  availability?: {
    status: 'available' | 'partially_available' | 'unavailable'
    nextAvailableDate?: string
    currentUtilization?: number
  }
}

export default function ConsultantProfilePage() {
  const params = useParams()
  const router = useRouter()
  const consultantId = params?.consultantId as string

  const [consultant, setConsultant] = useState<ConsultantPublicProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (consultantId) {
      loadConsultantProfile()
    }
  }, [consultantId])

  const loadConsultantProfile = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await consultantSearchApi.getById(consultantId)
      setConsultant(response.data)
    } catch (err: any) {
      console.error('Error loading consultant profile:', err)
      setError(err.message || 'Failed to load consultant profile')
    } finally {
      setLoading(false)
    }
  }

  const getAvailabilityBadge = (status: string) => {
    const badges: Record<string, { bg: string; text: string; icon: any }> = {
      available: { 
        bg: 'bg-emerald-100', 
        text: 'text-emerald-800', 
        icon: CheckCircle 
      },
      partially_available: { 
        bg: 'bg-yellow-100', 
        text: 'text-yellow-800', 
        icon: Clock 
      },
      unavailable: { 
        bg: 'bg-red-100', 
        text: 'text-red-800', 
        icon: XCircle 
      },
    }
    return badges[status] || badges.unavailable
  }

  const getLevelBadge = (level: string) => {
    const badges: Record<string, { bg: string; text: string }> = {
      junior: { bg: 'bg-blue-100', text: 'text-blue-800' },
      mid: { bg: 'bg-purple-100', text: 'text-purple-800' },
      senior: { bg: 'bg-[#ffc451]/10', text: 'text-[#ffc451]' },
      lead: { bg: 'bg-[#ffc451]/10', text: 'text-[#ffc451]' },
      principal: { bg: 'bg-[#ffc451]/20', text: 'text-[#ffb020]' },
      director: { bg: 'bg-[#ffc451]/20', text: 'text-[#ffb020]' },
      vp: { bg: 'bg-[#ffc451]/20', text: 'text-[#ffb020]' },
      executive: { bg: 'bg-[#ffc451]/20', text: 'text-[#ffb020]' },
    }
    return badges[level?.toLowerCase()] || badges.mid
  }

  const getProficiencyColor = (level: string) => {
    const colors: Record<string, string> = {
      beginner: 'bg-gray-300',
      intermediate: 'bg-blue-400',
      advanced: 'bg-purple-500',
      expert: 'bg-[#ffc451]',
      master: 'bg-[#ffb020]',
    }
    return colors[level?.toLowerCase()] || colors.intermediate
  }

  const getProficiencyWidth = (level: string) => {
    const widths: Record<string, string> = {
      beginner: 'w-1/5',
      intermediate: 'w-2/5',
      advanced: 'w-3/5',
      expert: 'w-4/5',
      master: 'w-full',
    }
    return widths[level?.toLowerCase()] || widths.intermediate
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center space-y-3">
          <div className="relative">
            <div className="w-12 h-12 mx-auto rounded-full bg-gradient-to-r from-[#ffc451] to-[#ffb020] animate-pulse" />
            <Loader2 className="h-6 w-6 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white animate-spin" />
          </div>
          <p className="text-xs font-medium text-gray-600">Loading consultant profile...</p>
        </div>
      </div>
    )
  }

  if (error || !consultant) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900 mb-4 text-xs font-medium transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Search
          </button>
          <div className="bg-white rounded-lg border border-red-200 p-6 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-red-50 flex items-center justify-center mb-3">
              <XCircle className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-sm font-bold text-gray-900 mb-1">Profile Not Found</h3>
            <p className="text-xs text-gray-600 mb-4">
              {error || 'The consultant profile you are looking for could not be found.'}
            </p>
            <button
              onClick={() => router.back()}
              className="bg-gradient-to-r from-[#ffc451] to-[#ffb020] hover:from-[#ffb020] hover:to-[#ffc451] text-black font-medium px-4 py-2 rounded-md text-xs transition-all"
            >
              Return to Search
            </button>
          </div>
        </div>
      </div>
    )
  }

  const availabilityBadge = getAvailabilityBadge(consultant.availability?.status || 'unavailable')
  const levelBadge = getLevelBadge(consultant.professional?.level || 'mid')
  const AvailabilityIcon = availabilityBadge.icon

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900 text-xs font-medium transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Search
        </button>

        {/* Header Card */}
        <div className="bg-white rounded-lg shadow-sm border border-[#ffc451]/20 overflow-hidden">
          {/* Profile Header */}
          <div className="bg-gradient-to-r from-[#1A1A1A] to-gray-900 px-6 py-8">
            <div className="flex items-start gap-4">
              {/* Avatar */}
              <div className="flex-shrink-0">
                {consultant.profile?.avatar ? (
                  <img
                    src={consultant.profile.avatar}
                    alt={`${consultant.profile.firstName} ${consultant.profile.lastName}`}
                    className="w-20 h-20 rounded-full border-3 border-[#ffc451] object-cover shadow-lg"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full border-3 border-[#ffc451] bg-gradient-to-br from-[#ffc451] to-[#ffb020] flex items-center justify-center shadow-lg">
                    <User className="w-10 h-10 text-black" />
                  </div>
                )}
              </div>

              {/* Name and Details */}
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-white mb-1">
                  {consultant.profile?.preferredName || consultant.profile?.firstName} {consultant.profile?.lastName}
                </h1>
                {consultant.profile?.title && (
                  <p className="text-sm text-gray-300 mb-2">{consultant.profile.title}</p>
                )}
                
                {/* Status Badges */}
                <div className="flex flex-wrap gap-2 mb-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border ${levelBadge.bg} ${levelBadge.text} border-[#ffc451]/30`}>
                    <Target className="w-3 h-3" />
                    {consultant.professional?.level?.charAt(0).toUpperCase() + consultant.professional?.level?.slice(1)}
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border ${availabilityBadge.bg} ${availabilityBadge.text}`}>
                    <AvailabilityIcon className="w-3 h-3" />
                    {consultant.availability?.status?.replace('_', ' ').charAt(0).toUpperCase() + consultant.availability?.status?.slice(1).replace('_', ' ')}
                  </span>
                  {consultant.professional?.yearsOfExperience && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-white/10 text-white border border-white/20">
                      <TrendingUp className="w-3 h-3" />
                      {consultant.professional.yearsOfExperience}+ Years
                    </span>
                  )}
                  {consultant.professional?.specialization && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-white/10 text-white border border-white/20">
                      <Zap className="w-3 h-3" />
                      {consultant.professional.specialization}
                    </span>
                  )}
                </div>

                {/* Bio */}
                {(consultant.publicBio || consultant.profile?.bio) && (
                  <p className="text-xs text-gray-300 leading-relaxed max-w-3xl">
                    {consultant.publicBio || consultant.profile?.bio}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Contact Bar */}
          <div className="bg-gray-50 border-t border-gray-200 px-6 py-3">
            <div className="flex flex-wrap gap-4 text-xs">
              {consultant.contact?.email?.primary && (
                <div className="flex items-center gap-1.5 text-gray-600">
                  <Mail className="w-3.5 h-3.5 text-[#ffc451]" />
                  <span>{consultant.contact.email.primary}</span>
                </div>
              )}
              {consultant.contact?.phone?.work && (
                <div className="flex items-center gap-1.5 text-gray-600">
                  <Phone className="w-3.5 h-3.5 text-[#ffc451]" />
                  <span>{consultant.contact.phone.work}</span>
                </div>
              )}
              {consultant.professional?.department && (
                <div className="flex items-center gap-1.5 text-gray-600">
                  <Building className="w-3.5 h-3.5 text-[#ffc451]" />
                  <span>{consultant.professional.department}</span>
                </div>
              )}
              {consultant.professional?.team && (
                <div className="flex items-center gap-1.5 text-gray-600">
                  <Users className="w-3.5 h-3.5 text-[#ffc451]" />
                  <span>{consultant.professional.team}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left Column - Main Content */}
          <div className="lg:col-span-2 space-y-4">
            {/* Core Competencies */}
            {consultant.skills && consultant.skills.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-[#ffc451]/20 p-4">
                <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
                  <Code className="w-4 h-4 text-[#ffc451]" />
                  Core Competencies
                </h2>
                <div className="space-y-3">
                  {consultant.skills.slice(0, 12).map((skill, index) => (
                    <div key={skill._id || index}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-gray-900 text-xs">
                            {skill.name}
                          </span>
                          {skill.verified && (
                            <Shield className="w-3 h-3 text-emerald-500" title="Verified" />
                          )}
                        </div>
                        <span className="text-[10px] text-gray-500">
                          {skill.yearsOfExperience && `${skill.yearsOfExperience}+ yrs`}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div 
                          className={`h-1.5 rounded-full ${getProficiencyColor(skill.proficiencyLevel)} ${getProficiencyWidth(skill.proficiencyLevel)}`}
                        ></div>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between text-[10px]">
                        <span className="text-gray-500 capitalize">{skill.proficiencyLevel}</span>
                        {skill.category && <span className="text-gray-400">{skill.category}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Certifications */}
            {consultant.certifications && consultant.certifications.filter(cert => cert.status === 'active').length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-[#ffc451]/20 p-4">
                <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-[#ffc451]" />
                  Professional Certifications
                </h2>
                <div className="space-y-3">
                  {consultant.certifications.filter(cert => cert.status === 'active').map((cert, index) => (
                    <div key={cert._id || index} className="border-l-2 border-[#ffc451] pl-3 py-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 text-xs mb-0.5">
                            {cert.name}
                          </h3>
                          <p className="text-[10px] text-gray-600">
                            {cert.issuingOrganization}
                          </p>
                          <p className="text-[9px] text-gray-500 mt-0.5">
                            Issued: {new Date(cert.issueDate).toLocaleDateString()}
                            {cert.expirationDate && (
                              <> • Expires: {new Date(cert.expirationDate).toLocaleDateString()}</>
                            )}
                          </p>
                          {cert.credentialUrl && (
                            <a
                              href={cert.credentialUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-[#ffc451] hover:text-[#ffb020] mt-1 inline-flex items-center gap-0.5"
                            >
                              View Credential
                              <Globe className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                        <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Education */}
            {consultant.education && consultant.education.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-[#ffc451]/20 p-4">
                <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-[#ffc451]" />
                  Education
                </h2>
                <div className="space-y-3">
                  {consultant.education.map((edu, index) => (
                    <div key={edu._id || index} className="border-l-2 border-gray-300 pl-3 py-1.5">
                      <h3 className="font-semibold text-gray-900 text-xs">
                        {edu.degree} in {edu.fieldOfStudy}
                      </h3>
                      <p className="text-[10px] text-gray-600 mt-0.5">{edu.institution}</p>
                      <p className="text-[9px] text-gray-500 mt-0.5">
                        {new Date(edu.startDate).getFullYear()} - {edu.endDate ? new Date(edu.endDate).getFullYear() : 'Present'}
                        {edu.grade && <> • {edu.grade}</>}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Professional Experience */}
            {consultant.workHistory && consultant.workHistory.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-[#ffc451]/20 p-4">
                <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
                  <Briefcase className="w-4 h-4 text-[#ffc451]" />
                  Professional Experience
                </h2>
                <div className="space-y-4">
                  {consultant.workHistory.slice(0, 5).map((work, index) => (
                    <div key={work._id || index} className="relative pl-4 pb-4 border-l-2 border-gray-200 last:border-0 last:pb-0">
                      <div className="absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-[#ffc451] border-2 border-white"></div>
                      <div>
                        <h3 className="font-semibold text-gray-900 text-xs">
                          {work.position}
                        </h3>
                        <p className="text-[10px] text-gray-600 mt-0.5">{work.company}</p>
                        <p className="text-[9px] text-gray-500 mt-0.5">
                          {new Date(work.startDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} - {work.endDate ? new Date(work.endDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Present'}
                        </p>
                        {work.description && (
                          <p className="text-xs text-gray-700 mt-1.5 leading-relaxed">
                            {work.description}
                          </p>
                        )}
                        {work.technologies && work.technologies.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {work.technologies.map((tech, techIndex) => (
                              <span
                                key={techIndex}
                                className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-[9px]"
                              >
                                {tech}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Sidebar */}
          <div className="space-y-4">
            {/* Availability */}
            <div className="bg-white rounded-lg shadow-sm border border-[#ffc451]/20 p-4">
              <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-[#ffc451]" />
                Availability
              </h2>
              <div className="space-y-2.5">
                <div>
                  <p className="text-[10px] text-gray-500 mb-1">Current Status</p>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium ${availabilityBadge.bg} ${availabilityBadge.text}`}>
                    <AvailabilityIcon className="w-3 h-3" />
                    {consultant.availability?.status?.replace('_', ' ').charAt(0).toUpperCase() + consultant.availability?.status?.slice(1).replace('_', ' ')}
                  </span>
                </div>
                {consultant.availability?.nextAvailableDate && (
                  <div>
                    <p className="text-[10px] text-gray-500 mb-0.5">Next Available</p>
                    <p className="text-xs font-medium text-gray-900">
                      {new Date(consultant.availability.nextAvailableDate).toLocaleDateString()}
                    </p>
                  </div>
                )}
                {consultant.availability?.currentUtilization !== undefined && (
                  <div>
                    <p className="text-[10px] text-gray-500 mb-1">Current Utilization</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                        <div 
                          className="bg-[#ffc451] h-1.5 rounded-full"
                          style={{ width: `${consultant.availability.currentUtilization}%` }}
                        ></div>
                      </div>
                      <span className="text-xs font-medium text-gray-900">
                        {consultant.availability.currentUtilization}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Professional Details */}
            <div className="bg-white rounded-lg shadow-sm border border-[#ffc451]/20 p-4">
              <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
                <Briefcase className="w-4 h-4 text-[#ffc451]" />
                Professional Details
              </h2>
              <div className="space-y-2.5 text-xs">
                {consultant.professional?.employmentType && (
                  <div>
                    <p className="text-[10px] text-gray-500 mb-0.5">Employment Type</p>
                    <p className="text-gray-900 capitalize">
                      {consultant.professional.employmentType.replace('_', ' ')}
                    </p>
                  </div>
                )}
                {consultant.professional?.department && (
                  <div>
                    <p className="text-[10px] text-gray-500 mb-0.5">Department</p>
                    <p className="text-gray-900">{consultant.professional.department}</p>
                  </div>
                )}
                {consultant.professional?.team && (
                  <div>
                    <p className="text-[10px] text-gray-500 mb-0.5">Team</p>
                    <p className="text-gray-900">{consultant.professional.team}</p>
                  </div>
                )}
                {consultant.professional?.startDate && (
                  <div>
                    <p className="text-[10px] text-gray-500 mb-0.5">With Company Since</p>
                    <p className="text-gray-900">
                      {new Date(consultant.professional.startDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                )}
                {consultant.consultantCode && (
                  <div>
                    <p className="text-[10px] text-gray-500 mb-0.5">Consultant Code</p>
                    <p className="text-gray-900 font-mono text-[10px]">{consultant.consultantCode}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Industry Experience */}
            {consultant.professional?.industryExperience && consultant.professional.industryExperience.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-[#ffc451]/20 p-4">
                <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
                  <Building className="w-4 h-4 text-[#ffc451]" />
                  Industry Experience
                </h2>
                <div className="space-y-2">
                  {consultant.professional.industryExperience.map((ind, index) => (
                    <div key={index} className="flex items-center justify-between text-xs">
                      <span className="text-gray-900">{ind.industry}</span>
                      <span className="text-gray-500 text-[10px]">{ind.years} years</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Skills Summary */}
            {consultant.skills && consultant.skills.length > 0 && (
              <div className="bg-gradient-to-br from-[#ffc451]/5 to-white rounded-lg shadow-sm border border-[#ffc451]/20 p-4">
                <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
                  <Star className="w-4 h-4 text-[#ffc451]" />
                  Skills Overview
                </h2>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">Total Skills</span>
                    <span className="font-bold text-gray-900">{consultant.skills.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">Expert Level</span>
                    <span className="font-bold text-gray-900">
                      {consultant.skills.filter(s => s.proficiencyLevel === 'expert' || s.proficiencyLevel === 'master').length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">Verified</span>
                    <span className="font-bold text-emerald-600">
                      {consultant.skills.filter(s => s.verified).length}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Contact CTA */}
            <div className="bg-gradient-to-br from-[#ffc451]/10 to-white rounded-lg shadow-sm border border-[#ffc451]/30 p-4">
              <h3 className="text-sm font-bold text-gray-900 mb-1">
                Interested in Working Together?
              </h3>
              <p className="text-[10px] text-gray-600 mb-3 leading-relaxed">
                Contact our team to discuss how this consultant can help accelerate your project success.
              </p>
              <button className="w-full bg-gradient-to-r from-[#ffc451] to-[#ffb020] hover:from-[#ffb020] hover:to-[#ffc451] text-black font-medium py-2 px-4 rounded-md text-xs transition-all flex items-center justify-center gap-1.5 shadow-sm">
                <Mail className="w-3.5 h-3.5" />
                Request Consultation
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}