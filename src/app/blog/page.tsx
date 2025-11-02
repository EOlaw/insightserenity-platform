'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  FileText,
  Calendar,
  Clock,
  User,
  Tag,
  Search,
  Filter,
  ArrowRight,
  TrendingUp,
  Briefcase,
  Shield,
  Database,
  Code,
  Users,
  Building2,
  Rocket,
  Bot,
  Globe,
  BarChart3,
  MessageSquare,
  BookOpen,
  Coffee,
  Heart,
  Share2,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Rss,
  Mail,
} from 'lucide-react'

const blogPosts = [
  {
    id: 1,
    title: 'Introducing AI-Powered Analytics: Transform Your Data into Insights',
    excerpt: 'Discover how our new AI-powered analytics engine helps you uncover hidden patterns and make data-driven decisions faster than ever before.',
    author: 'Sarah Chen',
    authorRole: 'Head of Product',
    date: '2024-01-20',
    readTime: '8 min read',
    category: 'Product Updates',
    tags: ['AI', 'Analytics', 'Machine Learning'],
    image: '/blog/ai-analytics.jpg',
    featured: true,
  },
  {
    id: 2,
    title: 'How TechCorp Increased Productivity by 40% Using Our Platform',
    excerpt: 'Learn how TechCorp streamlined their consulting operations and achieved remarkable efficiency gains with our enterprise solution.',
    author: 'Michael Rodriguez',
    authorRole: 'Customer Success Manager',
    date: '2024-01-18',
    readTime: '6 min read',
    category: 'Case Studies',
    tags: ['Customer Success', 'Productivity', 'Enterprise'],
    image: '/blog/case-study.jpg',
    featured: true,
  },
  {
    id: 3,
    title: 'Best Practices for Multi-Tenant Architecture in 2024',
    excerpt: 'A deep dive into building scalable, secure multi-tenant applications with practical examples and implementation strategies.',
    author: 'David Kim',
    authorRole: 'Chief Architect',
    date: '2024-01-15',
    readTime: '12 min read',
    category: 'Engineering',
    tags: ['Architecture', 'Security', 'Scalability'],
    image: '/blog/architecture.jpg',
    featured: false,
  },
  {
    id: 4,
    title: 'The Future of Recruitment: AI and Automation Trends',
    excerpt: 'Explore the latest trends in recruitment technology and how AI is reshaping the hiring landscape for enterprises.',
    author: 'Emily Wilson',
    authorRole: 'VP of HR Tech',
    date: '2024-01-12',
    readTime: '7 min read',
    category: 'Industry Insights',
    tags: ['Recruitment', 'AI', 'Trends'],
    image: '/blog/recruitment.jpg',
    featured: false,
  },
  {
    id: 5,
    title: 'Security Best Practices for Enterprise SaaS Applications',
    excerpt: 'Essential security measures every enterprise should implement to protect their data and maintain compliance.',
    author: 'James Thompson',
    authorRole: 'Security Engineer',
    date: '2024-01-10',
    readTime: '10 min read',
    category: 'Security',
    tags: ['Security', 'Compliance', 'Best Practices'],
    image: '/blog/security.jpg',
    featured: false,
  },
  {
    id: 6,
    title: 'Announcing Our Series B Funding and What It Means for You',
    excerpt: 'We\'re excited to announce our $50M Series B funding round and share our vision for the platform\'s future.',
    author: 'John Smith',
    authorRole: 'CEO',
    date: '2024-01-08',
    readTime: '5 min read',
    category: 'Company News',
    tags: ['Funding', 'Growth', 'Company'],
    image: '/blog/funding.jpg',
    featured: true,
  },
  {
    id: 7,
    title: 'Building High-Performance Teams in Remote Environments',
    excerpt: 'Practical strategies for managing and scaling distributed teams while maintaining culture and productivity.',
    author: 'Lisa Anderson',
    authorRole: 'Head of People Operations',
    date: '2024-01-05',
    readTime: '9 min read',
    category: 'Leadership',
    tags: ['Remote Work', 'Team Building', 'Management'],
    image: '/blog/teams.jpg',
    featured: false,
  },
  {
    id: 8,
    title: 'API Best Practices: Building Developer-Friendly Integrations',
    excerpt: 'Learn how to design and implement APIs that developers love, with examples from our platform.',
    author: 'Alex Turner',
    authorRole: 'API Product Manager',
    date: '2024-01-03',
    readTime: '11 min read',
    category: 'Engineering',
    tags: ['API', 'Development', 'Integration'],
    image: '/blog/api.jpg',
    featured: false,
  },
]

const categories = [
  'All Posts',
  'Product Updates',
  'Case Studies',
  'Engineering',
  'Industry Insights',
  'Security',
  'Company News',
  'Leadership',
]

const popularTags = [
  'AI',
  'Analytics',
  'Security',
  'Enterprise',
  'API',
  'Remote Work',
  'Productivity',
  'Machine Learning',
  'Architecture',
  'Compliance',
]

const authors = [
  { name: 'Sarah Chen', role: 'Head of Product', posts: 12 },
  { name: 'Michael Rodriguez', role: 'Customer Success Manager', posts: 8 },
  { name: 'David Kim', role: 'Chief Architect', posts: 15 },
  { name: 'Emily Wilson', role: 'VP of HR Tech', posts: 6 },
  { name: 'James Thompson', role: 'Security Engineer', posts: 9 },
]

export default function BlogPage() {
  const [selectedCategory, setSelectedCategory] = useState('All Posts')
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const postsPerPage = 6

  const filteredPosts = blogPosts.filter(post => {
    const matchesCategory = selectedCategory === 'All Posts' || post.category === selectedCategory
    const matchesSearch = post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          post.excerpt.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          post.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
    return matchesCategory && matchesSearch
  })

  const featuredPosts = blogPosts.filter(post => post.featured).slice(0, 3)

  const totalPages = Math.ceil(filteredPosts.length / postsPerPage)
  const startIndex = (currentPage - 1) * postsPerPage
  const endIndex = startIndex + postsPerPage
  const currentPosts = filteredPosts.slice(startIndex, endIndex)

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <Logo href="/" showText={false} />
              <div className="hidden md:flex items-center space-x-6">
                <Link href="/blog" className="text-xs text-primary font-medium">
                  Blog
                </Link>
                <Link href="/resources" className="text-xs text-muted-foreground hover:text-foreground transition">
                  Resources
                </Link>
                <Link href="/docs" className="text-xs text-muted-foreground hover:text-foreground transition">
                  Documentation
                </Link>
                <Link href="/about" className="text-xs text-muted-foreground hover:text-foreground transition">
                  About
                </Link>
                <Link href="/contact" className="text-xs text-muted-foreground hover:text-foreground transition">
                  Contact
                </Link>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Button variant="ghost" size="sm">
                <Rss className="h-3.5 w-3.5 mr-2" />
                RSS Feed
              </Button>
              <Link href="/login">
                <Button variant="ghost" size="sm">Sign in</Button>
              </Link>
              <Link href="/register">
                <Button size="sm">Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-muted/50 to-background py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6 text-foreground">
              Enterprise Platform Blog
            </h1>
            <p className="text-base text-muted-foreground mb-8">
              Insights, updates, and best practices from our team and community.
              Stay informed about the latest in enterprise technology.
            </p>

            {/* Search Bar */}
            <div className="max-w-xl mx-auto relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search articles..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 text-sm border border-border bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Featured Posts */}
      {!searchTerm && selectedCategory === 'All Posts' && (
        <section className="py-16 border-b border-border">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-foreground">Featured Articles</h2>
              <p className="text-sm text-muted-foreground mt-1">Our most popular and impactful content</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {featuredPosts.map((post) => (
                <Card key={post.id} className="hover:shadow-lg transition-shadow">
                  <div className="aspect-video bg-muted rounded-t-lg" />
                  <CardHeader>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">
                        {post.category}
                      </span>
                      <span className="text-xs text-muted-foreground">{post.readTime}</span>
                    </div>
                    <CardTitle className="text-base line-clamp-2">{post.title}</CardTitle>
                    <CardDescription className="text-xs line-clamp-3">
                      {post.excerpt}
                    </CardDescription>
                  </CardHeader>
                  <CardFooter>
                    <Link href={`/blog/${post.id}`} className="text-xs text-primary hover:underline flex items-center">
                      Read more
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Main Content */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Sidebar */}
            <aside className="lg:col-span-1">
              {/* Categories */}
              <div className="mb-8">
                <h3 className="text-sm font-semibold mb-4 text-foreground">Categories</h3>
                <div className="space-y-2">
                  {categories.map((category) => (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(category)}
                      className={`w-full text-left px-3 py-2 text-xs rounded-lg transition ${
                        selectedCategory === category
                          ? 'bg-primary text-black font-medium'
                          : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>

              {/* Popular Tags */}
              <div className="mb-8">
                <h3 className="text-sm font-semibold mb-4 text-foreground">Popular Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {popularTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setSearchTerm(tag)}
                      className="px-3 py-1 text-xs bg-muted hover:bg-muted/80 text-foreground rounded-full transition"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Newsletter Signup */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Stay Updated</CardTitle>
                  <CardDescription className="text-xs">
                    Get the latest articles delivered to your inbox
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="space-y-3">
                    <input
                      type="email"
                      placeholder="Your email"
                      className="w-full px-3 py-2 text-xs border border-border bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <Button size="sm" className="w-full">
                      <Mail className="mr-2 h-3.5 w-3.5" />
                      Subscribe
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </aside>

            {/* Blog Posts */}
            <div className="lg:col-span-3">
              {currentPosts.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {currentPosts.map((post) => (
                      <Card key={post.id} className="hover:shadow-lg transition-shadow">
                        <div className="aspect-video bg-muted rounded-t-lg" />
                        <CardHeader>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs px-2 py-1 bg-muted rounded-full text-foreground">
                              {post.category}
                            </span>
                            <button className="text-muted-foreground hover:text-foreground">
                              <Bookmark className="h-4 w-4" />
                            </button>
                          </div>
                          <CardTitle className="text-base line-clamp-2">{post.title}</CardTitle>
                          <CardDescription className="text-xs line-clamp-3">
                            {post.excerpt}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <div className="flex items-center space-x-3">
                              <span className="flex items-center">
                                <User className="h-3 w-3 mr-1" />
                                {post.author}
                              </span>
                              <span className="flex items-center">
                                <Calendar className="h-3 w-3 mr-1" />
                                {post.date}
                              </span>
                            </div>
                            <span className="flex items-center">
                              <Clock className="h-3 w-3 mr-1" />
                              {post.readTime}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-3">
                            {post.tags.map((tag, idx) => (
                              <span
                                key={idx}
                                className="text-2xs px-2 py-0.5 bg-muted rounded-full text-foreground"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </CardContent>
                        <CardFooter>
                          <Link
                            href={`/blog/${post.id}`}
                            className="text-xs text-primary hover:underline flex items-center"
                          >
                            Read article
                            <ArrowRight className="ml-1 h-3 w-3" />
                          </Link>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center space-x-2 mt-8">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="p-2 rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      {[...Array(totalPages)].map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setCurrentPage(i + 1)}
                          className={`px-3 py-1 rounded-lg text-sm ${
                            currentPage === i + 1
                              ? 'bg-primary text-black'
                              : 'hover:bg-muted text-foreground'
                          }`}
                        >
                          {i + 1}
                        </button>
                      ))}
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className="p-2 rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12">
                  <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No articles found</p>
                  <p className="text-sm text-muted-foreground mt-1">Try adjusting your search or filters</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 lg:py-24 bg-primary">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-black mb-4">
            Want to Contribute?
          </h2>
          <p className="text-sm text-black/80 mb-8 max-w-2xl mx-auto">
            Share your expertise with our community. We're always looking for guest authors
            to contribute insights and best practices.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/blog/write">
              <Button variant="secondary" size="lg">
                Submit an Article
                <FileText className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/blog/guidelines">
              <Button variant="outline" size="lg" className="bg-black/10 border-black/20 hover:bg-black/20">
                Writing Guidelines
                <BookOpen className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}