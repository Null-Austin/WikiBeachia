/**
 * Content Monitor Bot - New Framework Version
 * Monitors for spam, inappropriate content, and maintains content quality
 */

const { BaseBot } = require('../framework');

class ContentMonitorBot extends BaseBot {
    constructor(name, framework) {
        super(name, framework);
        this.dependencies = [];
        this.config = {
            scanInterval: 6 * 60 * 60 * 1000, // 6 hours
            suspiciousKeywords: [
                'spam', 'phishing', 'malware', 'virus',
                'fake', 'scam', 'fraud', 'illegal'
            ],
            maxContentLength: 50000, // 50KB
            enableAutoModeration: true
        };
        
        this.suspiciousPatterns = [
            /https?:\/\/[^\s]+\.(?:tk|ml|ga|cf)/gi, // Suspicious domains
            /(?:buy|sell|cheap|free).*(?:now|today|click)/gi, // Spam patterns
            /\b(?:password|login|account)\s*[:=]\s*\S+/gi, // Credential patterns
        ];
    }

    async initialize(context) {
        this.logger.info('Initializing Content Monitor Bot...');
        
        this.db = await this.framework.apiClient.getDatabase();
        
        this.moderationLog = [];
        this.scanResults = {
            lastScan: null,
            pagesScanned: 0,
            issuesFound: 0,
            actionsToken: 0
        };
        
        this.logger.info('Content Monitor Bot initialized successfully');
    }

    async execute(context) {
        this.logger.info('Starting content monitoring scan...');
        
        const results = {
            scanStart: new Date(),
            scanEnd: null,
            pagesScanned: 0,
            issuesFound: 0,
            actions: [],
            summary: {}
        };

        try {
            // Get all pages for scanning
            const allPages = await this.db.pages.getAllPages();
            
            for (const page of allPages) {
                try {
                    const scanResult = await this.scanPage(page);
                    results.pagesScanned++;
                    
                    if (scanResult.issues.length > 0) {
                        results.issuesFound += scanResult.issues.length;
                        results.actions.push({
                            pageId: page.id,
                            pageName: page.name,
                            issues: scanResult.issues,
                            actions: scanResult.actions
                        });
                        
                        // Take automated actions if enabled
                        if (this.config.enableAutoModeration) {
                            await this.takeAutomaticActions(page, scanResult);
                        }
                    }
                } catch (error) {
                    this.logger.warn(`Failed to scan page ${page.name}: ${error.message}`);
                }
            }

            results.scanEnd = new Date();
            results.duration = results.scanEnd - results.scanStart;
            
            // Generate summary report
            results.summary = await this.generateSummaryReport(results);
            
            this.logger.info(
                `Content scan completed: ${results.pagesScanned} pages scanned, ` +
                `${results.issuesFound} issues found`
            );

            return results;

        } catch (error) {
            this.logger.error(`Content monitoring failed: ${error.message}`);
            throw error;
        }
    }

    async scanPage(page) {
        const issues = [];
        const actions = [];
        
        // Check content length
        if (page.content && page.content.length > this.config.maxContentLength) {
            issues.push({
                type: 'excessive_length',
                severity: 'medium',
                message: `Content exceeds maximum length (${page.content.length} > ${this.config.maxContentLength})`
            });
        }

        // Check for suspicious keywords
        if (page.content) {
            for (const keyword of this.config.suspiciousKeywords) {
                if (page.content.toLowerCase().includes(keyword)) {
                    issues.push({
                        type: 'suspicious_keyword',
                        severity: 'high',
                        message: `Suspicious keyword detected: ${keyword}`,
                        keyword
                    });
                }
            }

            // Check for suspicious patterns
            for (const pattern of this.suspiciousPatterns) {
                const matches = page.content.match(pattern);
                if (matches) {
                    issues.push({
                        type: 'suspicious_pattern',
                        severity: 'high',
                        message: `Suspicious pattern detected: ${matches[0]}`,
                        pattern: pattern.toString(),
                        matches
                    });
                }
            }
        }

        // Check for rapid edits (would need edit history)
        // This would require extending the database schema
        
        // Check for unusual formatting
        if (page.content) {
            const htmlTags = page.content.match(/<[^>]+>/g);
            if (htmlTags && htmlTags.length > 50) {
                issues.push({
                    type: 'excessive_html',
                    severity: 'medium',
                    message: `Excessive HTML tags detected (${htmlTags.length} tags)`
                });
            }
        }

        return { issues, actions };
    }

    async takeAutomaticActions(page, scanResult) {
        const highSeverityIssues = scanResult.issues.filter(issue => issue.severity === 'high');
        
        if (highSeverityIssues.length > 0) {
            // For high severity issues, we might want to flag for manual review
            this.logger.warn(
                `High severity issues detected in page ${page.name}. Manual review recommended.`
            );
            
            // Log to moderation queue
            this.moderationLog.push({
                timestamp: new Date(),
                pageId: page.id,
                pageName: page.name,
                issues: highSeverityIssues,
                status: 'flagged_for_review'
            });
        }

        // For now, just log actions rather than automatically modifying content
        // In a production system, you might want to:
        // - Move suspicious content to a quarantine area
        // - Notify administrators
        // - Temporarily hide pages pending review
        
        scanResult.actions.push({
            type: 'logged_for_review',
            timestamp: new Date(),
            reason: `${scanResult.issues.length} issues detected`
        });
    }

    async generateSummaryReport(results) {
        const summary = {
            totalPages: results.pagesScanned,
            cleanPages: results.pagesScanned - results.actions.length,
            flaggedPages: results.actions.length,
            issueBreakdown: {},
            severityBreakdown: { high: 0, medium: 0, low: 0 },
            recommendations: []
        };

        // Analyze issue types
        for (const action of results.actions) {
            for (const issue of action.issues) {
                summary.issueBreakdown[issue.type] = (summary.issueBreakdown[issue.type] || 0) + 1;
                summary.severityBreakdown[issue.severity]++;
            }
        }

        // Generate recommendations
        if (summary.severityBreakdown.high > 0) {
            summary.recommendations.push('Immediate review of high severity issues recommended');
        }
        
        if (summary.flaggedPages > summary.totalPages * 0.1) {
            summary.recommendations.push('High percentage of flagged content - review moderation rules');
        }

        if (summary.issueBreakdown.suspicious_keyword > 10) {
            summary.recommendations.push('Consider updating keyword filters');
        }

        // Store summary in moderation log page
        await this.storeModerationReport(summary);

        return summary;
    }

    async storeModerationReport(summary) {
        try {
            const reportContent = `# Content Moderation Report

**Generated**: ${new Date().toISOString()}

## Summary
- **Total Pages Scanned**: ${summary.totalPages}
- **Clean Pages**: ${summary.cleanPages}
- **Flagged Pages**: ${summary.flaggedPages}

## Issue Breakdown
${Object.entries(summary.issueBreakdown)
    .map(([type, count]) => `- **${type.replace('_', ' ').toUpperCase()}**: ${count}`)
    .join('\n')}

## Severity Distribution
- **High**: ${summary.severityBreakdown.high}
- **Medium**: ${summary.severityBreakdown.medium}
- **Low**: ${summary.severityBreakdown.low}

## Recommendations
${summary.recommendations.map(rec => `- ${rec}`).join('\n')}

---
*Report automatically generated by WikiBeachia Content Monitor Bot*`;

            // Store or update moderation report page
            let reportPage;
            try {
                reportPage = await this.db.pages.getPage('moderation-report');
            } catch (error) {
                // Page doesn't exist
            }

            if (reportPage) {
                await this.db.pages.updatePage(reportPage.id, 'moderation-report', 'Content Moderation Report', reportContent);
            } else {
                await this.db.pages.createPage('moderation-report', 'Content Moderation Report', reportContent, 500); // Admin only
            }

        } catch (error) {
            this.logger.warn(`Could not store moderation report: ${error.message}`);
        }
    }

    async cleanup() {
        this.logger.info('Content Monitor Bot cleanup complete');
    }
}

module.exports = ContentMonitorBot;
