/** Minimalist vector logo: a compass ring with a four-point spark at its
 * centre ("focus" + "building the future"). Pure SVG, colours come from
 * CSS variables so it follows the active theme. Static, trusted markup. */
const LOGO_SVG = `
<svg class="logo-svg" viewBox="0 0 48 48" width="40" height="40" role="img" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="logo-grad" x1="6" y1="6" x2="42" y2="42" gradientUnits="userSpaceOnUse">
      <stop offset="0" style="stop-color: var(--color-accent)"/>
      <stop offset="1" style="stop-color: var(--color-violet)"/>
    </linearGradient>
  </defs>
  <circle cx="24" cy="24" r="19" fill="none" stroke="url(#logo-grad)" stroke-width="2.5" stroke-dasharray="86 34" stroke-linecap="round" transform="rotate(-70 24 24)"/>
  <path d="M24 9.5c1 8 4.5 11.5 12.5 14.5-8 3-11.5 6.5-12.5 14.5-1-8-4.5-11.5-12.5-14.5 8-3 11.5-6.5 12.5-14.5Z" fill="url(#logo-grad)"/>
  <circle cx="38" cy="10" r="2.2" fill="var(--color-success)"/>
</svg>`;

export function logoMarkup(label: string): string {
  return LOGO_SVG.replace("<svg ", `<svg aria-label="${label}" `);
}

export const ICON_SUN = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
export const ICON_MOON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>`;
export const ICON_EYE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>`;
export const ICON_EYE_OFF = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.9 17.9A10.4 10.4 0 0 1 12 19C5.6 19 2 12 2 12a18 18 0 0 1 4.1-5M9.9 5.2A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a18 18 0 0 1-2.2 3.2M1 1l22 22M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`;
export const ICON_CHECK = `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8"/></svg>`;
