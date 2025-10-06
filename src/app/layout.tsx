import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import '@/styles/globals.css'
import { cn } from '@/lib/utils/cn'
import { Providers } from '@/components/providers'
import { Toaster } from '@/components/ui/toaster'
import { OnboardingTooltips } from '@/components/OnboardingTooltips'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: {
    default: 'Enterprise Platform',
    template: '%s | Enterprise Platform'
  },
  description: 'Comprehensive Enterprise SaaS Platform',
  keywords: ['enterprise', 'saas', 'platform', 'consulting', 'recruitment'],
  authors: [{ name: 'Enterprise Team' }],
  creator: 'Enterprise Platform',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://enterprise.com',
    title: 'Enterprise Platform',
    description: 'Comprehensive Enterprise SaaS Platform',
    siteName: 'Enterprise Platform',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Enterprise Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Enterprise Platform',
    description: 'Comprehensive Enterprise SaaS Platform',
    images: ['/og-image.png'],
    creator: '@enterprise',
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png' },
    ],
  },
  manifest: '/manifest.json',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body
        className={cn(
          'min-h-screen bg-background font-sans antialiased',
          inter.variable
        )}
      >
        <Providers>
          <div className="relative flex min-h-screen flex-col">
            {children}
          </div>
          <OnboardingTooltips />
          <Toaster />
        </Providers>
      </body>
    </html>
  )
}
