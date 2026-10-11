(() => {
    const scenes = [...document.querySelectorAll('.scene')];
    const dotsContainer = document.getElementById('scene-dots');
    const currentCount = document.getElementById('current-count');
    const sceneName = document.getElementById('scene-name');
    const root = document.documentElement;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let current = 0;
    let locked = false;
    let touchStartY = 0;
    let touchStartX = 0;
    let transitionTimer;

    scenes.forEach((scene, index) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = `scene-dot${index === 0 ? ' is-active' : ''}`;
        dot.dataset.label = scene.dataset.label;
        dot.setAttribute('aria-label', `Go to ${scene.dataset.label} scene`);
        dot.addEventListener('click', () => goTo(index, index > current ? 1 : -1));
        dotsContainer.append(dot);
    });

    const dots = [...document.querySelectorAll('.scene-dot')];

    function playTransition(direction) {
        if (reduceMotion) return;
        window.clearTimeout(transitionTimer);
        document.body.classList.remove('is-transitioning');
        document.body.dataset.direction = direction > 0 ? 'forward' : 'backward';
        document.body.offsetWidth;
        document.body.classList.add('is-transitioning');
        transitionTimer = window.setTimeout(() => document.body.classList.remove('is-transitioning'), 1100);
    }

    function setAccent(value) {
        root.style.setProperty('--accent', value);
        setCanvasAccent(value);
    }

    function goTo(nextIndex, direction = 1) {
        if (locked || nextIndex === current) return;
        locked = true;
        playTransition(direction);

        const previous = scenes[current];
        const next = scenes[(nextIndex + scenes.length) % scenes.length];
        const normalizedIndex = scenes.indexOf(next);

        previous.classList.remove('is-active', 'is-entering-up', 'is-leaving-up', 'is-leaving-down');
        previous.classList.add(direction > 0 ? 'is-leaving-up' : 'is-leaving-down');
        previous.setAttribute('aria-hidden', 'true');

        next.classList.remove('is-leaving-up', 'is-leaving-down');
        if (direction < 0) next.classList.add('is-entering-up');
        next.scrollTop = 0;
        next.getBoundingClientRect();
        next.classList.add('is-active');
        next.classList.remove('is-entering-up');
        next.setAttribute('aria-hidden', 'false');

        current = normalizedIndex;
        dots.forEach((dot, index) => dot.classList.toggle('is-active', index === current));
        currentCount.textContent = String(current + 1).padStart(2, '0');
        sceneName.textContent = next.dataset.label;
        setAccent(next.dataset.accent);
        history.replaceState(null, '', `#scene-${current + 1}`);

        window.setTimeout(() => {
            previous.classList.remove('is-leaving-up', 'is-leaving-down');
            locked = false;
        }, reduceMotion ? 30 : 1080);
    }

    function step(direction) {
        goTo(current + direction, direction);
    }

    window.addEventListener('wheel', (event) => {
        if (Math.abs(event.deltaY) < 22 || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
        const activeScene = scenes[current];
        const canScrollInside = activeScene.scrollHeight > activeScene.clientHeight + 2;
        const movingDownInside = event.deltaY > 0 && activeScene.scrollTop + activeScene.clientHeight < activeScene.scrollHeight - 2;
        const movingUpInside = event.deltaY < 0 && activeScene.scrollTop > 2;
        if (canScrollInside && (movingDownInside || movingUpInside)) return;
        event.preventDefault();
        step(event.deltaY > 0 ? 1 : -1);
    }, { passive: false });

    window.addEventListener('touchstart', (event) => {
        touchStartY = event.changedTouches[0].clientY;
        touchStartX = event.changedTouches[0].clientX;
    }, { passive: true });

    window.addEventListener('touchend', (event) => {
        const distanceY = touchStartY - event.changedTouches[0].clientY;
        const distanceX = touchStartX - event.changedTouches[0].clientX;
        const activeScene = scenes[current];
        const canScrollInside = activeScene.scrollHeight > activeScene.clientHeight + 2;
        const movingDownInside = distanceY > 0 && activeScene.scrollTop + activeScene.clientHeight < activeScene.scrollHeight - 2;
        const movingUpInside = distanceY < 0 && activeScene.scrollTop > 2;
        if (canScrollInside && (movingDownInside || movingUpInside)) return;
        if (Math.abs(distanceY) > 45 && Math.abs(distanceY) > Math.abs(distanceX)) step(distanceY > 0 ? 1 : -1);
    }, { passive: true });

    window.addEventListener('keydown', (event) => {
        if (['ArrowDown', 'PageDown', ' '].includes(event.key)) {
            event.preventDefault();
            step(1);
        }
        if (['ArrowUp', 'PageUp'].includes(event.key)) {
            event.preventDefault();
            step(-1);
        }
        if (event.key === 'Home') goTo(0, -1);
        if (event.key === 'End') goTo(scenes.length - 1, 1);
    });

    document.querySelectorAll('[data-next-scene]').forEach((button) => button.addEventListener('click', () => step(1)));

    const canvas = document.getElementById('infinity-canvas');
    const context = canvas.getContext('2d');
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let pointerX = 0;
    let pointerY = 0;
    let targetPointerX = 0;
    let targetPointerY = 0;
    let accent = [110, 231, 255];
    let targetAccent = [...accent];
    let stars = [];

    function parseHex(hex) {
        const clean = hex.replace('#', '');
        if (clean.length !== 6) return [110, 231, 255];
        return [0, 2, 4].map((offset) => Number.parseInt(clean.slice(offset, offset + 2), 16));
    }

    function setCanvasAccent(hex) {
        targetAccent = parseHex(hex);
    }

    function resizeCanvas() {
        width = window.innerWidth;
        height = window.innerHeight;
        pixelRatio = Math.min(window.devicePixelRatio || 1, 1.6);
        canvas.width = Math.round(width * pixelRatio);
        canvas.height = Math.round(height * pixelRatio);
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        stars = Array.from({ length: Math.min(76, Math.round(width / 18)) }, (_, index) => ({
            x: ((index * 73.37) % 100) / 100 * width,
            y: ((index * 41.83 + 17) % 100) / 100 * height,
            size: .35 + (index % 4) * .22,
            alpha: .08 + (index % 7) * .018
        }));
    }

    function infinityPoint(t, scaleX, scaleY) {
        return {
            x: width * .54 + Math.sin(t) * scaleX,
            y: height * .52 + Math.sin(t) * Math.cos(t) * scaleY
        };
    }

    function drawInfinity(time = 0) {
        context.clearRect(0, 0, width, height);
        accent = accent.map((channel, index) => channel + (targetAccent[index] - channel) * .055);
        const [red, green, blue] = accent.map(Math.round);

        pointerX += (targetPointerX - pointerX) * .055;
        pointerY += (targetPointerY - pointerY) * .055;
        root.style.setProperty('--mx', `${(pointerX * 9).toFixed(2)}px`);
        root.style.setProperty('--my', `${(pointerY * 7).toFixed(2)}px`);
        root.style.setProperty('--mx-strong', `${(pointerX * 20).toFixed(2)}px`);
        root.style.setProperty('--my-strong', `${(pointerY * 15).toFixed(2)}px`);

        context.save();
        context.translate(pointerX * -8, pointerY * -6);
        stars.forEach((star, index) => {
            const shimmer = .7 + Math.sin(time * .0008 + index) * .3;
            context.fillStyle = `rgba(${red},${green},${blue},${star.alpha * shimmer})`;
            context.beginPath();
            context.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            context.fill();
        });

        const scaleX = Math.min(width * .37, 570);
        const scaleY = Math.min(width * .19, 290);
        context.globalCompositeOperation = 'lighter';

        for (let band = 0; band < 5; band += 1) {
            context.beginPath();
            for (let stepIndex = 0; stepIndex <= 280; stepIndex += 1) {
                const t = (stepIndex / 280) * Math.PI * 2;
                const point = infinityPoint(t, scaleX + band * 8, scaleY + band * 3);
                if (stepIndex === 0) context.moveTo(point.x, point.y);
                else context.lineTo(point.x, point.y);
            }
            context.setLineDash([3 + band * 2, 17 + band * 6]);
            context.lineDashOffset = -time * (.018 + band * .005);
            context.lineWidth = band === 0 ? 1.4 : .55;
            context.strokeStyle = `rgba(${red},${green},${blue},${.22 - band * .032})`;
            context.shadowColor = `rgba(${red},${green},${blue},.55)`;
            context.shadowBlur = band === 0 ? 18 : 7;
            context.stroke();
        }

        context.setLineDash([]);
        for (let index = 0; index < 30; index += 1) {
            const t = time * (.00034 + (index % 4) * .000018) + (index / 30) * Math.PI * 2;
            const point = infinityPoint(t, scaleX, scaleY);
            const pulse = .45 + Math.sin(time * .002 + index * 1.7) * .3;
            context.beginPath();
            context.fillStyle = `rgba(${red},${green},${blue},${Math.max(.12, pulse)})`;
            context.shadowBlur = 14;
            context.arc(point.x, point.y, 1 + (index % 3) * .6, 0, Math.PI * 2);
            context.fill();
        }
        context.restore();
        context.globalCompositeOperation = 'source-over';
    }

    function animationFrame(time) {
        drawInfinity(time);
        window.requestAnimationFrame(animationFrame);
    }

    window.addEventListener('resize', resizeCanvas, { passive: true });
    window.addEventListener('pointermove', (event) => {
        if (reduceMotion) return;
        targetPointerX = event.clientX / window.innerWidth - .5;
        targetPointerY = event.clientY / window.innerHeight - .5;
    }, { passive: true });
    window.addEventListener('pointerleave', () => {
        targetPointerX = 0;
        targetPointerY = 0;
    });

    resizeCanvas();
    if (reduceMotion) drawInfinity(0);
    else window.requestAnimationFrame(animationFrame);

    const hashMatch = window.location.hash.match(/^#scene-(\d+)$/);
    if (hashMatch) {
        const requested = Math.min(Math.max(Number(hashMatch[1]) - 1, 0), scenes.length - 1);
        if (requested > 0) goTo(requested, 1);
    } else if (!reduceMotion) {
        scenes[0].classList.remove('is-active');
        window.requestAnimationFrame(() => {
            scenes[0].getBoundingClientRect();
            scenes[0].classList.add('is-active');
        });
    }
})();
