---
name: Roosters Dashboard
description: A tactile, hardware-inspired dashboard where jobs are rack-mounted units.
colors:
  primary: "#00ffcc"
  secondary: "#39ff14"
  tertiary: "#ff003c"
  neutral-bg: "#0a0a0a"
  neutral-surface: "#141414"
  neutral-text: "#e0e0e0"
typography:
  display:
    fontFamily: "'Courier New', Courier, monospace"
    fontSize: "24px"
    fontWeight: "bold"
  headline:
    fontFamily: "'Courier New', Courier, monospace"
    fontSize: "18px"
    fontWeight: "bold"
  body:
    fontFamily: "'Courier New', Courier, monospace"
    fontSize: "14px"
    fontWeight: "normal"
rounded:
  sm: "2px"
  md: "4px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "32px"
components:
  button-primary:
    backgroundColor: "rgba(0,255,204,0.1)"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.md}"
    padding: "20px"
---

# Design System: Roosters Dashboard

## Overview

**Creative North Star: "The Server Rack"**

A tactile, hardware-inspired dashboard where jobs are represented as rack-mounted hardware units. Dark brushed metal textures, ventilation grilles, and glowing LED status lights convey that Roosters is a serious, robust tool handling mission-critical jobs.

## Colors

The palette is heavily anchored in dark greys/blacks with vibrant green, red, and orange neon accents serving as LED states.

### Primary
- **Neon Cyan** (#00ffcc): Accent color for active elements, primary buttons, and selected navigation.

### Secondary
- **Up Green** (#39ff14): Glowing LED status for successful and active jobs.

### Tertiary
- **Down Red** (#ff003c): Glowing LED status for failed jobs.

### Neutral
- **Rack Black** (#0a0a0a): The deep background color simulating a dark server room.
- **Brushed Metal** (#141414): The base surface for cards and rack-mounted units.
- **Terminal White** (#e0e0e0): Primary ink color for text.

## Typography

**Display Font:** 'Courier New', Courier, monospace
**Body Font:** 'Courier New', Courier, monospace

**Character:** Technical, precise, and entirely monospaced, reinforcing the hardware/terminal aesthetic.

### Hierarchy
- **Display** (bold, 24px): Page headers.
- **Headline** (bold, 18px): Section breaks.
- **Body** (normal, 14px): General data and labels.

## Layout

The application sits in a centered 1000px max-width container, with items laid out vertically simulating a server rack.

## Elevation & Depth

Surfaces use heavy inset shadows, outer dropshadows, and linear gradients to simulate physical brushed metal rather than flat layered paper. LEDs use text-shadow and box-shadow layers to simulate a glow effect.

### Shadow Vocabulary
- **Inset Bevel**: `inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -1px 0 rgba(0,0,0,0.8)` on hardware units to give them a physical edge.
- **LED Glow**: `0 0 8px [color], inset 0 0 2px #fff` for status chips.

## Shapes

Shapes are strictly rectangular with minor 2px to 4px radiuses. The defining shape language comes from repeating linear gradients acting as ventilation grilles across cards and table rows.

## Components

### Buttons
- **Shape:** 2px radius
- **Primary:** Dark metal gradient background with neon cyan border and glowing cyan text.
- **Hover / Focus:** Lighter metal gradient, intensified neon glow.

### Status Chips (LEDs)
- **Style:** Small 10px circular pseudoelements that carry a multi-layered box-shadow to simulate an illuminated physical diode.
- **State:** Up (Green), Down (Red), Paused (Orange).

### Cards / Containers
- **Background:** Brushed metal gradient with a 50% opacity ventilation grille overlay.
- **Shadow Strategy:** 0 4px 6px rgba(0,0,0,0.5).
- **Border:** 1px solid dark line (#2a2a2a).

## Do's and Don'ts

### Do:
- **Do** use strict monospaced typography for all elements.
- **Do** utilize intense box-shadow glows (e.g. `0 0 8px`) for status indicators to emphasize the hardware LED aesthetic.

### Don't:
- **Don't** use flat, shadowless white surfaces.
- **Don't** use non-monospaced fonts.
