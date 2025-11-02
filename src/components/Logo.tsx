import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils/cn'

interface LogoProps {
  href?: string
  className?: string
  showText?: boolean
  textClassName?: string
  size?: 'sm' | 'md' | 'lg'
}

const sizeMap = {
  sm: { width: 24, height: 24, text: 'text-sm' },
  md: { width: 32, height: 32, text: 'text-lg' },
  lg: { width: 40, height: 40, text: 'text-xl' },
}

export function Logo({ 
  href = '/', 
  className, 
  showText = true, 
  textClassName,
  size = 'md' 
}: LogoProps) {
  const { width, height, text } = sizeMap[size]

  const logoContent = (
    <div className={cn('flex items-center space-x-2', className)}>
      <Image
        src="/android-chrome-192x192.png"
        alt="Insight Serenity Logo"
        width={width}
        height={height}
        className="rounded-lg"
        priority
      />
      {showText && (
        <span className={cn('font-bold text-foreground', text, textClassName)}>
          Insight Serenity
        </span>
      )}
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="flex items-center">
        {logoContent}
      </Link>
    )
  }

  return logoContent
}