import { useEffect, useState } from 'react';

import { Tooltip } from '@open-zentra/foundation-design-system';
import { Icon } from '@open-zentra/foundation-icons';

const copyText = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
};

/** A quiet, reusable ChatGPT-style message copy action. */
export const CopyMessageButton = ({ text, label = 'Copy response' }: { readonly text: string; readonly label?: string }) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1_800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!text.trim()) return null;

  return (
    <Tooltip content={copied ? 'Copied' : label} side="bottom">
      <button
        type="button"
        aria-label={copied ? 'Copied' : label}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground-muted opacity-0 transition-[opacity,color,background-color] hover:bg-secondary hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus group-hover/message:opacity-100 group-focus-within/message:opacity-100"
        onClick={() => void copyText(text).then(() => setCopied(true)).catch(() => undefined)}
      >
        <Icon name={copied ? 'check' : 'copy'} size="xs" aria-hidden={true} />
      </button>
    </Tooltip>
  );
};
