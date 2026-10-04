---
name: Roosters Dashboard (Blueprint)
description: A crisp, technical dashboard that treats cron jobs as structured engineering elements, using a dense grid, blueprint blue/grey, and drafting lines.
colors:
  primary: "#33a1fd"
  secondary: "#39ff14"
  tertiary: "#ff3366"
  neutral-bg: "#0b2b53"
  neutral-surface: "rgba(8, 32, 64, 0.85)"
  neutral-text: "#e6f2ff"
typography:
  display:
    fontFamily: "'Roboto Mono', 'Fira Code', 'Courier New', monospace"
    fontSize: "22px"
    fontWeight: "normal"
  headline:
    fontFamily: "'Roboto Mono', 'Fira Code', 'Courier New', monospace"
    fontSize: "16px"
    fontWeight: "normal"
  body:
    fontFamily: "'Roboto Mono', 'Fira Code', 'Courier New', monospace"
    fontSize: "13px"
    fontWeight: "normal"
rounded:
  sm: "0px"
  md: "0px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "32px"
components:
  button-primary:
    backgroundColor: "rgba(51, 161, 253, 0.05)"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  card:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.md}"
    padding: "24px"
---

# Design System: Roosters Dashboard

## Overview

**Creative North Star: "The Blueprint / Schematic"**

A crisp, technical dashboard that treats cron jobs as structured engineering elements. Using a dense architectural grid, blueprint blues, and strict drafting lines, the UI feels like a live technical drawing of the system's infrastructure.

## Colors

The palette is anchored in architectural blue tones, with crisp cyan drafting lines.

### Primary
- **Drafting Cyan** (#33a1fd): Primary structural lines, borders, and active interactions.

### Secondary
- **Up Green** (#39ff14): Success state indicators.

### Tertiary
- **Down Red** (#ff3366): Error state indicators.

### Neutral
- **Blueprint Paper** (#0b2b53): The deep architectural blue background.
- **Translucent Card** (rgba(8, 32, 64, 0.85)): Subtle overlays for content areas.
- **Chalk White** (#e6f2ff): Primary text color.
- **Grid Blue** (#1d4f88): The technical grid lines on the background.

## Typography

**Display Font:** 'Roboto Mono', 'Fira Code', monospace
**Body Font:** 'Roboto Mono', 'Fira Code', monospace

**Character:** Utilitarian, precise, and entirely uppercase. No bold weights are used; hierarchy is established through size, spacing, and border rules.

### Hierarchy
- **Display** (normal, 22px): Page headers, always underlined.
- **Headline** (normal, 16px): Section breaks, dashed underlines.
- **Body** (normal, 13px): General data and labels, strict uppercase.

## Layout

A rigid matrix. The background features a repeating 20px graph paper grid. Elements align strictly to structural borders rather than floating in space.

## Elevation & Depth

Completely flat. 
Depth is occasionally implied through hard, solid dropshadows (`4px 4px 0 rgba(29, 79, 136, 0.5)`), never through soft Gaussian blurs.

## Shapes

Shapes are strictly rectangular with 0px radius. Cards feature small corner crosshairs simulating a drafted boundary box. 

## Components

### Buttons
- **Shape:** 0px radius, strictly outlined.
- **Primary:** Transparent background with `#33a1fd` border. Hover introduces a subtle 15% opacity fill.

### Cards / Containers
- **Background:** Semi-transparent darker blue `#082040`.
- **Border:** 1px solid Drafting Cyan.
- **Corner Marks:** Absolute positioned 8x8px boxes at the corners simulating drafting bounds.

### Jobs Table
- **Style:** A strict matrix with visible cell borders. The table itself is wrapped in a 2px Drafting Cyan border.

## Do's and Don'ts

### Do:
- **Do** use strict uppercase monospace typography everywhere.
- **Do** rely on 1px borders and hard lines rather than background fills.

### Don't:
- **Don't** use border-radius (keep all corners 0px).
- **Don't** use soft shadows (keep shadows 0px blur).
