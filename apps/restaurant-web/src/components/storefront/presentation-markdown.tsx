// Lane PRESENTATION (2026-05-06) — minimal, dependency-free Markdown renderer
// for the optional brand-presentation page. Supports paragraphs, soft line
// breaks, **bold**, *italic*, and [link](https://...) — the small surface a
// restaurant owner reasonably writes by hand from the admin editor.
//
// Why not a library: the storefront app has no markdown dep today and
// adding one for one page is overkill. The renderer escapes everything and
// only opts content back in via React nodes (no dangerouslySetInnerHTML).

import * as React from 'react';

const SAFE_URL_RE = /^https?:\/\/[^\s<>"']+$/i;

type Inline = React.ReactNode;

// Match (in order): link, bold, italic. Non-greedy.
// We tokenize sequentially: pull the leftmost match, push the prefix as
// plain text, render the matched node, keep going on the suffix.
function renderInline(line: string, keyBase: string): Inline[] {
  const out: Inline[] = [];
  let cursor = 0;
  let counter = 0;
  while (cursor < line.length) {
    const rest = line.slice(cursor);
    // Try link [text](url)
    const link = /^([\s\S]*?)\[([^\]\n]+?)\]\((https?:\/\/[^\s)]+)\)/.exec(rest);
    const bold = /^([\s\S]*?)\*\*([^*\n][^*\n]*?)\*\*/.exec(rest);
    const italic = /^([\s\S]*?)(?:\*([^*\n][^*\n]*?)\*)/.exec(rest);

    // Pick the earliest match.
    const candidates: Array<{ kind: 'link' | 'bold' | 'italic'; m: RegExpExecArray }> = [];
    if (link) candidates.push({ kind: 'link', m: link });
    if (bold) candidates.push({ kind: 'bold', m: bold });
    if (italic) candidates.push({ kind: 'italic', m: italic });
    if (candidates.length === 0) {
      out.push(rest);
      break;
    }
    candidates.sort((a, b) => a.m[1].length - b.m[1].length);
    const winner = candidates[0];
    const prefix = winner.m[1];
    if (prefix) out.push(prefix);

    const k = `${keyBase}-${counter++}`;
    if (winner.kind === 'link') {
      const text = winner.m[2];
      const url = winner.m[3];
      if (SAFE_URL_RE.test(url)) {
        out.push(
          <a
            key={k}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--hir-brand,#7c3aed)] underline-offset-4 hover:underline"
          >
            {text}
          </a>,
        );
      } else {
        out.push(text);
      }
    } else if (winner.kind === 'bold') {
      out.push(
        <strong key={k} className="font-semibold">
          {winner.m[2]}
        </strong>,
      );
    } else {
      out.push(<em key={k}>{winner.m[2]}</em>);
    }
    cursor += winner.m[0].length;
  }
  return out;
}

export function PresentationMarkdown({ source }: { source: string }) {
  // Split on blank lines → paragraphs. Inside a paragraph, single newlines
  // become <br />.
  const blocks = source.replace(/\r\n?/g, '\n').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-zinc-700">
      {blocks.map((block, bi) => {
        const lines = block.split('\n');
        return (
          <p key={`pblock-${bi}`}>
            {lines.flatMap((line, li) => {
              const inline = renderInline(line, `p${bi}-l${li}`);
              if (li === lines.length - 1) return inline;
              return [...inline, <br key={`br-${bi}-${li}`} />];
            })}
          </p>
        );
      })}
    </div>
  );
}
