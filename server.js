const express = require('express');
const multer = require('multer');
const archiver = require('archiver');
const unzipper = require('unzipper');
const sharp = require('sharp');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');


const { processImage } = require('./src/imageProcessor');
const {
    processVideo,
    SUPPORTED_VIDEOS,
    extractVideoThumbnail,
    getVideoMetadata
} = require('./src/videoProcessor');

const app = express();

const PORT = 3000;
const MAX_FILES = 250;
const MAX_VIDEOS = 10;
const CONCURRENCY = Math.max(2, Math.min(8, os.cpus().length || 4));
const VIDEO_CONCURRENCY = Math.max(1, Math.min(2, Math.floor((os.cpus().length || 4) / 2)));

const TEMP_ROOT = path.join(
    os.tmpdir(),
    'ai-badge-studio'
);

const UPLOADS_DIR = path.join(
    TEMP_ROOT,
    'uploads'
);

fs.mkdirSync(UPLOADS_DIR, {
    recursive: true
});

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB

const upload = multer({
    dest: UPLOADS_DIR,

    limits: {
        files: MAX_FILES,
        fileSize: MAX_FILE_SIZE
    }
});

async function mapConcurrent(items, concurrencyLimit, asyncFn) {
    const results = new Array(items.length);
    let currentIndex = 0;
    const workers = new Array(Math.min(items.length, concurrencyLimit)).fill(0).map(async () => {
        while (currentIndex < items.length) {
            const idx = currentIndex++;
            results[idx] = await asyncFn(items[idx], idx);
        }
    });
    await Promise.all(workers);
    return results;
}

function resolveStaticPath(folderName) {
    if (process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, folderName))) {
        return path.join(process.resourcesPath, folderName);
    }
    if (process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, 'app.asar.unpacked', folderName))) {
        return path.join(process.resourcesPath, 'app.asar.unpacked', folderName);
    }
    return path.join(__dirname, folderName);
}

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(
    express.static(
        resolveStaticPath('public')
    )
);
app.use(
    '/assets',
    express.static(
        resolveStaticPath('assets')
    )
);

// ============================================================
// SUPPORTED IMAGE FORMATS
// ============================================================

const SUPPORTED_IMAGES = [
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

function isImage(fileName) {

    return SUPPORTED_IMAGES.includes(
        path.extname(fileName).toLowerCase()
    );
}

function isZip(fileName) {

    return path
        .extname(fileName)
        .toLowerCase() === '.zip';
}

function isVideo(fileName) {
    return SUPPORTED_VIDEOS.includes(
        path.extname(fileName).toLowerCase()
    );
}


// ============================================================
// TEMP RESULT STORAGE
// ============================================================

const resultsStore = new Map();


// ============================================================
// CLEANUP
// ============================================================

function cleanupDirectory(directory) {

    try {

        if (fs.existsSync(directory)) {

            fs.rmSync(
                directory,
                {
                    recursive: true,
                    force: true
                }
            );
        }

    } catch (error) {

        console.error(
            'Cleanup failed:',
            error.message
        );
    }
}


// ============================================================
// SAFE FILE NAME
// ============================================================

function safeFileName(fileName) {

    return path
        .basename(fileName)
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
}


// ============================================================
// SAFE ZIP PATH
// Prevent ZIP Slip / path traversal
// ============================================================

function safeZipPath(filePath) {

    const normalized =
        path.normalize(filePath);

    if (
        normalized.startsWith('..') ||
        path.isAbsolute(normalized)
    ) {

        throw new Error(
            `Unsafe ZIP path: ${filePath}`
        );
    }

    return normalized;
}


// ============================================================
// PROCESS ONE IMAGE
// ============================================================

async function processOneImage(
    inputPath,
    originalName,
    outputDirectory,
    relativeDirectory = ''
) {

    const extension =
        path.extname(originalName);

    const baseName =
        path.basename(
            originalName,
            extension
        );

    const outputName =
        `${baseName}-ai${extension}`;

    const targetDirectory =
        path.join(
            outputDirectory,
            relativeDirectory
        );

    fs.mkdirSync(
        targetDirectory,
        {
            recursive: true
        }
    );

    const outputPath =
        path.join(
            targetDirectory,
            outputName
        );

    console.log('');
    console.log(
        'Processing:',
        originalName
    );

    await processImage(
        inputPath,
        outputPath
    );

    console.log(
        'Processed:',
        outputPath
    );

    return {
        name: outputName,
        path: outputPath,
        relativePath: path
            .join(
                relativeDirectory,
                outputName
            )
            .replace(/\\/g, '/')
    };
}


// ============================================================
// CREATE ZIP
// ============================================================

function createZip(
    sourceDirectory,
    zipPath
) {

    return new Promise(
        (resolve, reject) => {

            

            const archive =
                archiver(
                    'zip',
                    {
                        forceZip64: true,
                        zlib: {
                            level: 6
                        }
                    }
                );

                const output =
                fs.createWriteStream(
                    zipPath
                );

            output.on(
                'close',
                () => {

                    console.log(
                        `ZIP created: ${zipPath}`
                    );

                    resolve();
                }
            );

            output.on(
                'error',
                reject
            );

            archive.on(
                'error',
                reject
            );

            archive.pipe(output);

            archive.directory(
                sourceDirectory,
                false
            );

            archive.finalize();
        }
    );
}


// ============================================================
// CREATE ZIP FROM PROCESSED FILES
// ============================================================

function createZipFromFiles(
    files,
    zipPath
) {

    return new Promise(
        (resolve, reject) => {

            const output =
                fs.createWriteStream(
                    zipPath
                );

            const archive =
                archiver(
                    'zip',
                    {
                        zlib: {
                            level: 9
                        }
                    }
                );

            output.on(
                'close',
                () => {

                    console.log(
                        `ZIP created: ${zipPath}`
                    );

                    resolve();
                }
            );

            output.on(
                'error',
                reject
            );

            archive.on(
                'error',
                reject
            );

            archive.pipe(output);

            for (const file of files) {

                archive.file(
                    file.path,
                    {
                        name: file.relativePath
                    }
                );
            }

            archive.finalize();
        }
    );
}


// ============================================================
// PROCESS NORMAL IMAGE UPLOADS
// ============================================================

async function processImageUploads(
    files,
    jobDirectory
) {

    const outputDirectory =
        path.join(
            jobDirectory,
            'output'
        );

    fs.mkdirSync(
        outputDirectory,
        {
            recursive: true
        }
    );

    const validFiles = files.filter(file => isImage(file.originalname));

    if (validFiles.length > MAX_FILES) {
        throw new Error(
            `Maximum limit is ${MAX_FILES} images at a time. Received ${validFiles.length} images.`
        );
    }

    const results = await mapConcurrent(
        validFiles,
        CONCURRENCY,
        async (file) => {
            return await processOneImage(
                file.path,
                file.originalname,
                outputDirectory
            );
        }
    );

    return {
        outputDirectory,
        results
    };
}


// ============================================================
// VIDEO TIMING RESOLUTION HELPER
// ============================================================

function resolveVideoTiming(itemIdentifier, index, videoTiming = {}) {
    const globalTiming = videoTiming.global || {};
    const perFile = videoTiming.perFile || {};
    const custom = (itemIdentifier && perFile[itemIdentifier]) || (index !== undefined && perFile[index]) || null;
    if (custom && (custom.startOffset !== undefined || custom.endOffset !== undefined)) {
        return {
            startOffset: parseFloat(custom.startOffset) || 0,
            endOffset: parseFloat(custom.endOffset) || 0
        };
    }
    return {
        startOffset: parseFloat(globalTiming.startOffset) || 0,
        endOffset: parseFloat(globalTiming.endOffset) || 0
    };
}

// ============================================================
// PROCESS NORMAL VIDEO UPLOADS
// ============================================================

async function processVideoUploads(
    files,
    jobDirectory,
    videoTiming = {}
) {

    const outputDirectory =
        path.join(
            jobDirectory,
            'output'
        );

    fs.mkdirSync(
        outputDirectory,
        {
            recursive: true
        }
    );

    const validFiles = files.filter(file => isVideo(file.originalname));

    if (validFiles.length > MAX_VIDEOS) {
        throw new Error(
            `Maximum limit is ${MAX_VIDEOS} videos at a time. Received ${validFiles.length} videos.`
        );
    }

    const results = await mapConcurrent(
        validFiles,
        VIDEO_CONCURRENCY,
        async (file, index) => {
            const timing = resolveVideoTiming(file.originalname, index, videoTiming);
            return await processVideo(
                file.path,
                file.originalname,
                outputDirectory,
                '',
                timing
            );
        }
    );

    return {
        outputDirectory,
        results
    };
}


// ============================================================
// PROCESS ZIP
// ============================================================

async function processZip(
    zipFile,
    jobDirectory,
    videoTiming = {}
) {

    const extractDirectory =
        path.join(
            jobDirectory,
            'extracted'
        );

    const outputDirectory =
        path.join(
            jobDirectory,
            'zip-output'
        );

    fs.mkdirSync(
        extractDirectory,
        {
            recursive: true
        }
    );

    fs.mkdirSync(
        outputDirectory,
        {
            recursive: true
        }
    );

    console.log('');
    console.log(
        'Extracting ZIP:',
        zipFile.originalname
    );

    let directory;
    try {
        directory = await unzipper.Open.file(zipFile.path);
    } catch (zipErr) {
        throw new Error('Unable to read ZIP file. It may be corrupt or encrypted.');
    }

    const validEntries = directory.files.filter(entry => {
        const zipPath = safeZipPath(entry.path);
        return entry.type !== 'Directory' && !zipPath.endsWith('/');
    });

    const MAX_ZIP_ENTRIES = 500;
    if (validEntries.length > MAX_ZIP_ENTRIES) {
        throw new Error(
            `The uploaded ZIP contains ${validEntries.length} files. The maximum allowed limit is ${MAX_ZIP_ENTRIES} files.`
        );
    }

    const imageEntries = validEntries.filter(entry => {
        const ext = path.extname(safeZipPath(entry.path)).toLowerCase();
        return SUPPORTED_IMAGES.includes(ext);
    });

    const videoEntries = validEntries.filter(entry => {
        const ext = path.extname(safeZipPath(entry.path)).toLowerCase();
        return SUPPORTED_VIDEOS.includes(ext);
    });

    if (imageEntries.length === 0 && videoEntries.length === 0) {
        throw new Error(
            'No supported image or video files were found inside the ZIP archive.'
        );
    }

    const isVideoZip = videoEntries.length > 0 && imageEntries.length === 0;

    if (isVideoZip) {
        if (videoEntries.length > MAX_VIDEOS) {
            throw new Error(
                `The uploaded ZIP contains ${videoEntries.length} videos. The maximum allowed limit is ${MAX_VIDEOS} videos.`
            );
        }
    } else {
        if (imageEntries.length > MAX_FILES) {
            throw new Error(
                `The uploaded ZIP contains ${imageEntries.length} images. The maximum allowed limit is ${MAX_FILES} images.`
            );
        }
    }

    // Extract files sequentially to prevent unzipper file descriptor collisions
    const filesToProcess = [];
    for (const entry of validEntries) {
        const zipPath = safeZipPath(entry.path);
        const sourcePath = path.join(extractDirectory, zipPath);
        fs.mkdirSync(path.dirname(sourcePath), { recursive: true });

        await new Promise((resolve, reject) => {
            entry.stream()
                .pipe(fs.createWriteStream(sourcePath))
                .on('finish', resolve)
                .on('error', reject);
        });

        const extension = path.extname(zipPath).toLowerCase();
        filesToProcess.push({
            zipPath,
            sourcePath,
            originalFileName: path.basename(zipPath),
            relativeDirectory: path.dirname(zipPath) === '.' ? '' : path.dirname(zipPath),
            isImage: SUPPORTED_IMAGES.includes(extension),
            isVideo: SUPPORTED_VIDEOS.includes(extension)
        });
    }

    // Process extracted items using appropriate concurrency
    const concurrency = isVideoZip ? VIDEO_CONCURRENCY : CONCURRENCY;
    const results = await mapConcurrent(
        filesToProcess,
        concurrency,
        async (item, index) => {
            if (item.isVideo) {
                const timing = resolveVideoTiming(item.originalFileName, index, videoTiming);
                return await processVideo(
                    item.sourcePath,
                    item.originalFileName,
                    outputDirectory,
                    item.relativeDirectory,
                    timing
                );
            } else if (item.isImage) {
                return await processOneImage(
                    item.sourcePath,
                    item.originalFileName,
                    outputDirectory,
                    item.relativeDirectory
                );
            } else {
                const targetPath = path.join(outputDirectory, item.zipPath);
                fs.mkdirSync(path.dirname(targetPath), { recursive: true });
                fs.copyFileSync(item.sourcePath, targetPath);
                return {
                    name: item.originalFileName,
                    path: targetPath,
                    relativePath: item.zipPath,
                    unchanged: true
                };
            }
        }
    );

    return {
        outputDirectory,
        results,
        mediaType: isVideoZip ? 'video' : 'image'
    };
}


// ============================================================
// ZIP INSPECTION (PRE-PROCESSING PREVIEWS)
// ============================================================

const zipInspectionStore = new Map();

app.post('/api/inspect-zip', upload.single('zipFile'), async (req, res) => {
    let zipPath;
    let originalName;
    let isTempUpload = false;

    try {
        if (req.body && req.body.filePath && fs.existsSync(req.body.filePath)) {
            zipPath = req.body.filePath;
            originalName = path.basename(zipPath);
        } else if (req.file) {
            zipPath = req.file.path;
            originalName = req.file.originalname;
            isTempUpload = true;
        } else {
            return res.status(400).json({ error: 'No ZIP file provided for inspection.' });
        }

        let directory;
        try {
            directory = await unzipper.Open.file(zipPath);
        } catch (zipErr) {
            return res.status(400).json({ error: 'Unable to read ZIP file. It may be corrupt or encrypted.' });
        }

        const validEntries = directory.files.filter(entry => {
            const zPath = safeZipPath(entry.path);
            return entry.type !== 'Directory' && !zPath.endsWith('/');
        });

        const MAX_ZIP_ENTRIES = 500;
        if (validEntries.length > MAX_ZIP_ENTRIES) {
            return res.status(400).json({
                error: `The uploaded ZIP contains ${validEntries.length} files. The maximum allowed limit is ${MAX_ZIP_ENTRIES} files.`
            });
        }

        const imageEntries = validEntries.filter(entry => {
            const ext = path.extname(safeZipPath(entry.path)).toLowerCase();
            return SUPPORTED_IMAGES.includes(ext);
        });

        const videoEntries = validEntries.filter(entry => {
            const ext = path.extname(safeZipPath(entry.path)).toLowerCase();
            return SUPPORTED_VIDEOS.includes(ext);
        });

        if (imageEntries.length === 0 && videoEntries.length === 0) {
            return res.status(400).json({
                error: 'No supported image or video files were found inside the ZIP archive.'
            });
        }

        const isVideoZip = videoEntries.length > 0 && (imageEntries.length === 0 || (req.body && req.body.mediaMode === 'videos'));
        const targetEntries = isVideoZip ? videoEntries : imageEntries;
        const mediaType = isVideoZip ? 'video' : 'image';

        if (isVideoZip && targetEntries.length > MAX_VIDEOS) {
            return res.status(400).json({
                error: `The uploaded ZIP contains ${targetEntries.length} videos. The maximum allowed limit is ${MAX_VIDEOS} videos.`
            });
        }
        if (!isVideoZip && targetEntries.length > MAX_FILES) {
            return res.status(400).json({
                error: `The uploaded ZIP contains ${targetEntries.length} images. The maximum allowed limit is ${MAX_FILES} images.`
            });
        }

        const inspectionId = `inspect-${crypto.randomUUID()}`;
        const inspectionDir = path.join(TEMP_ROOT, inspectionId);
        const thumbsDir = path.join(inspectionDir, 'thumbs');
        const extractedDir = path.join(inspectionDir, 'extracted');

        fs.mkdirSync(thumbsDir, { recursive: true });
        fs.mkdirSync(extractedDir, { recursive: true });

        const inspectedFiles = [];

        // Extract each entry and generate thumbnail
        for (let i = 0; i < targetEntries.length; i++) {
            const entry = targetEntries[i];
            const zPath = safeZipPath(entry.path);
            const entryName = path.basename(zPath);
            const sourcePath = path.join(extractedDir, zPath);
            const thumbPath = path.join(thumbsDir, `thumb-${i}.webp`);

            fs.mkdirSync(path.dirname(sourcePath), { recursive: true });

            await new Promise((resolve, reject) => {
                entry.stream()
                    .pipe(fs.createWriteStream(sourcePath))
                    .on('finish', resolve)
                    .on('error', reject);
            });

            if (isVideoZip) {
                try {
                    await extractVideoThumbnail(sourcePath, thumbPath, 1);
                } catch (thumbErr) {
                    console.warn(`Could not generate thumbnail for video ${entryName}:`, thumbErr.message);
                }
            } else {
                try {
                    await sharp(sourcePath, { limitInputPixels: false, unlimited: true })
                        .rotate()
                        .resize({ width: 280, height: 280, fit: 'inside' })
                        .webp({ quality: 80 })
                        .toFile(thumbPath);
                } catch (thumbErr) {
                    console.warn(`Could not generate thumbnail for image ${entryName}:`, thumbErr.message);
                }
            }

            const stats = fs.statSync(sourcePath);

            inspectedFiles.push({
                id: i,
                name: entryName,
                path: zPath,
                size: stats.size,
                mediaType,
                thumbUrl: fs.existsSync(thumbPath)
                    ? `/api/inspect-thumb/${inspectionId}/${i}`
                    : `/api/inspect-raw/${inspectionId}/${i}`,
                previewUrl: `/api/inspect-raw/${inspectionId}/${i}`
            });
        }

        zipInspectionStore.set(inspectionId, {
            inspectionId,
            zipPath,
            originalName,
            isTempUpload,
            mediaType,
            inspectionDir,
            extractedDir,
            files: inspectedFiles,
            createdAt: Date.now()
        });

        // Auto-cleanup after 1 hour if not processed
        setTimeout(() => {
            const session = zipInspectionStore.get(inspectionId);
            if (session) {
                zipInspectionStore.delete(inspectionId);
                cleanupDirectory(inspectionDir);
                if (session.isTempUpload && fs.existsSync(session.zipPath)) {
                    try { fs.unlinkSync(session.zipPath); } catch (_) {}
                }
            }
        }, 60 * 60 * 1000);

        return res.json({
            success: true,
            inspectionId,
            zipName: originalName,
            zipSize: fs.existsSync(zipPath) ? fs.statSync(zipPath).size : 0,
            totalImages: inspectedFiles.length,
            files: inspectedFiles
        });

    } catch (err) {
        console.error('ZIP inspection error:', err);
        return res.status(500).json({ error: err.message || 'Failed to inspect ZIP archive.' });
    }
});

app.get('/api/inspect-thumb/:inspectionId/:id', (req, res) => {
    const { inspectionId, id } = req.params;
    const session = zipInspectionStore.get(inspectionId);
    if (!session) return res.status(404).send('Preview session expired');

    const thumbPath = path.join(session.inspectionDir, 'thumbs', `thumb-${id}.webp`);
    if (fs.existsSync(thumbPath)) {
        return res.sendFile(thumbPath);
    }
    const file = session.files[Number(id)];
    if (file) {
        return res.sendFile(path.join(session.extractedDir, file.path));
    }
    return res.status(404).send('Not found');
});

app.get('/api/inspect-raw/:inspectionId/:id', (req, res) => {
    const { inspectionId, id } = req.params;
    const session = zipInspectionStore.get(inspectionId);
    if (!session) return res.status(404).send('Preview session expired');

    const file = session.files[Number(id)];
    if (file) {
        return res.sendFile(path.join(session.extractedDir, file.path));
    }
    return res.status(404).send('Not found');
});


// ============================================================
// PROCESS API
// ============================================================

app.post(
    '/api/process',
    upload.array(
        'files',
        MAX_FILES
    ),
    async (req, res) => {

        let jobDirectory;

        try {
            // Parse video timing options (global defaults and per-file overrides)
            let videoTiming = { global: {}, perFile: {} };
            if (req.body && req.body.videoTimingGlobal) {
                try {
                    videoTiming.global = typeof req.body.videoTimingGlobal === 'string'
                        ? JSON.parse(req.body.videoTimingGlobal)
                        : req.body.videoTimingGlobal;
                } catch (_) {}
            }
            if (req.body && req.body.videoTimingPerFile) {
                try {
                    videoTiming.perFile = typeof req.body.videoTimingPerFile === 'string'
                        ? JSON.parse(req.body.videoTimingPerFile)
                        : req.body.videoTimingPerFile;
                } catch (_) {}
            }

            // Case A: Processing an already-inspected ZIP session
            if (req.body && req.body.inspectionId) {
                const session = zipInspectionStore.get(req.body.inspectionId);
                if (session) {
                    jobDirectory = path.join(TEMP_ROOT, `job-${crypto.randomUUID()}`);
                    const outputDirectory = path.join(jobDirectory, 'zip-output');
                    fs.mkdirSync(outputDirectory, { recursive: true });

                    const isVideoSession = session.mediaType === 'video';
                    const concurrency = isVideoSession ? VIDEO_CONCURRENCY : CONCURRENCY;

                    const results = await mapConcurrent(
                        session.files,
                        concurrency,
                        async (item, index) => {
                            const sourcePath = path.join(session.extractedDir, item.path);
                            if (isVideoSession) {
                                const timing = resolveVideoTiming(item.name, index, videoTiming);
                                return await processVideo(
                                    sourcePath,
                                    item.name,
                                    outputDirectory,
                                    path.dirname(item.path) === '.' ? '' : path.dirname(item.path),
                                    timing
                                );
                            } else {
                                return await processOneImage(
                                    sourcePath,
                                    item.name,
                                    outputDirectory,
                                    path.dirname(item.path) === '.' ? '' : path.dirname(item.path)
                                );
                            }
                        }
                    );

                    const zipName = isVideoSession ? 'AI-Badged-Videos.zip' : 'AI-Badged-Images.zip';
                    const outputZip = path.join(jobDirectory, zipName);
                    await createZip(outputDirectory, outputZip);

                    const jobId = path.basename(jobDirectory);
                    resultsStore.set(jobId, {
                        type: 'zip',
                        mediaType: isVideoSession ? 'video' : 'image',
                        zipPath: outputZip,
                        results
                    });

                    // Cleanup the temporary inspection session
                    zipInspectionStore.delete(req.body.inspectionId);
                    cleanupDirectory(session.inspectionDir);
                    if (session.isTempUpload && fs.existsSync(session.zipPath)) {
                        try { fs.unlinkSync(session.zipPath); } catch (_) {}
                    }

                    return res.json({
                        success: true,
                        type: 'zip',
                        mediaType: isVideoSession ? 'video' : 'image',
                        total: results.length,
                        processed: results.length,
                        downloadUrl: `/api/download/${jobId}/zip`,
                        downloadAllUrl: `/api/download/${jobId}/zip`,
                        files: results.map((item, index) => ({
                            id: index,
                            name: item.name,
                            mediaType: isVideoSession ? 'video' : 'image',
                            thumbUrl: (isVideoSession && item.thumbPath)
                                ? `/api/thumb/${jobId}/${index}`
                                : `/api/preview/${jobId}/${index}`,
                            url: `/api/download/${jobId}/${index}`,
                            previewUrl: `/api/preview/${jobId}/${index}`
                        }))
                    });
                }
            }

            // Case B: Standard direct upload
            if (
                !req.files ||
                req.files.length === 0
            ) {

                return res.status(400).json({
                    error:
                        'Please select at least one image or ZIP file.'
                });
            }

            if (req.files.length > MAX_FILES) {
                return res.status(400).json({
                    error:
                        `Maximum limit is ${MAX_FILES} images at a time. Received ${req.files.length} files.`
                });
            }

            const zipFiles =
                req.files.filter(
                    file =>
                        isZip(
                            file.originalname
                        )
                );

            /*
             * ZIP mode:
             *
             * Only one ZIP should be uploaded.
             */
            if (zipFiles.length > 0) {

                if (
                    req.files.length !== 1
                ) {

                    return res.status(400).json({
                        error:
                            'Please upload either one ZIP file or individual images, not both.'
                    });
                }

                const zipFile =
                    zipFiles[0];

                jobDirectory =
                    path.join(
                        TEMP_ROOT,
                        `job-${crypto.randomUUID()}`
                    );

                fs.mkdirSync(
                    jobDirectory,
                    {
                        recursive: true
                    }
                );

                const result =
                    await processZip(
                        zipFile,
                        jobDirectory,
                        videoTiming
                    );

                const outputZip =
                    path.join(
                        jobDirectory,
                        'AI-Badged-Images.zip'
                    );

                /*
                 * Create ZIP while preserving
                 * the original folder structure.
                 */
                await createZip(
                    result.outputDirectory,
                    outputZip
                );

                const jobId =
                    path.basename(
                        jobDirectory
                    );

                resultsStore.set(
                    jobId,
                    {
                        type: 'zip',
                        zipPath: outputZip,
                        results: result.results
                    }
                );

                return res.json({
                    success: true,
                    type: 'zip',
                    total: result.results.length,
                    processed: result.results.filter(
                        item => !item.unchanged
                    ).length,
                    downloadUrl: `/api/download/${jobId}/zip`,
                    downloadAllUrl: `/api/download/${jobId}/zip`,
                    files: result.results.map((item, index) => ({
                        id: index,
                        name: item.name,
                        url: `/api/download/${jobId}/${index}`,
                        previewUrl: `/api/preview/${jobId}/${index}`
                    }))
                });
            }


            // ==================================================
            // NORMAL IMAGE MODE
            // ==================================================

            const isVideoUpload = req.files.some(file => isVideo(file.originalname)) || (req.body && req.body.mediaMode === 'videos');

            if (isVideoUpload && req.files.length > MAX_VIDEOS) {
                return res.status(400).json({
                    error: `Maximum limit is ${MAX_VIDEOS} videos at a time. Received ${req.files.length} files.`
                });
            }

            if (!isVideoUpload && req.files.length > MAX_FILES) {
                return res.status(400).json({
                    error: `Maximum limit is ${MAX_FILES} images at a time. Received ${req.files.length} files.`
                });
            }

            jobDirectory =
                path.join(
                    TEMP_ROOT,
                    `job-${crypto.randomUUID()}`
                );

            fs.mkdirSync(
                jobDirectory,
                {
                    recursive: true
                }
            );

            let result;
            if (isVideoUpload) {
                result = await processVideoUploads(
                    req.files,
                    jobDirectory,
                    videoTiming
                );
            } else {
                result = await processImageUploads(
                    req.files,
                    jobDirectory
                );
            }

            const jobId =
                path.basename(
                    jobDirectory
                );

            /*
             * Single file:
             * direct download without ZIP.
             */
            if (req.files.length === 1) {

                const item =
                    result.results[0];

                resultsStore.set(
                    jobId,
                    {
                        type: isVideoUpload ? 'video' : 'image',
                        mediaType: isVideoUpload ? 'video' : 'image',
                        results:
                            result.results
                    }
                );

                return res.json({
                    success: true,
                    type: 'single',
                    mediaType: isVideoUpload ? 'video' : 'image',
                    total: 1,
                    processed: 1,
                    files: [
                        {
                            id: 0,
                            name: item.name,
                            mediaType: isVideoUpload ? 'video' : 'image',
                            thumbUrl: (isVideoUpload && item.thumbPath)
                                ? `/api/thumb/${jobId}/0`
                                : `/api/preview/${jobId}/0`,
                            url:
                                `/api/download/${jobId}/0`,
                            previewUrl:
                                `/api/preview/${jobId}/0`
                        }
                    ]
                });
            }


            /*
             * Multiple files:
             * individual downloads + Download All ZIP.
             */
            const zipName = isVideoUpload ? 'AI-Badged-Videos.zip' : 'AI-Badged-Images.zip';
            const downloadZip =
                path.join(
                    jobDirectory,
                    zipName
                );

            await createZipFromFiles(
                result.results,
                downloadZip
            );

            resultsStore.set(
                jobId,
                {
                    type: isVideoUpload ? 'videos' : 'images',
                    mediaType: isVideoUpload ? 'video' : 'image',
                    results:
                        result.results,
                    zipPath:
                        downloadZip
                }
            );

            return res.json({

                success: true,

                type: 'multiple',
                mediaType: isVideoUpload ? 'video' : 'image',

                total:
                    result.results.length,

                processed:
                    result.results.length,

                files:
                    result.results.map(
                        (item, index) => ({
                            id: index,
                            name: item.name,
                            mediaType: isVideoUpload ? 'video' : 'image',
                            thumbUrl: (isVideoUpload && item.thumbPath)
                                ? `/api/thumb/${jobId}/${index}`
                                : `/api/preview/${jobId}/${index}`,
                            url:
                                `/api/download/${jobId}/${index}`,
                            previewUrl:
                                `/api/preview/${jobId}/${index}`
                        })
                    ),

                downloadAllUrl:
                    `/api/download/${jobId}/zip`
            });

        } catch (error) {

            console.error('');
            console.error(
                'PROCESSING ERROR'
            );
            console.error(
                error
            );

            if (jobDirectory) {
                cleanupDirectory(
                    jobDirectory
                );
            }

            res.status(500).json({
                error:
                    error.message ||
                    'Image processing failed.'
            });
        }
    }
);


// ============================================================
// PREVIEW / INLINE IMAGE VIEW
// ============================================================

app.get(
    '/api/preview/:jobId/:file',
    (req, res) => {

        const {
            jobId,
            file
        } = req.params;

        const job =
            resultsStore.get(
                jobId
            );

        if (!job) {

            return res.status(404).send(
                'Processing result not found.'
            );
        }

        const index =
            Number(file);

        if (
            Number.isNaN(index) ||
            index < 0 ||
            index >= job.results.length
        ) {

            return res.status(404).send(
                'File not found.'
            );
        }

        const result =
            job.results[index];

        if (
            !result ||
            !fs.existsSync(result.path)
        ) {

            return res.status(404).send(
                'File no longer exists.'
            );
        }

        return res.sendFile(
            result.path
        );
    }
);

app.get(
    '/api/thumb/:jobId/:file',
    (req, res) => {
        const { jobId, file } = req.params;
        const job = resultsStore.get(jobId);
        if (!job) return res.status(404).send('Processing result not found.');

        const index = Number(file);
        if (Number.isNaN(index) || index < 0 || index >= job.results.length) {
            return res.status(404).send('File not found.');
        }

        const item = job.results[index];
        if (item && item.thumbPath && fs.existsSync(item.thumbPath)) {
            return res.sendFile(item.thumbPath);
        }
        if (item && item.path && fs.existsSync(item.path)) {
            return res.sendFile(item.path);
        }
        return res.status(404).send('File no longer exists.');
    }
);


// ============================================================
// DOWNLOAD
// ============================================================

app.get(
    '/api/download/:jobId/:file',
    (req, res) => {

        const {
            jobId,
            file
        } = req.params;

        const job =
            resultsStore.get(
                jobId
            );

        if (!job) {

            return res.status(404).send(
                'Processing result not found.'
            );
        }


        /*
         * ZIP download
         */
        if (file === 'zip') {

            if (
                !job.zipPath ||
                !fs.existsSync(
                    job.zipPath
                )
            ) {

                return res.status(404).send(
                    'ZIP file not found.'
                );
            }

            return res.download(
                job.zipPath,
                'AI-Badged-Images.zip'
            );
        }


        /*
         * Individual image download
         */
        const index =
            Number(file);

        if (
            Number.isNaN(index) ||
            index < 0 ||
            index >= job.results.length
        ) {

            return res.status(404).send(
                'File not found.'
            );
        }

        const result =
            job.results[index];

        if (
            !result ||
            !fs.existsSync(result.path)
        ) {

            return res.status(404).send(
                'File no longer exists.'
            );
        }

        return res.download(
            result.path,
            result.name
        );
    }
);


// ============================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================

app.use((err, req, res, next) => {
    console.error('Server error caught in middleware:', err);

    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                error: `Upload limit exceeded. Maximum ${MAX_FILES} images allowed at a time.`
            });
        }
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: 'File too large. Maximum allowed file size is 5GB.'
            });
        }
        return res.status(400).json({
            error: `Upload error: ${err.message}`
        });
    }

    return res.status(err.status || 500).json({
        error: err.message || 'Internal server error occurred.'
    });
});


// ============================================================
// START SERVER
// ============================================================

function startServer(preferredPort = PORT, host = '127.0.0.1') {
    return new Promise((resolve, reject) => {
        const tryListen = (portToTry) => {
            const server = http.createServer(app);

            server.on('error', (err) => {
                if (err.code === 'EADDRINUSE' && portToTry !== 0) {
                    console.warn(`Port ${portToTry} is in use. Trying random available port...`);
                    tryListen(0);
                } else {
                    reject(err);
                }
            });

            server.listen(portToTry, host, () => {
                const address = server.address();
                const actualPort = (address && typeof address === 'object') ? address.port : portToTry;
                console.log('');
                console.log('====================================');
                console.log('          AI BADGE STUDIO');
                console.log('====================================');
                console.log('');
                console.log(`Running at http://${host}:${actualPort}`);
                console.log('');

                resolve({
                    app,
                    server,
                    port: actualPort,
                    host,
                    stopServer: () => new Promise((res) => server.close(res))
                });
            });
        };

        tryListen(preferredPort);
    });
}

if (require.main === module) {
    startServer(PORT).catch((err) => {
        console.error('Failed to start server:', err);
        process.exit(1);
    });
}

module.exports = {
    app,
    startServer,
    TEMP_ROOT,
    cleanupDirectory
};