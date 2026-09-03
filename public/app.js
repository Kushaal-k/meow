const fileInput =
    document.getElementById('fileInput');

const dropZone =
    document.getElementById('dropZone');

const filesSection =
    document.getElementById('filesSection');

const fileGrid =
    document.getElementById('fileGrid');

const fileCount =
    document.getElementById('fileCount');

const clearButton =
    document.getElementById('clearButton');

const processButton =
    document.getElementById('processButton');

const layout =
    document.getElementById('layout');

const panelRight =
    document.getElementById('panelRight');

const processingState =
    document.getElementById('processingState');

const progressBar =
    document.getElementById('progressBar');

const progressText =
    document.getElementById('progressText');

const resultsState =
    document.getElementById('resultsState');

const successText =
    document.getElementById('successText');

const downloadButton =
    document.getElementById('downloadButton');

const againButton =
    document.getElementById('againButton');

const resultsPanel =
    document.getElementById('resultsPanel');

const resultsList =
    document.getElementById('resultsList');

const selectAllCheckbox =
    document.getElementById('selectAllCheckbox');

const downloadSelectedButton =
    document.getElementById('downloadSelectedButton');

const viewToggle =
    document.getElementById('viewToggle');

const singleResultPanel =
    document.getElementById('singleResultPanel');

const singlePreviewImg =
    document.getElementById('singlePreviewImg');

const singlePreviewTrigger =
    document.getElementById('singlePreviewTrigger');

const singleFileName =
    document.getElementById('singleFileName');

const singleFileMeta =
    document.getElementById('singleFileMeta');

const singlePreviewVideo =
    document.getElementById('singlePreviewVideo');

const tabImages =
    document.getElementById('tabImages');

const tabVideos =
    document.getElementById('tabVideos');

const dropZoneTitle =
    document.getElementById('dropZoneTitle');

const dropZoneSubtitle =
    document.getElementById('dropZoneSubtitle');

const dropZoneFormats =
    document.getElementById('dropZoneFormats');

const previewModal =
    document.getElementById('previewModal');

const modalBackdrop =
    document.getElementById('modalBackdrop');

const modalCloseBtn =
    document.getElementById('modalCloseBtn');

const modalFileName =
    document.getElementById('modalFileName');

const modalVideo =
    document.getElementById('modalVideo');

const modalDownloadBtn =
    document.getElementById('modalDownloadBtn');

const DOWNLOAD_ARROW_SVG = `<svg class="download-arrow-svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3" x2="12" y2="19"></line><polyline points="6 13 12 19 18 13"></polyline></svg>`;
const DOWNLOAD_ARROW_SMALL_SVG = `<svg class="download-arrow-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3" x2="12" y2="19"></line><polyline points="6 13 12 19 18 13"></polyline></svg>`;

const themeToggleBtn =
    document.getElementById('themeToggleBtn');

// ============================================================
// THEME MANAGEMENT (DARK / LIGHT MODE)
// ============================================================

function getPreferredTheme() {
    const stored = localStorage.getItem('ai_badge_studio_theme');
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ai_badge_studio_theme', theme);
    if (themeToggleBtn) {
        const isDark = theme === 'dark';
        themeToggleBtn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
        themeToggleBtn.setAttribute('title', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    }
}

if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme);
    });
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('ai_badge_studio_theme')) {
        applyTheme(e.matches ? 'dark' : 'light');
    }
});

applyTheme(document.documentElement.getAttribute('data-theme') || getPreferredTheme());

let currentMediaMode = 'images';
let selectedFiles = [];
let activeZipSession = null;
let selectedVideos = [];
let activeVideoZipSession = null;

const supportedExtensions = [
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
    '.avif',
    '.tif',
    '.tiff',
    '.gif',
    '.jp2',
    '.j2k',
    '.jpf',
    '.jpx',
    '.jpm',
    '.jxl',
    '.heic',
    '.heif'
];

const supportedVideoExtensions = [
    '.mp4',
    '.mov',
    '.webm',
    '.mkv',
    '.avi'
];

function isImage(file) {

    const extension =
        file.name
            .substring(
                file.name.lastIndexOf('.')
            )
            .toLowerCase();

    return supportedExtensions.includes(
        extension
    );
}

function isVideo(file) {
    const name = (file && file.name) ? file.name : (typeof file === 'string' ? file : '');
    const ext = name.substring(name.lastIndexOf('.')).toLowerCase();
    return supportedVideoExtensions.includes(ext);
}

function isZip(file) {

    return file.name
        .toLowerCase()
        .endsWith('.zip');
}

function createVideoThumbnail(file) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        const url = URL.createObjectURL(file);
        video.src = url;
        video.muted = true;
        video.playsInline = true;
        video.currentTime = 1;

        const cleanup = () => {
            video.onseeked = null;
            video.onerror = null;
            URL.revokeObjectURL(url);
        };

        video.onseeked = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = Math.min(320, video.videoWidth || 320);
                canvas.height = Math.min(240, video.videoHeight || 240);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/webp', 0.8);
                cleanup();
                resolve(dataUrl);
            } catch (_) {
                cleanup();
                resolve('');
            }
        };

        video.onerror = () => {
            cleanup();
            resolve('');
        };
    });
}

function switchMediaTab(mode) {
    if (mode === currentMediaMode) return;
    currentMediaMode = mode;

    if (mode === 'images') {
        tabImages.classList.add('active');
        tabImages.setAttribute('aria-selected', 'true');
        tabVideos.classList.remove('active');
        tabVideos.setAttribute('aria-selected', 'false');

        dropZoneTitle.textContent = 'Drop your files here';
        dropZoneSubtitle.textContent = 'Images or a ZIP containing images';
        dropZoneFormats.textContent = 'JPG · JPEG · PNG · WEBP · ZIP (Up to 250 images)';
        fileInput.accept = '.jpg,.jpeg,.png,.webp,.zip';
    } else {
        tabVideos.classList.add('active');
        tabVideos.setAttribute('aria-selected', 'true');
        tabImages.classList.remove('active');
        tabImages.setAttribute('aria-selected', 'false');

        dropZoneTitle.textContent = 'Drop your videos here';
        dropZoneSubtitle.textContent = 'Videos or a ZIP containing videos';
        dropZoneFormats.textContent = 'MP4 · MOV · WEBM · MKV · ZIP (Up to 10 videos, 5GB max)';
        fileInput.accept = '.mp4,.mov,.webm,.mkv,.zip';
    }

    renderFiles();
}

if (tabImages) tabImages.addEventListener('click', () => switchMediaTab('images'));
if (tabVideos) tabVideos.addEventListener('click', () => switchMediaTab('videos'));

function formatSize(bytes) {

    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    if (bytes < 1024 * 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}


// ============================================================
// PANEL RESIZER LOGIC
// ============================================================

const layoutResizer = document.getElementById('layoutResizer');

function getPanelBounds() {
    const minW = Math.round(window.innerWidth * 0.20);
    const maxW = Math.round(window.innerWidth * 0.50);
    return { minW, maxW };
}

function setPanelWidth(width) {
    const { minW, maxW } = getPanelBounds();
    const clampedWidth = Math.round(Math.min(Math.max(width, minW), maxW));

    layout.style.setProperty('--left-panel-width', `${clampedWidth}px`);
    localStorage.setItem('ai_badge_studio_panel_width', clampedWidth);
}

function initPanelResizer() {
    const { minW, maxW } = getPanelBounds();
    const defaultWidth = Math.round(window.innerWidth * 0.30);
    const savedWidth = parseInt(localStorage.getItem('ai_badge_studio_panel_width'), 10);

    if (savedWidth && !isNaN(savedWidth) && savedWidth >= minW && savedWidth <= maxW) {
        setPanelWidth(savedWidth);
    } else {
        setPanelWidth(defaultWidth);
    }

    if (!layoutResizer) return;

    let isDragging = false;

    function onPointerDown(e) {
        if (!layout.classList.contains('split')) return;
        isDragging = true;
        layoutResizer.classList.add('is-dragging');
        document.body.classList.add('is-resizing');
        e.preventDefault();
    }

    function onPointerMove(e) {
        if (!isDragging) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const layoutRect = layout.getBoundingClientRect();
        const newWidth = clientX - layoutRect.left;
        setPanelWidth(newWidth);
    }

    function onPointerUp() {
        if (!isDragging) return;
        isDragging = false;
        layoutResizer.classList.remove('is-dragging');
        document.body.classList.remove('is-resizing');
    }

    layoutResizer.addEventListener('mousedown', onPointerDown);
    layoutResizer.addEventListener('touchstart', onPointerDown, { passive: false });

    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('touchmove', onPointerMove, { passive: false });

    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('touchend', onPointerUp);

    // Double click to reset to default 30% width
    layoutResizer.addEventListener('dblclick', () => {
        setPanelWidth(Math.round(window.innerWidth * 0.30));
    });
}

initPanelResizer();

function setSplit(isSplit) {

    if (isSplit) {

        layout.classList.add('split');
        panelRight.classList.remove('hidden');
        document.querySelector('.hero').classList.add('hidden');
        document.querySelector('.main').classList.add('compact');

        const savedWidth = parseInt(localStorage.getItem('ai_badge_studio_panel_width'), 10);
        if (savedWidth && !isNaN(savedWidth)) {
            setPanelWidth(savedWidth);
        }

    } else {

        layout.classList.remove('split');
        panelRight.classList.add('hidden');
        document.querySelector('.hero').classList.remove('hidden');
        document.querySelector('.main').classList.remove('compact');
    }
}

function showPanelState(state) {

    processingState.classList.add('hidden');
    resultsState.classList.add('hidden');

    if (state === 'processing') {
        processingState.classList.remove('hidden');
    }

    if (state === 'results') {
        resultsState.classList.remove('hidden');
    }
}


// ============================================================
// FILE SELECTION
// ============================================================

async function inspectZipFile(zipFile) {
    const isVideoMode = currentMediaMode === 'videos';
    fileGrid.innerHTML = `
        <div class="zip-inspecting-state" style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; background: rgba(120, 250, 174, 0.05); border: 1px dashed var(--secondary); border-radius: 12px;">
            <div style="font-size: 38px; line-height: 1;">📦</div>
            <div style="margin-top: 14px; font-weight: 700; font-size: 15px; color: var(--secondary);">Inspecting ZIP Archive...</div>
            <div style="margin-top: 6px; font-size: 13px; color: var(--text-heading); font-weight: 600;">${zipFile.name} (${formatSize(zipFile.size)})</div>
            <div style="margin-top: 4px; font-size: 12px; color: var(--muted);">Extracting ${isVideoMode ? 'video' : 'image'} previews before processing...</div>
        </div>
    `;
    filesSection.classList.remove('hidden');
    setSplit(true);
    fileCount.textContent = 'Reading ZIP contents...';

    try {
        let response;
        if (zipFile.path) {
            // Electron mode: instant local inspection via path
            response = await fetch('/api/inspect-zip', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filePath: zipFile.path, mediaMode: currentMediaMode })
            });
        } else {
            // Web mode: send formData
            const fd = new FormData();
            fd.append('zipFile', zipFile);
            fd.append('mediaMode', currentMediaMode);
            response = await fetch('/api/inspect-zip', {
                method: 'POST',
                body: fd
            });
        }

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to inspect ZIP archive');
        }

        if (isVideoMode) {
            activeVideoZipSession = data;
            selectedVideos = [zipFile];
        } else {
            activeZipSession = data;
            selectedFiles = [zipFile];
        }
        renderFiles();

    } catch (err) {
        console.error(err);
        alert(`Could not preview ZIP files: ${err.message}`);
        if (isVideoMode) {
            activeVideoZipSession = null;
            selectedVideos = [zipFile];
        } else {
            activeZipSession = null;
            selectedFiles = [zipFile];
        }
        renderFiles();
    }
}

async function addFiles(files) {

    const incoming =
        Array.from(files);

    const zipFiles =
        incoming.filter(isZip);

    if (zipFiles.length > 1) {
        alert('Please select only one ZIP archive at a time.');
        return;
    }

    if (zipFiles.length === 1) {
        const zip = zipFiles[0];
        const MAX_ZIP_BYTES = 5 * 1024 * 1024 * 1024; // 5GB
        if (zip.size > MAX_ZIP_BYTES) {
            alert('ZIP file is too large. Maximum allowed size is 5GB.');
            return;
        }

        const currentSelection = currentMediaMode === 'videos' ? selectedVideos : selectedFiles;
        if (incoming.length > 1 || currentSelection.length > 0) {
            alert('Please select either a single ZIP file or individual files. Loading contents from the ZIP archive.');
        }

        await inspectZipFile(zip);
        return;
    }

    // VIDEO MODE
    if (currentMediaMode === 'videos') {
        if (activeVideoZipSession || selectedVideos.some(isZip)) {
            activeVideoZipSession = null;
            selectedVideos = [];
        }

        const videos = incoming.filter(isVideo);

        if (videos.length === 0) {
            alert('Please select supported video files (.mp4, .mov, .webm, .mkv, .avi) or a .zip file.');
            return;
        }

        const MAX_VIDEOS = 10;
        let videosToAdd = videos;

        if (selectedVideos.length + videos.length > MAX_VIDEOS) {
            const allowed = MAX_VIDEOS - selectedVideos.length;
            if (allowed <= 0) {
                alert(`Maximum limit of ${MAX_VIDEOS} videos reached. You already have ${MAX_VIDEOS} videos selected.`);
                return;
            }
            alert(`You can process up to ${MAX_VIDEOS} videos at a time. Only the first ${allowed} of your ${videos.length} selected videos were added.`);
            videosToAdd = videos.slice(0, allowed);
        }

        // Generate client-side thumbnails for videos
        for (const v of videosToAdd) {
            v._thumbUrl = await createVideoThumbnail(v);
            selectedVideos.push(v);
        }

        renderFiles();
        return;
    }

    // IMAGE MODE
    if (activeZipSession || selectedFiles.some(isZip)) {
        activeZipSession = null;
        selectedFiles = [];
    }

    const images =
        incoming.filter(isImage);

    if (images.length === 0) {
        alert(
            'Please select supported image files (.jpg, .jpeg, .png, .webp, etc.) or a .zip file.'
        );
        return;
    }

    const MAX_FILES = 250;

    if (selectedFiles.length + images.length > MAX_FILES) {
        const allowed = MAX_FILES - selectedFiles.length;
        if (allowed <= 0) {
            alert(`Maximum limit of ${MAX_FILES} images reached. You already have ${MAX_FILES} images selected.`);
            return;
        }
        alert(`You can process up to ${MAX_FILES} images at a time. Only the first ${allowed} of your ${images.length} selected images were added.`);
        selectedFiles.push(...images.slice(0, allowed));
    } else {
        selectedFiles.push(...images);
    }

    renderFiles();
}

// State for per-video timing overrides
let perVideoTimingState = {};

function createVideoTimingElement(fileName, index) {
    const globalStartInput = document.getElementById('globalStartOffset');
    const globalEndInput = document.getElementById('globalEndOffset');
    const globalStart = Math.max(0, parseFloat(globalStartInput ? globalStartInput.value : 0) || 0);
    const globalEnd = Math.max(0, parseFloat(globalEndInput ? globalEndInput.value : 0) || 0);

    const fileState = perVideoTimingState[fileName] || {
        custom: false,
        startOffset: globalStart,
        endOffset: globalEnd,
        expanded: false
    };

    const container = document.createElement('div');
    container.className = 'file-timing-box';

    let tagText = 'Default (0s / 0s)';
    let tagClass = 'tag-default';
    if (fileState.custom) {
        tagText = `Custom: ${fileState.startOffset}s / -${fileState.endOffset}s`;
        tagClass = 'tag-custom';
    } else if (globalStart > 0 || globalEnd > 0) {
        tagText = `Batch: ${globalStart}s / -${globalEnd}s`;
        tagClass = 'tag-batch';
    }

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = `file-timing-btn ${fileState.expanded ? 'is-open' : ''}`;
    toggleBtn.innerHTML = `
        <span class="file-timing-status ${tagClass}">
            <svg class="file-timing-svg-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span class="file-timing-status-text">${tagText}</span>
        </span>
        <span class="timing-chevron-wrap">
            <svg class="file-timing-chevron-svg" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
        </span>
    `;

    const drawer = document.createElement('div');
    drawer.className = `file-timing-drawer ${fileState.expanded ? 'open' : ''}`;
    drawer.innerHTML = `
        <div class="drawer-toggle-row">
            <label class="drawer-chk-label">
                <input type="checkbox" class="drawer-chk" ${fileState.custom ? 'checked' : ''}>
                <span class="drawer-chk-text">Custom for this video</span>
            </label>
        </div>
        <div class="drawer-steppers ${fileState.custom ? '' : 'is-disabled'}">
            <div class="file-stepper-row">
                <div class="file-stepper-label">Intro Delay</div>
                <div class="file-stepper-control">
                    <button type="button" class="file-step-btn file-step-down" title="Decrease intro">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </button>
                    <div class="file-step-center">
                        <input type="number" class="file-start-input" min="0" max="600" step="0.5" value="${fileState.custom ? fileState.startOffset : globalStart}" ${fileState.custom ? '' : 'disabled'}>
                        <span class="file-step-unit">sec</span>
                    </div>
                    <button type="button" class="file-step-btn file-step-up" title="Increase intro">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="18 15 12 9 6 15"></polyline>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="file-stepper-row">
                <div class="file-stepper-label">Outro Buffer</div>
                <div class="file-stepper-control">
                    <button type="button" class="file-step-btn file-step-down" title="Decrease outro">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </button>
                    <div class="file-step-center">
                        <input type="number" class="file-end-input" min="0" max="600" step="0.5" value="${fileState.custom ? fileState.endOffset : globalEnd}" ${fileState.custom ? '' : 'disabled'}>
                        <span class="file-step-unit">sec</span>
                    </div>
                    <button type="button" class="file-step-btn file-step-up" title="Increase outro">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="18 15 12 9 6 15"></polyline>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `;

    toggleBtn.onclick = (e) => {
        e.stopPropagation();
        fileState.expanded = !fileState.expanded;
        perVideoTimingState[fileName] = fileState;
        drawer.classList.toggle('open', fileState.expanded);
        toggleBtn.classList.toggle('is-open', fileState.expanded);
    };

    const chk = drawer.querySelector('.drawer-chk');
    const steppersWrap = drawer.querySelector('.drawer-steppers');
    const startInp = drawer.querySelector('.file-start-input');
    const endInp = drawer.querySelector('.file-end-input');

    const updateStatusTag = () => {
        const tagEl = toggleBtn.querySelector('.file-timing-status');
        const textEl = toggleBtn.querySelector('.file-timing-status-text');
        if (fileState.custom) {
            if (textEl) textEl.textContent = `Custom: ${fileState.startOffset}s / -${fileState.endOffset}s`;
            if (tagEl) tagEl.className = 'file-timing-status tag-custom';
        } else {
            const bText = (globalStart > 0 || globalEnd > 0) ? `Batch: ${globalStart}s / -${globalEnd}s` : 'Default (0s / 0s)';
            const bClass = (globalStart > 0 || globalEnd > 0) ? 'tag-batch' : 'tag-default';
            if (textEl) textEl.textContent = bText;
            if (tagEl) tagEl.className = `file-timing-status ${bClass}`;
        }
    };

    chk.onchange = (e) => {
        e.stopPropagation();
        fileState.custom = chk.checked;
        if (fileState.custom) {
            fileState.startOffset = Math.max(0, parseFloat(startInp.value) || 0);
            fileState.endOffset = Math.max(0, parseFloat(endInp.value) || 0);
            steppersWrap.classList.remove('is-disabled');
            startInp.disabled = false;
            endInp.disabled = false;
        } else {
            steppersWrap.classList.add('is-disabled');
            startInp.disabled = true;
            endInp.disabled = true;
            startInp.value = globalStart;
            endInp.value = globalEnd;
        }
        updateStatusTag();
        perVideoTimingState[fileName] = fileState;
    };

    startInp.oninput = (e) => {
        e.stopPropagation();
        if (fileState.custom) {
            fileState.startOffset = Math.max(0, parseFloat(startInp.value) || 0);
            updateStatusTag();
            perVideoTimingState[fileName] = fileState;
        }
    };

    endInp.oninput = (e) => {
        e.stopPropagation();
        if (fileState.custom) {
            fileState.endOffset = Math.max(0, parseFloat(endInp.value) || 0);
            updateStatusTag();
            perVideoTimingState[fileName] = fileState;
        }
    };

    // Connect SVG stepper arrow buttons for per-video controls
    drawer.querySelectorAll('.file-step-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            if (!fileState.custom) return;
            const isUp = btn.classList.contains('file-step-up');
            const controlBox = btn.closest('.file-stepper-control');
            const inp = controlBox ? controlBox.querySelector('input') : null;
            if (!inp) return;
            let val = parseFloat(inp.value) || 0;
            val = isUp ? val + 0.5 : Math.max(0, val - 0.5);
            inp.value = val;
            inp.dispatchEvent(new Event('input', { bubbles: true }));
        };
    });

    container.appendChild(toggleBtn);
    container.appendChild(drawer);
    return container;
}

function renderFiles() {

    fileGrid.innerHTML = '';

    const isVideoMode = currentMediaMode === 'videos';
    const activeList = isVideoMode ? selectedVideos : selectedFiles;
    const activeSession = isVideoMode ? activeVideoZipSession : activeZipSession;

    const videoTimingSettings = document.getElementById('videoTimingSettings');
    if (videoTimingSettings) {
        if (isVideoMode && (activeList.length > 0 || activeSession)) {
            videoTimingSettings.classList.remove('hidden');
        } else {
            videoTimingSettings.classList.add('hidden');
        }
    }

    if (activeList.length === 0 && !activeSession) {

        filesSection.classList.add(
            'hidden'
        );

        setSplit(false);

        return;
    }

    filesSection.classList.remove(
        'hidden'
    );

    setSplit(true);

    // Render ZIP previews before processing
    if (activeSession && activeSession.files) {

        fileCount.textContent =
            `${activeSession.files.length} ${isVideoMode ? 'videos' : 'images'} found in ${activeSession.zipName}`;

        activeSession.files.forEach(
            (file, index) => {

                const card =
                    document.createElement('div');
                card.className = 'file-card';

                const preview =
                    document.createElement('img');
                preview.className = 'file-preview';
                preview.src = file.thumbUrl;
                preview.alt = file.name;

                const name =
                    document.createElement('div');
                name.className = 'file-name';
                name.textContent = file.name;

                const size =
                    document.createElement('div');
                size.className = 'file-size';
                size.textContent = `${formatSize(file.size)} · ${isVideoMode ? 'VIDEO' : 'ZIP'}`;

                const remove =
                    document.createElement('button');
                remove.className = 'remove-file';
                remove.textContent = '×';
                remove.title = 'Remove this file from processing';
                remove.onclick = (e) => {
                    e.stopPropagation();
                    activeSession.files.splice(index, 1);
                    if (activeSession.files.length === 0) {
                        if (isVideoMode) {
                            activeVideoZipSession = null;
                            selectedVideos = [];
                        } else {
                            activeZipSession = null;
                            selectedFiles = [];
                        }
                    }
                    renderFiles();
                };

                card.appendChild(preview);
                card.appendChild(name);
                card.appendChild(size);
                if (isVideoMode) {
                    card.appendChild(createVideoTimingElement(file.name, index));
                }
                card.appendChild(remove);

                fileGrid.appendChild(card);
            }
        );

        return;
    }

    // Render normal files (individual images or videos)
    fileCount.textContent =
        `${activeList.length} ${
            activeList.length === 1
                ? (isVideoMode ? 'video' : 'file')
                : (isVideoMode ? 'videos' : 'files')
        } selected`;

    activeList.forEach(
        (file, index) => {

            const card =
                document.createElement(
                    'div'
                );

            card.className =
                'file-card';

            let preview;
            if (isVideoMode) {
                if (file._thumbUrl) {
                    preview = document.createElement('img');
                    preview.className = 'file-preview';
                    preview.src = file._thumbUrl;
                } else {
                    preview = document.createElement('div');
                    preview.className = 'file-preview file-preview-zip';
                    preview.innerHTML = '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.9;"><rect x="2" y="4" width="20" height="16" rx="3"></rect><path d="M7 4v16"></path><path d="M17 4v16"></path><path d="M2 12h20"></path></svg><span style="font-size: 11px; font-weight: 800; letter-spacing: 0.6px; margin-top: 6px;">VIDEO</span>';
                }
            } else {
                preview = document.createElement('img');
                preview.className = 'file-preview';
                preview.src = URL.createObjectURL(file);
            }

            preview.alt = file.name;

            card.appendChild(
                preview
            );

            const name =
                document.createElement(
                    'div'
                );

            name.className =
                'file-name';

            name.textContent =
                file.name;

            const size =
                document.createElement(
                    'div'
                );

            size.className =
                'file-size';

            size.textContent =
                formatSize(file.size);

            const remove =
                document.createElement(
                    'button'
                );

            remove.className =
                'remove-file';

            remove.textContent = '×';

            remove.onclick = (e) => {
                e.stopPropagation();

                activeList.splice(
                    index,
                    1
                );

                renderFiles();
            };

            card.appendChild(name);
            card.appendChild(size);
            if (isVideoMode) {
                card.appendChild(createVideoTimingElement(file.name, index));
            }
            card.appendChild(remove);

            fileGrid.appendChild(card);
        }
    );
}

fileInput.addEventListener(
    'change',
    event => {

        addFiles(
            event.target.files
        );

        fileInput.value = '';
    }
);

[
    'dragenter',
    'dragover'
].forEach(eventName => {

    dropZone.addEventListener(
        eventName,
        event => {

            event.preventDefault();

            dropZone.classList.add(
                'dragging'
            );
        }
    );
});

[
    'dragleave',
    'drop'
].forEach(eventName => {

    dropZone.addEventListener(
        eventName,
        event => {

            event.preventDefault();

            dropZone.classList.remove(
                'dragging'
            );
        }
    );
});

dropZone.addEventListener(
    'drop',
    event => {

        addFiles(
            event.dataTransfer.files
        );
    }
);

clearButton.onclick = () => {

    if (currentMediaMode === 'videos') {
        selectedVideos = [];
        activeVideoZipSession = null;
        perVideoTimingState = {};
    } else {
        selectedFiles = [];
        activeZipSession = null;
    }

    renderFiles();
};

// Global video timing controls & listeners
const globalStartOffset = document.getElementById('globalStartOffset');
const globalEndOffset = document.getElementById('globalEndOffset');
const resetTimingBtn = document.getElementById('resetTimingBtn');

if (globalStartOffset && globalEndOffset) {
    const updateBatchBadges = () => {
        const gStart = Math.max(0, parseFloat(globalStartOffset.value) || 0);
        const gEnd = Math.max(0, parseFloat(globalEndOffset.value) || 0);
        document.querySelectorAll('.file-card').forEach(card => {
            const statusTag = card.querySelector('.file-timing-status');
            if (statusTag && !statusTag.classList.contains('tag-custom')) {
                if (gStart > 0 || gEnd > 0) {
                    statusTag.textContent = `Batch: ${gStart}s / -${gEnd}s`;
                    statusTag.className = 'file-timing-status tag-batch';
                } else {
                    statusTag.textContent = 'Default (0s / 0s)';
                    statusTag.className = 'file-timing-status tag-default';
                }
                const startInp = card.querySelector('.file-start-input');
                const endInp = card.querySelector('.file-end-input');
                if (startInp && startInp.disabled) startInp.value = gStart;
                if (endInp && endInp.disabled) endInp.value = gEnd;
            }
        });
    };
    globalStartOffset.addEventListener('input', updateBatchBadges);
    globalEndOffset.addEventListener('input', updateBatchBadges);
}

if (resetTimingBtn) {
    resetTimingBtn.addEventListener('click', () => {
        if (globalStartOffset) globalStartOffset.value = 0;
        if (globalEndOffset) globalEndOffset.value = 0;
        perVideoTimingState = {};
        renderFiles();
    });
}

// Connect SVG stepper arrows for global/batch controls
document.querySelectorAll('.stepper-arrow-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = btn.dataset.target;
        const targetInput = document.getElementById(targetId);
        if (!targetInput) return;
        const isUp = btn.classList.contains('stepper-up');
        let val = parseFloat(targetInput.value) || 0;
        val = isUp ? val + 0.5 : Math.max(0, val - 0.5);
        targetInput.value = val;
        targetInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
});

let currentView = 'card';

viewToggle.addEventListener('click', event => {

    const button =
        event.target.closest('.view-toggle-btn');

    if (!button) {
        return;
    }

    currentView = button.dataset.view;

    viewToggle
        .querySelectorAll('.view-toggle-btn')
        .forEach(btn => {

            btn.classList.toggle(
                'active',
                btn === button
            );
        });

    resultsList.classList.toggle(
        'row-view',
        currentView === 'row'
    );
});


// ============================================================
// MODAL LIGHTBOX HELPERS
// ============================================================

function openModal(file) {
    if (!file) return;

    modalFileName.textContent = file.name || 'Preview';
    modalDownloadBtn.href = file.url || file.previewUrl;
    modalDownloadBtn.download = file.name || 'file';

    const isVideoFile = file.mediaType === 'video' || (file.name && isVideo(file.name));

    if (isVideoFile && modalVideo) {
        modalImg.classList.add('hidden');
        modalVideo.classList.remove('hidden');
        modalVideo.src = file.previewUrl || file.url;
        modalVideo.play().catch(() => {});
    } else {
        if (modalVideo) {
            modalVideo.pause();
            modalVideo.src = '';
            modalVideo.classList.add('hidden');
        }
        modalImg.classList.remove('hidden');
        modalImg.src = file.previewUrl || file.url;
    }

    previewModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    previewModal.classList.add('hidden');
    modalImg.src = '';
    if (modalVideo) {
        modalVideo.pause();
        modalVideo.src = '';
        modalVideo.classList.add('hidden');
    }
    document.body.style.overflow = '';
}

if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', closeModal);
}

if (modalBackdrop) {
    modalBackdrop.addEventListener('click', closeModal);
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && previewModal && !previewModal.classList.contains('hidden')) {
        closeModal();
    }
});


// ============================================================
// RESULTS RENDERING
// ============================================================

function renderResults(result) {

    resultsList.classList.remove('row-view');
    currentView = 'card';

    viewToggle
        .querySelectorAll('.view-toggle-btn')
        .forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === 'card');
        });

    resultsList.innerHTML = '';

    const files = result.files || [];

    /*
     * Single file: Show dedicated high-res preview card
     */
    if (files.length <= 1) {

        resultsPanel.classList.add('hidden');

        if (files.length === 1) {

            const singleFile = files[0];
            const isVideoResult = singleFile.mediaType === 'video' || result.mediaType === 'video' || (singleFile.name && isVideo(singleFile.name));

            singleResultPanel.classList.remove('hidden');

            if (isVideoResult && singlePreviewVideo) {
                singlePreviewImg.classList.add('hidden');
                singlePreviewVideo.classList.remove('hidden');
                singlePreviewVideo.src = singleFile.previewUrl || singleFile.url;
            } else {
                if (singlePreviewVideo) {
                    singlePreviewVideo.classList.add('hidden');
                    singlePreviewVideo.pause();
                    singlePreviewVideo.src = '';
                }
                singlePreviewImg.classList.remove('hidden');
                singlePreviewImg.src = singleFile.previewUrl || singleFile.url;
            }

            singleFileName.textContent = singleFile.name;
            singleFileMeta.textContent = isVideoResult ? 'AI Badge seamlessly encoded into video' : 'Intelligent AI Badge successfully embedded';

            singlePreviewTrigger.onclick = () => {
                openModal(singleFile);
            };

            downloadButton.href =
                singleFile.url;

            downloadButton.innerHTML =
                `${DOWNLOAD_ARROW_SVG}<span>Download ${singleFile.name}</span>`;

            downloadButton.classList.remove('hidden');

        } else {

            singleResultPanel.classList.add('hidden');
            downloadButton.classList.add('hidden');
        }

        return;
    }


    /*
     * Multiple files: show the checklist
     * plus the "download all" zip button.
     */

    singleResultPanel.classList.add('hidden');
    resultsPanel.classList.remove('hidden');

    selectAllCheckbox.checked = false;

    files.forEach(file => {

        const row =
            document.createElement('div');

        row.className = 'result-row';

        const isVideoItem = file.mediaType === 'video' || isVideo(file.name);

        const thumbWrapper =
            document.createElement('div');
        thumbWrapper.className = 'result-thumb-wrapper';

        let thumb;
        if (file.thumbUrl && !file.thumbUrl.endsWith('.mp4')) {
            thumb = document.createElement('img');
            thumb.className = 'result-thumb';
            thumb.src = file.thumbUrl;
            thumb.alt = file.name;
        } else if (isVideoItem) {
            thumb = document.createElement('video');
            thumb.className = 'result-thumb result-video-thumb';
            thumb.src = (file.previewUrl || file.url) + '#t=0.5';
            thumb.preload = 'metadata';
            thumb.muted = true;
            thumb.playsInline = true;
        } else {
            thumb = document.createElement('img');
            thumb.className = 'result-thumb';
            thumb.src = file.previewUrl || file.url;
            thumb.alt = file.name;
        }

        thumb.title = 'Click to preview full size';
        thumb.addEventListener('click', (e) => {
            e.stopPropagation();
            openModal(file);
        });

        thumbWrapper.appendChild(thumb);

        if (isVideoItem) {
            const badge = document.createElement('span');
            badge.className = 'result-badge-type';
            badge.textContent = '▶ VIDEO';
            thumbWrapper.appendChild(badge);
        }

        const checkbox =
            document.createElement('input');

        checkbox.type = 'checkbox';
        checkbox.className = 'result-checkbox';
        checkbox.dataset.url = file.url;
        checkbox.dataset.name = file.name;

        const name =
            document.createElement('div');

        name.className = 'result-name';
        name.textContent = file.name;

        const link =
            document.createElement('a');

        link.className = 'result-download';
        link.href = file.url;
        link.innerHTML = `${DOWNLOAD_ARROW_SMALL_SVG}<span>Download</span>`;
        link.download = file.name;

        row.appendChild(checkbox);
        row.appendChild(thumbWrapper);
        row.appendChild(name);
        row.appendChild(link);

        row.addEventListener('click', (e) => {
            if (e.target !== checkbox && e.target !== link && e.target !== thumb) {
                openModal(file);
            }
        });

        resultsList.appendChild(row);
    });

    const isVideoResult = currentMediaMode === 'videos' || result.mediaType === 'video';
    const downloadAllUrl =
        result.downloadAllUrl ||
        result.downloadUrl;

    if (downloadAllUrl) {

        downloadButton.href = downloadAllUrl;

        downloadButton.innerHTML = isVideoResult
            ? `${DOWNLOAD_ARROW_SVG}<span>Download All Videos (ZIP)</span>`
            : `${DOWNLOAD_ARROW_SVG}<span>Download All (ZIP)</span>`;

        downloadButton.classList.remove('hidden');

    } else {

        downloadButton.classList.add('hidden');
    }

    if (againButton) {
        againButton.textContent = isVideoResult
            ? 'Process more videos'
            : 'Process more images';
    }
}

selectAllCheckbox.addEventListener(
    'change',
    () => {

        document
            .querySelectorAll('.result-checkbox')
            .forEach(checkbox => {

                checkbox.checked =
                    selectAllCheckbox.checked;
            });
    }
);

downloadSelectedButton.onclick = () => {

    const checked =
        Array.from(
            document.querySelectorAll(
                '.result-checkbox:checked'
            )
        );

    if (checked.length === 0) {

        alert('Select at least one file to download.');

        return;
    }

    /*
     * Stagger the downloads slightly —
     * browsers can block a burst of
     * simultaneous downloads.
     */
    checked.forEach((checkbox, index) => {

        setTimeout(() => {

            const link =
                document.createElement('a');

            link.href = checkbox.dataset.url;
            link.download = checkbox.dataset.name;

            document.body.appendChild(link);

            link.click();

            link.remove();

        }, index * 300);
    });
};


// ============================================================
// PROCESS
// ============================================================

processButton.onclick =
    async function () {

        const isVideoMode = currentMediaMode === 'videos';
        const activeList = isVideoMode ? selectedVideos : selectedFiles;
        const activeSession = isVideoMode ? activeVideoZipSession : activeZipSession;

        if (activeList.length === 0 && !activeSession) {
            return;
        }

        const isZipMode =
            (activeList.length === 1 && isZip(activeList[0])) ||
            Boolean(activeSession);

        showPanelState('processing');

        const processingTitle = document.getElementById('processingTitle');
        if (processingTitle) {
            processingTitle.textContent = isVideoMode ? 'Processing your videos' : 'Processing your images';
        }

        progressBar.style.width =
            '20%';

        progressText.textContent =
            isVideoMode
                ? (isZipMode ? 'Uploading and inspecting video archive...' : 'Uploading and preparing video...')
                : (isZipMode ? 'Uploading and extracting ZIP archive...' : 'Uploading files...');

        const formData =
            new FormData();

        formData.append('mediaMode', currentMediaMode);

        if (isVideoMode) {
            const gStart = Math.max(0, parseFloat(document.getElementById('globalStartOffset')?.value) || 0);
            const gEnd = Math.max(0, parseFloat(document.getElementById('globalEndOffset')?.value) || 0);
            formData.append('videoTimingGlobal', JSON.stringify({ startOffset: gStart, endOffset: gEnd }));

            const perFileTiming = {};
            for (const [fName, state] of Object.entries(perVideoTimingState)) {
                if (state && state.custom) {
                    perFileTiming[fName] = {
                        startOffset: Math.max(0, parseFloat(state.startOffset) || 0),
                        endOffset: Math.max(0, parseFloat(state.endOffset) || 0)
                    };
                }
            }
            formData.append('videoTimingPerFile', JSON.stringify(perFileTiming));
        }

        if (activeSession && activeSession.inspectionId) {
            formData.append(
                'inspectionId',
                activeSession.inspectionId
            );
        } else {
            activeList.forEach(
                file => {

                    formData.append(
                        'files',
                        file
                    );
                }
            );
        }

        try {

            progressBar.style.width =
                '50%';

            progressText.textContent =
                isVideoMode
                    ? 'Encoding video stream with intelligent AI badge... (this may take a few moments)'
                    : (isZipMode
                        ? 'Processing images from ZIP archive...'
                        : 'Processing images...');

            const response =
                await fetch(
                    '/api/process',
                    {
                        method: 'POST',
                        body: formData
                    }
                );

            const rawText = await response.text();
            let result;

            try {
                result = JSON.parse(rawText);
            } catch (jsonErr) {
                console.error('Non-JSON server response:', rawText);
                const cleanError = rawText
                    .replace(/<[^>]*>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .slice(0, 160);
                throw new Error(cleanError || `Server returned error (${response.status})`);
            }

            if (!response.ok) {
                throw new Error(
                    result.error ||
                    'Processing failed'
                );
            }

            const isVideoResult = currentMediaMode === 'videos' || result.mediaType === 'video';
            const unitSingular = isVideoResult ? 'video' : 'image';
            const unitPlural = isVideoResult ? 'videos' : 'images';
            const zipName = (activeList.length > 0 && activeList[0].name)
                ? activeList[0].name
                : (activeSession ? activeSession.zipName : 'ZIP archive');

            progressBar.style.width =
                '100%';

            progressText.textContent =
                `${result.processed} ${
                    result.processed === 1
                        ? unitSingular
                        : unitPlural
                } processed`;

            showPanelState('results');

            successText.textContent =
                isZipMode
                    ? `${result.processed} ${
                        result.processed === 1
                            ? `${unitSingular} was`
                            : `${unitPlural} were`
                    } processed from ${zipName}.`
                    : `${result.processed} ${
                        result.processed === 1
                            ? `${unitSingular} was`
                            : `${unitPlural} were`
                    } processed successfully.`;

            renderResults(result);

        } catch (error) {

            console.error(error);

            alert(
                `Processing failed: ${error.message}`
            );

            showPanelState('processing');

            panelRight.classList.add('hidden');

            layout.classList.remove('split');

            filesSection.classList.remove(
                'hidden'
            );
        }
    };

againButton.onclick = () => {

    selectedFiles = [];
    activeZipSession = null;
    selectedVideos = [];
    activeVideoZipSession = null;

    renderFiles();

    progressBar.style.width = '0%';

    singleResultPanel.classList.add('hidden');
    resultsPanel.classList.add('hidden');
    downloadButton.classList.remove('hidden');
    closeModal();
};