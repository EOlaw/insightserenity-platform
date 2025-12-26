'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Check, Clock, Sparkles, Users, Calendar, ArrowRight, Briefcase, Shield, Video } from 'lucide-react'
import toast from 'react-hot-toast'
import Cookies from 'js-cookie'
import consultationsApi, { ConsultationPackage } from '@/lib/api/consultations'

export default function ConsultationPackagesPage() {
  const router = useRouter()
  const [packages, setPackages] = useState<ConsultationPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    const token = Cookies.get('auth-token')
    setIsAuthenticated(!!token)
    fetchPackages()
  }, [])

  const fetchPackages = async () => {
    try {
      const data = await consultationsApi.getPackages()
      const sorted = data.sort((a, b) => a.availability.displayOrder - b.availability.displayOrder)
      setPackages(sorted)
    } catch (error) {
      console.error('Failed to fetch packages:', error)
      toast.error('Failed to load consultation packages')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectPackage = (pkg: ConsultationPackage) => {
    if (!isAuthenticated) {
      toast.error('Please login to book a consultation')
      router.push(`/login?redirect=/client/consultations/book?packageId=${pkg.packageId}`)
      return
    }
    router.push(`/client/consultations/book?packageId=${pkg.packageId}`)
  }

  const formatPrice = (amount: number) => {
    return (amount / 100).toFixed(2)
  }

  const getPackageIcon = (type: string) => {
    switch (type) {
      case 'free_trial':
        return <Sparkles className="h-4 w-4" />
      case 'pay_per_use':
        return <Clock className="h-4 w-4" />
      case 'consultation_bundle':
        return <Users className="h-4 w-4" />
      default:
        return <Calendar className="h-4 w-4" />
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-3"></div>
          <p className="text-xs text-muted-foreground">Loading packages...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <Logo href="/" showText={false} />
            <div className="flex items-center space-x-3">
              <Link href="/login">
                <Button variant="ghost" size="sm" className="text-xs">Sign in</Button>
              </Link>
              <Link href="/register">
                <Button size="sm" className="text-xs">Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-muted/50 to-background py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center space-x-2 bg-primary/10 rounded-full px-3 py-1.5 mb-4">
              <Briefcase className="h-3 w-3 text-primary" />
              <span className="text-xs font-medium text-primary">Expert Consultation Services</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight mb-4 text-foreground">
              Professional Guidance, <span className="text-primary">Flexible Packages</span>
            </h1>
            <p className="text-sm text-muted-foreground mb-6">
              Connect with industry experts for strategic advice, technical guidance, and business insights.
              Choose the package that fits your needs—from free trial sessions to comprehensive bundles.
            </p>
          </div>
        </div>
      </section>

      {/* Packages Grid */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {packages.map((pkg) => {
              const isFree = pkg.pricing.amount === 0
              const isFeatured = pkg.availability.featuredPackage
              const hasDiscount = pkg.pricing.discount && pkg.pricing.discount.percentage > 0

              return (
                <Card
                  key={pkg.packageId}
                  className={`relative flex flex-col transition-shadow ${
                    isFeatured ? 'border-primary shadow-lg' : 'hover:shadow-md'
                  }`}
                >
                  {isFeatured && (
                    <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                      <Badge className="bg-primary text-black text-xs px-2 py-0.5">Most Popular</Badge>
                    </div>
                  )}

                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className={`p-1.5 rounded-lg ${isFree ? 'bg-green-100 text-green-600' : 'bg-primary/10 text-primary'}`}>
                        {getPackageIcon(pkg.details.type)}
                      </div>
                      {hasDiscount && (
                        <Badge variant="destructive" className="text-xs">
                          {pkg.pricing.discount!.percentage}% OFF
                        </Badge>
                      )}
                    </div>

                    <CardTitle className="text-base">{pkg.details.name}</CardTitle>
                    <CardDescription className="text-xs line-clamp-2">
                      {pkg.details.description}
                    </CardDescription>

                    <div className="mt-3">
                      {isFree ? (
                        <div className="text-2xl font-bold text-green-600">Free</div>
                      ) : (
                        <div>
                          <div className="text-2xl font-bold">
                            ${formatPrice(pkg.pricing.amount)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {pkg.credits.total} consultation{pkg.credits.total > 1 ? 's' : ''}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 py-3">
                    <div className="space-y-2">
                      <div className="flex items-start gap-1.5">
                        <Check className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                        <span className="text-xs text-foreground">
                          {pkg.credits.duration.minutes} min per session
                        </span>
                      </div>

                      <div className="flex items-start gap-1.5">
                        <Check className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                        <span className="text-xs text-foreground">
                          Valid for {pkg.credits.expiresAfterDays} days
                        </span>
                      </div>

                      <div className="flex items-start gap-1.5">
                        <Check className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                        <span className="text-xs text-foreground">
                          Video consultation
                        </span>
                      </div>

                      {pkg.details.features.slice(0, 2).map((feature, idx) => (
                        <div key={idx} className="flex items-start gap-1.5">
                          <Check className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                          <span className="text-xs text-foreground">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>

                  <CardFooter className="pt-3">
                    <Button
                      fullWidth
                      size="sm"
                      variant={isFeatured ? 'default' : 'outline'}
                      onClick={() => handleSelectPackage(pkg)}
                      className="text-xs"
                    >
                      {isFree ? 'Start Free Trial' : 'Select Package'}
                      <ArrowRight className="ml-1.5 h-3 w-3" />
                    </Button>
                  </CardFooter>
                </Card>
              )
            })}
          </div>

          {/* How It Works */}
          <div className="mt-12 max-w-4xl mx-auto">
            <Card className="border-primary/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">How It Works</CardTitle>
                <CardDescription className="text-xs">Book and manage your consultations in 3 easy steps</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="bg-primary/10 w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2">
                      <span className="text-base font-bold text-primary">1</span>
                    </div>
                    <h3 className="text-sm font-semibold mb-1">Choose Package</h3>
                    <p className="text-xs text-muted-foreground">
                      Select the consultation package that fits your needs
                    </p>
                  </div>

                  <div className="text-center">
                    <div className="bg-primary/10 w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2">
                      <span className="text-base font-bold text-primary">2</span>
                    </div>
                    <h3 className="text-sm font-semibold mb-1">Schedule Session</h3>
                    <p className="text-xs text-muted-foreground">
                      Pick a time that works for you and your consultant
                    </p>
                  </div>

                  <div className="text-center">
                    <div className="bg-primary/10 w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2">
                      <span className="text-base font-bold text-primary">3</span>
                    </div>
                    <h3 className="text-sm font-semibold mb-1">Get Expert Help</h3>
                    <p className="text-xs text-muted-foreground">
                      Meet with your consultant and get actionable insights
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* CTA */}
          <div className="mt-10 text-center">
            <p className="text-xs text-muted-foreground mb-3">
              Not sure which package is right for you?
            </p>
            <Link href="/contact">
              <Button variant="outline" size="sm" className="text-xs">Contact Our Team</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-secondary dark:bg-gray-950 py-8 mt-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-xs text-muted-foreground">
            © 2024 InsightSerenity. All rights reserved.
          </p>
          <div className="flex items-center justify-center space-x-1 mt-2">
            <Shield className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Secure & Confidential</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
