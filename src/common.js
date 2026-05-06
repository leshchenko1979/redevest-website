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

    if (button) {
        button.setAttribute('aria-expanded', String(!isOpen));
    }
}

// Make function globally available for onclick attributes
window.toggleMobileMenu = toggleMobileMenu;

const GALLERY_DRAG_THRESHOLD = 6;
/** 0..1 — плавное следование за указателем во время перетаскивания (выше = ближе к 1:1) */
const GALLERY_DRAG_LERP = 0.42;
/** px/s — ниже не запускаем инерцию после отпускания */
const GALLERY_MOMENTUM_MIN_SPEED = 50;
/** затухание скорости, 1/сек (чем больше, тем быстрее останавливается) */
const GALLERY_MOMENTUM_DECAY = 5.5;
const GALLERY_MOMENTUM_VEL_BLEND = 0.35;

/** Левый край слайда в координатах содержимого скроллера (для кнопок и snap). */
function gallerySlideContentLeft(scroller, picture) {
    const sr = scroller.getBoundingClientRect();
    const pr = picture.getBoundingClientRect();
    return scroller.scrollLeft + (pr.left - sr.left);
}

function galleryScrollBehavior() {
    if (
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
        return 'auto';
    }
    return 'smooth';
}

function snapGalleryNearest(scroller) {
    const list = [...scroller.querySelectorAll('picture')];
    if (!list.length) return;
    const maxS = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const sl = scroller.scrollLeft;
    let best = 0;
    let bestDist = Infinity;
    for (const p of list) {
        const L = Math.max(0, Math.min(maxS, gallerySlideContentLeft(scroller, p)));
        const d = Math.abs(L - sl);
        if (d < bestDist) {
            bestDist = d;
            best = L;
        }
    }
    if (bestDist < 2) return;
    scroller.scrollTo({ left: best, behavior: galleryScrollBehavior() });
}

/**
 * Drag-to-scroll for horizontal gallery strip (mouse + touch via Pointer Events).
 * Vertical-dominant gesture cancels so the page can scroll.
 * While dragging horizontally — scroll lerps toward pointer target (smooth follow).
 * After release — inertial glide once the scroll catches up to the target.
 */
function attachGalleryDragScroll(scroller) {
    scroller.querySelectorAll('img').forEach((img) => {
        img.setAttribute('draggable', 'false');
    });
    scroller.addEventListener(
        'dragstart',
        (e) => {
            e.preventDefault();
        },
        true
    );

    let startX = 0;
    let startY = 0;
    let startScroll = 0;
    /** @type {'h' | null} */
    let axis = null;
    let lastMoveX = 0;
    let lastMoveT = 0;
    let velScrollPxPerS = 0;
    let momentumRafId = 0;
    let dragTargetScroll = 0;
    let smoothRafId = 0;
    /** @type {number | null} */
    let pendingMomentumVel = null;
    /** После горизонтального drag — один программный snap к ближайшему слайду */
    let snapAfterGesture = false;
    let snapScheduleToken = 0;

    function scheduleLocalSnapNearest() {
        const t = ++snapScheduleToken;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (t !== snapScheduleToken) return;
                snapGalleryNearest(scroller);
            });
        });
    }

    function cancelSmoothScroll() {
        if (smoothRafId) {
            cancelAnimationFrame(smoothRafId);
            smoothRafId = 0;
        }
        scroller.classList.remove('content-gallery-scroller--smooth-lerp');
    }

    function cancelMomentum() {
        if (momentumRafId) {
            cancelAnimationFrame(momentumRafId);
            momentumRafId = 0;
        }
        scroller.classList.remove('content-gallery-scroller--momentum');
    }

    function smoothTick() {
        const maxS = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
        dragTargetScroll = Math.max(0, Math.min(maxS, dragTargetScroll));

        const s = scroller.scrollLeft;
        const delta = dragTargetScroll - s;
        const dragging = axis === 'h';
        const needLerp = dragging || Math.abs(delta) > 0.5;

        if (needLerp) {
            if (Math.abs(delta) < 0.45) {
                scroller.scrollLeft = dragTargetScroll;
            } else {
                scroller.scrollLeft = s + delta * GALLERY_DRAG_LERP;
            }
            smoothRafId = requestAnimationFrame(smoothTick);
            return;
        }

        smoothRafId = 0;
        scroller.classList.remove('content-gallery-scroller--smooth-lerp');
        if (pendingMomentumVel != null) {
            const v = pendingMomentumVel;
            pendingMomentumVel = null;
            if (Math.abs(v) >= GALLERY_MOMENTUM_MIN_SPEED) {
                runMomentum(v);
            } else if (snapAfterGesture) {
                snapAfterGesture = false;
                scheduleLocalSnapNearest();
            }
        } else if (snapAfterGesture) {
            snapAfterGesture = false;
            scheduleLocalSnapNearest();
        }
    }

    function ensureSmoothLoop() {
        if (smoothRafId) return;
        scroller.classList.add('content-gallery-scroller--smooth-lerp');
        smoothRafId = requestAnimationFrame(smoothTick);
    }

    function runMomentum(initialVelPxPerS) {
        const maxL = scroller.scrollWidth - scroller.clientWidth;
        if (maxL <= 0) return;

        snapAfterGesture = false;
        cancelSmoothScroll();
        cancelMomentum();
        let vel = initialVelPxPerS;
        let last = performance.now();
        scroller.classList.add('content-gallery-scroller--momentum');

        function tick(now) {
            const dt = Math.min((now - last) / 1000, 0.064);
            last = now;

            if (Math.abs(vel) < GALLERY_MOMENTUM_MIN_SPEED * 0.35) {
                cancelMomentum();
                scheduleLocalSnapNearest();
                return;
            }

            const maxScroll = scroller.scrollWidth - scroller.clientWidth;
            const next = scroller.scrollLeft + vel * dt;
            const clamped = Math.max(0, Math.min(maxScroll, next));
            scroller.scrollLeft = clamped;

            if (clamped !== next) {
                vel = 0;
            }
            vel *= Math.exp(-GALLERY_MOMENTUM_DECAY * dt);

            momentumRafId = requestAnimationFrame(tick);
        }

        momentumRafId = requestAnimationFrame(tick);
    }

    function removeDocListeners() {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onEnd);
        document.removeEventListener('pointercancel', onEnd);
    }

    function onEnd() {
        const wasHorizontal = axis === 'h';
        const v = velScrollPxPerS;
        removeDocListeners();
        scroller.classList.remove('content-gallery-scroller--dragging');
        axis = null;
        velScrollPxPerS = 0;

        snapAfterGesture = wasHorizontal;
        if (wasHorizontal && Math.abs(v) >= GALLERY_MOMENTUM_MIN_SPEED) {
            pendingMomentumVel = v;
        } else {
            pendingMomentumVel = null;
        }
        ensureSmoothLoop();
    }

    function onMove(e) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (axis === null) {
            if (Math.abs(dx) < GALLERY_DRAG_THRESHOLD && Math.abs(dy) < GALLERY_DRAG_THRESHOLD) {
                return;
            }
            if (Math.abs(dy) >= Math.abs(dx)) {
                removeDocListeners();
                axis = null;
                snapAfterGesture = false;
                scroller.classList.remove('content-gallery-scroller--dragging');
                return;
            }
            axis = 'h';
            scroller.classList.add('content-gallery-scroller--dragging');
            lastMoveX = e.clientX;
            lastMoveT = performance.now();
            velScrollPxPerS = 0;
            dragTargetScroll = scroller.scrollLeft;
        }

        e.preventDefault();
        const maxS = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
        dragTargetScroll = Math.max(0, Math.min(maxS, startScroll - (e.clientX - startX)));
        ensureSmoothLoop();

        const t = performance.now();
        const dtMs = Math.max(t - lastMoveT, 1);
        const fingerVx = (e.clientX - lastMoveX) / dtMs;
        const instantScrollVel = -fingerVx * 1000;
        velScrollPxPerS =
            velScrollPxPerS * (1 - GALLERY_MOMENTUM_VEL_BLEND) +
            instantScrollVel * GALLERY_MOMENTUM_VEL_BLEND;
        lastMoveX = e.clientX;
        lastMoveT = t;
    }

    scroller.addEventListener(
        'pointerdown',
        (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            snapScheduleToken += 1;
            cancelMomentum();
            cancelSmoothScroll();
            pendingMomentumVel = null;
            snapAfterGesture = false;
            startX = e.clientX;
            startY = e.clientY;
            startScroll = scroller.scrollLeft;
            dragTargetScroll = startScroll;
            axis = null;
            velScrollPxPerS = 0;
            document.addEventListener('pointermove', onMove, { passive: false });
            document.addEventListener('pointerup', onEnd);
            document.addEventListener('pointercancel', onEnd);
        },
        { passive: true }
    );

    scroller._redevestCancelGalleryInteraction = () => {
        snapScheduleToken += 1;
        cancelMomentum();
        cancelSmoothScroll();
        pendingMomentumVel = null;
        snapAfterGesture = false;
        dragTargetScroll = scroller.scrollLeft;
    };
}

/**
 * Horizontal galleries on project pages ([[gallery]]): prev/next, drag scroll.
 */
/**
 * Плавное раскрытие/сворачивание [[toggle]] (details.content-toggle).
 * Нативный <details> не даёт анимировать закрытие; при закрытии кликом по summary
 * отменяем переключение, крутим max-height, затем снимаем open.
 */
function initContentToggleDetails() {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    document.querySelectorAll('details.content-toggle').forEach((details) => {
        if (details.dataset.contentToggleMotion === '1') return;
        details.dataset.contentToggleMotion = '1';

        const panel = details.querySelector('.content-toggle-panel');
        const inner = details.querySelector('.content-toggle-inner');
        const summary = details.querySelector('summary');
        if (!panel || !inner || !summary) return;

        function innerScrollHeight() {
            return inner.scrollHeight;
        }

        if (!details.open) {
            panel.style.maxHeight = '0px';
        } else {
            panel.style.maxHeight = 'none';
        }

        summary.addEventListener('click', (e) => {
            if (!details.open) return;
            e.preventDefault();
            const h = innerScrollHeight();
            const current =
                panel.style.maxHeight === 'none' || !panel.style.maxHeight
                    ? h
                    : panel.scrollHeight;
            panel.style.maxHeight = `${current}px`;
            void panel.offsetWidth;
            panel.style.maxHeight = '0px';

            const onCloseEnd = (ev) => {
                if (ev.propertyName !== 'max-height') return;
                panel.removeEventListener('transitionend', onCloseEnd);
                details.open = false;
                panel.style.maxHeight = '0px';
            };
            panel.addEventListener('transitionend', onCloseEnd);
        });

        details.addEventListener('toggle', () => {
            if (!details.open) {
                panel.style.maxHeight = '0px';
                return;
            }

            requestAnimationFrame(() => {
                panel.style.maxHeight = '0px';
                void panel.offsetWidth;
                requestAnimationFrame(() => {
                    panel.style.maxHeight = `${innerScrollHeight()}px`;

                    const onOpenEnd = (ev) => {
                        if (ev.propertyName !== 'max-height') return;
                        panel.removeEventListener('transitionend', onOpenEnd);
                        if (details.open) {
                            panel.style.maxHeight = 'none';
                        }
                    };
                    panel.addEventListener('transitionend', onOpenEnd);
                });
            });
        });
    });
}

function initContentGalleryCarousels() {
    document.querySelectorAll('.content-gallery--carousel').forEach((root) => {
        const scroller = root.querySelector('.content-gallery-scroller');
        const prev = root.querySelector('.content-gallery-prev');
        const next = root.querySelector('.content-gallery-next');
        if (!scroller || !prev || !next) return;

        attachGalleryDragScroll(scroller);

        const slides = () => [...scroller.querySelectorAll('picture')];
        const edgePad = 4;

        prev.addEventListener('click', () => {
            const list = slides();
            if (!list.length) return;
            scroller._redevestCancelGalleryInteraction?.();
            const sl = scroller.scrollLeft;
            const maxS = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
            const lefts = list.map((p) => gallerySlideContentLeft(scroller, p));
            let dest = 0;
            for (let i = lefts.length - 1; i >= 0; i--) {
                if (lefts[i] < sl - edgePad) {
                    dest = Math.max(0, Math.min(maxS, lefts[i]));
                    break;
                }
            }
            scroller.scrollTo({
                left: dest,
                behavior: 'smooth',
            });
        });
        next.addEventListener('click', () => {
            const list = slides();
            if (!list.length) return;
            scroller._redevestCancelGalleryInteraction?.();
            const sl = scroller.scrollLeft;
            const maxS = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
            const lefts = list.map((p) => gallerySlideContentLeft(scroller, p));
            const nextL = lefts.find((L) => L > sl + edgePad);
            const dest = nextL != null ? Math.max(0, Math.min(maxS, nextL)) : maxS;
            scroller.scrollTo({
                left: dest,
                behavior: 'smooth',
            });
        });
    });
}

if (typeof document !== 'undefined') {
    function initCommonUi() {
        initContentToggleDetails();
        initContentGalleryCarousels();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCommonUi);
    } else {
        initCommonUi();
    }
}

// Export for potential module usage
export {
    toggleMobileMenu,
    initContentToggleDetails,
    initContentGalleryCarousels,
    attachGalleryDragScroll,
};
