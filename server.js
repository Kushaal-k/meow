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

const app = express();

const PORT = 3000;
const MAX_FILES = 250;
const CONCURRENCY = Math.max(2, Math.min(8, os.cpus().length || 4));

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
// PROCESS ZIP
// ============================================================

async function processZip(
    zipFile,
    jobDirectory
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

    if (imageEntries.length === 0) {
        throw new Error(
            'No supported image files (.jpg, .jpeg, .png, .webp, etc.) were found inside the ZIP archive.'
        );
    }

    if (imageEntries.length > MAX_FILES) {
        throw new Error(
            `The uploaded ZIP contains ${imageEntries.length} images. The maximum allowed limit is ${MAX_FILES} images.`
        );
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
            isImage: SUPPORTED_IMAGES.includes(extension)
        });
    }

    // Process extracted images in parallel using worker pool
    const results = await mapConcurrent(
        filesToProcess,
        CONCURRENCY,
        async (item) => {
            if (item.isImage) {
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
        results
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

        if (imageEntries.length === 0) {
            return res.status(400).json({
                error: 'No supported image files (.jpg, .jpeg, .png, .webp, etc.) were found inside the ZIP archive.'
            });
        }

        if (imageEntries.length > MAX_FILES) {
            return res.status(400).json({
                error: `The uploaded ZIP contains ${imageEntries.length} images. The maximum allowed limit is ${MAX_FILES} images.`
            });
        }

        const inspectionId = `inspect-${crypto.randomUUID()}`;
        const inspectionDir = path.join(TEMP_ROOT, inspectionId);
        const thumbsDir = path.join(inspectionDir, 'thumbs');
        const extractedDir = path.join(inspectionDir, 'extracted');

        fs.mkdirSync(thumbsDir, { recursive: true });
        fs.mkdirSync(extractedDir, { recursive: true });

        const inspectedFiles = [];

        // Extract each image entry and generate a fast WebP thumbnail
        for (let i = 0; i < imageEntries.length; i++) {
            const entry = imageEntries[i];
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

            // Generate small thumbnail (280x280) for instant preview
            try {
                await sharp(sourcePath, { limitInputPixels: false, unlimited: true })
                    .rotate()
                    .resize({ width: 280, height: 280, fit: 'inside' })
                    .webp({ quality: 80 })
                    .toFile(thumbPath);
            } catch (thumbErr) {
                console.warn(`Could not generate thumbnail for ${entryName}:`, thumbErr.message);
            }

            const stats = fs.statSync(sourcePath);

            inspectedFiles.push({
                id: i,
                name: entryName,
                path: zPath,
                size: stats.size,
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

            // Case A: Processing an already-inspected ZIP session
            if (req.body && req.body.inspectionId) {
                const session = zipInspectionStore.get(req.body.inspectionId);
                if (session) {
                    jobDirectory = path.join(TEMP_ROOT, `job-${crypto.randomUUID()}`);
                    const outputDirectory = path.join(jobDirectory, 'zip-output');
                    fs.mkdirSync(outputDirectory, { recursive: true });

                    const results = await mapConcurrent(
                        session.files,
                        CONCURRENCY,
                        async (item) => {
                            const sourcePath = path.join(session.extractedDir, item.path);
                            return await processOneImage(
                                sourcePath,
                                item.name,
                                outputDirectory,
                                path.dirname(item.path) === '.' ? '' : path.dirname(item.path)
                            );
                        }
                    );

                    const outputZip = path.join(jobDirectory, 'AI-Badged-Images.zip');
                    await createZip(outputDirectory, outputZip);

                    const jobId = path.basename(jobDirectory);
                    resultsStore.set(jobId, {
                        type: 'zip',
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
                        total: results.length,
                        processed: results.length,
                        downloadUrl: `/api/download/${jobId}/zip`,
                        downloadAllUrl: `/api/download/${jobId}/zip`,
                        files: results.map((item, index) => ({
                            id: index,
                            name: item.name,
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
                        jobDirectory
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
                await processImageUploads(
                    req.files,
                    jobDirectory
                );

            if (
                result.results.length === 0
            ) {

                return res.status(400).json({
                    error:
                        'No supported image files were found.'
                });
            }

            const jobId =
                path.basename(
                    jobDirectory
                );

            resultsStore.set(
                jobId,
                {
                    type: 'images',
                    results:
                        result.results
                }
            );

            /*
             * Single image:
             * return one direct download.
             */
            if (
                result.results.length === 1
            ) {

                return res.json({

                    success: true,

                    type: 'single',

                    total: 1,

                    processed: 1,

                    files: [
                        {
                            id: 0,
                            name:
                                result.results[0].name,

                            url:
                                `/api/download/${jobId}/0`,

                            previewUrl:
                                `/api/preview/${jobId}/0`
                        }
                    ]
                });
            }


            /*
             * Multiple images:
             * individual downloads + optional
             * Download All ZIP.
             */

            const downloadZip =
                path.join(
                    jobDirectory,
                    'AI-Badged-Images.zip'
                );

            await createZipFromFiles(
                result.results,
                downloadZip
            );

            resultsStore.set(
                jobId,
                {
                    type: 'images',
                    results:
                        result.results,
                    zipPath:
                        downloadZip
                }
            );

            return res.json({

                success: true,

                type: 'multiple',

                total:
                    result.results.length,

                processed:
                    result.results.length,

                files:
                    result.results.map(
                        (item, index) => ({
                            id: index,
                            name: item.name,
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