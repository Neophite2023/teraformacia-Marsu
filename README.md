<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Teraformácia Marsu

Projekt zameraný na simuláciu kolonizácie a pretvárania povrchu Marsu. Hráč buduje základne, ťaží suroviny a bojuje s nepriateľskými stvoreniami.

## Herné systémy (Systems)

Projekt je rozdelený na špecializované systémy, ktoré riadia logiku hry:

- **buildingSystem & buildingActions**: Správa stavieb, ich umiestňovanie a interakcie.
- **creatureSystem**: Logika nepriateľských a neutrálnych bytostí na povrchu.
- **harvesterSystem**: Komplexná správa ťažby surovín a logistiky (najväčší systém projektu). Zahŕňa AI pre MINER a TANKER vozidlá vrátane obchádzania prekážok.
- **terraformingSystem**: Simulácia zmeny prostredia a podmienok na planéte.
- **worldGenerator**: Procedurálne generovanie terénu Marsu.
- **fogOfWarSystem**: Implementácia "hmly vojny" pre postupné odhaľovanie mapy.
- **projectileSystem**: Správa projektilov a bojových interakcií.

## Pomocné nástroje (Utilities)

- **grid**: Efektívna správa priestorového vyhľadávania (Spatial Hash Grid).
- **inventory**: Logika správy a výmeny surovín.
- **math**: Matematické funkcie pre výpočty vzdialeností, uhlov a kolízií.
- **speech**: Integrácia AI syntézy hlasu pre herné oznámenia.

## Komponenty rozhrania (Components)

- **GameCanvas**: Hlavné vykresľovacie jadro hry (React + Canvas).
- **UIOverlay**: Komplexné používateľské rozhranie pre správu zdrojov a stavieb.
- **LoadingScreen**: Inicializačná obrazovka so správou prostriedkov a shader warm-upom.
- **MainMenu & IntroOverlay**: Úvodné obrazovky a navigácia v hre.
- **SoundManager**: Správa zvukových efektov a hudby.

## Lokálne spustenie

**Prerequisites:** Node.js

1.  **Inštalácia závislostí:**
    `npm install`
2.  **Spustenie vývojového servera:**
    `npm run dev`
3.  **Zostavenie projektu (Build):**
    `npm run build`
