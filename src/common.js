/**
 * Common JavaScript functions for Redevest website
 */

/**
 * Toggle mobile menu visibility
 * Handles opening/closing the mobile navigation menu
 */
function toggleMobileMenu() {
    const overlay = document.getElementById('mobile-menu-overlay');
    const panel = document.getElementById('mobile-menu-panel');
    const button = document.querySelector('button[aria-label="Открыть мобильное меню"]');

    const isOpen = overlay.classList.contains('active');

    overlay.classList.toggle('active');
    panel.classList.toggle('active');
    document.body.classList.toggle('overflow-hidden');

    // Update aria-expanded
    if (button) {
        button.setAttribute('aria-expanded', !isOpen);
    }
}

// Make function globally available for onclick attributes
window.toggleMobileMenu = toggleMobileMenu;

// Export for potential module usage
export { toggleMobileMenu };
