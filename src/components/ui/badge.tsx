import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-surface2 text-text hover:bg-surface2/80",
        success:
          "border-transparent bg-primary/20 text-primary hover:bg-primary/30",
        warning:
          "border-transparent bg-warning/20 text-warning hover:bg-warning/30",
        error:
          "border-transparent bg-danger/20 text-danger hover:bg-danger/30",
        info:
          "border-transparent bg-info/20 text-info hover:bg-info/30",
        outline: "text-text",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
  VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
