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
6. Pridaj **Vypočítať štatistiku** (*Calculate Statistics*) → **Súčet** (*Sum*) zo **Zdravotných vzoriek**.
   - Ťukni na výsledok tejto akcie (bublina **Štatistika**) → **Premenovať** → **kcal**.

## Krok 4 – makrá (to isté 4×)
Podrž akciu 5 → **Duplikovať**, potom podrž akciu 6 → **Duplikovať** a presuň ju pod kópiu.
V kópii zmeň **len typ** a premenuj výsledok. Takto 4×:

| typ vzorky | premenuj výsledok na |
|---|---|
| Sacharidy (*Carbohydrates*) | **carbs** |
| Bielkoviny (*Protein*) | **protein** |
| Tuky celkom (*Total Fat*) | **fat** |
| Vláknina (*Fiber*) | **fiber** |

---

## Krok 5 – zbalenie a kopírovanie
7. Pridaj **Slovník** (*Dictionary*). Ťukaj **Pridať novú položku** a vyplň (kľúče malými písmenami):

   | typ položky | kľúč | hodnota |
   |---|---|---|
   | Text | `app` | napíš `makra-zdravie` |
   | Text | `date` | premenná **Vstup skratky** |
   | Číslo | `kcal` | premenná **kcal** |
   | Číslo | `carbs` | premenná **carbs** |
   | Číslo | `protein` | premenná **protein** |
   | Číslo | `fat` | premenná **fat** |
   | Číslo | `fiber` | premenná **fiber** |

8. Pridaj **Kopírovať do schránky** (*Copy to Clipboard*) → vstup **Slovník**.
9. *(voliteľné)* **Zobraziť oznámenie**: `Hotovo – vráť sa do Makrá`

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
- **Vychádzajú nuly** – medzi akciu 5 a 6 vlož **Získať podrobnosti o zdravotnej vzorke → Hodnota**
  (*Get Details of Health Samples → Value*) a štatistiku počítaj z nej (pre každé makro).
- **Appka hlási kJ** – v Zdraví prepni jednotku na kcal (krok 0).
- **„V schránke nie sú údaje“** – skratka neprebehla celá. Otvor ju v Skratkách a pozri, pri ktorej akcii je chyba.
- **Skratka sa nespustí** – názov musí byť presne rovnaký ako v appke Makrá → Nastavenia → *Názov skratky*.
- Kedykoľvek mi pošli screenshot skratky a pozriem, čo je zle.
