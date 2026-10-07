# Makrá – pokyny pre Clauda

## Komunikácia
- Odpovedaj **po slovensky**, stručne a zrozumiteľne – používateľ nie je programátor a často píše z mobilu (iPhone).
- Pred väčšou zmenou krátko povedz, čo urobíš. Nemeň jeho nastavenia ani dáta, pokiaľ o to nepožiada.
- Nikdy nepýtaj ani nevkladaj tokeny/heslá. Ak ich vloží do chatu, upozorni ho, nech token zmaže a vytvorí nový.

## Čo to je
Osobná PWA na kalórie, makrá a pohyb (náhrada Excelu). Vanilla JS ES moduly, **bez build kroku**.
Beží na GitHub Pages: https://matusmelek-maker.github.io/makra_app/ (z vetvy `main`, root).

## Pravidlá
- Repozitár je **verejný** – nikdy sem nedávaj osobné dáta (váhy, merania, exporty zo Zdravia, Excel, `moje-data/`).
- **Pri každej zmene súborov appky zvýš `VERSION` v `sw.js`** (`makra-vNN`), inak sa telefón neaktualizuje.
  Verzia sa zobrazuje v appke dole v Nastaveniach.
- Nasadenie = to, čo je na `main`. Ak pracuješ na inej vetve, otvor PR a povedz používateľovi,
  nech ho zlúči (GitHub appka → Pull request → Merge). Appka sa po pár minútach aktualizuje sama pri otvorení.
- Pred odovzdaním over syntax (`node --check app.js` atď.) a ideálne appku spusti: `python -m http.server 8765`.

## Súbory
- `index.html` – kostra, spodná lišta 5 záložiek: Deň, Týždne, Štatistika, Kalkulačka, Nastavenia.
- `app.js` – celé UI. `TITLES` + mapa `render` (kľúče `day`, `weeks`, `stats`, `calc`, `settings`).
  - Dáta v localStorage `makra-data-v1`; `save()` / `flush()`; `migrate()` dopĺňa nové polia starým dátam.
  - `renderDay` – karta „Kalórie a makrá“ (kruhový graf `foodRing`, bilancia, riadok kalórií + 4 makrá, `macroAdvice`),
    Pohyb (posilka, šport, kroky, kroky zo športu, váha), Poznámka. Prepočet v `updateDayComputed`.
  - Import zo Zdravia: `runHealthShortcut` → `pasteHealth` → `applyHealth` / `renderHealthBox`.
  - `renderStats` – kruh pokroku k cieľu (prvý), Prehľad tela, grafy (váha, tuk, svaly, zostávajúce kcal; `lineChart`), merania InBody.
  - `renderCalcTab` / `renderCalc` – „Môj plán makier“ (jediné miesto pre ciele makier, `settings.plan`).
  - `renderSettings` – cieľ, histórie bazál / koeficient krokov / TEF, Apple Zdravie, cloud záloha, záloha JSON (import **zlučuje**, s možnosťou vrátiť).
  - Zbaliteľné karty: `applyFold(view)`, trieda `foldable`/`collapsed`, stav v localStorage `makra-collapsed`; deti s `.keep` ostanú viditeľné.
- `calc.js` – čisté výpočty (`computeDay`, `computeWeeks`, `computeGoal`, `baseTargetsAt`, `valueAt` pre datované histórie).
- `health.js` – `parseHealthPayload` (JSON zo skratky; kľúče kcal, carbs, protein, fat, fiber, steps, sport_steps, sport, gym).
- `cloud.js` – automatická záloha cez GitHub Contents API do súkromného repa `makra_data` (`makra-data.json`);
  token je len v telefóne. Poistky: nepushuje nezmenené dáta, 0 dní ani pokles pod 50 % dní.
- `sw.js` – offline cache, same-origin, revalidácia (`cache: 'no-cache'`), reload pri novej verzii.
- `NAVOD-SKRATKA.md` (iOS skratka „Makrá zo Zdravia“), `NAVOD-ZALOHA.md` (token pre zálohu), `tools/` (prevod Excelu, ikony).

## Výpočty (zhodné s Excelom)
- bilancia = zjedené − pohyb − bazál − TEF; TEF (trávenie) = zjedené × tef% (datovaná história).
- pohyb = posilka + šport + (kroky − kroky zo športu) × koeficient × váha (kroky z behu sa nepočítajú dvakrát).
- kcal/g na výpočty 4,1 / 4,1 / 9 / 1 (sach./biel./tuky/vláknina); odhad kcal z etikety 4 / 4 / 9 / 2 (`kcalEst`).
- Ciele dňa: z `settings.plan` (deficit, bielkoviny g/kg, tuky g/kg, vláknina) podľa váhy a bazálu daného dňa;
  sacharidy sa zvyšujú o pohyb a TEF. Cieľ kcal = (základ + pohyb) / (1 − tef).
- Hodnotenie dňa: −100 až −400 kcal je ideál, pod −400 „príliš veľký deficit“, okolo 0 „rovnováha“.
- Bazál, koeficient krokov a TEF sú histórie `{from, value}` – staré dni sa neprepočítajú.

## Dáta zo Zdravia
Jedlo z Kalorických tabuliek, kroky z iPhonu, posilka = Active Energy so zdrojom Hevy. Beh (Strava, bez hodiniek)
zadáva ručne vrátane krokov z behu. Dietary Energy zo Zdravia chodí prázdne → kcal sa odhaduje z makier.

## Ďalej v pláne
1. **Postavička** v Štatistike, ktorá sa mení podľa trendov z InBody (tuk, svaly, prípadne asymetria).
2. InBody PDF → merania automaticky.
3. Voliteľne: sledovanie spánku zo Zdravia, obrazovka „Doplniť viac dní“ naraz.
