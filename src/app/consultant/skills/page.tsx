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
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'
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
            
            // Handle the double-nested data structure: response.data.data
            if (Array.isArray(skillsResponse)) {
                skillsData = skillsResponse
            } else if (skillsResponse && typeof skillsResponse === 'object') {
                // First check for data.data (double nested)
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
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center space-y-3">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                    <p className="text-sm text-muted-foreground">Loading skills profile...</p>
                </div>
            </div>
        )
    }

    const groupedSkills = getSkillsByCategory()

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Link href="/consultant/dashboard">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold">Professional Skills Profile</h1>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Comprehensive skill tracking and development planning
                        </p>
                    </div>
                </div>
                <Button onClick={() => handleOpenDialog()} size="sm">
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    Add Skill
                </Button>
            </div>

            {/* Statistics Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Total Skills</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{safeSkills.length}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Verified Skills</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{verifiedCount}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {safeSkills.length > 0 ? Math.round((verifiedCount / safeSkills.length) * 100) : 0}% of total
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Expert Level</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{expertCount}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Advanced proficiency skills
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Skill Categories</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{categoryCount}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Diverse skill portfolio
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row gap-3">
                        <div className="flex-1">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search skills, descriptions, or tags..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                        </div>

                        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                            <SelectTrigger className="w-full md:w-[180px]">
                                <SelectValue placeholder="Category" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Categories</SelectItem>
                                {SKILL_CATEGORIES.map(cat => (
                                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={proficiencyFilter} onValueChange={setProficiencyFilter}>
                            <SelectTrigger className="w-full md:w-[180px]">
                                <SelectValue placeholder="Proficiency" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Levels</SelectItem>
                                {PROFICIENCY_LEVELS.map(level => (
                                    <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Skills Display */}
            {filteredSkills.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <Star className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
                        <h3 className="font-semibold mb-2">No skills found</h3>
                        <p className="text-sm text-muted-foreground mb-6">
                            {searchTerm || categoryFilter !== 'all' || proficiencyFilter !== 'all'
                                ? 'Try adjusting your filters to see more skills'
                                : 'Begin building your professional skills profile by adding your first skill'}
                        </p>
                        {!searchTerm && categoryFilter === 'all' && proficiencyFilter === 'all' && (
                            <Button onClick={() => handleOpenDialog()} size="sm">
                                <Plus className="mr-2 h-3.5 w-3.5" />
                                Add Your First Skill
                            </Button>
                        )}
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-6">
                    {Object.entries(groupedSkills).map(([category, categorySkills]) => {
                        const categoryConfig = SKILL_CATEGORIES.find(c => c.value === category)

                        return (
                            <Card key={category}>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base">
                                            {categoryConfig?.label || category}
                                        </CardTitle>
                                        <Badge variant="default">{categorySkills.length} skills</Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
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
                                                <Card key={skill._id} className="border-l-4" style={{ borderLeftColor: skill.status?.isFeatured ? '#ffc451' : 'transparent' }}>
                                                    <CardHeader className="pb-3">
                                                        <div className="flex items-start justify-between">
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <h3 className="text-lg font-semibold">{skill.skill.name}</h3>
                                                                    {skill.verification?.status && skill.verification.status !== 'unverified' && (
                                                                        <Badge className={getVerificationBadgeColor(skill.verification.status)}>
                                                                            {skill.verification.status.replace('_', ' ')}
                                                                        </Badge>
                                                                    )}
                                                                    {skill.status?.isPrimary && (
                                                                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                                                            Primary
                                                                        </Badge>
                                                                    )}
                                                                    {skill.experience?.currentlyUsing && (
                                                                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                                                            <Clock className="h-3 w-3 mr-1" />
                                                                            In Use
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                                
                                                                {skill.skill.subcategory && (
                                                                    <p className="text-sm text-muted-foreground mb-2">
                                                                        {skill.skill.subcategory}
                                                                    </p>
                                                                )}
                                                                
                                                                {skill.skill.description && (
                                                                    <p className="text-sm text-muted-foreground mb-3">
                                                                        {skill.skill.description}
                                                                    </p>
                                                                )}

                                                                {/* Tags */}
                                                                {skill.skill.tags && skill.skill.tags.length > 0 && (
                                                                    <div className="flex flex-wrap gap-1 mb-3">
                                                                        {skill.skill.tags.map((tag, idx) => (
                                                                            <Badge key={idx} variant="default" className="text-xs">
                                                                                {tag}
                                                                            </Badge>
                                                                        ))}
                                                                    </div>
                                                                )}

                                                                {/* Proficiency Overview */}
                                                                <div className="space-y-2">
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-sm font-medium">Proficiency Level</span>
                                                                        <Badge className={`${getProficiencyColor(skill.proficiency.level)} capitalize`}>
                                                                            {skill.proficiency.level}
                                                                        </Badge>
                                                                    </div>
                                                                    {skill.proficiency.score !== undefined && (
                                                                        <div className="space-y-1">
                                                                            <Progress value={skill.proficiency.score} className="h-2" />
                                                                            <p className="text-xs text-muted-foreground text-right">
                                                                                Score: {skill.proficiency.score}/100
                                                                            </p>
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* Quick Stats */}
                                                                <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-muted-foreground">
                                                                    {skill.experience?.yearsOfExperience !== undefined && (
                                                                        <span className="flex items-center gap-1">
                                                                            <Calendar className="h-4 w-4" />
                                                                            {skill.experience.yearsOfExperience} {skill.experience.yearsOfExperience === 1 ? 'year' : 'years'}
                                                                        </span>
                                                                    )}
                                                                    {skill.experience?.totalProjects !== undefined && skill.experience.totalProjects > 0 && (
                                                                        <span className="flex items-center gap-1">
                                                                            <Briefcase className="h-4 w-4" />
                                                                            {skill.experience.totalProjects} {skill.experience.totalProjects === 1 ? 'project' : 'projects'}
                                                                        </span>
                                                                    )}
                                                                    {skill.endorsements && skill.endorsements.length > 0 && (
                                                                        <span className="flex items-center gap-1">
                                                                            <Users className="h-4 w-4" />
                                                                            {skill.endorsements.length} {skill.endorsements.length === 1 ? 'endorsement' : 'endorsements'}
                                                                        </span>
                                                                    )}
                                                                    {skill.training?.coursesCompleted && skill.training.coursesCompleted.length > 0 && (
                                                                        <span className="flex items-center gap-1">
                                                                            <GraduationCap className="h-4 w-4" />
                                                                            {skill.training.coursesCompleted.length} {skill.training.coursesCompleted.length === 1 ? 'course' : 'courses'}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Action Buttons */}
                                                            <div className="flex items-center gap-1 ml-4">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={() => toggleSkillExpansion(skill._id)}
                                                                    className="h-8 w-8"
                                                                >
                                                                    {isExpanded ? (
                                                                        <ChevronUp className="h-4 w-4" />
                                                                    ) : (
                                                                        <ChevronDown className="h-4 w-4" />
                                                                    )}
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={() => handleOpenDialog(skill)}
                                                                    className="h-8 w-8"
                                                                >
                                                                    <Edit className="h-4 w-4" />
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={() => handleDeleteSkill(skill)}
                                                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </CardHeader>

                                                    {/* Expanded Details */}
                                                    {isExpanded && (
                                                        <CardContent className="pt-0">
                                                            <Separator className="mb-4" />
                                                            
                                                            <Tabs defaultValue="proficiency" className="w-full">
                                                                <TabsList className="grid w-full grid-cols-5">
                                                                    <TabsTrigger value="proficiency">Proficiency</TabsTrigger>
                                                                    <TabsTrigger value="experience">Experience</TabsTrigger>
                                                                    <TabsTrigger value="goals">Goals</TabsTrigger>
                                                                    <TabsTrigger value="training">Training</TabsTrigger>
                                                                    <TabsTrigger value="market">Market</TabsTrigger>
                                                                </TabsList>

                                                                {/* Proficiency Tab */}
                                                                <TabsContent value="proficiency" className="space-y-4">
                                                                    {skill.proficiency.selfAssessment && (
                                                                        <div className="space-y-2">
                                                                            <h4 className="font-medium flex items-center gap-2">
                                                                                <Award className="h-4 w-4" />
                                                                                Self Assessment
                                                                            </h4>
                                                                            <div className="bg-muted p-3 rounded-md space-y-2">
                                                                                <div className="flex items-center justify-between">
                                                                                    <span className="text-sm">Level: <strong className="capitalize">{skill.proficiency.selfAssessment.level}</strong></span>
                                                                                    <span className="text-sm">Score: <strong>{skill.proficiency.selfAssessment.score}/100</strong></span>
                                                                                </div>
                                                                                <p className="text-sm text-muted-foreground">
                                                                                    Assessed on {formatDate(skill.proficiency.selfAssessment.assessedAt)}
                                                                                </p>
                                                                                {skill.proficiency.selfAssessment.notes && (
                                                                                    <p className="text-sm mt-2 italic">
                                                                                        "{skill.proficiency.selfAssessment.notes}"
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {skill.proficiency.managerAssessment && (
                                                                        <div className="space-y-2">
                                                                            <h4 className="font-medium flex items-center gap-2">
                                                                                <CheckCircle className="h-4 w-4 text-blue-600" />
                                                                                Manager Assessment
                                                                            </h4>
                                                                            <div className="bg-blue-50 p-3 rounded-md space-y-2">
                                                                                <div className="flex items-center justify-between">
                                                                                    <span className="text-sm">Level: <strong className="capitalize">{skill.proficiency.managerAssessment.level}</strong></span>
                                                                                    <span className="text-sm">Score: <strong>{skill.proficiency.managerAssessment.score}/100</strong></span>
                                                                                </div>
                                                                                <p className="text-sm text-muted-foreground">
                                                                                    Assessed on {formatDate(skill.proficiency.managerAssessment.assessedAt)}
                                                                                </p>
                                                                                {skill.proficiency.managerAssessment.notes && (
                                                                                    <p className="text-sm mt-2 italic">
                                                                                        "{skill.proficiency.managerAssessment.notes}"
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {skill.proficiency.peerAssessments && skill.proficiency.peerAssessments.length > 0 && (
                                                                        <div className="space-y-2">
                                                                            <h4 className="font-medium flex items-center gap-2">
                                                                                <Users className="h-4 w-4 text-indigo-600" />
                                                                                Peer Assessments ({skill.proficiency.peerAssessments.length})
                                                                            </h4>
                                                                            <div className="space-y-2">
                                                                                {skill.proficiency.peerAssessments.map((assessment: any, idx: number) => (
                                                                                    <div key={idx} className="bg-indigo-50 p-3 rounded-md">
                                                                                        <div className="flex items-center justify-between">
                                                                                            <span className="text-sm capitalize">{assessment.level}</span>
                                                                                            <span className="text-sm">{assessment.score}/100</span>
                                                                                        </div>
                                                                                        {assessment.notes && (
                                                                                            <p className="text-sm mt-1 italic">"{assessment.notes}"</p>
                                                                                        )}
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {skill.proficiency.certificationBased?.certified && (
                                                                        <div className="space-y-2">
                                                                            <h4 className="font-medium flex items-center gap-2">
                                                                                <GraduationCap className="h-4 w-4 text-green-600" />
                                                                                Certification
                                                                            </h4>
                                                                            <div className="bg-green-50 p-3 rounded-md">
                                                                                <p className="text-sm font-medium">{skill.proficiency.certificationBased.certificationName || 'Certified'}</p>
                                                                                {skill.proficiency.certificationBased.certificationId && (
                                                                                    <p className="text-sm text-muted-foreground">ID: {skill.proficiency.certificationBased.certificationId}</p>
                                                                                )}
                                                                                {skill.proficiency.certificationBased.earnedAt && (
                                                                                    <p className="text-sm text-muted-foreground">Earned: {formatDate(skill.proficiency.certificationBased.earnedAt)}</p>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </TabsContent>

                                                                {/* Experience Tab */}
                                                                <TabsContent value="experience" className="space-y-4">
                                                                    <div className="grid grid-cols-2 gap-4">
                                                                        <div>
                                                                            <p className="text-sm text-muted-foreground">Experience Duration</p>
                                                                            <p className="text-lg font-semibold">
                                                                                {skill.experience?.yearsOfExperience || 0} years, {skill.experience?.monthsOfExperience || 0} months
                                                                            </p>
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-sm text-muted-foreground">Total Projects</p>
                                                                            <p className="text-lg font-semibold">{skill.experience?.totalProjects || 0}</p>
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-sm text-muted-foreground">First Used</p>
                                                                            <p className="text-sm">{formatDate(skill.experience?.firstUsed)}</p>
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-sm text-muted-foreground">Last Used</p>
                                                                            <p className="text-sm">{formatDate(skill.experience?.lastUsed)}</p>
                                                                        </div>
                                                                    </div>

                                                                    {skill.experience?.totalHours && skill.experience.totalHours > 0 && (
                                                                        <div>
                                                                            <p className="text-sm text-muted-foreground">Total Hours Logged</p>
                                                                            <p className="text-lg font-semibold">{skill.experience.totalHours.toLocaleString()} hours</p>
                                                                        </div>
                                                                    )}

                                                                    {skill.experience?.contexts && skill.experience.contexts.length > 0 && (
                                                                        <div className="space-y-2">
                                                                            <h4 className="font-medium">Usage Contexts</h4>
                                                                            <div className="flex flex-wrap gap-2">
                                                                                {skill.experience.contexts.map((ctx, idx) => (
                                                                                    <Badge key={idx} variant="outline">
                                                                                        {CONTEXT_LABELS[ctx.context] || ctx.context}
                                                                                        {ctx.percentage && ` (${ctx.percentage}%)`}
                                                                                    </Badge>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </TabsContent>

                                                                {/* Goals Tab */}
                                                                <TabsContent value="goals" className="space-y-4">
                                                                    {skill.goals?.targetLevel && (
                                                                        <div className="bg-muted p-4 rounded-md space-y-3">
                                                                            <div className="flex items-center justify-between">
                                                                                <div>
                                                                                    <p className="text-sm text-muted-foreground">Target Level</p>
                                                                                    <p className="text-lg font-semibold capitalize">{skill.goals.targetLevel}</p>
                                                                                </div>
                                                                                {skill.goals.targetDate && (
                                                                                    <div className="text-right">
                                                                                        <p className="text-sm text-muted-foreground">Target Date</p>
                                                                                        <p className="text-sm font-semibold">{formatDate(skill.goals.targetDate)}</p>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                            {skill.goals.priority && (
                                                                                <Badge className={
                                                                                    skill.goals.priority === 'critical' ? 'bg-red-100 text-red-800' :
                                                                                    skill.goals.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                                                                                    skill.goals.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                                                                    'bg-gray-100 text-gray-800'
                                                                                }>
                                                                                    Priority: {skill.goals.priority}
                                                                                </Badge>
                                                                            )}
                                                                        </div>
                                                                    )}

                                                                    {skill.goals?.developmentPlan && (
                                                                        <div>
                                                                            <h4 className="font-medium mb-2">Development Plan</h4>
                                                                            <p className="text-sm text-muted-foreground">{skill.goals.developmentPlan}</p>
                                                                        </div>
                                                                    )}

                                                                    {skill.goals?.milestones && skill.goals.milestones.length > 0 && (
                                                                        <div>
                                                                            <h4 className="font-medium mb-2">Milestones</h4>
                                                                            <div className="space-y-2">
                                                                                {skill.goals.milestones.map((milestone, idx) => (
                                                                                    <div key={idx} className="flex items-center justify-between p-2 bg-muted rounded">
                                                                                        <div className="flex items-center gap-2">
                                                                                            {milestone.achieved ? (
                                                                                                <CheckCircle className="h-4 w-4 text-green-600" />
                                                                                            ) : (
                                                                                                <div className="h-4 w-4 rounded-full border-2 border-muted-foreground" />
                                                                                            )}
                                                                                            <span className="text-sm">{milestone.milestone || 'Milestone'}</span>
                                                                                        </div>
                                                                                        <span className="text-xs text-muted-foreground">
                                                                                            {formatDate(milestone.targetDate)}
                                                                                        </span>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {skill.goals?.blockers && skill.goals.blockers.length > 0 && (
                                                                        <div>
                                                                            <h4 className="font-medium mb-2 text-orange-600">Current Blockers</h4>
                                                                            <div className="space-y-2">
                                                                                {skill.goals.blockers.filter(b => !b.resolved).map((blocker, idx) => (
                                                                                    <div key={idx} className="p-2 bg-orange-50 border border-orange-200 rounded">
                                                                                        <p className="text-sm">{blocker.description}</p>
                                                                                        <p className="text-xs text-muted-foreground mt-1">
                                                                                            Identified: {formatDate(blocker.identifiedAt)}
                                                                                        </p>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </TabsContent>

                                                                {/* Training Tab */}
                                                                <TabsContent value="training" className="space-y-4">
                                                                    {skill.training?.coursesCompleted && skill.training.coursesCompleted.length > 0 && (
                                                                        <div>
                                                                            <h4 className="font-medium mb-2 flex items-center gap-2">
                                                                                <CheckCircle className="h-4 w-4 text-green-600" />
                                                                                Completed Courses ({skill.training.coursesCompleted.length})
                                                                            </h4>
                                                                            <div className="space-y-2">
                                                                                {skill.training.coursesCompleted.map((course: any, idx: number) => (
                                                                                    <div key={idx} className="p-3 bg-green-50 rounded-md">
                                                                                        <p className="font-medium text-sm">{course.courseName}</p>
                                                                                        <p className="text-xs text-muted-foreground">{course.provider}</p>
                                                                                        {course.completedAt && (
                                                                                            <p className="text-xs text-muted-foreground">Completed: {formatDate(course.completedAt)}</p>
                                                                                        )}
                                                                                        {course.score && <p className="text-xs">Score: {course.score}%</p>}
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {skill.training?.currentlyEnrolled && skill.training.currentlyEnrolled.length > 0 && (
                                                                        <div>
                                                                            <h4 className="font-medium mb-2 flex items-center gap-2">
                                                                                <BookOpen className="h-4 w-4 text-blue-600" />
                                                                                Currently Enrolled ({skill.training.currentlyEnrolled.length})
                                                                            </h4>
                                                                            <div className="space-y-2">
                                                                                {skill.training.currentlyEnrolled.map((course: any, idx: number) => (
                                                                                    <div key={idx} className="p-3 bg-blue-50 rounded-md">
                                                                                        <p className="font-medium text-sm">{course.courseName}</p>
                                                                                        <p className="text-xs text-muted-foreground">{course.provider}</p>
                                                                                        {course.progress && (
                                                                                            <div className="mt-2">
                                                                                                <Progress value={course.progress} className="h-2" />
                                                                                                <p className="text-xs text-muted-foreground mt-1">{course.progress}% complete</p>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {skill.training?.recommendedCourses && skill.training.recommendedCourses.length > 0 && (
                                                                        <div>
                                                                            <h4 className="font-medium mb-2 flex items-center gap-2">
                                                                                <Target className="h-4 w-4 text-purple-600" />
                                                                                Recommended Courses ({skill.training.recommendedCourses.length})
                                                                            </h4>
                                                                            <div className="space-y-2">
                                                                                {skill.training.recommendedCourses.map((course: any, idx: number) => (
                                                                                    <div key={idx} className="p-3 bg-purple-50 rounded-md">
                                                                                        <div className="flex items-start justify-between">
                                                                                            <div>
                                                                                                <p className="font-medium text-sm">{course.courseName}</p>
                                                                                                <p className="text-xs text-muted-foreground">{course.provider}</p>
                                                                                                {course.reason && (
                                                                                                    <p className="text-xs mt-1 italic">"{course.reason}"</p>
                                                                                                )}
                                                                                            </div>
                                                                                            {course.priority && (
                                                                                                <Badge className="capitalize">{course.priority}</Badge>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </TabsContent>

                                                                {/* Market Tab */}
                                                                <TabsContent value="market" className="space-y-4">
                                                                    {skill.marketData && (
                                                                        <>
                                                                            <div className="grid grid-cols-2 gap-4">
                                                                                {skill.marketData.demandLevel && (
                                                                                    <div>
                                                                                        <p className="text-sm text-muted-foreground">Demand Level</p>
                                                                                        <Badge className={
                                                                                            skill.marketData.demandLevel === 'critical' ? 'bg-red-100 text-red-800' :
                                                                                            skill.marketData.demandLevel === 'high' ? 'bg-green-100 text-green-800' :
                                                                                            skill.marketData.demandLevel === 'moderate' ? 'bg-yellow-100 text-yellow-800' :
                                                                                            'bg-gray-100 text-gray-800'
                                                                                        }>
                                                                                            {skill.marketData.demandLevel}
                                                                                        </Badge>
                                                                                    </div>
                                                                                )}

                                                                                {skill.marketData.trendDirection && (
                                                                                    <div>
                                                                                        <p className="text-sm text-muted-foreground">Trend Direction</p>
                                                                                        <Badge className={
                                                                                            skill.marketData.trendDirection === 'emerging' ? 'bg-purple-100 text-purple-800' :
                                                                                            skill.marketData.trendDirection === 'growing' ? 'bg-green-100 text-green-800' :
                                                                                            skill.marketData.trendDirection === 'stable' ? 'bg-blue-100 text-blue-800' :
                                                                                            'bg-orange-100 text-orange-800'
                                                                                        }>
                                                                                            {skill.marketData.trendDirection}
                                                                                        </Badge>
                                                                                    </div>
                                                                                )}
                                                                            </div>

                                                                            {skill.marketData.marketRate && (
                                                                                <div className="p-4 bg-muted rounded-md">
                                                                                    <p className="text-sm text-muted-foreground mb-2">Market Rate ({skill.marketData.marketRate.currency || 'USD'})</p>
                                                                                    <div className="flex items-center gap-4">
                                                                                        {skill.marketData.marketRate.min && (
                                                                                            <div>
                                                                                                <p className="text-xs text-muted-foreground">Minimum</p>
                                                                                                <p className="text-lg font-semibold">${skill.marketData.marketRate.min.toLocaleString()}</p>
                                                                                            </div>
                                                                                        )}
                                                                                        {skill.marketData.marketRate.average && (
                                                                                            <div>
                                                                                                <p className="text-xs text-muted-foreground">Average</p>
                                                                                                <p className="text-lg font-semibold">${skill.marketData.marketRate.average.toLocaleString()}</p>
                                                                                            </div>
                                                                                        )}
                                                                                        {skill.marketData.marketRate.max && (
                                                                                            <div>
                                                                                                <p className="text-xs text-muted-foreground">Maximum</p>
                                                                                                <p className="text-lg font-semibold">${skill.marketData.marketRate.max.toLocaleString()}</p>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            )}

                                                                            {skill.marketData.competitiveness && (
                                                                                <div>
                                                                                    <p className="text-sm text-muted-foreground">Market Competitiveness</p>
                                                                                    <Badge className="capitalize mt-1">{skill.marketData.competitiveness.replace('_', ' ')}</Badge>
                                                                                </div>
                                                                            )}

                                                                            {skill.marketData.lastMarketUpdate && (
                                                                                <p className="text-xs text-muted-foreground">
                                                                                    Last updated: {formatDate(skill.marketData.lastMarketUpdate)}
                                                                                </p>
                                                                            )}
                                                                        </>
                                                                    )}

                                                                    {!skill.marketData && (
                                                                        <div className="text-center py-8">
                                                                            <TrendingUp className="h-12 w-12 text-muted-foreground/40 mx-auto mb-2" />
                                                                            <p className="text-sm text-muted-foreground">
                                                                                No market data available for this skill
                                                                            </p>
                                                                        </div>
                                                                    )}
                                                                </TabsContent>
                                                            </Tabs>

                                                            {/* Endorsements Section */}
                                                            {skill.endorsements && skill.endorsements.length > 0 && (
                                                                <>
                                                                    <Separator className="my-4" />
                                                                    <div>
                                                                        <h4 className="font-medium mb-3 flex items-center gap-2">
                                                                            <Users className="h-4 w-4" />
                                                                            Endorsements ({skill.endorsements.length})
                                                                        </h4>
                                                                        <div className="space-y-2">
                                                                            {skill.endorsements.filter(e => e.visible !== false).map((endorsement, idx) => (
                                                                                <div key={idx} className="p-3 bg-muted rounded-md">
                                                                                    <div className="flex items-start justify-between mb-1">
                                                                                        <div>
                                                                                            <p className="font-medium text-sm">{endorsement.endorserName || 'Anonymous'}</p>
                                                                                            {endorsement.endorserTitle && (
                                                                                                <p className="text-xs text-muted-foreground">{endorsement.endorserTitle}</p>
                                                                                            )}
                                                                                        </div>
                                                                                        <div className="text-right">
                                                                                            {endorsement.rating && (
                                                                                                <div className="flex items-center gap-1">
                                                                                                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                                                                                    <span className="text-sm font-medium">{endorsement.rating}/5</span>
                                                                                                </div>
                                                                                            )}
                                                                                            {endorsement.relationship && (
                                                                                                <Badge variant="outline" className="text-xs mt-1">
                                                                                                    {endorsement.relationship}
                                                                                                </Badge>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                    {endorsement.comment && (
                                                                                        <p className="text-sm mt-2 italic">"{endorsement.comment}"</p>
                                                                                    )}
                                                                                    <p className="text-xs text-muted-foreground mt-1">
                                                                                        {formatDate(endorsement.endorsedAt)}
                                                                                    </p>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                </>
                                                            )}

                                                            {/* Metadata Footer */}
                                                            <Separator className="my-4" />
                                                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                                                <span>Created: {formatDate(skill.createdAt)}</span>
                                                                <span>Last Updated: {formatDate(skill.updatedAt)}</span>
                                                                {skill.metadata?.source && (
                                                                    <Badge variant="outline" className="text-xs">
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

            {/* Add/Edit Skill Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{isEditMode ? 'Edit Skill' : 'Add New Skill'}</DialogTitle>
                        <DialogDescription>
                            {isEditMode ? 'Update your skill information' : 'Add a new skill to your professional profile'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Skill Name *</Label>
                            <Input
                                id="name"
                                value={skillForm.name}
                                onChange={(e) => setSkillForm({ ...skillForm, name: e.target.value })}
                                placeholder="e.g., React, Python, Project Management"
                                disabled={isEditMode}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="category">Category *</Label>
                            <Select
                                value={skillForm.category}
                                onValueChange={(value) => setSkillForm({ ...skillForm, category: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {SKILL_CATEGORIES.map(cat => (
                                        <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="proficiencyLevel">Proficiency Level *</Label>
                            <Select
                                value={skillForm.proficiencyLevel}
                                onValueChange={(value) => setSkillForm({ ...skillForm, proficiencyLevel: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {PROFICIENCY_LEVELS.map(level => (
                                        <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="yearsOfExperience">Years of Experience</Label>
                            <Input
                                id="yearsOfExperience"
                                type="number"
                                min="0"
                                max="50"
                                value={skillForm.yearsOfExperience}
                                onChange={(e) => setSkillForm({ ...skillForm, yearsOfExperience: parseInt(e.target.value) || 0 })}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="lastUsed">Last Used</Label>
                            <Input
                                id="lastUsed"
                                type="date"
                                value={skillForm.lastUsed}
                                onChange={(e) => setSkillForm({ ...skillForm, lastUsed: e.target.value })}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={handleCloseDialog}>
                            Cancel
                        </Button>
                        <Button onClick={handleSubmit}>
                            {isEditMode ? 'Update Skill' : 'Add Skill'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}