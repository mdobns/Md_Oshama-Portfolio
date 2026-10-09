(() => {
    'use strict';

    const dialog = document.getElementById('dev-terminal');
    const launcher = document.getElementById('terminal-launcher');
    if (!dialog || !launcher || typeof dialog.showModal !== 'function') return;

    const input = document.getElementById('terminal-input');
    const output = document.getElementById('terminal-output');
    const screen = document.getElementById('terminal-screen');
    const history = [];
    let historyIndex = 0;
    let draft = '';
    let returnFocus = null;
    let previousOverflow = '';
    const themeKey = 'oshama-portfolio-theme';
    const themes = ['aurora', 'sunset', 'blueprint', 'rain'];

    function applyTheme(theme) {
        if (theme === 'default') {
            delete document.body.dataset.pageTheme;
        } else {
            document.body.dataset.pageTheme = theme;
        }
    }

    // Storage can be disabled in private or embedded browsing contexts.
    try {
        const savedTheme = localStorage.getItem(themeKey);
        if (themes.includes(savedTheme)) applyTheme(savedTheme);
    } catch { /* Themes still work for the current visit. */ }

    function print(text, className = '', link = null) {
        const line = document.createElement('p');
        line.className = className;
        line.textContent = text;
        if (link) {
            const anchor = document.createElement('a');
            anchor.href = link.href;
            anchor.textContent = link.label;
            if (link.download) anchor.download = '';
            line.append(document.createTextNode(' '), anchor);
        }
        output.append(line);
        // Bound memory and keep long sessions manageable on a phone.
        while (output.children.length > 60) output.firstElementChild.remove();
        screen.scrollTop = screen.scrollHeight;
    }

    function openTerminal() {
        if (dialog.open) return;
        returnFocus = document.activeElement;
        previousOverflow = document.body.style.overflow;
        dialog.showModal();
        document.body.style.overflow = 'hidden';
        if (!output.children.length) {
            print('Oshama Portfolio Shell\nType help for available commands.');
        }
        input.focus();
    }

    // This is a fixed command palette, never a shell or a JavaScript evaluator.
    function runCommand(value) {
        const raw = value.trim().slice(0, 160);
        if (!raw) return;
        history.push(raw);
        if (history.length > 30) history.shift();
        historyIndex = history.length;
        draft = '';
        input.value = '';
        print(`guest@oshama:~$ ${raw}`, 'terminal-echo');
        const command = raw.toLowerCase().replace(/\s+/g, ' ');

        // Intentionally absent from help: a discoverable Easter egg.
        if (command === 'theme' || command.startsWith('theme ')) {
            const requestedTheme = command.slice(6);
            const theme = requestedTheme === 'matrix' ? 'rain' : requestedTheme;
            if (!theme) {
                print(`Current background: ${document.body.dataset.pageTheme || 'default'}\nUsage: theme aurora | sunset | blueprint | rain | default\nRain = Matrix-style digital rain. Alias: theme matrix`);
            } else if (theme === 'default' || themes.includes(theme)) {
                applyTheme(theme);
                let saved = true;
                try {
                    if (theme === 'default') localStorage.removeItem(themeKey);
                    else localStorage.setItem(themeKey, theme);
                } catch { saved = false; }
                print(`Background: ${theme}${saved ? ' (saved)' : ' (this visit only)'}.\nPress Esc or type exit to take a look.\nRestore the original with: theme default`);
            } else {
                print('Unknown theme. Choose aurora, sunset, blueprint, rain, or default.');
            }
            input.focus();
            return;
        }

        switch (command) {
            case 'help':
                print('whoami        Meet the developer\nstack         Tools of the trade\nprojects      Explore selected work\narchitecture  View system architecture\ncv            Get the résumé\ncontact       Start a conversation\nclear         Clear this terminal\nexit          Back to the portfolio\n\nHint: try sudo coffee.');
                break;
            case 'whoami':
                print('Md. Oshama Bin Nur\nBackend & Mobile Engineer at Alora Cloud · Dhaka, Bangladesh\nBuilding scalable FastAPI backends, Flutter mobile apps, payment gateways, and AI systems.');
                break;
            case 'stack':
                print('Languages   Python / Dart / JavaScript / SQL / C\nBackend     FastAPI / Django / Flask / PostgreSQL / Redis\nMobile      Flutter / FCM / Offline Sync (SQLite, Hive)\nFinTech     Paystation / bKash / SSLCommerz / Stripe\nMessaging   WhatsApp (Evolution API) / FCM / Email\nAI & Tools  Docker / Git / RAG / MCP');
                break;
            case 'architecture':
                print('System Flow Architecture:\n[Flutter Client + Cache] <--> [FastAPI Core Engine]\n                                 ├── Paystation / bKash / Stripe\n                                 ├── WhatsApp (Evolution API)\n                                 ├── FCM Push Notifications\n                                 └── Email Fallback Queue');
                break;
            case 'projects':
                print('Paystation & Omnichannel Sync Engine — Flutter, Paystation, WhatsApp API, FCM.');
                print('ShopSense — commerce, Django, Vue.js, and RAG.', '', { label: 'Source ↗', href: 'https://github.com/mdobns/ecommerce-webapp-django-vue3' });
                print('Phone Scraper + RAG API — FastAPI and PostgreSQL.', '', { label: 'Source ↗', href: 'https://github.com/mdobns/gtr-assigment' });
                print('See the project cards for more details.', '', { label: 'Explore projects →', href: '#projects' });
                break;
            case 'cv':
                print('Résumé ready.', '', { label: 'Download PDF ↓', href: 'Md_Oshama_Bin_Nur_Resume.pdf', download: true });
                break;
            case 'contact':
            case 'sudo hire oshama':
                print('Let’s talk about what you’re building.', '', { label: 'mdosamabinnur@gmail.com', href: 'mailto:mdosamabinnur@gmail.com' });
                break;
            case 'coffee':
                print('Permission denied: caffeine requires sudo.');
                break;
            case 'sudo coffee':
                print('HTTP 418: I’m a teapot.\nCoffee service unavailable. Tea is a valid workaround. ☕');
                break;
            case 'git status':
                print('On branch always-learning\nChanges to be committed:\n  + one more idea\n  + a suspicious amount of coffee\n\nFictional repo. Real curiosity.');
                break;
            case '42':
                print('Answer found. Please provide a reproducible question.');
                break;
            case 'sudo':
                print('With great permissions comes great responsibility. Try sudo coffee.');
                break;
            case 'clear':
                output.replaceChildren();
                break;
            case 'exit':
            case 'quit':
                dialog.close();
                return;
            default:
                print('Command not found. Type help for the available commands.');
        }
        input.focus();
    }

    launcher.hidden = false;
    launcher.addEventListener('click', openTerminal);
    document.getElementById('terminal-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
        document.body.style.overflow = previousOverflow;
        if (returnFocus && returnFocus.isConnected) returnFocus.focus();
    });
    document.getElementById('terminal-form').addEventListener('submit', (event) => {
        event.preventDefault();
        runCommand(input.value);
    });
    output.addEventListener('click', (event) => {
        const anchor = event.target.closest('a');
        if (anchor && anchor.getAttribute('href') === '#projects') dialog.close();
    });
    document.addEventListener('keydown', (event) => {
        const target = event.target;
        if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
        if (dialog.open || target.isContentEditable || target.closest('input, textarea, select, [role="textbox"]')) return;
        if (event.key === '~') {
            event.preventDefault();
            openTerminal();
        }
    });
    input.addEventListener('keydown', (event) => {
        if (event.isComposing || !['ArrowUp', 'ArrowDown'].includes(event.key) || !history.length) return;
        event.preventDefault();
        if (historyIndex === history.length) draft = input.value;
        historyIndex = Math.max(0, Math.min(history.length, historyIndex + (event.key === 'ArrowUp' ? -1 : 1)));
        input.value = historyIndex === history.length ? draft : history[historyIndex];
        input.setSelectionRange(input.value.length, input.value.length);
    });
})();
