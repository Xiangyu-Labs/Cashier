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
          "border-transparent bg-[rgba(16,163,127,0.2)] text-primary hover:bg-[rgba(16,163,127,0.3)]",
        warning:
          "border-transparent bg-[rgba(245,158,11,0.2)] text-warning hover:bg-[rgba(245,158,11,0.3)]",
        error:
          "border-transparent bg-[rgba(239,68,68,0.2)] text-danger hover:bg-[rgba(239,68,68,0.3)]",
        info:
          "border-transparent bg-[rgba(59,130,246,0.2)] text-info hover:bg-[rgba(59,130,246,0.3)]",
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
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
