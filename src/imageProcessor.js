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

async function getBottomRightSample(inputPath) {
    const image = sharp(inputPath);

    const metadata = await image.metadata();

    const width = metadata.width;
    const height = metadata.height;

    const sampleWidth = Math.round(width * 0.20);
    const sampleHeight = Math.round(height * 0.20);

    const left = width - sampleWidth;
    const top = height - sampleHeight;

    console.log('Sample area:');
    console.log('Left:', left);
    console.log('Top:', top);
    console.log('Width:', sampleWidth);
    console.log('Height:', sampleHeight);

    const { data, info } = await image
        .extract({
            left,
            top,
            width: sampleWidth,
            height: sampleHeight
        })
        .raw()
        .toBuffer({
            resolveWithObject: true
        });

    const averageColor = calculateAverageColor(
        data,
        info.channels
    );

    console.log('Representative color:');
    console.log('R:', averageColor.red);
    console.log('G:', averageColor.green);
    console.log('B:', averageColor.blue);

    const selectedBadge = selectBadge(averageColor);

    console.log('Selected badge:', selectedBadge);

    return selectedBadge;
}

async function processImage(inputPath, outputPath) {
    console.log('Input:', inputPath);
    console.log('Output:', outputPath);

    const image = sharp(inputPath);

    const metadata = await image.metadata();

    console.log('Image width:', metadata.width);
    console.log('Image height:', metadata.height);
    console.log('Image format:', metadata.format);

    const selectedBadge = await getBottomRightSample(inputPath);

    const badgePath = getBadgePath(selectedBadge);

    console.log('Badge file:', badgePath);

    
    const badgeHeight = Math.round(metadata.height * 0.28);

   
    const badgeBuffer = await sharp(badgePath)
        .resize({
            height: badgeHeight,
            fit: 'contain'
        })
        .png()
        .toBuffer();

    const rightMargin = Math.round(metadata.width * 0.01);
    const bottomMargin = -Math.round(metadata.height * 0.05);

    const badgeMetadata = await sharp(badgeBuffer).metadata();

    const left = metadata.width -
        badgeMetadata.width -
        rightMargin;

    const top = metadata.height -
        badgeMetadata.height -
        bottomMargin;

    console.log('Badge dimensions:');
    console.log('Width:', badgeMetadata.width);
    console.log('Height:', badgeMetadata.height);

    console.log('Badge position:');
    console.log('Left:', left);
    console.log('Top:', top);

    const outputImage = sharp(inputPath)
    .composite([
        {
            input: badgeBuffer,
            left,
            top
        }
    ]);

switch (metadata.format) {

    case 'jpeg':
        await outputImage
            .jpeg()
            .toFile(outputPath);
        break;

    case 'png':
        await outputImage
            .png()
            .toFile(outputPath);
        break;

    case 'webp':
        await outputImage
            .webp()
            .toFile(outputPath);
        break;

    case 'avif':
        await outputImage
            .avif()
            .toFile(outputPath);
        break;

    case 'tiff':
        await outputImage
            .tiff()
            .toFile(outputPath);
        break;

    case 'gif':
        await outputImage
            .gif()
            .toFile(outputPath);
        break;

    case 'heif':
        await outputImage
            .heif()
            .toFile(outputPath);
        break;

    case 'jxl':
        await outputImage
            .jxl()
            .toFile(outputPath);
        break;

    case 'jp2':
        await outputImage
            .jp2()
            .toFile(outputPath);
        break;

    default:
        throw new Error(
            `Unsupported output format: ${metadata.format}`
        );
}

    const outputMetadata = await sharp(outputPath).metadata();

    console.log('--------------------------------');
    console.log('Image processing completed');
    console.log('Input:', inputPath);
    console.log(
        'Input dimensions:',
        `${metadata.width}x${metadata.height}`
    );
    console.log('Output:', outputPath);
    console.log(
        'Output dimensions:',
        `${outputMetadata.width}x${outputMetadata.height}`
    );
    console.log('Selected badge:', badgePath);
    console.log('--------------------------------');
    console.log('Output format:', outputMetadata.format);
}


module.exports = {
    processImage
};