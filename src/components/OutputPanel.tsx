import React from "react";
import { Clipboard, Send } from "lucide-react";
import { Button } from "./ui/Button";

type OutputPanelProps = {
  title: string;
  icon: React.ReactNode;
  text: string;
  onCopy: () => void;
  copied: boolean;
  onPublish?: () => void;
  disabled?: boolean;
};

export function OutputPanel({
  title,
  icon,
  text,
  onCopy,
  copied,
  onPublish,
  disabled = false,
}: OutputPanelProps) {
  return (
    <article className="flex flex-col gap-3 pt-5 border-t border-[var(--rule-strong)]">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="flex items-baseline gap-2 text-ink">
          {icon && <span className="text-[var(--ink-quiet)] self-center">{icon}</span>}
          {title}
        </h2>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            icon={<Clipboard size={13} />}
            onClick={onCopy}
            disabled={disabled}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
          {onPublish && (
            <Button
              variant="success"
              icon={<Send size={13} />}
              onClick={onPublish}
              disabled={disabled}
            >
              {disabled ? "Publishing" : "Publish"}
            </Button>
          )}
        </div>
      </div>
      <pre>{text}</pre>
    </article>
  );
}

export default OutputPanel;
