import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

// Variants mirror DevDigest's button kinds: default = primary, secondary,
// ghost = tertiary (borderless), outline = bordered quiet, destructive = danger
// (outlined red). Sizes are tuned for the dense UI scale.
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border border-transparent text-sm leading-[1.2] font-medium tracking-[-0.01em] whitespace-nowrap transition-[background-color,border-color,color] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[15px]",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-primary-foreground hover:border-brand-hover hover:bg-brand-hover",
        secondary:
          "border-border-strong bg-elevated text-foreground hover:border-subtle-foreground hover:bg-accent",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground data-[active=true]:bg-accent data-[active=true]:text-foreground",
        outline:
          "border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground data-[active=true]:bg-accent data-[active=true]:text-foreground",
        destructive: "border-border-strong bg-transparent text-crit hover:border-crit hover:bg-crit-bg",
        link: "text-brand-text underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3.25 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1.5 px-2.25 text-ui has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-[14px]",
        lg: "h-9 px-4.5 text-base has-[>svg]:px-4",
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7.5 [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
