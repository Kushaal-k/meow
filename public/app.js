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

let selectedFiles = [];

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

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}


// ============================================================
// LAYOUT STATE HELPERS
// ============================================================

function setSplit(isSplit) {

    if (isSplit) {

        layout.classList.add('split');
        panelRight.classList.remove('hidden');
        document.querySelector('.hero').classList.add('hidden');
        document.querySelector('.main').classList.add('compact');

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

function addFiles(files) {

    const incoming =
        Array.from(files);

    const zip =
        incoming.find(isZip);

    if (zip) {

        alert(
            'ZIP processing will be added next. For now, please select image files.'
        );

        return;
    }

    const images =
        incoming.filter(isImage);

    if (images.length === 0) {

        alert(
            'Please select supported image files.'
        );

        return;
    }

    selectedFiles.push(...images);

    renderFiles();
}

function renderFiles() {

    fileGrid.innerHTML = '';

    if (selectedFiles.length === 0) {

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

            remove.onclick = () => {

                selectedFiles.splice(
                    index,
                    1
                );

                renderFiles();
            };

            card.appendChild(preview);
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
     * Single file: just show the plain
     * download button, skip the list.
     */
    if (files.length <= 1) {

        resultsPanel.classList.add('hidden');

        if (files.length === 1) {

            downloadButton.href =
                files[0].url;

            downloadButton.textContent =
                `↓  Download ${files[0].name}`;

            downloadButton.classList.remove('hidden');

        } else {

            downloadButton.classList.add('hidden');
        }

        return;
    }


    /*
     * Multiple files: show the checklist
     * plus the "download all" zip button.
     */

    resultsPanel.classList.remove('hidden');

    selectAllCheckbox.checked = false;

    files.forEach(file => {

        const row =
            document.createElement('div');

        row.className = 'result-row';

        const thumb =
            document.createElement('img');

        thumb.className = 'result-thumb';
        thumb.src = file.url;
        thumb.alt = file.name;

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

        progressBar.style.width =
            '10%';

        progressText.textContent =
            'Uploading files...';

        const formData =
            new FormData();

        selectedFiles.forEach(
            file => {

                formData.append(
                    'files',
                    file
                );
            }
        );

        try {

            progressBar.style.width =
                '30%';

            progressText.textContent =
                'Processing images...';

            const response =
                await fetch(
                    '/api/process',
                    {
                        method: 'POST',
                        body: formData
                    }
                );

            const result =
                await response.json();

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
                `${result.processed} ${
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

    renderFiles();

    progressBar.style.width = '0%';

    resultsPanel.classList.add('hidden');
    downloadButton.classList.remove('hidden');
};