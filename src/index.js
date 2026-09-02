const { processImage } = require('./imageProcessor');
const path = require('path');

const fileName = process.argv[2];

if (!fileName) {
    console.error('Please provide an image filename.');
    console.error('Usage: node src/index.js <filename>');
    process.exit(1);
}

const inputPath = `input/${fileName}`;
const outputFileName = path.parse(fileName).name + '-ai' + path.parse(fileName).ext;
const outputPath = path.join('output', outputFileName);

processImage(inputPath, outputPath)
    .then(() => {
        console.log('Processing completed.');
    })
    .catch((error) => {
        console.error('Processing failed:', error);
    });