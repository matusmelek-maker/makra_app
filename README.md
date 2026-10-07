# Makrá – kalórie, makrá a pohyb

Mobilná webová aplikácia (PWA), ktorá nahrádza Excel „kalorie - ja“.
Beží zadarmo cez GitHub Pages, funguje offline a dá sa pridať na plochu telefónu ako appka.

## Čo počíta (rovnako ako Excel)
- **Deň**: bilancia = zjedené − bazál (len ak je zapísané jedlo) − posilka − šport − kroky × koeficient × váha
- **Makrá**: sacharidy = cieľ + výdaj pohybom / 4,1; odchýlky bielkovín, tukov, vlákniny
- **Týždne**: súčet Po–Ne s farbami (< −2800 modrá, do −700 zelená, do 0 žltá, > 0 červená)
- **Štatistika**: zostáva spáliť = kg tuku × 7700 + súčet bilancií; grafy váhy, tuku a svalov, merania InBody
- **Kalkulačka**: plán makier (deficit, bielkoviny a tuky na kg, vláknina) – z neho sa počítajú denné ciele
- Bazál a koeficient krokov sa dajú meniť **od dátumu** (staré dni sa neprepočítajú)

## Jedlo z Kalorických tabuliek (iPhone)
V appke **Deň → Nahrať zo Zdravia**: appka spustí skratku „Makrá zo Zdravia“ s dátumom, tá prečíta Zdravie
(Kalorické tabuľky) a skopíruje údaje, po návrate ich appka vloží.
Návod: [NAVOD-SKRATKA.md](NAVOD-SKRATKA.md)

## Dáta
Ukladajú sa v telefóne (localStorage). Zálohu stiahneš v **Nastavenia → Stiahnuť zálohu** (JSON).
Automatická záloha do súkromného GitHub repozitára (s históriou verzií): [NAVOD-ZALOHA.md](NAVOD-ZALOHA.md).
Nahratie zálohy dáta zlúči, nič nemaže.
Prevod starého Excelu: `python tools/excel_to_json.py "kalorie.xlsx" moje-data/makra-import.json`
a potom v appke **Nahrať zálohu**.

## Spustenie lokálne
```
python -m http.server 8765
```
a otvor http://localhost:8765

## Zverejnenie (GitHub Pages)
1. Vytvor repozitár na GitHube a pushni tento priečinok (priečinok `moje-data/` je v .gitignore).
2. Settings → Pages → Source: *Deploy from a branch*, branch `main`, priečinok `/ (root)`.
3. Appka bude na `https://<meno>.github.io/<repo>/`.
4. V telefóne: iPhone – Safari → Zdieľať → *Pridať na plochu*; Android – Chrome → ⋮ → *Inštalovať aplikáciu*.

Pri zmene súborov zvýš `VERSION` v `sw.js`, aby sa telefón aktualizoval.
