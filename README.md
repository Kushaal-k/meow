# AI Badge Studio

AI Badge Studio is a local image and video processing application that
automatically adds an AI badge/watermark to media.

It provides:

-   **Image badging** with automatic badge selection based on the image
    background.
-   **Video badging** with an animated badge that can be configured to
    appear after an intro and/or disappear before an outro.
-   **Batch processing** of multiple images or videos.
-   **ZIP processing** for image/video collections while preserving the
    folder structure.
-   Preview of selected files and processed results.
-   Individual downloads or download-all as a ZIP.
-   Dark/light UI mode.
-   Local processing through a Node.js/Express backend.
-   Packaged **macOS and Windows applications** are available in the
    GitHub Releases section.

The application is designed to run locally. Uploaded media is processed
by the local backend and temporary processing data is stored under the
operating system's temporary directory.

## Quick Start --- Run in a Browser

If you only want to use the application through a browser, **you do not
need to build the Electron application**.

You only need to pull the repository, install the Node.js dependencies,
start the local server, and open the displayed localhost URL.

### 1. Clone the repository

``` bash
git clone <repository-url>
cd ai-badge-studio
```

If you already have the repository locally, simply pull the latest code:

``` bash
git pull
```

### 2. Check Node.js

Check that Node.js is installed:

``` bash
node --version
```

Also check npm:

``` bash
npm --version
```

The project uses Node.js/npm and does not require Electron to be
launched separately when using browser mode.

### 3. Install dependencies

From the project root, run:

``` bash
npm install
```

This installs the application's Node.js dependencies, including the
image-processing and server-side packages required by the application.

> **Important:** Do not skip `npm install`. The browser UI communicates
> with the local Node.js backend, and the backend requires the installed
> dependencies.

### 4. Start the local server

Run:

``` bash
npm run server
```

The server starts on the local machine and normally uses:

``` text
http://127.0.0.1:3000
```

You should see output similar to:

``` text
====================================
          AI BADGE STUDIO
====================================

Running at http://127.0.0.1:3000
```

### 5. Open AI Badge Studio in your browser

Open a browser such as Chrome and go to:

``` text
http://127.0.0.1:3000
```

You should now see the AI Badge Studio interface.

**Do not open the HTML file directly from Finder/File Explorer.**

The application UI is served by the Express server, and the browser
communicates with backend API endpoints such as `/api/process`.
Therefore, the Node.js server must be running while you use the browser
version.

### 6. Using the application

Once the UI is open:

1.  Select **Images** or **Videos**.
2.  Add individual media files or a ZIP archive.
3.  Review the selected files/previews.
4.  For videos, configure the optional start/end timing if required.
5.  Click **Process**.
6.  Wait for processing to complete.
7.  Preview the processed files.
8.  Download individual files, selected files, or all processed files as
    a ZIP.

The browser frontend sends the selected media to the local backend for
processing and then displays the returned results.

## Browser Mode Architecture

Browser mode does **not** mean that the image/video processing itself is
performed entirely inside the browser.

The setup is:

``` text
Browser
   |
   | HTTP
   v
http://127.0.0.1:3000
   |
   v
Express / Node.js server
   |
   +---- Image processing
   |       |
   |       +---- Sharp
   |
   +---- Video processing
   |       |
   |       +---- FFmpeg / FFprobe
   |
   +---- Temporary files
           |
           +---- OS temporary directory
```

The frontend is served from the `public` directory, while the Node.js
server handles uploads, processing, ZIP extraction/creation, and
downloads.

## Running Browser Mode Step-by-Step

For someone setting up the project for the first time, the complete
sequence is:

### macOS / Linux

``` bash
git clone <repository-url>
cd ai-badge-studio
npm install
npm run server
```

Then open:

``` text
http://127.0.0.1:3000
```

### Windows

``` powershell
git clone <repository-url>
cd ai-badge-studio
npm install
npm run server
```

Then open:

``` text
http://127.0.0.1:3000
```

### If port 3000 is already in use

The server automatically attempts to use another available port when
port `3000` is occupied.

Always check the terminal output for:

``` text
Running at http://127.0.0.1:<actual-port>
```

Open the exact URL printed by the server.

## Images

The application supports the following image formats:

``` text
JPG
JPEG
PNG
WEBP
AVIF
TIF
TIFF
GIF
JP2
J2K
JPF
JPX
JPM
JXL
HEIC
HEIF
```

The UI supports processing up to **250 images at a time**.

### Image processing

For each image, the application:

1.  Reads the image using Sharp.
2.  Corrects image orientation where applicable.
3.  Samples the bottom-right portion of the image.
4.  Calculates the representative background color.
5.  Determines the appropriate AI badge variant.
6.  Resizes the badge relative to the source image.
7.  Places the badge in the bottom-right area.
8.  Writes the processed image using the original image format.

Processed image files use the naming pattern:

``` text
original-name-ai.extension
```

For example:

``` text
photo.jpg
```

becomes:

``` text
photo-ai.jpg
```

## Videos

The application supports:

``` text
MP4
MOV
WEBM
MKV
AVI
```

The UI supports up to **10 videos at a time**.

Video processing uses FFmpeg/FFprobe for metadata extraction, frame
extraction, badge overlay, encoding, and thumbnail generation.

### Video output

Processed videos are standardized to:

``` text
MP4
```

using H.264 video encoding. The output naming pattern is:

``` text
original-name-ai.mp4
```

For example:

``` text
presentation.mov
```

becomes:

``` text
presentation-ai.mp4
```

### Video badge timing

The video workflow supports:

-   Global start offset --- delay the badge by a specified number of
    seconds.
-   Global end offset --- hide the badge a specified number of seconds
    before the video ends.
-   Per-video timing overrides.

The badge can animate into the video from the right and, when an end
offset is configured, animate out before the end.

## FFmpeg Requirement for Video Processing

Video processing requires **FFmpeg and FFprobe**.

The application looks for these binaries in the packaged application's
resources and in the project's local `bin` directories. If they are not
found there, it falls back to the system `PATH`.

For development/browser mode, make sure the required FFmpeg binaries are
available either through the project's expected `bin` directory or
through your system `PATH`.

You can verify a system installation with:

``` bash
ffmpeg -version
ffprobe -version
```

If the repository already contains the platform-specific FFmpeg binaries
under `bin/`, no separate system installation is required.

The packaged macOS/Windows releases include the required application
resources/binaries, so users of the packaged releases do not need to
perform a development setup.

## ZIP Processing

The application can process a ZIP archive containing supported media.

For images:

-   Up to **250 images** can be processed.
-   The ZIP upload size is limited to **5 GB**.

For videos:

-   Up to **10 videos** can be processed.
-   The ZIP upload size is limited to **5 GB**.

The application can inspect ZIP contents and generate previews before
processing.

Folder structure inside a ZIP is preserved in the processed output.

For example:

``` text
input.zip
├── campaign-a/
│   ├── image1.jpg
│   └── image2.png
└── campaign-b/
    └── image3.webp
```

will produce corresponding processed files while retaining the directory
structure.

## Downloading Results

After processing, the application provides:

-   Individual file downloads.
-   Selection of multiple results for download.
-   Download-all as a ZIP archive.

Processed result files are stored temporarily by the local server and
are cleaned up when the server/application session is terminated.

## Running the Desktop Application

The repository also contains an Electron desktop application.

For normal users, **do not build the application yourself** if a
suitable packaged release is already available.

Go to the repository's **Releases** section and download the appropriate
build for your operating system.

### macOS

Use the macOS release/build provided in Releases.

The project supports both:

-   Apple Silicon (`arm64`)
-   Intel (`x64`)

### Windows

Use the Windows x64 release/build provided in Releases.

The project provides portable/ZIP packaging and can also be configured
for an NSIS installer.

### Desktop application architecture

The Electron application starts the same local Node.js backend and then
opens the UI in an Electron `BrowserWindow`.

Conceptually:

``` text
AI Badge Studio.app / Windows executable
              |
              v
        Electron
              |
              v
      Local Express server
              |
              v
      AI Badge Studio UI
```

The desktop application therefore provides a native desktop wrapper
around the local web application.

## Development Commands

The main npm scripts are:

  -----------------------------------------------------------------------
  Command                             Purpose
  ----------------------------------- -----------------------------------
  `npm start`                         Starts the Electron desktop
                                      application

  `npm run server`                    Starts the Node.js/Express server
                                      for browser mode

  `npm run build:win`                 Builds the Windows x64 application

  `npm run build:win:installer`       Builds the Windows x64 NSIS
                                      installer

  `npm run build:mac`                 Builds the macOS application

  `npm run build:mac:dmg`             Builds the macOS DMG

  `npm run build:all`                 Builds Windows and macOS
                                      applications

  `npm run pack`                      Creates an unpacked Electron
                                      application directory
  -----------------------------------------------------------------------

### Recommended command for normal development

If you want to work directly in the browser:

``` bash
npm install
npm run server
```

Then open:

``` text
http://127.0.0.1:3000
```

There is **no need to run `npm run build`** for browser development.

## Building the Desktop Application

Building is only necessary when you want to create a new packaged
macOS/Windows application.

### Windows

``` bash
npm install
npm run build:win
```

For the NSIS installer:

``` bash
npm run build:win:installer
```

### macOS

``` bash
npm install
npm run build:mac
```

For a DMG:

``` bash
npm run build:mac:dmg
```

Build output is generated in:

``` text
dist/
```

## Project Structure

The important project components are:

``` text
ai-badge-studio/
├── main.js                 # Electron application entry point
├── preload.js              # Electron preload/context bridge
├── server.js               # Express backend and processing API
├── package.json            # Dependencies, scripts and Electron Builder config
│
├── public/                 # Browser UI
│   └── ...
│
├── src/
│   ├── imageProcessor.js   # Image badge detection and processing
│   ├── videoProcessor.js   # Video badge processing
│   └── ...
│
├── assets/                 # Badge images, icons and application assets
│
├── bin/                    # Platform-specific binaries/resources
│
└── dist/                   # Generated desktop builds
```

## Important Notes

### Browser mode requires the backend server

Opening the frontend files directly is not the supported way to run the
application.

Use:

``` bash
npm run server
```

and access the application through the localhost URL printed in the
terminal.

### Processing is local

The browser communicates with the Node.js server running on the local
machine. Media is uploaded to that local server for processing rather
than being sent to a remote application server.

### Temporary storage

The server creates temporary directories under the operating system
temporary directory for uploads, extracted ZIP contents, thumbnails, and
processing results.

### Large files

The server is configured with a maximum upload file size of **5 GB**.
Large images/videos can require significant disk space, RAM, CPU, and
processing time.

### Video performance

Video encoding can be CPU/GPU intensive. The video processor attempts to
detect available hardware encoding support:

-   NVIDIA NVENC on supported NVIDIA systems.
-   Apple VideoToolbox on macOS when available.
-   Multi-threaded `libx264` CPU encoding as a fallback.

If hardware encoding fails, the application falls back to CPU-based
encoding.

## Troubleshooting

### `npm: command not found`

Install Node.js and npm, then reopen your terminal and verify:

``` bash
node --version
npm --version
```

### `Cannot find module ...`

Run:

``` bash
npm install
```

from the project root.

### Browser shows `This site can't be reached`

Make sure the server is running:

``` bash
npm run server
```

Then use the exact URL printed in the terminal.

### Port 3000 is already in use

The application attempts to select another available port automatically.
Check the terminal output and open the URL shown there.

### Video processing fails

Verify FFmpeg and FFprobe:

``` bash
ffmpeg -version
ffprobe -version
```

Also make sure the required platform-specific binaries are available in
the project's expected `bin` location if the project is intended to use
bundled binaries.

### Very large image fails to process

The application is configured to allow large images, but processing
extremely large images can still require substantial memory and
temporary disk space.

## Release Builds

Pre-built macOS and Windows applications are available from the
repository's **GitHub Releases** section.

For users who only need to use AI Badge Studio:

1.  Open **Releases**.
2.  Download the build for your operating system.
3.  Extract/install it as appropriate for the downloaded package.
4.  Launch AI Badge Studio.
5.  No source-code build is required.

For developers who need to run the application directly from source, use
the browser setup described above:

``` bash
git pull
npm install
npm run server
```

Then open:

``` text
http://127.0.0.1:3000
```

## License

ISC
