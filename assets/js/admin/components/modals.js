const getModuleVersion = () => {
    try {
        const url = new URL(import.meta.url);
        const fromUrl = url.searchParams.get('ver');
        if (fromUrl) {
            return fromUrl;
        }
    } catch (error) {
        // ignore
    }

    return (typeof window !== 'undefined' && window.dmRuntimeConfig?.ver) || Date.now();
};

const ver = encodeURIComponent(String(getModuleVersion()));

const [{ DRAW_VIEWBOX }, { escapeHtml }] = await Promise.all([
    import(`../constants.js?ver=${ver}`),
    import(`../utils/html.js?ver=${ver}`),
]);

export { renderLocalitiesPopup };

function slugifyStatus(label) {
    if (!label) return 'unknown';
    return label
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-)|(-$)/g, '') || 'unknown';
}

function resolveRegionChildKey(child) {
    if (!child) {
        return '';
    }
    if (typeof child === 'object') {
        const rawId = child.id ?? child.target ?? child.value ?? child.uuid;
        const id = typeof rawId === 'string' ? rawId.trim() : String(rawId ?? '').trim();
        if (!id) {
            return '';
        }
        const rawType = String(child.type ?? child.kind ?? child.nodeType ?? child.node_type ?? '').toLowerCase();
        const type = rawType === 'map' || rawType === 'project' ? 'map' : 'location';
        return `${type}:${id}`;
    }
    const raw = String(child ?? '').trim();
    if (!raw) {
        return '';
    }
    const colonIndex = raw.indexOf(':');
    if (colonIndex > 0) {
        const prefix = raw.slice(0, colonIndex).toLowerCase();
        const id = raw.slice(colonIndex + 1).trim();
        if (!id) {
            return '';
        }
        const type = prefix === 'map' || prefix === 'project' ? 'map' : 'location';
        return `${type}:${id}`;
    }
    return `location:${raw}`;
}

export function renderModal(state, data) {
    if (!state.modal) return '';
    const { type, payload } = state.modal;
    switch (type) {
        case 'add-map':
            return renderFormModal('Pridať mapu', 'Pridať mapu', data, null, state.modal);
        case 'edit-map':
            return renderFormModal('Upraviť mapu', 'Uložiť zmeny', data, payload, state.modal);
        case 'delete-map':
            return renderConfirmModal(state);
        case 'draw-coordinates':
            return renderDrawModal(state, data);
        case 'add-location':
            return renderLocationModal('Pridať lokalitu', 'Pridať lokalitu', data, null, state.modal);
        case 'edit-location':
            return renderLocationModal('Upraviť lokalitu', 'Uložiť zmeny', data, payload, state.modal);
        case 'add-type':
            return renderTypeModal('Pridať typ', 'Pridať typ', data, null, state.modal);
        case 'edit-type':
            return renderTypeModal('Upraviť typ', 'Uložiť zmeny', data, payload, state.modal);
        case 'delete-type':
            return renderConfirmModal(state);
        case 'add-status':
            return renderStatusModal('Pridať stav', 'Pridať stav', data, null, state.modal);
        case 'edit-status':
            return renderStatusModal('Upraviť stav', 'Uložiť zmeny', data, payload, state.modal);
        case 'delete-status':
            return renderConfirmModal(state);
        case 'add-blueprint':
            return renderSimpleModal('Pridať pôdorys', renderSimpleForm('Názov pôdorysu'));
        case 'edit-color':
            return renderColorModal(data, payload);
        default:
            return renderSimpleModal('Info', `<p>Funkcia <strong>${escapeHtml(type)}</strong> je pripravená na implementáciu.</p>`);
    }
}

function renderFormModal(title, cta, data, itemId = null, modalState = null) {
    const plusIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-plus-icon lucide-circle-plus"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>';
    const infoIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info-icon lucide-info"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
    const arrowIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right-icon lucide-arrow-right"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';
    const isEdit = title === 'Upraviť mapu';
    const headerIcon = isEdit ? arrowIcon : plusIcon;

    // Zisti položku, ktorú upravujeme (project alebo floor)
    let editItem = null;
    let editParent = null;
    let editType = null;
    const projects = Array.isArray(data.projects) ? data.projects : [];

    if (itemId && projects.length) {
        editItem = projects.find((project) => project.id === itemId) ?? null;
        if (editItem) {
            editType = 'project';
        } else {
            for (const project of projects) {
                const floor = project.floors?.find((f) => f.id === itemId);
                if (floor) {
                    editItem = floor;
                    editParent = project;
                    editType = 'floor';
                    break;
                }
            }
        }
    }

    const imageSelection = modalState?.imageSelection ?? null;
    const selectedPreview = imageSelection?.url ?? modalState?.imagePreview ?? null;
    let imageUrl = selectedPreview || (editItem?.image ?? editItem?.imageUrl ?? null);
    if (!imageUrl && isEdit) {
        imageUrl = '';
    }

    const uploadLabel = isEdit ? 'Zmeniť obrázok' : 'Nahrať obrázok';

    // Use formData from modalState if available (after image selection), otherwise use editItem
    const formData = modalState?.formData ?? {};
    const resolvedName = formData.name ?? editItem?.name ?? '';
    const selectionId = imageSelection?.id ?? editItem?.image_id ?? '';
    const selectionAlt = imageSelection?.alt ?? editItem?.imageAlt ?? (resolvedName || '');

    const targetContext = modalState?.targetType ?? editType ?? 'project';
    const canChangeParent = !isEdit || targetContext === 'floor';
    const parentSelectAttrs = canChangeParent ? '' : ' disabled aria-disabled="true"';

    const resolvedParentValue = (() => {
        // Prioritize formData if available
        if (formData.parentId !== undefined) {
            return formData.parentId === null || formData.parentId === '' ? '' : String(formData.parentId);
        }
        const hasParentProp = modalState && Object.prototype.hasOwnProperty.call(modalState, 'parentId');
        if (hasParentProp) {
            const stateParent = modalState.parentId;
            if (stateParent === null || stateParent === undefined || stateParent === '') {
                return modalState?.type === 'add-map' ? '' : 'none';
            }
            return String(stateParent);
        }
        if (!isEdit) {
            return '';
        }
        if (editType === 'floor' && editParent) {
            return String(editParent.id);
        }
        return 'none';
    })();

    const parentOptions = projects
        .map((project) => {
            const value = String(project.id);
            const isSelected = resolvedParentValue === value;
            return `<option value="${escapeHtml(value)}"${isSelected ? ' selected' : ''}>${escapeHtml(project.name)}</option>`;
        })
        .join('');

    const placeholderSelected = resolvedParentValue === '' ? ' selected' : '';
    const noneSelected = resolvedParentValue === 'none' ? ' selected' : '';

    const typeOptionsSource = Array.isArray(data.types) ? data.types : [];
    const resolvedType = formData.type ?? editItem?.type ?? '';
    const resolvedTypeInList = resolvedType
        ? typeOptionsSource.some((option) => option.label === resolvedType)
        : false;
    const selectTypeValue = resolvedTypeInList ? resolvedType : '';
    const typePlaceholderSelected = selectTypeValue ? '' : ' selected';
    const typePlaceholderLabel = typeOptionsSource.length
        ? 'Vyberte typ'
        : 'Najprv pridajte typ v nastaveniach';

    const typeOptions = typeOptionsSource
        .map((option) => {
            const value = option.label;
            const isSelected = selectTypeValue === value;
            return `<option value="${escapeHtml(value)}"${isSelected ? ' selected' : ''}>${escapeHtml(option.label)}</option>`;
        })
        .join('');

    return `
        <div class="dm-modal-overlay">
            <div class="dm-modal dm-modal--map">
                <header class="dm-modal__header">
                    <div class="dm-modal__header-left">
                        ${headerIcon}
                        <h2>${title}</h2>
                    </div>
                    <button type="button" class="dm-modal__close" aria-label="Zavrieť" data-dm-close-modal>
                        <svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 25 25" fill="none">
                            <path fill-rule="evenodd" clip-rule="evenodd" d="M12.4841 15.5772L3.09313 24.9681L0 21.875L9.39094 12.4841L0 3.09313L3.09313 0L12.4841 9.39094L21.875 0L24.9681 3.09313L15.5772 12.4841L24.9681 21.875L21.875 24.9681L12.4841 15.5772Z" fill="#1C134F"/>
                        </svg>
                    </button>
                </header>
                <div class="dm-modal__body">
                    <form class="dm-modal__form">
                        <div class="dm-modal__form-layout dm-modal__form-layout--compact">
                            <div class="dm-upload-card">
                                ${imageUrl ? `
                                    <div class="dm-upload-card__preview">
                                        <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(resolvedName || 'Obrázok mapy')}" />
                                    </div>
                                ` : `
                                    <div class="dm-upload-card__dropzone">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
                                            <path d="M7 10V9C7 6.23858 9.23858 4 12 4C14.7614 4 17 6.23858 17 9V10C19.2091 10 21 11.7909 21 14C21 15.4806 20.1956 16.8084 19 17.5M7 10C4.79086 10 3 11.7909 3 14C3 15.4806 3.8044 16.8084 5 17.5M7 10C7.43285 10 7.84965 10.0688 8.24006 10.1959M12 12V21M12 12L15 15M12 12L9 15" stroke="#5a3bff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
                                        </svg>
                                    </div>
                                `}
                                <button type="button" class="dm-upload-card__footer" data-dm-media-trigger>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-upload-icon lucide-upload"><path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>
                                    <p>${uploadLabel}</p>
                                </button>
                                <input type="hidden" data-dm-media-id value="${selectionId ? escapeHtml(String(selectionId)) : ''}">
                                <input type="hidden" data-dm-media-alt value="${escapeHtml(selectionAlt)}">
                            </div>
                            <div class="dm-modal__form-fields">
                                <div class="dm-form__grid">
                                    <div class="dm-form__column">
                                        <div class="dm-field">
                                            <button type="button" class="dm-field__info" aria-label="Vyberte nadradenú mapu" data-tooltip="Vyberte nadradenú mapu">${infoIcon}</button>
                                            <select required autocomplete="off" class="dm-field__input" data-dm-select data-dm-field="parent"${parentSelectAttrs}>
                                                <option value="" disabled${placeholderSelected} hidden>${escapeHtml('Vyberte nadradenú')}</option>
                                                <option value="none"${noneSelected}>Žiadna</option>
                                                ${parentOptions}
                                            </select>
                                            <label class="dm-field__label">Nadradená<span class="dm-field__required">*</span></label>
                                        </div>
                                        <div class="dm-field">
                                            <button type="button" class="dm-field__info" aria-label="Typ nehnuteľnosti alebo objektu" data-tooltip="Typ nehnuteľnosti alebo objektu">${infoIcon}</button>
                                            <select required autocomplete="off" class="dm-field__input" data-dm-select data-dm-field="map-type">
                                                <option value="" disabled${typePlaceholderSelected} hidden>${escapeHtml(typePlaceholderLabel)}</option>
                                                ${typeOptions}
                                            </select>
                                            <label class="dm-field__label">Typ<span class="dm-field__required">*</span></label>
                                        </div>
                                        <div class="dm-field">
                                            <button type="button" class="dm-field__info" aria-label="Názov mapy alebo lokality" data-tooltip="Názov mapy alebo lokality">${infoIcon}</button>
                                            <input required type="text" autocomplete="off" class="dm-field__input" data-dm-field="name" placeholder=" " value="${escapeHtml(resolvedName)}">
                                            <label class="dm-field__label">Názov<span class="dm-field__required">*</span></label>
                                        </div>
                                    </div>
                                </div>
                                <div class="dm-modal__actions">
                                    <button type="button" class="dm-button dm-button--dark" data-dm-modal-save>
                                        ${isEdit ? `${cta} ${arrowIcon}` : `${plusIcon} ${cta}`}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
}

function renderLocationModal(title, cta, data, itemId = null, modalState = null) {
    const plusIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-plus-icon lucide-circle-plus"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>';
    const infoIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info-icon lucide-info"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
    const arrowIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right-icon lucide-arrow-right"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';
    const isEdit = title.includes('Upraviť');
    const headerIcon = isEdit ? arrowIcon : plusIcon;

    // Find the location being edited
    let editLocation = null;
    let editParent = null;
    const projects = Array.isArray(data.projects) ? data.projects : [];

    if (itemId && projects.length) {
        for (const project of projects) {
            const floor = project.floors?.find((f) => f.id === itemId);
            if (floor) {
                editLocation = floor;
                editParent = project;
                break;
            }
        }
    }

    // Use formData from modalState if available (after image selection), otherwise use editLocation
    const formData = modalState?.formData ?? {};
    const nameValue = formData.name ?? editLocation?.name ?? '';

    // Parent project select
    const parentValue = formData.parentId ?? modalState?.parentId ?? (editParent ? String(editParent.id) : '');
    const parentOptions = projects
        .map((project) => {
            const value = String(project.id);
            const isSelected = parentValue === value;
            return `<option value="${escapeHtml(value)}"${isSelected ? ' selected' : ''}>${escapeHtml(project.name)}</option>`;
        })
        .join('');
    const parentPlaceholderSelected = parentValue === '' ? ' selected' : '';

    // Type select
    const typeOptionsSource = Array.isArray(data.types) ? data.types : [];
    const resolvedType = formData.type ?? editLocation?.type ?? '';
    const resolvedTypeInList = resolvedType ? typeOptionsSource.some((option) => option.label === resolvedType) : false;
    const selectTypeValue = resolvedTypeInList ? resolvedType : '';
    const typePlaceholderSelected = selectTypeValue ? '' : ' selected';
    const typePlaceholderLabel = typeOptionsSource.length ? 'Vyberte typ' : 'Najprv pridajte typ v nastaveniach';
    const typeOptions = typeOptionsSource
        .map((option) => {
            const value = option.label;
            const isSelected = selectTypeValue === value;
            return `<option value="${escapeHtml(value)}"${isSelected ? ' selected' : ''}>${escapeHtml(option.label)}</option>`;
        })
        .join('');

    // Status select
    const statusOptionsSource = Array.isArray(data.statuses) ? data.statuses : [];

    // Find active project for table settings
    const activeProject = (() => {
        // If editing, use parent project
        if (editParent) {
            return editParent;
        }
        // If parentValue is set, find that project
        if (parentValue) {
            return projects.find((p) => String(p.id) === parentValue) ?? null;
        }
        // Otherwise use first project
        return projects[0] ?? null;
    })();

    const tableSettings = (() => {
        const frontend = activeProject && typeof activeProject.frontend === 'object' ? activeProject.frontend : null;
        const table = frontend && typeof frontend.locationTable === 'object' ? frontend.locationTable : null;
        return {
            enabled: Boolean(table?.enabled),
            scope: table?.scope === 'hierarchy' ? 'hierarchy' : 'current',
        };
    })();
    const statusIdFromState = formData.statusId ?? modalState?.statusId ?? null;
    const statusLabelFromState = formData.status ?? modalState?.status ?? '';
    const locationStatusId = editLocation?.statusId ?? null;
    const locationStatusLabel = editLocation?.status ?? editLocation?.statusLabel ?? '';
    const matchedStatus = (() => {
        const targetId = statusIdFromState ?? locationStatusId;
        if (targetId) {
            return statusOptionsSource.find((option) => String(option.id) === String(targetId)) ?? null;
        }
        if (statusLabelFromState) {
            return statusOptionsSource.find((option) => option.label === statusLabelFromState) ?? null;
        }
        if (locationStatusLabel) {
            return statusOptionsSource.find((option) => option.label === locationStatusLabel) ?? null;
        }
        return null;
    })();
    const resolvedStatusLabel = statusLabelFromState || matchedStatus?.label || locationStatusLabel;
    const resolvedStatusInList = resolvedStatusLabel ? statusOptionsSource.some((option) => option.label === resolvedStatusLabel) : false;
    const selectStatusValue = resolvedStatusInList ? resolvedStatusLabel : '';
    const statusPlaceholderSelected = selectStatusValue ? '' : ' selected';
    const statusPlaceholderLabel = statusOptionsSource.length ? 'Vyberte stav' : 'Najprv pridajte stav v nastaveniach';
    const statusOptions = statusOptionsSource
        .map((option) => {
            const value = option.label;
            const isSelected = selectStatusValue === value;
            return `<option value="${escapeHtml(value)}" data-status-id="${escapeHtml(String(option.id))}"${isSelected ? ' selected' : ''}>${escapeHtml(option.label)}</option>`;
        })
        .join('');

    // Field values - prioritize formData, then editLocation
    const urlValue = formData.url ?? editLocation?.url ?? '';
    const detailUrlValue = formData.detailUrl ?? editLocation?.detailUrl ?? '';
    const areaValue = formData.area ?? editLocation?.area ?? '';
    const suffixValue = formData.suffix ?? editLocation?.suffix ?? '';
    const prefixValue = formData.prefix ?? editLocation?.prefix ?? '';
    const designationValue = formData.designation ?? editLocation?.designation ?? editLocation?.label ?? '';
    const priceValue = formData.price ?? editLocation?.price ?? editLocation?.rent ?? '';
    const rentValue = formData.rent ?? editLocation?.rent ?? editLocation?.price ?? '';

    // Image selection logic
    const imageSelection = modalState?.imageSelection ?? null;
    const selectedPreview = imageSelection?.url ?? modalState?.imagePreview ?? null;
    let imageUrl = selectedPreview || (editLocation?.image ?? editLocation?.imageUrl ?? null);
    if (!imageUrl && isEdit) {
        imageUrl = '';
    }

    const uploadLabel = isEdit ? 'Zmeniť obrázok' : 'Nahrať obrázok';
    const selectionId = imageSelection?.id ?? editLocation?.image_id ?? '';
    const selectionAlt = imageSelection?.alt ?? editLocation?.imageAlt ?? (nameValue || '');

    return `
        <div class="dm-modal-overlay">
            <div class="dm-modal dm-modal--location">
                <header class="dm-modal__header">
                    <div class="dm-modal__header-left">
                        ${headerIcon}
                        <h2>${title}</h2>
                    </div>
                    <button type="button" class="dm-modal__close" aria-label="Zavrieť" data-dm-close-modal>
                        <svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 25 25" fill="none">
                            <path fill-rule="evenodd" clip-rule="evenodd" d="M12.4841 15.5772L3.09313 24.9681L0 21.875L9.39094 12.4841L0 3.09313L3.09313 0L12.4841 9.39094L21.875 0L24.9681 3.09313L15.5772 12.4841L24.9681 21.875L21.875 24.9681L12.4841 15.5772Z" fill="#1C134F"/>
                        </svg>
                    </button>
                </header>
                <div class="dm-modal__body">
                    <form class="dm-modal__form">
                        <div class="dm-modal__form-layout">
                            <div class="dm-upload-card">
                                ${imageUrl ? `
                                    <div class="dm-upload-card__preview">
                                        <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(nameValue || 'Obrázok lokality')}" />
                                    </div>
                                ` : `
                                    <div class="dm-upload-card__dropzone">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
                                            <path d="M7 10V9C7 6.23858 9.23858 4 12 4C14.7614 4 17 6.23858 17 9V10C19.2091 10 21 11.7909 21 14C21 15.4806 20.1956 16.8084 19 17.5M7 10C4.79086 10 3 11.7909 3 14C3 15.4806 3.8044 16.8084 5 17.5M7 10C7.43285 10 7.84965 10.0688 8.24006 10.1959M12 12V21M12 12L15 15M12 12L9 15" stroke="#5a3bff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
                                        </svg>
                                    </div>
                                `}
                                <button type="button" class="dm-upload-card__footer" data-dm-media-trigger>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-upload-icon lucide-upload"><path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>
                                    <p>${uploadLabel}</p>
                                </button>
                                <input type="hidden" data-dm-media-id value="${selectionId ? escapeHtml(String(selectionId)) : ''}">
                                <input type="hidden" data-dm-media-alt value="${escapeHtml(selectionAlt)}">
                            </div>
                            <div class="dm-modal__form-fields">
                                <div class="dm-form__grid">
                                    <div class="dm-form__column">
                                        <div class="dm-field">
                                            <button type="button" class="dm-field__info" aria-label="Vyberte nadradenú mapu" data-tooltip="Vyberte nadradenú mapu">${infoIcon}</button>
                                            <select required autocomplete="off" class="dm-field__input" data-dm-select data-dm-field="parent">
                                                <option value="" disabled${parentPlaceholderSelected} hidden>Vyberte nadradenú</option>
                                                ${parentOptions}
                                            </select>
                                            <label class="dm-field__label">Nadradená<span class="dm-field__required">*</span></label>
                                        </div>
                                        <div class="dm-field">
                                            <button type="button" class="dm-field__info" aria-label="Typ nehnuteľnosti alebo objektu" data-tooltip="Typ nehnuteľnosti alebo objektu">${infoIcon}</button>
                                            <select required autocomplete="off" class="dm-field__input" data-dm-select data-dm-field="location-type">
                                                <option value="" disabled${typePlaceholderSelected} hidden>${escapeHtml(typePlaceholderLabel)}</option>
                                                ${typeOptions}
                                            </select>
                                            <label class="dm-field__label">Typ<span class="dm-field__required">*</span></label>
                                        </div>
                                        <div class="dm-field">
                                            <button type="button" class="dm-field__info" aria-label="Názov lokality" data-tooltip="Názov lokality">${infoIcon}</button>
                                            <input required type="text" autocomplete="off" class="dm-field__input" data-dm-field="name" placeholder=" " value="${escapeHtml(nameValue)}">
                                            <label class="dm-field__label">Názov<span class="dm-field__required">*</span></label>
                                        </div>
                                        <div class="dm-field">
                                            <button type="button" class="dm-field__info" aria-label="Označenie lokality" data-tooltip="Označenie lokality">${infoIcon}</button>
                                            <input type="text" autocomplete="off" class="dm-field__input" data-dm-field="designation" placeholder=" " value="${escapeHtml(designationValue)}">
                                            <label class="dm-field__label">Označenie</label>
                                        </div>
                                    </div>
                                    <div class="dm-form__column">
                                        <div class="dm-field dm-field--with-unit" data-unit="m²">
                                            <button type="button" class="dm-field__info" aria-label="Rozloha lokality v m²" data-tooltip="Rozloha lokality v m²">${infoIcon}</button>
                                            <input type="number" step="0.01" autocomplete="off" class="dm-field__input" data-dm-field="area" placeholder=" " value="${escapeHtml(areaValue)}">
                                            <label class="dm-field__label">Rozloha (m²)</label>
                                        </div>
                                        <div class="dm-field">
                                            <button type="button" class="dm-field__info" aria-label="Prefix lokality" data-tooltip="Prefix lokality">${infoIcon}</button>
                                            <input type="text" autocomplete="off" class="dm-field__input" data-dm-field="prefix" placeholder=" " value="${escapeHtml(prefixValue)}">
                                            <label class="dm-field__label">Prefix</label>
                                        </div>
                                        <div class="dm-field dm-field--with-unit" data-unit="€">
                                            <button type="button" class="dm-field__info" aria-label="Cena v €" data-tooltip="Cena v €">${infoIcon}</button>
                                            <input type="text" autocomplete="off" class="dm-field__input" data-dm-field="price" placeholder=" " value="${escapeHtml(priceValue)}">
                                            <label class="dm-field__label">Cena (€)</label>
                                        </div>
                                    </div>
                                    <div class="dm-form__column">
                                        <div class="dm-field dm-field--with-unit" data-unit="€">
                                            <button type="button" class="dm-field__info" aria-label="Prenájom v €" data-tooltip="Prenájom v €">${infoIcon}</button>
                                            <input type="text" autocomplete="off" class="dm-field__input" data-dm-field="rent" placeholder=" " value="${escapeHtml(rentValue)}">
                                            <label class="dm-field__label">Prenájom (€)</label>
                                        </div>
                                        <div class="dm-field">
                                            <button type="button" class="dm-field__info" aria-label="Suffix pre rozlohu" data-tooltip="Suffix pre rozlohu">${infoIcon}</button>
                                            <input type="text" autocomplete="off" class="dm-field__input" data-dm-field="suffix" placeholder=" " value="${escapeHtml(suffixValue)}">
                                            <label class="dm-field__label">Suffix</label>
                                        </div>
                                        <div class="dm-field">
                                            <button type="button" class="dm-field__info" aria-label="Stav lokality" data-tooltip="Stav lokality">${infoIcon}</button>
                                            <select required autocomplete="off" class="dm-field__input" data-dm-select data-dm-field="location-status">
                                                <option value="" disabled${statusPlaceholderSelected} hidden>${escapeHtml(statusPlaceholderLabel)}</option>
                                                ${statusOptions}
                                            </select>
                                            <label class="dm-field__label">Stav<span class="dm-field__required">*</span></label>
                                        </div>
                                    </div>
                                </div>
                                <div class="dm-modal__actions">
                                    <button type="button" class="dm-button dm-button--dark" data-dm-modal-save>
                                        ${isEdit ? `${cta} ${arrowIcon}` : `${plusIcon} ${cta}`}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
}

function renderTypeModal(title, cta, data, itemId = null, modalState = null) {
    const saveIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-pen-icon lucide-square-pen"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/></svg>';
    const plusIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-plus-icon lucide-circle-plus"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>';
    const types = Array.isArray(data.types) ? data.types : [];
    const targetId = itemId || modalState?.payload || '';
    const editItem = targetId ? types.find((type) => String(type.id) === String(targetId)) ?? null : null;
    const typeId = editItem?.id ?? targetId ?? '';

    const defaultColor = '#7c3aed';
    const nameValue = modalState?.name ?? modalState?.itemName ?? editItem?.label ?? '';
    const colorValue = modalState?.color ?? editItem?.color ?? defaultColor;
    const hexValue = typeof colorValue === 'string' && colorValue.startsWith('#') ? colorValue : `#${String(colorValue || '').replace(/^#+/, '')}`;

    return `
        <div class="dm-modal-overlay">
            <div class="dm-modal dm-modal--narrow">
                <header class="dm-modal__header">
                    <h2>${title}</h2>
                    <button type="button" class="dm-modal__close" aria-label="Zavrieť" data-dm-close-modal>
                        <svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 25 25" fill="none">
                            <path fill-rule="evenodd" clip-rule="evenodd" d="M12.4841 15.5772L3.09313 24.9681L0 21.875L9.39094 12.4841L0 3.09313L3.09313 0L12.4841 9.39094L21.875 0L24.9681 3.09313L15.5772 12.4841L24.9681 21.875L21.875 24.9681L12.4841 15.5772Z" fill="#1C134F"/>
                        </svg>
                    </button>
                </header>
                <div class="dm-modal__body">
                    <form class="dm-form" data-dm-type-form${typeId ? ` data-dm-type-id="${escapeHtml(typeId)}"` : ''}>
                        <div class="dm-field">
                            <input 
                                required 
                                type="text" 
                                autocomplete="off" 
                                class="dm-field__input"
                                value="${escapeHtml(nameValue)}"
                                data-dm-type-name
                            />
                            <label class="dm-field__label">Názov typu<span class="dm-field__required">*</span></label>
                        </div>
                        <div class="dm-field">
                            <input 
                                type="color" 
                                value="${escapeHtml(hexValue)}" 
                                autocomplete="off"
                                class="dm-field__input dm-field__input--color"
                                data-dm-type-color
                                required
                            />
                            <label class="dm-field__label">Farba</label>
                        </div>
                        <div class="dm-field">
                            <input 
                                type="text" 
                                value="${escapeHtml(hexValue)}"
                                autocomplete="off"
                                class="dm-field__input"
                                data-dm-type-hex
                                required
                            />
                            <label class="dm-field__label">HEX kód<span class="dm-field__required">*</span></label>
                        </div>
                    </form>
                </div>
                <footer class="dm-modal__actions dm-modal__actions--split">
                    <button class="dm-button dm-button--outline" data-dm-close-modal>Zrušiť</button>
                    <button class="dm-button dm-button--dark" data-dm-modal-save>
                        <span class="dm-button__icon" aria-hidden="true">${editItem ? saveIcon : plusIcon}</span>
                        ${cta}
                    </button>
                </footer>
            </div>
        </div>
    `;
}

function renderStatusModal(title, cta, data, itemId = null, modalState = null) {
    const saveIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-pen-icon lucide-square-pen"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/></svg>';
    const plusIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-plus-icon lucide-circle-plus"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>';
    const statuses = Array.isArray(data.statuses) ? data.statuses : [];
    const targetId = itemId || modalState?.payload || '';
    const editItem = targetId ? statuses.find((status) => String(status.id) === String(targetId)) ?? null : null;
    const statusId = editItem?.id ?? targetId ?? '';

    const defaultColor = '#22c55e';
    const nameValue = modalState?.name ?? modalState?.itemName ?? editItem?.label ?? '';
    const colorValue = modalState?.color ?? editItem?.color ?? defaultColor;
    const hexValue = typeof colorValue === 'string' && colorValue.startsWith('#') ? colorValue : `#${String(colorValue || '').replace(/^#+/, '')}`;

    return `
        <div class="dm-modal-overlay">
            <div class="dm-modal dm-modal--narrow">
                <header class="dm-modal__header">
                    <h2>${title}</h2>
                    <button type="button" class="dm-modal__close" aria-label="Zavrieť" data-dm-close-modal>
                        <svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 25 25" fill="none">
                            <path fill-rule="evenodd" clip-rule="evenodd" d="M12.4841 15.5772L3.09313 24.9681L0 21.875L9.39094 12.4841L0 3.09313L3.09313 0L12.4841 9.39094L21.875 0L24.9681 3.09313L15.5772 12.4841L24.9681 21.875L21.875 24.9681L12.4841 15.5772Z" fill="#1C134F"/>
                        </svg>
                    </button>
                </header>
                <div class="dm-modal__body">
                    <form class="dm-form" data-dm-status-form${statusId ? ` data-dm-status-id="${escapeHtml(statusId)}"` : ''}>
                        <div class="dm-field">
                            <input 
                                required 
                                type="text" 
                                autocomplete="off" 
                                class="dm-field__input"
                                value="${escapeHtml(nameValue)}"
                                data-dm-status-name
                            />
                            <label class="dm-field__label">Názov stavu<span class="dm-field__required">*</span></label>
                        </div>
                        <div class="dm-field">
                            <input 
                                type="color" 
                                value="${escapeHtml(hexValue)}" 
                                autocomplete="off"
                                class="dm-field__input dm-field__input--color"
                                data-dm-status-color
                                required
                            />
                            <label class="dm-field__label">Farba</label>
                        </div>
                        <div class="dm-field">
                            <input 
                                type="text" 
                                value="${escapeHtml(hexValue)}"
                                autocomplete="off"
                                class="dm-field__input"
                                data-dm-status-hex
                                required
                            />
                            <label class="dm-field__label">HEX kód<span class="dm-field__required">*</span></label>
                        </div>
                    </form>
                </div>
                <footer class="dm-modal__actions dm-modal__actions--split">
                    <button class="dm-button dm-button--outline" data-dm-close-modal>Zrušiť</button>
                    <button class="dm-button dm-button--dark" data-dm-modal-save>
                        <span class="dm-button__icon" aria-hidden="true">${editItem ? saveIcon : plusIcon}</span>
                        ${cta}
                    </button>
                </footer>
            </div>
        </div>
    `;
}

function renderConfirmModal(state) {
    const itemName = state?.modal?.itemName || 'túto položku';
    const deleteKind = state?.modal?.type === 'delete-type' ? 'type' : state?.modal?.type === 'delete-status' ? 'status' : state?.modal?.type === 'delete-map' ? 'map' : '';
    const deleteTarget = state?.modal?.payload ?? '';
    const confirmAttributes = deleteKind
        ? ` data-dm-delete-kind="${escapeHtml(deleteKind)}" data-dm-delete-target="${escapeHtml(String(deleteTarget))}"`
        : '';
    return `
        <div class="dm-modal-overlay">
            <div class="dm-modal dm-modal--narrow">
                <header class="dm-modal__header">
                    <h2>Ste si istý?</h2>
                    <button type="button" class="dm-modal__close" aria-label="Zavrieť" data-dm-close-modal>
                        <svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 25 25" fill="none">
                            <path fill-rule="evenodd" clip-rule="evenodd" d="M12.4841 15.5772L3.09313 24.9681L0 21.875L9.39094 12.4841L0 3.09313L3.09313 0L12.4841 9.39094L21.875 0L24.9681 3.09313L15.5772 12.4841L24.9681 21.875L21.875 24.9681L12.4841 15.5772Z" fill="#1C134F"/>
                        </svg>
                    </button>
                </header>
                <div class="dm-modal__body">
                    <p>Naozaj chcete vymazať <strong>${escapeHtml(itemName)}</strong>?</p>
                </div>
                <footer class="dm-modal__actions dm-modal__actions--split">
                    <button class="dm-button dm-button--outline" data-dm-close-modal>Zrušiť</button>
                    <button class="dm-button dm-button--dark" data-dm-confirm-delete${confirmAttributes}>Vymazať</button>
                </footer>
            </div>
        </div>
    `;
}

function renderDrawModal(state, data) {
    const payload = state.modal?.payload ?? null;
    const projects = Array.isArray(data.projects) ? data.projects : [];

    if (!projects.length) {
        return renderSimpleModal('Nakresliť súradnice', '<p>Najprv pridajte mapu alebo lokalitu.</p>');
    }

    let activeProject = projects[0];
    let activeFloor = null;
    let contextType = 'project';

    for (const project of projects) {
        if (String(project.id) === String(payload)) {
            activeProject = project;
            contextType = 'project';
            activeFloor = null;
            break;
        }
        const floors = Array.isArray(project?.floors) ? project.floors : [];
        const foundFloor = floors.find((floor) => String(floor.id) === String(payload));
        if (foundFloor) {
            activeProject = project;
            activeFloor = foundFloor;
            contextType = 'floor';
            break;
        }
    }

    if (contextType === 'floor' && !activeFloor && activeProject?.floors?.length) {
        activeFloor = activeProject.floors[0];
    }

    const regionOwner = contextType === 'floor' ? activeFloor : activeProject;

    const rendererSizeSource =
        regionOwner && typeof regionOwner === 'object' && regionOwner.renderer && typeof regionOwner.renderer === 'object'
            ? regionOwner.renderer.size
            : activeProject && typeof activeProject === 'object' && activeProject.renderer && typeof activeProject.renderer === 'object'
                ? activeProject.renderer.size
                : null;

    const sanitiseViewboxDimension = (value) => {
        const num = Number(value);
        return Number.isFinite(num) && num > 0 ? num : null;
    };

    const sanitiseZoomValue = (value) => {
        const num = Number(value);
        if (!Number.isFinite(num)) {
            return null;
        }
        return Math.min(1.5, Math.max(0.35, num));
    };

    const initialViewboxWidth = sanitiseViewboxDimension(rendererSizeSource?.width);
    const initialViewboxHeight = sanitiseViewboxDimension(rendererSizeSource?.height);
    const defaultViewboxWidth = initialViewboxWidth ?? DRAW_VIEWBOX.width;
    const defaultViewboxHeight = initialViewboxHeight ?? DRAW_VIEWBOX.height;
    const initialZoom = sanitiseZoomValue(
        state?.modal?.zoom ?? regionOwner?.renderer?.zoom ?? activeProject?.renderer?.zoom ?? null,
    ) ?? 0.65;

    const regions = Array.isArray(regionOwner?.regions) ? regionOwner.regions : [];
    const floorsForChildren = Array.isArray(activeProject?.floors) ? activeProject.floors : [];

    const surfaceLabel =
        contextType === 'floor'
            ? activeFloor?.name ?? 'Lokalita'
            : activeProject?.name ?? activeProject?.title ?? 'Mapa projektu';
    const projectBadge = activeProject && typeof activeProject.badge === 'string' ? activeProject.badge : 'A';
    const badgeLabel = projectBadge.trim().slice(0, 2).toUpperCase() || 'A';

    const npSorted =
        contextType === 'project'
            ? floorsForChildren
                .filter((floor) => /NP$/i.test(floor.label ?? ''))
                .sort((a, b) => {
                    const aNum = parseInt(String(a.label).replace(/\D/g, ''), 10) || 0;
                    const bNum = parseInt(String(b.label).replace(/\D/g, ''), 10) || 0;
                    return bNum - aNum;
                })
            : [];
    const npLabels = (npSorted.length > 4 ? npSorted.slice(1, 5) : npSorted.slice(0, 4)).map((floor) => floor.label);
    const ppLabel =
        contextType === 'project'
            ? floorsForChildren.find((floor) => /PP$/i.test(floor.label ?? ''))?.label
            : null;
    const levelLabels =
        contextType === 'project'
            ? Array.from(new Set(ppLabel ? [...npLabels, ppLabel] : npLabels))
            : [];

    const statusOptionsSource = Array.isArray(data.statuses) ? data.statuses : [];
    const tableSettings = (() => {
        const frontend = activeProject && typeof activeProject.frontend === 'object' ? activeProject.frontend : null;
        const table = frontend && typeof frontend.locationTable === 'object' ? frontend.locationTable : null;
        return {
            enabled: Boolean(table?.enabled),
            scope: table?.scope === 'hierarchy' ? 'hierarchy' : 'current',
        };
    })();

    const activeRegionId = state.modal?.regionId ?? (regions[0]?.id ? String(regions[0].id) : null);
    const activeRegion = activeRegionId
        ? regions.find((region) => String(region.id) === String(activeRegionId)) ?? regions[0] ?? null
        : regions[0] ?? null;

    const resolveStatusLabel = (region) => {
        const statusKey = String(region?.statusId ?? region?.status ?? '');
        if (!statusKey) {
            return '';
        }
        const match =
            statusOptionsSource.find((status) => String(status.id) === statusKey) ??
            statusOptionsSource.find((status) => String(status.key) === statusKey);
        return match?.label ?? region?.statusLabel ?? '';
    };

    const selectedChildKeys = new Set(
        Array.isArray(activeRegion?.children)
            ? activeRegion.children
                .map((child) => resolveRegionChildKey(child))
                .filter(Boolean)
            : []
    );

    const regionListMarkup = regions.length
        ? regions
            .map((region, index) => {
                // Always use region.id as key, never index
                const id = String(region.id ?? region.lotId ?? '');
                if (!id) {
                    console.warn('[renderDrawModal] Region missing id:', region);
                    return '';
                }
                const isActive = activeRegion
                    ? String(activeRegion.id ?? '') === id
                    : index === 0 && !activeRegionId;
                const label = region.label ?? region.name ?? `Zóna ${index + 1}`;
                const childCount = Array.isArray(region.children) ? region.children.length : 0;
                const connectionMeta = childCount > 0
                    ? `Prepojených: ${childCount}`
                    : 'Bez prepojení';
                return `
                        <li class="dm-editor__zone-item${isActive ? ' dm-editor__zone-item--active' : ''}" data-dm-region-item="${escapeHtml(id)}">
                            <button type="button" class="dm-editor__zone-button" data-dm-region-trigger="${escapeHtml(id)}">
                                <span class="dm-editor__zone-name">${escapeHtml(label)}</span>
                                <span class="dm-editor__zone-meta">${escapeHtml(connectionMeta)}</span>
                            </button>
                        </li>
                    `;
            })
            .filter(Boolean)
            .join('')
        : `
                <li class="dm-editor__zone-item dm-editor__zone-item--empty">
                    <span class="dm-editor__empty-text">Zatiaľ žiadne zóny</span>
                </li>
            `;

    const availabilityKeywords = ['available', 'free', 'voln', 'voľn', 'volne', 'volny', 'predaj', 'na predaj'];

    const normaliseString = (value) => {
        if (!value) {
            return '';
        }
        let text = String(value).toLowerCase();
        try {
            text = text.normalize('NFD');
        } catch (error) {
            // ignore missing browser support
        }
        return text.replace(/[\u0300-\u036f]/g, '');
    };

    const parseAvailability = (statusInfo, statusIdRaw, label) => {
        if (statusInfo && Object.prototype.hasOwnProperty.call(statusInfo, 'available')) {
            const explicit = statusInfo.available;
            if (typeof explicit === 'boolean') {
                return explicit;
            }
            if (typeof explicit === 'string') {
                const normalised = normaliseString(explicit);
                if (['true', '1', 'yes', 'ano'].includes(normalised)) {
                    return true;
                }
                if (['false', '0', 'no', 'nie'].includes(normalised)) {
                    return false;
                }
            }
        }
        const labelNormalised = normaliseString(label);
        const statusKeyNormalised = normaliseString(statusInfo?.key ?? statusIdRaw);
        return availabilityKeywords.some(
            (keyword) => labelNormalised.includes(keyword) || (statusKeyNormalised && statusKeyNormalised.includes(keyword)),
        );
    };

    const resolveParentProjectId = (project) => {
        const rawParent = project?.parentId;
        if (rawParent === null || typeof rawParent === 'undefined') {
            return '';
        }
        const candidate = typeof rawParent === 'string' ? rawParent.trim() : String(rawParent ?? '').trim();
        if (!candidate || candidate === 'none' || candidate === 'null') {
            return '';
        }
        const selfId = String(project?.id ?? '').trim();
        if (selfId && candidate === selfId) {
            return '';
        }
        return candidate;
    };

    const statusLookup = new Map();
    statusOptionsSource.forEach((status) => {
        if (!status || typeof status !== 'object') {
            return;
        }
        const keys = [];
        if (status.id) {
            keys.push(String(status.id).trim());
        }
        if (status.key) {
            keys.push(String(status.key).trim());
        }
        keys
            .map((key) => key && key.toLowerCase())
            .filter(Boolean)
            .forEach((key) => {
                statusLookup.set(key, status);
            });
    });

    const resolveStatusMeta = (statusIdRaw) => {
        const candidate = String(statusIdRaw ?? '').trim();
        if (!candidate) {
            return null;
        }
        const lower = candidate.toLowerCase();
        return statusLookup.get(lower) ?? null;
    };

    const summariseFloors = (floorsList) => {
        const entriesMap = new Map();
        let availableCount = 0;
        const seenFloors = new Set();
        floorsList.forEach((floor) => {
            if (!floor || typeof floor !== 'object') {
                return;
            }
            const floorId = String(floor.id ?? floor.floorId ?? '').trim();
            if (floorId && seenFloors.has(floorId)) {
                return;
            }
            if (floorId) {
                seenFloors.add(floorId);
            }
            const statusIdRaw = String(floor.statusId ?? floor.status ?? '').trim();
            const statusMeta = resolveStatusMeta(statusIdRaw);
            const label = (statusMeta?.label ?? floor.statusLabel ?? statusIdRaw) || 'Bez stavu';
            const color = statusMeta?.color ?? floor.statusColor ?? '';
            const groupedKey = normaliseString(statusMeta?.id ?? statusMeta?.key ?? label);
            const entry =
                entriesMap.get(groupedKey) ?? {
                    label,
                    color,
                    count: 0,
                    isAvailable: false,
                };
            entry.count += 1;
            if (color && !entry.color) {
                entry.color = color;
            }
            if (parseAvailability(statusMeta, statusIdRaw, label)) {
                entry.isAvailable = true;
                availableCount += 1;
            }
            entriesMap.set(groupedKey, entry);
        });
        const entries = Array.from(entriesMap.values()).sort((a, b) => b.count - a.count);
        return {
            total: floorsList.length,
            availableCount,
            entries,
        };
    };

    let linkRowsMarkup = '';
    let hasLinkableRows = false;

    if (contextType === 'project') {
        const projectById = new Map();
        projects.forEach((project) => {
            const projectId = String(project?.id ?? '').trim();
            if (!projectId || projectById.has(projectId)) {
                return;
            }
            projectById.set(projectId, project);
        });

        const childProjectsByParentId = new Map();
        projects.forEach((project) => {
            const projectId = String(project?.id ?? '').trim();
            const parentId = resolveParentProjectId(project);
            if (!projectId || !parentId) {
                return;
            }
            if (!childProjectsByParentId.has(parentId)) {
                childProjectsByParentId.set(parentId, []);
            }
            childProjectsByParentId.get(parentId).push(project);
        });

        const aggregateCache = new Map();
        const collectProjectAggregate = (projectId, stack = new Set()) => {
            if (!projectId) {
                return {
                    floors: [],
                    floorCount: 0,
                    availableCount: 0,
                    statuses: [],
                    mapCount: 0,
                };
            }
            if (aggregateCache.has(projectId)) {
                return aggregateCache.get(projectId);
            }
            if (stack.has(projectId)) {
                return {
                    floors: [],
                    floorCount: 0,
                    availableCount: 0,
                    statuses: [],
                    mapCount: 0,
                };
            }
            stack.add(projectId);
            const projectNode = projectById.get(projectId);
            if (!projectNode) {
                stack.delete(projectId);
                return {
                    floors: [],
                    floorCount: 0,
                    availableCount: 0,
                    statuses: [],
                    mapCount: 0,
                };
            }
            const aggregateFloors = Array.isArray(projectNode?.floors) ? [...projectNode.floors] : [];
            let mapCount = 0;
            const childProjects = childProjectsByParentId.get(projectId) ?? [];
            childProjects.forEach((childProject) => {
                const childId = String(childProject?.id ?? '').trim();
                if (!childId) {
                    return;
                }
                mapCount += 1;
                const childAggregate = collectProjectAggregate(childId, stack);
                mapCount += childAggregate.mapCount;
                aggregateFloors.push(...childAggregate.floors);
            });
            stack.delete(projectId);
            const summary = summariseFloors(aggregateFloors);
            const aggregate = {
                floors: aggregateFloors,
                floorCount: summary.total,
                availableCount: summary.availableCount,
                statuses: summary.entries,
                mapCount,
            };
            aggregateCache.set(projectId, aggregate);
            return aggregate;
        };

        const activeProjectId = String(activeProject?.id ?? '').trim();
        const visitedProjectIds = activeProjectId ? new Set([activeProjectId]) : new Set();
        let rowCounter = 0;
        const nextRowId = () => {
            rowCounter += 1;
            return `dm-link-row-${rowCounter}`;
        };

        const createLocationRow = (floor, depth, parentKey, ancestors) => {
            if (!floor || typeof floor !== 'object') {
                return null;
            }
            const floorId = String(floor.id ?? floor.floorId ?? '').trim();
            if (!floorId) {
                return null;
            }
            return {
                kind: 'location',
                floor,
                key: `location:${floorId}`,
                depth,
                parentKey,
                ancestors,
                rowId: nextRowId(),
            };
        };

        const rowRecords = [];

        const buildMapRows = (projectId, depth, ancestors = []) => {
            if (!projectId || visitedProjectIds.has(projectId)) {
                return null;
            }
            visitedProjectIds.add(projectId);
            const projectNode = projectById.get(projectId);
            if (!projectNode) {
                return null;
            }
            const mapKey = `map:${projectId}`;
            const rowId = nextRowId();
            const aggregate = collectProjectAggregate(projectId);
            const mapRow = {
                kind: 'map',
                project: projectNode,
                mapKey,
                depth,
                parentKey: ancestors[ancestors.length - 1] ?? '',
                ancestors,
                rowId,
                aggregate,
                hasChildren: false,
                descendantRowIds: [],
                descendantKeys: [],
            };

            const rows = [mapRow];
            const nextAncestors = [...ancestors, mapKey];
            const descendantRowIds = [];
            const directChildKeys = new Set();
            const allDescendantKeys = new Set();

            const floors = Array.isArray(projectNode?.floors) ? projectNode.floors : [];
            floors.forEach((floor) => {
                const locationRow = createLocationRow(floor, depth + 1, mapKey, nextAncestors);
                if (!locationRow) {
                    return;
                }
                rows.push(locationRow);
                descendantRowIds.push(locationRow.rowId);
                directChildKeys.add(locationRow.key);
                allDescendantKeys.add(locationRow.key);
            });

            const childProjects = childProjectsByParentId.get(projectId) ?? [];
            const sortedChildren = [...childProjects].sort((a, b) => {
                const aLabel = normaliseString(a?.name ?? a?.label ?? '');
                const bLabel = normaliseString(b?.name ?? b?.label ?? '');
                return aLabel.localeCompare(bLabel, 'sk', { sensitivity: 'base' });
            });

            sortedChildren.forEach((childProject) => {
                const childId = String(childProject?.id ?? '').trim();
                if (!childId) {
                    return;
                }
                const childResult = buildMapRows(childId, depth + 1, nextAncestors);
                if (!childResult) {
                    return;
                }
                rows.push(...childResult.rows);
                descendantRowIds.push(childResult.mapRow.rowId);
                descendantRowIds.push(...childResult.mapRow.descendantRowIds);
                // Only add direct child map key to directChildKeys, not its descendants
                directChildKeys.add(childResult.mapRow.mapKey);
                // But collect all descendants for UI expansion purposes
                allDescendantKeys.add(childResult.mapRow.mapKey);
                childResult.mapRow.descendantKeys.forEach((key) => allDescendantKeys.add(key));
            });

            mapRow.hasChildren = descendantRowIds.length > 0;
            mapRow.descendantRowIds = descendantRowIds;
            mapRow.descendantKeys = Array.from(directChildKeys);
            mapRow.allDescendantKeys = Array.from(allDescendantKeys);

            return {
                rows,
                mapRow,
            };
        };

        const directFloors = Array.isArray(activeProject?.floors) ? activeProject.floors : [];
        directFloors.forEach((floor) => {
            const locationRow = createLocationRow(floor, 0, '', []);
            if (locationRow) {
                rowRecords.push(locationRow);
            }
        });

        const rootChildren = activeProjectId ? childProjectsByParentId.get(activeProjectId) ?? [] : [];
        const sortedRootChildren = [...rootChildren].sort((a, b) => {
            const aLabel = normaliseString(a?.name ?? a?.label ?? '');
            const bLabel = normaliseString(b?.name ?? b?.label ?? '');
            return aLabel.localeCompare(bLabel, 'sk', { sensitivity: 'base' });
        });

        sortedRootChildren.forEach((childProject) => {
            const childId = String(childProject?.id ?? '').trim();
            if (!childId) {
                return;
            }
            const childResult = buildMapRows(childId, 0, []);
            if (childResult) {
                rowRecords.push(...childResult.rows);
            }
        });

        const renderMapRow = (row) => {
            const { mapKey, rowId, depth, aggregate, hasChildren, descendantRowIds, descendantKeys, project } = row;
            const checked = selectedChildKeys.has(mapKey) ? ' checked' : '';
            const indentStep = 24;
            const rowIndent = depth * indentStep;
            const nameIndent = depth > 0 ? 12 : 0;
            const name = project?.name ?? project?.label ?? `Mapa ${mapKey.split(':')[1] ?? ''}`;
            const metaParts = [`Mapy: ${aggregate.mapCount}`, `Lokality: ${aggregate.floorCount}`];
            if (aggregate.availableCount > 0) {
                metaParts.push(`Voľné: ${aggregate.availableCount}`);
            }
            const metaText = metaParts.join(' • ');
            const statusBadges = aggregate.statuses.length
                ? aggregate.statuses
                    .map((entry) => {
                        const variant = slugifyStatus(entry.label);
                        const inlineColor = entry.color ? ` style=\"--dm-status-color:${escapeHtml(entry.color)}\"` : '';
                        return `<span class="dm-status dm-status--${escapeHtml(variant)}"${inlineColor}>${escapeHtml(entry.label)} (${entry.count})</span>`;
                    })
                    .join('')
                : '<span class="dm-localities-table__empty">Bez prepojených lokalít</span>';
            const descendantRowsAttr = descendantRowIds.length
                ? ` data-dm-descendant-rows="${escapeHtml(descendantRowIds.join(' '))}"`
                : '';
            const parentAttr = row.parentKey ? ` data-dm-parent="${escapeHtml(row.parentKey)}"` : '';
            const ancestorsAttr = row.ancestors.length
                ? ` data-dm-ancestors="${escapeHtml(row.ancestors.join(' '))}"`
                : '';
            const toggleMarkup = hasChildren
                ? `<button type="button" class="dm-localities-table__toggle" data-dm-map-toggle="${escapeHtml(mapKey)}" aria-expanded="false">
                        <svg class="dm-localities-table__toggle-icon" width="14" height="14" viewBox="0 0 10 10" aria-hidden="true">
                            <path d="M3 1l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
                        </svg>
                    </button>`
                : '<span class="dm-localities-table__toggle dm-localities-table__toggle--spacer" aria-hidden="true"></span>';
            // Use allDescendantKeys for checkbox cascading (includes all nested descendants)
            const allDescendantKeysAttr = row.allDescendantKeys && row.allDescendantKeys.length
                ? ` data-dm-map-descendants="${escapeHtml(row.allDescendantKeys.join(' '))}"`
                : '';
            const hiddenClass = depth > 0 ? ' dm-localities-table__row--hidden' : '';
            return `
                <tr class="dm-localities-table__row dm-localities-table__row--map${hiddenClass}" data-dm-row-id="${escapeHtml(rowId)}" data-dm-node="${escapeHtml(mapKey)}" data-dm-type="map" data-dm-depth="${escapeHtml(String(depth))}" style="--dm-row-indent:${escapeHtml(String(rowIndent))}px"${descendantRowsAttr}${parentAttr}${ancestorsAttr}>
                    <td class="dm-localities-table__td dm-localities-table__td--sticky">
                        <label class="dm-localities-checkbox dm-localities-checkbox--map">
                            <input type="checkbox" data-dm-region-child value="${escapeHtml(mapKey)}"${checked} data-dm-child-type="map"${allDescendantKeysAttr}>
                            <span class="dm-localities-checkbox__label">${checked ? 'Prepojené' : 'Neaktívne'}</span>
                        </label>
                    </td>
                    <td class="dm-localities-table__td">
                        <span class="dm-localities-table__type-badge dm-localities-table__type-badge--map">Mapa</span>
                    </td>
                    <td class="dm-localities-table__td">
                        <div class="dm-localities-table__name-group" style="--dm-indent:${escapeHtml(String(nameIndent))}px">
                            ${toggleMarkup}
                            <div class="dm-localities-table__name-content">
                                <span class="dm-localities-table__name">${escapeHtml(name)}</span>
                                <span class="dm-localities-table__meta">${escapeHtml(metaText)}</span>
                            </div>
                        </div>
                    </td>
                    <td class="dm-localities-table__td dm-localities-table__td--statuses">${statusBadges}</td>
                </tr>
            `;
        };

        const renderLocationRow = (row) => {
            const { key, floor, depth, rowId, parentKey, ancestors } = row;
            const checked = selectedChildKeys.has(key) ? ' checked' : '';
            const statusKey = String(floor?.statusId ?? floor?.status ?? '').trim();
            const statusMeta = resolveStatusMeta(statusKey);
            const statusLabel = (statusMeta?.label ?? floor?.statusLabel ?? statusKey) || 'Bez stavu';
            const statusVariant = slugifyStatus(statusLabel);
            const typeLabel = floor?.type ?? floor?.label ?? '';
            const metaBits = [];
            if (typeLabel) {
                metaBits.push(`Typ: ${typeLabel}`);
            }
            const prefixSuffix = `${floor?.prefix ?? ''}${floor?.suffix ?? ''}`.trim();
            if (prefixSuffix) {
                metaBits.push(prefixSuffix);
            }
            const metaText = metaBits.join(' • ');
            const indentStep = 24;
            const rowIndent = depth * indentStep;
            const nameIndent = depth > 0 ? 12 : 0;
            const parentAttr = parentKey ? ` data-dm-parent="${escapeHtml(parentKey)}"` : '';
            const ancestorsAttr = ancestors.length ? ` data-dm-ancestors="${escapeHtml(ancestors.join(' '))}"` : '';
            const hiddenClass = depth > 0 ? ' dm-localities-table__row--hidden' : '';
            return `
                <tr class="dm-localities-table__row dm-localities-table__row--location${hiddenClass}" data-dm-row-id="${escapeHtml(rowId)}" data-dm-node="${escapeHtml(key)}" data-dm-type="location" data-dm-depth="${escapeHtml(String(depth))}" style="--dm-row-indent:${escapeHtml(String(rowIndent))}px"${parentAttr}${ancestorsAttr}>
                    <td class="dm-localities-table__td dm-localities-table__td--sticky">
                        <label class="dm-localities-checkbox">
                            <input type="checkbox" data-dm-region-child value="${escapeHtml(key)}"${checked}>
                            <span class="dm-localities-checkbox__label">${checked ? 'Prepojené' : 'Neaktívne'}</span>
                        </label>
                    </td>
                    <td class="dm-localities-table__td">
                        <span class="dm-localities-table__type-badge dm-localities-table__type-badge--location">Lokalita</span>
                    </td>
                    <td class="dm-localities-table__td">
                        <div class="dm-localities-table__name-group" style="--dm-indent:${escapeHtml(String(nameIndent))}px">
                            <span class="dm-localities-table__toggle dm-localities-table__toggle--spacer" aria-hidden="true"></span>
                            <div class="dm-localities-table__name-content">
                                <span class="dm-localities-table__name">${escapeHtml(floor?.name ?? key)}</span>
                                ${metaText ? `<span class="dm-localities-table__meta">${escapeHtml(metaText)}</span>` : ''}
                            </div>
                        </div>
                    </td>
                    <td class="dm-localities-table__td dm-localities-table__td--statuses">
                        <span class="dm-status dm-status--${escapeHtml(statusVariant)}">${escapeHtml(statusLabel)}</span>
                    </td>
                </tr>
            `;
        };

        linkRowsMarkup = rowRecords
            .map((row) => (row.kind === 'map' ? renderMapRow(row) : renderLocationRow(row)))
            .join('');

        hasLinkableRows = Boolean(linkRowsMarkup.trim());
    }

    const regionNameValue = activeRegion?.label ?? activeRegion?.name ?? '';
    const regionDetailUrlValue = activeRegion?.meta?.detailUrl ?? activeRegion?.detailUrl ?? '';
    const canRemoveRegion = regions.length > 1;
    const backgroundImage =
        contextType === 'floor'
            ? activeFloor?.image ?? activeFloor?.imageUrl ?? activeFloor?.imageurl ?? ''
            : activeProject?.image ?? activeProject?.imageUrl ?? activeProject?.imageurl ?? '';
    const backgroundAlt = surfaceLabel ? `${surfaceLabel} - podklad mapy` : 'Podklad mapy';
    const hatchPatternId = `dm-hatch-${Math.random().toString(36).slice(2, 8)}`;

    return `
        <div class="dm-editor-overlay">
            <div class="dm-editor">
                <header class="dm-editor__header">
                    <div class="dm-editor__header-left">
                        <h1 class="dm-editor__title">${escapeHtml(surfaceLabel)}</h1>
                        <span class="dm-editor__subtitle">Editor súradníc</span>
                    </div>
                    <button type="button" class="dm-editor__close" aria-label="Zavrieť" data-dm-close-modal>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                </header>
                
                <div class="dm-editor__body"
                    data-dm-draw-root
                    data-dm-owner="${escapeHtml(contextType)}"
                    data-dm-owner-id="${escapeHtml(
        contextType === 'floor'
            ? activeFloor?.id ?? ''
            : activeProject?.id ?? '',
    )}"
                    data-dm-project-id="${escapeHtml(activeProject?.id ?? '')}"
                    data-dm-floor-name="${escapeHtml(surfaceLabel)}"
                    data-dm-active-region="${activeRegion ? escapeHtml(String(activeRegion.id)) : ''}"
                    data-dm-viewbox-width="${initialViewboxWidth ? escapeHtml(String(initialViewboxWidth)) : ''}"
                    data-dm-viewbox-height="${initialViewboxHeight ? escapeHtml(String(initialViewboxHeight)) : ''}"
                    data-dm-zoom="${escapeHtml(String(initialZoom))}"
                >
                    <!-- LEFT PANEL: Zóny -->
                    <aside class="dm-editor__panel dm-editor__panel--left">
                        <div class="dm-editor__panel-header">
                            <h2>Zóny</h2>
                        </div>
                        <div class="dm-editor__panel-content">
                            <ul class="dm-editor__zones-list" data-dm-region-list>
                                ${regionListMarkup}
                            </ul>
                        </div>
                        <div class="dm-editor__panel-footer">
                            <button type="button" class="dm-button dm-button--primary dm-editor__add-zone" data-dm-add-region>
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>
                                </svg>
                                Pridať zónu
                            </button>
                        </div>
                    </aside>
                    
                    <!-- CENTER PANEL: Viewport/Canvas -->
                    <div class="dm-editor__panel dm-editor__panel--center">
                        <div class="dm-editor__canvas-wrapper">
                            <div class="dm-draw__stage">
                                <div class="dm-draw__canvas">
                                    <img src="${escapeHtml(backgroundImage)}" alt="${escapeHtml(backgroundAlt)}" class="dm-draw__image" draggable="false" />
                                    <svg class="dm-draw__overlay" viewBox="0 0 ${escapeHtml(String(defaultViewboxWidth))} ${escapeHtml(String(defaultViewboxHeight))}" preserveAspectRatio="xMidYMid meet" data-role="overlay" data-dm-hatch-id="${escapeHtml(hatchPatternId)}">
                                        <defs>
                                            <pattern id="${escapeHtml(hatchPatternId)}" patternUnits="userSpaceOnUse" width="16" height="16" patternTransform="rotate(45)">
                                                <rect width="16" height="16" fill="rgba(72, 198, 116, 0.18)"></rect>
                                                <path d="M0 16L16 0" stroke="#32d26e" stroke-width="3" stroke-linecap="round"></path>
                                            </pattern>
                                        </defs>
                                        <polygon class="dm-draw__shape-fill" data-role="fill" points=""></polygon>
                                        <polyline class="dm-draw__shape-outline" data-role="outline" points=""></polyline>
                                        <polyline class="dm-draw__shape-baseline" data-role="baseline" points=""></polyline>
                                        <g class="dm-draw__handles" data-role="handles"></g>
                                    </svg>
                                </div>
                                <div class="dm-draw__cursor" aria-hidden="true">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 3L10.07 19.97L12.58 12.58L19.97 10.07L3 3Z" fill="currentColor"/></svg>
                                </div>
                                ${levelLabels.length ? `
                                <ul class="dm-draw__levels">
                                    ${levelLabels
                .map(
                    (label) => `
                                                <li class="${activeFloor?.label === label ? 'is-active' : ''}">
                                                    ${escapeHtml(label)}
                                                </li>
                                            `,
                )
                .join('')}
                                </ul>` : ''}
                                <button type="button" class="dm-draw__fullscreen-toggle" data-dm-fullscreen-toggle aria-pressed="false" aria-label="Zobraziť na celú obrazovku">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                        <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- RIGHT PANEL: Inšpektor -->
                    <aside class="dm-editor__panel dm-editor__panel--right">
                        <div class="dm-editor__tabs" role="tablist">
                            <button type="button" class="dm-editor__tab dm-editor__tab--active" role="tab" aria-selected="true" data-dm-tab="detail">
                                Detail
                            </button>
                            <button type="button" class="dm-editor__tab" role="tab" aria-selected="false" data-dm-tab="localities">
                                Lokality
                            </button>
                        </div>
                        
                        <!-- Tab: Detail zóny -->
                        <div class="dm-editor__tab-panel dm-editor__tab-panel--active" data-dm-tab-panel="detail" role="tabpanel">
                            <div class="dm-editor__panel-header">
                                <h3>Detail zóny</h3>
                                <button type="button" class="dm-button dm-button--outline dm-button--small dm-editor__remove-zone" data-dm-remove-region${canRemoveRegion ? '' : ' disabled aria-disabled="true"'}>
                                    Vymazať
                                </button>
                            </div>
                            <div class="dm-editor__panel-content" data-dm-region-form>
                                <div class="dm-field">
                                    <input type="text" autocomplete="off" class="dm-field__input" data-dm-region-name placeholder=" " value="${escapeHtml(regionNameValue)}">
                                    <label class="dm-field__label">Názov zóny</label>
                                </div>
                                <div class="dm-field" style="margin-top: 1.5rem;">
                                    <button type="button" class="dm-field__info" aria-label="URL adresa zóny" data-tooltip="URL adresa zóny"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info-icon lucide-info"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></button>
                                    <input type="url" autocomplete="off" class="dm-field__input" data-dm-region-url placeholder=" " value="${escapeHtml(activeRegion?.url ?? '')}">
                                    <label class="dm-field__label">URL</label>
                                </div>
                                ${contextType === 'project'
            ? (() => {
                const settings = tableSettings ?? {
                    enabled: false,
                    scope: 'current',
                };
                return `
                                        <div class="dm-editor__fieldset dm-editor__fieldset--table">
                                                <label class="dm-toggle">
                                                    <input type="checkbox" data-dm-table-enabled${settings.enabled ? ' checked' : ''}>
                                                    <span>Zobraziť tabuľku lokalít pre aktuálnu mapu</span>
                                                </label>
                                            <p class="dm-toggle__hint">Zobrazí rovnaké stĺpce ako v dashboarde priamo pod mapou.</p>
                                            
                                            <div class="dm-field dm-field--compact" data-dm-table-scope-wrapper${settings.enabled ? '' : ' hidden'}>
                                                <select class="dm-field__input" data-dm-table-scope${settings.enabled ? '' : ' disabled'}>
                                                    <option value="current"${settings.scope === 'current' ? ' selected' : ''}>Aktuálna mapa</option>
                                                    <option value="hierarchy"${settings.scope === 'hierarchy' ? ' selected' : ''}>Aktuálna + podraadené</option>
                                                </select>
                                                <label class="dm-field__label">Rozsah tabuľky</label>
                                            </div>

                                            <div style="margin-top: 12px; padding-left: 2px;" data-dm-table-only-wrapper${settings.enabled ? '' : ' hidden'}>
                                                <label class="dm-toggle">
                                                    <input type="checkbox" data-dm-table-only${settings.tableonly ? ' checked' : ''}${settings.enabled ? '' : ' disabled'}>
                                                    <span>Zobraziť iba tabuľku bez obrázku</span>
                                                </label>
                                            </div>
                                        </div>
                                        `;
            })()
            : ''}
                            </div>
                        </div>
                        
                        <!-- Tab: Nadviazané lokality -->
                        <div class="dm-editor__tab-panel" data-dm-tab-panel="localities" role="tabpanel" hidden>
                            <div class="dm-editor__panel-header">
                                <h3>Nadviazané lokality</h3>
                            </div>
                            <div class="dm-editor__panel-content dm-editor__panel-content--scrollable">
                                ${contextType === 'project'
            ? hasLinkableRows
                ? `
                                            <button type="button" class="dm-button dm-button--primary dm-button--full-width" data-dm-open-localities-popup>
                                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                                                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                                                    <circle cx="12" cy="10" r="3"/>
                                                </svg>
                                                Upraviť prepojenia lokalít
                                            </button>
                                            <div class="dm-editor__localities-summary" data-dm-localities-summary>
                                                <p class="dm-editor__localities-count">Prepojených: <strong>${selectedChildKeys.size}</strong></p>
                                            </div>
                                            <div class="dm-editor__localities-stash" data-dm-localities-stash hidden>
                                                <table class="dm-localities-table dm-localities-table--stash" data-dm-localities-stash-table>
                                                    <tbody class="dm-localities-table__body" data-dm-region-children>
                                                        ${linkRowsMarkup}
                                                    </tbody>
                                                </table>
                                            </div>
                                        `
                : `
                                            <p class="dm-editor__empty-message">
                                                Žiadne dostupné prepojenia. Skontrolujte, či projekt obsahuje podriadené mapy alebo lokality.
                                            </p>
                                        `
            : `
                                        <p class="dm-editor__empty-message">
                                            V tomto režime nie sú dostupné prepojenia.
                                        </p>
                                    `}
                            </div>
                        </div>
                    </aside>
                </div>
                
                <!-- STICKY FOOTER: Actions -->
                <footer class="dm-editor__footer">
                    <button type="button" class="dm-button dm-button--outline" data-dm-reset-draw>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 01-9 9 9.75 9.75 0 01-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>
                        </svg>
                        Reset
                    </button>
                    <button type="button" class="dm-button dm-button--primary" data-dm-save-draw>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
                        </svg>
                        Uložiť a zatvoriť
                    </button>
                </footer>
            </div>
        </div>
    `;
}

function renderLocalitiesPopup() {
    return `
        <div class="dm-localities-popup-overlay" data-dm-localities-popup-overlay>
            <div class="dm-localities-popup">
                <header class="dm-localities-popup__header">
                    <h2>Prepojenia lokalít</h2>
                    <button type="button" class="dm-localities-popup__close" aria-label="Zavrieť" data-dm-close-localities-popup>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                </header>
                <div class="dm-localities-popup__body">
                    <table class="dm-localities-table">
                        <thead class="dm-localities-table__head">
                            <tr>
                                <th class="dm-localities-table__th dm-localities-table__th--sticky">Prepojenie</th>
                                <th class="dm-localities-table__th">Typ</th>
                                <th class="dm-localities-table__th">Názov</th>
                                <th class="dm-localities-table__th">Stav</th>
                            </tr>
                        </thead>
                        <tbody class="dm-localities-table__body" data-dm-localities-popup-body></tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function renderSimpleModal(title, body) {
    return `
        <div class="dm-modal-overlay">
            <div class="dm-modal dm-modal--narrow">
                <header class="dm-modal__header">
                    <h2>${title}</h2>
                    <button type="button" class="dm-modal__close" aria-label="Zavrieť" data-dm-close-modal>
                        <svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 25 25" fill="none">
                            <path fill-rule="evenodd" clip-rule="evenodd" d="M12.4841 15.5772L3.09313 24.9681L0 21.875L9.39094 12.4841L0 3.09313L3.09313 0L12.4841 9.39094L21.875 0L24.9681 3.09313L15.5772 12.4841L24.9681 21.875L21.875 24.9681L12.4841 15.5772Z" fill="#1C134F"/>
                        </svg>
                    </button>
                </header>
                <div class="dm-modal__body">${body}</div>
                <footer class="dm-modal__actions dm-modal__actions--split">
                    <button class="dm-button dm-button--outline" data-dm-close-modal>Zrušiť</button>
                    <button class="dm-button dm-button--dark">Uložiť</button>
                </footer>
            </div>
        </div>
    `;
}

function renderSimpleForm(placeholder) {
    return `
        <form class="dm-form">
            <div class="dm-field">
                <input required type="text" autocomplete="off" class="dm-field__input" />
                <label class="dm-field__label">${placeholder}</label>
            </div>
        </form>
    `;
}

function renderColorModal(data, payload) {
    const colorId = payload || 'color-1';
    const color = data.colors.find((c) => c.id === colorId) || data.colors[0];

    return `
        <div class="dm-modal-overlay">
            <div class="dm-modal dm-modal--narrow">
                <header class="dm-modal__header">
                    <h2>Upraviť farbu</h2>
                    <button type="button" class="dm-modal__close" aria-label="Zavrieť" data-dm-close-modal>
                        <svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 25 25" fill="none">
                            <path fill-rule="evenodd" clip-rule="evenodd" d="M12.4841 15.5772L3.09313 24.9681L0 21.875L9.39094 12.4841L0 3.09313L3.09313 0L12.4841 9.39094L21.875 0L24.9681 3.09313L15.5772 12.4841L24.9681 21.875L21.875 24.9681L12.4841 15.5772Z" fill="#1C134F"/>
                        </svg>
                    </button>
                </header>
                <div class="dm-modal__body">
                    <form class="dm-form">
                        <div class="dm-field">
                            <input 
                                type="color" 
                                value="${escapeHtml(color.value)}" 
                                data-dm-color-input="${escapeHtml(color.id)}"
                                autocomplete="off"
                                class="dm-field__input dm-field__input--color"
                                required
                            />
                            <label class="dm-field__label">${escapeHtml(color.label)}</label>
                        </div>
                        <div class="dm-field">
                            <input 
                                type="text" 
                                value="${escapeHtml(color.value)}" 
                                data-dm-color-text="${escapeHtml(color.id)}"
                                autocomplete="off"
                                class="dm-field__input"
                                required
                            />
                            <label class="dm-field__label">HEX kód</label>
                        </div>
                    </form>
                </div>
                <footer class="dm-modal__actions dm-modal__actions--split">
                    <button class="dm-button dm-button--outline" data-dm-close-modal>Zrušiť</button>
                    <button class="dm-button dm-button--dark" data-dm-save-color="${escapeHtml(color.id)}">Uložiť</button>
                </footer>
            </div>
        </div>
    `;
}
