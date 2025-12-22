'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Plus,
    Edit,
    Trash2,
    Search,
    CheckCircle,
    ArrowLeft,
    Loader2,
    Star,
    Award,
    Calendar,
    TrendingUp,
    Target,
    BookOpen,
    Users,
    ChevronDown,
    ChevronUp,
    Clock,
    Briefcase,
    GraduationCap,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { consultantApi, type ConsultantProfile } from '@/lib/api/consultant'

interface SkillRecord {
    _id: string
    skillRecordId: string
    consultantId: string
    skill: {
        name: string
        normalizedName: string
        category: string
        subcategory?: string
        description?: string
        tags?: string[]
        aliases?: string[]
        relatedSkills?: any[]
    }
    proficiency: {
        level: 'none' | 'beginner' | 'intermediate' | 'advanced' | 'expert' | 'master'
        score?: number
        selfAssessment?: {
            level: string
            score: number
            assessedAt: string
            notes?: string
        }
        managerAssessment?: {
            level: string
            score: number
            assessedBy: string
            assessedAt: string
            notes?: string
        }
        peerAssessments?: any[]
        certificationBased?: {
            certified: boolean
            certificationId?: string
            certificationName?: string
            score?: number
            earnedAt?: string
        }
    }
    experience: {
        yearsOfExperience?: number
        monthsOfExperience?: number
        firstUsed?: string
        lastUsed?: string
        currentlyUsing?: boolean
        totalProjects?: number
        totalHours?: number
        contexts?: Array<{
            context: string
            percentage?: number
            _id?: string
        }>
    }
    projectHistory?: any[]
    training?: {
        coursesCompleted?: any[]
        currentlyEnrolled?: any[]
        recommendedCourses?: any[]
        learningPath?: any[]
    }
    verification?: {
        status: 'unverified' | 'self_reported' | 'peer_verified' | 'manager_verified' | 'certified' | 'tested'
        verifiedBy?: string
        verifiedAt?: string
        verificationMethod?: string
        verificationNotes?: string
    }
    endorsements?: Array<{
        _id?: string
        endorserId: string
        endorserName?: string
        endorserTitle?: string
        relationship?: string
        endorsedAt: string
        comment?: string
        rating?: number
        visible?: boolean
    }>
    goals?: {
        targetLevel?: string
        targetDate?: string
        priority?: 'low' | 'medium' | 'high' | 'critical'
        developmentPlan?: string
        milestones?: Array<{
            milestone?: string
            targetDate: string
            achieved?: boolean
            achievedAt?: string
            _id?: string
        }>
        blockers?: Array<{
            description: string
            identifiedAt: string
            resolved?: boolean
            resolvedAt?: string
            resolution?: string
        }>
    }
    marketData?: {
        demandLevel?: 'low' | 'moderate' | 'high' | 'critical'
        trendDirection?: 'declining' | 'stable' | 'growing' | 'emerging'
        marketRate?: {
            min?: number
            max?: number
            average?: number
            currency?: string
        }
        lastMarketUpdate?: string
        competitiveness?: 'low' | 'moderate' | 'high' | 'very_high'
    }
    status: {
        current?: string
        isPrimary?: boolean
        isFeatured?: boolean
        isActive: boolean
        isDeleted: boolean
    }
    metadata?: {
        source?: string
        createdBy: string
        updatedBy?: string
    }
    createdAt: string
    updatedAt: string
}

interface SkillFormData {
    name: string
    category: string
    proficiencyLevel: string
    yearsOfExperience: number
    lastUsed: string
}

const SKILL_CATEGORIES = [
    { value: 'technical', label: 'Technical' },
    { value: 'functional', label: 'Functional' },
    { value: 'domain', label: 'Domain Knowledge' },
    { value: 'soft_skill', label: 'Soft Skills' },
    { value: 'tool', label: 'Tools & Software' },
    { value: 'methodology', label: 'Methodology' },
    { value: 'language', label: 'Programming Language' },
    { value: 'framework', label: 'Framework' },
    { value: 'platform', label: 'Platform' },
    { value: 'database', label: 'Database' },
    { value: 'other', label: 'Other' },
]

const PROFICIENCY_LEVELS = [
    { value: 'beginner', label: 'Beginner' },
    { value: 'intermediate', label: 'Intermediate' },
    { value: 'advanced', label: 'Advanced' },
    { value: 'expert', label: 'Expert' },
    { value: 'master', label: 'Master' },
]

const CONTEXT_LABELS: Record<string, string> = {
    work: 'Professional Work',
    personal: 'Personal Projects',
    education: 'Educational',
    certification: 'Certification',
    volunteer: 'Volunteer',
    open_source: 'Open Source',
    web_applications: 'Web Applications',
    mobile_applications: 'Mobile Applications',
    data_science: 'Data Science',
    devops: 'DevOps',
    dashboards: 'Dashboards',
    mobile_web: 'Mobile Web',
    other: 'Other'
}

const getProficiencyColor = (level: string): string => {
    switch (level) {
        case 'master': return 'text-purple-600'
        case 'expert': return 'text-blue-600'
        case 'advanced': return 'text-green-600'
        case 'intermediate': return 'text-yellow-600'
        case 'beginner': return 'text-gray-600'
        default: return 'text-gray-400'
    }
}

const getVerificationBadgeColor = (status: string): string => {
    switch (status) {
        case 'certified':
        case 'tested': return 'bg-green-100 text-green-800'
        case 'manager_verified': return 'bg-blue-100 text-blue-800'
        case 'peer_verified': return 'bg-indigo-100 text-indigo-800'
        case 'self_reported': return 'bg-yellow-100 text-yellow-800'
        default: return 'bg-gray-100 text-gray-800'
    }
}

const formatDate = (dateString?: string): string => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    })
}

export default function SkillsManagementPage() {
    const router = useRouter()
    const [consultant, setConsultant] = useState<ConsultantProfile | null>(null)
    const [skills, setSkills] = useState<SkillRecord[]>([])
    const [filteredSkills, setFilteredSkills] = useState<SkillRecord[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [isEditMode, setIsEditMode] = useState(false)
    const [selectedSkill, setSelectedSkill] = useState<SkillRecord | null>(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [categoryFilter, setCategoryFilter] = useState<string>('all')
    const [proficiencyFilter, setProficiencyFilter] = useState<string>('all')
    const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set())

    const [skillForm, setSkillForm] = useState<SkillFormData>({
        name: '',
        category: 'technical',
        proficiencyLevel: 'intermediate',
        yearsOfExperience: 0,
        lastUsed: new Date().toISOString().split('T')[0],
    })

    useEffect(() => {
        loadData()
    }, [])

    useEffect(() => {
        filterSkills()
    }, [skills, searchTerm, categoryFilter, proficiencyFilter])

    const toggleSkillExpansion = (skillId: string) => {
        setExpandedSkills(prev => {
            const newSet = new Set(prev)
            if (newSet.has(skillId)) {
                newSet.delete(skillId)
            } else {
                newSet.add(skillId)
            }
            return newSet
        })
    }

    const loadData = async () => {
        setIsLoading(true)

        try {
            const profileData = await consultantApi.getMyProfile()
            setConsultant(profileData)

            const skillsResponse = await consultantApi.getMySkills()
            
            let skillsData: SkillRecord[] = []
            
            if (Array.isArray(skillsResponse)) {
                skillsData = skillsResponse
            } else if (skillsResponse && typeof skillsResponse === 'object') {
                if ('data' in skillsResponse && skillsResponse.data && typeof skillsResponse.data === 'object') {
                    if ('data' in skillsResponse.data && Array.isArray(skillsResponse.data.data)) {
                        skillsData = skillsResponse.data.data
                    } else if (Array.isArray(skillsResponse.data)) {
                        skillsData = skillsResponse.data
                    }
                }
            }
            
            const activeSkills = skillsData.filter(skill => !skill.status?.isDeleted)
            setSkills(activeSkills)
            
            if (activeSkills.length === 0) {
                toast('No active skills found')
            } else {
                toast.success(`Loaded ${activeSkills.length} skills`)
            }
        } catch (error: any) {
            console.error('Failed to load skills:', error)
            toast.error('Failed to load skills: ' + (error.response?.data?.message || error.message))

            if (error.response?.status === 401) {
                router.push('/login')
            }
            
            setSkills([])
        } finally {
            setIsLoading(false)
        }
    }

    const filterSkills = () => {
        if (!Array.isArray(skills)) {
            setFilteredSkills([])
            return
        }

        let filtered = [...skills]

        if (searchTerm) {
            filtered = filtered.filter(skill =>
                skill.skill?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                skill.skill?.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                skill.skill?.tags?.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
            )
        }

        if (categoryFilter !== 'all') {
            filtered = filtered.filter(skill => skill.skill?.category === categoryFilter)
        }

        if (proficiencyFilter !== 'all') {
            filtered = filtered.filter(skill => skill.proficiency?.level === proficiencyFilter)
        }

        setFilteredSkills(filtered)
    }

    const resetForm = () => {
        setSkillForm({
            name: '',
            category: 'technical',
            proficiencyLevel: 'intermediate',
            yearsOfExperience: 0,
            lastUsed: new Date().toISOString().split('T')[0],
        })
        setSelectedSkill(null)
        setIsEditMode(false)
    }

    const handleOpenDialog = (skill?: SkillRecord) => {
        if (skill) {
            setIsEditMode(true)
            setSelectedSkill(skill)
            setSkillForm({
                name: skill.skill.name,
                category: skill.skill.category,
                proficiencyLevel: skill.proficiency.level,
                yearsOfExperience: skill.experience?.yearsOfExperience || 0,
                lastUsed: skill.experience?.lastUsed 
                    ? new Date(skill.experience.lastUsed).toISOString().split('T')[0] 
                    : new Date().toISOString().split('T')[0],
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
        if (!skillForm.name.trim()) {
            toast.error('Skill name is required')
            return
        }

        if (!consultant?._id) {
            toast.error('Consultant ID not found')
            return
        }

        try {
            const skillData = {
                skillName: skillForm.name,
                category: skillForm.category,
                proficiencyLevel: skillForm.proficiencyLevel,
                yearsOfExperience: skillForm.yearsOfExperience,
                lastUsed: skillForm.lastUsed,
            }

            if (isEditMode && selectedSkill) {
                await consultantApi.updateSkillRecord(selectedSkill._id, skillData)
                toast.success('Skill updated successfully')
            } else {
                await consultantApi.createSkillRecord(consultant._id, skillData)
                toast.success('Skill added successfully')
            }

            handleCloseDialog()
            await loadData()
        } catch (error: any) {
            console.error('Failed to save skill:', error)
            toast.error(error.response?.data?.message || 'Failed to save skill')
        }
    }

    const handleDeleteSkill = async (skill: SkillRecord) => {
        if (!confirm(`Are you sure you want to remove "${skill.skill.name}" from your skills?`)) {
            return
        }

        try {
            await consultantApi.deleteSkillRecord(skill._id)
            toast.success('Skill removed successfully')
            await loadData()
        } catch (error: any) {
            console.error('Failed to delete skill:', error)
            toast.error(error.response?.data?.message || 'Failed to delete skill')
        }
    }

    const getSkillsByCategory = () => {
        if (!Array.isArray(filteredSkills)) {
            return {}
        }

        const grouped: Record<string, SkillRecord[]> = {}

        filteredSkills.forEach(skill => {
            const category = skill.skill?.category || 'other'
            if (!grouped[category]) {
                grouped[category] = []
            }
            grouped[category].push(skill)
        })

        return grouped
    }

    const safeSkills = Array.isArray(skills) ? skills : []
    const verifiedCount = safeSkills.filter(s => 
        s.verification?.status && ['certified', 'tested', 'manager_verified', 'peer_verified'].includes(s.verification.status)
    ).length
    const expertCount = safeSkills.filter(s => 
        s.proficiency?.level === 'expert' || s.proficiency?.level === 'master'
    ).length
    const categoryCount = new Set(safeSkills.map(s => s.skill?.category).filter(Boolean)).size

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
                <div className="text-center space-y-3">
                    <div className="relative">
                        <div className="w-12 h-12 mx-auto rounded-full bg-gradient-to-r from-[#ffc451] to-[#ffb020] animate-pulse" />
                        <Loader2 className="h-6 w-6 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white animate-spin" />
                    </div>
                    <p className="text-xs font-medium text-gray-600">Loading skills profile...</p>
                </div>
            </div>
        )
    }

    const groupedSkills = getSkillsByCategory()

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
            <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link href="/consultant/dashboard">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <ArrowLeft className="h-3.5 w-3.5" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-lg font-bold text-gray-900">Professional Skills Profile</h1>
                            <p className="text-xs text-gray-500">
                                Comprehensive skill tracking and development planning
                            </p>
                        </div>
                    </div>
                    <Button
                        onClick={() => handleOpenDialog()}
                        size="sm"
                        className="bg-gradient-to-r from-[#ffc451] to-[#ffb020] hover:from-[#ffb020] hover:to-[#ffc451] text-black font-medium text-xs h-8"
                    >
                        <Plus className="mr-1.5 h-3 w-3" />
                        Add Skill
                    </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                    <Card className="border-[#ffc451]/20">
                        <CardContent className="p-3">
                            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Total Skills</p>
                            <div className="text-xl font-bold text-gray-900">{safeSkills.length}</div>
                        </CardContent>
                    </Card>

                    <Card className="border-emerald-500/20">
                        <CardContent className="p-3">
                            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Verified Skills</p>
                            <div className="text-xl font-bold text-gray-900">{verifiedCount}</div>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                                {safeSkills.length > 0 ? Math.round((verifiedCount / safeSkills.length) * 100) : 0}% of total
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-blue-500/20">
                        <CardContent className="p-3">
                            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Expert Level</p>
                            <div className="text-xl font-bold text-gray-900">{expertCount}</div>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                                Advanced proficiency skills
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-purple-500/20">
                        <CardContent className="p-3">
                            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Skill Categories</p>
                            <div className="text-xl font-bold text-gray-900">{categoryCount}</div>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                                Diverse skill portfolio
                            </p>
                        </CardContent>
                    </Card>
                </div>

                <Card className="border-[#ffc451]/20">
                    <CardContent className="p-3">
                        <div className="flex flex-col md:flex-row gap-2">
                            <div className="flex-1">
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                                    <Input
                                        placeholder="Search skills, descriptions, or tags..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-8 h-8 text-xs"
                                    />
                                </div>
                            </div>

                            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                <SelectTrigger className="w-full md:w-[160px] h-8 text-xs">
                                    <SelectValue placeholder="Category" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all" className="text-xs">All Categories</SelectItem>
                                    {SKILL_CATEGORIES.map(cat => (
                                        <SelectItem key={cat.value} value={cat.value} className="text-xs">{cat.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Select value={proficiencyFilter} onValueChange={setProficiencyFilter}>
                                <SelectTrigger className="w-full md:w-[160px] h-8 text-xs">
                                    <SelectValue placeholder="Proficiency" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all" className="text-xs">All Levels</SelectItem>
                                    {PROFICIENCY_LEVELS.map(level => (
                                        <SelectItem key={level.value} value={level.value} className="text-xs">{level.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>

                {filteredSkills.length === 0 ? (
                    <Card className="border-[#ffc451]/20">
                        <CardContent className="py-12 text-center">
                            <Star className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                            <h3 className="text-sm font-semibold text-gray-900 mb-1">No skills found</h3>
                            <p className="text-xs text-gray-500 mb-4">
                                {searchTerm || categoryFilter !== 'all' || proficiencyFilter !== 'all'
                                    ? 'Try adjusting your filters to see more skills'
                                    : 'Begin building your professional skills profile by adding your first skill'}
                            </p>
                            {!searchTerm && categoryFilter === 'all' && proficiencyFilter === 'all' && (
                                <Button
                                    onClick={() => handleOpenDialog()}
                                    size="sm"
                                    className="bg-gradient-to-r from-[#ffc451] to-[#ffb020] hover:from-[#ffb020] hover:to-[#ffc451] text-black font-medium text-xs h-8"
                                >
                                    <Plus className="mr-1.5 h-3 w-3" />
                                    Add Your First Skill
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-4">
                        {Object.entries(groupedSkills).map(([category, categorySkills]) => {
                            const categoryConfig = SKILL_CATEGORIES.find(c => c.value === category)

                            return (
                                <Card key={category} className="border-[#ffc451]/20">
                                    <CardHeader className="p-3 pb-2">
                                        <div className="flex items-center justify-between">
                                            <CardTitle className="text-xs font-bold text-gray-900">
                                                {categoryConfig?.label || category}
                                            </CardTitle>
                                            <Badge variant="default" className="text-[10px] h-5">{categorySkills.length} skills</Badge>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-3 pt-0 space-y-2">
                                        {categorySkills
                                            .sort((a, b) => {
                                                const levelOrder: Record<string, number> = { 
                                                    master: 5, expert: 4, advanced: 3, intermediate: 2, beginner: 1, none: 0
                                                }
                                                return (levelOrder[b.proficiency?.level] || 0) - (levelOrder[a.proficiency?.level] || 0)
                                            })
                                            .map((skill) => {
                                                const isExpanded = expandedSkills.has(skill._id)
                                                
                                                return (
                                                    <Card key={skill._id} className="border-l-4 border-l-transparent hover:border-l-[#ffc451] transition-colors" style={{ borderLeftColor: skill.status?.isFeatured ? '#ffc451' : undefined }}>
                                                        <CardHeader className="p-2.5 pb-2">
                                                            <div className="flex items-start justify-between">
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                                                        <h3 className="text-sm font-semibold text-gray-900">{skill.skill.name}</h3>
                                                                        {skill.verification?.status && skill.verification.status !== 'unverified' && (
                                                                            <Badge className={`${getVerificationBadgeColor(skill.verification.status)} text-[10px] h-5`}>
                                                                                {skill.verification.status.replace('_', ' ')}
                                                                            </Badge>
                                                                        )}
                                                                        {skill.status?.isPrimary && (
                                                                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] h-5">
                                                                                Primary
                                                                            </Badge>
                                                                        )}
                                                                        {skill.experience?.currentlyUsing && (
                                                                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px] h-5">
                                                                                <Clock className="h-2.5 w-2.5 mr-1" />
                                                                                In Use
                                                                            </Badge>
                                                                        )}
                                                                    </div>
                                                                    
                                                                    {skill.skill.subcategory && (
                                                                        <p className="text-[10px] text-gray-500 mb-1.5">
                                                                            {skill.skill.subcategory}
                                                                        </p>
                                                                    )}
                                                                    
                                                                    {skill.skill.description && (
                                                                        <p className="text-[10px] text-gray-500 mb-2 line-clamp-2">
                                                                            {skill.skill.description}
                                                                        </p>
                                                                    )}

                                                                    {skill.skill.tags && skill.skill.tags.length > 0 && (
                                                                        <div className="flex flex-wrap gap-1 mb-2">
                                                                            {skill.skill.tags.map((tag, idx) => (
                                                                                <Badge key={idx} variant="default" className="text-[9px] h-4 px-1.5">
                                                                                    {tag}
                                                                                </Badge>
                                                                            ))}
                                                                        </div>
                                                                    )}

                                                                    <div className="space-y-1.5">
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="text-[10px] font-medium text-gray-600">Proficiency Level</span>
                                                                            <Badge className={`${getProficiencyColor(skill.proficiency.level)} capitalize text-[10px] h-5`}>
                                                                                {skill.proficiency.level}
                                                                            </Badge>
                                                                        </div>
                                                                        {skill.proficiency.score !== undefined && (
                                                                            <div className="space-y-0.5">
                                                                                <Progress value={skill.proficiency.score} className="h-1.5" />
                                                                                <p className="text-[9px] text-gray-400 text-right">
                                                                                    Score: {skill.proficiency.score}/100
                                                                                </p>
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-gray-500">
                                                                        {skill.experience?.yearsOfExperience !== undefined && (
                                                                            <span className="flex items-center gap-1">
                                                                                <Calendar className="h-3 w-3" />
                                                                                {skill.experience.yearsOfExperience} {skill.experience.yearsOfExperience === 1 ? 'year' : 'years'}
                                                                            </span>
                                                                        )}
                                                                        {skill.experience?.totalProjects !== undefined && skill.experience.totalProjects > 0 && (
                                                                            <span className="flex items-center gap-1">
                                                                                <Briefcase className="h-3 w-3" />
                                                                                {skill.experience.totalProjects} {skill.experience.totalProjects === 1 ? 'project' : 'projects'}
                                                                            </span>
                                                                        )}
                                                                        {skill.endorsements && skill.endorsements.length > 0 && (
                                                                            <span className="flex items-center gap-1">
                                                                                <Users className="h-3 w-3" />
                                                                                {skill.endorsements.length} {skill.endorsements.length === 1 ? 'endorsement' : 'endorsements'}
                                                                            </span>
                                                                        )}
                                                                        {skill.training?.coursesCompleted && skill.training.coursesCompleted.length > 0 && (
                                                                            <span className="flex items-center gap-1">
                                                                                <GraduationCap className="h-3 w-3" />
                                                                                {skill.training.coursesCompleted.length} {skill.training.coursesCompleted.length === 1 ? 'course' : 'courses'}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center gap-0.5 ml-2">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => toggleSkillExpansion(skill._id)}
                                                                        className="h-7 w-7 p-0 text-gray-600 hover:text-gray-900"
                                                                    >
                                                                        {isExpanded ? (
                                                                            <ChevronUp className="h-3.5 w-3.5" />
                                                                        ) : (
                                                                            <ChevronDown className="h-3.5 w-3.5" />
                                                                        )}
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => handleOpenDialog(skill)}
                                                                        className="h-7 w-7 p-0 text-gray-600 hover:text-gray-900"
                                                                    >
                                                                        <Edit className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => handleDeleteSkill(skill)}
                                                                        className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        </CardHeader>

                                                        {isExpanded && (
                                                            <CardContent className="p-2.5 pt-0">
                                                                <Separator className="mb-3" />
                                                                
                                                                <Tabs defaultValue="proficiency" className="w-full">
                                                                    <TabsList className="grid w-full grid-cols-5 h-7">
                                                                        <TabsTrigger value="proficiency" className="text-[10px]">Proficiency</TabsTrigger>
                                                                        <TabsTrigger value="experience" className="text-[10px]">Experience</TabsTrigger>
                                                                        <TabsTrigger value="goals" className="text-[10px]">Goals</TabsTrigger>
                                                                        <TabsTrigger value="training" className="text-[10px]">Training</TabsTrigger>
                                                                        <TabsTrigger value="market" className="text-[10px]">Market</TabsTrigger>
                                                                    </TabsList>

                                                                    <TabsContent value="proficiency" className="space-y-3 mt-3">
                                                                        {skill.proficiency.selfAssessment && (
                                                                            <div className="space-y-1.5">
                                                                                <h4 className="text-[10px] font-medium flex items-center gap-1.5 text-gray-700">
                                                                                    <Award className="h-3 w-3" />
                                                                                    Self Assessment
                                                                                </h4>
                                                                                <div className="bg-muted p-2 rounded-md space-y-1.5">
                                                                                    <div className="flex items-center justify-between text-[10px]">
                                                                                        <span>Level: <strong className="capitalize">{skill.proficiency.selfAssessment.level}</strong></span>
                                                                                        <span>Score: <strong>{skill.proficiency.selfAssessment.score}/100</strong></span>
                                                                                    </div>
                                                                                    <p className="text-[9px] text-gray-500">
                                                                                        Assessed on {formatDate(skill.proficiency.selfAssessment.assessedAt)}
                                                                                    </p>
                                                                                    {skill.proficiency.selfAssessment.notes && (
                                                                                        <p className="text-[10px] mt-1.5 italic text-gray-600">
                                                                                            "{skill.proficiency.selfAssessment.notes}"
                                                                                        </p>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {skill.proficiency.managerAssessment && (
                                                                            <div className="space-y-1.5">
                                                                                <h4 className="text-[10px] font-medium flex items-center gap-1.5 text-gray-700">
                                                                                    <CheckCircle className="h-3 w-3 text-blue-600" />
                                                                                    Manager Assessment
                                                                                </h4>
                                                                                <div className="bg-blue-50 p-2 rounded-md space-y-1.5">
                                                                                    <div className="flex items-center justify-between text-[10px]">
                                                                                        <span>Level: <strong className="capitalize">{skill.proficiency.managerAssessment.level}</strong></span>
                                                                                        <span>Score: <strong>{skill.proficiency.managerAssessment.score}/100</strong></span>
                                                                                    </div>
                                                                                    <p className="text-[9px] text-gray-600">
                                                                                        Assessed on {formatDate(skill.proficiency.managerAssessment.assessedAt)}
                                                                                    </p>
                                                                                    {skill.proficiency.managerAssessment.notes && (
                                                                                        <p className="text-[10px] mt-1.5 italic text-gray-700">
                                                                                            "{skill.proficiency.managerAssessment.notes}"
                                                                                        </p>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {skill.proficiency.peerAssessments && skill.proficiency.peerAssessments.length > 0 && (
                                                                            <div className="space-y-1.5">
                                                                                <h4 className="text-[10px] font-medium flex items-center gap-1.5 text-gray-700">
                                                                                    <Users className="h-3 w-3 text-indigo-600" />
                                                                                    Peer Assessments ({skill.proficiency.peerAssessments.length})
                                                                                </h4>
                                                                                <div className="space-y-1.5">
                                                                                    {skill.proficiency.peerAssessments.map((assessment: any, idx: number) => (
                                                                                        <div key={idx} className="bg-indigo-50 p-2 rounded-md">
                                                                                            <div className="flex items-center justify-between text-[10px]">
                                                                                                <span className="capitalize">{assessment.level}</span>
                                                                                                <span>{assessment.score}/100</span>
                                                                                            </div>
                                                                                            {assessment.notes && (
                                                                                                <p className="text-[10px] mt-1 italic text-gray-700">"{assessment.notes}"</p>
                                                                                            )}
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {skill.proficiency.certificationBased?.certified && (
                                                                            <div className="space-y-1.5">
                                                                                <h4 className="text-[10px] font-medium flex items-center gap-1.5 text-gray-700">
                                                                                    <GraduationCap className="h-3 w-3 text-green-600" />
                                                                                    Certification
                                                                                </h4>
                                                                                <div className="bg-green-50 p-2 rounded-md">
                                                                                    <p className="text-[10px] font-medium text-gray-900">{skill.proficiency.certificationBased.certificationName || 'Certified'}</p>
                                                                                    {skill.proficiency.certificationBased.certificationId && (
                                                                                        <p className="text-[9px] text-gray-600">ID: {skill.proficiency.certificationBased.certificationId}</p>
                                                                                    )}
                                                                                    {skill.proficiency.certificationBased.earnedAt && (
                                                                                        <p className="text-[9px] text-gray-600">Earned: {formatDate(skill.proficiency.certificationBased.earnedAt)}</p>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </TabsContent>

                                                                    <TabsContent value="experience" className="space-y-3 mt-3">
                                                                        <div className="grid grid-cols-2 gap-2">
                                                                            <div>
                                                                                <p className="text-[9px] text-gray-500">Experience Duration</p>
                                                                                <p className="text-xs font-semibold text-gray-900">
                                                                                    {skill.experience?.yearsOfExperience || 0} years, {skill.experience?.monthsOfExperience || 0} months
                                                                                </p>
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-[9px] text-gray-500">Total Projects</p>
                                                                                <p className="text-xs font-semibold text-gray-900">{skill.experience?.totalProjects || 0}</p>
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-[9px] text-gray-500">First Used</p>
                                                                                <p className="text-[10px] text-gray-700">{formatDate(skill.experience?.firstUsed)}</p>
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-[9px] text-gray-500">Last Used</p>
                                                                                <p className="text-[10px] text-gray-700">{formatDate(skill.experience?.lastUsed)}</p>
                                                                            </div>
                                                                        </div>

                                                                        {skill.experience?.totalHours && skill.experience.totalHours > 0 && (
                                                                            <div>
                                                                                <p className="text-[9px] text-gray-500">Total Hours Logged</p>
                                                                                <p className="text-xs font-semibold text-gray-900">{skill.experience.totalHours.toLocaleString()} hours</p>
                                                                            </div>
                                                                        )}

                                                                        {skill.experience?.contexts && skill.experience.contexts.length > 0 && (
                                                                            <div className="space-y-1.5">
                                                                                <h4 className="text-[10px] font-medium text-gray-700">Usage Contexts</h4>
                                                                                <div className="flex flex-wrap gap-1">
                                                                                    {skill.experience.contexts.map((ctx, idx) => (
                                                                                        <Badge key={idx} variant="outline" className="text-[9px] h-4">
                                                                                            {CONTEXT_LABELS[ctx.context] || ctx.context}
                                                                                            {ctx.percentage && ` (${ctx.percentage}%)`}
                                                                                        </Badge>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </TabsContent>

                                                                    <TabsContent value="goals" className="space-y-3 mt-3">
                                                                        {skill.goals?.targetLevel && (
                                                                            <div className="bg-muted p-2.5 rounded-md space-y-2">
                                                                                <div className="flex items-center justify-between">
                                                                                    <div>
                                                                                        <p className="text-[9px] text-gray-500">Target Level</p>
                                                                                        <p className="text-xs font-semibold capitalize text-gray-900">{skill.goals.targetLevel}</p>
                                                                                    </div>
                                                                                    {skill.goals.targetDate && (
                                                                                        <div className="text-right">
                                                                                            <p className="text-[9px] text-gray-500">Target Date</p>
                                                                                            <p className="text-[10px] font-semibold text-gray-900">{formatDate(skill.goals.targetDate)}</p>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                                {skill.goals.priority && (
                                                                                    <Badge className={`text-[10px] h-5 ${
                                                                                        skill.goals.priority === 'critical' ? 'bg-red-100 text-red-800' :
                                                                                        skill.goals.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                                                                                        skill.goals.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                                                                        'bg-gray-100 text-gray-800'
                                                                                    }`}>
                                                                                        Priority: {skill.goals.priority}
                                                                                    </Badge>
                                                                                )}
                                                                            </div>
                                                                        )}

                                                                        {skill.goals?.developmentPlan && (
                                                                            <div>
                                                                                <h4 className="text-[10px] font-medium mb-1.5 text-gray-700">Development Plan</h4>
                                                                                <p className="text-[10px] text-gray-600">{skill.goals.developmentPlan}</p>
                                                                            </div>
                                                                        )}

                                                                        {skill.goals?.milestones && skill.goals.milestones.length > 0 && (
                                                                            <div>
                                                                                <h4 className="text-[10px] font-medium mb-1.5 text-gray-700">Milestones</h4>
                                                                                <div className="space-y-1.5">
                                                                                    {skill.goals.milestones.map((milestone, idx) => (
                                                                                        <div key={idx} className="flex items-center justify-between p-1.5 bg-muted rounded text-[10px]">
                                                                                            <div className="flex items-center gap-1.5">
                                                                                                {milestone.achieved ? (
                                                                                                    <CheckCircle className="h-3 w-3 text-green-600" />
                                                                                                ) : (
                                                                                                    <div className="h-3 w-3 rounded-full border-2 border-gray-400" />
                                                                                                )}
                                                                                                <span>{milestone.milestone || 'Milestone'}</span>
                                                                                            </div>
                                                                                            <span className="text-[9px] text-gray-500">
                                                                                                {formatDate(milestone.targetDate)}
                                                                                            </span>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {skill.goals?.blockers && skill.goals.blockers.length > 0 && (
                                                                            <div>
                                                                                <h4 className="text-[10px] font-medium mb-1.5 text-orange-700">Current Blockers</h4>
                                                                                <div className="space-y-1.5">
                                                                                    {skill.goals.blockers.filter(b => !b.resolved).map((blocker, idx) => (
                                                                                        <div key={idx} className="p-1.5 bg-orange-50 border border-orange-200 rounded">
                                                                                            <p className="text-[10px] text-gray-900">{blocker.description}</p>
                                                                                            <p className="text-[9px] text-gray-500 mt-0.5">
                                                                                                Identified: {formatDate(blocker.identifiedAt)}
                                                                                            </p>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </TabsContent>

                                                                    <TabsContent value="training" className="space-y-3 mt-3">
                                                                        {skill.training?.coursesCompleted && skill.training.coursesCompleted.length > 0 && (
                                                                            <div>
                                                                                <h4 className="text-[10px] font-medium mb-1.5 flex items-center gap-1.5 text-gray-700">
                                                                                    <CheckCircle className="h-3 w-3 text-green-600" />
                                                                                    Completed Courses ({skill.training.coursesCompleted.length})
                                                                                </h4>
                                                                                <div className="space-y-1.5">
                                                                                    {skill.training.coursesCompleted.map((course: any, idx: number) => (
                                                                                        <div key={idx} className="p-2 bg-green-50 rounded-md">
                                                                                            <p className="font-medium text-[10px] text-gray-900">{course.courseName}</p>
                                                                                            <p className="text-[9px] text-gray-600">{course.provider}</p>
                                                                                            {course.completedAt && (
                                                                                                <p className="text-[9px] text-gray-500">Completed: {formatDate(course.completedAt)}</p>
                                                                                            )}
                                                                                            {course.score && <p className="text-[9px] text-gray-700">Score: {course.score}%</p>}
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {skill.training?.currentlyEnrolled && skill.training.currentlyEnrolled.length > 0 && (
                                                                            <div>
                                                                                <h4 className="text-[10px] font-medium mb-1.5 flex items-center gap-1.5 text-gray-700">
                                                                                    <BookOpen className="h-3 w-3 text-blue-600" />
                                                                                    Currently Enrolled ({skill.training.currentlyEnrolled.length})
                                                                                </h4>
                                                                                <div className="space-y-1.5">
                                                                                    {skill.training.currentlyEnrolled.map((course: any, idx: number) => (
                                                                                        <div key={idx} className="p-2 bg-blue-50 rounded-md">
                                                                                            <p className="font-medium text-[10px] text-gray-900">{course.courseName}</p>
                                                                                            <p className="text-[9px] text-gray-600">{course.provider}</p>
                                                                                            {course.progress && (
                                                                                                <div className="mt-1.5">
                                                                                                    <Progress value={course.progress} className="h-1.5" />
                                                                                                    <p className="text-[9px] text-gray-500 mt-0.5">{course.progress}% complete</p>
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {skill.training?.recommendedCourses && skill.training.recommendedCourses.length > 0 && (
                                                                            <div>
                                                                                <h4 className="text-[10px] font-medium mb-1.5 flex items-center gap-1.5 text-gray-700">
                                                                                    <Target className="h-3 w-3 text-purple-600" />
                                                                                    Recommended Courses ({skill.training.recommendedCourses.length})
                                                                                </h4>
                                                                                <div className="space-y-1.5">
                                                                                    {skill.training.recommendedCourses.map((course: any, idx: number) => (
                                                                                        <div key={idx} className="p-2 bg-purple-50 rounded-md">
                                                                                            <div className="flex items-start justify-between">
                                                                                                <div>
                                                                                                    <p className="font-medium text-[10px] text-gray-900">{course.courseName}</p>
                                                                                                    <p className="text-[9px] text-gray-600">{course.provider}</p>
                                                                                                    {course.reason && (
                                                                                                        <p className="text-[9px] mt-1 italic text-gray-700">"{course.reason}"</p>
                                                                                                    )}
                                                                                                </div>
                                                                                                {course.priority && (
                                                                                                    <Badge className="capitalize text-[9px] h-4">{course.priority}</Badge>
                                                                                                )}
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </TabsContent>

                                                                    <TabsContent value="market" className="space-y-3 mt-3">
                                                                        {skill.marketData && (
                                                                            <>
                                                                                <div className="grid grid-cols-2 gap-2">
                                                                                    {skill.marketData.demandLevel && (
                                                                                        <div>
                                                                                            <p className="text-[9px] text-gray-500">Demand Level</p>
                                                                                            <Badge className={`text-[10px] h-5 ${
                                                                                                skill.marketData.demandLevel === 'critical' ? 'bg-red-100 text-red-800' :
                                                                                                skill.marketData.demandLevel === 'high' ? 'bg-green-100 text-green-800' :
                                                                                                skill.marketData.demandLevel === 'moderate' ? 'bg-yellow-100 text-yellow-800' :
                                                                                                'bg-gray-100 text-gray-800'
                                                                                            }`}>
                                                                                                {skill.marketData.demandLevel}
                                                                                            </Badge>
                                                                                        </div>
                                                                                    )}

                                                                                    {skill.marketData.trendDirection && (
                                                                                        <div>
                                                                                            <p className="text-[9px] text-gray-500">Trend Direction</p>
                                                                                            <Badge className={`text-[10px] h-5 ${
                                                                                                skill.marketData.trendDirection === 'emerging' ? 'bg-purple-100 text-purple-800' :
                                                                                                skill.marketData.trendDirection === 'growing' ? 'bg-green-100 text-green-800' :
                                                                                                skill.marketData.trendDirection === 'stable' ? 'bg-blue-100 text-blue-800' :
                                                                                                'bg-orange-100 text-orange-800'
                                                                                            }`}>
                                                                                                {skill.marketData.trendDirection}
                                                                                            </Badge>
                                                                                        </div>
                                                                                    )}
                                                                                </div>

                                                                                {skill.marketData.marketRate && (
                                                                                    <div className="p-2.5 bg-muted rounded-md">
                                                                                        <p className="text-[9px] text-gray-500 mb-1.5">Market Rate ({skill.marketData.marketRate.currency || 'USD'})</p>
                                                                                        <div className="flex items-center gap-3">
                                                                                            {skill.marketData.marketRate.min && (
                                                                                                <div>
                                                                                                    <p className="text-[9px] text-gray-500">Minimum</p>
                                                                                                    <p className="text-xs font-semibold text-gray-900">${skill.marketData.marketRate.min.toLocaleString()}</p>
                                                                                                </div>
                                                                                            )}
                                                                                            {skill.marketData.marketRate.average && (
                                                                                                <div>
                                                                                                    <p className="text-[9px] text-gray-500">Average</p>
                                                                                                    <p className="text-xs font-semibold text-gray-900">${skill.marketData.marketRate.average.toLocaleString()}</p>
                                                                                                </div>
                                                                                            )}
                                                                                            {skill.marketData.marketRate.max && (
                                                                                                <div>
                                                                                                    <p className="text-[9px] text-gray-500">Maximum</p>
                                                                                                    <p className="text-xs font-semibold text-gray-900">${skill.marketData.marketRate.max.toLocaleString()}</p>
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                )}

                                                                                {skill.marketData.competitiveness && (
                                                                                    <div>
                                                                                        <p className="text-[9px] text-gray-500">Market Competitiveness</p>
                                                                                        <Badge className="capitalize mt-1 text-[10px] h-5">{skill.marketData.competitiveness.replace('_', ' ')}</Badge>
                                                                                    </div>
                                                                                )}

                                                                                {skill.marketData.lastMarketUpdate && (
                                                                                    <p className="text-[9px] text-gray-400">
                                                                                        Last updated: {formatDate(skill.marketData.lastMarketUpdate)}
                                                                                    </p>
                                                                                )}
                                                                            </>
                                                                        )}

                                                                        {!skill.marketData && (
                                                                            <div className="text-center py-6">
                                                                                <TrendingUp className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                                                                                <p className="text-[10px] text-gray-500">
                                                                                    No market data available for this skill
                                                                                </p>
                                                                            </div>
                                                                        )}
                                                                    </TabsContent>
                                                                </Tabs>

                                                                {skill.endorsements && skill.endorsements.length > 0 && (
                                                                    <>
                                                                        <Separator className="my-3" />
                                                                        <div>
                                                                            <h4 className="text-[10px] font-medium mb-2 flex items-center gap-1.5 text-gray-700">
                                                                                <Users className="h-3 w-3" />
                                                                                Endorsements ({skill.endorsements.length})
                                                                            </h4>
                                                                            <div className="space-y-1.5">
                                                                                {skill.endorsements.filter(e => e.visible !== false).map((endorsement, idx) => (
                                                                                    <div key={idx} className="p-2 bg-muted rounded-md">
                                                                                        <div className="flex items-start justify-between mb-1">
                                                                                            <div>
                                                                                                <p className="font-medium text-[10px] text-gray-900">{endorsement.endorserName || 'Anonymous'}</p>
                                                                                                {endorsement.endorserTitle && (
                                                                                                    <p className="text-[9px] text-gray-500">{endorsement.endorserTitle}</p>
                                                                                                )}
                                                                                            </div>
                                                                                            <div className="text-right">
                                                                                                {endorsement.rating && (
                                                                                                    <div className="flex items-center gap-0.5">
                                                                                                        <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                                                                                                        <span className="text-[10px] font-medium">{endorsement.rating}/5</span>
                                                                                                    </div>
                                                                                                )}
                                                                                                {endorsement.relationship && (
                                                                                                    <Badge variant="outline" className="text-[9px] h-4 mt-0.5">
                                                                                                        {endorsement.relationship}
                                                                                                    </Badge>
                                                                                                )}
                                                                                            </div>
                                                                                        </div>
                                                                                        {endorsement.comment && (
                                                                                            <p className="text-[10px] mt-1.5 italic text-gray-600">"{endorsement.comment}"</p>
                                                                                        )}
                                                                                        <p className="text-[9px] text-gray-400 mt-1">
                                                                                            {formatDate(endorsement.endorsedAt)}
                                                                                        </p>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    </>
                                                                )}

                                                                <Separator className="my-3" />
                                                                <div className="flex items-center justify-between text-[9px] text-gray-400">
                                                                    <span>Created: {formatDate(skill.createdAt)}</span>
                                                                    <span>Last Updated: {formatDate(skill.updatedAt)}</span>
                                                                    {skill.metadata?.source && (
                                                                        <Badge variant="outline" className="text-[9px] h-4">
                                                                            Source: {skill.metadata.source}
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                            </CardContent>
                                                        )}
                                                    </Card>
                                                )
                                            })}
                                    </CardContent>
                                </Card>
                            )
                        })}
                    </div>
                )}

                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle className="text-base">{isEditMode ? 'Edit Skill' : 'Add New Skill'}</DialogTitle>
                            <DialogDescription className="text-xs">
                                {isEditMode ? 'Update your skill information' : 'Add a new skill to your professional profile'}
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-3 py-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="name" className="text-xs font-medium">Skill Name *</Label>
                                <Input
                                    id="name"
                                    value={skillForm.name}
                                    onChange={(e) => setSkillForm({ ...skillForm, name: e.target.value })}
                                    placeholder="e.g., React, Python, Project Management"
                                    disabled={isEditMode}
                                    className="h-8 text-xs"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="category" className="text-xs font-medium">Category *</Label>
                                <Select
                                    value={skillForm.category}
                                    onValueChange={(value) => setSkillForm({ ...skillForm, category: value })}
                                >
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {SKILL_CATEGORIES.map(cat => (
                                            <SelectItem key={cat.value} value={cat.value} className="text-xs">{cat.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="proficiencyLevel" className="text-xs font-medium">Proficiency Level *</Label>
                                <Select
                                    value={skillForm.proficiencyLevel}
                                    onValueChange={(value) => setSkillForm({ ...skillForm, proficiencyLevel: value })}
                                >
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PROFICIENCY_LEVELS.map(level => (
                                            <SelectItem key={level.value} value={level.value} className="text-xs">{level.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="yearsOfExperience" className="text-xs font-medium">Years of Experience</Label>
                                <Input
                                    id="yearsOfExperience"
                                    type="number"
                                    min="0"
                                    max="50"
                                    value={skillForm.yearsOfExperience}
                                    onChange={(e) => setSkillForm({ ...skillForm, yearsOfExperience: parseInt(e.target.value) || 0 })}
                                    className="h-8 text-xs"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="lastUsed" className="text-xs font-medium">Last Used</Label>
                                <Input
                                    id="lastUsed"
                                    type="date"
                                    value={skillForm.lastUsed}
                                    onChange={(e) => setSkillForm({ ...skillForm, lastUsed: e.target.value })}
                                    className="h-8 text-xs"
                                />
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
                                {isEditMode ? 'Update Skill' : 'Add Skill'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    )
}