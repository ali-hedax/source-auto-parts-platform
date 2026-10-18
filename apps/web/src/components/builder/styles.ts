import type { BuilderDocument, BuilderStyle } from '@hedax/contracts';
import type { CSSProperties } from 'react';
export function blockVariables(style: BuilderStyle): CSSProperties {
  const vars: Record<string, string | number> = {};
  for (const device of ['desktop', 'tablet', 'mobile'] as const) {
    const layout = style[device];
    if (!layout) continue;
    for (const [key, value] of Object.entries(layout)) {
      vars[`--b-${device}-${key}`] = key === 'hidden' ? (value ? 'none' : 'block') : key === 'columns' ? String(value) : key === 'width' ? `${value}%` : `${value}px`;
    }
  }
  for (const key of ['background', 'foreground', 'borderColor', 'align', 'imageFit'] as const) if (style[key] !== undefined) vars[`--b-${key}`] = style[key];
  for (const key of ['borderWidth', 'radius', 'imageHeight', 'titleSize', 'priceSize'] as const) if (style[key] !== undefined) vars[`--b-${key}`] = `${style[key]}px`;
  if (style.focalX !== undefined || style.focalY !== undefined) vars['--b-focal'] = `${style.focalX ?? 50}% ${style.focalY ?? 50}%`;
  if (style.shadow) vars['--b-shadow'] = { none: 'none', soft: '0 4px 18px #09182e15', raised: '0 16px 40px #09182e25' }[style.shadow];
  return vars as CSSProperties;
}
export function themeVariables(theme: BuilderDocument['theme']): CSSProperties {
  return { '--color-action': theme.primary, '--color-ink': theme.foreground, '--color-line-soft': theme.border, '--radius-card': `${theme.radius}px`, '--radius-control': `${Math.min(theme.radius, 18)}px`, '--builder-width': `${theme.contentWidth}px`, '--builder-space': `${theme.spacing}px`, '--builder-card': theme.card, '--builder-button': theme.button, '--builder-link': theme.link, '--builder-heading-weight': theme.headingWeight, background: theme.background, color: theme.foreground, fontSize: theme.fontSize, ...(theme.font === 'system' ? { fontFamily: 'Tahoma, Arial, sans-serif' } : {}) } as CSSProperties;
}
