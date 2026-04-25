'use client';
import { Share2 } from 'lucide-react';

type Props = {
  text: string;
  url: string;
  label: string;
  className?: string;
};

export function WhatsAppShareButton({ text, url, className, label }: Props) {
  const message = `${text} ${url}`;
  const href = `https://wa.me/?text=${encodeURIComponent(message)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        className ??
        'inline-flex items-center gap-1.5 rounded-full border border-emerald-600 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50'
      }
    >
      <Share2 className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}
