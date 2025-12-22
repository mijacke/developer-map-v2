# Developer Map

WordPress plugin pre správu developerských projektov s interaktívnymi mapami pôdorysov.

## Požiadavky

- WordPress 6.0+
- PHP 8.0+
- Moderný prehliadač s podporou ES Modules

## Inštalácia

1. Nahrať priečinok pluginu do `/wp-content/plugins/`
2. Aktivovať plugin v WordPress admin paneli
3. Nastavenia → Developer Map

## Shortcode

```
[dm_map map_key="nazov-mapy"]
```

## Funkcie

- Správa viacerých projektov a lokalít
- Interaktívne SVG mapy s kreslením zón
- Vlastné typy lokalít a stavy
- Nastaviteľné farby, fonty a témy
- REST API pre frontend zobrazenie

## Štruktúra

```
developer-map-v2/
├── developer-map.php
├── includes/
│   ├── api/          # REST API
│   └── core/         # Storage
└── assets/
    ├── css/
    ├── js/admin/     # Admin dashboard
    ├── js/frontend/  # Map viewer
    └── icons/
```

## Verzia

**0.5.0** - Aktuálna verzia s vylepšenou architektúrou

## Autor

Mario
