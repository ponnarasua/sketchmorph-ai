import React from 'react'
import { cn } from '@/lib/utils'

interface LiquidGlassButtonProps {
  children: React.ReactNode
  onClick?: (e?: React.MouseEvent<HTMLButtonElement>) => void
  className?: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'subtle'
  disabled?: boolean
  style?: React.CSSProperties
}

// Variant styles for glass morphism effect
const variantClasses = {
  default:
    'backdrop-blur-xl bg-white/[0.08] border border-white/[0.12] saturate-150',
  subtle:
    'backdrop-blur-lg bg-white/[0.05] border border-white/[0.08] saturate-125',
}

// Size variants
const sizeClasses = {
  sm: 'px-3 py-1.5 text-xs rounded-md',
  md: 'px-4 py-2 text-sm rounded-lg',
  lg: 'px-6 py-3 text-base rounded-xl',
}

export const LiquidGlassButton: React.FC<LiquidGlassButtonProps> = ({
  children,
  onClick,
  className,
  size = 'md',
  variant = 'default',
  disabled = false,
  style,
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={style}
      className={cn(
        // Base styles
        'relative transition-all duration-200 ease-out whitespace-nowrap',
        'text-white/90 font-medium',
        'flex items-center gap-2',
        'pointer-events-auto cursor-pointer',
        'overflow-hidden group',

        // Glass morphism effect
        variantClasses[variant],

        // Size variants
        sizeClasses[size],

        // Interactive states
        'hover:bg-white/[0.12] hover:border-white/[0.16]',
        'active:bg-white/[0.06] active:scale-[0.98]',
        'focus:outline-none focus:ring-2 focus:ring-white/20',
        'focus:ring-offset-2 focus:ring-offset-transparent',

        // Disabled state
        disabled &&
          'opacity-50 cursor-not-allowed hover:bg-white/[0.08] hover:border-white/[0.12] active:scale-100',

        // Custom classes
        className
      )}
    >
      {/* Liquid shimmer effect on hover */}
      <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
        <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
      </span>

      {/* Content */}
      <span className="relative z-10 flex items-center gap-2">
        {children}
      </span>
    </button>
  )
}