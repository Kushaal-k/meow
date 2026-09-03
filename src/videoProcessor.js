const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const sharp = require('sharp');
const { selectBadge, getBottomRightSample, BADGES } = require('./imageProcessor');

const SUPPORTED_VIDEOS = ['.mp4', '.mov', '.webm', '.mkv', '.avi'];

function resolveFfmpegPath() {
    // Check if packaged with extraResources or system PATH
    if (process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, 'ffmpeg'))) {
        return path.join(process.resourcesPath, 'ffmpeg');
    }
    if (process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, 'ffmpeg.exe'))) {
        return path.join(process.resourcesPath, 'ffmpeg.exe');
    }
    return 'ffmpeg';
}

function resolveFfprobePath() {
    if (process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, 'ffprobe'))) {
        return path.join(process.resourcesPath, 'ffprobe');
    }
    if (process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, 'ffprobe.exe'))) {
        return path.join(process.resourcesPath, 'ffprobe.exe');
    }
    return 'ffprobe';
}

const FFMPEG_BIN = resolveFfmpegPath();
const FFPROBE_BIN = resolveFfprobePath();

/**
 * Extract video metadata: width, height, duration, audioCodec, hasAudio
 */
function getVideoMetadata(videoPath) {
    return new Promise((resolve, reject) => {
        execFile(
            FFPROBE_BIN,
            [
                '-v', 'error',
                '-show_entries', 'stream=codec_type,codec_name,width,height,duration',
                '-show_entries', 'format=duration',
                '-of', 'json',
                videoPath
            ],
            (err, stdout, stderr) => {
                if (err) {
                    return reject(new Error(`Failed to probe video: ${stderr || err.message}`));
                }
                try {
                    const parsed = JSON.parse(stdout);
                    const streams = parsed.streams || [];
                    const videoStream = streams.find(s => s.codec_type === 'video') || {};
                    const audioStream = streams.find(s => s.codec_type === 'audio') || null;
                    const format = parsed.format || {};
                    const width = parseInt(videoStream.width, 10) || 1920;
                    const height = parseInt(videoStream.height, 10) || 1080;
                    const duration = parseFloat(videoStream.duration || format.duration || 0);
                    const audioCodec = audioStream ? audioStream.codec_name : null;
                    resolve({
                        width,
                        height,
                        duration,
                        hasAudio: Boolean(audioStream),
                        audioCodec
                    });
                } catch (e) {
                    reject(new Error(`Failed to parse video metadata: ${e.message}`));
                }
            }
        );
    });
}

/**
 * Detect hardware video encoder capabilities for the host device
 */
let hardwareEncoderConfig = null;

async function getHardwareEncoderConfig() {
    if (hardwareEncoderConfig !== null) {
        return hardwareEncoderConfig;
    }

    // 1. Check for NVIDIA NVENC (dedicated GPU encoding)
    const nvencWorks = await new Promise((res) => {
        execFile(FFMPEG_BIN, ['-f', 'lavfi', '-i', 'nullsrc=s=64x64:d=0.1', '-c:v', 'h264_nvenc', '-f', 'null', '-'], (err) => {
            res(!err);
        });
    });

    if (nvencWorks) {
        console.log('[Hardware Acceleration] NVIDIA NVENC hardware encoder enabled.');
        hardwareEncoderConfig = {
            name: 'h264_nvenc',
            args: ['-c:v', 'h264_nvenc', '-preset', 'p2', '-cq', '20']
        };
        return hardwareEncoderConfig;
    }

    // 2. Check for Apple VideoToolbox (Apple Silicon M1/M2/M3/M4 or Intel Mac)
    if (process.platform === 'darwin') {
        const vtWorks = await new Promise((res) => {
            execFile(FFMPEG_BIN, ['-f', 'lavfi', '-i', 'nullsrc=s=64x64:d=0.1', '-c:v', 'h264_videotoolbox', '-f', 'null', '-'], (err) => {
                res(!err);
            });
        });

        if (vtWorks) {
            console.log('[Hardware Acceleration] Apple VideoToolbox hardware encoder enabled.');
            hardwareEncoderConfig = {
                name: 'h264_videotoolbox',
                args: ['-c:v', 'h264_videotoolbox', '-q:v', '60']
            };
            return hardwareEncoderConfig;
        }
    }

    // 3. Fallback to multi-threaded CPU libx264 utilizing all available CPU cores
    const cpuCores = os.cpus().length || 4;
    console.log(`[Hardware Detection] Multi-threaded CPU encoding enabled (${cpuCores} cores).`);
    hardwareEncoderConfig = {
        name: 'libx264',
        args: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-threads', '0']
    };
    return hardwareEncoderConfig;
}

/**
 * Extract a single video frame as a thumbnail
 */
function extractVideoThumbnail(videoPath, outputPath, timeSec = 1) {
    return new Promise((resolve, reject) => {
        const timeArg = timeSec > 0 ? timeSec.toString() : '0';
        const args = [
            '-ss', timeArg,
            '-i', videoPath,
            '-frames:v', '1',
            '-q:v', '2',
            outputPath,
            '-y'
        ];

        execFile(FFMPEG_BIN, args, (err, stdout, stderr) => {
            if (err) {
                // Retry at 0 seconds if seeking at 1s failed on very short clips
                if (timeSec > 0) {
                    return extractVideoThumbnail(videoPath, outputPath, 0)
                        .then(resolve)
                        .catch(reject);
                }
                return reject(new Error(`Failed to extract video thumbnail: ${stderr || err.message}`));
            }
            resolve(outputPath);
        });
    });
}

/**
 * Main video badging process
 */
async function processVideo(
    inputPath,
    originalFileName,
    outputDirectory,
    relativeDirectory = '',
    options = {}
) {
    const targetDir = relativeDirectory
        ? path.join(outputDirectory, relativeDirectory)
        : outputDirectory;

    fs.mkdirSync(targetDir, { recursive: true });

    const ext = path.extname(originalFileName);
    const baseName = path.basename(originalFileName, ext);
    // Standardize all processed video outputs to .mp4 (H.264 / AAC)
    // WebM, MKV, AVI, and MOV are converted to standard MP4 to ensure universal browser playback
    // and avoid muxer errors (such as WebM rejecting H.264/AAC with exit code 234).
    const outputFileName = `${baseName}-ai.mp4`;
    const outputPath = path.join(targetDir, outputFileName);

    // 1. Get video dimensions and duration
    const meta = await getVideoMetadata(inputPath);
    const width = meta.width;
    const height = meta.height;
    const duration = meta.duration;

    // 2. Extract frame at 1s (or 0s) for color/luminance analysis
    const sampleFramePath = path.join(
        os.tmpdir(),
        `sample-${crypto.randomUUID()}.png`
    );
    await extractVideoThumbnail(inputPath, sampleFramePath, duration > 1 ? 1 : 0);

    // 3. Analyze background color on bottom-right of the sample frame
    let chosenScheme = 'light';
    try {
        chosenScheme = await getBottomRightSample(sampleFramePath);
    } catch (sampleErr) {
        console.warn('Fallback to light badge scheme for video:', sampleErr.message);
    }

    // 4. Trim transparent padding from raw badge asset and scale visible emblem proportionally
    const badgePath = BADGES[chosenScheme];
    const baseDim = Math.min(width, height);
    const targetBadgeHeight = Math.max(20, Math.round(baseDim * 0.046));

    const resizedBadgeBuffer = await sharp(badgePath)
        .trim() // Strips the large transparent padding baked into the raw badge PNG
        .resize({
            height: targetBadgeHeight,
            withoutEnlargement: false
        })
        .png()
        .toBuffer();

    const tempBadgePath = path.join(
        os.tmpdir(),
        `badge-${crypto.randomUUID()}.png`
    );
    fs.writeFileSync(tempBadgePath, resizedBadgeBuffer);

    // 5. Calculate bottom-right offset matching standard image badge placement (calibrated to Image 1 reference)
    const paddingRight = Math.round(width * 0.042);
    const paddingBottom = Math.round(height * 0.063);

    // Badge entrance animation duration:
    // Badge moves in from the right edge with a smooth fade-in and stays until the end of the video
    const animDuration = Number((duration > 0 ? Math.min(0.8, Math.max(0.3, duration * 0.35)) : 0.8).toFixed(2));

    // 6. Overlay badge onto video using detected hardware encoder (with automatic CPU fallback)
    const hwConfig = await getHardwareEncoderConfig();

    // Audio stream optimization: if original audio is already AAC, pass through untouched (0% CPU); otherwise encode to AAC
    let audioArgs = [];
    if (meta.hasAudio) {
        if (meta.audioCodec === 'aac') {
            audioArgs = ['-map', '0:a', '-c:a', 'copy'];
        } else {
            audioArgs = ['-map', '0:a', '-c:a', 'aac', '-b:a', '192k'];
        }
    }

    const runEncode = (encoderArgs) => {
        return new Promise((resolve, reject) => {
            // Badge animation:
            // 1. Loop badge PNG via -loop 1 so frames stream continuously
            // 2. format=rgba,fade=t=in:st=0:d=${animDuration}:alpha=1 fades in badge alpha from 0 to 1
            // 3. overlay x starts at W (right edge) and eases into (W - w - paddingRight) using ease-out sin curve
            // 4. shortest=1 terminates overlay cleanly when the base video stream ends
            const filterGraph = `[0:v]pad=ceil(iw/2)*2:ceil(ih/2)*2[base];[1:v]format=rgba,fade=t=in:st=0:d=${animDuration}:alpha=1[badge];[base][badge]overlay=x='W-(w+${paddingRight})*sin(min(1,t/${animDuration})*PI/2)':y='H-h-${paddingBottom}':shortest=1,format=yuv420p[v]`;

            const args = [
                '-i', inputPath,
                '-loop', '1',
                '-i', tempBadgePath,
                '-filter_complex', filterGraph,
                '-map', '[v]',
                ...audioArgs,
                ...encoderArgs,
                outputPath,
                '-y'
            ];

            const proc = spawn(FFMPEG_BIN, args);
            let stderrOutput = '';

            proc.stderr.on('data', (data) => {
                const str = data.toString();
                stderrOutput += str;
                if (stderrOutput.length > 8000) {
                    stderrOutput = stderrOutput.slice(-8000);
                }

                // Parse time=HH:MM:SS.ms to calculate progress
                const timeMatch = str.match(/time=(\d+):(\d+):(\d+\.\d+)/);
                if (timeMatch && duration > 0) {
                    const hours = parseFloat(timeMatch[1]);
                    const minutes = parseFloat(timeMatch[2]);
                    const seconds = parseFloat(timeMatch[3]);
                    const currentSec = hours * 3600 + minutes * 60 + seconds;
                    const percent = Math.min(99, Math.round((currentSec / duration) * 100));
                    if (options.onProgress) {
                        options.onProgress(percent);
                    }
                }
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    const recentError = stderrOutput.trim().split('\n').slice(-6).join(' ');
                    reject(new Error(`FFmpeg video badging failed (exit ${code}): ${recentError || 'Encoding error'}`));
                }
            });

            proc.on('error', reject);
        });
    };

    try {
        await runEncode(hwConfig.args);
    } catch (primaryErr) {
        if (hwConfig.name !== 'libx264') {
            console.warn(`[Hardware Fallback] ${hwConfig.name} failed (${primaryErr.message}). Falling back to multi-threaded CPU libx264...`);
            const cpuArgs = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-threads', '0'];
            await runEncode(cpuArgs);
        } else {
            throw primaryErr;
        }
    } finally {
        try { if (fs.existsSync(sampleFramePath)) fs.unlinkSync(sampleFramePath); } catch (_) {}
        try { if (fs.existsSync(tempBadgePath)) fs.unlinkSync(tempBadgePath); } catch (_) {}
    }

    const relPath = relativeDirectory
        ? path.join(relativeDirectory, outputFileName)
        : outputFileName;

    // Generate an image thumbnail of the processed badged video for frontend result cards
    const thumbFileName = `${baseName}-ai-thumb.webp`;
    const thumbPath = path.join(targetDir, thumbFileName);
    try {
        const thumbTime = duration > 1.2 ? 1.2 : Math.max(0, duration * 0.9);
        await extractVideoThumbnail(outputPath, thumbPath, thumbTime);
    } catch (tErr) {
        console.warn('Could not extract badged video thumbnail:', tErr.message);
    }

    return {
        name: outputFileName,
        path: outputPath,
        thumbPath: fs.existsSync(thumbPath) ? thumbPath : null,
        relativePath: relPath,
        width,
        height,
        duration
    };
}

module.exports = {
    SUPPORTED_VIDEOS,
    getVideoMetadata,
    extractVideoThumbnail,
    processVideo
};
