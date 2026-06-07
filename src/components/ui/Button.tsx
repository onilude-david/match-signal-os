import React from "react";
import { Loader2 } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "success" | "danger" | "outline" | "glass" | "icon" | "ghost";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

const base =
  "inline-flex items-center gap-2 font-medium text-[0.8125rem] tracking-[-0.005em] " +
  "transition-[color,border-color,background-color] duration-150 " +
  "cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 " +
  "h-9 px-3.5 rounded-[2px] " +
  "decoration-1 underline-offset-[3px]";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-ink text-paper border border-ink " +
    "hover:bg-transparent hover:text-ink",
  secondary:
    "bg-transparent text-ink border border-[var(--rule-strong)] " +
    "hover:border-ink",
  success:
    "bg-transparent text-pitch border border-pitch " +
    "hover:bg-pitch hover:text-paper",
  danger:
    "bg-transparent text-red border border-red " +
    "hover:underline",
  outline:
    "bg-transparent text-ink border border-[var(--rule-strong)] " +
    "hover:border-ink",
  glass:
    "bg-transparent text-ink border border-[var(--rule-strong)] " +
    "hover:border-ink",
  ghost:
    "bg-transparent text-ink-muted border border-transparent px-2 " +
    "hover:text-ink hover:underline",
  icon:
    "bg-transparent text-ink border border-[var(--rule-strong)] " +
    "h-9 w-9 p-0 justify-center hover:border-ink",
};

export function Button({
  variant = "secondary",
  loading = false,
  icon,
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const selected = variants[variant] || variants.secondary;
  return (
    <button
      disabled={disabled || loading}
      className={`${base} ${selected} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className="animate-spin" size={14} />
      ) : (
        icon && <span className="flex-shrink-0">{icon}</span>
      )}
      {children}
    </button>
  );
}

export default Button;
