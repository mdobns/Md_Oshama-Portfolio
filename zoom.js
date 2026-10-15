(() => {
    const layers = [...document.querySelectorAll('.layer')];
    const stage = document.getElementById('stage');
    const meter = document.getElementById('meter');
    const meterBar = document.getElementById('meter-bar');
    const hint = document.getElementById('hint');
    const announcer = document.getElementById('announcer');
    const root = document.documentElement;
    const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    // Each layer is SCALE times larger than the one nested in its window.
    const SCALE = 4;
    const LOG_SCALE = Math.log(SCALE);
    const COUNT = layers.length;
    const WHEEL_SPEED = .0016;
    const SNAP_DELAY = 400;

    // z is a continuous, unbounded depth: z = 3 shows layer 3 filling the screen,
    // z = 3.5 is halfway into layer 4. Layers are picked with z modulo COUNT.
    let zView = 0;
    let zTarget = 0;
    let animationId;
    let lastFrameTime = 0;
    let snapTimer;
    let activeIndex = -1;
    let reduced = reduceMotionQuery.matches;
    let reducedWheel = 0;
    let reducedLocked = false;
    let touchMode = null;
    let touchStartY = 0;
    let touchStartDistance = 0;
    let touchStartZ = 0;
    let hintHidden = false;

    const states = layers.map(() => ({ visible: false, interactive: false, transform: '', zIndex: '', opacity: '', fade: '' }));

    const wrapIndex = (value) => ((value % COUNT) + COUNT) % COUNT;
    // Signed distance from layer i to depth z, wrapped into [-COUNT/2, COUNT/2).
    const layerDelta = (z, index) => wrapIndex(z - index + COUNT / 2) - COUNT / 2;

    layers.forEach((layer, index) => {
        const next = layers[wrapIndex(index + 1)];
        layer.style.setProperty('--accent', layer.dataset.accent);
        layer.style.setProperty('--tint', layer.dataset.tint);
        layer.style.setProperty('--next', next.dataset.accent);
        layer.setAttribute('inert', '');
        layer.setAttribute('aria-hidden', 'true');

        const portal = document.createElement('button');
        portal.type = 'button';
        portal.className = 'window';
        portal.setAttribute('aria-label', `Zoom into ${next.dataset.label}`);
        portal.innerHTML = `<span class="window__label">Zoom → ${next.dataset.label}${index === COUNT - 1 ? ' · loop' : ''}</span>`;
        portal.addEventListener('click', () => step(1));
        layer.append(portal);
    });

    // The window in every layer is the viewport scaled by 1/SCALE about the
    // zoom origin, so the child layer (scaled by the same factor about the
    // same origin) lands exactly on it.
    function measure() {
        const width = stage.clientWidth;
        const height = stage.clientHeight;
        const stacked = width < 768 || width / height < .9;
        const originX = width * (stacked ? .5 : .7);
        const originY = height * (stacked ? .8 : .52);
        const shrink = 1 - 1 / SCALE;
        root.dataset.layout = stacked ? 'stack' : 'side';
        root.style.setProperty('--ox', `${originX}px`);
        root.style.setProperty('--oy', `${originY}px`);
        root.style.setProperty('--win-l', `${originX * shrink}px`);
        root.style.setProperty('--win-t', `${originY * shrink}px`);
        root.style.setProperty('--win-w', `${width / SCALE}px`);
        root.style.setProperty('--win-h', `${height / SCALE}px`);
    }

    function setActive(index) {
        if (index === activeIndex) return;
        activeIndex = index;
        const layer = layers[index];
        root.style.setProperty('--accent', layer.dataset.accent);
        document.querySelector('meta[name="theme-color"]').setAttribute('content', layer.dataset.tint);
        layers.forEach((item, itemIndex) => {
            const current = itemIndex === index;
            item.toggleAttribute('inert', !current);
            item.setAttribute('aria-hidden', String(!current));
        });
        announcer.textContent = `Layer ${index + 1} of ${COUNT}: ${layer.dataset.label}`;
        history.replaceState(null, '', `#layer-${index + 1}`);
    }

    function render() {
        layers.forEach((layer, index) => {
            const delta = layerDelta(zView, index);
            const state = states[index];
            // Visible: from two levels deep (a speck inside the child's window)
            // until it has grown SCALE times and its window fills the screen.
            const visible = delta > -2 && delta < 1;

            if (visible !== state.visible) {
                state.visible = visible;
                layer.classList.toggle('is-visible', visible);
            }
            if (!visible) return;

            const transform = `translate3d(0,0,0) scale(${Math.pow(SCALE, delta).toFixed(5)})`;
            // Deeper layers paint on top of their parents; deltas differ by whole numbers.
            const zIndex = String(50 - Math.round(delta * 10));
            // Fade the grandchild in so it doesn't pop. The outgoing layer keeps its
            // background (no holes around the child) and only its content dissolves.
            const opacity = Math.min(1, (delta + 2) / .5).toFixed(3);
            const fade = (delta > .55 ? Math.max(0, 1 - (delta - .55) / .45) : 1).toFixed(3);
            const interactive = Math.abs(delta) < .12;

            if (transform !== state.transform) layer.style.transform = state.transform = transform;
            if (zIndex !== state.zIndex) layer.style.zIndex = state.zIndex = zIndex;
            if (opacity !== state.opacity) layer.style.opacity = state.opacity = opacity;
            if (fade !== state.fade) layer.style.setProperty('--fade', state.fade = fade);
            if (interactive !== state.interactive) {
                state.interactive = interactive;
                layer.classList.toggle('is-interactive', interactive);
            }
        });

        const nearest = wrapIndex(Math.round(zView));
        setActive(nearest);
        meter.textContent = `Depth ∞ · Layer ${String(nearest + 1).padStart(2, '0')}/${String(COUNT).padStart(2, '0')} · ${layers[nearest].dataset.label}`;
        meterBar.style.transform = `scaleX(${(wrapIndex(zView) / COUNT).toFixed(4)})`;
    }

    function frame(time) {
        const elapsed = lastFrameTime ? Math.min(time - lastFrameTime, 64) : 16.7;
        lastFrameTime = time;
        // Frame-rate independent easing towards the target depth.
        const ease = 1 - Math.pow(1 - .14, elapsed / 16.7);
        zView += (zTarget - zView) * ease;

        if (Math.abs(zTarget - zView) < .0005) {
            zView = zTarget;
            render();
            animationId = undefined;
            lastFrameTime = 0;
            return;
        }
        render();
        animationId = window.requestAnimationFrame(frame);
    }

    function kick() {
        if (reduced) {
            zView = zTarget;
            render();
            return;
        }
        if (!animationId) animationId = window.requestAnimationFrame(frame);
    }

    function hideHint() {
        if (hintHidden) return;
        hintHidden = true;
        hint.style.opacity = '0';
    }

    function scheduleSnap() {
        window.clearTimeout(snapTimer);
        snapTimer = window.setTimeout(() => {
            zTarget = Math.round(zTarget);
            kick();
        }, SNAP_DELAY);
    }

    // Reduced motion: no continuous zoom, just a quick fade between whole layers.
    function jump(direction) {
        if (reducedLocked) return;
        reducedLocked = true;
        stage.classList.add('is-fading');
        window.setTimeout(() => {
            zTarget = Math.round(zTarget) + direction;
            zView = zTarget;
            render();
            stage.classList.remove('is-fading');
            window.setTimeout(() => { reducedLocked = false; }, 200);
        }, 160);
    }

    function step(direction) {
        hideHint();
        if (reduced) {
            jump(direction);
            return;
        }
        window.clearTimeout(snapTimer);
        zTarget = Math.round(zTarget) + direction;
        kick();
    }

    window.addEventListener('wheel', (event) => {
        if (event.target.closest('.views')) return;
        event.preventDefault();
        hideHint();
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1;
        const delta = Math.max(-120, Math.min(120, event.deltaY * unit));
        if (reduced) {
            reducedWheel += delta;
            if (Math.abs(reducedWheel) > 60) {
                jump(reducedWheel > 0 ? 1 : -1);
                reducedWheel = 0;
            }
            return;
        }
        zTarget += delta * WHEEL_SPEED;
        kick();
        scheduleSnap();
    }, { passive: false });

    const touchDistance = (touches) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);

    window.addEventListener('touchstart', (event) => {
        if (event.target.closest('.views')) return;
        window.clearTimeout(snapTimer);
        touchStartZ = zTarget;
        if (event.touches.length >= 2) {
            touchMode = 'pinch';
            touchStartDistance = touchDistance(event.touches) || 1;
        } else {
            touchMode = 'drag';
            touchStartY = event.touches[0].clientY;
        }
    }, { passive: true });

    window.addEventListener('touchmove', (event) => {
        if (!touchMode || reduced) return;
        if (touchMode === 'pinch' && event.touches.length >= 2) {
            zTarget = touchStartZ + Math.log(touchDistance(event.touches) / touchStartDistance) / LOG_SCALE;
        } else if (touchMode === 'drag') {
            // Swiping up zooms in; a swipe of ~55% of the screen moves one layer.
            zTarget = touchStartZ + (touchStartY - event.touches[0].clientY) / (stage.clientHeight * .55);
        }
        hideHint();
        kick();
    }, { passive: true });

    window.addEventListener('touchend', (event) => {
        if (!touchMode || event.touches.length > 0) return;
        const mode = touchMode;
        touchMode = null;
        if (reduced) {
            const distance = touchStartY - event.changedTouches[0].clientY;
            if (mode === 'drag' && Math.abs(distance) > 50) jump(distance > 0 ? 1 : -1);
            return;
        }
        const moved = zTarget - touchStartZ;
        // Settle in the direction of travel so a short flick still advances a layer.
        if (moved > .08) zTarget = Math.ceil(zTarget);
        else if (moved < -.08) zTarget = Math.floor(zTarget);
        else zTarget = Math.round(zTarget);
        kick();
    }, { passive: true });

    window.addEventListener('keydown', (event) => {
        const onControl = Boolean(event.target.closest('a, button, summary'));
        if (['ArrowDown', 'ArrowRight', 'PageDown'].includes(event.key) || (event.key === ' ' && !onControl)) {
            event.preventDefault();
            step(1);
        } else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(event.key)) {
            event.preventDefault();
            step(-1);
        }
    });

    document.querySelectorAll('[data-zoom-in]').forEach((button) => button.addEventListener('click', () => step(1)));
    document.querySelector('.skip-link').addEventListener('click', (event) => {
        event.preventDefault();
        const forward = wrapIndex(-Math.round(zTarget));
        zTarget = Math.round(zTarget) + forward;
        if (reduced) zView = zTarget;
        kick();
    });

    let resizeTimer;
    function onResize() {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
            measure();
            render();
        }, 100);
    }
    window.addEventListener('resize', onResize, { passive: true });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize, { passive: true });

    reduceMotionQuery.addEventListener('change', () => {
        reduced = reduceMotionQuery.matches;
        zTarget = Math.round(zTarget);
        zView = zTarget;
        render();
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden || !animationId) return;
        // Finish instantly rather than animating in a hidden tab.
        window.cancelAnimationFrame(animationId);
        animationId = undefined;
        lastFrameTime = 0;
        zView = zTarget;
        render();
    });

    const hashMatch = window.location.hash.match(/^#layer-(\d+)$/);
    if (hashMatch) zView = zTarget = Math.min(Math.max(Number(hashMatch[1]) - 1, 0), COUNT - 1);

    measure();
    render();
})();
