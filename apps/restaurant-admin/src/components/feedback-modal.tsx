'use client';

// Feedback modal — opened from FeedbackFab. 3 tabs (Bug / Sugestie / Întrebare),
// description textarea, optional screenshot (file upload OR auto-capture via
// html2canvas). Submits multipart to the Supabase Edge Function
// `feedback-intake` with the user's JWT.

import { useEffect, useRef, useState, useTransition } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Tabs,
  TabsList,
  TabsTrigger,
  toast,
} from '@hir/ui';
import { Camera, ImageIcon, Loader2, Upload } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { getConsoleExcerpt } from '@/lib/console-buffer';

type Category = 'BUG' | 'UX_FRICTION' | 'QUESTION';

const TAB_TO_CATEGORY: Record<'bug' | 'sugestie' | 'intrebare', Category> = {
  bug: 'BUG',
  sugestie: 'UX_FRICTION',
  intrebare: 'QUESTION',
};

const TAB_LABELS: Record<'bug' | 'sugestie' | 'intrebare', { title: string; help: string }> = {
  bug: {
    title: 'Suport / Raportează o problemă',
    help: 'Spuneți-ne ce nu a funcționat. Captura ecranului ne ajută cel mai mult.',
  },
  sugestie: {
    title: 'Trimiteți o sugestie',
    help: 'Ce ați schimba sau ați adăuga? Orice idee contează.',
  },
  intrebare: {
    title: 'Aveți o întrebare',
    help: 'Întrebați și revenim cu un răspuns.',
  },
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
};

export function FeedbackModal({ open, onOpenChange, tenantId }: Props) {
  const [tab, setTab] = useState<'bug' | 'sugestie' | 'intrebare'>('bug');
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setDescription('');
      setScreenshot(null);
      setPreviewUrl(null);
      setTab('bug');
    }
  }, [open]);

  useEffect(() => {
    if (!screenshot) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(screenshot);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [screenshot]);

  async function handleAutoCapture() {
    setCapturing(true);
    try {
      const mod = await import('html2canvas');
      const html2canvas = mod.default;
      const canvas = await html2canvas(document.body, {
        backgroundColor: '#ffffff',
        scale: Math.min(2, window.devicePixelRatio || 1),
        logging: false,
        useCORS: true,
        // Skip our own modal so it doesn't appear in the capture.
        ignoreElements: (el) => el.hasAttribute('data-feedback-modal'),
      });
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png', 0.92),
      );
      if (!blob) {
        toast.error('Captura nu a putut fi creată. Încercați să încărcați manual.');
        return;
      }
      setScreenshot(new File([blob], `capture-${Date.now()}.png`, { type: 'image/png' }));
      toast.success('Captură realizată.');
    } catch (err) {
      console.error('[feedback-modal] auto-capture failed', err);
      toast.error('Captura automată a eșuat. Încărcați manual.');
    } finally {
      setCapturing(false);
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setScreenshot(null);
      return;
    }
    if (!f.type.startsWith('image/')) {
      toast.error('Doar imagini sunt acceptate.');
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      toast.error('Imaginea trebuie să fie sub 2 MB.');
      return;
    }
    setScreenshot(f);
  }

  function submit() {
    const text = description.trim();
    if (text.length === 0) {
      toast.error('Adăugați o scurtă descriere.');
      return;
    }
    start(async () => {
      try {
        const supabase = getBrowserSupabase();
        const { data: sessionRes } = await supabase.auth.getSession();
        const token = sessionRes.session?.access_token;
        if (!token) {
          toast.error('Sesiunea a expirat. Reautentificați-vă.');
          return;
        }
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (!url) {
          toast.error('Configurare lipsă.');
          return;
        }

        const form = new FormData();
        form.append(
          'metadata',
          JSON.stringify({
            tenant_id: tenantId,
            category: TAB_TO_CATEGORY[tab],
            description: text,
            url: typeof window !== 'undefined' ? window.location.href : '',
            user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
            console_log_excerpt: getConsoleExcerpt(),
          }),
        );
        if (screenshot) form.append('screenshot', screenshot);

        const res = await fetch(`${url}/functions/v1/feedback-intake`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        if (!res.ok) {
          const body = await res.text();
          console.error('[feedback-modal] intake failed', res.status, body);
          toast.error('Trimiterea a eșuat. Reîncercați.');
          return;
        }
        const data = (await res.json()) as { id?: string };
        const shortId = (data.id ?? '').slice(0, 8);
        toast.success(`Mulțumim, ne uităm imediat. Ticket #${shortId}`);
        onOpenChange(false);
      } catch (err) {
        console.error('[feedback-modal] submit threw', err);
        toast.error('A apărut o eroare. Reîncercați.');
      }
    });
  }

  const labels = TAB_LABELS[tab];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-feedback-modal
        className="max-w-md sm:max-w-lg"
        onInteractOutside={(e) => {
          if (pending || capturing) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.help}</DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as 'bug' | 'sugestie' | 'intrebare')}
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="bug">Eroare</TabsTrigger>
            <TabsTrigger value="sugestie">Sugestie</TabsTrigger>
            <TabsTrigger value="intrebare">Întrebare</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-col gap-2">
          <Label htmlFor="feedback-description">Descriere</Label>
          <textarea
            id="feedback-description"
            className="min-h-[120px] w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-600"
            placeholder="Ce s-a întâmplat? Ce ați încercat să faceți?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={4000}
          />
          <p className="text-xs text-zinc-500">{description.length}/4000</p>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Captură ecran (opțional)</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAutoCapture}
              disabled={capturing || pending}
            >
              {capturing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Camera className="mr-2 h-4 w-4" />
              )}
              Captură automată
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={pending}
            >
              <Upload className="mr-2 h-4 w-4" />
              Încarc imagine
            </Button>
            <Input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFile}
            />
            {screenshot && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setScreenshot(null);
                  if (fileRef.current) fileRef.current.value = '';
                }}
                disabled={pending}
              >
                Elimin
              </Button>
            )}
          </div>
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Captură"
              className="mt-1 max-h-40 w-full rounded-md border border-zinc-200 object-contain"
            />
          ) : (
            <div className="mt-1 flex items-center gap-2 rounded-md border border-dashed border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
              <ImageIcon className="h-4 w-4" />
              Nicio imagine selectată
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Anulează
          </Button>
          <Button type="button" onClick={submit} disabled={pending || description.trim().length === 0}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Trimite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
