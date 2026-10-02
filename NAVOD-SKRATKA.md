# Skratka „Makrá zo Zdravia“ – návod krok za krokom (iPhone)

**Čo robí:** appka Makrá jej pošle dátum, skratka prečíta zo Zdravia kalórie a makrá
(tie tam zapisujú Kalorické tabuľky) a skopíruje ich. Ty ich potom v appke vložíš.

Vytvára sa **raz**, cca 10 minút. Potom ju už len spúšťaš tlačidlom v appke.

> Názvy sú po slovensky, v zátvorke po anglicky. Akciu vždy nájdeš tak, že dole ťukneš na
> **Hľadať v akciách** a napíšeš prvé slovo (napr. „zdrav“, „štatist“, „slovník“).

---

## Krok 0 – príprava v Zdraví (raz)
1. Otvor **Zdravie** → **Prehľadávať** → **Výživa** → **Energia v potrave**.
2. Úplne dole: **Jednotka** → vyber **kcal**.

---

## Krok 1 – nová skratka
1. Otvor appku **Skratky** → vpravo hore **+**.
2. Hore ťukni na názov → **Premenovať** → napíš presne: **Makrá zo Zdravia** → Hotovo.

---

## Krok 2 – dátum z appky
3. Pridaj akciu **Získať dátumy zo vstupu** (*Get Dates from Input*).
   Ťukni na modré slovo vo vnútri akcie → vyber **Vstup skratky** (*Shortcut Input*).
4. Pridaj akciu **Upraviť dátum** (*Adjust Date*).
   Nastav: **Pridať** · **1** · **deň** · k **Dátumy** (výsledok z akcie 3).

---

## Krok 3 – kalórie
5. Pridaj **Nájsť zdravotné vzorky** (*Find Health Samples*).
   - Ťukni na typ → **Energia v potrave** (*Dietary Energy*).
   - **Pridať filter** → **Dátum začiatku** → podmienka **je medzi** (*is between*).
   - Prvý dátum: podrž/ťukni → **Vybrať premennú** → **Dátumy** (akcia 3).
   - Druhý dátum: **Vybrať premennú** → **Upravený dátum** (akcia 4).
6. Pridaj **Získať podrobnosti o zdravotnej vzorke** (*Get Details of Health Sample*) → **Hodnota** (*Value*)
   zo **Zdravotných vzoriek**. Bez tohto kroku prídu kalórie ako 0 (pri gramoch to netreba).
7. Pridaj **Vypočítať štatistiku** (*Calculate Statistics*) → **Súčet** (*Sum*) z **Hodnota** (výsledok akcie 6).
   - Ťukni na výsledok tejto akcie (bublina **Štatistika**) → **Premenovať** → **kcal**.

## Krok 4 – makrá (to isté 4×)
Pre každé makro pridaj **Nájsť zdravotné vzorky** (rovnaký filter dátumu ako pri kalóriách) a pod ňu
**Vypočítať štatistiku → Súčet** zo **Zdravotných vzoriek** (tu krok „Hodnota“ netreba). Takto 4×:

| typ vzorky | premenuj výsledok na |
|---|---|
| Sacharidy (*Carbohydrates*) | **carbs** |
| Bielkoviny (*Protein*) | **protein** |
| Tuky celkom (*Total Fat*) | **fat** |
| Vláknina (*Fiber*) | **fiber** |

---

## Krok 5 – zbalenie a kopírovanie
8. Pridaj **Slovník** (*Dictionary*). Ťukaj **Pridať novú položku** a vyplň (kľúče malými písmenami):

   | typ položky | kľúč | hodnota |
   |---|---|---|
   | Text | `app` | napíš `makra-zdravie` |
   | Text | `date` | premenná **Vstup skratky** |
   | Číslo | `kcal` | premenná **kcal** |
   | Číslo | `carbs` | premenná **carbs** |
   | Číslo | `protein` | premenná **protein** |
   | Číslo | `fat` | premenná **fat** |
   | Číslo | `fiber` | premenná **fiber** |
   | Text | `kcal_list` | výsledok **Nájsť zdravotné vzorky** (Energia v potrave) |
   | Text | `carbs_list` | výsledok **Nájsť zdravotné vzorky** (Sacharidy) |
   | Text | `protein_list` | výsledok **Nájsť zdravotné vzorky** (Bielkoviny) |
   | Text | `fat_list` | výsledok **Nájsť zdravotné vzorky** (Tuky) |
   | Text | `fiber_list` | výsledok **Nájsť zdravotné vzorky** (Vláknina) |

   Položky `…_list` pošlú celý zoznam záznamov a appka si ich sčíta sama. Je to spoľahlivejšie,
   lebo „Vypočítať štatistiku“ občas vráti 0, hoci záznamy v Zdraví sú.

9. Pridaj **Kopírovať do schránky** (*Copy to Clipboard*) → vstup **Slovník**.
10. *(voliteľné)* **Zobraziť oznámenie**: `Hotovo – vráť sa do Makrá`

Hotovo, skratka je uložená automaticky.

---

## Ako to potom používaš
1. V appke **Makrá** → **Deň** → **Nahrať zo Zdravia**.
2. Dátum je dnešný – ak chceš iný deň, zmeň ho.
3. Ťukni **1. Načítať zo Zdravia** → otvorí sa Skratky a skratka prebehne
   (prvýkrát sa opýta na prístup k Zdraviu → **Povoliť všetko**).
4. Vráť sa do Makrá (vľavo hore **◀ Makrá** alebo potiahnutím).
5. Ťukni **2. Vložiť údaje** → **Vložiť**. Kalórie a makrá sú zapísané.

Skratku spúšťaj **z appky**, nie priamo zo Skratiek – appka jej posiela dátum.
Môžeš to spraviť aj viackrát za deň, vždy sa prepíše jedlo aktuálnym súčtom.

---

## Keď niečo nesedí
- **Kalórie prichádzajú 0, makrá áno** – medzi „Nájsť zdravotné vzorky (Energia v potrave)“ a jej „Vypočítať
  štatistiku“ vlož **Získať podrobnosti o zdravotnej vzorke → Hodnota** a v štatistike zmeň vstup na **Hodnota**.
  Kým to neopravíš, appka kalórie dopočíta z makier.
- **Aj makrá vychádzajú 0** – rovnaký krok **Hodnota** vlož aj pred štatistiky makier.
- **Appka hlási kJ** – v Zdraví prepni jednotku na kcal (krok 0).
- **„V schránke nie sú údaje“** – skratka neprebehla celá. Otvor ju v Skratkách a pozri, pri ktorej akcii je chyba.
- **Skratka sa nespustí** – názov musí byť presne rovnaký ako v appke Makrá → Nastavenia → *Názov skratky*.
- Kedykoľvek mi pošli screenshot skratky a pozriem, čo je zle.
