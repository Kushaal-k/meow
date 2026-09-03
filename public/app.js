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

const previewModal =
    document.getElementById('previewModal');

const modalBackdrop =
    document.getElementById('modalBackdrop');

const modalCloseBtn =
    document.getElementById('modalCloseBtn');

const modalFileName =
    document.getElementById('modalFileName');

const modalDownloadBtn =
    document.getElementById('modalDownloadBtn');

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

let selectedFiles = [];
let activeZipSession = null;

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

function isZip(file) {

    return file.name
        .toLowerCase()
        .endsWith('.zip');
}

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
    fileGrid.innerHTML = `
        <div class="zip-inspecting-state" style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; background: rgba(120, 250, 174, 0.05); border: 1px dashed var(--secondary); border-radius: 12px;">
            <div style="font-size: 38px; line-height: 1;">📦</div>
            <div style="margin-top: 14px; font-weight: 700; font-size: 15px; color: var(--secondary);">Inspecting ZIP Archive...</div>
            <div style="margin-top: 6px; font-size: 13px; color: var(--text-heading); font-weight: 600;">${zipFile.name} (${formatSize(zipFile.size)})</div>
            <div style="margin-top: 4px; font-size: 12px; color: var(--muted);">Extracting image previews before processing...</div>
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
                body: JSON.stringify({ filePath: zipFile.path })
            });
        } else {
            // Web mode: send formData
            const fd = new FormData();
            fd.append('zipFile', zipFile);
            response = await fetch('/api/inspect-zip', {
                method: 'POST',
                body: fd
            });
        }

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to inspect ZIP archive');
        }

        activeZipSession = data;
        selectedFiles = [zipFile];
        renderFiles();

    } catch (err) {
        console.error(err);
        alert(`Could not preview ZIP images: ${err.message}`);
        activeZipSession = null;
        selectedFiles = [zipFile];
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

        if (incoming.length > 1 || selectedFiles.length > 0) {
            alert('Please select either a single ZIP file or individual images. Loading images from the ZIP archive.');
        }

        await inspectZipFile(zip);
        return;
    }

    // Normal images mode: if a ZIP was previously selected, clear it
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

function renderFiles() {

    fileGrid.innerHTML = '';

    if (selectedFiles.length === 0 && !activeZipSession) {

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

    // Render ZIP image previews before processing
    if (activeZipSession && activeZipSession.files) {

        fileCount.textContent =
            `${activeZipSession.files.length} images found in ${activeZipSession.zipName}`;

        activeZipSession.files.forEach(
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
                size.textContent = `${formatSize(file.size)} · ZIP`;

                const remove =
                    document.createElement('button');
                remove.className = 'remove-file';
                remove.textContent = '×';
                remove.title = 'Remove this image from processing';
                remove.onclick = (e) => {
                    e.stopPropagation();
                    activeZipSession.files.splice(index, 1);
                    if (activeZipSession.files.length === 0) {
                        activeZipSession = null;
                        selectedFiles = [];
                    }
                    renderFiles();
                };

                card.appendChild(preview);
                card.appendChild(name);
                card.appendChild(size);
                card.appendChild(remove);

                fileGrid.appendChild(card);
            }
        );

        return;
    }

    // Render normal individual image files
    fileCount.textContent =
        `${selectedFiles.length} ${
            selectedFiles.length === 1
                ? 'file'
                : 'files'
        } selected`;

    selectedFiles.forEach(
        (file, index) => {

            const card =
                document.createElement(
                    'div'
                );

            card.className =
                'file-card';

            const preview =
                document.createElement(
                    'img'
                );

            preview.className =
                'file-preview';

            preview.src =
                URL.createObjectURL(file);

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

                selectedFiles.splice(
                    index,
                    1
                );

                renderFiles();
            };

            card.appendChild(name);
            card.appendChild(size);
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

    selectedFiles = [];
    activeZipSession = null;

    renderFiles();
};

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

    modalFileName.textContent = file.name || 'Image Preview';
    modalImg.src = file.previewUrl || file.url;
    modalDownloadBtn.href = file.url || file.previewUrl;
    modalDownloadBtn.download = file.name || 'image.png';

    previewModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    previewModal.classList.add('hidden');
    modalImg.src = '';
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

            singleResultPanel.classList.remove('hidden');
            singlePreviewImg.src = singleFile.previewUrl || singleFile.url;
            singleFileName.textContent = singleFile.name;
            singleFileMeta.textContent = 'Intelligent AI Badge successfully embedded';

            singlePreviewTrigger.onclick = () => {
                openModal(singleFile);
            };

            downloadButton.href =
                singleFile.url;

            downloadButton.textContent =
                `↓  Download ${singleFile.name}`;

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

        const thumb =
            document.createElement('img');

        thumb.className = 'result-thumb';
        thumb.src = file.previewUrl || file.url;
        thumb.alt = file.name;
        thumb.title = 'Click to preview full size';

        thumb.addEventListener('click', (e) => {
            e.stopPropagation();
            openModal(file);
        });

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
        link.textContent = '↓ Download';
        link.download = file.name;

        row.appendChild(thumb);
        row.appendChild(checkbox);
        row.appendChild(name);
        row.appendChild(link);

        row.addEventListener('click', (e) => {
            if (e.target !== checkbox && e.target !== link && e.target !== thumb) {
                openModal(file);
            }
        });

        resultsList.appendChild(row);
    });

    const downloadAllUrl =
        result.downloadAllUrl ||
        result.downloadUrl;

    if (downloadAllUrl) {

        downloadButton.href = downloadAllUrl;

        downloadButton.textContent =
            '↓  Download All (ZIP)';

        downloadButton.classList.remove('hidden');

    } else {

        downloadButton.classList.add('hidden');
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

        if (selectedFiles.length === 0) {
            return;
        }

        showPanelState('processing');

        const isZipMode =
            selectedFiles.length === 1 &&
            isZip(selectedFiles[0]);

        progressBar.style.width =
            '20%';

        progressText.textContent =
            isZipMode
                ? 'Uploading and extracting ZIP archive...'
                : 'Uploading files...';

        const formData =
            new FormData();

        if (activeZipSession && activeZipSession.inspectionId) {
            formData.append(
                'inspectionId',
                activeZipSession.inspectionId
            );
        } else {
            selectedFiles.forEach(
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
                isZipMode
                    ? 'Processing images from ZIP archive...'
                    : 'Processing images...';

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

            progressBar.style.width =
                '100%';

            progressText.textContent =
                `${result.processed} ${
                    result.processed === 1
                        ? 'image'
                        : 'images'
                } processed`;

            showPanelState('results');

            successText.textContent =
                isZipMode
                    ? `${result.processed} ${
                        result.processed === 1
                            ? 'image was'
                            : 'images were'
                    } processed from ${selectedFiles[0].name}.`
                    : `${result.processed} ${
                        result.processed === 1
                            ? 'image was'
                            : 'images were'
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

    renderFiles();

    progressBar.style.width = '0%';

    singleResultPanel.classList.add('hidden');
    resultsPanel.classList.add('hidden');
    downloadButton.classList.remove('hidden');
    closeModal();
};