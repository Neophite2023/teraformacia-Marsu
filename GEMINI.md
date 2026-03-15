# Projektové pokyny (Teraformácia Marsu)

Tento súbor rozširuje globálne pravidlá a pridáva špecifické príkazy pre tento projekt.

# Vývojové princípy
- Dodržiavaj TDD (najprv testy, potom kód).
- Automaticky spúšťaj testy (`!test`) po každom pridaní novej funkcie alebo vlastnosti do kódu hry bez potreby súhlasu používateľa.
- Vždy komunikuj v slovenčine.
- Pred opravou chýb vykonaj analýzu príčiny (RCA).

# Vlastné príkazy (Shortcuts)

## !github
1. **Kontrola:** Zisti, či je v projekte inicializovaný Git a či je nastavený vzdialený repozitár (remote 'origin').
2. **URL repozitára:** Ak remote 'origin' neexistuje, vypýtaj si URL adresu GitHub repozitára a nastav ho.
3. **Príprava:** Vykonaj `git add .` pre všetky zmeny.
4. **Commit:** Navrhni výstižnú commit správu v slovenčine podľa pravidiel Conventional Commits.
5. **Push:** Po potvrdení commit správy vykonaj `git commit` a následne `git push`.

## !test
1. **Identifikácia:** Zisti nakonfigurované nástroje (Vitest, ESLint, TypeScript).
2. **Statická kontrola:** Spusti linter (`npm run lint` alebo `npx eslint .`) a typovú kontrolu (`npx tsc`).
3. **Testy:** Spusti všetky unit testy pomocou `npm test` alebo `npx vitest run`.
4. **Report:** Poskytni prehľadný súhrn výsledkov.

## !fix
1. **Oprava:** Spusti dostupné automatické opravy: `npx eslint --fix .`.
2. **Formátovanie:** Ak je prítomný Prettier, spusti `npx prettier --write .`.
3. **Validácia:** Po opravách automaticky spusti `!test`.
4. **Report:** Informuj o počte upravených súborov a aktuálnom stave projektu.

## !system
1. **Vstup:** Vypýtaj si od používateľa názov nového herného systému.
2. **Štruktúra:** Vytvor nový súbor v `systems/<nazov>.ts` so základnou implementáciou.
3. **TDD:** Vytvor prislúchajúci testovací súbor v `src/test/<nazov>.test.ts` s počiatočným testom.
4. **Integrácia:** Navrhni miesta v kóde (napr. `App.tsx` alebo `GameCanvas.tsx`), kde je potrebné nový systém zaregistrovať.

## !audit
1. **Zabezpečenie:** Spusti `npm audit` na identifikáciu zraniteľností.
2. **Závislosti:** Skontroluj nepoužívané balíčky (napr. pomocou `npx depcheck`, ak je k dispozícii).
3. **Odporúčanie:** Navrhni kroky na aktualizáciu alebo vyčistenie projektu.

## !doc
1. **Analýza:** Prejdi priečinky `systems/` a `components/` a zisti aktuálny stav exportov.
2. **README:** Aktualizuj sekciu "Prehľad systémov" v súbore `README.md` podľa zistených zmien.
3. **Metadata:** Ak je to relevantné, aktualizuj `metadata.json`.

## !refactor
1. **Prieskum:** Identifikuj súbor s najväčšou zložitosťou alebo dĺžkou (zameraj sa na `systems/` alebo `App.tsx`).
2. **Návrh:** Navrhni 3 konkrétne vylepšenia (rozdelenie funkcií, extrakcia do utils, zjednodušenie logiky).
3. **Implementácia:** Čakaj na schválenie jedného z návrhov.
