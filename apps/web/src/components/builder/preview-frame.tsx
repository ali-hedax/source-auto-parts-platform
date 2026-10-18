'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** A real viewport: storefront media queries, images and typography match each device. */
export function PreviewFrame({ width, children, locale }: { width: number; children: ReactNode; locale: string }) {
  const container = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [available, setAvailable] = useState(width);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setAvailable(entry.contentRect.width); });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const ready = useCallback(() => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    doc.documentElement.className = document.documentElement.className;
    doc.documentElement.lang = locale;
    doc.documentElement.dir = locale === 'fa' ? 'rtl' : 'ltr';
    document.querySelectorAll('link[rel="stylesheet"], style').forEach(node => doc.head.appendChild(node.cloneNode(true)));
    doc.body.className = document.body.className;
    doc.body.style.margin = '0';
    setTarget(doc.body);
  }, [locale]);
  const scale = Math.min(1, available / width);
  return <div ref={container} className="min-w-0 overflow-hidden" style={{ height: 850 }}>
    <iframe ref={frame} title="پیش‌نمایش زندهٔ سایت" srcDoc="<!doctype html><html><head><meta charset='utf-8'></head><body></body></html>" onLoad={ready} style={{ width, height: 850 / scale, border: 0, transform: `scale(${scale})`, transformOrigin: 'top right', display: 'block', maxWidth: 'none' }} />
    {target ? createPortal(children, target) : null}
  </div>;
}
