(() => {
    const board = document.getElementById('board');
    const world = document.getElementById('world');
    const original = document.getElementById('tile');
    const coords = document.getElementById('coords');
    const views = document.getElementById('views');
    const spotlight = document.querySelector('.spotlight');
    const detail = document.getElementById('detail');
    const detailBody = document.getElementById('detail-body');
    const detailClose = document.getElementById('detail-close');
    const skipLink = document.querySelector('.skip-link');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const originalCards = [...original.querySelectorAll('.card')];

    const FRICTION = .94;
    const EASE = .14;
    const DRAG_THRESHOLD = 6;
    const KEY_STEP = 180;

    let tiles = [original];
    let tileWidth = 1;
    let tileHeight = 1;
    let viewWidth = window.innerWidth;
    let viewHeight = window.innerHeight;
    let columns = 1;
    let rows = 1;

    let panX = 0;
    let panY = 0;
    let originX = 0;
    let originY = 0;
    let previousPanX = 0;
    let previousPanY = 0;
    let velocityX = 0;
    let velocityY = 0;
    let tiltX = 0;
    let tiltY = 0;
    let target = null;

    let dragging = false;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let lastMoveTime = 0;
    let moved = false;
    let suppressClick = false;

    let frameId = null;
    let lastFrameTime = 0;
    let shownX = null;
    let shownY = null;
    let returnFocusIndex = -1;

    // Always-positive modulo so negative pan offsets wrap correctly.
    const mod = (value, size) => ((value % size) + size) % size;
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    function makeCopy() {
        const copy = original.cloneNode(true);
        copy.removeAttribute('id');
        copy.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
        copy.setAttribute('aria-hidden', 'true');
        // Copies stay clickable (pointer users see them most of the time) but are
        // removed from the tab order; keyboard users move through the original tile.
        copy.querySelectorAll('a, [tabindex]').forEach((element) => element.setAttribute('tabindex', '-1'));
        copy.querySelectorAll('h1').forEach((heading) => {
            const replacement = document.createElement('p');
            replacement.className = heading.className;
            replacement.innerHTML = heading.innerHTML;
            heading.replaceWith(replacement);
        });
        return copy;
    }

    function measure() {
        viewWidth = window.innerWidth;
        viewHeight = window.innerHeight;
        tileWidth = original.offsetWidth || 1;
        tileHeight = original.offsetHeight || 1;
        // Enough slots that a tile starting up to one tile left/above the viewport still reaches its far edge.
        columns = Math.ceil(viewWidth / tileWidth) + 1;
        rows = Math.ceil(viewHeight / tileHeight) + 1;

        const needed = columns * rows;
        while (tiles.length < needed) {
            const copy = makeCopy();
            world.append(copy);
            tiles.push(copy);
        }
        while (tiles.length > needed) tiles.pop().remove();
    }

    function render() {
        // Offset of the first slot, always in [-tileSize, 0) so slots cover the viewport.
        const offsetX = mod(panX, tileWidth) - tileWidth;
        const offsetY = mod(panY, tileHeight) - tileHeight;
        // The original (focusable) tile always takes the slot under the viewport centre.
        const centreColumn = clamp(Math.floor((viewWidth / 2 - offsetX) / tileWidth), 0, columns - 1);
        const centreRow = clamp(Math.floor((viewHeight / 2 - offsetY) / tileHeight), 0, rows - 1);

        let copyIndex = 1;
        for (let row = 0; row < rows; row += 1) {
            for (let column = 0; column < columns; column += 1) {
                const tile = row === centreRow && column === centreColumn ? original : tiles[copyIndex++];
                tile.style.transform = `translate3d(${offsetX + column * tileWidth}px, ${offsetY + row * tileHeight}px, 0)`;
            }
        }

        board.style.backgroundPosition = `${panX}px ${panY}px`;

        const cameraX = Math.round(originX - panX);
        const cameraY = Math.round(originY - panY);
        if (cameraX !== shownX || cameraY !== shownY) {
            shownX = cameraX;
            shownY = cameraY;
            coords.textContent = `x ${cameraX} · y ${cameraY}`;
        }
    }

    function updateTilt(step) {
        if (reduceMotion.matches) return false;
        const movedX = (panX - previousPanX) / step;
        const movedY = (panY - previousPanY) / step;
        const goalX = clamp(movedX * .35, -9, 9);
        const goalY = clamp(-movedY * .35, -9, 9);
        tiltX += (goalX - tiltX) * .2;
        tiltY += (goalY - tiltY) * .2;
        if (Math.abs(tiltX) < .02 && Math.abs(goalX) < .02) tiltX = 0;
        if (Math.abs(tiltY) < .02 && Math.abs(goalY) < .02) tiltY = 0;
        world.style.setProperty('--rx', `${tiltX.toFixed(2)}deg`);
        world.style.setProperty('--ry', `${tiltY.toFixed(2)}deg`);
        return tiltX !== 0 || tiltY !== 0;
    }

    function tick(time) {
        const step = clamp((time - lastFrameTime) / 16.67 || 1, .25, 4);
        lastFrameTime = time;

        if (target) {
            const ease = 1 - Math.pow(1 - EASE, step);
            panX += (target.x - panX) * ease;
            panY += (target.y - panY) * ease;
            if (Math.abs(target.x - panX) < .5 && Math.abs(target.y - panY) < .5) {
                panX = target.x;
                panY = target.y;
                const done = target.done;
                target = null;
                if (done) done();
            }
        } else if (dragging) {
            // Let the release velocity fade if the finger rests before lifting.
            if (performance.now() - lastMoveTime > 60) {
                velocityX *= .8;
                velocityY *= .8;
            }
        } else if (velocityX || velocityY) {
            panX += velocityX * step;
            panY += velocityY * step;
            const friction = Math.pow(FRICTION, step);
            velocityX *= friction;
            velocityY *= friction;
            if (Math.hypot(velocityX, velocityY) < .05) {
                velocityX = 0;
                velocityY = 0;
            }
        }

        render();
        const tilting = updateTilt(step);
        previousPanX = panX;
        previousPanY = panY;

        if (dragging || target || velocityX || velocityY || tilting) {
            frameId = window.requestAnimationFrame(tick);
        } else {
            frameId = null;
        }
    }

    function kick() {
        if (frameId) return;
        lastFrameTime = performance.now();
        frameId = window.requestAnimationFrame(tick);
    }

    function panTo(x, y, done) {
        velocityX = 0;
        velocityY = 0;
        if (reduceMotion.matches) {
            panX = x;
            panY = y;
            target = null;
            render();
            if (done) done();
            return;
        }
        target = { x, y, done };
        kick();
    }

    function centreOn(element, done) {
        const rect = element.getBoundingClientRect();
        panTo(
            panX + viewWidth / 2 - (rect.left + rect.width / 2),
            panY + viewHeight / 2 - (rect.top + rect.height / 2),
            done
        );
    }

    // ---------- Detail overlay ----------
    function openDetail(card) {
        const tile = card.closest('.tile');
        returnFocusIndex = [...tile.querySelectorAll('.card')].indexOf(card);

        const clone = card.cloneNode(true);
        clone.removeAttribute('tabindex');
        clone.removeAttribute('aria-hidden');
        clone.querySelectorAll('[hidden]').forEach((element) => element.removeAttribute('hidden'));
        clone.querySelectorAll('[tabindex]').forEach((element) => element.removeAttribute('tabindex'));
        clone.querySelectorAll('img').forEach((image) => image.removeAttribute('loading'));
        clone.querySelectorAll('h1').forEach((heading) => {
            const replacement = document.createElement('h2');
            replacement.className = heading.className;
            replacement.innerHTML = heading.innerHTML;
            heading.replaceWith(replacement);
        });
        detailBody.replaceChildren(clone);
        detail.setAttribute('aria-label', card.dataset.title || 'Details');
        detail.showModal();
        detailClose.focus();
    }

    function openCard(card) {
        views.open = false;
        centreOn(card, () => openDetail(card));
    }

    detailClose.addEventListener('click', () => detail.close());
    detail.addEventListener('click', (event) => {
        if (event.target === detail) detail.close();
    });
    detail.addEventListener('close', () => {
        // After centring, the card under the viewport centre lives in the original tile.
        const card = originalCards[returnFocusIndex];
        if (card) card.focus({ preventScroll: true });
    });

    // ---------- Pointer dragging ----------
    board.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || dragging) return;
        views.open = false;
        dragging = true;
        moved = false;
        suppressClick = false;
        pointerId = event.pointerId;
        startX = lastX = event.clientX;
        startY = lastY = event.clientY;
        lastMoveTime = performance.now();
        target = null;
        velocityX = 0;
        velocityY = 0;
        kick();
    });

    board.addEventListener('pointermove', (event) => {
        if (spotlight && event.pointerType === 'mouse') {
            spotlight.style.setProperty('--sx', `${event.clientX}px`);
            spotlight.style.setProperty('--sy', `${event.clientY}px`);
        }
        if (!dragging || event.pointerId !== pointerId) return;

        const deltaX = event.clientX - lastX;
        const deltaY = event.clientY - lastY;
        const now = performance.now();

        if (!moved && Math.hypot(event.clientX - startX, event.clientY - startY) > DRAG_THRESHOLD) {
            moved = true;
            // Capture only once it is a real drag, so plain clicks still reach links and cards.
            board.setPointerCapture(pointerId);
            board.classList.add('is-dragging');
        }

        panX += deltaX;
        panY += deltaY;
        const elapsed = Math.max(1, now - lastMoveTime);
        velocityX = velocityX * .6 + (deltaX / elapsed) * 16.67 * .4;
        velocityY = velocityY * .6 + (deltaY / elapsed) * 16.67 * .4;
        lastX = event.clientX;
        lastY = event.clientY;
        lastMoveTime = now;
        kick();
    });

    function endDrag(event) {
        if (!dragging || event.pointerId !== pointerId) return;
        dragging = false;
        suppressClick = moved;
        board.classList.remove('is-dragging');
        if (board.hasPointerCapture(pointerId)) board.releasePointerCapture(pointerId);
        pointerId = null;
        if (reduceMotion.matches || performance.now() - lastMoveTime > 80) {
            velocityX = 0;
            velocityY = 0;
        }
        kick();
    }

    board.addEventListener('pointerup', endDrag);
    board.addEventListener('pointercancel', endDrag);

    // A drag must never turn into a link visit or a card opening.
    board.addEventListener('click', (event) => {
        if (!suppressClick) return;
        suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
    }, true);

    board.addEventListener('click', (event) => {
        if (event.target.closest('a')) return;
        const card = event.target.closest('.card');
        if (card) openCard(card);
    });

    board.addEventListener('dragstart', (event) => event.preventDefault());

    // ---------- Wheel + keyboard ----------
    board.addEventListener('wheel', (event) => {
        event.preventDefault();
        if (event.ctrlKey) return;
        const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewHeight : 1;
        let deltaX = event.deltaX * scale;
        let deltaY = event.deltaY * scale;
        if (event.shiftKey && !deltaX) {
            deltaX = deltaY;
            deltaY = 0;
        }
        target = null;
        velocityX = 0;
        velocityY = 0;
        panX -= deltaX;
        panY -= deltaY;
        kick();
    }, { passive: false });

    window.addEventListener('keydown', (event) => {
        if (detail.open) return;
        if (event.key === 'Escape') {
            views.open = false;
            return;
        }
        const card = event.target.closest && event.target.closest('.card');
        if (card && (event.key === 'Enter' || event.key === ' ') && event.target === card) {
            event.preventDefault();
            openCard(card);
            return;
        }
        const moves = { ArrowLeft: [KEY_STEP, 0], ArrowRight: [-KEY_STEP, 0], ArrowUp: [0, KEY_STEP], ArrowDown: [0, -KEY_STEP] };
        const move = moves[event.key];
        if (!move || event.target.closest('.views')) return;
        event.preventDefault();
        const baseX = target ? target.x : panX;
        const baseY = target ? target.y : panY;
        panTo(baseX + move[0], baseY + move[1]);
    });

    // Bring keyboard-focused cards into view.
    board.addEventListener('focusin', (event) => {
        board.scrollLeft = 0;
        board.scrollTop = 0;
        const card = event.target.closest('.card');
        if (!card || dragging) return;
        const rect = card.getBoundingClientRect();
        const margin = 24;
        const visible = rect.left >= margin && rect.top >= margin && rect.right <= viewWidth - margin && rect.bottom <= viewHeight - margin;
        if (!visible) centreOn(card);
    });
    board.addEventListener('scroll', () => {
        board.scrollLeft = 0;
        board.scrollTop = 0;
    });

    skipLink.addEventListener('click', (event) => {
        event.preventDefault();
        originalCards[0].focus({ preventScroll: true });
    });

    document.addEventListener('click', (event) => {
        if (views.open && !views.contains(event.target)) views.open = false;
    });

    // ---------- Sizing ----------
    let resizeTimer;
    function handleResize() {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
            measure();
            render();
        }, 100);
    }
    window.addEventListener('resize', handleResize, { passive: true });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', handleResize, { passive: true });

    measure();
    // Start with the intro card centred, and call that spot x 0 · y 0.
    const intro = originalCards[0];
    panX = viewWidth / 2 - (intro.offsetLeft + intro.offsetWidth / 2);
    panY = viewHeight / 2 - (intro.offsetTop + intro.offsetHeight / 2);
    originX = panX;
    originY = panY;
    previousPanX = panX;
    previousPanY = panY;
    render();
})();
