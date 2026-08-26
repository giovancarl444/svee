# SVEE TERMINAL — Design System

The Padre/Axiom aesthetic: near-black canvas, dense panels, mono numerals, electric green/red. Implemented as Tailwind v4 `@theme` tokens (single source of truth in `src/app/globals.css`).

## Color tokens

```css
:root {
  /* Canvas & surfaces — layered depth, darkest → lightest */
  --color-bg:            #0A0A0B;   /* app background */
  --color-surface-1:     #111113;   /* page sections */
  --color-surface-2:     #16161A;   /* cards / sidebars */
  --color-surface-3:     #1A1A1E;   /* raised panels */
  --color-surface-4:     #1E1E24;   /* inputs, hovers */

  /* Borders — barely-there separation */
  --color-border:        rgba(255,255,255,0.06);
  --color-border-strong: rgba(255,255,255,0.12);

  /* Text */
  --color-text-primary:   #F4F4F5;
  --color-text-secondary: #9D9DA6;
  --color-text-muted:     #5C5C66;

  /* PnL semantics */
  --color-green:         #00FF88;   /* gains, buys */
  --color-green-dim:     rgba(0,255,136,0.12);
  --color-red:           #FF3B3B;   /* losses, sells */
  --color-red-dim:       rgba(255,59,59,0.12);

  /* Brand actions */
  --color-accent:        #8B5CF6;   /* primary buttons, links */
  --color-accent-hover:  #7C4DE0;
  --color-blue:          #38BDF8;   /* info, chain badges */

  /* Status */
  --color-warning:       #FFB224;
  --color-success-bg:    var(--color-green-dim);
  --color-danger-bg:     var(--color-red-dim);
}
```

## Typography

| Role | Font | Notes |
|---|---|---|
| UI labels, prose | **Geist Sans** (`next/font`, variable) | Inter-class neutrality |
| Numbers, prices, PnL, tables | **JetBrains Mono** (`next/font`) | Tabular by nature — digits never shift width |

Rules:
- Every price/quantity/percentage renders in the mono stack via `.font-mono` + `tabular-nums`.
- Price scale: 18–20px hero price, 13px table cells, 11px metadata.
- Uppercase + letter-spacing `0.05em` on section headers and tab labels (terminal convention).
- PnL values are ALWAYS colored green/red — never neutral.

## Elevation & glow

```css
--shadow-panel:    0 1px 0 rgba(255,255,255,0.03) inset,
                   0 8px 24px -12px rgba(0,0,0,0.6);
--glow-green:      0 0 16px rgba(0,255,136,0.25);
--glow-red:        0 0 16px rgba(255,59,59,0.25);
--glow-accent:     0 0 24px rgba(139,92,246,0.30);
```

- Panels: `bg-surface-3`, 1px border, radius 8px, `shadow-panel`.
- Primary CTA ("Buy"): solid green fill, black text, subtle `glow-green` on hover.
- Sell CTA: solid red fill, white text, `glow-red`.
- Active tabs carry a 2px accent underline that animates between positions.

## Motion

| Interaction | Spec |
|---|---|
| Panel hover | border brightens to `border-strong`, 120ms ease-out |
| Button press | `scale(0.98)` + brightness drop, 80ms |
| Price change | flash background `green-dim`/`red-dim` for 400ms, fade out |
| PnL count-up | animate numeric transitions over 300ms |
| Order submitted→filled | status pill cycles with pulse dot animation |
| Page transitions | none — terminals swap panes instantly |

## Density grid

- Base unit 4px. Panel padding 12px. Row height 32px (tables). Gaps between panels 8px — tighter than typical web apps, matching terminal density.
- Scrollbars: custom 6px, thumb `#2A2A32`.

## Component states checklist

Every interactive element ships: default · hover · active/pressed · focus-visible (2px accent ring) · disabled (40% opacity) · loading (skeleton or spinner). No exceptions — this is what makes it feel professional.
