---
name: Roosters Dashboard (Modern Glass)
description: A sleek, high-end modern dark mode with glassmorphism, subtle gradients, and clean sans-serif typography.
colors:
  primary: "#8B5CF6"
  secondary: "#06B6D4"
  neutral-bg: "#09090b"
  neutral-surface: "rgba(24, 24, 27, 0.6)"
  neutral-border: "rgba(255, 255, 255, 0.08)"
  neutral-text: "#ffffff"
  neutral-muted: "#a1a1aa"
  status-up: "#10b981"
  status-down: "#ef4444"
  status-paused: "#f59e0b"
typography:
  display:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: "600"
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: "600"
    letterSpacing: "-0.02em"
  body:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: "400"
rounded:
  sm: "8px"
  md: "16px"
  lg: "99px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "linear-gradient(135deg, #8B5CF6, #06B6D4)"
    textColor: "#ffffff"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
  card:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.md}"
    padding: "24px"
---

# Design System: Roosters Dashboard

## Overview

**Creative North Star: "Sleek Modern Glass"**

A high-end, contemporary dark mode that feels premium and state-of-the-art. It utilizes subtle glassmorphism (translucent surfaces with background blur), deep ambient gradients, and crisp geometric sans-serif typography. This is the "Apple/Vercel" modern aesthetic applied to a cron dashboard.

## Colors

The palette is extremely minimal, relying on deep blacks and greys, punctuated by a vivid Violet-to-Cyan gradient.

### Primary
- **Electric Gradient** (linear-gradient(135deg, #8B5CF6, #06B6D4)): Used for primary actions, active navigation underlines, and hero text.

### Neutral
- **Deep Void** (#09090b): The absolute background, enhanced with soft radial gradient glows.
- **Translucent Surface** (rgba(24, 24, 27, 0.6)): The base for all cards, tables, and topbars, backed by a blur filter.
- **Ghost Border** (rgba(255, 255, 255, 0.08)): 1px borders to define shapes without harsh lines.
- **Pure White** (#ffffff): Headings and primary text.
- **Muted Zinc** (#a1a1aa): Secondary text, breadcrumbs, table headers.

## Typography

**Display Font:** 'Inter', system-ui, sans-serif
**Body Font:** 'Inter', system-ui, sans-serif

**Character:** Clean, highly legible, modern geometric sans-serif with slight negative letter-spacing for a premium feel.

### Hierarchy
- **Display** (600 weight, 28px): Page headers, tightly tracked (-0.02em).
- **Headline** (600 weight, 20px): Section breaks.
- **Body** (400 weight, 14px): General data and labels.

## Layout

Generous whitespace and padding. Containers use `1100px` max-width. Elements are spaced out to allow the dark background and ambient glows to breathe.

## Elevation & Depth

Depth is achieved through a combination of backdrop-filters (glassmorphism) and soft, expansive drop shadows on hover.

### Shadow Vocabulary
- **Resting Shadow**: `0 4px 12px rgba(0, 0, 0, 0.1)` on cards.
- **Hover Shadow**: `0 12px 32px rgba(0, 0, 0, 0.4)` when cards or rows lift.

## Shapes

Soft, friendly, and modern corner radiuses. 
- Cards and tables use a generous 16px radius (`--radius`).
- Buttons and smaller elements use 8px (`--radius-sm`).
- Chips use fully rounded pill shapes (99px).

## Components

### Buttons
- **Shape:** 8px radius.
- **Primary:** Vibrant Electric Gradient fill with no border, glowing shadow.
- **Hover / Focus:** Elements translate slightly upward (`transform: translateY(-1px)`) with an intensified shadow.

### Cards / Containers
- **Background:** Translucent Surface (`rgba(24, 24, 27, 0.6)`) with `backdrop-filter: blur(12px)`.
- **Border:** 1px solid Ghost Border (`rgba(255, 255, 255, 0.08)`).
- **Hover:** Border slightly highlights to `rgba(255, 255, 255, 0.15)`.

### Status Chips
- **Style:** Pill-shaped (99px radius), utilizing a 10% opacity background of the status color with a 20% opacity border, making them feel like glowing glass indicators.

## Do's and Don'ts

### Do:
- **Do** use `backdrop-filter: blur(12px)` on surfaces to maintain the glassmorphic feel.
- **Do** use negative letter-spacing (`-0.02em`) on headings for a tighter, premium look.
- **Do** use smooth `0.3s cubic-bezier(0.4, 0, 0.2, 1)` transitions for all hover states.

### Don't:
- **Don't** use solid, opaque backgrounds for cards; always let the ambient background glow show through slightly.
- **Don't** use sharp 0px corners on interactive elements.
