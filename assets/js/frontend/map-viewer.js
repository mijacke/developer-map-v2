(() => {
    const config = window.dmFrontendConfig || {};
    const endpoint = typeof config.endpoint === 'string' ? config.endpoint : '';

    if (!endpoint) {
        console.warn('[Developer Map] Missing REST endpoint configuration.');
        return;
    }

    const AVAILABLE_KEYWORDS = ['available', 'free', 'voln', 'volne', 'volny', 'volny apartman', 'volne apartmany', 'predaj', 'na predaj'];
    let selectInstanceCounter = 0;
    const customSelectRegistry = new Map();
    let openCustomSelectRef = null;
    const DASHBOARD_STACK_BREAKPOINT = 1100;
    const stackedDashboards = new WeakSet();
    const fallbackDashboards = new Set();
    let fallbackResizeHandler = null;
    const dashboardResizeObserver =
        typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver((entries) => {
                entries.forEach(({ target, contentRect }) => {
                    applyDashboardStackState(target, contentRect?.width ?? contentRect?.inlineSize);
                });
            })
            : null;

    function applyDashboardStackState(element, measuredWidth) {
        if (!element) {
            return;
        }
        const width = typeof measuredWidth === 'number' && measuredWidth > 0
            ? measuredWidth
            : element.getBoundingClientRect().width || element.offsetWidth;
        const shouldStack = width > 0 && width < DASHBOARD_STACK_BREAKPOINT;
        element.classList.toggle('dm-dashboard--stacked', shouldStack);
    }

    function ensureDashboardStackObserver(section) {
        if (!section || stackedDashboards.has(section)) {
            return;
        }
        stackedDashboards.add(section);
        if (dashboardResizeObserver) {
            dashboardResizeObserver.observe(section);
            requestAnimationFrame(() => applyDashboardStackState(section));
            return;
        }
        fallbackDashboards.add(section);
        if (!fallbackResizeHandler) {
            fallbackResizeHandler = () => {
                fallbackDashboards.forEach((element) => applyDashboardStackState(element));
            };
            window.addEventListener('resize', fallbackResizeHandler);
        }
        requestAnimationFrame(() => applyDashboardStackState(section));
    }

    function handleGlobalPointer(event) {
        if (!openCustomSelectRef) {
            return;
        }
        const config = customSelectRegistry.get(openCustomSelectRef);
        if (!config?.wrapper) {
            return;
        }
        if (config.wrapper.contains(event.target)) {
            return;
        }
        closeCustomSelectMenu(openCustomSelectRef);
    }

    function handleGlobalKey(event) {
        if (!openCustomSelectRef) {
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            const config = customSelectRegistry.get(openCustomSelectRef);
            closeCustomSelectMenu(openCustomSelectRef);
            config?.trigger?.focus();
        }
    }

    function focusOptionForSelect(select, targetValue) {
        const config = customSelectRegistry.get(select);
        if (!config?.list) {
            return;
        }
        const optionButtons = Array.from(config.list.querySelectorAll('.dm-dashboard__select-option'));
        if (!optionButtons.length || !optionButtons.some((button) => !button.disabled)) {
            return;
        }
        const target =
            (targetValue && optionButtons.find((button) => button.dataset.value === targetValue)) ||
            optionButtons.find((button) => button.classList.contains('is-selected')) ||
            optionButtons.find((button) => !button.disabled) ||
            optionButtons[0];
        if (target) {
            target.focus({ preventScroll: true });
        }
    }

    function handleOptionNavigation(select, event) {
        const config = customSelectRegistry.get(select);
        if (!config?.list) {
            return;
        }
        const optionButtons = Array.from(config.list.querySelectorAll('.dm-dashboard__select-option'));
        if (!optionButtons.length) {
            return;
        }
        const moveFocus = (direction) => {
            if (!optionButtons.length) {
                return;
            }
            let index = optionButtons.indexOf(document.activeElement);
            if (index === -1) {
                index = direction > 0 ? -1 : 0;
            }
            do {
                index = (index + direction + optionButtons.length) % optionButtons.length;
            } while (optionButtons[index]?.disabled);
            optionButtons[index]?.focus();
        };
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                moveFocus(1);
                break;
            case 'ArrowUp':
                event.preventDefault();
                moveFocus(-1);
                break;
            case 'Home':
                event.preventDefault();
                optionButtons.find((button) => !button.disabled)?.focus();
                break;
            case 'End':
                event.preventDefault();
                [...optionButtons].reverse().find((button) => !button.disabled)?.focus();
                break;
            case ' ':
            case 'Enter':
                if (document.activeElement && optionButtons.includes(document.activeElement)) {
                    event.preventDefault();
                    document.activeElement.click();
                }
                break;
            case 'Tab':
                closeCustomSelectMenu(select);
                break;
            default:
                break;
        }
    }

    function updateCustomSelectDisplay(select) {
        const config = customSelectRegistry.get(select);
        if (!config) {
            return;
        }
        const selectedOption = select.options[select.selectedIndex] || select.options[0];
        if (config.valueEl && selectedOption) {
            config.valueEl.textContent = selectedOption.textContent;
        }
        if (config.list) {
            const buttons = config.list.querySelectorAll('.dm-dashboard__select-option');
            buttons.forEach((button) => {
                const isSelected = button.dataset.value === select.value;
                button.classList.toggle('is-selected', isSelected);
                button.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            });
        }
        if (config.wrapper) {
            config.wrapper.classList.toggle('dm-dashboard__select--has-value', Boolean(select.value));
        }
    }

    function rebuildCustomSelectOptions(select) {
        const config = customSelectRegistry.get(select);
        if (!config?.list) {
            return;
        }
        config.list.innerHTML = '';
        Array.from(select.options).forEach((option) => {
            const optionButton = document.createElement('button');
            optionButton.type = 'button';
            optionButton.className = 'dm-dashboard__select-option';
            optionButton.dataset.value = option.value;
            optionButton.textContent = option.textContent;
            optionButton.tabIndex = -1;
            optionButton.disabled = option.disabled;
            optionButton.setAttribute('role', 'option');
            optionButton.setAttribute('aria-selected', option.selected ? 'true' : 'false');
            if (option.disabled) {
                optionButton.classList.add('is-disabled');
                optionButton.setAttribute('aria-disabled', 'true');
            }
            if (option.selected) {
                optionButton.classList.add('is-selected');
            }
            optionButton.addEventListener('click', (event) => {
                event.preventDefault();
                if (option.disabled) {
                    return;
                }
                select.value = option.value;
                updateCustomSelectDisplay(select);
                select.dispatchEvent(new Event('change', { bubbles: true }));
                closeCustomSelectMenu(select);
                config.trigger?.focus();
            });
            config.list.appendChild(optionButton);
        });
        config.list.scrollTop = 0;
        updateCustomSelectDisplay(select);
    }

    function openCustomSelectMenu(select, options = {}) {
        const config = customSelectRegistry.get(select);
        if (!config) {
            return;
        }
        if (openCustomSelectRef && openCustomSelectRef !== select) {
            closeCustomSelectMenu(openCustomSelectRef);
        }
        rebuildCustomSelectOptions(select);
        if (config.dropdown) {
            config.dropdown.hidden = false;
        }
        config.wrapper?.classList.add('is-open');
        config.trigger?.setAttribute('aria-expanded', 'true');
        openCustomSelectRef = select;
        document.addEventListener('pointerdown', handleGlobalPointer, true);
        document.addEventListener('keydown', handleGlobalKey);
        if (options.focusSelected) {
            requestAnimationFrame(() => focusOptionForSelect(select));
        }
    }

    function closeCustomSelectMenu(select) {
        const config = customSelectRegistry.get(select);
        if (!config) {
            return;
        }
        if (config.dropdown) {
            config.dropdown.hidden = true;
        }
        config.wrapper?.classList.remove('is-open');
        config.trigger?.setAttribute('aria-expanded', 'false');
        if (openCustomSelectRef === select) {
            openCustomSelectRef = null;
            document.removeEventListener('pointerdown', handleGlobalPointer, true);
            document.removeEventListener('keydown', handleGlobalKey);
        }
    }

    function toggleCustomSelectMenu(select) {
        if (openCustomSelectRef === select) {
            closeCustomSelectMenu(select);
        } else {
            openCustomSelectMenu(select, { focusSelected: true });
        }
    }

    function registerCustomSelect(select, config) {
        if (!select || !config?.wrapper || !config?.trigger || !config?.dropdown || !config?.list || !config?.valueEl) {
            return;
        }
        select.tabIndex = -1;
        select.setAttribute('aria-hidden', 'true');
        customSelectRegistry.set(select, config);
        config.trigger.setAttribute('aria-expanded', 'false');
        config.trigger.addEventListener('click', (event) => {
            event.preventDefault();
            toggleCustomSelectMenu(select);
        });
        config.trigger.addEventListener('keydown', (event) => {
            const { key } = event;
            if (key === ' ' || key === 'Enter' || key === 'ArrowDown' || key === 'ArrowUp') {
                event.preventDefault();
                openCustomSelectMenu(select, { focusSelected: true });
            }
        });
        config.list.addEventListener('keydown', (event) => handleOptionNavigation(select, event));
        config.wrapper.addEventListener('focusout', (event) => {
            if (config.wrapper.contains(event.relatedTarget)) {
                return;
            }
            closeCustomSelectMenu(select);
        });
        select.addEventListener('change', () => updateCustomSelectDisplay(select));
        rebuildCustomSelectOptions(select);
    }

    function ensureStyles() {
        const STYLE_ID = 'dm-map-viewer-style';
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .dm-map-viewer { font-family: 'Inter', 'Segoe UI', sans-serif; margin: 1.5rem 0; --dm-accent: #4d38ff; --dm-accent-rgb: 77, 56, 255; }
            .dm-map-viewer__card { border: 1px solid rgba(15, 23, 42, 0.12); border-radius: 18px; padding: 24px; background: #ffffff; box-shadow: 0 18px 38px rgba(15, 23, 42, 0.06); display: grid; gap: 24px; }
            .dm-map-viewer__header h3 { margin: 0; font-size: 1.4rem; color: #1c134f; }
            .dm-map-viewer__header p { margin: 8px 0 0; color: #475569; line-height: 1.5; }
            .dm-map-viewer__surface { position: relative; border-radius: 20px; overflow: hidden; background: #0f172a; }
            .dm-map-viewer__image { width: 100%; height: auto; display: block; }
            .dm-map-viewer__overlay { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
            .dm-map-viewer__regions { pointer-events: none; }
            .dm-map-viewer__region { fill: rgba(52, 69, 235, 0.12); stroke: none; pointer-events: auto; transition: fill 0.18s ease, opacity 0.18s ease; opacity: 0.4; outline: none; }
            .dm-map-viewer__region:hover { opacity: 0.72; }
            .dm-map-viewer__region.is-active { opacity: 0.72; }
            .dm-map-viewer__region:focus { outline: none; }
            .dm-map-viewer__region:focus-visible { outline: none; }
            .dm-map-viewer__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
            .dm-map-viewer__item { display: flex; align-items: center; gap: 12px; justify-content: space-between; border: 1px solid rgba(15, 23, 42, 0.08); border-radius: 12px; padding: 12px 16px; background: #f8fafc; }
            .dm-map-viewer__item strong { font-weight: 600; color: #1c134f; }
            .dm-map-viewer__badge { display: inline-flex; align-items: center; justify-content: center; padding: 4px 10px; border-radius: 999px; background: rgba(124, 58, 237, 0.12); color: #5b21b6; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
            .dm-map-viewer__error { padding: 16px; border-radius: 12px; background: rgba(239, 68, 68, 0.12); color: #b91c1c; }
            .dm-map-viewer__loading { padding: 16px; border-radius: 12px; background: rgba(30, 64, 175, 0.08); color: #1d4ed8; }
            .dm-map-viewer__empty { margin: 0; padding: 16px; border-radius: 12px; background: rgba(15, 118, 110, 0.08); color: #0f766e; }
            .dm-map-viewer__popover { position: absolute; z-index: 10; display: none; pointer-events: auto; }
            .dm-map-viewer__popover.is-visible { display: block; }
            .dm-map-viewer__popover-card { background: #ffffff; border-radius: 16px; padding: 18px 20px; box-shadow: 0 18px 42px rgba(15, 23, 42, 0.22); min-width: 220px; max-width: 280px; border: 1px solid rgba(15, 23, 42, 0.08); display: flex; flex-direction: column; gap: 12px; }
            .dm-map-viewer__popover-summary { font-weight: 600; font-size: 0.95rem; color: #1c134f; text-align: center; display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
            .dm-map-viewer__popover-summary strong { color: #16a34a; font-size: 1.05rem; margin-right: 6px; }
            .dm-map-viewer__popover-label { display: inline-flex; align-items: center; justify-content: center; padding: 4px 10px; border-radius: 999px; font-size: 0.85rem; font-weight: 600; background: var(--dm-popover-label-bg, rgba(var(--dm-accent-rgb, 77, 56, 255), 0.12)); color: var(--dm-popover-label-color, #1c134f); border: 1px solid var(--dm-popover-label-border, transparent); }
            .dm-map-viewer__popover-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 0.85rem; color: #334155; }
            .dm-map-viewer__popover-list li { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px; }
            .dm-map-viewer__popover-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--dm-status-color, #6366f1); box-shadow: 0 0 0 2px rgba(var(--dm-accent-rgb, 77, 56, 255), 0.15); }
            .dm-map-viewer__popover-empty { font-size: 0.85rem; color: #64748b; text-align: center; }
            .dm-map-viewer__popover-cta { border: none; border-radius: 10px; padding: 10px 18px; background: var(--dm-accent, #4d38ff); color: #ffffff; font-weight: 600; font-size: 0.9rem; cursor: pointer; align-self: center; min-width: 140px; text-align: center; transition: transform 0.15s ease, box-shadow 0.15s ease; box-shadow: 0 12px 24px rgba(var(--dm-accent-rgb, 77, 56, 255), 0.18); }
            .dm-map-viewer__popover-cta:hover { background: var(--dm-accent, #4d38ff); transform: translateY(-1px); box-shadow: 0 16px 32px rgba(var(--dm-accent-rgb, 77, 56, 255), 0.26); }
            .dm-map-viewer__popover-cta:active { background: var(--dm-accent, #4d38ff); transform: translateY(0); }
            .dm-map-viewer__popover-cta:focus { background: var(--dm-accent, #4d38ff); outline: 2px solid var(--dm-accent, #4d38ff); outline-offset: 2px; }
            .dm-map-viewer__tables { margin-top: 32px; display: flex; flex-direction: column; gap: 40px; }
            .dm-dashboard--public {
                font-family: 'Inter', 'Segoe UI', sans-serif;
                color: #1C134F;
                display: flex;
                flex-direction: column;
                gap: 24px;
                --dm-filter-surface: #ffffff;
                --dm-filter-border: rgba(28, 19, 79, 0.16);
                --dm-filter-border-strong: rgba(var(--dm-accent-rgb), 0.4);
                --dm-filter-shadow: 0 18px 32px rgba(18, 17, 51, 0.12);
                --dm-filter-radius: clamp(14px, 2vw, 18px);
                --dm-filter-height: clamp(46px, 5.5vw, 54px);
                --dm-filter-label: rgba(28, 19, 79, 0.65);
            }
            .dm-dashboard--public .dm-dashboard__card { background: #ffffff; border-radius: 28px; border: 1px solid rgba(85, 60, 154, 0.08); padding: clamp(24px, 4vw, 36px); box-shadow: 0 24px 64px rgba(82, 51, 143, 0.08); display: flex; flex-direction: column; gap: 24px; }
            .dm-dashboard--public .dm-dashboard__heading { display: flex; flex-direction: column; gap: 10px; }
            .dm-dashboard--public .dm-dashboard__heading h1 { margin: 0; font-size: clamp(1.4rem, 3vw, 1.8rem); color: #1C134F; }
            .dm-dashboard--public .dm-dashboard__heading p { margin: 0; color: #6b6a84; font-size: 0.95rem; }
            .dm-dashboard--public .dm-dashboard__heading-note { margin: 0; color: #6b6a84; font-size: 0.9rem; }
            .dm-dashboard--public .dm-dashboard__summary { font-weight: 600; color: var(--dm-accent); font-size: 0.95rem; margin-top: -8px; }
            .dm-dashboard--public .dm-dashboard__toolbar { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: clamp(12px, 2vw, 18px); align-items: end; }
            .dm-dashboard--public .dm-dashboard__search-wrapper { display: flex; flex-direction: column; gap: 8px; align-items: center; }
            .dm-dashboard--public .dm-dashboard__search-label { font-size: 0.78rem; font-weight: 650; letter-spacing: 0.08em; text-transform: uppercase; color: var(--dm-filter-label); text-align: center; }
            .dm-dashboard--public .dm-dashboard__search { width: 100%; min-height: var(--dm-filter-height); border: 1.5px solid var(--dm-filter-border); border-radius: var(--dm-filter-radius); display: flex; align-items: center; gap: 12px; padding: 0 clamp(16px, 2vw, 22px); background: #ffffff; box-shadow: var(--dm-filter-shadow); transition: box-shadow 0.2s ease, transform 0.2s ease, border-color 0.2s ease; }
            .dm-dashboard--public .dm-dashboard__search:focus-within { box-shadow: 0 24px 48px rgba(var(--dm-accent-rgb), 0.22); transform: translateY(-1px); border-color: var(--dm-filter-border-strong); }
            .dm-dashboard--public .dm-dashboard__search input { border: none; background: transparent; flex: 1; font-size: 0.95rem; font-weight: 600; color: #1C134F; height: 100%; text-align: left; }
            .dm-dashboard--public .dm-dashboard__search input::placeholder { color: rgba(28, 19, 79, 0.45); font-weight: 600; }
            .dm-dashboard--public .dm-dashboard__search input:focus { outline: none; }
            .dm-dashboard--public .dm-dashboard__search-icon { width: 18px; height: 18px; color: rgba(28, 19, 79, 0.75); display: inline-flex; flex-shrink: 0; }
            .dm-dashboard--public .dm-dashboard__select { display: flex; flex-direction: column; gap: 8px; font-size: 0.85rem; color: #4a4a68; position: relative; align-items: center; }
            .dm-dashboard--public .dm-dashboard__select-label { font-size: 0.78rem; font-weight: 650; letter-spacing: 0.08em; text-transform: uppercase; color: var(--dm-filter-label); text-align: center; }
            .dm-dashboard--public .dm-dashboard__select--has-value .dm-dashboard__select-label { color: #1C134F; }
            .dm-dashboard--public .dm-dashboard__select-trigger { position: relative; width: 100%; min-height: var(--dm-filter-height); border-radius: var(--dm-filter-radius); border: 1.5px solid var(--dm-filter-border); background: #ffffff; padding: 0 clamp(48px, 5vw, 56px); display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; box-shadow: var(--dm-filter-shadow); color: #1C134F; font-size: 0.95rem; font-weight: 600; text-align: center; transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease; }
            .dm-dashboard--public .dm-dashboard__select-trigger:focus-visible { outline: none; border-color: var(--dm-filter-border-strong); box-shadow: 0 24px 48px rgba(var(--dm-accent-rgb), 0.22); }
            .dm-dashboard--public .dm-dashboard__select.is-open .dm-dashboard__select-trigger { border-color: var(--dm-filter-border-strong); box-shadow: 0 24px 48px rgba(var(--dm-accent-rgb), 0.22); transform: translateY(-1px); }
            .dm-dashboard--public .dm-dashboard__select-value { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; }
            .dm-dashboard--public .dm-dashboard__select-icon { position: absolute; right: clamp(18px, 2.6vw, 22px); top: 50%; transform: translateY(-50%); width: 16px; height: 16px; background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%231C134F' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") no-repeat center center; background-size: contain; pointer-events: none; }
            .dm-dashboard--public .dm-dashboard__select-dropdown { position: absolute; top: calc(100% + 8px); left: 0; width: 100%; background: #ffffff; border: 1.5px solid rgba(var(--dm-accent-rgb), 0.22); border-radius: clamp(16px, 2.4vw, 20px); box-shadow: 0 26px 48px rgba(15, 23, 42, 0.22); padding: clamp(6px, 1vw, 10px); z-index: 60; max-height: min(40vh, 320px); overflow: hidden; }
            .dm-dashboard--public .dm-dashboard__select-dropdown[hidden] { display: none; }
            .dm-dashboard--public .dm-dashboard__select-dropdown-inner { display: flex; flex-direction: column; gap: 6px; max-height: min(40vh, 320px); overflow-y: auto; overscroll-behavior: contain; padding-right: 4px; }
            .dm-dashboard--public .dm-dashboard__select-dropdown-inner::-webkit-scrollbar { width: 8px; }
            .dm-dashboard--public .dm-dashboard__select-dropdown-inner::-webkit-scrollbar-track { background: rgba(var(--dm-accent-rgb), 0.08); border-radius: 999px; }
            .dm-dashboard--public .dm-dashboard__select-dropdown-inner::-webkit-scrollbar-thumb { background: rgba(var(--dm-accent-rgb), 0.32); border-radius: 999px; }
            .dm-dashboard--public .dm-dashboard__select-option { border: none; border-radius: clamp(12px, 1.8vw, 14px); background: transparent; padding: 12px 16px; text-align: left; font-size: 0.95rem; font-weight: 600; color: #1c134f; cursor: pointer; transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease; }
            .dm-dashboard--public .dm-dashboard__select-option:focus { outline: none; box-shadow: inset 0 0 0 2px rgba(var(--dm-accent-rgb), 0.25); }
            .dm-dashboard--public .dm-dashboard__select-option:hover { background: rgba(var(--dm-accent-rgb), 0.12); color: var(--dm-accent); transform: translateY(-1px); }
            .dm-dashboard--public .dm-dashboard__select-option.is-selected { background: rgba(var(--dm-accent-rgb), 0.18); color: var(--dm-accent); box-shadow: inset 0 0 0 1px rgba(var(--dm-accent-rgb), 0.16); }
            .dm-dashboard--public .dm-dashboard__select-option.is-disabled { opacity: 0.45; cursor: not-allowed; }
            .dm-dashboard--public .dm-dashboard__select-option.is-disabled:hover,
            .dm-dashboard--public .dm-dashboard__select-option.is-disabled:focus { background: transparent; color: inherit; transform: none; box-shadow: none; }
            .dm-dashboard--public .dm-dashboard__select-native { position: absolute; opacity: 0; pointer-events: none; width: 0; height: 0; }
            .dm-dashboard--public .dm-dashboard__table-wrapper { background: #ffffff; border-radius: 24px; border: 1px solid #d2d2dc; padding: clamp(18px, 3vw, 24px); box-shadow: 0 10px 28px rgba(22, 22, 29, 0.06); }
            .dm-dashboard--public .dm-dashboard__table {
                display: flex;
                flex-direction: column;
                gap: 16px;
                border-collapse: separate;
                border-spacing: 0;
            }
            .dm-dashboard--public .dm-dashboard__table thead { display: block; }
            .dm-dashboard--public .dm-dashboard__table thead tr,
            .dm-dashboard--public .dm-dashboard__table tbody tr { display: grid; grid-template-columns: minmax(90px, 0.9fr) minmax(140px, 1.2fr) minmax(90px, 0.9fr) minmax(90px, 0.8fr) minmax(110px, 1fr) minmax(110px, 1fr) minmax(120px, 1fr); gap: 14px; align-items: center; }
            .dm-dashboard--public .dm-dashboard__table thead tr { background: transparent; border-radius: 0; padding: 0 0 12px; border-bottom: 1px solid rgba(28, 19, 79, 0.08); }
            .dm-dashboard--public .dm-dashboard__table th,
            .dm-dashboard--public .dm-dashboard__table td { border: none !important; box-shadow: none !important; background: transparent; text-align: center; }
            .dm-dashboard--public .dm-dashboard__table th { text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.8rem; color: rgba(45, 45, 78, 0.6); }
            .dm-dashboard--public .dm-dashboard__table tbody { display: flex; flex-direction: column; gap: 0; }
            .dm-dashboard--public .dm-dashboard__table tbody tr { padding: 18px 0; border-bottom: 1px solid rgba(28, 19, 79, 0.06); background: transparent; transition: background-color 0.2s ease; }
            .dm-dashboard--public .dm-dashboard__table tbody tr.dm-dashboard__clickable-row:hover { background: rgba(var(--dm-accent-rgb, 77, 56, 255), 0.06); }
            .dm-dashboard--public .dm-dashboard__table tbody tr:last-child { border-bottom: none; }
            .dm-dashboard--public .dm-dashboard__table td { font-size: 0.95rem; color: #1C134F; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .dm-dashboard--public .dm-dashboard__link { color: #1C134F; font-weight: 600; text-decoration: none; }
            .dm-dashboard--public .dm-dashboard__link:hover,
            .dm-dashboard--public .dm-dashboard__link:focus { color: var(--dm-accent); text-decoration: underline; }
            .dm-dashboard--public .dm-dashboard__text { font-weight: 600; color: #1C134F; }
            .dm-dashboard--public .dm-dashboard__parent-tag { display: inline-flex; align-items: center; gap: 4px; margin-left: 10px; padding: 4px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; background: rgba(var(--dm-accent-rgb), 0.08); color: var(--dm-accent); border: 1px solid rgba(var(--dm-accent-rgb), 0.2); }
            .dm-dashboard--public .dm-status { display: inline-flex; padding: 6px 14px; border-radius: 999px; font-weight: 600; font-size: 0.85rem; background: rgba(124, 58, 237, 0.12); color: rgba(45, 45, 78, 0.85); }
            .dm-dashboard--public .dm-status--volne { background: #dcfce7; color: #16803C; }
            .dm-dashboard--public .dm-status--obsadene,
            .dm-dashboard--public .dm-status--predane { background: #fee2e2; color: #b91c1c; }
            .dm-dashboard--public .dm-status--rezervovane { background: #fef3c7; color: #b45309; }
            .dm-dashboard--public .dm-status--unknown { background: rgba(124, 58, 237, 0.12); color: rgba(45, 45, 78, 0.65); }
            .dm-dashboard--public .dm-dashboard__empty-row td { padding: 40px 24px; text-align: center; font-size: 0.95rem; color: #64748b; grid-column: 1 / -1; }
            .dm-dashboard--public .dm-dashboard__legend { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 4px 0 12px; }
            .dm-dashboard--public .dm-dashboard__legend-heading { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(45, 45, 78, 0.6); font-weight: 700; margin-right: 4px; }
            .dm-dashboard--public .dm-dashboard__legend-badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 999px; font-size: 0.85rem; font-weight: 600; }
            .dm-dashboard--public .dm-dashboard__legend-badge--volne { background: #dcfce7; color: #16803C; }
            .dm-dashboard--public .dm-dashboard__legend-badge--obsadene,
            .dm-dashboard--public .dm-dashboard__legend-badge--predane { background: #fee2e2; color: #b91c1c; }
            .dm-dashboard--public .dm-dashboard__legend-badge--rezervovane { background: #fef3c7; color: #b45309; }
            .dm-dashboard--public .dm-dashboard__legend-badge--unknown { background: rgba(124, 58, 237, 0.12); color: rgba(45, 45, 78, 0.65); }
            .dm-dashboard--public .dm-dashboard__legend-dot { width: 10px; height: 10px; border-radius: 50%; }
            .dm-dashboard--public .dm-dashboard__legend--public { justify-content: flex-start; }
            .dm-dashboard--public .dm-dashboard__info-notice { display: flex; align-items: center; gap: 10px; padding: 12px 16px; margin-top: 8px; background: linear-gradient(135deg, rgba(var(--dm-accent-rgb, 77, 56, 255), 0.08) 0%, rgba(var(--dm-accent-rgb, 77, 56, 255), 0.04) 100%); border-radius: 12px; border: 1px solid rgba(var(--dm-accent-rgb, 77, 56, 255), 0.18); color: var(--dm-accent, #4d38ff); font-size: 0.9rem; font-weight: 500; }
            .dm-dashboard--public .dm-dashboard__info-notice-icon { width: 20px; height: 20px; flex-shrink: 0; color: var(--dm-accent, #4d38ff); }
            .dm-dashboard--public.dm-dashboard--stacked .dm-dashboard__table thead { display: none; }
            .dm-dashboard--public.dm-dashboard--stacked .dm-dashboard__table tbody tr { display: flex; flex-direction: column; gap: 12px; border: 1px solid rgba(28, 19, 79, 0.08); border-radius: 18px; padding: 18px 18px; background: #ffffff; }
            .dm-dashboard--public.dm-dashboard--stacked .dm-dashboard__table td { width: 100%; display: flex; justify-content: space-between; align-items: center; white-space: normal; background: transparent; }
            .dm-dashboard--public.dm-dashboard--stacked .dm-dashboard__table td::before { content: attr(data-label); font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(45, 45, 78, 0.6); margin-right: 12px; }
            .dm-dashboard--public.dm-dashboard--stacked .dm-dashboard__toolbar { grid-template-columns: 1fr; }
            @media (max-width: 1000px) {
                .dm-dashboard--public .dm-dashboard__toolbar { grid-template-columns: 1fr 1fr; }
                .dm-dashboard--public .dm-dashboard__search-wrapper { grid-column: 1 / -1; }
            }
            @media (max-width: 900px) {
                .dm-dashboard--public .dm-dashboard__table thead { display: none; }
                .dm-dashboard--public .dm-dashboard__table tbody { gap: 16px; }
                .dm-dashboard--public .dm-dashboard__table tbody tr { display: flex; flex-direction: column; gap: 6px; border: 1px solid rgba(28, 19, 79, 0.08); border-radius: 14px; padding: 14px 16px; background: #ffffff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04); }
                .dm-dashboard--public .dm-dashboard__table tbody tr.dm-dashboard__clickable-row:hover { background: rgba(var(--dm-accent-rgb, 77, 56, 255), 0.04); box-shadow: 0 2px 8px rgba(var(--dm-accent-rgb, 77, 56, 255), 0.1); }
                .dm-dashboard--public .dm-dashboard__table td { width: 100%; display: flex; justify-content: space-between; align-items: center; white-space: normal; background: transparent; padding: 4px 0; font-size: 0.9rem; }
                .dm-dashboard--public .dm-dashboard__table td::before { content: attr(data-label); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; font-size: 0.75rem; color: rgba(45, 45, 78, 0.5); margin-right: 12px; flex-shrink: 0; }
            }
            @media (max-width: 640px) {
                .dm-dashboard--public .dm-dashboard__toolbar { grid-template-columns: 1fr; }
                .dm-dashboard--public .dm-dashboard__table tbody { gap: 12px; }
                .dm-dashboard--public .dm-dashboard__table tbody tr { gap: 4px; padding: 12px 14px; border-radius: 12px; }
                .dm-dashboard--public .dm-dashboard__table td { padding: 3px 0; font-size: 0.85rem; }
                .dm-dashboard--public .dm-dashboard__table td::before { font-size: 0.7rem; }
                .dm-dashboard--public .dm-status { padding: 5px 12px; font-size: 0.8rem; }
            }
        `;
        document.head.appendChild(style);
    }

    const STATUS_FALLBACK_COLOR = '#6366f1';

    function clamp(value, min, max) {
        if (!Number.isFinite(value)) {
            return min;
        }
        return Math.min(max, Math.max(min, value));
    }

    function hexToRgb(hex) {
        if (!hex || typeof hex !== 'string') return '77, 56, 255';
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!result) return '77, 56, 255';
        return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
    }

    function toRgba(color, alpha = 1) {
        const safeAlpha = clamp(alpha, 0, 1);
        if (!color || typeof color !== 'string') {
            return `rgba(99, 102, 241, ${safeAlpha})`;
        }
        const trimmed = color.trim();
        if (trimmed.startsWith('rgb')) {
            if (trimmed.startsWith('rgba')) {
                return trimmed;
            }
            const values = trimmed
                .replace(/rgba?\(([^)]+)\)/, '$1')
                .split(',')
                .map((part) => Number(part.trim()));
            if (values.length >= 3) {
                const [r, g, b] = values;
                return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
            }
        }
        const hex = trimmed.replace('#', '');
        if (!hex) {
            return `rgba(99, 102, 241, ${safeAlpha})`;
        }
        const normalised = hex.length === 3 ? hex.split('').map((token) => token + token).join('') : hex.substring(0, 6);
        const numeric = Number.parseInt(normalised, 16);
        if (Number.isNaN(numeric)) {
            return `rgba(99, 102, 241, ${safeAlpha})`;
        }
        const r = (numeric >> 16) & 255;
        const g = (numeric >> 8) & 255;
        const b = numeric & 255;
        return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
    }

    function buildLegendEntries(rows, statuses) {
        if (!Array.isArray(rows) || !rows.length) {
            return [];
        }
        const unique = new Map();
        rows.forEach((entry) => {
            const descriptor = resolveStatusDisplay(entry.floor, statuses);
            if (!descriptor) {
                return;
            }
            const key = descriptor.variant || descriptor.label || `status-${unique.size}`;
            if (!unique.has(key)) {
                unique.set(key, descriptor);
            }
        });
        return Array.from(unique.values());
    }

    function normaliseStatusId(value) {
        return String(value ?? '').trim();
    }

    function parsePriceValue(value) {
        if (typeof value === 'number') {
            return Number.isFinite(value) ? value : Number.NaN;
        }
        if (typeof value !== 'string') {
            return Number.NaN;
        }
        const cleaned = value
            .replace(/\s+/g, '')
            .replace(/[^0-9,.-]/g, '')
            .replace(/,(?=\d{3}(?:[^0-9]|$))/g, '')
            .replace(/\.(?=\d{3}(?:[^0-9]|$))/g, '');
        const normalised = cleaned.includes(',') && !cleaned.includes('.') ? cleaned.replace(',', '.') : cleaned;
        const numeric = Number(normalised);
        return Number.isFinite(numeric) ? numeric : Number.NaN;
    }

    // Legacy popup implementation moved to public/assets/frontend/map-popup-backup.js.

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    const normaliseText = (value) => {
        const raw = String(value ?? '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
        return raw;
    };

    const normaliseCurrencyDisplay = (value) => {
        const raw = String(value ?? '').trim();
        if (!raw) {
            return '';
        }
        let display = raw.replace(/\s+/g, ' ');
        display = display.replace(/\beur\b/gi, '€');
        if (!display.includes('€')) {
            return `${display} €`;
        }
        return display
            .replace(/€\s*\/\s*mesiac/gi, '€ /mes')
            .replace(/€\s*\/\s*mes/gi, '€ /mes')
            .replace(/\s+/g, ' ')
            .trim()
            .replace('€ /mes', '€/mes');
    };

    const formatAreaValue = (value) => {
        const raw = String(value ?? '').trim();
        if (!raw) {
            return '—';
        }
        if (/m2$/i.test(raw)) {
            return raw.replace(/m2$/i, 'm²');
        }
        if (/m²$/i.test(raw)) {
            return raw;
        }
        return `${raw} m²`;
    };

    const formatPriceDisplay = (value) => {
        const display = normaliseCurrencyDisplay(value);
        return display && display !== '€' ? display : '—';
    };

    const formatRentDisplay = (value) => {
        const display = normaliseCurrencyDisplay(value);
        if (!display || display === '€') {
            return '—';
        }
        if (display.toLowerCase().includes('€/mes')) {
            return display.replace(/\s+/g, ' ').trim();
        }
        return `${display} /mes`.replace(/\s+/g, ' ').replace('€ /mes', '€/mes');
    };

    const slugifyStatus = (label) => {
        if (!label) {
            return 'unknown';
        }
        return label
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-)|(-$)/g, '') || 'unknown';
    };

    const resolveStatusId = (floor, statuses) => {
        if (!floor) {
            return '';
        }
        if (floor.statusId) {
            return String(floor.statusId);
        }
        if (floor.statusKey) {
            return String(floor.statusKey);
        }
        const label = floor.statusLabel ?? floor.status ?? '';
        if (!label || !Array.isArray(statuses)) {
            return '';
        }
        const match = statuses.find(
            (status) => normaliseText(status.label) === normaliseText(label) && status.id !== undefined,
        );
        return match ? String(match.id) : '';
    };

    const resolveStatusDisplay = (floor, statuses) => {
        if (!floor) {
            return {
                label: 'Neznáme',
                variant: 'unknown',
                color: STATUS_FALLBACK_COLOR,
            };
        }
        const statusId = floor.statusId ?? floor.status ?? floor.statusKey ?? '';
        const match = statuses?.find((status) => String(status.id ?? status.key ?? '') === String(statusId));
        const label = match?.label ?? floor.statusLabel ?? floor.status ?? 'Neznáme';
        const variant = (match || floor.status || floor.statusLabel) ? slugifyStatus(label) : 'unknown';
        const color = match?.color ?? floor.statusColor ?? STATUS_FALLBACK_COLOR;
        return { label, variant, color };
    };

    const matchesSearchTerm = (floor, searchTerm) => {
        if (!searchTerm) {
            return true;
        }
        const needle = normaliseText(searchTerm);
        if (!needle) {
            return true;
        }
        const candidates = [
            normaliseText(floor?.name),
            normaliseText(floor?.label),
            normaliseText(floor?.designation),
            normaliseText(floor?.type),
            normaliseText(floor?.shortcode),
        ].filter(Boolean);
        return candidates.some((candidate) => candidate.includes(needle));
    };

    const buildFloorKey = (floor) => {
        const candidates = [
            floor?.id,
            floor?.floorId,
            floor?.uuid,
            floor?.slug,
            floor?.shortcode,
            floor?.designation,
        ];
        for (const candidate of candidates) {
            if (candidate === undefined || candidate === null) {
                continue;
            }
            const trimmed = String(candidate).trim();
            if (trimmed) {
                return trimmed.toLowerCase();
            }
        }
        return null;
    };

    const formatCountLabel = (count) => {
        if (count === 1) {
            return 'lokalita';
        }
        if (count >= 2 && count <= 4) {
            return 'lokality';
        }
        return 'lokalít';
    };

    const parseBooleanFlag = (value) => {
        if (typeof value === 'boolean') {
            return value;
        }
        if (typeof value === 'number') {
            return value === 1;
        }
        if (typeof value !== 'string') {
            return false;
        }
        const normalised = value.trim().toLowerCase();
        if (!normalised) {
            return false;
        }
        return ['1', 'true', 'yes', 'ano', 'on'].includes(normalised);
    };

    const withCacheBusting = (url) => {
        if (!url || typeof url !== 'string') {
            return url;
        }
        try {
            const urlObj = new URL(url, window.location.origin);
            urlObj.searchParams.set('_', String(Date.now()));
            return urlObj.toString();
        } catch (error) {
            const delimiter = url.includes('?') ? '&' : '?';
            return `${url}${delimiter}_=${Date.now()}`;
        }
    };

    const normaliseUrl = (value) => {
        if (!value) {
            return '';
        }
        const trimmed = String(value).trim();
        if (!trimmed) {
            return '';
        }
        try {
            const resolved = new URL(trimmed, window.location.origin);
            return resolved.toString();
        } catch (error) {
            return trimmed;
        }
    };

    const resolveTablePreferences = (container, project) => {
        const dataset = container?.dataset ?? {};
        const datasetEnabled = Object.prototype.hasOwnProperty.call(dataset, 'dmTable')
            ? parseBooleanFlag(dataset.dmTable)
            : null;
        const datasetScope =
            typeof dataset.dmTableMode === 'string' ? dataset.dmTableMode.trim().toLowerCase() : null;



        const projectSettings = (() => {
            if (!project || typeof project !== 'object') {
                return null;
            }
            const frontend = project.frontend && typeof project.frontend === 'object' ? project.frontend : null;

            if (frontend && typeof frontend.locationTable === 'object') {
                return frontend.locationTable;
            }
            if (project.locationTable && typeof project.locationTable === 'object') {
                return project.locationTable;
            }
            return null;
        })();



        const enabled =
            datasetEnabled !== null
                ? datasetEnabled
                : projectSettings && Object.prototype.hasOwnProperty.call(projectSettings, 'enabled')
                    ? parseBooleanFlag(projectSettings.enabled)
                    : false;

        const tableOnly =
            projectSettings && Object.prototype.hasOwnProperty.call(projectSettings, 'tableonly')
                ? parseBooleanFlag(projectSettings.tableonly)
                : false;

        const scopeCandidate = (datasetScope || projectSettings?.scope || '').toLowerCase();
        const scope = scopeCandidate === 'hierarchy' ? 'hierarchy' : 'current';



        return {
            enabled,
            tableOnly,
            scope,
        };
    };

    const buildHierarchyRows = (project, linkedProjects) => {
        const rows = [];
        const seen = new Set();



        const resolveMapName = (map) =>
            String(
                map?.name ??
                map?.title ??
                map?.label ??
                map?.publicKey ??
                map?.shortcode ??
                'Mapa',
            ).trim();

        const pushFloor = (floor, source, parentName) => {
            if (!floor || typeof floor !== 'object') {
                return;
            }
            const key = buildFloorKey(floor);
            if (key) {
                if (seen.has(key)) {
                    return;
                }
                seen.add(key);
            }
            rows.push({
                floor,
                source,
                parentName: parentName || '',
            });
        };

        // Helper to extract location entries from region children
        const extractLocationsFromRegions = (regions) => {
            const locations = [];
            if (!Array.isArray(regions)) {
                return locations;
            }
            regions.forEach((region) => {
                if (!region || typeof region !== 'object') {
                    return;
                }
                const children = Array.isArray(region.children) ? region.children : [];
                children.forEach((child) => {
                    if (!child || typeof child !== 'object') {
                        return;
                    }
                    // Check if child is a location (not a map reference)
                    const childType = String(child.type ?? child.kind ?? child.nodeType ?? '').toLowerCase();
                    if (childType === 'map' || childType === 'project') {
                        return; // Skip map references
                    }
                    // Treat as location data
                    const locationData = {
                        id: child.id ?? child.target ?? child.value,
                        name: child.name ?? child.label ?? child.title ?? '',
                        designation: child.designation ?? child.shortcode ?? '',
                        type: child.type ?? child.kind ?? 'Lokalita',
                        statusId: child.statusId ?? child.status ?? '',
                        statusLabel: child.statusLabel ?? '',
                        area: child.area ?? '',
                        price: child.price ?? '',
                        rent: child.rent ?? '',
                        detailUrl: child.detailUrl ?? child.url ?? '',
                        ...child, // Include all other fields
                    };
                    if (locationData.id || locationData.name) {
                        locations.push(locationData);
                    }
                });
            });
            return locations;
        };

        // Process current project floors
        const currentFloors = Array.isArray(project?.floors) ? project.floors : [];

        currentFloors.forEach((floor) => pushFloor(floor, 'current', ''));

        // If project has no floors, try to extract from regions
        if (!currentFloors.length && Array.isArray(project?.regions)) {
            const regionLocations = extractLocationsFromRegions(project.regions);

            regionLocations.forEach((loc) => pushFloor(loc, 'current', ''));
        }

        // Process linked projects
        const linked = Array.isArray(linkedProjects) ? linkedProjects : [];
        linked.forEach((mapEntry) => {
            const mapName = resolveMapName(mapEntry);
            const floors = Array.isArray(mapEntry?.floors) ? mapEntry.floors : [];



            if (floors.length) {
                floors.forEach((floor) => pushFloor(floor, 'parent', mapName));
            } else if (Array.isArray(mapEntry?.regions)) {
                // Try to extract locations from regions if no floors
                const regionLocations = extractLocationsFromRegions(mapEntry.regions);

                regionLocations.forEach((loc) => pushFloor(loc, 'parent', mapName));
            }
        });


        return rows;
    };

    const mergeStatuses = (baseStatuses, ...statusLists) => {
        const result = [];
        const seen = new Set();
        const pushStatus = (status) => {
            if (!status || typeof status !== 'object') {
                return;
            }
            const key = String(status.id ?? status.key ?? '').trim();
            if (!key) {
                return;
            }
            if (seen.has(key)) {
                return;
            }
            seen.add(key);
            result.push(status);
        };
        (Array.isArray(baseStatuses) ? baseStatuses : []).forEach(pushStatus);
        statusLists.forEach((list) => {
            (Array.isArray(list) ? list : []).forEach(pushStatus);
        });
        return result;
    };

    const buildTableRows = (currentFloors, parentFloors, parentName) => {
        const rows = [];
        const seen = new Set();
        const pushFloor = (floor, source) => {
            if (!floor || typeof floor !== 'object') {
                return;
            }
            const key = buildFloorKey(floor);
            if (key) {
                if (seen.has(key)) {
                    return;
                }
                seen.add(key);
            }
            rows.push({
                floor,
                source,
                parentName: parentName || '',
            });
        };
        (currentFloors || []).forEach((floor) => pushFloor(floor, 'current'));
        (parentFloors || []).forEach((floor) => pushFloor(floor, 'parent'));
        return rows;
    };

    const renderTableRows = (tbody, dataset, statuses) => {
        if (!tbody) {
            return;
        }
        if (!dataset.length) {
            tbody.innerHTML =
                '<tr class="dm-dashboard__empty-row"><td colspan="7">Žiadne lokality nevyhovujú filtrom.</td></tr>';
            return;
        }

        // Helper to generate detail URL based on type and name
        const generateDetailUrl = (floor) => {
            const type = (floor.type || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const name = floor.name || floor.label || floor.designation || '';

            // Extract the code from name (e.g., "Byt - 101A" -> "101A", or "Garáž - 201" -> "201")
            let code = name;
            if (name.includes('-')) {
                code = name.split('-').pop().trim();
            } else if (name.includes(' ')) {
                // Try to get just the number/code part
                const parts = name.split(' ');
                code = parts[parts.length - 1].trim();
            }

            // Determine URL prefix based on type
            let urlPrefix = '';
            if (type === 'byt' || type.startsWith('byt')) {
                urlPrefix = 'byt';
            } else if (type === 'garaz' || type.startsWith('garaz')) {
                urlPrefix = 'garaz';
            } else {
                // Fallback - use type directly
                urlPrefix = type.replace(/[^a-z0-9]/g, '');
            }

            if (!urlPrefix || !code) {
                return '';
            }

            return `https://vyhladyzubrohlava.sk/${urlPrefix}-${code}/`;
        };

        const markup = dataset
            .map((entry) => {
                const floor = entry.floor || {};
                const typeValue = floor.type ? escapeHtml(String(floor.type)) : '—';
                const designation = escapeHtml(
                    floor.designation ?? floor.shortcode ?? floor.label ?? '—',
                );
                const areaText = escapeHtml(formatAreaValue(floor.area));
                const priceText = escapeHtml(formatPriceDisplay(floor.price ?? floor.meta?.price ?? ''));
                const rentText = escapeHtml(formatRentDisplay(floor.rent ?? floor.meta?.rent ?? ''));
                const status = resolveStatusDisplay(floor, statuses);
                const statusVariant = escapeHtml(status.variant || 'unknown');
                const statusLabel = escapeHtml(status.label || 'Neznáme');
                const statusColor = status.color || '#6366f1';
                const statusBgColor = toRgba(statusColor, 0.15);

                const nameValue = floor.name ?? floor.label ?? floor.designation ?? '—';

                // Don't make rows clickable if name is missing (—)
                const hasValidName = nameValue && nameValue !== '—';

                // Use existing detailUrl or generate one based on type and name (only for valid names)
                const detailUrl = hasValidName ? (normaliseUrl(
                    floor.detailUrl ??
                    floor.url ??
                    (floor.meta && (floor.meta.detailUrl ?? floor.meta.url)) ??
                    '',
                ) || generateDetailUrl(floor)) : '';

                const nameMarkup = detailUrl
                    ? `<a class="dm-dashboard__link" href="${escapeHtml(detailUrl)}">${escapeHtml(nameValue)}</a>`
                    : `<span class="dm-dashboard__text">${escapeHtml(nameValue)}</span>`;

                const rowClickAttr = detailUrl
                    ? `class="dm-dashboard__clickable-row" data-href="${escapeHtml(detailUrl)}" style="cursor: pointer;"`
                    : '';

                return `
                    <tr role="row" ${rowClickAttr}>
                        <td role="cell" data-label="Typ">${typeValue}</td>
                        <td role="cell" data-label="Názov">${nameMarkup}</td>
                        <td role="cell" data-label="Označenie">${designation}</td>
                        <td role="cell" data-label="Rozloha">${areaText}</td>
                        <td role="cell" data-label="Cena">${priceText}</td>
                        <td role="cell" data-label="Prenájom">${rentText}</td>
                        <td role="cell" data-label="Stav">
                            <span class="dm-status" style="background:${escapeHtml(statusBgColor)}; color:${escapeHtml(statusColor)};">${statusLabel}</span>
                        </td>
                    </tr>
                `;
            })
            .join('');
        tbody.innerHTML = markup;

        // Add click handlers for clickable rows
        tbody.querySelectorAll('.dm-dashboard__clickable-row').forEach((row) => {
            row.addEventListener('click', (event) => {
                // Don't navigate if clicking on a link directly
                if (event.target.tagName === 'A') {
                    return;
                }
                const href = row.dataset.href;
                if (href) {
                    window.location.href = href;
                }
            });
        });
    };

    const createTableController = ({ root, rows, statuses }) => {
        if (!root) {
            return;
        }
        const tbody = root.querySelector('[data-role="table-body"]');
        const searchInput = root.querySelector('[data-role="search"]');
        const statusSelect = root.querySelector('[data-role="status-filter"]');
        const priceSelect = root.querySelector('[data-role="price-filter"]');
        const statusSelectWrapper = root.querySelector('[data-role="status-filter-wrapper"]');
        const statusTrigger = root.querySelector('[data-role="status-trigger"]');
        const statusDropdown = root.querySelector('[data-role="status-dropdown"]');
        const statusDropdownList = root.querySelector('[data-role="status-dropdown-inner"]');
        const statusValueDisplay = root.querySelector('[data-role="status-value"]');
        const priceSelectWrapper = root.querySelector('[data-role="price-filter-wrapper"]');
        const priceTrigger = root.querySelector('[data-role="price-trigger"]');
        const priceDropdown = root.querySelector('[data-role="price-dropdown"]');
        const priceDropdownList = root.querySelector('[data-role="price-dropdown-inner"]');
        const priceValueDisplay = root.querySelector('[data-role="price-value"]');
        const summaryEl = root.querySelector('[data-role="table-summary"]');
        const parentNote = root.querySelector('[data-role="parent-note"]');

        const hasParentRows = rows.some((row) => row.source === 'parent');
        if (parentNote) {
            parentNote.hidden = !hasParentRows || !parentNote.textContent.trim();
        }

        const state = {
            searchTerm: '',
            statusFilter: '',
            priceOrder: '',
        };

        if (
            statusSelect &&
            statusSelectWrapper &&
            statusTrigger &&
            statusDropdown &&
            statusDropdownList &&
            statusValueDisplay
        ) {
            registerCustomSelect(statusSelect, {
                wrapper: statusSelectWrapper,
                trigger: statusTrigger,
                dropdown: statusDropdown,
                list: statusDropdownList,
                valueEl: statusValueDisplay,
            });
        }

        if (
            priceSelect &&
            priceSelectWrapper &&
            priceTrigger &&
            priceDropdown &&
            priceDropdownList &&
            priceValueDisplay
        ) {
            registerCustomSelect(priceSelect, {
                wrapper: priceSelectWrapper,
                trigger: priceTrigger,
                dropdown: priceDropdown,
                list: priceDropdownList,
                valueEl: priceValueDisplay,
            });
        }

        const applyFilters = () => {
            let dataset = rows;
            if (state.searchTerm) {
                dataset = dataset.filter((entry) => matchesSearchTerm(entry.floor, state.searchTerm));
            }
            if (state.statusFilter) {
                dataset = dataset.filter(
                    (entry) => resolveStatusId(entry.floor, statuses) === state.statusFilter,
                );
            }

            // Helper to check if status is "Zrušené" (cancelled)
            const isCancelled = (entry) => {
                const statusDisplay = resolveStatusDisplay(entry.floor, statuses);
                const label = (statusDisplay.label || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                return label === 'zrusene' || label.includes('zrusen');
            };

            // Helper to get type priority: Byt = 0, Garáž = 1, others = 2
            const getTypePriority = (entry) => {
                const type = (entry.floor?.type || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                if (type === 'byt' || type.startsWith('byt')) {
                    return 0;
                }
                if (type === 'garaz' || type.startsWith('garaz')) {
                    return 1;
                }
                return 2;
            };

            // Helper to get sortable name
            const getSortName = (entry) => {
                return (entry.floor?.name || entry.floor?.label || entry.floor?.designation || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            };

            dataset = [...dataset].sort((a, b) => {
                // 1. Cancelled items go to the end
                const aCancelled = isCancelled(a) ? 1 : 0;
                const bCancelled = isCancelled(b) ? 1 : 0;
                if (aCancelled !== bCancelled) {
                    return aCancelled - bCancelled;
                }

                // 2. Sort by type: Byt before Garáž
                const aTypePriority = getTypePriority(a);
                const bTypePriority = getTypePriority(b);
                if (aTypePriority !== bTypePriority) {
                    return aTypePriority - bTypePriority;
                }

                // 3. Alphabetical by name
                const aName = getSortName(a);
                const bName = getSortName(b);
                return aName.localeCompare(bName, 'sk');
            });

            if (state.priceOrder === 'asc' || state.priceOrder === 'desc') {
                const direction = state.priceOrder === 'asc' ? 1 : -1;
                dataset = [...dataset].sort((a, b) => {
                    const aCancelled = isCancelled(a) ? 1 : 0;
                    const bCancelled = isCancelled(b) ? 1 : 0;
                    if (aCancelled !== bCancelled) {
                        return aCancelled - bCancelled;
                    }

                    const priceA = parsePriceValue(a.floor?.price ?? a.floor?.meta?.price ?? '');
                    const priceB = parsePriceValue(b.floor?.price ?? b.floor?.meta?.price ?? '');
                    if (priceA === priceB) {
                        return 0;
                    }
                    if (priceA === null || Number.isNaN(priceA)) {
                        return 1;
                    }
                    if (priceB === null || Number.isNaN(priceB)) {
                        return -1;
                    }
                    return priceA > priceB ? direction : -direction;
                });
            }
            renderTableRows(tbody, dataset, statuses);

        };

        if (searchInput) {
            searchInput.addEventListener('input', (event) => {
                state.searchTerm = event.target.value || '';
                applyFilters();
            });
        }

        if (statusSelect) {
            statusSelect.addEventListener('change', (event) => {
                state.statusFilter = event.target.value || '';
                applyFilters();
            });
        }

        if (priceSelect) {
            priceSelect.addEventListener('change', (event) => {
                state.priceOrder = event.target.value || '';
                applyFilters();
            });
        }

        applyFilters();
    };

    const createMapTableElement = ({ map, statuses, isCurrent, rows }) => {
        const floors = Array.isArray(map?.floors) ? map.floors : [];
        const resolvedRows = Array.isArray(rows) ? rows : buildTableRows(floors, [], '');
        const resolvedStatuses = Array.isArray(statuses) ? statuses : [];
        const statusOptions = [
            '<option value="">NEROZHODUJE</option>',
            ...(Array.isArray(statuses) ? statuses : [])
                .map((status) => {
                    const key = status?.id ?? status?.key ?? '';
                    if (key === '' && key !== 0) {
                        return '';
                    }
                    return `<option value="${escapeHtml(String(key))}">${escapeHtml(
                        status?.label ?? String(key),
                    )}</option>`;
                })
                .filter(Boolean),
        ].join('');
        const legendMarkup = resolvedStatuses.length
            ? `<div class="dm-dashboard__legend dm-dashboard__legend--public" role="list">
                    <span class="dm-dashboard__legend-heading" aria-hidden="true">Legenda stavov</span>
                    ${resolvedStatuses
                .map((status) => {
                    const label = status?.label ?? 'Neznáme';
                    const color = status?.color || '#6366f1';
                    const bgColor = toRgba(color, 0.15);
                    return `
                                <span class="dm-dashboard__legend-badge" role="listitem" style="background:${escapeHtml(bgColor)}; color:${escapeHtml(color)};">
                                    ${escapeHtml(label)}
                                </span>
                            `;
                })
                .join('')}
                </div>
                <div class="dm-dashboard__info-notice" role="note">
                    <svg class="dm-dashboard__info-notice-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" fill="currentColor"/>
                    </svg>
                    <span>Ku každému bytu je nutné zakúpiť garážové státie.</span>
                </div>`
            : '';

        const instanceId = `dm-public-${++selectInstanceCounter}`;
        const statusLabelId = `${instanceId}-status-label`;
        const statusValueId = `${instanceId}-status-value`;
        const statusNativeId = `${instanceId}-status-native`;
        const priceLabelId = `${instanceId}-price-label`;
        const priceValueId = `${instanceId}-price-value`;
        const priceNativeId = `${instanceId}-price-native`;
        const section = document.createElement('section');
        section.className = 'dm-dashboard dm-dashboard--public';
        section.innerHTML = `
            <div class="dm-dashboard__card">
                <div class="dm-dashboard__toolbar" role="search">
                    <div class="dm-dashboard__search-wrapper">
                        <span class="dm-dashboard__search-label">Vyhľadávanie</span>
                        <label class="dm-dashboard__search">
                            <img class="dm-dashboard__search-icon" src="data:image/svg+xml,%3Csvg width='19' height='19' viewBox='0 0 19 19' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M18.7088 17.0928L14.4016 12.7856C15.4386 11.4052 15.9984 9.72482 15.9965 7.99824C15.9965 3.58804 12.4084 0 7.99824 0C3.58804 0 0 3.58804 0 7.99824C0 12.4084 3.58804 15.9965 7.99824 15.9965C9.72482 15.9984 11.4052 15.4386 12.7856 14.4016L17.0928 18.7088C17.3109 18.9037 17.5952 19.0077 17.8876 18.9996C18.1799 18.9914 18.458 18.8716 18.6648 18.6648C18.8716 18.458 18.9914 18.1799 18.9996 17.8876C19.0077 17.5952 18.9037 17.3109 18.7088 17.0928ZM2.28521 7.99824C2.28521 6.86831 2.62027 5.76375 3.24803 4.82425C3.87579 3.88475 4.76804 3.1525 5.81196 2.72009C6.85588 2.28768 8.00458 2.17455 9.1128 2.39499C10.221 2.61542 11.239 3.15954 12.038 3.95852C12.8369 4.7575 13.3811 5.77546 13.6015 6.88368C13.8219 7.9919 13.7088 9.1406 13.2764 10.1845C12.844 11.2284 12.1117 12.1207 11.1722 12.7484C10.2327 13.3762 9.12817 13.7113 7.99824 13.7113C6.48361 13.7094 5.03153 13.107 3.96053 12.036C2.88952 10.9649 2.28703 9.51287 2.28521 7.99824Z' fill='%237A768C'/%3E%3C/svg%3E" alt="" aria-hidden="true" />
                            <input type="search" placeholder="Vyhľadať lokalitu" data-role="search" aria-label="Vyhľadať lokalitu" />
                        </label>
                    </div>
                    <div class="dm-dashboard__select" data-role="status-filter-wrapper">
                        <span class="dm-dashboard__select-label" id="${statusLabelId}">Stav</span>
                        <button type="button" class="dm-dashboard__select-trigger" data-role="status-trigger" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="${statusLabelId} ${statusValueId}">
                            <span class="dm-dashboard__select-value" data-role="status-value" id="${statusValueId}">NEROZHODUJE</span>
                            <span class="dm-dashboard__select-icon" aria-hidden="true"></span>
                        </button>
                        <div class="dm-dashboard__select-dropdown" data-role="status-dropdown" role="listbox" aria-labelledby="${statusLabelId}" hidden>
                            <div class="dm-dashboard__select-dropdown-inner" data-role="status-dropdown-inner"></div>
                        </div>
                        <select id="${statusNativeId}" class="dm-dashboard__select-native" data-role="status-filter" aria-labelledby="${statusLabelId}" tabindex="-1" aria-hidden="true">
                            ${statusOptions}
                        </select>
                    </div>
                    <div class="dm-dashboard__select" data-role="price-filter-wrapper">
                        <span class="dm-dashboard__select-label" id="${priceLabelId}">Cena</span>
                        <button type="button" class="dm-dashboard__select-trigger" data-role="price-trigger" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="${priceLabelId} ${priceValueId}">
                            <span class="dm-dashboard__select-value" data-role="price-value" id="${priceValueId}">NEROZHODUJE</span>
                            <span class="dm-dashboard__select-icon" aria-hidden="true"></span>
                        </button>
                        <div class="dm-dashboard__select-dropdown" data-role="price-dropdown" role="listbox" aria-labelledby="${priceLabelId}" hidden>
                            <div class="dm-dashboard__select-dropdown-inner" data-role="price-dropdown-inner"></div>
                        </div>
                        <select id="${priceNativeId}" class="dm-dashboard__select-native" data-role="price-filter" aria-labelledby="${priceLabelId}" tabindex="-1" aria-hidden="true">
                            <option value="">NEROZHODUJE</option>
                            <option value="asc">Najnižšia</option>
                            <option value="desc">Najvyššia</option>
                        </select>
                    </div>
                </div>
                ${legendMarkup}
                <div class="dm-dashboard__summary" data-role="table-summary"></div>
                <div class="dm-dashboard__table-wrapper">
                    <table class="dm-dashboard__table" role="table">
                        <thead>
                            <tr role="row">
                                <th scope="col">Typ</th>
                                <th scope="col">Názov</th>
                                <th scope="col">Označenie</th>
                                <th scope="col">Rozloha</th>
                                <th scope="col">Cena</th>
                                <th scope="col">Prenájom</th>
                                <th scope="col">Stav</th>
                            </tr>
                        </thead>
                        <tbody data-role="table-body"></tbody>
                    </table>
                </div>
            </div>
        `;

        createTableController({
            root: section,
            rows: resolvedRows,
            statuses: resolvedStatuses,
        });

        ensureDashboardStackObserver(section);

        return section;
    };

    const renderLocationTables = ({
        root,
        project,
        linkedProjects,
        hierarchyProjects,
        preferences,
        statuses,
        accentColor,
        accentRgb,
    }) => {
        if (!root || !preferences?.enabled) {
            return;
        }
        const scope = preferences.scope === 'hierarchy' ? 'hierarchy' : 'current';
        const baseStatuses = Array.isArray(project?.palette?.statuses) ? project.palette.statuses : statuses;

        if (scope === 'hierarchy') {


            const getProjectId = (entry) =>
                String(entry?.id ?? entry?.projectId ?? entry?.uuid ?? entry?.shortcode ?? entry?.publicKey ?? '')
                    .trim()
                    .toLowerCase();

            const currentProjectId = getProjectId(project);

            const combined = [
                ...(Array.isArray(hierarchyProjects) ? hierarchyProjects : []),
                ...(Array.isArray(linkedProjects) ? linkedProjects : []),
            ].filter((entry) => entry && typeof entry === 'object');

            const unique = [];
            const seen = new Set();
            combined.forEach((entry) => {
                const id = getProjectId(entry);
                if (!id) {
                    unique.push(entry);
                    return;
                }
                if (seen.has(id)) {
                    return;
                }
                seen.add(id);
                unique.push(entry);
            });

            const relatedMaps = unique.filter((entry) => {
                const id = getProjectId(entry);
                if (!id || !currentProjectId) {
                    return entry !== project;
                }
                return id !== currentProjectId;
            });

            const rows = buildHierarchyRows(project, relatedMaps);
            const mergedStatuses = mergeStatuses(
                baseStatuses,
                ...relatedMaps.map((entry) =>
                    Array.isArray(entry?.palette?.statuses) ? entry.palette.statuses : [],
                ),
            );

            const tableEl = createMapTableElement({
                map: project,
                statuses: mergedStatuses,
                isCurrent: true,
                rows,
            });
            if (!tableEl) {
                root.remove();
                return;
            }
            if (accentColor) {
                tableEl.style.setProperty('--dm-accent', accentColor);
            }
            if (accentRgb) {
                tableEl.style.setProperty('--dm-accent-rgb', accentRgb);
            }
            root.appendChild(tableEl);
            return;
        }

        const tableEl = createMapTableElement({
            map: project,
            statuses: baseStatuses,
            isCurrent: true,
        });
        if (!tableEl) {
            root.remove();
            return;
        }
        if (accentColor) {
            tableEl.style.setProperty('--dm-accent', accentColor);
        }
        if (accentRgb) {
            tableEl.style.setProperty('--dm-accent-rgb', accentRgb);
        }
        root.appendChild(tableEl);
    };

    async function renderMap(container) {
        const key = container.dataset.dmMapKey;
        if (!key) {
            container.innerHTML = '<p class="dm-map-viewer__error">Chýba identifikátor mapy.</p>';
            return;
        }

        container.classList.add('dm-map-viewer');
        container.innerHTML = '<p class="dm-map-viewer__loading">Načítavam mapu…</p>';

        ensureStyles();

        try {
            // Pokús sa o štandardný REST API endpoint
            let response = await fetch(withCacheBusting(`${endpoint}?public_key=${encodeURIComponent(key)}`), {
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Cache-Control': 'no-cache',
                },
                cache: 'no-store',
            });

            // Ak zlyhá (404 = REST API endpoint neexistuje), skús alternatívny endpoint
            if (!response.ok && response.status === 404) {
                console.warn('[Developer Map] Standard REST API endpoint failed, trying alternative endpoint...');
                const pluginUrl = window.location.origin + '/wp-content/plugins/developer-map';
                const alternativeUrl = `${pluginUrl}/get-project.php?public_key=${encodeURIComponent(key)}`;

                response = await fetch(withCacheBusting(alternativeUrl), {
                    credentials: 'same-origin',
                    headers: {
                        Accept: 'application/json',
                        'Cache-Control': 'no-cache',
                    },
                    cache: 'no-store',
                });
            }

            if (!response.ok) {
                throw new Error(`Request failed with status ${response.status}`);
            }

            const payload = await response.json();
            const project = payload?.project;
            const ancestors = Array.isArray(payload?.ancestors) ? payload.ancestors : [];
            const linkedProjects = Array.isArray(payload?.linkedProjects) ? payload.linkedProjects : [];
            const hierarchyProjects = Array.isArray(payload?.hierarchyProjects) ? payload.hierarchyProjects : [];

            if (!project || typeof project !== 'object') {
                throw new Error('Missing project payload');
            }

            const title = project.name ?? project.title ?? key;
            const description = project.description ?? '';
            const floors = Array.isArray(project.floors) ? project.floors : [];

            // Poskladaj kandidátov na URL obrázka v poradí preferencie
            const imageCandidates = [
                project.image,
                project.imageUrl,
                project.imageurl,
                project.img,
                project?.media?.image,
                project?.media?.heroImage,
            ];

            let imageUrl = '';

            for (const candidate of imageCandidates) {
                if (!candidate) {
                    continue;
                }
                if (typeof candidate === 'string') {
                    const trimmed = candidate.trim();
                    if (trimmed.length > 0) {
                        imageUrl = trimmed;
                        break;
                    }
                    continue;
                }
                if (typeof candidate === 'object') {
                    const nested = candidate.url ?? candidate.src ?? candidate.href ?? candidate.link ?? '';
                    if (typeof nested === 'string' && nested.trim().length > 0) {
                        imageUrl = nested.trim();
                        break;
                    }
                }
            }

            // Debug výpis do konzoly pre chýbajúci obrázok
            if (!imageUrl) {
                console.warn('[Developer Map] Missing image URL for project:', key);
                console.log('[Developer Map] Project data:', project);
            }

            const rendererOptions = project.renderer ?? {};
            const viewbox = rendererOptions.size ?? { width: 1280, height: 720 };
            const regions = Array.isArray(project.regions) ? project.regions : [];
            const statuses = Array.isArray(project?.palette?.statuses) ? project.palette.statuses : [];
            const tablePreferences = resolveTablePreferences(container, project);

            // Apply frontend accent color from API response
            const accentColor = payload?.frontendAccentColor ?? '#4d38ff';
            const accentRgb = hexToRgb(accentColor);
            container.style.setProperty('--dm-accent', accentColor);
            container.style.setProperty('--dm-accent-rgb', accentRgb);

            const lookupStatus = (statusId) => {
                const sought = String(statusId ?? '').trim();
                if (!sought) return null;
                return (
                    statuses.find((status) => String(status.key) === sought) ||
                    statuses.find((status) => String(status.id ?? '') === sought) ||
                    null
                );
            };

            const baseWidth = viewbox.width || 1280;
            const baseHeight = viewbox.height || 720;

            const polygonsMarkup = regions
                .map((region) => {
                    const points = Array.isArray(region?.geometry?.points) ? region.geometry.points : [];
                    if (points.length < 3) {
                        return '';
                    }
                    const status = lookupStatus(region.statusId ?? region.status);
                    const statusLabel = status?.label ?? region.statusLabel ?? '';
                    const color = status?.color ?? '#6366f1';
                    const pointsAttr = points
                        .map(([x, y]) => {
                            const px = Number(x) * baseWidth;
                            const py = Number(y) * baseHeight;
                            return `${px},${py}`;
                        })
                        .join(' ');
                    return `
                        <polygon
                            class="dm-map-viewer__region"
                            data-region-id="${escapeHtml(region.id)}"
                            points="${escapeHtml(pointsAttr)}"
                            style="--dm-region-color:${escapeHtml(color)}"
                            tabindex="0"
                        ></polygon>
                    `;
                })
                .join('');

            // Zobraz iba interaktívny obrázok bez zoznamu lokalít
            container.innerHTML = `
                ${!tablePreferences.tableOnly ? `<div class="dm-map-viewer__surface">
                    ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" class="dm-map-viewer__image" />` : '<p class="dm-map-viewer__error">Chýba obrázok mapy. Nahrajte obrázok v administrácii.</p>'}
                    ${imageUrl ? `<svg class="dm-map-viewer__overlay" viewBox="0 0 ${escapeHtml(String(baseWidth))} ${escapeHtml(String(baseHeight))}" aria-hidden="true">
                        <g class="dm-map-viewer__regions">${polygonsMarkup}</g>
                    </svg>` : ''}
                </div>` : ''}
                ${tablePreferences.enabled ? '<div class="dm-map-viewer__tables" data-role="dm-map-tables"></div>' : ''}
            `;

            const surface = container.querySelector('.dm-map-viewer__surface');
            const overlay = container.querySelector('.dm-map-viewer__overlay');
            const surfaceImage = container.querySelector('.dm-map-viewer__image');

            if (tablePreferences.enabled) {
                const tableRoot = container.querySelector('[data-role="dm-map-tables"]');
                if (tableRoot) {
                    renderLocationTables({
                        root: tableRoot,
                        project,
                        linkedProjects,
                        hierarchyProjects,
                        preferences: tablePreferences,
                        statuses,
                        accentColor,
                        accentRgb,
                    });
                }
            }

            if (tablePreferences.tableOnly) {
                // Ak je zapnutý režim "iba tabuľka", preskoč inicializáciu mapy
                return;
            }

            if (!surface || !overlay) {
                console.warn('[Developer Map] Rendering surface missing for map viewer.');
                return;
            }
            const regionElements = Array.from(container.querySelectorAll('.dm-map-viewer__region'));

            const sanitiseId = (value) => String(value ?? '').trim();

            const parseRegionChildKey = (value) => {
                if (value && typeof value === 'object') {
                    const rawId = value.id ?? value.target ?? value.value ?? value.uuid;
                    const id = sanitiseId(rawId);
                    if (!id) {
                        return null;
                    }
                    const rawType = String(value.type ?? value.kind ?? value.nodeType ?? value.node_type ?? '').toLowerCase();
                    const type = rawType === 'map' || rawType === 'project' ? 'map' : 'location';
                    return {
                        type,
                        id,
                        key: type === 'map' ? `map:${id}` : `location:${id}`,
                    };
                }
                const raw = sanitiseId(value);
                if (!raw) {
                    return null;
                }
                const colonIndex = raw.indexOf(':');
                if (colonIndex <= 0) {
                    return { type: 'location', key: raw, id: raw };
                }
                const prefix = raw.slice(0, colonIndex).toLowerCase();
                const remainder = sanitiseId(raw.slice(colonIndex + 1));
                if (!remainder) {
                    return null;
                }
                if (prefix === 'map' || prefix === 'project') {
                    return { type: 'map', key: raw, id: remainder };
                }
                return { type: 'location', key: raw, id: remainder };
            };

            const projectRegistry = new Map();
            const registerProjectNode = (candidate) => {
                if (!candidate || typeof candidate !== 'object') {
                    return;
                }
                if (!Array.isArray(candidate.floors)) {
                    return;
                }
                const projectIdCandidate = sanitiseId(
                    candidate.id ?? candidate.projectId ?? candidate.uuid ?? candidate.shortcode ?? '',
                );
                if (!projectIdCandidate || projectRegistry.has(projectIdCandidate)) {
                    return;
                }
                projectRegistry.set(projectIdCandidate, candidate);
            };

            const rootProjectId = sanitiseId(
                project.id ?? project.projectId ?? project.uuid ?? project.shortcode ?? '',
            );
            if (rootProjectId) {
                registerProjectNode(project);
            }

            const visitedPayloadNodes = new WeakSet();
            const traversePayload = (value) => {
                if (!value || typeof value !== 'object') {
                    return;
                }
                if (visitedPayloadNodes.has(value)) {
                    return;
                }
                visitedPayloadNodes.add(value);
                if (Array.isArray(value)) {
                    value.forEach(traversePayload);
                    return;
                }
                registerProjectNode(value);
                Object.keys(value).forEach((key) => {
                    traversePayload(value[key]);
                });
            };
            traversePayload(project);

            linkedProjects.forEach((linkedProject) => {
                traversePayload(linkedProject);
            });

            if (rootProjectId && !projectRegistry.has(rootProjectId)) {
                projectRegistry.set(rootProjectId, project);
            }

            const mapChildrenByProjectId = new Map();
            projectRegistry.forEach((projectNode, projectId) => {
                const regionsList = Array.isArray(projectNode?.regions) ? projectNode.regions : [];
                regionsList.forEach((region) => {
                    const rawChildren = Array.isArray(region?.children) ? region.children : [];
                    rawChildren.forEach((child) => {
                        const parsed = parseRegionChildKey(child);
                        if (!parsed || parsed.type !== 'map' || !parsed.id) {
                            return;
                        }
                        const childId = sanitiseId(parsed.id);
                        if (!childId || childId === projectId) {
                            return;
                        }
                        if (!mapChildrenByProjectId.has(projectId)) {
                            mapChildrenByProjectId.set(projectId, new Set());
                        }
                        mapChildrenByProjectId.get(projectId).add(childId);
                    });
                });
            });

            const floorById = new Map();
            const registerFloorKeys = (floor, rawKeys, ownerId) => {
                if (!floor || typeof floor !== 'object') {
                    return;
                }
                const keys = rawKeys
                    .filter((candidate) => candidate !== null && candidate !== undefined)
                    .map((candidate) => sanitiseId(candidate))
                    .filter(Boolean);
                if (!keys.length) {
                    return;
                }
                const ownerKey = sanitiseId(ownerId);
                const storedFloor = (() => {
                    const clone = { ...floor };
                    if (ownerKey) {
                        clone.__dmOwnerMapId = ownerKey;
                    }
                    return clone;
                })();
                keys.forEach((key) => {
                    if (!floorById.has(key)) {
                        floorById.set(key, storedFloor);
                    }
                    if (!key.includes(':')) {
                        const prefixed = `location:${key}`;
                        if (!floorById.has(prefixed)) {
                            floorById.set(prefixed, storedFloor);
                        }
                    }
                });
            };

            const registerProjectFloors = (projectNode, projectId) => {
                const floorsList = Array.isArray(projectNode?.floors) ? projectNode.floors : [];
                floorsList.forEach((floor) => {
                    registerFloorKeys(floor, [
                        floor?.id,
                        floor?.floorId,
                        floor?.uuid,
                        floor?.slug,
                        floor?.shortcode,
                        floor?.code,
                        floor?.identifier,
                        floor?.externalId,
                        floor?.externalID,
                        floor?.meta?.id,
                        floor?.meta?.floorId,
                        floor?.meta?.uuid,
                        floor?.meta?.slug,
                        floor?.meta?.shortcode,
                        floor?.meta?.identifier,
                    ], projectId);
                });
            };

            if (rootProjectId) {
                registerProjectFloors(project, rootProjectId);
            } else {
                registerProjectFloors(project, '');
            }
            projectRegistry.forEach((projectNode, projectId) => {
                if (projectNode === project && projectId === rootProjectId) {
                    return;
                }
                registerProjectFloors(projectNode, projectId);
            });

            const wrapFloorForOwner = (floor, ownerId) => {
                if (!floor || typeof floor !== 'object') {
                    return null;
                }
                const canonicalKey = sanitiseId(
                    floor.id ??
                    floor.floorId ??
                    floor.uuid ??
                    floor.slug ??
                    floor.shortcode ??
                    floor.identifier ??
                    floor.externalId ??
                    floor.externalID ??
                    '',
                );
                if (canonicalKey && floorById.has(canonicalKey)) {
                    return floorById.get(canonicalKey);
                }
                if (canonicalKey && floorById.has(`location:${canonicalKey}`)) {
                    return floorById.get(`location:${canonicalKey}`);
                }
                const clone = { ...floor };
                const ownerKey = sanitiseId(ownerId);
                if (ownerKey) {
                    clone.__dmOwnerMapId = ownerKey;
                }
                return clone;
            };

            const aggregateFloorCache = new Map();
            const collectProjectFloors = (projectId, stack = new Set()) => {
                const normalisedId = sanitiseId(projectId);
                if (!normalisedId) {
                    return [];
                }
                if (aggregateFloorCache.has(normalisedId)) {
                    return aggregateFloorCache.get(normalisedId);
                }
                if (stack.has(normalisedId)) {
                    return [];
                }
                stack.add(normalisedId);
                const projectNode = projectRegistry.get(normalisedId);
                if (!projectNode) {
                    stack.delete(normalisedId);
                    aggregateFloorCache.set(normalisedId, []);
                    return [];
                }
                const aggregate = [];
                const floorsList = Array.isArray(projectNode?.floors) ? projectNode.floors : [];
                floorsList.forEach((floor) => {
                    const wrapped = wrapFloorForOwner(floor, normalisedId);
                    if (wrapped) {
                        aggregate.push(wrapped);
                    }
                });
                const childSet = mapChildrenByProjectId.get(normalisedId);
                if (childSet) {
                    childSet.forEach((childId) => {
                        const descendantFloors = collectProjectFloors(childId, stack);
                        if (descendantFloors.length) {
                            aggregate.push(...descendantFloors);
                        }
                    });
                }
                stack.delete(normalisedId);
                aggregateFloorCache.set(normalisedId, aggregate);
                return aggregate;
            };

            const projectRegionEntryCache = new Map();
            const collectProjectRegionEntries = (projectId, stack = new Set()) => {
                const normalisedId = sanitiseId(projectId);
                if (!normalisedId) {
                    return [];
                }
                if (projectRegionEntryCache.has(normalisedId)) {
                    return projectRegionEntryCache.get(normalisedId);
                }
                if (stack.has(normalisedId)) {
                    return [];
                }
                stack.add(normalisedId);
                const projectNode = projectRegistry.get(normalisedId);
                if (!projectNode) {
                    stack.delete(normalisedId);
                    projectRegionEntryCache.set(normalisedId, []);
                    return [];
                }

                const entries = [];
                const regionsList = Array.isArray(projectNode?.regions) ? projectNode.regions : [];
                regionsList.forEach((region, index) => {
                    if (!region || typeof region !== 'object') {
                        return;
                    }

                    const children = Array.isArray(region.children) ? region.children : [];
                    let hasLocationChild = false;
                    children.forEach((childValue) => {
                        const parsedChild = parseRegionChildKey(childValue);
                        if (!parsedChild) {
                            return;
                        }
                        if (parsedChild.type === 'map' && parsedChild.id) {
                            const descendant = collectProjectRegionEntries(parsedChild.id, stack);
                            if (descendant.length) {
                                descendant.forEach((item) => entries.push(item));
                            }
                        }
                        if (parsedChild.type === 'location') {
                            hasLocationChild = true;
                        }
                    });

                    const statusIdCandidate = sanitiseId(
                        region.statusId ??
                        region.status ??
                        region.paletteStatus ??
                        region.meta?.status ??
                        region.meta?.statusId ??
                        region.meta?.paletteStatus ??
                        '',
                    );
                    const labelCandidateRaw =
                        region.statusLabel ??
                        region.label ??
                        region.name ??
                        region.meta?.statusLabel ??
                        region.meta?.label ??
                        '';
                    const labelCandidate = String(labelCandidateRaw ?? '').trim();
                    const colorCandidate =
                        region.statusColor ??
                        region.color ??
                        region.meta?.statusColor ??
                        region.meta?.color ??
                        '';

                    const hasStatusInfo = Boolean(
                        statusIdCandidate ||
                        (typeof region.status === 'string' && region.status.trim() !== '') ||
                        labelCandidate,
                    );

                    if (!hasStatusInfo) {
                        return;
                    }

                    const pseudoIdBase = region.id ? String(region.id) : `index-${index}`;
                    const pseudoFloor = {
                        id: `region:${normalisedId}:${pseudoIdBase}`,
                        statusId: statusIdCandidate || region.status || region.statusLabel || '',
                        status: region.status ?? '',
                        statusLabel: labelCandidate || statusIdCandidate || region.label || '',
                        statusColor: colorCandidate,
                        __dmOwnerMapId: normalisedId,
                    };

                    // If region has explicit location children, prefer child data when present.
                    if (!hasLocationChild) {
                        entries.push(pseudoFloor);
                    } else if (!children.length) {
                        entries.push(pseudoFloor);
                    }
                });

                stack.delete(normalisedId);
                projectRegionEntryCache.set(normalisedId, entries);
                return entries;
            };

            const regionById = new Map();
            regions.forEach((region) => {
                if (!region || region.id === undefined || region.id === null) {
                    return;
                }
                regionById.set(String(region.id), region);
            });

            const popover = document.createElement('div');
            popover.className = 'dm-map-viewer__popover';
            popover.innerHTML = `
                <div class="dm-map-viewer__popover-card">
                    <div class="dm-map-viewer__popover-summary" data-role="summary"></div>
                    <ul class="dm-map-viewer__popover-list" data-role="list"></ul>
                    <div class="dm-map-viewer__popover-empty" data-role="empty"></div>
                    <button type="button" class="dm-map-viewer__popover-cta" data-role="cta">Detail</button>
                </div>
            `;
            surface.appendChild(popover);
            const summaryEl = popover.querySelector('[data-role="summary"]');
            const listEl = popover.querySelector('[data-role="list"]');
            const emptyEl = popover.querySelector('[data-role="empty"]');
            const ctaButton = popover.querySelector('[data-role="cta"]');
            listEl.hidden = true;
            emptyEl.hidden = true;
            let activeRegionId = null;

            const normaliseLabel = (value) => {
                const str = String(value ?? '').trim().toLowerCase();
                if (!str) {
                    return '';
                }
                let normalised = str;
                try {
                    normalised = str.normalize('NFD');
                } catch (error) {
                    normalised = str;
                }
                return normalised.replace(/[\u0300-\u036f]/g, '');
            };

            const parseAvailability = (statusInfo, statusIdRaw, label) => {
                const explicit = statusInfo?.available;
                if (typeof explicit === 'boolean') {
                    return explicit;
                }
                if (typeof explicit === 'string') {
                    const value = explicit.trim().toLowerCase();
                    if (['true', '1', 'yes', 'ano'].includes(value)) {
                        return true;
                    }
                    if (['false', '0', 'no', 'nie'].includes(value)) {
                        return false;
                    }
                }
                const labelNormalized = normaliseLabel(label);
                const keyNormalized = normaliseLabel(statusInfo?.key ?? statusIdRaw);
                return AVAILABLE_KEYWORDS.some(
                    (keyword) =>
                        labelNormalized.includes(keyword) ||
                        (keyNormalized ? keyNormalized.includes(keyword) : false),
                );
            };

            const summariseRegion = (region) => {
                const children = Array.isArray(region?.children) ? region.children : [];
                const entriesMap = new Map();
                const linkedFloors = [];
                const seenFloorKeys = new Set();
                const seenFloorObjects = new WeakSet();
                let availableCount = 0;

                const addFloorToSummary = (floor, fallbackKey) => {
                    if (!floor || typeof floor !== 'object') {
                        return;
                    }

                    const fallback = sanitiseId(fallbackKey);
                    const candidateKeys = [
                        floor?.id,
                        floor?.floorId,
                        floor?.uuid,
                        floor?.slug,
                        floor?.shortcode,
                        floor?.identifier,
                        floor?.externalId,
                        floor?.externalID,
                        floor?.locationId,
                        floor?.location?.id,
                        floor?.meta?.id,
                        floor?.meta?.floorId,
                        floor?.meta?.uuid,
                        floor?.meta?.slug,
                        floor?.meta?.shortcode,
                        floor?.meta?.identifier,
                    ]
                        .map((candidate) => sanitiseId(candidate))
                        .filter(Boolean);

                    if (fallback && !fallback.toLowerCase().startsWith('map:')) {
                        candidateKeys.push(fallback);
                    }

                    const uniqueCandidates = Array.from(new Set(candidateKeys));

                    if (uniqueCandidates.length) {
                        const dedupeVariants = uniqueCandidates.map((candidate) =>
                            candidate.includes(':') ? candidate : `location:${candidate}`,
                        );
                        if (dedupeVariants.some((variant) => seenFloorKeys.has(variant))) {
                            return;
                        }
                        dedupeVariants.forEach((variant) => seenFloorKeys.add(variant));
                    } else if (seenFloorObjects.has(floor)) {
                        return;
                    }

                    if (seenFloorObjects.has(floor)) {
                        return;
                    }
                    seenFloorObjects.add(floor);

                    linkedFloors.push(floor);

                    const statusIdRaw = sanitiseId(floor.statusId ?? floor.status ?? '');
                    const statusInfo = lookupStatus(statusIdRaw);
                    const label =
                        statusInfo?.label ??
                        floor.statusLabel ??
                        (statusIdRaw || 'Bez stavu');
                    const key = (statusInfo?.id ?? statusInfo?.key ?? statusIdRaw) || label;
                    const color = statusInfo?.color ?? floor.statusColor ?? '#6366f1';
                    const normalisedLabel = normaliseLabel(label);
                    const entry =
                        entriesMap.get(key) ?? {
                            label,
                            color,
                            count: 0,
                            normalisedLabel,
                            isAvailable: false,
                            isReserved: false,
                            isSold: false,
                        };
                    entry.count += 1;
                    if (color) {
                        entry.color = color;
                    }
                    entry.normalisedLabel = normalisedLabel || entry.normalisedLabel;
                    const isAvailable = parseAvailability(statusInfo, statusIdRaw, label);
                    if (isAvailable) {
                        availableCount += 1;
                        entry.isAvailable = true;
                    }
                    if (normalisedLabel.includes('rezerv')) {
                        entry.isReserved = true;
                    }
                    if (normalisedLabel.includes('predan')) {
                        entry.isSold = true;
                    }
                    entriesMap.set(key, entry);
                };

                children.forEach((childValue) => {
                    const parsed = parseRegionChildKey(childValue);
                    if (!parsed) {
                        return;
                    }
                    if (parsed.type === 'map' && parsed.id) {
                        const descendantFloors = collectProjectFloors(parsed.id);
                        if (descendantFloors.length) {
                            descendantFloors.forEach((floor) => addFloorToSummary(floor, parsed.key));
                        } else {
                            const derivedRegionEntries = collectProjectRegionEntries(parsed.id);
                            derivedRegionEntries.forEach((pseudoFloor) => addFloorToSummary(pseudoFloor, parsed.key));
                        }
                        return;
                    }
                    if (parsed.type !== 'location') {
                        return;
                    }

                    const candidateKeys = [];
                    if (parsed.key) {
                        candidateKeys.push(parsed.key);
                    }
                    if (parsed.id) {
                        candidateKeys.push(parsed.id);
                        if (!parsed.id.includes(':')) {
                            candidateKeys.push(`location:${parsed.id}`);
                        }
                    }

                    let floor = null;
                    for (const candidate of candidateKeys) {
                        const lookupKey = sanitiseId(candidate);
                        if (!lookupKey) {
                            continue;
                        }
                        floor = floorById.get(lookupKey);
                        if (floor) {
                            break;
                        }
                    }
                    if (!floor) {
                        return;
                    }
                    addFloorToSummary(floor, parsed.key ?? parsed.id);
                });

                const entries = Array.from(entriesMap.values()).sort((a, b) => b.count - a.count);
                return { entries, linkedFloors, availableCount };
            };

            const baseFillColor = '#3f4cff';
            const positiveFillColor = '#1f8b4e';
            const reservedFillColor = '#f97316';
            const negativeFillColor = '#c53030';
            const neutralFillColor = '#4a5568'; // Stronger gray-blue for "pripravujeme"
            const idleAlpha = 0.45;
            const hoverAlpha = 0.68;
            const selectedAlpha = 0.68; // Same as hover - not too strong
            const idleStrokeAlpha = 0.6;
            const hoverStrokeAlpha = 0.8;
            const selectedStrokeAlpha = 0.8; // Same as hover
            const idleOpacity = 0.55;
            const hoverOpacity = 0.75;
            const selectedOpacity = 0.75; // Same as hover
            const headlinePreparingColor = '#4a5568'; // Match the fill color
            const headlineDefaultColor = '#1c134f';

            const sanitiseColorValue = (value, fallback) => {
                const raw = String(value ?? '').trim();
                if (!raw) {
                    return fallback;
                }
                const lower = raw.toLowerCase();
                if (lower.startsWith('var(') || lower.startsWith('rgb(') || lower.startsWith('rgba(') || lower.startsWith('hsl(') || lower.startsWith('hsla(')) {
                    return raw;
                }
                if (lower.startsWith('#')) {
                    const trimmed = lower.replace(/[^0-9a-f]/g, '');
                    if (trimmed.length === 3 || trimmed.length === 4 || trimmed.length === 6 || trimmed.length === 8) {
                        return `#${trimmed}`;
                    }
                    return fallback;
                }
                const hexCandidate = lower.replace(/[^0-9a-f]/g, '');
                if (hexCandidate.length === 3 || hexCandidate.length === 6 || hexCandidate.length === 8) {
                    return `#${hexCandidate}`;
                }
                return fallback;
            };

            const resolveRegionState = (summary) => {
                const emptyState = {
                    state: 'preparing',
                    headline: 'Pripravujeme',
                    headlineColor: headlinePreparingColor,
                    fillColor: neutralFillColor,
                    alphaBoost: 0.18, // Make "pripravujeme" more visible
                    strokeBoost: 0.15,
                    opacityBoost: 0.20,
                };

                if (!summary || !Array.isArray(summary.entries) || summary.entries.length === 0) {
                    return emptyState;
                }

                const primaryEntry = summary.entries[0] ?? null;
                const availableEntry = summary.entries.find((entry) => entry.isAvailable);
                const reservedEntry = summary.entries.find((entry) => entry.isReserved);
                const soldEntry = summary.entries.find((entry) => entry.isSold);

                if (availableEntry) {
                    const color = sanitiseColorValue(availableEntry.color, positiveFillColor);
                    const headline = availableEntry.label || 'Dostupné';
                    return {
                        state: 'available',
                        headline,
                        headlineColor: color,
                        fillColor: color,
                        alphaBoost: 0.08,
                        strokeBoost: 0.08,
                        opacityBoost: 0.08,
                    };
                }
                if (reservedEntry) {
                    const color = sanitiseColorValue(reservedEntry.color, reservedFillColor);
                    const headline = reservedEntry.label || 'Rezervované';
                    return {
                        state: 'reserved',
                        headline,
                        headlineColor: color,
                        fillColor: color,
                        alphaBoost: 0.06,
                        strokeBoost: 0.06,
                        opacityBoost: 0.06,
                    };
                }
                if (soldEntry) {
                    const color = sanitiseColorValue(soldEntry.color, negativeFillColor);
                    const headline = soldEntry.label || 'Predané';
                    return {
                        state: 'sold',
                        headline,
                        headlineColor: color,
                        fillColor: color,
                        alphaBoost: 0.06,
                        strokeBoost: 0.06,
                        opacityBoost: 0.06,
                    };
                }
                if (primaryEntry && primaryEntry.label) {
                    const color = sanitiseColorValue(primaryEntry.color, neutralFillColor);
                    return {
                        state: 'custom',
                        headline: primaryEntry.label,
                        headlineColor: color,
                        fillColor: color,
                        alphaBoost: 0.14,
                        strokeBoost: 0.12,
                        opacityBoost: 0.12,
                    };
                }
                return emptyState;
            };

            const applyRegionFill = (polygon, summary) => {
                if (!polygon) {
                    return;
                }
                const {
                    state,
                    fillColor = baseFillColor,
                    alphaBoost = 0,
                    strokeBoost = 0,
                    opacityBoost = 0,
                } = resolveRegionState(summary);
                const color = fillColor || baseFillColor;

                const isSelected = polygon.dataset.dmSelected === 'true';
                const isHover = polygon.dataset.dmHover === 'true';
                const alphaBase = isSelected ? selectedAlpha : isHover ? hoverAlpha : idleAlpha;
                const strokeBase = isSelected ? selectedStrokeAlpha : isHover ? hoverStrokeAlpha : idleStrokeAlpha;
                const opacityBase = isSelected ? selectedOpacity : isHover ? hoverOpacity : idleOpacity;
                const alpha = clamp(alphaBase + alphaBoost, 0, 1);
                const strokeAlpha = clamp(strokeBase + strokeBoost, 0, 1);
                const opacity = clamp(opacityBase + opacityBoost, 0, 1);

                polygon.style.fill = toRgba(color, alpha);
                polygon.style.stroke = toRgba(color, strokeAlpha);
                polygon.style.strokeWidth = '1';
                polygon.style.strokeLinejoin = 'round';
                polygon.style.strokeLinecap = 'round';
                polygon.style.paintOrder = 'fill stroke';
                polygon.style.vectorEffect = 'non-scaling-stroke';
                polygon.style.opacity = String(opacity);
                switch (state) {
                    case 'available':
                        polygon.dataset.dmAvailability = 'available';
                        break;
                    case 'reserved':
                        polygon.dataset.dmAvailability = 'reserved';
                        break;
                    case 'sold':
                        polygon.dataset.dmAvailability = 'unavailable';
                        break;
                    case 'custom':
                        polygon.dataset.dmAvailability = 'custom';
                        break;
                    default:
                        polygon.dataset.dmAvailability = 'empty';
                        break;
                }
                polygon.dataset.dmStatusState = state;
                polygon.dataset.dmStatusColor = color;
            };

            const renderPopover = (region, summary) => {
                const { headline, headlineColor } = resolveRegionState(summary);
                const tone = headlineColor || headlineDefaultColor;
                summaryEl.innerHTML = `<strong style="color:${escapeHtml(tone)}">${escapeHtml(headline)}</strong>`;
                listEl.hidden = true;
                listEl.innerHTML = '';
                emptyEl.hidden = true;
                emptyEl.textContent = '';
            };

            const positionPopover = (polygon) => {
                if (!overlay || !surface || popover.style.display === 'none') {
                    return;
                }
                const bbox = polygon.getBBox();
                const overlayRect = overlay.getBoundingClientRect();
                const surfaceRect = surface.getBoundingClientRect();
                const scaleX = overlayRect.width / baseWidth;
                const scaleY = overlayRect.height / baseHeight;
                const centerX = (bbox.x + bbox.width / 2) * scaleX;
                const topY = bbox.y * scaleY;

                const cardRect = popover.getBoundingClientRect();
                let left = centerX - cardRect.width / 2;
                let top = topY - cardRect.height - 16;
                if (top < 8) {
                    top = (bbox.y + bbox.height) * scaleY + 16;
                }
                left = Math.max(8, Math.min(left, surfaceRect.width - cardRect.width - 8));
                top = Math.max(8, Math.min(top, surfaceRect.height - cardRect.height - 8));
                popover.style.left = `${left}px`;
                popover.style.top = `${top}px`;
            };

            const hidePopover = () => {
                if (!activeRegionId) {
                    return;
                }
                activeRegionId = null;
                popover.style.display = 'none';
                popover.classList.remove('is-visible');
                summaryEl.textContent = '';
                listEl.innerHTML = '';
                listEl.hidden = true;
                emptyEl.textContent = '';
                emptyEl.hidden = true;
                ctaButton.hidden = true;
                ctaButton.onclick = null;
                regionElements.forEach((polygon) => {
                    polygon.classList.remove('is-active');
                    polygon.dataset.dmSelected = 'false';
                    polygon.dataset.dmHover = 'false';
                    const region = regionById.get(polygon.getAttribute('data-region-id'));
                    const summary = region
                        ? summariseRegion(region)
                        : { entries: [], linkedFloors: [], availableCount: 0 };
                    applyRegionFill(polygon, summary);
                });
            };

            const showPopover = (region, polygon) => {
                const summary = summariseRegion(region);
                renderPopover(region, summary);

                const detailUrlCandidate = normaliseUrl(
                    region?.meta?.detailUrl ??
                    region?.meta?.url ??
                    region?.detailUrl ??
                    region?.url ??
                    (() => {
                        const withUrl = summary.linkedFloors.find((floor) => floor.detailUrl || floor.url);
                        const fallback = withUrl ? withUrl.detailUrl ?? withUrl.url : '';
                        return normaliseUrl(fallback);
                    })()
                );

                ctaButton.hidden = !detailUrlCandidate && !summary.linkedFloors.length;
                ctaButton.dataset.href = detailUrlCandidate || '';
                ctaButton.onclick = (event) => {
                    event.preventDefault();
                    const detailPayload = {
                        region,
                        floors: summary.linkedFloors,
                        project,
                        statuses,
                    };
                    const detailEvent = new CustomEvent('dmRegionDetail', {
                        detail: detailPayload,
                        cancelable: true,
                        bubbles: true,
                    });
                    const notCancelled = container.dispatchEvent(detailEvent);
                    if (notCancelled && detailUrlCandidate) {
                        window.location.href = detailUrlCandidate;
                    }
                };

                popover.style.display = 'block';
                popover.classList.add('is-visible');
                positionPopover(polygon);
                applyRegionFill(polygon, summary);
            };

            const openRegion = (polygon) => {
                const regionId = polygon.getAttribute('data-region-id');
                if (!regionId) {
                    return;
                }
                const region = regionById.get(regionId);
                if (!region) {
                    return;
                }
                if (activeRegionId === regionId) {
                    hidePopover();
                    return;
                }
                activeRegionId = regionId;
                regionElements.forEach((el) => {
                    const regionInstance = regionById.get(el.getAttribute('data-region-id'));
                    const isSelected = el === polygon;
                    el.dataset.dmSelected = isSelected ? 'true' : 'false';
                    if (!isSelected) {
                        el.dataset.dmHover = 'false';
                    }
                    if (isSelected) {
                        el.classList.add('is-active');
                    } else {
                        el.classList.remove('is-active');
                    }
                    const summary = regionInstance
                        ? summariseRegion(regionInstance)
                        : { entries: [], linkedFloors: [], availableCount: 0 };
                    applyRegionFill(el, summary);
                });
                showPopover(region, polygon);
            };

            regionElements.forEach((polygon) => {
                const region = regionById.get(polygon.getAttribute('data-region-id'));
                const summary = region
                    ? summariseRegion(region)
                    : { entries: [], linkedFloors: [], availableCount: 0 };
                polygon.dataset.dmSelected = 'false';
                polygon.dataset.dmHover = 'false';
                applyRegionFill(polygon, summary);

                polygon.addEventListener('mouseenter', () => {
                    polygon.dataset.dmHover = 'true';
                    polygon.classList.add('is-active');
                    const regionInstance = regionById.get(polygon.getAttribute('data-region-id'));
                    const summaryActive = regionInstance
                        ? summariseRegion(regionInstance)
                        : { entries: [], linkedFloors: [], availableCount: 0 };
                    applyRegionFill(polygon, summaryActive);
                });
                polygon.addEventListener('mouseleave', () => {
                    polygon.dataset.dmHover = 'false';
                    const isSelected = activeRegionId === polygon.getAttribute('data-region-id');
                    if (!isSelected) {
                        polygon.classList.remove('is-active');
                    }
                    const region = regionById.get(polygon.getAttribute('data-region-id'));
                    const summary = region
                        ? summariseRegion(region)
                        : { entries: [], linkedFloors: [], availableCount: 0 };
                    applyRegionFill(polygon, summary);
                });
                polygon.addEventListener('focus', () => {
                    polygon.dataset.dmHover = 'true';
                    polygon.classList.add('is-active');
                    const regionInstance = regionById.get(polygon.getAttribute('data-region-id'));
                    const summaryActive = regionInstance
                        ? summariseRegion(regionInstance)
                        : { entries: [], linkedFloors: [], availableCount: 0 };
                    applyRegionFill(polygon, summaryActive);
                });
                polygon.addEventListener('blur', () => {
                    polygon.dataset.dmHover = 'false';
                    const isSelected = activeRegionId === polygon.getAttribute('data-region-id');
                    if (!isSelected) {
                        polygon.classList.remove('is-active');
                    }
                    const region = regionById.get(polygon.getAttribute('data-region-id'));
                    const summary = region
                        ? summariseRegion(region)
                        : { entries: [], linkedFloors: [], availableCount: 0 };
                    applyRegionFill(polygon, summary);
                });
                polygon.addEventListener('click', (event) => {
                    event.preventDefault();
                    openRegion(polygon);
                });
                polygon.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openRegion(polygon);
                    } else if (event.key === 'Escape') {
                        hidePopover();
                    }
                });
            });

            const handleDocumentClick = (event) => {
                if (!container.contains(event.target)) {
                    hidePopover();
                    return;
                }
                if (
                    !event.target.closest('.dm-map-viewer__popover') &&
                    !event.target.closest('.dm-map-viewer__region')
                ) {
                    hidePopover();
                }
            };
            document.addEventListener('click', handleDocumentClick);
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    hidePopover();
                }
            });

            const updatePolygonPoints = (width, height) => {
                if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
                    return;
                }
                if (overlay) {
                    overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
                }
                regionElements.forEach((polygon) => {
                    const regionId = polygon.getAttribute('data-region-id');
                    const region = regionById.get(regionId);
                    if (!region) {
                        polygon.setAttribute('points', '');
                        applyRegionFill(polygon, { entries: [], linkedFloors: [], availableCount: 0 });
                        return;
                    }
                    const points = Array.isArray(region?.geometry?.points) ? region.geometry.points : [];
                    if (!points.length) {
                        polygon.setAttribute('points', '');
                        applyRegionFill(polygon, { entries: [], linkedFloors: [], availableCount: 0 });
                        return;
                    }
                    const attr = points
                        .map(([x, y]) => {
                            const px = Number(x) * width;
                            const py = Number(y) * height;
                            return `${px},${py}`;
                        })
                        .join(' ');
                    polygon.setAttribute('points', attr);
                    const summary = summariseRegion(region);
                    applyRegionFill(polygon, summary);
                });
                if (activeRegionId) {
                    const activePolygon = regionElements.find(
                        (el) => el.getAttribute('data-region-id') === activeRegionId,
                    );
                    if (activePolygon) {
                        positionPopover(activePolygon);
                    }
                }
            };

            updatePolygonPoints(baseWidth, baseHeight);

            const shouldSyncViewbox =
                !rendererOptions.size ||
                !Number(rendererOptions.size.width) ||
                !Number(rendererOptions.size.height);

            if (surfaceImage && shouldSyncViewbox) {
                const syncToImage = () => {
                    if (surfaceImage.naturalWidth > 0 && surfaceImage.naturalHeight > 0) {
                        updatePolygonPoints(surfaceImage.naturalWidth, surfaceImage.naturalHeight);
                        if (activeRegionId) {
                            const activePolygon = regionElements.find(
                                (el) => el.getAttribute('data-region-id') === activeRegionId,
                            );
                            if (activePolygon) {
                                positionPopover(activePolygon);
                            }
                        }
                    }
                };
                if (surfaceImage.complete) {
                    syncToImage();
                } else {
                    surfaceImage.addEventListener('load', syncToImage, { once: true });
                }
            }

            window.addEventListener('resize', () => {
                if (activeRegionId) {
                    const activePolygon = regionElements.find(
                        (el) => el.getAttribute('data-region-id') === activeRegionId,
                    );
                    if (activePolygon) {
                        positionPopover(activePolygon);
                    }
                }
            });
        } catch (error) {
            console.error('[Developer Map] Failed to load map', error);
            container.innerHTML =
                '<p class="dm-map-viewer__error">Mapa sa nepodarila načítať. Skúste to prosím neskôr.</p>';
        }
    }

    function hydrate() {
        const containers = document.querySelectorAll('[data-dm-map-key]');
        containers.forEach((container) => {
            if (container.dataset.dmMapHydrated === '1') {
                return;
            }
            container.dataset.dmMapHydrated = '1';

            const accentColor = container.dataset.dmAccentColor;
            if (accentColor) {
                container.style.setProperty('--dm-accent', accentColor);
                container.style.setProperty('--dm-accent-rgb', hexToRgb(accentColor));
            }

            void renderMap(container);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', hydrate, { once: true });
    } else {
        hydrate();
    }
})();
