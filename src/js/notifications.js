/**
 * Professional Notification System
 * A lightweight library for displaying elegant toast notifications
 */

class NotificationSystem {
    constructor() {
        this.injectStyles();
    }

    /**
     * Inject CSS styles for notifications
     */
    injectStyles() {
        // Check if styles are already injected
        if (document.getElementById('notification-styles')) return;

        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 15px 20px;
                border-radius: 6px;
                color: white;
                font-weight: 500;
                z-index: 1000;
                max-width: 400px;
                opacity: 0;
                transform: translateX(100%);
                transition: all 0.3s ease;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 14px;
                line-height: 1.4;
            }
            .notification.show {
                opacity: 1;
                transform: translateX(0);
            }
            .notification.success {
                background-color: #10b981;
                border-left: 4px solid #059669;
            }
            .notification.error {
                background-color: #ef4444;
                border-left: 4px solid #dc2626;
            }
            .notification.warning {
                background-color: #f59e0b;
                border-left: 4px solid #d97706;
                color: #1f2937;
            }
            .notification.info {
                background-color: #3b82f6;
                border-left: 4px solid #2563eb;
            }
            .notification:hover {
                transform: translateX(-5px);
                box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Show a notification
     * @param {string} message - The message to display
     * @param {string} type - The notification type (success, error, warning, info)
     * @param {number} duration - How long to show the notification in milliseconds (default: 4000)
     */
    show(message, type = 'success', duration = 4000) {
        // Remove existing notifications
        this.clearAll();
        
        // Create new notification
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Add to page
        document.body.appendChild(notification);
        
        // Show notification with animation
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        // Hide and remove notification
        setTimeout(() => {
            this.hide(notification);
        }, duration);

        return notification;
    }

    /**
     * Hide a specific notification
     * @param {Element} notification - The notification element to hide
     */
    hide(notification) {
        if (!notification || !notification.parentNode) return;
        
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }

    /**
     * Clear all notifications
     */
    clearAll() {
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(notif => this.hide(notif));
    }

    /**
     * Show success notification
     * @param {string} message - The success message
     * @param {number} duration - Duration in milliseconds
     */
    success(message, duration = 4000) {
        return this.show(message, 'success', duration);
    }

    /**
     * Show error notification
     * @param {string} message - The error message
     * @param {number} duration - Duration in milliseconds
     */
    error(message, duration = 5000) {
        return this.show(message, 'error', duration);
    }

    /**
     * Show warning notification
     * @param {string} message - The warning message
     * @param {number} duration - Duration in milliseconds
     */
    warning(message, duration = 4000) {
        return this.show(message, 'warning', duration);
    }

    /**
     * Show info notification
     * @param {string} message - The info message
     * @param {number} duration - Duration in milliseconds
     */
    info(message, duration = 4000) {
        return this.show(message, 'info', duration);
    }
}

// Create global instance
const notifications = new NotificationSystem();

// Export for module systems (if available)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotificationSystem;
}

// Global function for backward compatibility
function showNotification(message, type = 'success') {
    return notifications.show(message, type);
}
