'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
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
} from 'lucide-react'
import toast from 'react-hot-toast'
import { consultantApi, type ConsultantProfile, type Skill } from '@/lib/api/consultant'

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
    { value: 'backend_technology', label: 'Backend Technology' },
    { value: 'other', label: 'Other' },
]

const PROFICIENCY_LEVELS = [
    { value: 'beginner', label: 'Beginner' },
    { value: 'intermediate', label: 'Intermediate' },
    { value: 'advanced', label: 'Advanced' },
    { value: 'expert', label: 'Expert' },
    { value: 'master', label: 'Master' },
]

export default function SkillsManagementPage() {
    const router = useRouter()
    const [consultant, setConsultant] = useState<ConsultantProfile | null>(null)
    const [skills, setSkills] = useState<Skill[]>([])
    const [filteredSkills, setFilteredSkills] = useState<Skill[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [isEditMode, setIsEditMode] = useState(false)
    const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [categoryFilter, setCategoryFilter] = useState<string>('all')
    const [proficiencyFilter, setProficiencyFilter] = useState<string>('all')

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

    const loadData = async () => {
        setIsLoading(true)

        try {
            const data = await consultantApi.getMyProfile()
            setConsultant(data)
            setSkills(data.skills || [])
            toast.success('Skills loaded successfully')
        } catch (error: any) {
            console.error('Failed to load skills:', error)
            toast.error('Failed to load skills')

            if (error.response?.status === 401) {
                router.push('/login')
            }
        } finally {
            setIsLoading(false)
        }
    }

    const filterSkills = () => {
        let filtered = [...skills]

        if (searchTerm) {
            filtered = filtered.filter(skill =>
                skill.name.toLowerCase().includes(searchTerm.toLowerCase())
            )
        }

        if (categoryFilter !== 'all') {
            filtered = filtered.filter(skill => skill.category === categoryFilter)
        }

        if (proficiencyFilter !== 'all') {
            filtered = filtered.filter(skill => skill.proficiencyLevel === proficiencyFilter)
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

    const handleOpenDialog = (skill?: Skill) => {
        if (skill) {
            setIsEditMode(true)
            setSelectedSkill(skill)
            setSkillForm({
                name: skill.name,
                category: skill.category,
                proficiencyLevel: skill.proficiencyLevel,
                yearsOfExperience: skill.yearsOfExperience || 0,
                lastUsed: skill.lastUsed ? new Date(skill.lastUsed).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
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
            if (isEditMode && selectedSkill) {
                await consultantApi.updateSkill(consultant._id, selectedSkill.name, {
                    category: skillForm.category as any,
                    proficiencyLevel: skillForm.proficiencyLevel as any,
                    yearsOfExperience: skillForm.yearsOfExperience,
                    lastUsed: skillForm.lastUsed,
                })
                toast.success('Skill updated successfully')
            } else {
                await consultantApi.addSkill(consultant._id, {
                    name: skillForm.name,
                    category: skillForm.category as any,
                    proficiencyLevel: skillForm.proficiencyLevel as any,
                    yearsOfExperience: skillForm.yearsOfExperience,
                    lastUsed: skillForm.lastUsed,
                })
                toast.success('Skill added successfully')
            }

            handleCloseDialog()
            await loadData()
        } catch (error: any) {
            console.error('Failed to save skill:', error)
            toast.error(error.response?.data?.message || 'Failed to save skill')
        }
    }

    const handleDeleteSkill = async (skill: Skill) => {
        if (!consultant?._id) {
            toast.error('Consultant ID not found')
            return
        }

        if (!confirm(`Are you sure you want to remove "${skill.name}" from your skills?`)) {
            return
        }

        try {
            await consultantApi.removeSkill(consultant._id, skill.name)
            toast.success('Skill removed successfully')
            await loadData()
        } catch (error: any) {
            console.error('Failed to delete skill:', error)
            toast.error(error.response?.data?.message || 'Failed to delete skill')
        }
    }

    const getSkillsByCategory = () => {
        const grouped: Record<string, Skill[]> = {}

        filteredSkills.forEach(skill => {
            if (!grouped[skill.category]) {
                grouped[skill.category] = []
            }
            grouped[skill.category].push(skill)
        })

        return grouped
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center space-y-3">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                    <p className="text-sm text-muted-foreground">Loading skills...</p>
                </div>
            </div>
        )
    }

    const groupedSkills = getSkillsByCategory()

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Link href="/dashboard/consultant">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold">Skills Management</h1>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Manage and showcase your professional skills and expertise
                        </p>
                    </div>
                </div>
                <Button onClick={() => handleOpenDialog()} size="sm">
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    Add Skill
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Total Skills</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{skills.length}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Verified</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {skills.filter(s => s.verified).length}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Expert Level</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {skills.filter(s => s.proficiencyLevel === 'expert' || s.proficiencyLevel === 'master').length}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Categories</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {new Set(skills.map(s => s.category)).size}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row gap-3">
                        <div className="flex-1">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search skills..."
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

            {filteredSkills.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <Star className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
                        <h3 className="font-semibold mb-2">No skills found</h3>
                        <p className="text-sm text-muted-foreground mb-6">
                            {searchTerm || categoryFilter !== 'all' || proficiencyFilter !== 'all'
                                ? 'Try adjusting your filters'
                                : 'Start building your skill profile by adding your first skill'}
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
                                        <Badge variant="secondary">{categorySkills.length}</Badge>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid gap-3 md:grid-cols-2">
                                        {categorySkills
                                            .sort((a, b) => {
                                                const levelOrder = { master: 5, expert: 4, advanced: 3, intermediate: 2, beginner: 1 }
                                                return levelOrder[b.proficiencyLevel] - levelOrder[a.proficiencyLevel]
                                            })
                                            .map((skill) => (
                                                <div key={skill._id || skill.name} className="rounded-lg border p-3 space-y-2">
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <h4 className="text-sm font-medium">{skill.name}</h4>
                                                                {skill.verified && (
                                                                    <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                                                                )}
                                                            </div>
                                                            <Badge variant="outline" className="capitalize text-xs">
                                                                {skill.proficiencyLevel}
                                                            </Badge>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => handleOpenDialog(skill)}
                                                                className="h-7 w-7"
                                                            >
                                                                <Edit className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => handleDeleteSkill(skill)}
                                                                className="h-7 w-7 text-destructive hover:text-destructive"
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                                        {skill.yearsOfExperience !== undefined && (
                                                            <span className="flex items-center gap-1">
                                                                <Calendar className="h-3 w-3" />
                                                                {skill.yearsOfExperience} {skill.yearsOfExperience === 1 ? 'year' : 'years'}
                                                            </span>
                                                        )}
                                                        {skill.endorsements && skill.endorsements.length > 0 && (
                                                            <>
                                                                <span>·</span>
                                                                <span className="flex items-center gap-1">
                                                                    <Award className="h-3 w-3" />
                                                                    {skill.endorsements.length} endorsements
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{isEditMode ? 'Edit Skill' : 'Add New Skill'}</DialogTitle>
                        <DialogDescription>
                            {isEditMode ? 'Update your skill information' : 'Add a new skill to your profile'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="skillName">Skill Name *</Label>
                            <Input
                                id="skillName"
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