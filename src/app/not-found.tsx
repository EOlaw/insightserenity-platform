import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Home, Search } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="space-y-2">
          <h1 className="text-8xl font-bold text-primary">404</h1>
          <h2 className="text-2xl font-bold tracking-tight">Page not found</h2>
          <p className="text-sm text-muted-foreground">
            Sorry, we couldn't find the page you're looking for. It might have been moved or deleted.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/">
            <Button>
              <Home className="mr-2 h-4 w-4" />
              Go home
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="outline">
              <Search className="mr-2 h-4 w-4" />
              Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
