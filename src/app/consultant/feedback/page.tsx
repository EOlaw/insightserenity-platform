'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Star,
    TrendingUp,
    Users,
    UserCheck,
    Building2,
    MessageSquare,
    ArrowLeft,
    Loader2,
    Filter,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { consultantApi, type ConsultantProfile, type Feedback } from '@/lib/api/consultant'

const FEEDBACK_TYPES = [
    { value: 'all', label: 'All Types' },
    { value: 'client', label: 'Client Feedback', icon: Building2 },
    { value: 'peer', label: 'Peer Feedback', icon: Users },
    { value: 'manager', label: 'Manager Feedback', icon: UserCheck },
    { value: 'direct_report', label: 'Direct Report Feedback', icon: MessageSquare },
    { value: 'self', label: 'Self Assessment', icon: Star },
]

export default function FeedbackPage() {
    const router = useRouter()
    const [consultant, setConsultant] = useState<ConsultantProfile | null>(null)
    const [feedback, setFeedback] = useState<Feedback[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [typeFilter, setTypeFilter] = useState<string>('all')

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        setIsLoading(true)

        try {
            const profileData = await consultantApi.getMyProfile()
            setConsultant(profileData)
            setFeedback(profileData.performance?.feedback || [])
            
            console.log('Loaded feedback:', profileData.performance?.feedback?.length || 0)
        } catch (error: any) {
            console.error('Failed to load feedback:', error)
            toast.error('Failed to load feedback')

            if (error.response?.status === 401) {
                router.push('/login')
            }
        } finally {
            setIsLoading(false)
        }
    }

    const getFeedbackTypeBadge = (type: string) => {
        const typeConfig: Record<string, { variant: 'default' | 'secondary' | 'outline' }> = {
            client: { variant: 'default' },
            peer: { variant: 'secondary' },
            manager: { variant: 'default' },
            direct_report: { variant: 'outline' },
            self: { variant: 'secondary' },
        }

        const config = typeConfig[type] || typeConfig.peer
        return <Badge variant={config.variant} className="capitalize">{type.replace('_', ' ')}</Badge>
    }

    const calculateAverageRating = (feedbackList: Feedback[]) => {
        const ratingsWithValues = feedbackList.filter(f => f.rating !== undefined && f.rating !== null)
        if (ratingsWithValues.length === 0) return 0

        const sum = ratingsWithValues.reduce((acc, f) => acc + (f.rating || 0), 0)
        return (sum / ratingsWithValues.length).toFixed(1)
    }

    const filteredFeedback = typeFilter === 'all'
        ? feedback
        : feedback.filter(f => f.type === typeFilter)

    const clientFeedback = feedback.filter(f => f.type === 'client')
    const peerFeedback = feedback.filter(f => f.type === 'peer')
    const managerFeedback = feedback.filter(f => f.type === 'manager')

    const averageRating = calculateAverageRating(feedback)
    const averageClientRating = calculateAverageRating(clientFeedback)
    const averagePeerRating = calculateAverageRating(peerFeedback)
    const averageManagerRating = calculateAverageRating(managerFeedback)

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center space-y-3">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                    <p className="text-sm text-muted-foreground">Loading feedback...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Link href="/consultant/dashboard">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold">Performance Feedback</h1>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            View feedback from clients, peers, and managers
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Overall Rating</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <div className="text-2xl font-bold">{averageRating}</div>
                            <Star className="h-5 w-5 fill-primary text-primary" />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Based on {feedback.filter(f => f.rating).length} reviews
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Client Rating</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <div className="text-2xl font-bold">{averageClientRating || 'N/A'}</div>
                            {averageClientRating && <Building2 className="h-4 w-4 text-muted-foreground" />}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {clientFeedback.length} reviews
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Peer Rating</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <div className="text-2xl font-bold">{averagePeerRating || 'N/A'}</div>
                            {averagePeerRating && <Users className="h-4 w-4 text-muted-foreground" />}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {peerFeedback.length} reviews
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Manager Rating</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <div className="text-2xl font-bold">{averageManagerRating || 'N/A'}</div>
                            {averageManagerRating && <UserCheck className="h-4 w-4 text-muted-foreground" />}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {managerFeedback.length} reviews
                        </p>
                    </CardContent>
                </Card>
            </div>

            {consultant?.performance?.rating && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Performance Ratings</CardTitle>
                        <CardDescription>
                            Your performance across different competencies
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-4 md:grid-cols-2">
                            {consultant.performance.rating.overall !== undefined && (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium">Overall Performance</span>
                                        <span className="text-sm font-bold">{consultant.performance.rating.overall.toFixed(1)}/5.0</span>
                                    </div>
                                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary transition-all"
                                            style={{ width: `${(consultant.performance.rating.overall / 5) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {consultant.performance.rating.technical !== undefined && (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium">Technical Skills</span>
                                        <span className="text-sm font-bold">{consultant.performance.rating.technical.toFixed(1)}/5.0</span>
                                    </div>
                                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary transition-all"
                                            style={{ width: `${(consultant.performance.rating.technical / 5) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {consultant.performance.rating.communication !== undefined && (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium">Communication</span>
                                        <span className="text-sm font-bold">{consultant.performance.rating.communication.toFixed(1)}/5.0</span>
                                    </div>
                                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary transition-all"
                                            style={{ width: `${(consultant.performance.rating.communication / 5) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {consultant.performance.rating.leadership !== undefined && (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium">Leadership</span>
                                        <span className="text-sm font-bold">{consultant.performance.rating.leadership.toFixed(1)}/5.0</span>
                                    </div>
                                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary transition-all"
                                            style={{ width: `${(consultant.performance.rating.leadership / 5) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {consultant.performance.rating.clientSatisfaction !== undefined && (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium">Client Satisfaction</span>
                                        <span className="text-sm font-bold">{consultant.performance.rating.clientSatisfaction.toFixed(1)}/5.0</span>
                                    </div>
                                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary transition-all"
                                            style={{ width: `${(consultant.performance.rating.clientSatisfaction / 5) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-base">Feedback History</CardTitle>
                            <CardDescription className="mt-1">
                                Detailed feedback from various sources
                            </CardDescription>
                        </div>
                        <Select value={typeFilter} onValueChange={setTypeFilter}>
                            <SelectTrigger className="w-[160px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {FEEDBACK_TYPES.map(type => (
                                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    {filteredFeedback.length === 0 ? (
                        <div className="text-center py-12">
                            <MessageSquare className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
                            <h3 className="font-semibold mb-2">No feedback yet</h3>
                            <p className="text-sm text-muted-foreground">
                                {typeFilter === 'all'
                                    ? 'Feedback from clients, peers, and managers will appear here'
                                    : `No ${typeFilter} feedback available`}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {filteredFeedback
                                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                                .map((item) => (
                                    <Card key={item._id}>
                                        <CardContent className="pt-6">
                                            <div className="space-y-3">
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            {getFeedbackTypeBadge(item.type)}
                                                            {item.rating && (
                                                                <div className="flex items-center gap-1">
                                                                    {Array.from({ length: 5 }).map((_, i) => (
                                                                        <Star
                                                                            key={i}
                                                                            className={`h-3.5 w-3.5 ${i < item.rating!
                                                                                    ? 'fill-primary text-primary'
                                                                                    : 'text-muted-foreground/20'
                                                                                }`}
                                                                        />
                                                                    ))}
                                                                    <span className="text-sm font-medium ml-1">{item.rating.toFixed(1)}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        {!item.isAnonymous && item.source?.userId && (
                                                            <p className="text-xs text-muted-foreground mb-2">
                                                                Source ID: {item.source.userId}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <span className="text-xs text-muted-foreground">
                                                        {new Date(item.createdAt).toLocaleDateString()}
                                                    </span>
                                                </div>

                                                {item.categories && Object.keys(item.categories).length > 0 && (
                                                    <div className="grid gap-2 md:grid-cols-2">
                                                        {Object.entries(item.categories).map(([category, rating]) => (
                                                            <div key={category} className="flex items-center justify-between text-sm">
                                                                <span className="text-muted-foreground capitalize">
                                                                    {category.replace('_', ' ')}
                                                                </span>
                                                                <div className="flex items-center gap-1">
                                                                    {Array.from({ length: 5 }).map((_, i) => (
                                                                        <Star
                                                                            key={i}
                                                                            className={`h-3 w-3 ${i < rating
                                                                                    ? 'fill-primary text-primary'
                                                                                    : 'text-muted-foreground/20'
                                                                                }`}
                                                                        />
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                <div className="pt-2 border-t">
                                                    <p className="text-sm">{item.content}</p>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}