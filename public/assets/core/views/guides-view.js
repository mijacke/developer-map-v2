function formatNumber(value) {
    return typeof value === 'number' ? value.toLocaleString('sk-SK') : '0';
}

export function renderGuidesView(state, data) {
    const projects = Array.isArray(data.projects) ? data.projects : [];
    const totalFloors = projects.reduce((sum, project) => sum + (project?.floors?.length ?? 0), 0);
    const seenLocalityIds = new Set();
    const seenRegionIds = new Set();

    const registerCollection = (collection, seen, fallbackPrefix) => {
        if (!collection) {
            return;
        }
        if (Array.isArray(collection)) {
            collection.forEach((item, index) => {
                const candidate = item?.id ?? item?.localityId ?? item?.regionId ?? item?.key ?? `${fallbackPrefix}-${index}`;
                seen.add(String(candidate));
            });
            return;
        }
        if (typeof collection === 'object') {
            let index = 0;
            Object.entries(collection).forEach(([objectKey, item]) => {
                const candidate = item?.id ?? item?.localityId ?? item?.regionId ?? item?.key ?? objectKey ?? `${fallbackPrefix}-obj-${index}`;
                seen.add(String(candidate));
                index += 1;
            });
        }
    };

    projects.forEach((project, projectIndex) => {
        registerCollection(project?.localities, seenLocalityIds, `project-${projectIndex}-locality`);
        registerCollection(project?.regions, seenRegionIds, `project-${projectIndex}-region`);

        const floors = Array.isArray(project?.floors) ? project.floors : [];
        floors.forEach((floor, floorIndex) => {
            registerCollection(floor?.localities, seenLocalityIds, `project-${projectIndex}-floor-${floorIndex}-locality`);
            registerCollection(floor?.regions, seenRegionIds, `project-${projectIndex}-floor-${floorIndex}-region`);
        });
    });

    const totalUnits = seenLocalityIds.size;
    const totalRegions = seenRegionIds.size;
    const statusCount = Array.isArray(data.statuses) ? data.statuses.length : 0;
    const typeCount = Array.isArray(data.types) ? data.types.length : 0;
    const colorCount = Array.isArray(data.colors) ? data.colors.length : 0;
    const fontCount = Array.isArray(data.availableFonts) ? data.availableFonts.length : 0;

    const stats = [
        { label: 'Počet máp', value: projects.length },
    { label: 'Počet lokalít', value: totalFloors },
    { label: 'Počet typov', value: typeCount },
    { label: 'Počet stavov', value: statusCount },
    { label: 'Základné farby', value: colorCount },
    { label: 'Dostupné fonty', value: fontCount },
    ];

    const glossary = [
        {
            caption: 'Projekt / mapa',
            detail: 'Najvyššia jednotka so svojím obrázkom, názvom a voliteľnými podprojektmi.',
        },
        {
            caption: 'Lokalita',
            detail: 'Konkrétny byt, kancelária alebo poschodie. Nesie parametre vrátane typu, stavu a ceny.',
        },
        {
            caption: 'Región',
            detail: 'Klikateľný polygon v editore súradníc, ktorý smeruje na lokalitu alebo podprojekt.',
        },
        {
            caption: 'Typ',
            detail: 'Kategória lokality (Byt, Pozemok, Retail…). Každý má vlastnú farbu využitú v rozhraní.',
        },
        {
            caption: 'Stav',
            detail: 'Obchodný status (Voľné, Rezervované, Predané…). Riadi farbu prekrytia aj filtre.',
        },
        {
            caption: 'Paleta farieb',
            detail: 'Sada UI farieb pre tlačidlá, texty a legendu. Prenáša sa do administrácie aj widgetu.',
        },
        {
            caption: 'Font',
            detail: 'Globálne písmo aplikované v dashboarde aj embednutej mape.',
        },
        {
            caption: 'Shortcode / public key',
            detail: 'Identifikátor projektu na vloženie do obsahu alebo headless integrácie.',
        },
    ];

    const requirements = [
        'WordPress 5.0+ (odporúčané 6.0+) a PHP 7.4+.',
        'Modernejší prehliadač s podporou ES6 modulov.',
        'Používateľ s oprávnením `manage_options` alebo dedikovanou rolou „Map editor“.',
    ];

    const firstRun = [
        'Nahrajte priečinok `developer-map` do `wp-content/plugins/` a aktivujte doplnok.',
        'V menu Nastavenia → Developer Map sa načíta SPA rozhranie s demo dátami.',
        'Predvolene sa vytvoria typy, stavy, farebná schéma a font Inter pre rýchly štart.',
    ];

    const steps = [
        {
            title: 'Inštalácia & prístup',
            items: [
                'Aktivujte plugin v Správcovi doplnkov a otvorte Nastavenia → Developer Map.',
                'Skontrolujte, že máte rolu s oprávnením `manage_options`; odporúčame vytvoriť vyhradenú rolu „Map editor“.'
            ],
        },
        {
            title: 'Prvé dáta',
            items: [
                'Kliknite na „Pridať mapu“, pomenujte projekt, nastavte typ, názov a nahrajte obrázok (fotka projektu alebo pôdorys).',
                'Pre každý projekt pridajte poschodia/lokality. Zadajte špecifikáciu, cenu, stav, typ a odkazy na media.'
            ],
        },
        {
            title: 'Editor súradníc',
            items: [
                'V mapovom riadku otvorte „Editor súradníc“, vyberte obrázok a kreslite viacuholníky nad jednotkami.',
                'Každý región priraďte k lokalite alebo podprojektu. Farba sa dedí zo stavu, dá sa potom jemne doladiť.'
            ],
        },
        {
            title: 'Frontend & shortcode',
            items: [
                'Z riadka „Vloženie na web“ skopírujte shortcode `[developer_map id="public-key"]`.',
                'Vložte ho do Gutenberg bloku, šablóny alebo page buildera. Widget automaticky načíta mapu aj tabuľku.'
            ],
        },
    ];

    const bestPractices = [
        {
            caption: 'Čistota dát',
            detail: 'Využívajte typy na segmentáciu (Byt, Pozemok, Retail). Každý stav nech má jedinečnú farbu, aby legenda bola čitateľná.',
        },
        {
            caption: 'Bezpečné úpravy',
            detail: 'Pred väčším importom si exportujte `wp_options` kľúč `developer_map_data`. Údaje sú uložené serializované, takže záloha cez WP-CLI je najrýchlejšia.',
        },
        {
            caption: 'Výkon frontendu',
            detail: 'Optimalizujte obrázky na šírku 1600 px. PNG s alfa vrstvou funguje najlepšie pre presné regióny.',
        },
    ];

    const projectManagement = [
        {
            title: 'Pridanie projektu',
            steps: [
                'V pohľade Mapy kliknite na „Pridať mapu“.',
                'Vyplňte názov, typ, nadradenosť.',
                'Nahrajte náhľadový obrázok projektu či pôdorysu a uložte zmeny.',
            ],
        },
        {
            title: 'Pridanie lokality',
            steps: [
                'Otvoríte modal „Pridať lokalitu“ priamo v riadku projektu alebo v Dashboarde.',
                'Zadajte typ, stav, plochu, cenu/prenájom a prípadne vlastný pôdorys.',
                'Po uložení je lokalita dostupná pre editor súradníc aj frontend.',
            ],
        },
        {
            title: 'Editor súradníc',
            steps: [
                'Spustite akciu „Editor súradníc“ pri projekte alebo lokalite.',
                'Nakreslite polygóny nad obrázkom, každý priraďte existujúcej lokalite či podprojektu.',
                'Farba sa dedí zo stavu, takže legenda a prekrytie ostanú synchronizované.',
            ],
        },
        {
            title: 'Obrázky a médiá',
            steps: [
                'Využívajte WordPress Media Library (JPG/PNG/WebP).',
                'Odporúčaná šírka je 1600 px, pri zmene obrázka skontrolujte polygóny.',
                'Editor udržiava proporcie, no pri zmenách treba polygóny potvrdiť.',
            ],
        },
    ];

    const shortcodeAttributes = [
        {
            name: 'map_key',
            detail: 'Povinný identifikátor projektu. Nájdete ho v stĺpci „Vloženie na web“ alebo v detaile projektu.',
        },
        {
            name: 'show_table',
            detail: '`0` alebo `1`. Povolením zobrazíte pod mapou tabuľku lokalít s filtrami.',
        },
        {
            name: 'table_mode',
            detail: '`current` = len lokality projektu, `hierarchy` = aj podprojekty/podlažia.',
        },
        {
            name: 'include_parent',
            detail: '`0` alebo `1`. Pri režime `hierarchy` pridá aj lokality nadradeného projektu.',
        },
    ];

    const frontendHighlights = [
        {
            title: 'Interaktívna mapa',
            items: [
                'SVG prekrytie reaguje na hover a klik, otvorí popover s detailom lokality.',
            ],
        },
        {
            title: 'Legenda & filtre',
            items: [
                'Legenda stavov sa generuje automaticky podľa palety projektu.',
                'Filtre a vyhľadávanie sú dostupné aj na embednutej mape, ak je zapnutá tabuľka.',
            ],
        },
        {
            title: 'Responzívna tabuľka',
            items: [
                'Vyhľadávanie podľa názvu, označenia a parametrov lokality.',
                'Triedenie ceny (ASC/DESC) a zobrazenie prenájmu či dostupnosti v reálnom čase.',
            ],
        },
        {
            title: 'Optimalizácia',
            items: [
                'Cache-busting query parameter `?ver=` zaručuje čerstvé dáta.',
                'Polygóny sa prispôsobujú viewportu, aby ostala mapa ostrá aj na mobiloch.',
            ],
        },
    ];

    const dataSecurity = [
        {
            title: 'REST API & storage',
            items: [
                'Dáta sa ukladajú cez REST `developer-map/v1` – endpointy `/list`, `/set`, `/project`, `/image`.',
                'Hodnoty sa ukladajú do `wp_options` (kľúč `dm_data_store`) a sú serializované.',
            ],
        },
        {
            title: 'Prístupy & oprávnenia',
            items: [
                'Admin rozhranie vyžaduje používateľa s capability `manage_options`.',
                'Frontend endpoint `/project` vracia len anonymizované dáta podľa public key.',
            ],
        },
        {
            title: 'Offline & médiá',
            items: [
                'Storage klient spracúva zápisy optimisticky a pri výpadku opakuje pokus (max. 5x).',
                'Nahrávanie médií využíva WordPress nonce a oprávnenie `upload_files`.',
            ],
        },
    ];

    const maintenance = [
        {
            title: 'Údržba & bezpečnosť',
            items: [
                'Zálohujte databázu vrátane `wp_options` kľúča `developer_map_data`.',
                'Capability `DM_SETTINGS_CAPABILITY` nemeňte, pokiaľ vedome nerozširujete prístup.',
            ],
        },
        {
            title: 'Riešenie problémov',
            items: [
                '„Chýba identifikátor mapy“ – skontrolujte `map_key` v shortcodoch a existenciu projektu.',
                'Po výmene hlavného obrázka otvorte editor súradníc a potvrďte polygóny pre reskalovanie.',
                'Pri nesprávnych farbách vyprázdnite cache (pluginy, CDN). Pre veľké projekty optimalizujte obrázky.',
            ],
        },
    ];

    return `
        <section class="dm-main-surface dm-guides">
            <header class="dm-main-surface__header dm-guides__header">
                <div class="dm-guides__intro">
                    <p class="dm-guides__eyebrow">Návody</p>
                    <h1>Centrum návodov pre Developer Map</h1>
                    <p>Kompletný sprievodca, ktorý pokrýva inštaláciu, správu dát, kreslenie regiónov aj zdieľanie máp na webe. Postupujte podľa krokov nižšie a celý plugin zvládnete bez asistencie developera.</p>
                </div>
                <div class="dm-guides__stats">
                    ${stats
                        .map(
                            (stat) => `
                                <div class="dm-guides__stat">
                                    <span>${stat.label}</span>
                                    <strong>${formatNumber(stat.value)}</strong>
                                </div>
                            `
                        )
                        .join('')}
                </div>
            </header>
            <div class="dm-main-surface__content dm-guides__content">
                <article class="dm-guides__card dm-guides__card--start">
                    <h2>Čo plugin poskytuje</h2>
                    <p>Developer Map je vnorený SPA modul. Prepája zoznam projektov, detailný dashboard lokalít a editor súradníc. Každé z troch hlavných zobrazení v top bare má jasnú úlohu:</p>
                    <ul>
                        <li><strong>Mapy:</strong> Prehľad všetkých projektov, hierarchia podprojektov, vyhľadávanie a rýchle akcie.</li>
                        <li><strong>Dashboard:</strong> Detailné tabuľky jednotiek s filtrami, úpravami a prepojením na modal Editor.</li>
                        <li><strong>Nastavenia:</strong> Správa typov, stavov, farebnej palety a fontov, ktoré sa premietnu aj na frontend.</li>
                    </ul>
                    <p class="dm-guides__note">Tip: Ak sa stratíte v štruktúre, kliknutím na logo Developer Map sa vždy vrátite do zoznamu máp.</p>
                </article>
                <article class="dm-guides__card">
                    <h2>Základná terminológia</h2>
                    <div class="dm-guides__pill-grid">
                        ${glossary
                            .map(
                                (item) => `
                                    <div class="dm-guides__pill">
                                        <strong>${item.caption}</strong>
                                        <p>${item.detail}</p>
                                    </div>
                                `
                            )
                            .join('')}
                    </div>
                </article>
                <article class="dm-guides__card">
                    <h2>Technické požiadavky &amp; prvé kroky</h2>
                    <section>
                        <h3>Minimum pre nasadenie</h3>
                        <ul>
                            ${requirements.map((item) => `<li>${item}</li>`).join('')}
                        </ul>
                    </section>
                    <section>
                        <h3>Prvé spustenie</h3>
                        <ol>
                            ${firstRun.map((item) => `<li>${item}</li>`).join('')}
                        </ol>
                    </section>
                    <p class="dm-guides__note">Po aktivácii je aplikácia dostupná v Nastavenia → Developer Map a načíta existujúce projekty.</p>
                </article>
                <article class="dm-guides__card dm-guides__card--workflow">
                    <h2>Workflow v 4 krokoch</h2>
                    <div class="dm-guides__steps">
                        ${steps
                            .map(
                                (step, index) => `
                                    <div class="dm-guides__step">
                                        <div class="dm-guides__step-index">${index + 1}</div>
                                        <div>
                                            <h3>${step.title}</h3>
                                            <ul>
                                                ${step.items.map((item) => `<li>${item}</li>`).join('')}
                                            </ul>
                                        </div>
                                    </div>
                                `
                            )
                            .join('')}
                    </div>
                </article>
                <article class="dm-guides__card">
                    <h2>Práca s mapami a lokalitami</h2>
                    <div class="dm-guides__subgrid">
                        ${projectManagement
                            .map(
                                (section) => `
                                    <section>
                                        <h3>${section.title}</h3>
                                        <ol>
                                            ${section.steps.map((item) => `<li>${item}</li>`).join('')}
                                        </ol>
                                    </section>
                                `
                            )
                            .join('')}
                    </div>
                </article>
                <article class="dm-guides__card dm-guides__card--customize">
                    <h2>Prispôsobenie vzhľadu</h2>
                    <div class="dm-guides__subgrid">
                        <section>
                            <h3>Typy & stavy</h3>
                            <p>Nastavenia → Typy / Stavy. Každá položka má vlastnú farbu a štítok. Pri projektoch a lokalitách vyberte kombináciu, ktorá sa prenesie do tabuliek, legendy aj prekrytých regiónov.</p>
                        </section>
                        <section>
                            <h3>Farby & font</h3>
                            <p>Farebná paleta definuje tlačidlá, nadpisy a texty na frontende. Vybraný font (Inter, Roboto, Poppins…) sa bez reloadu aplikuje v administrácii aj widgete.</p>
                        </section>
                        <section>
                            <h3>Legenda & filtre</h3>
                            <p>Widget automaticky skladá legendu zo stavov. Ak chcete mať menej farieb, zlučte stavy a použite vlastné označenie (napr. „Voľné do 6 mesiacov“).</p>
                        </section>
                    </div>
                </article>
                <article class="dm-guides__card">
                    <h2>Frontend mapový widget</h2>
                    <div class="dm-guides__subgrid">
                        ${frontendHighlights
                            .map(
                                (section) => `
                                    <section>
                                        <h3>${section.title}</h3>
                                        <ul>
                                            ${section.items.map((item) => `<li>${item}</li>`).join('')}
                                        </ul>
                                    </section>
                                `
                            )
                            .join('')}
                    </div>
                </article>
                <article class="dm-guides__card dm-guides__card--embed">
                    <h2>Vkladanie na web</h2>
                    <ol>
                        <li>V module Mapy skopírujte shortcode konkrétneho projektu.</li>
                        <li>Vytvorte Gutenberg blok „Shortcode“ alebo použite PHP vloženie <code>echo do_shortcode('[developer_map id="PK-123"]');</code>.</li>
                        <li>Widget zobrazí obrázok, prekrytie a tabuľku. V JSON konfigurácii môžete zapnúť/ vypnúť vyhľadávanie, filtre aj cenník.</li>
                    </ol>
                    <p class="dm-guides__note">Pre headless weby využite REST endpoint definovaný v <code>window.dmFrontendConfig.endpoint</code> – vracia projekty v rovnakom formáte ako admin.</p>
                    <div class="dm-guides__subgrid">
                        ${shortcodeAttributes
                            .map(
                                (attr) => `
                                    <section>
                                        <h3><code>${attr.name}</code></h3>
                                        <p>${attr.detail}</p>
                                    </section>
                                `
                            )
                            .join('')}
                    </div>
                </article>
                <article class="dm-guides__card dm-guides__card--best">
                    <h2>Best practices</h2>
                    <div class="dm-guides__pill-grid">
                        ${bestPractices
                            .map(
                                (item) => `
                                    <div class="dm-guides__pill">
                                        <strong>${item.caption}</strong>
                                        <p>${item.detail}</p>
                                    </div>
                                `
                            )
                            .join('')}
                    </div>
                </article>
                <article class="dm-guides__card">
                    <h2>Ukladanie dát &amp; prístup</h2>
                    <div class="dm-guides__subgrid">
                        ${dataSecurity
                            .map(
                                (section) => `
                                    <section>
                                        <h3>${section.title}</h3>
                                        <ul>
                                            ${section.items.map((item) => `<li>${item}</li>`).join('')}
                                        </ul>
                                    </section>
                                `
                            )
                            .join('')}
                    </div>
                </article>
                <article class="dm-guides__card dm-guides__card--support">
                    <h2>Kontroly & riešenie problémov</h2>
                    <div class="dm-guides__checks">
                        ${maintenance
                            .map(
                                (section) => `
                                    <section>
                                        <h3>${section.title}</h3>
                                        <ul>
                                            ${section.items.map((item) => `<li>${item}</li>`).join('')}
                                        </ul>
                                    </section>
                                `
                            )
                            .join('')}
                    </div>
                </article>
            </div>
        </section>
    `;
}
