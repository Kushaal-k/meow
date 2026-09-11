const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const sharp = require('sharp');
const { selectBadge, getBottomRightSample, BADGES } = require('./imageProcessor');

const SUPPORTED_VIDEOS = ['.mp4', '.mov', '.webm', '.mkv', '.avi'];

function resolveFfmpegPath() {
    const isWin = process.platform === 'win32';
    const binName = isWin ? 'ffmpeg.exe' : 'ffmpeg';

    // 1. Check process.resourcesPath (packaged Electron app)
    if (process.resourcesPath) {
        const candidates = [
            path.join(process.resourcesPath, 'bin', binName),
            path.join(process.resourcesPath, binName),
            path.join(process.resourcesPath, 'ffmpeg.exe'),
            path.join(process.resourcesPath, 'ffmpeg')
        ];
        for (const p of candidates) {
            if (fs.existsSync(p)) return p;
        }
    }

    // 2. Check local project bin/ folder (development / tests)
    const archDir = process.arch === 'arm64' ? 'arm64' : 'x64';
    const osDir = isWin ? 'win/x64' : `mac/${archDir}`;
    const localCandidates = [
        path.join(__dirname, '..', 'bin', osDir, binName),
        path.join(__dirname, '..', 'bin', binName)
    ];
    for (const p of localCandidates) {
        if (fs.existsSync(p)) return p;
    }

    // 3. Fallback to system PATH
    return isWin ? 'ffmpeg.exe' : 'ffmpeg';
}

function resolveFfprobePath() {
    const isWin = process.platform === 'win32';
    const binName = isWin ? 'ffprobe.exe' : 'ffprobe';

    // 1. Check process.resourcesPath (packaged Electron app)
    if (process.resourcesPath) {
        const candidates = [
            path.join(process.resourcesPath, 'bin', binName),
            path.join(process.resourcesPath, binName),
            path.join(process.resourcesPath, 'ffprobe.exe'),
            path.join(process.resourcesPath, 'ffprobe')
        ];
        for (const p of candidates) {
            if (fs.existsSync(p)) return p;
        }
    }

    // 2. Check local project bin/ folder (development / tests)
    const archDir = process.arch === 'arm64' ? 'arm64' : 'x64';
    const osDir = isWin ? 'win/x64' : `mac/${archDir}`;
    const localCandidates = [
        path.join(__dirname, '..', 'bin', osDir, binName),
        path.join(__dirname, '..', 'bin', binName)
    ];
    for (const p of localCandidates) {
        if (fs.existsSync(p)) return p;
    }

    // 3. Fallback to system PATH
    return isWin ? 'ffprobe.exe' : 'ffprobe';
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

    // 3. Analyze background color on bottom-right of the sample frame (or use custom badge if specified)
    let chosenScheme = 'light';
    if (options && options.badgeVariant && BADGES[options.badgeVariant]) {
        chosenScheme = options.badgeVariant;
    } else {
        try {
            chosenScheme = await getBottomRightSample(sampleFramePath);
        } catch (sampleErr) {
            console.warn('Fallback to light badge scheme for video:', sampleErr.message);
        }
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

    // 6. Timing configuration for intro delay and outro buffer
    // startOffset: seconds from start to hold off showing badge (skips intro brand screens)
    // endOffset: seconds before end to hide badge (skips outro brand screens)
    let startOffset = Math.max(0, parseFloat(options.startOffset) || 0);
    let endOffset = Math.max(0, parseFloat(options.endOffset) || 0);

    // Clamp offsets against video duration to guarantee safe playback
    if (duration > 0) {
        if (startOffset >= duration) {
            startOffset = Math.max(0, duration - 1);
        }
        if (startOffset + endOffset >= duration) {
            endOffset = Math.max(0, duration - startOffset - 0.5);
        }
    }

    const displayWindow = duration > 0 ? (duration - startOffset - endOffset) : 5;
    const animDuration = Number(
        (Math.min(0.8, Math.max(0.2, displayWindow > 0 ? displayWindow * 0.25 : 0.8))).toFixed(2)
    );

    const st = Number(startOffset.toFixed(2));
    const et = Number((Math.max(st + animDuration, (duration || 5) - endOffset)).toFixed(2));
    const hasExit = endOffset > 0 && (et - animDuration > st + animDuration);

    const enterEnd = Number((st + animDuration).toFixed(2));
    const exitStart = Number((et - animDuration).toFixed(2));

    // Dynamic animation filters:
    // If hasExit is true: badge slides in from right + fades in, rests, then slides out to right + fades out
    // If hasExit is false: badge slides in from right + fades in, and stays till the end
    let fadeFilter;
    let xExpr;

    if (hasExit) {
        fadeFilter = `format=rgba,fade=t=in:st=${st}:d=${animDuration}:alpha=1,fade=t=out:st=${exitStart}:d=${animDuration}:alpha=1`;
        xExpr = `W-(w+${paddingRight})*if(lt(t,${st}),0,if(lt(t,${enterEnd}),sin((t-${st})/${animDuration}*PI/2),if(lt(t,${exitStart}),1,if(lt(t,${et}),sin((${et}-t)/${animDuration}*PI/2),0))))`;
    } else {
        fadeFilter = `format=rgba,fade=t=in:st=${st}:d=${animDuration}:alpha=1`;
        xExpr = `W-(w+${paddingRight})*if(lt(t,${st}),0,if(lt(t,${enterEnd}),sin((t-${st})/${animDuration}*PI/2),1))`;
    }

    // 7. Overlay badge onto video using detected hardware encoder (with automatic CPU fallback)
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
            const filterGraph = `[0:v]pad=ceil(iw/2)*2:ceil(ih/2)*2[base];[1:v]${fadeFilter}[badge];[base][badge]overlay=x='${xExpr}':y='H-h-${paddingBottom}':shortest=1,format=yuv420p[v]`;

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
        let thumbTime;
        if (hasExit) {
            thumbTime = Number(((st + et) / 2).toFixed(2));
        } else {
            thumbTime = Number((Math.min(duration > 0 ? duration * 0.9 : 1.2, st + animDuration + 0.5)).toFixed(2));
        }
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
