import Link from 'next/link'
import { Lock } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="bg-black dark:bg-gray-950 text-white py-12 transition-colors">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-xs font-semibold mb-4">Product</h3>
            <ul className="space-y-2">
              <li><Link href="/features" className="text-xs text-gray-400 hover:text-white transition">Features</Link></li>
              <li><Link href="/pricing" className="text-xs text-gray-400 hover:text-white transition">Pricing</Link></li>
              <li><Link href="/security" className="text-xs text-gray-400 hover:text-white transition">Security</Link></li>
              <li><Link href="/roadmap" className="text-xs text-gray-400 hover:text-white transition">Roadmap</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold mb-4">Company</h3>
            <ul className="space-y-2">
              <li><Link href="/about" className="text-xs text-gray-400 hover:text-white transition">About</Link></li>
              <li><Link href="/blog" className="text-xs text-gray-400 hover:text-white transition">Blog</Link></li>
              <li><Link href="/careers" className="text-xs text-gray-400 hover:text-white transition">Careers</Link></li>
              <li><Link href="/press" className="text-xs text-gray-400 hover:text-white transition">Press</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold mb-4">Resources</h3>
            <ul className="space-y-2">
              <li><Link href="/docs" className="text-xs text-gray-400 hover:text-white transition">Documentation</Link></li>
              <li><Link href="/api" className="text-xs text-gray-400 hover:text-white transition">API Reference</Link></li>
              <li><Link href="/support" className="text-xs text-gray-400 hover:text-white transition">Support</Link></li>
              <li><Link href="/status" className="text-xs text-gray-400 hover:text-white transition">Status</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold mb-4">Legal</h3>
            <ul className="space-y-2">
              <li><Link href="/privacy" className="text-xs text-gray-400 hover:text-white transition">Privacy</Link></li>
              <li><Link href="/terms" className="text-xs text-gray-400 hover:text-white transition">Terms</Link></li>
              <li><Link href="/cookies" className="text-xs text-gray-400 hover:text-white transition">Cookie Policy</Link></li>
              <li><Link href="/licenses" className="text-xs text-gray-400 hover:text-white transition">Licenses</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 dark:border-gray-800 mt-8 pt-8 flex flex-col sm:flex-row items-center justify-between">
          <p className="text-xs text-gray-400">
            © 2024 Enterprise Platform. All rights reserved.
          </p>
          <div className="flex items-center space-x-4 mt-4 sm:mt-0">
            <Lock className="h-4 w-4 text-gray-400" />
            <span className="text-xs text-gray-400">Secured by Enterprise-grade encryption</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
