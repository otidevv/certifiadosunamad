# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Certificate generator web application built with React + Vite. Users upload a background image and Excel data, position text fields on a canvas, preview certificates, and generate a ZIP file with all certificates as PNG images (2000x1414px).

## Development Commands

```bash
npm run dev      # Start development server (port 5173)
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

## Architecture

### Single-Component Application
The entire application logic is contained in `src/App.jsx` as a single-page application with a 5-step wizard:

1. **Step 1**: Upload background image → Auto-resize to 2000x1414px
2. **Step 2**: Upload Excel file (.xlsx/.xls) → Extract headers and data rows
3. **Step 3**: Position text fields on canvas → Drag & drop with live preview
4. **Step 4**: Navigate through certificate previews → See how each participant's certificate looks
5. **Step 5**: Generate and download → Create ZIP with all certificates as PNG

### Core State Management
All state is managed with `useState` hooks in `App.jsx`:
- `step` (1-5): Current wizard step
- `backgroundImage`: Base64 encoded background image
- `excelData`: Array of data rows from Excel (excluding headers)
- `excelHeaders`: Column names from first row
- `fields`: Array of text field objects with position, font, color, and data binding
- `selectedFieldId`: Currently selected field for editing
- `previewIndex`: Current certificate being previewed (0 to excelData.length-1)

### Canvas Rendering System
Uses native Canvas API (NOT Fabric.js). The `useEffect` hook at line ~188 handles all canvas rendering:
- Draws background image
- Overlays text fields with data from Excel or custom text
- Applies scaling for responsive display
- Shows selection borders in step 3

**Mouse event handlers** (`handleCanvasMouseDown`, `handleCanvasMouseMove`, `handleCanvasMouseUp`) implement drag & drop by:
1. Detecting clicks on text fields using canvas text metrics
2. Tracking drag offset to maintain cursor position relative to field
3. Updating field coordinates in real-time

### Certificate Generation Process
Function `generateAllCertificates()` (line ~232):
1. Creates off-screen canvas (2000x1414px)
2. Loads background image
3. For each Excel row:
   - Clears canvas
   - Draws background
   - Draws all text fields with row data
   - Converts to PNG blob
   - Adds to ZIP with filename from first column
4. Downloads ZIP file named `certificados.zip`

## Key Dependencies

- **xlsx**: Parse Excel files (`.xlsx`, `.xls`)
- **jszip**: Generate ZIP archives with compression level 6
- **lucide-react**: Icon components
- **sweetalert2**: Modal dialogs for confirmations/errors
- **react-hot-toast**: Toast notifications for quick feedback
- **tailwindcss v4**: Utility-first CSS (configured via `@tailwindcss/vite`)

## UI/UX Patterns

### Notifications Strategy
- **SweetAlert2**: Use for confirmations (reset project, validation errors)
- **react-hot-toast**: Use for success/info messages (field added, file loaded, generation complete)
- Purple theme (#9333ea) for primary actions

### Canvas Interaction
- Click text fields to select them (shows blue border)
- Drag selected fields to reposition
- Mouse coordinates are scaled: `(e.clientX - rect.left) * (CANVAS_WIDTH / rect.width)`

### File Naming Convention
Certificate files are named based on the first column value of each row, sanitized with regex: `replace(/[^a-z0-9._-]/gi, '_')`

## Static Assets

- Logo: `public/img/logo.png` (displayed in header, clickable to reset project)

## Important Constants

```javascript
const CANVAS_WIDTH = 2000;   // Canva standard certificate width
const CANVAS_HEIGHT = 1414;  // Canva standard certificate height
```

## Styling Notes

- Canva-inspired design: large centered canvas, sidebar for controls
- Gradient backgrounds and hover effects throughout
- Step indicator in header shows progress with purple gradient circles
- Logo and title in header are clickable (reset to step 1 with confirmation)
