(() => {
    const panels = [...document.querySelectorAll('.panel')];
    const body = document.body;
    const root = document.documentElement;
    const stepsContainer = document.getElementById('steps');
    const count = document.getElementById('count');
    const progress = document.getElementById('progress');
    const announcer = document.getElementById('announcer');
    const shutterLabel = document.getElementById('shutter-label');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    let current = 0;
    let locked = false;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartScroll = 0;
    let touchStartedOnControl = false;

    // Wrap every word of [data-split] headings so each can slide up from its own mask.
    panels.forEach((panel) => {
        panel.querySelectorAll('[data-split]').forEach((heading) => {
            let wordIndex = 0;
            const wrapWords = (node) => {
                [...node.childNodes].forEach((child) => {
                    if (child.nodeType === Node.TEXT_NODE) {
                        const fragment = document.createDocumentFragment();
                        child.textContent.split(/(\s+)/).forEach((part) => {
                            if (!part) return;
                            if (/^\s+$/.test(part)) {
                                fragment.append(part);
                                return;
                            }
                            const outer = document.createElement('span');
                            const inner = document.createElement('span');
                            outer.className = 'w';
                            inner.textContent = part;
                            inner.style.setProperty('--w', wordIndex++);
                            outer.append(inner);
                            fragment.append(outer);
                        });
                        child.replaceWith(fragment);
                    } else if (child.nodeType === Node.ELEMENT_NODE) {
                        wrapWords(child);
                    }
                });
            };
            heading.setAttribute('aria-label', heading.textContent.replace(/\s+/g, ' ').trim());
            wrapWords(heading);
            heading.querySelectorAll('.w').forEach((word) => word.setAttribute('aria-hidden', 'true'));
        });
        panel.querySelectorAll('[data-anim]').forEach((element, index) => element.style.setProperty('--d', index));
    });

    const steps = panels.map((panel, index) => {
        const step = document.createElement('button');
        step.type = 'button';
        step.className = 'rail__step';
        step.setAttribute('aria-label', `Go to ${panel.dataset.label}`);
        step.addEventListener('click', () => goTo(index));
        stepsContainer.append(step);
        return step;
    });

    function wipeDuration() {
        if (reduceMotion.matches) return 0;
        return Number.parseFloat(getComputedStyle(root).getPropertyValue('--wipe')) || 0;
    }

    function updateChrome(index) {
        const panel = panels[index];
        steps.forEach((step, stepIndex) => step.setAttribute('aria-current', stepIndex === index ? 'step' : 'false'));
        count.textContent = String(index + 1).padStart(2, '0');
        progress.style.transform = `scaleX(${(index + 1) / panels.length})`;
        root.style.setProperty('--accent', panel.dataset.accent);
        announcer.textContent = `Panel ${index + 1} of ${panels.length}: ${panel.dataset.label}`;
    }

    function enter(panel) {
        panel.classList.remove('is-in');
        panel.scrollTop = 0;
        panel.getBoundingClientRect();
        panel.classList.add('is-in');
    }

    function swap(from, to) {
        from.classList.remove('is-active', 'is-in');
        from.setAttribute('aria-hidden', 'true');
        from.setAttribute('inert', '');
        to.classList.add('is-active');
        to.removeAttribute('aria-hidden');
        to.removeAttribute('inert');
        enter(to);
    }

    function goTo(nextIndex, direction) {
        const target = (nextIndex + panels.length) % panels.length;
        if (locked || target === current) return;
        const dir = direction ?? (target > current ? 1 : -1);
        const from = panels[current];
        const to = panels[target];
        const duration = wipeDuration();

        current = target;
        history.replaceState(null, '', `#panel-${current + 1}`);

        if (!duration) {
            swap(from, to);
            updateChrome(current);
            return;
        }

        locked = true;
        root.style.setProperty('--next-accent', to.dataset.accent);
        shutterLabel.textContent = to.dataset.label;
        body.dataset.direction = dir > 0 ? 'forward' : 'back';
        body.classList.remove('is-wiping');
        body.offsetWidth;
        body.classList.add('is-wiping');

        // Swap while the shutters fully cover the screen.
        window.setTimeout(() => {
            swap(from, to);
            updateChrome(current);
        }, duration * .5);

        window.setTimeout(() => {
            body.classList.remove('is-wiping');
            locked = false;
        }, duration + 280);
    }

    const step = (direction) => goTo(current + direction, direction);

    function canScroll(panel, direction) {
        if (panel.scrollHeight <= panel.clientHeight + 2) return false;
        return direction > 0
            ? panel.scrollTop + panel.clientHeight < panel.scrollHeight - 2
            : panel.scrollTop > 2;
    }

    window.addEventListener('wheel', (event) => {
        const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
        if (Math.abs(delta) < 20) return;
        const direction = delta > 0 ? 1 : -1;
        if (event.deltaY && canScroll(panels[current], direction)) return;
        event.preventDefault();
        step(direction);
    }, { passive: false });

    window.addEventListener('touchstart', (event) => {
        const touch = event.changedTouches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchStartScroll = panels[current].scrollTop;
        touchStartedOnControl = Boolean(event.target.closest('a, button'));
    }, { passive: true });

    window.addEventListener('touchend', (event) => {
        if (touchStartedOnControl) return;
        const touch = event.changedTouches[0];
        const dx = touchStartX - touch.clientX;
        const dy = touchStartY - touch.clientY;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) {
            step(dx > 0 ? 1 : -1);
            return;
        }
        const panel = panels[current];
        if (Math.abs(dy) < 50 || Math.abs(panel.scrollTop - touchStartScroll) > 4) return;
        const direction = dy > 0 ? 1 : -1;
        if (!canScroll(panel, direction)) step(direction);
    }, { passive: true });

    window.addEventListener('keydown', (event) => {
        const onControl = Boolean(event.target.closest('a, button'));
        if (['ArrowRight', 'PageDown'].includes(event.key) || (event.key === ' ' && !onControl) || (event.key === 'ArrowDown' && !canScroll(panels[current], 1))) {
            event.preventDefault();
            step(1);
        } else if (['ArrowLeft', 'PageUp'].includes(event.key) || (event.key === 'ArrowUp' && !canScroll(panels[current], -1))) {
            event.preventDefault();
            step(-1);
        } else if (event.key === 'Home' && !onControl) {
            goTo(0, -1);
        } else if (event.key === 'End' && !onControl) {
            goTo(panels.length - 1, 1);
        }
    });

    document.getElementById('prev').addEventListener('click', () => step(-1));
    document.getElementById('next').addEventListener('click', () => step(1));
    document.querySelectorAll('[data-next]').forEach((button) => button.addEventListener('click', () => step(1)));
    document.querySelectorAll('[data-restart]').forEach((button) => button.addEventListener('click', () => goTo(0, 1)));
    document.querySelector('.skip-link').addEventListener('click', (event) => {
        event.preventDefault();
        goTo(0, -1);
        panels[0].focus({ preventScroll: true });
    });

    // Initial state: honour #panel-N deep links, then play the first entrance.
    const hash = window.location.hash.match(/^#panel-(\d+)$/);
    const start = hash ? Math.min(Math.max(Number(hash[1]) - 1, 0), panels.length - 1) : 0;
    if (start !== 0) swap(panels[0], panels[start]);
    current = start;
    updateChrome(current);
    window.requestAnimationFrame(() => enter(panels[current]));
})();
