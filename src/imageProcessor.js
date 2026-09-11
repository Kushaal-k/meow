const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const COLOR_REFERENCES = {
    darkGreen1: { red: 14, green: 58, blue: 47 },       // #0e3a2f
    darkGreen2: { red: 49, green: 105, blue: 75 },      // #31694b
    electricGreen: { red: 120, green: 250, blue: 174 } // #78faae
};

const COLOR_DISTANCE_THRESHOLD = 40;
const LUMINANCE_THRESHOLD = 128;

const SHARP_OPTIONS = {
    limitInputPixels: false,
    unlimited: true
};

function resolveBadgePath(fileName) {
    const candidates = [
        path.join(__dirname, '..', 'assets', fileName),
        path.join(process.cwd(), 'assets', fileName),
        path.join(__dirname, 'assets', fileName),
        process.resourcesPath ? path.join(process.resourcesPath, 'assets', fileName) : null,
        process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', fileName) : null,
        process.resourcesPath ? path.join(process.resourcesPath, 'app', 'assets', fileName) : null
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return path.join(__dirname, '..', 'assets', fileName);
}

const BADGE_FILES = {
    darkGreen: 'dark_green_bg_badge.png',
    electricGreen: 'electric_green_bg_badge.png',
    dark: 'dark_bg_badge.png',
    light: 'light_bg_badge.png'
};

const BADGES = {
    darkGreen: resolveBadgePath(BADGE_FILES.darkGreen),
    electricGreen: resolveBadgePath(BADGE_FILES.electricGreen),
    dark: resolveBadgePath(BADGE_FILES.dark),
    light: resolveBadgePath(BADGE_FILES.light)
};

function getBadgePath(badgeType) {
    const fileName = BADGE_FILES[badgeType] || 'dark_bg_badge.png';
    return resolveBadgePath(fileName);
}

function isActuallyGreen(color) {
    return (
        color.green > color.red &&
        color.green > color.blue
    );
}

function calculateAverageColor(data, channels) {
    let totalRed = 0;
    let totalGreen = 0;
    let totalBlue = 0;

    const pixelCount = data.length / channels;

    for (let i = 0; i < data.length; i += channels) {
        totalRed += data[i];
        totalGreen += data[i + 1];
        totalBlue += data[i + 2];
    }

    return {
        red: Math.round(totalRed / pixelCount),
        green: Math.round(totalGreen / pixelCount),
        blue: Math.round(totalBlue / pixelCount)
    };
}

function calculateColorDistance(color1, color2) {
    const redDifference = color1.red - color2.red;
    const greenDifference = color1.green - color2.green;
    const blueDifference = color1.blue - color2.blue;

    return Math.sqrt(
        Math.pow(redDifference, 2) +
        Math.pow(greenDifference, 2) +
        Math.pow(blueDifference, 2)
    );
}

function calculateLuminance(color) {
    return (
        0.2126 * color.red +
        0.7152 * color.green +
        0.0722 * color.blue
    );
}

function selectBadge(color) {

    // First make sure the color is actually green
    if (isActuallyGreen(color)) {

        const darkGreen1Distance = calculateColorDistance(
            color,
            COLOR_REFERENCES.darkGreen1
        );

        const darkGreen2Distance = calculateColorDistance(
            color,
            COLOR_REFERENCES.darkGreen2
        );

        const electricGreenDistance = calculateColorDistance(
            color,
            COLOR_REFERENCES.electricGreen
        );

        console.log('Color distances:');
        console.log(
            '#0e3a2f:',
            darkGreen1Distance.toFixed(2)
        );
        console.log(
            '#31694b:',
            darkGreen2Distance.toFixed(2)
        );
        console.log(
            '#78faae:',
            electricGreenDistance.toFixed(2)
        );

        if (
            darkGreen1Distance <= COLOR_DISTANCE_THRESHOLD ||
            darkGreen2Distance <= COLOR_DISTANCE_THRESHOLD
        ) {
            return 'darkGreen';
        }

        if (electricGreenDistance <= COLOR_DISTANCE_THRESHOLD) {
            return 'electricGreen';
        }
    }

    const luminance = calculateLuminance(color);

    console.log('Luminance:', luminance.toFixed(2));

    if (luminance < LUMINANCE_THRESHOLD) {
        return 'dark';
    }

    return 'light';
}

const BADGE_BUFFERS = {};

function getBadgeBuffer(badgeType) {
    if (BADGE_BUFFERS[badgeType]) {
        return BADGE_BUFFERS[badgeType];
    }
    const filePath = getBadgePath(badgeType);
    try {
        if (fs.existsSync(filePath)) {
            BADGE_BUFFERS[badgeType] = fs.readFileSync(filePath);
            return BADGE_BUFFERS[badgeType];
        }
    } catch (err) {
        console.warn(`[AI Badge Studio] Warning: Could not read ${filePath}: ${err.message}`);
    }

    // Resilient fallback across other badge types so processing never crashes
    for (const fbType of ['dark', 'light', 'darkGreen', 'electricGreen']) {
        try {
            const fbPath = getBadgePath(fbType);
            if (fs.existsSync(fbPath)) {
                BADGE_BUFFERS[badgeType] = fs.readFileSync(fbPath);
                return BADGE_BUFFERS[badgeType];
            }
        } catch (_) {}
    }

    throw new Error(`AI badge asset file not found on disk for type: ${badgeType}`);
}

async function getBottomRightSample(inputPath, metadata) {
    if (!metadata || !metadata.width || !metadata.height) {
        metadata = await sharp(inputPath, SHARP_OPTIONS).metadata();
    }
    const width = metadata.width;
    const height = metadata.height;
    const baseDim = Math.min(width, height);

    // Target the specific bottom-right quadrant where the badge will actually be placed
    // rather than an overly broad 20% swath that captures unrelated car body parts
    const sampleWidth = Math.min(width, Math.max(16, Math.round(baseDim * 0.12)));
    const sampleHeight = Math.min(height, Math.max(16, Math.round(baseDim * 0.12)));

    const left = Math.max(0, width - sampleWidth);
    const top = Math.max(0, height - sampleHeight);

    // Fast SIMD-accelerated 1x1 resize extracts average color in milliseconds without large memory allocations
    const { data } = await sharp(inputPath, SHARP_OPTIONS)
        .rotate()
        .extract({
            left,
            top,
            width: sampleWidth,
            height: sampleHeight
        })
        .resize(1, 1, { fit: 'fill' })
        .raw()
        .toBuffer({ resolveWithObject: true });

    const averageColor = {
        red: data[0],
        green: data[1],
        blue: data[2]
    };

    const selectedBadge = selectBadge(averageColor);
    return selectedBadge;
}

async function processImage(inputPath, outputPath, badgeOverride = null) {
    const image = sharp(inputPath, SHARP_OPTIONS).rotate();
    const metadata = await image.metadata();

    // If a specific valid badge variant is requested, use it; otherwise run existing automatic detection
    const selectedBadge = (badgeOverride && BADGE_FILES[badgeOverride])
        ? badgeOverride
        : await getBottomRightSample(inputPath, metadata);
    const badgeRawBuffer = getBadgeBuffer(selectedBadge);

    const baseDim = Math.min(metadata.width, metadata.height);

    // Scale visible emblem proportionally to the image base dimension (subtly reduced size)
    // Ratio of trimmed badge emblem is 113 x 90 = 1.2555
    const targetBadgeHeight = Math.max(14, Math.min(Math.round(metadata.height * 0.22), Math.round(baseDim * 0.038)));

    // Trim all baked-in transparent empty borders from the raw asset
    // so badge dimensions and position calculations are 100% exact to the visible emblem
    const { data: badgeBuffer, info: badgeInfo } = await sharp(badgeRawBuffer, SHARP_OPTIONS)
        .trim()
        .resize({
            height: targetBadgeHeight,
            withoutEnlargement: false
        })
        .png()
        .toBuffer({ resolveWithObject: true });

    // Clean, balanced distance from right and bottom edges
    // Kept a bit down (closer to bottom edge while remaining cleanly in bounds)
    const paddingRight = Math.max(6, Math.min(Math.round(metadata.width * 0.06), Math.round(Math.min(metadata.width * 0.04, baseDim * 0.05))));
    const paddingBottom = Math.max(6, Math.min(Math.round(metadata.height * 0.05), Math.round(baseDim * 0.032)));

    const left = Math.max(0, Math.min(metadata.width - badgeInfo.width, Math.round(metadata.width - badgeInfo.width - paddingRight)));
    const top = Math.max(0, Math.min(metadata.height - badgeInfo.height, Math.round(metadata.height - badgeInfo.height - paddingBottom)));

    const outputImage = sharp(inputPath, SHARP_OPTIONS)
        .rotate()
        .composite([
            {
                input: badgeBuffer,
                left,
                top
            }
        ]);

    async function writeFormattedImage(targetPipeline) {
        switch (metadata.format) {
            case 'jpeg':
                return await targetPipeline
                    .jpeg({
                        quality: 100,
                        chromaSubsampling: '4:4:4',
                        force: true
                    })
                    .toFile(outputPath);
            case 'png':
                return await targetPipeline
                    .png({
                        compressionLevel: 6,
                        adaptiveFiltering: true,
                        force: true
                    })
                    .toFile(outputPath);
            case 'webp':
                return await targetPipeline
                    .webp({
                        quality: 100,
                        lossless: true,
                        force: true
                    })
                    .toFile(outputPath);
            case 'avif':
                return await targetPipeline
                    .avif({
                        quality: 100,
                        lossless: true,
                        force: true
                    })
                    .toFile(outputPath);
            case 'tiff':
                return await targetPipeline
                    .tiff({
                        quality: 100,
                        compression: 'none',
                        force: true
                    })
                    .toFile(outputPath);
            case 'gif':
                return await targetPipeline.gif().toFile(outputPath);
            case 'heif':
                return await targetPipeline
                    .heif({
                        quality: 100,
                        lossless: true,
                        force: true
                    })
                    .toFile(outputPath);
            case 'jxl':
                return await targetPipeline
                    .jxl({
                        quality: 100,
                        lossless: true,
                        force: true
                    })
                    .toFile(outputPath);
            case 'jp2':
                return await targetPipeline
                    .jp2({
                        quality: 100,
                        lossless: true,
                        force: true
                    })
                    .toFile(outputPath);
            default:
                return await targetPipeline.toFile(outputPath);
        }
    }

    try {
        // Retain original metadata (EXIF, ICC color profiles, DPI) and export at 100% quality
        await writeFormattedImage(outputImage.withMetadata());
    } catch (metaErr) {
        console.warn('Metadata preservation failed on image, falling back without metadata:', metaErr.message);
        const fallbackPipeline = sharp(inputPath, SHARP_OPTIONS)
            .rotate()
            .composite([
                {
                    input: badgeBuffer,
                    left,
                    top
                }
            ]);
        await writeFormattedImage(fallbackPipeline);
    }
}


module.exports = {
    processImage,
    selectBadge,
    getBottomRightSample,
    BADGES,
    BADGE_FILES
};