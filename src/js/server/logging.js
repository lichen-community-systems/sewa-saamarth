/* eslint-env node */

"use strict";

const winston = require("winston"),
    fs = require("fs");

const { createLogger, format, transports } = winston;
const { combine, timestamp, printf } = format;

if (!fs.existsSync("logs")) {
    fs.mkdirSync("logs");
};

// Create a custom format for the log messages
const logFormat = printf(({ level, message, timestamp }) => {
    return `[${timestamp}] ${level}: ${message}`;
});

// Create a logger instance with custom transports
const logger = createLogger({
    format: combine(timestamp(), logFormat),
    transports: [
        // Console transport
        new transports.Console(),

        // File transport
        new transports.File({
            filename: `logs/server-${new Date().toISOString().replace(/:/g, "-")}.log`,
            level: "info"
        })
    ]
});

// Custom middleware for logging
const loggerMiddleware = (req, res, next) => {
    const startTime = new Date();

    res.on("finish", () => {
        const endTime = new Date();
        const elapsedTime = endTime - startTime;

        logger.info(`[${startTime.toISOString()}] ${req.method} ${req.url} - ${res.statusCode} | ${elapsedTime}ms`);
    });

    next();
};



module.exports = {logger, loggerMiddleware};
