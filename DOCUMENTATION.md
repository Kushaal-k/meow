# AI Badge Studio — Documentation

## 1. Objective

The objective of this application is to provide a local, user-friendly solution for automatically adding AI badges to images and videos. It enables efficient individual and batch processing of media, with configurable video badge timing, automatic badge selection, manual badge overrides, preview of processed assets, and flexible download options.

- Automate AI badge addition to images and videos.
- Enable efficient **batch processing** of media assets.
- Provide configurable **video badge timing** to avoid logo/brand screen overlap.
- Allow **manual badge selection** when automatic selection needs to be overridden.
- Offer a dedicated **AI Voice Over** badge that is applied directly without colour detection.
- Support processing of **individual files and ZIP packages**.
- Provide easy **preview and download** of processed assets.
- Enable **local processing** of media without requiring remote uploads.

![](https://wiki.skoda.vwgroup.com/plugins/servlet/confluence/placeholder/macro?definition=e2ppcmE6a2V5PUNKQTAxLTMzMTk1fQ==&locale=en_US)
![](https://wiki.skoda.vwgroup.com/plugins/servlet/confluence/placeholder/macro?definition=e2ppcmE6a2V5PUNKQTAxLTMzMjI5fQ==&locale=en_US)

---

## 2. Existing Problem

- Assets currently need to be **manually edited to add the AI badge**.
- Manual editing is **time-consuming and repetitive**, especially for large numbers of assets.
- Video assets require additional manual effort to **position and time the badge** appropriately.
- There is no streamlined process to **process multiple assets in bulk**.
- Selecting the correct badge variant for different backgrounds is **inconsistent when done by hand**.

---

## 3. Solution Implemented

AI Badge Studio has been developed to automate the AI badging process for image and video assets.

The application provides:

- Separate **Images** and **Videos** tabs for a focused processing experience.
- Automatic AI badge selection for images based on the image background.
- Animated AI badge support for videos.
- A dedicated **AI Voice Over** badge variant.
- Configurable video badge display timing.
- Manual badge selection for individual images and videos.
- Ability to apply a manual badge selection to an entire package (global default).
- Batch processing of multiple images and videos.
- ZIP processing while preserving the original folder structure.
- Preview of selected and processed assets.
- Individual and multi-select asset downloads.
- Download-all functionality as a ZIP.
- Local processing through a Node.js/Express backend.
- Packaged applications for Windows and macOS.

---

## 4. Key Features

### 4.1 Separate Image and Video Processing

Images and videos are available in separate tabs to provide a cleaner and more focused processing experience. Users select the required media type and process assets through the corresponding workflow.

### 4.2 Image Badging

The application automatically determines the appropriate AI badge variant based on the image background.

The image processing workflow:

1. Reads the image using Sharp.
2. Corrects image orientation where applicable.
3. Samples the bottom-right portion of the image.
4. Calculates the representative background color.
5. Determines the appropriate AI badge variant.
6. Resizes the badge relative to the source image.
7. Places the badge in the bottom-right area.
8. Writes the processed image using the original image format.

Processed images follow the naming convention:

```
original-name-ai.extension
```

Example: `photo.jpg` becomes `photo-ai.jpg`.

### 4.3 Video Badging

The application supports video badging using an animated AI badge.

Supported video formats: `MP4`, `MOV`, `WEBM`, `MKV`, `AVI`.

Video processing uses FFmpeg/FFprobe for metadata extraction, frame extraction, badge overlay, encoding, and thumbnail generation. All processed videos are standardized to `.mp4` (H.264 / AAC) to ensure universal browser playback.

### 4.4 Video Badge Timing

To prevent the AI badge from overlapping with brand/logo screens, the application provides configurable badge timing:

- **Global Start Offset** — delays the badge by a specified number of seconds.
- **Global End Offset** — hides the badge a specified number of seconds before the video ends.
- **Per-Video Timing Overrides** — allows timing to be customized for individual videos.

The badge animates into the video from the right and can animate out before the end when an end offset is configured.

### 4.5 Automatic and Manual Badge Selection

The application supports automatic badge selection as well as manual overrides.

**Automatic Selection** — For images (and video sample frames), the appropriate colour badge variant is automatically selected based on the background using colour-distance and luminance analysis.

**Manual Selection** — Users can manually select the required badge:

- As a **global default** applied to the entire batch/package.
- As a **per-file override** for an individual image or video.

Manual selection overrides the automatic badge selection whenever a specific badge is required. When a specific badge is chosen, the automatic background-analysis step is skipped entirely.

#### Available badge variants

| Variant | Description | Selection behaviour |
|---|---|---|
| Auto | Smart detection based on background | Runs colour/luminance analysis |
| Light Badge | Optimised for light backgrounds | Applied directly |
| Dark Badge | Optimised for dark backgrounds | Applied directly |
| Electric Green Badge | Green brand background variant | Applied directly |
| Emerald Green Badge | Darker green brand background variant | Applied directly |
| **AI Voice Over** | Dedicated single overlay (see below) | Applied directly, no colour detection |

### 4.6 AI Voice Over Badge *(New)*

The **AI Voice Over** badge is a dedicated, single-variant overlay used to mark assets that contain AI-generated voice-over content.

Key characteristics:

- **No colour variants** — it is a single fixed overlay that is applied directly when selected.
- **Skips automatic detection** — when AI Voice Over is selected, the colour/luminance background analysis is not run, so it is applied consistently regardless of the asset background.
- **Available everywhere badges are selectable** — it appears both in the **Default Badge Variant** (global) selector and in the **per-image / per-video** badge selector.
- **Independent sizing** — it is rendered at a reduced size relative to the standard colour badges so it sits cleanly in the corner without dominating the asset. Its position (bottom-right) matches the other badges.
- **Simplified video animation** — on videos it uses an **opacity fade-in / fade-out** only (no slide-in or slide-out motion), appearing and disappearing smoothly at its final resting position.

The AI Voice Over selection is fully independent of the automatic colour-badge logic; selecting it does not affect, and is not affected by, the auto-detection behaviour used by the other variants.

### 4.7 Batch Processing

The application supports processing multiple assets in a single workflow:

- Up to **250 images** at a time.
- Up to **10 videos** at a time.

This significantly reduces the manual effort involved in editing assets individually.

### 4.8 ZIP Processing

The application supports ZIP archives containing supported media. ZIP processing provides:

- Batch processing of media collections.
- Preview of ZIP contents before processing.
- Preservation of the original folder structure.
- Processed output retaining the corresponding directory structure.

Example input:

```
input.zip
├── campaign-a/
│   ├── image1.jpg
│   └── image2.png
└── campaign-b/
    └── image3.webp
```

The processed output retains the same directory structure. The ZIP upload size is limited to **5 GB** for both image and video workflows.

### 4.9 Preview

The application provides previews of selected files and processed results, allowing users to review assets before downloading them.

### 4.10 Download Options

After processing, users can:

- Download individual processed assets.
- Select multiple processed assets for download.
- Download all processed assets together as a ZIP file.

---

## 5. Supported Formats

### Images

```
JPG, JPEG, PNG, WEBP, AVIF, TIF, TIFF, GIF,
JP2, J2K, JPF, JPX, JPM, JXL, HEIC, HEIF
```

### Videos

```
MP4, MOV, WEBM, MKV, AVI
```

---

## 6. Application Architecture

AI Badge Studio uses a local browser/frontend and Node.js/Express backend architecture.

```
Browser (UI)
     |
     |  HTTP (http://127.0.0.1:3000)
     v
Express / Node.js server
     |
     +---- Image processing  ----> Sharp
     |
     +---- Video processing  ----> FFmpeg / FFprobe
     |
     +---- ZIP extraction / creation
     |
     +---- Temporary files (OS temp directory)
```

The frontend is served from the `public` directory while the Node.js server handles uploads, media processing, ZIP extraction, ZIP creation, and downloads. The browser communicates with the local backend through API endpoints such as `/api/process`.

---

## 7. Local Processing

The application is designed for local processing. Media is uploaded from the browser to the Node.js server running on the user's local machine rather than being sent to a remote application server.

Temporary files — uploaded media, extracted ZIP contents, thumbnails, and processing results — are stored under the operating system's temporary directory and cleaned up when the server/application session is terminated.

### Open the Application

Open the displayed localhost URL in Chrome or another supported browser, for example:

```
http://127.0.0.1:3000
```

Do not open the HTML file directly from Finder/File Explorer, because the UI communicates with the backend API and requires the Node.js server to be running.

---

## 8. Using the Application

Once AI Badge Studio is open:

1. Select **Images** or **Videos**.
2. Add individual media files or a ZIP archive.
3. Review the selected files and previews.
4. For videos, configure the optional badge start/end timing.
5. Select a badge manually if an automatic selection needs to be overridden — set a **Default Badge Variant** for the whole batch and/or a **per-file** badge (including **AI Voice Over**).
6. Click **Process**.
7. Wait for processing to complete.
8. Preview the processed assets.
9. Download individual files, selected files, or all processed files as a ZIP.

---

## 9. Video Processing Requirements

Video processing requires **FFmpeg** and **FFprobe**. The application checks for these binaries in the packaged application's resources and the project `bin` directory. If they are not available there, it falls back to the system `PATH`.

Verify a system installation using:

```
ffmpeg -version
ffprobe -version
```

Packaged macOS and Windows releases include the required resources/binaries, so users of the packaged releases do not need to perform the development setup.

---

## 10. Desktop Application

AI Badge Studio also provides an Electron desktop application. Packaged releases are available for:

- **Windows** (`x64`)
- **macOS** — Apple Silicon (`arm64`) and Intel (`x64`)

For normal users, a packaged release should be used instead of building from source.

### Desktop Architecture

```
AI Badge Studio.app / Windows executable
              |
              v
           Electron
              |
              v
      Local Express Server
              |
              v
       AI Badge Studio UI
```

The Electron application acts as a native desktop wrapper around the local web application.

---

## 11. Development Commands

| Command | Purpose |
|---|---|
| `npm start` | Starts the Electron desktop application |
| `npm run server` | Starts the Node.js/Express server for browser mode |
| `npm run build:win` | Builds the Windows x64 application |
| `npm run build:win:installer` | Builds the Windows x64 NSIS installer |
| `npm run build:mac` | Builds the macOS application |
| `npm run build:mac:dmg` | Builds the macOS DMG |
| `npm run build:all` | Builds Windows and macOS applications |
| `npm run pack` | Creates an unpacked Electron application directory |

---

## 12. Building the Desktop Application

### Windows

```
npm install
npm run build:win
```

For the NSIS installer:

```
npm run build:win:installer
```

### macOS

```
npm install
npm run build:mac
```

For a DMG:

```
npm run build:mac:dmg
```

Build output is generated in `dist/`.

---

## 13. Project Structure

```
ai-badge-studio/
├── main.js                 # Electron application entry point
├── preload.js              # Electron preload/context bridge
├── server.js               # Express backend and processing API
├── package.json            # Dependencies, scripts and Electron Builder config
│
├── public/                 # Browser UI
│   ├── index.html
│   ├── app.js
│   └── style.css
│
├── src/
│   ├── imageProcessor.js   # Image badge detection and processing
│   └── videoProcessor.js   # Video badge processing
│
├── assets/                 # Badge images, icons and application assets
│                           #   (includes AI_Voice_Overlay.png)
├── bin/                    # Platform-specific FFmpeg/FFprobe binaries
│
└── dist/                   # Generated desktop builds
```

---

## 14. Performance and File Limits

- Maximum upload size: **5 GB**.
- Maximum images per batch: **250**.
- Maximum videos per batch: **10**.
- Large files can require significant disk space, RAM, CPU, and processing time.

Video encoding can be CPU/GPU intensive. The application attempts to use, in order:

1. **NVIDIA NVENC** on supported NVIDIA systems.
2. **Apple VideoToolbox** on macOS when available.
3. **Multi-threaded `libx264`** CPU encoding as a fallback.

---

## 15. Summary

AI Badge Studio provides an automated, local workflow for adding AI badges to image and video assets. It replaces the existing manual editing process with automatic badge selection, a dedicated **AI Voice Over** badge, configurable video timing, manual override options (global and per-file), batch and ZIP processing, previews, and flexible download capabilities.

The application is available as both a **local browser-based workflow** and a **packaged desktop application for Windows and macOS**.
