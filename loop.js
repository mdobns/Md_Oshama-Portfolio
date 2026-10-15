(() => {
    const root = document.documentElement;
    root.classList.add('js');

    const viewport = document.getElementById('viewport');
    const track = document.getElementById('track');
    const original = track.querySelector('[data-copy]');
    const lapLabel = document.getElementById('lap');
    const sectionLabel = document.getElementById('section-name');
    const announcer = document.getElementById('announcer');
    const skipLink = document.querySelector('.skip-link');
    const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobileQuery = window.matchMedia('(max-width: 767px), (pointer: coarse)');

    // Three identical copies: [clone][original][clone]. The visible window always
    // sits on the original or the copy after it, so wrapping is invisible.
    const makeClone = () => {
        const clone = original.cloneNode(true);
        clone.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
        clone.setAttribute('aria-hidden', 'true');
        clone.setAttribute('inert', '');
        return clone;
    };
    track.prepend(makeClone());
    track.append(makeClone());
    const copies = [...track.querySelectorAll('[data-copy]')];

    const sections = [...original.querySelectorAll('.block')];
    const revealGroups = [...original.querySelectorAll('.reveal')].map((_, index) => copies.map((copy) => copy.querySelectorAll('.reveal')[index]));
    const frames = copies.flatMap((copy) => [...copy.querySelectorAll('.frame')]);
    const marqueeTracks = [...track.querySelectorAll('.marquee__track')];
    const bandsPerCopy = marqueeTracks.length / copies.length;
    document.getElementById('loop-hello').setAttribute('tabindex', '-1');

    let copyHeight = 1;
    let viewHeight = window.innerHeight;
    let sectionTops = [];
    let revealBoxes = [];
    let frameBoxes = [];
    let marqueeAnimations = [];

    let current = 0;
    let target = 0;
    let velocity = 0;
    let scrollDirection = 1;
    let animationId;
    let touchActive = false;
    let touchLastY = 0;
    let touchLastTime = 0;
    let touchVelocity = 0;
    let lastLap = '';
    let lastSection = -1;
    let announceTimer;
    let measureFrame;
    let reduced = reduceMotionQuery.matches;
    let mobile = mobileQuery.matches;

    const wrap = (value, size) => ((value % size) + size) % size;
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    function topInTrack(element) {
        let top = 0;
        let node = element;
        while (node && node !== viewport) {
            top += node.offsetTop;
            node = node.offsetParent;
        }
        return top;
    }

    function measure() {
        const previousHeight = copyHeight;
        const lapStart = current - wrap(current, previousHeight);
        const progress = wrap(current, previousHeight) / previousHeight;

        viewHeight = window.innerHeight;
        copyHeight = Math.max(original.offsetHeight, 1);
        const originalTop = topInTrack(original);
        sectionTops = sections.map((section) => topInTrack(section) - originalTop);
        revealBoxes = revealGroups.map(([, element]) => ({ top: topInTrack(element) - originalTop, height: element.offsetHeight }));
        frameBoxes = frames.map((frame) => ({ img: frame.querySelector('img'), top: topInTrack(frame), height: frame.offsetHeight }));

        // Keep the same spot in the lap when the copy height changes.
        if (previousHeight > 1 && previousHeight !== copyHeight) {
            const shift = lapStart / previousHeight * copyHeight + progress * copyHeight - current;
            current += shift;
            target += shift;
        }
        render();
    }

    function scheduleMeasure() {
        window.cancelAnimationFrame(measureFrame);
        measureFrame = window.requestAnimationFrame(measure);
    }

    function buildMarquees() {
        marqueeAnimations.forEach((animation) => animation.cancel());
        marqueeAnimations = [];
        const span = original.querySelector('.marquee__track span');
        const minimumWidth = Math.max(window.innerWidth, window.screen.width || 0, 1440);

        marqueeTracks.forEach((marquee, index) => {
            if (!marquee.dataset.source) marquee.dataset.source = marquee.innerHTML;
            marquee.innerHTML = marquee.dataset.source;
            const unitWidth = Math.max(marquee.firstElementChild.offsetWidth || span.offsetWidth, 1);
            const repeats = Math.ceil(minimumWidth / unitWidth) + 1;
            // Two identical halves so translating by -50% loops seamlessly.
            marquee.innerHTML = marquee.dataset.source.repeat(repeats * 2);
            if (reduced) return;
            const animation = marquee.animate(
                [{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(-50%,0,0)' }],
                { duration: unitWidth * repeats * 16, iterations: Infinity }
            );
            animation.baseRate = (index % bandsPerCopy) % 2 === 0 ? 1 : -1;
            animation.playbackRate = animation.baseRate * scrollDirection;
            marqueeAnimations.push(animation);
        });
    }

    function updateMarquees(speed) {
        const boost = 1 + Math.min(Math.abs(speed) * .08, 6);
        marqueeAnimations.forEach((animation) => {
            const rate = animation.baseRate * scrollDirection * boost;
            if (Math.abs(animation.playbackRate - rate) > .05) animation.playbackRate = rate;
        });
    }

    function render() {
        const lapOffset = wrap(current, copyHeight);
        const offset = copyHeight + lapOffset;
        const skew = reduced || mobile ? 0 : clamp(velocity * .045, -4, 4);
        track.style.transform = `translate3d(0, ${(-offset).toFixed(2)}px, 0)${skew ? ` skewY(${skew.toFixed(3)}deg)` : ''}`;

        // Reveal state depends only on position within the lap, so every copy agrees
        // and nothing flickers when the window crosses from one copy to the next.
        const revealLine = viewHeight * .88;
        revealBoxes.forEach((box, index) => {
            const screenTop = wrap(box.top - lapOffset + box.height, copyHeight) - box.height;
            const visible = screenTop < revealLine;
            const group = revealGroups[index];
            if (group[0].classList.contains('is-in') !== visible) group.forEach((element) => element.classList.toggle('is-in', visible));
        });

        if (!reduced) {
            frameBoxes.forEach((box) => {
                const screenTop = box.top - offset;
                if (screenTop > viewHeight || screenTop + box.height < 0) return;
                const progress = clamp((screenTop + box.height / 2 - viewHeight / 2) / (viewHeight / 2 + box.height / 2), -1, 1);
                box.img.style.transform = `translate3d(0, ${(progress * box.height * .08).toFixed(2)}px, 0)`;
            });
        }

        const probe = current + viewHeight * .4;
        const lapIndex = Math.floor(probe / copyHeight);
        const lapText = lapIndex >= 0 ? `Lap ${lapIndex + 1}` : `Lap ${1 - lapIndex} ↺`;
        if (lapText !== lastLap) {
            lastLap = lapText;
            lapLabel.textContent = lapText;
        }

        const probeInLap = wrap(probe, copyHeight);
        let sectionIndex = 0;
        sectionTops.forEach((top, index) => { if (top <= probeInLap) sectionIndex = index; });
        if (sectionIndex !== lastSection) {
            lastSection = sectionIndex;
            const name = `${String(sectionIndex + 1).padStart(2, '0')} ${sections[sectionIndex].dataset.label}`;
            sectionLabel.textContent = name;
            root.style.setProperty('--accent', sections[sectionIndex].style.getPropertyValue('--accent'));
            window.clearTimeout(announceTimer);
            announceTimer = window.setTimeout(() => { announcer.textContent = `${lapText}, section ${name}`; }, 700);
        }
    }

    function frame() {
        const ease = reduced ? 1 : mobile ? .16 : .1;
        const previous = current;
        const distance = target - current;
        current = Math.abs(distance) < .1 ? target : current + distance * ease;
        velocity = current - previous;
        if (Math.abs(velocity) > .5) scrollDirection = velocity > 0 ? 1 : -1;
        render();
        updateMarquees(velocity);

        if (current === target && !touchActive) {
            animationId = undefined;
            velocity = 0;
            render();
            updateMarquees(0);
            return;
        }
        animationId = window.requestAnimationFrame(frame);
    }

    function start() {
        if (!animationId) animationId = window.requestAnimationFrame(frame);
    }

    function scrollBy(amount) {
        target += amount;
        start();
    }

    // Nearest position (to the current one) that shows the given copy-space y at the top.
    function nearestPosition(copyY) {
        const base = current - wrap(current, copyHeight);
        return [base - copyHeight, base, base + copyHeight]
            .map((lapStart) => lapStart + copyY)
            .reduce((best, candidate) => (Math.abs(candidate - current) < Math.abs(best - current) ? candidate : best));
    }

    window.addEventListener('wheel', (event) => {
        if (event.target.closest('.views')) return;
        event.preventDefault();
        const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? viewHeight : 1;
        const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
        scrollBy(delta * unit);
    }, { passive: false });

    viewport.addEventListener('touchstart', (event) => {
        touchActive = true;
        touchLastY = event.touches[0].clientY;
        touchLastTime = performance.now();
        touchVelocity = 0;
        target = current;
        start();
    }, { passive: true });

    viewport.addEventListener('touchmove', (event) => {
        const y = event.touches[0].clientY;
        const now = performance.now();
        const delta = touchLastY - y;
        const elapsed = Math.max(now - touchLastTime, 1);
        touchVelocity = touchVelocity * .3 + (delta / elapsed) * .7;
        touchLastY = y;
        touchLastTime = now;
        target += delta;
        if (reduced) current = target;
    }, { passive: true });

    viewport.addEventListener('touchend', () => {
        touchActive = false;
        const recent = performance.now() - touchLastTime < 80;
        if (!reduced && recent) target += clamp(touchVelocity * 320, -2600, 2600);
        start();
    }, { passive: true });
    viewport.addEventListener('touchcancel', () => { touchActive = false; start(); }, { passive: true });

    window.addEventListener('keydown', (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const onControl = Boolean(event.target.closest('button, summary, input, textarea, select'));
        const page = viewHeight * .85;
        const actions = {
            ArrowDown: 120,
            ArrowUp: -120,
            PageDown: page,
            PageUp: -page,
            ' ': onControl ? null : (event.shiftKey ? -page : page)
        };
        if (event.key in actions && actions[event.key] !== null) {
            event.preventDefault();
            scrollBy(actions[event.key]);
        } else if (event.key === 'Home' && !onControl) {
            event.preventDefault();
            target = nearestPosition(0);
            start();
        } else if (event.key === 'End' && !onControl) {
            event.preventDefault();
            target = nearestPosition(sectionTops[sectionTops.length - 1]);
            start();
        }
    });

    // Tabbing into content that is off-screen: glide to it instead of letting the
    // browser scroll the hidden-overflow viewport.
    viewport.addEventListener('scroll', () => { viewport.scrollTop = 0; viewport.scrollLeft = 0; });
    original.addEventListener('focusin', (event) => {
        const rect = event.target.getBoundingClientRect();
        if (rect.top > 80 && rect.bottom < viewHeight - 80) return;
        // The focused element lives in the original (middle) copy, which starts at track y = copyHeight.
        const copyY = rect.top + wrap(current, copyHeight);
        target = nearestPosition(copyY - viewHeight * .35);
        start();
    });

    skipLink.addEventListener('click', (event) => {
        event.preventDefault();
        target = nearestPosition(0);
        start();
        document.getElementById('loop-hello').focus({ preventScroll: true });
    });

    function updateModes() {
        reduced = reduceMotionQuery.matches;
        mobile = mobileQuery.matches;
        buildMarquees();
        render();
    }

    reduceMotionQuery.addEventListener('change', updateModes);
    mobileQuery.addEventListener('change', updateModes);
    window.addEventListener('resize', scheduleMeasure, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(scheduleMeasure).observe(original);
    original.querySelectorAll('img').forEach((image) => image.addEventListener('load', scheduleMeasure));
    document.addEventListener('visibilitychange', () => {
        marqueeAnimations.forEach((animation) => (document.hidden ? animation.pause() : animation.play()));
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { buildMarquees(); scheduleMeasure(); });

    buildMarquees();
    measure();
})();
