---
name: Roosters Dashboard (Phosphor Terminal)
description: A retro-futuristic terminal UI inspired by old CRT monitors, monochrome phosphor displays, and hacker aesthetics.
colors:
  primary: "#00f0ff"
  secondary: "#00ff33"
  tertiary: "#ff0033"
  neutral-bg: "#050505"
  neutral-surface: "#0a0a0a"
  neutral-border-dark: "#1a1a1a"
  neutral-border-light: "#333333"
  neutral-text: "#d0d0d0"
  neutral-muted: "#666666"
typography:
  display:
    fontFamily: "'Courier New', Courier, monospace"
    fontSize: "24px"
    fontWeight: "700"
    letterSpacing: "2px"
  headline:
    fontFamily: "'Courier New', Courier, monospace"
    fontSize: "18px"
    fontWeight: "700"
  body:
    fontFamily: "'Courier New', Courier, monospace"
    fontSize: "14px"
    fontWeight: "400"
rounded:
  sm: "0px"
  md: "0px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
---

# Design System: Roosters Dashboard

## Overview

**Creative North Star: "Phosphor Terminal"**

A retro-futuristic, command-line-inspired UI. It mimics a classic CRT monitor with monospace fonts, stark black backgrounds, glowing neon text, and subtle horizontal scanlines. There are no curves, gradients, or shadows—only sharp borders and bright text on a dark canvas.

## Colors

The palette simulates a phosphor display.

### Primary
- **Cyan Glow** (#00f0ff): The primary accent color for active elements, buttons, and links.

### Secondary
- **Terminal Green** (#00ff33): For successful states (UP).
- **Terminal Red** (#ff0033): For error states (DOWN).

### Neutral
- **Deep Void** (#050505): The base background color, overlaid with CSS scanlines.
- **Dim Phosphor** (#666666): Muted text and inactive elements.
- **Bright Phosphor** (#d0d0d0): Standard readable text.

## Typography

**Global Font:** 'Courier New', Courier, monospace

**Character:** Strictly utilitarian, heavily relying on uppercase text to mimic early computing interfaces.

### Hierarchy
- **Display** (700 weight, 24px, Uppercase): Primary page titles.
- **Label** (700 weight, 12px, Uppercase): Table headers and small descriptors.
- **Body** (400 weight, 14px): General data.

## Layout

A strictly tabular, grid-aligned layout. Borders are sharp, 1px solid lines.

## Elevation & Depth

**Flat and Glowing:**
There is no Z-depth or physical elevation. Interactions are denoted by glows (`box-shadow: 0 0 Xpx [color]`), color inversion, or sharp border changes.

## Shapes

Strictly geometric. **0px border-radius everywhere.** 

## Components

### Buttons
- **Shape:** Sharp rectangle.
- **Style:** Ghost buttons with a 1px solid border matching the text color (Cyan or White).
- **Hover State:** Solid background (color inversion) or intensified text glow.

### Status Chips (LEDs)
- **Style:** Small circular dots (the only non-square elements).
- **State:** High glow when active (`box-shadow: 0 0 8px [color]`).

### Jobs Table
- **Style:** A strict HTML table.
- **Rows:** Alternating subtle background colors or scanlines to guide the eye.
- **Borders:** Subtle top/bottom 1px borders for rows, no vertical borders.

## Do's and Don'ts

### Do:
- **Do** use strict uppercase for titles, buttons, and status labels.
- **Do** use monospace typography for EVERYTHING.
- **Do** use sharp 1px borders and solid lines.

### Don't:
- **Don't** use border-radius.
- **Don't** use drop shadows for depth (only use them for glow effects).
- **Don't** use gradients except for the background scanline overlay.
