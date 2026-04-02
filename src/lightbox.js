/**
 * Lightbox Gallery Module
 * Reusable lightbox for image galleries.
 *
 * Usage:
 * 1. Add images with data-gallery attribute and data-index
 * 2. Include lightbox.css and lightbox.html partial
 * 3. Call initLightbox() on DOMContentLoaded
 *
 * HTML example:
 * <div class="lightbox-gallery">
 *   <img src="..." data-index="0" onclick="openLightbox(this)">
 *   <img src="..." data-index="1" onclick="openLightbox(this)">
 * </div>
 */

let lightboxImages = [];
let currentLightboxIndex = 0;
let lightboxInstance = null;

function initLightbox(gallerySelector = '.lightbox-gallery') {
    lightboxImages = Array.from(document.querySelectorAll(`${gallerySelector} img[data-index]`));
    lightboxInstance = document.getElementById('lightbox');

    if (!lightboxInstance) return;

    lightboxInstance.addEventListener('click', (e) => {
        if (e.target === lightboxInstance) {
            closeLightbox();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (!lightboxInstance || !lightboxInstance.classList.contains('active')) return;
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') navigateLightbox(-1);
        if (e.key === 'ArrowRight') navigateLightbox(1);
    });
}

function openLightbox(elementOrIndex) {
    if (!lightboxInstance) return;

    if (typeof elementOrIndex === 'number') {
        currentLightboxIndex = elementOrIndex;
    } else {
        const index = parseInt(elementOrIndex.getAttribute('data-index'), 10);
        currentLightboxIndex = isNaN(index) ? 0 : index;
    }

    updateLightboxImage();
    lightboxInstance.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeLightbox(event) {
    if (event && event.target && event.target.className === 'lightbox-close') {
        // Close button click - OK
    } else if (event && event.target !== lightboxInstance) {
        return;
    }

    if (lightboxInstance) {
        lightboxInstance.classList.remove('active');
    }
    document.body.style.overflow = '';
}

function navigateLightbox(event, direction) {
    if (event) event.stopPropagation();
    currentLightboxIndex = (currentLightboxIndex + direction + lightboxImages.length) % lightboxImages.length;
    updateLightboxImage();
}

function updateLightboxImage() {
    if (!lightboxInstance || lightboxImages.length === 0) return;

    const img = lightboxImages[currentLightboxIndex];
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxCounter = document.getElementById('lightbox-counter');

    if (!img || !lightboxImg) return;

    lightboxImg.src = img.src;
    lightboxImg.alt = img.alt || '';

    if (lightboxCounter) {
        lightboxCounter.textContent = `${currentLightboxIndex + 1} / ${lightboxImages.length}`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initLightbox();
});
