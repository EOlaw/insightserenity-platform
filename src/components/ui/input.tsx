import * as React from "react"
import { cn } from "@/lib/utils/cn"
import { Eye, EyeOff } from "lucide-react"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  fullWidth?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({
    className,
    type,
    label,
    error,
    hint,
    leftIcon,
    rightIcon,
    fullWidth = false,
    ...props
  }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false)
    const isPassword = type === "password"

    const inputType = isPassword && showPassword ? "text" : type

    return (
      <div className={cn("space-y-1", fullWidth && "w-full")}>
        {label && (
          <label
            htmlFor={props.id}
            className="text-xs font-medium text-foreground/90"
          >
            {label}
            {props.required && <span className="text-destructive ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {leftIcon}
            </div>
          )}
          <input
            type={inputType}
            className={cn(
              "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors file:border-0 file:bg-transparent file:text-xs file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
              leftIcon && "pl-9",
              (rightIcon || isPassword) && "pr-9",
              error && "border-destructive focus-visible:ring-destructive",
              className
            )}
            ref={ref}
            {...props}
          />
          {(rightIcon || isPassword) && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {isPassword ? (
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              ) : (
                rightIcon
              )}
            </div>
          )}
        </div>
        {error && (
          <p className="text-2xs text-destructive mt-1">{error}</p>
        )}
        {hint && !error && (
          <p className="text-2xs text-muted-foreground mt-1">{hint}</p>
        )}
      </div>
    )
  }
)
Input.displayName = "Input"

export { Input }
