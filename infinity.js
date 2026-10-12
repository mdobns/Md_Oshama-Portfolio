(() => {
    const scenes = [...document.querySelectorAll('.scene')];
    const dotsContainer = document.getElementById('scene-dots');
    const currentCount = document.getElementById('current-count');
    const sceneName = document.getElementById('scene-name');
    const announcer = document.getElementById('scene-announcer');
    const skipLink = document.querySelector('.skip-link');
    const canvas = document.getElementById('infinity-canvas');
    const context = canvas.getContext('2d');
    const root = document.documentElement;
    const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobileQuery = window.matchMedia('(max-width: 767px), (pointer: coarse)');
    const styleCache = new Map();

    const profiles = {
        desktop: { fps: 60, pixelRatio: 1.6, bands: 5, segments: 280, particles: 30, maxStars: 76, shadows: true, blend: true, parallax: true, transition: 1080 },
        mobile: { fps: 30, pixelRatio: 1, bands: 2, segments: 110, particles: 12, maxStars: 32, shadows: false, blend: false, parallax: false, transition: 580 },
        reduced: { fps: 0, pixelRatio: 1, bands: 1, segments: 90, particles: 0, maxStars: 20, shadows: false, blend: false, parallax: false, transition: 30 }
    };

    let current = 0;
    let locked = false;
    let touchStartY = 0;
    let touchStartX = 0;
    let touchStartScroll = 0;
    let touchStartedOnControl = false;
    let transitionTimer;
    let resizeTimer;
    let animationId;
    let lastFrameTime = 0;
    let profileName = 'desktop';
    let profile = profiles.desktop;
    let width = 0;
    let height = 0;
    let pointerX = 0;
    let pointerY = 0;
    let targetPointerX = 0;
    let targetPointerY = 0;
    let accent = [110, 231, 255];
    let targetAccent = [...accent];
    let stars = [];

    function isConstrainedDevice() {
        const lowMemory = typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 4;
        const lowCoreCount = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4;
        return mobileQuery.matches || lowMemory || lowCoreCount;
    }

    function updateStyleProperty(name, value) {
        if (styleCache.get(name) === value) return;
        styleCache.set(name, value);
        root.style.setProperty(name, value);
    }

    function selectProfile() {
        profileName = reduceMotionQuery.matches ? 'reduced' : isConstrainedDevice() ? 'mobile' : 'desktop';
        profile = profiles[profileName];
        root.dataset.performance = profileName;

        if (!profile.parallax) {
            pointerX = 0;
            pointerY = 0;
            targetPointerX = 0;
            targetPointerY = 0;
            updateStyleProperty('--mx', '0px');
            updateStyleProperty('--my', '0px');
            updateStyleProperty('--mx-strong', '0px');
            updateStyleProperty('--my-strong', '0px');
            updateStyleProperty('--origin-x', '50%');
            updateStyleProperty('--origin-y', '50%');
        }

        resizeCanvas();
        restartAnimation();
    }

    scenes.forEach((scene, index) => {
        const inactive = index !== current;
        scene.toggleAttribute('inert', inactive);
        scene.setAttribute('aria-hidden', String(inactive));

        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = `scene-dot${index === 0 ? ' is-active' : ''}`;
        dot.dataset.label = scene.dataset.label;
        dot.setAttribute('aria-label', `Go to ${scene.dataset.label} scene`);
        dot.setAttribute('aria-current', index === 0 ? 'step' : 'false');
        dot.addEventListener('click', () => goTo(index, index > current ? 1 : -1));
        dotsContainer.append(dot);
    });

    const dots = [...document.querySelectorAll('.scene-dot')];

    function playTransition(direction) {
        if (profileName === 'reduced') return;
        window.clearTimeout(transitionTimer);
        document.body.classList.remove('is-transitioning');
        document.body.dataset.direction = direction > 0 ? 'forward' : 'backward';
        document.body.offsetWidth;
        document.body.classList.add('is-transitioning');
        transitionTimer = window.setTimeout(() => document.body.classList.remove('is-transitioning'), profile.transition + 30);
    }

    function parseHex(hex) {
        const clean = hex.replace('#', '');
        if (clean.length !== 6) return [110, 231, 255];
        return [0, 2, 4].map((offset) => Number.parseInt(clean.slice(offset, offset + 2), 16));
    }

    function setAccent(value) {
        updateStyleProperty('--accent', value);
        targetAccent = parseHex(value);
    }

    function updateSceneState(nextIndex) {
        dots.forEach((dot, index) => {
            const active = index === nextIndex;
            dot.classList.toggle('is-active', active);
            dot.setAttribute('aria-current', active ? 'step' : 'false');
        });
        currentCount.textContent = String(nextIndex + 1).padStart(2, '0');
        sceneName.textContent = scenes[nextIndex].dataset.label;
        announcer.textContent = `Scene ${nextIndex + 1} of ${scenes.length}: ${scenes[nextIndex].dataset.label}`;
    }

    function goTo(nextIndex, direction = 1) {
        const normalizedIndex = (nextIndex + scenes.length) % scenes.length;
        if (locked || normalizedIndex === current) return;
        locked = true;
        playTransition(direction);

        const previous = scenes[current];
        const next = scenes[normalizedIndex];

        previous.classList.remove('is-active', 'is-entering-up', 'is-leaving-up', 'is-leaving-down');
        previous.classList.add(direction > 0 ? 'is-leaving-up' : 'is-leaving-down');
        previous.setAttribute('aria-hidden', 'true');
        previous.setAttribute('inert', '');

        next.classList.remove('is-leaving-up', 'is-leaving-down');
        if (direction < 0) next.classList.add('is-entering-up');
        next.scrollTop = 0;
        next.removeAttribute('inert');
        next.getBoundingClientRect();
        next.classList.add('is-active');
        next.classList.remove('is-entering-up');
        next.setAttribute('aria-hidden', 'false');

        current = normalizedIndex;
        updateSceneState(current);
        setAccent(next.dataset.accent);
        history.replaceState(null, '', `#scene-${current + 1}`);

        window.setTimeout(() => {
            previous.classList.remove('is-leaving-up', 'is-leaving-down');
            locked = false;
        }, profile.transition);
    }

    function step(direction) {
        goTo(current + direction, direction);
    }

    function sceneCanScroll(scene, direction) {
        if (scene.scrollHeight <= scene.clientHeight + 2) return false;
        if (direction > 0) return scene.scrollTop + scene.clientHeight < scene.scrollHeight - 2;
        return scene.scrollTop > 2;
    }

    window.addEventListener('wheel', (event) => {
        if (Math.abs(event.deltaY) < 22 || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
        const direction = event.deltaY > 0 ? 1 : -1;
        if (sceneCanScroll(scenes[current], direction)) {
            event.preventDefault();
            scenes[current].scrollBy({ top: event.deltaY, behavior: 'auto' });
            return;
        }
        event.preventDefault();
        step(direction);
    }, { passive: false });

    window.addEventListener('touchstart', (event) => {
        const touch = event.changedTouches[0];
        touchStartY = touch.clientY;
        touchStartX = touch.clientX;
        touchStartScroll = scenes[current].scrollTop;
        touchStartedOnControl = Boolean(event.target.closest('a, button, input, textarea, select'));
    }, { passive: true });

    window.addEventListener('touchend', (event) => {
        if (touchStartedOnControl) return;
        const touch = event.changedTouches[0];
        const distanceY = touchStartY - touch.clientY;
        const distanceX = touchStartX - touch.clientX;
        const activeScene = scenes[current];
        const sceneWasScrolled = Math.abs(activeScene.scrollTop - touchStartScroll) > 4;
        if (sceneWasScrolled || Math.abs(distanceY) <= 45 || Math.abs(distanceY) <= Math.abs(distanceX)) return;
        const direction = distanceY > 0 ? 1 : -1;
        if (!sceneCanScroll(activeScene, direction)) step(direction);
    }, { passive: true });

    window.addEventListener('keydown', (event) => {
        const targetIsControl = Boolean(event.target.closest('a, button, input, textarea, select'));
        if (targetIsControl && event.key === ' ') return;
        if (['ArrowDown', 'PageDown', ' '].includes(event.key)) {
            if (sceneCanScroll(scenes[current], 1)) {
                event.preventDefault();
                scenes[current].scrollBy({ top: event.key === 'ArrowDown' ? 48 : scenes[current].clientHeight * .8, behavior: 'smooth' });
                return;
            }
            event.preventDefault();
            step(1);
        }
        if (['ArrowUp', 'PageUp'].includes(event.key)) {
            if (sceneCanScroll(scenes[current], -1)) {
                event.preventDefault();
                scenes[current].scrollBy({ top: event.key === 'ArrowUp' ? -48 : -scenes[current].clientHeight * .8, behavior: 'smooth' });
                return;
            }
            event.preventDefault();
            step(-1);
        }
        if (event.key === 'Home' && !targetIsControl) goTo(0, -1);
        if (event.key === 'End' && !targetIsControl) goTo(scenes.length - 1, 1);
    });

    document.querySelectorAll('[data-next-scene]').forEach((button) => button.addEventListener('click', () => step(1)));
    skipLink.addEventListener('click', (event) => {
        if (current === 0) return;
        event.preventDefault();
        goTo(0, -1);
    });

    function resizeCanvas() {
        if (!context) return;
        width = window.innerWidth;
        height = window.innerHeight;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, profile.pixelRatio);
        canvas.width = Math.round(width * pixelRatio);
        canvas.height = Math.round(height * pixelRatio);
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        const starCount = Math.min(profile.maxStars, Math.round(width / 18));
        stars = Array.from({ length: starCount }, (_, index) => ({
            x: ((index * 73.37) % 100) / 100 * width,
            y: ((index * 41.83 + 17) % 100) / 100 * height,
            size: .35 + (index % 4) * .22,
            alpha: .08 + (index % 7) * .018
        }));
        drawInfinity(lastFrameTime);
    }

    function infinityPoint(t, scaleX, scaleY) {
        return {
            x: width * .54 + Math.sin(t) * scaleX,
            y: height * .52 + Math.sin(t) * Math.cos(t) * scaleY
        };
    }

    function updateParallax() {
        if (!profile.parallax) return;
        pointerX += (targetPointerX - pointerX) * .055;
        pointerY += (targetPointerY - pointerY) * .055;
        updateStyleProperty('--mx', `${(pointerX * 9).toFixed(2)}px`);
        updateStyleProperty('--my', `${(pointerY * 7).toFixed(2)}px`);
        updateStyleProperty('--mx-strong', `${(pointerX * 20).toFixed(2)}px`);
        updateStyleProperty('--my-strong', `${(pointerY * 15).toFixed(2)}px`);
        updateStyleProperty('--origin-x', `${(50 + pointerX * 100).toFixed(2)}%`);
        updateStyleProperty('--origin-y', `${(50 + pointerY * 100).toFixed(2)}%`);
    }

    function drawInfinity(time = 0) {
        if (!context || !width || !height) return;
        context.clearRect(0, 0, width, height);
        accent = accent.map((channel, index) => channel + (targetAccent[index] - channel) * .055);
        const [red, green, blue] = accent.map(Math.round);
        updateParallax();

        context.save();
        if (profile.parallax) context.translate(pointerX * -8, pointerY * -6);
        stars.forEach((star, index) => {
            const shimmer = profileName === 'reduced' ? 1 : .7 + Math.sin(time * .0008 + index) * .3;
            context.fillStyle = `rgba(${red},${green},${blue},${star.alpha * shimmer})`;
            context.beginPath();
            context.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            context.fill();
        });

        const scaleX = Math.min(width * .37, 570);
        const scaleY = Math.min(width * .19, 290);
        if (profile.blend) context.globalCompositeOperation = 'lighter';

        for (let band = 0; band < profile.bands; band += 1) {
            context.beginPath();
            for (let stepIndex = 0; stepIndex <= profile.segments; stepIndex += 1) {
                const t = (stepIndex / profile.segments) * Math.PI * 2;
                const point = infinityPoint(t, scaleX + band * 8, scaleY + band * 3);
                if (stepIndex === 0) context.moveTo(point.x, point.y);
                else context.lineTo(point.x, point.y);
            }
            context.setLineDash([3 + band * 2, 17 + band * 6]);
            context.lineDashOffset = profileName === 'reduced' ? 0 : -time * (.018 + band * .005);
            context.lineWidth = band === 0 ? 1.4 : .55;
            context.strokeStyle = `rgba(${red},${green},${blue},${.22 - band * .032})`;
            if (profile.shadows) {
                context.shadowColor = `rgba(${red},${green},${blue},.55)`;
                context.shadowBlur = band === 0 ? 18 : 7;
            } else {
                context.shadowBlur = 0;
            }
            context.stroke();
        }

        context.setLineDash([]);
        context.shadowBlur = profile.shadows ? 14 : 0;
        for (let index = 0; index < profile.particles; index += 1) {
            const t = time * (.00034 + (index % 4) * .000018) + (index / profile.particles) * Math.PI * 2;
            const point = infinityPoint(t, scaleX, scaleY);
            const pulse = .45 + Math.sin(time * .002 + index * 1.7) * .3;
            context.beginPath();
            context.fillStyle = `rgba(${red},${green},${blue},${Math.max(.12, pulse)})`;
            context.arc(point.x, point.y, 1 + (index % 3) * .6, 0, Math.PI * 2);
            context.fill();
        }
        context.restore();
        context.globalCompositeOperation = 'source-over';
    }

    function animationFrame(time) {
        animationId = window.requestAnimationFrame(animationFrame);
        const minimumInterval = 1000 / profile.fps;
        if (time - lastFrameTime < minimumInterval) return;
        lastFrameTime = time - ((time - lastFrameTime) % minimumInterval);
        drawInfinity(time);
    }

    function stopAnimation() {
        if (!animationId) return;
        window.cancelAnimationFrame(animationId);
        animationId = undefined;
    }

    function restartAnimation() {
        stopAnimation();
        lastFrameTime = 0;
        if (profileName === 'reduced' || document.hidden) {
            drawInfinity(0);
            return;
        }
        animationId = window.requestAnimationFrame(animationFrame);
    }

    function scheduleResize() {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(resizeCanvas, 120);
    }

    window.addEventListener('resize', scheduleResize, { passive: true });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', scheduleResize, { passive: true });
    window.addEventListener('pointermove', (event) => {
        if (!profile.parallax) return;
        targetPointerX = event.clientX / window.innerWidth - .5;
        targetPointerY = event.clientY / window.innerHeight - .5;
    }, { passive: true });
    window.addEventListener('pointerleave', () => {
        targetPointerX = 0;
        targetPointerY = 0;
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopAnimation();
        else restartAnimation();
    });
    reduceMotionQuery.addEventListener('change', selectProfile);
    mobileQuery.addEventListener('change', selectProfile);

    selectProfile();

    const hashMatch = window.location.hash.match(/^#scene-(\d+)$/);
    if (hashMatch) {
        const requested = Math.min(Math.max(Number(hashMatch[1]) - 1, 0), scenes.length - 1);
        if (requested > 0) goTo(requested, 1);
    } else if (profileName !== 'reduced') {
        scenes[0].classList.remove('is-active');
        window.requestAnimationFrame(() => {
            scenes[0].getBoundingClientRect();
            scenes[0].classList.add('is-active');
        });
    }
})();
