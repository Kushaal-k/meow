const express = require('express');
const multer = require('multer');
const archiver = require('archiver');
const unzipper = require('unzipper');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');


const { processImage } = require('./src/imageProcessor');

const app = express();

const PORT = 3000;

const TEMP_ROOT = path.join(
    os.tmpdir(),
    'ai-badge-studio'
);

fs.mkdirSync(TEMP_ROOT, {
    recursive: true
});

const upload = multer({
    dest: path.join(
        TEMP_ROOT,
        'uploads'
    ),

    limits: {
        files: 500,
        fileSize: 500 * 1024 * 1024
    }
});

function resolveStaticPath(folderName) {
    if (process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, folderName))) {
        return path.join(process.resourcesPath, folderName);
    }
    if (process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, 'app.asar.unpacked', folderName))) {
        return path.join(process.resourcesPath, 'app.asar.unpacked', folderName);
    }
    return path.join(__dirname, folderName);
}

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
                        zlib: {
                            level: 9
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

    const results = [];

    for (const file of files) {

        if (!isImage(file.originalname)) {

            console.log(
                'Skipping unsupported file:',
                file.originalname
            );

            continue;
        }

        const result =
            await processOneImage(
                file.path,
                file.originalname,
                outputDirectory
            );

        results.push(result);
    }

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

    const directory =
        await unzipper.Open.file(
            zipFile.path
        );

    const results = [];

    for (const entry of directory.files) {

        const zipPath =
            safeZipPath(entry.path);

        /*
         * Ignore directories.
         */
        if (
            entry.type === 'Directory' ||
            zipPath.endsWith('/')
        ) {
            continue;
        }

        const extension =
            path.extname(zipPath)
                .toLowerCase();

        const relativeDirectory =
            path.dirname(zipPath);

        const originalFileName =
            path.basename(zipPath);

        const sourcePath =
            path.join(
                extractDirectory,
                zipPath
            );

        fs.mkdirSync(
            path.dirname(sourcePath),
            {
                recursive: true
            }
        );

        /*
         * Extract the original file.
         */
        await new Promise(
            (resolve, reject) => {

                entry.stream()
                    .pipe(
                        fs.createWriteStream(
                            sourcePath
                        )
                    )
                    .on(
                        'finish',
                        resolve
                    )
                    .on(
                        'error',
                        reject
                    );
            }
        );

        /*
         * Process supported images.
         */
        if (
            SUPPORTED_IMAGES.includes(
                extension
            )
        ) {

            const result =
                await processOneImage(
                    sourcePath,
                    originalFileName,
                    outputDirectory,
                    relativeDirectory === '.'
                        ? ''
                        : relativeDirectory
                );

            results.push(result);

        } else {

            /*
             * Non-image files are copied unchanged.
             */
            const targetPath =
                path.join(
                    outputDirectory,
                    zipPath
                );

            fs.mkdirSync(
                path.dirname(targetPath),
                {
                    recursive: true
                }
            );

            fs.copyFileSync(
                sourcePath,
                targetPath
            );

            results.push({
                name: originalFileName,
                path: targetPath,
                relativePath: zipPath,
                unchanged: true
            });
        }
    }

    return {
        outputDirectory,
        results
    };
}


// ============================================================
// PROCESS API
// ============================================================

app.post(
    '/api/process',
    upload.array(
        'files',
        500
    ),
    async (req, res) => {

        let jobDirectory;

        try {

            if (
                !req.files ||
                req.files.length === 0
            ) {

                return res.status(400).json({
                    error:
                        'Please select at least one image or ZIP file.'
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

                    total:
                        result.results.length,

                    processed:
                        result.results.filter(
                            item =>
                                !item.unchanged
                        ).length,

                    downloadUrl:
                        `/api/download/${jobId}/zip`
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