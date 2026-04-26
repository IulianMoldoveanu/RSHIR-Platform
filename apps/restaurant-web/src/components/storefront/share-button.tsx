'use client';
import { MessageCircle } from 'lucide-react';

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
        'inline-flex h-10 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-4 text-sm font-medium text-emerald-800 shadow-sm transition-all hover:scale-[1.02] hover:bg-emerald-100 active:scale-[0.98] motion-reduce:hover:scale-100 motion-reduce:active:scale-100'
      }
    >
      <MessageCircle className="h-4 w-4" />
      {label}
    </a>
  );
}
