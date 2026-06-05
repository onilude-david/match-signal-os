import React from "react";
import { Loader2 } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "success" | "danger" | "outline" | "glass" | "icon";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export function Button({
  variant = "glass",
  loading = false,
  icon,
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  // Base classes that apply to all variants
  const baseClasses =
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold text-sm transition-all duration-300 active:scale-95 disabled:pointer-events-none disabled:opacity-50 cursor-pointer h-10 px-4";

  // Variant mappings using Tailwind CSS v4 custom theme colors
  const variants: Record<ButtonVariant, string> = {
    primary:
      "bg-[#c9972d] text-[#101b17] hover:bg-[#d8aa42] border border-[#c9972d] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]",
    secondary:
      "bg-[#163f51] text-[#f6efe0] hover:bg-[#1f566c] border border-[#2d6578] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]",
    success:
      "bg-[#10543f] text-[#f6efe0] hover:bg-[#17694f] border border-[#27765d] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]",
    danger:
      "bg-[#9f3a31] text-[#fff7ed] hover:bg-[#b5483d] border border-[#ba5a4f]",
    outline:
      "bg-transparent border border-[#c9972d]/45 text-[#f6efe0] hover:bg-[#c9972d]/10",
    glass:
      "bg-paper-2 hover:bg-[#f6efe0]/10 text-ink border border-line-border shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]",
    icon:
      "p-0 w-10 h-10 items-center justify-center bg-paper-2 hover:bg-white/10 text-ink border border-line-border rounded-xl",
  };

  const selectedVariant = variants[variant] || variants.glass;

  return (
    <button
      disabled={disabled || loading}
      className={`${baseClasses} ${selectedVariant} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className="animate-spin" size={16} />
      ) : (
        icon && <span className="flex-shrink-0">{icon}</span>
      )}
      {children}
    </button>
  );
}

export default Button;
