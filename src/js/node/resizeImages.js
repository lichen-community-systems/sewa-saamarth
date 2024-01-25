/* eslint-env node */

"use strict";

const fs = require("fs");
const sharp = require("sharp");

const inputDirectory = "img/orig";
const outputDirectory = "img/small";
const targetSize = 160;

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDirectory)) {
    fs.mkdirSync(outputDirectory);
}

// Get a list of all files in the input directory
const files = fs.readdirSync(inputDirectory);

// Resize each image and save it to the output directory
files.forEach(async (file) => {
    const inputFile = `${inputDirectory}/${file}`;
    const outputFile = `${outputDirectory}/${file}`;

    try {
        const buffer = await fs.promises.readFile(inputFile);
        await sharp(buffer)
            .resize({
                width: targetSize,
                height: targetSize,
                fit: "cover",
            })
            .toFile(outputFile);

        console.log(`Resized ${file} to ${targetSize}x${targetSize} and saved to ${outputDirectory}`);
    } catch (error) {
        console.error(`Error processing ${file}: ${error.message}`);
    }
});
