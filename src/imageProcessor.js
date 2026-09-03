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
        process.resourcesPath ? path.join(process.resourcesPath, 'assets', fileName) : null,
        process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', fileName) : null
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
    if (!BADGE_BUFFERS[badgeType]) {
        const filePath = getBadgePath(badgeType);
        BADGE_BUFFERS[badgeType] = fs.readFileSync(filePath);
    }
    return BADGE_BUFFERS[badgeType];
}

async function getBottomRightSample(inputPath, metadata) {
    if (!metadata || !metadata.width || !metadata.height) {
        metadata = await sharp(inputPath, SHARP_OPTIONS).metadata();
    }
    const width = metadata.width;
    const height = metadata.height;

    const sampleWidth = Math.max(1, Math.round(width * 0.20));
    const sampleHeight = Math.max(1, Math.round(height * 0.20));

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

async function processImage(inputPath, outputPath) {
    const image = sharp(inputPath, SHARP_OPTIONS).rotate();
    const metadata = await image.metadata();

    const selectedBadge = await getBottomRightSample(inputPath, metadata);
    const badgeRawBuffer = getBadgeBuffer(selectedBadge);

    // Ensure badge dimensions never exceed the base image dimensions (avoids "Image to composite must have same dimensions or smaller")
    const maxBadgeWidth = Math.max(1, Math.min(metadata.width, Math.round(metadata.width * 0.5)));
    const maxBadgeHeight = Math.max(1, Math.min(metadata.height, Math.round(metadata.height * 0.28)));

    const { data: badgeBuffer, info: badgeInfo } = await sharp(badgeRawBuffer, SHARP_OPTIONS)
        .resize({
            width: maxBadgeWidth,
            height: maxBadgeHeight,
            fit: 'inside',
            withoutEnlargement: true
        })
        .png()
        .toBuffer({ resolveWithObject: true });

    const rightMargin = -Math.round(metadata.width * 0.015);
    const bottomMargin = -Math.round(metadata.height * 0.05);

    const left = Math.round(metadata.width - badgeInfo.width - rightMargin);
    const top = Math.round(metadata.height - badgeInfo.height - bottomMargin);

    const outputImage = sharp(inputPath, SHARP_OPTIONS)
        .rotate()
        .composite([
            {
                input: badgeBuffer,
                left,
                top
            }
        ]);

    switch (metadata.format) {

        case 'jpeg':
            await outputImage.jpeg().toFile(outputPath);
            break;
        case 'png':
            await outputImage.png().toFile(outputPath);
            break;
        case 'webp':
            await outputImage.webp().toFile(outputPath);
            break;
        case 'avif':
            await outputImage.avif().toFile(outputPath);
            break;
        case 'tiff':
            await outputImage.tiff().toFile(outputPath);
            break;
        case 'gif':
            await outputImage.gif().toFile(outputPath);
            break;
        case 'heif':
            await outputImage.heif().toFile(outputPath);
            break;
        case 'jxl':
            await outputImage.jxl().toFile(outputPath);
            break;
        case 'jp2':
            await outputImage.jp2().toFile(outputPath);
            break;
        default:
            throw new Error(`Unsupported output format: ${metadata.format}`);
    }
}


module.exports = {
    processImage,
    selectBadge,
    getBottomRightSample,
    BADGES
};