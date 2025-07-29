/**
 * Advanced Logging System for Bot Framework
 */

const fs = require('fs').promises;
const path = require('path');

const LogLevel = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
    TRACE: 4
};

class Logger {
    constructor(level = 'info', logFile = null, options = {}) {
        this.level = typeof level === 'string' ? LogLevel[level.toUpperCase()] : level;
        this.logFile = logFile;
        this.options = {
            colorize: options.colorize !== false,
            timestamp: options.timestamp !== false,
            maxFileSize: options.maxFileSize || 10 * 1024 * 1024, // 10MB
            maxFiles: options.maxFiles || 5,
            ...options
        };
        
        this.colors = {
            error: '\x1b[31m',   // Red
            warn: '\x1b[33m',    // Yellow
            info: '\x1b[36m',    // Cyan
            debug: '\x1b[35m',   // Magenta
            trace: '\x1b[37m',   // White
            reset: '\x1b[0m'     // Reset
        };

        this.context = {};
    }

    child(context) {
        const childLogger = Object.create(this);
        childLogger.context = { ...this.context, ...context };
        return childLogger;
    }

    formatMessage(level, message, meta = {}) {
        const timestamp = this.options.timestamp ? new Date().toISOString() : '';
        const contextStr = Object.keys(this.context).length > 0 
            ? `[${Object.entries(this.context).map(([k, v]) => `${k}:${v}`).join(' ')}]` 
            : '';
        
        const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
        
        return `${timestamp} ${level.toUpperCase()}${contextStr}: ${message}${metaStr}`;
    }

    async writeToFile(message) {
        if (!this.logFile) return;

        try {
            // Check file size and rotate if necessary
            await this.rotateLogIfNeeded();
            
            await fs.appendFile(this.logFile, message + '\n');
        } catch (error) {
            console.error('Failed to write to log file:', error.message);
        }
    }

    async rotateLogIfNeeded() {
        try {
            const stats = await fs.stat(this.logFile);
            
            if (stats.size > this.options.maxFileSize) {
                await this.rotateLogs();
            }
        } catch (error) {
            // File doesn't exist yet, which is fine
        }
    }

    async rotateLogs() {
        const logDir = path.dirname(this.logFile);
        const logName = path.basename(this.logFile, '.log');
        
        // Rotate existing files
        for (let i = this.options.maxFiles - 1; i > 0; i--) {
            const oldFile = path.join(logDir, `${logName}.${i}.log`);
            const newFile = path.join(logDir, `${logName}.${i + 1}.log`);
            
            try {
                await fs.rename(oldFile, newFile);
            } catch (error) {
                // File might not exist, which is fine
            }
        }
        
        // Move current log to .1
        const backupFile = path.join(logDir, `${logName}.1.log`);
        try {
            await fs.rename(this.logFile, backupFile);
        } catch (error) {
            // Original file might not exist
        }
        
        // Remove oldest files
        const oldestFile = path.join(logDir, `${logName}.${this.options.maxFiles + 1}.log`);
        try {
            await fs.unlink(oldestFile);
        } catch (error) {
            // File might not exist
        }
    }

    log(level, message, meta = {}) {
        const levelNum = typeof level === 'string' ? LogLevel[level.toUpperCase()] : level;
        
        if (levelNum > this.level) return;

        const formattedMessage = this.formatMessage(level, message, meta);
        
        // Console output with colors
        if (this.options.colorize && process.stdout.isTTY) {
            const color = this.colors[level] || this.colors.reset;
            console.log(`${color}${formattedMessage}${this.colors.reset}`);
        } else {
            console.log(formattedMessage);
        }
        
        // File output
        this.writeToFile(formattedMessage);
    }

    error(message, meta = {}) {
        this.log('error', message, meta);
    }

    warn(message, meta = {}) {
        this.log('warn', message, meta);
    }

    info(message, meta = {}) {
        this.log('info', message, meta);
    }

    debug(message, meta = {}) {
        this.log('debug', message, meta);
    }

    trace(message, meta = {}) {
        this.log('trace', message, meta);
    }
}

module.exports = Logger;
