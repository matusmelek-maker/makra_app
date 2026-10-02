# Skratka „Makrá zo Zdravia“ (iPhone)

Kalorické tabuľky zapisujú jedlo do Apple Zdravia. Skratka prečíta dnešné kalórie a makrá a skopíruje ich do schránky.
Potom ich jedným ťuknutím vložíš do appky Makrá.

> Názvy akcií sú po slovensky; v zátvorke je anglický názov. Ak nejakú nevieš nájsť,
> v Skratkách hľadaj slovo **Zdravie** / **Health**.

## 0. Jednorazová príprava v Zdraví
**Zdravie → Prehľadávať → Výživa → Energia v potrave** → úplne dole **Jednotka → kcal** (nie kJ).
Tam isto skontroluj, že v **Zdroje dát a prístup** sú Kalorické tabuľky povolené pre zápis.

## 1. Vytvorenie skratky
Appka **Skratky → +** → pomenuj ju **Makrá zo Zdravia**. Pridaj tieto akcie v tomto poradí:

**Kalórie**
1. **Nájsť zdravotné vzorky** (*Find Health Samples*)
   - ťukni na typ → **Energia v potrave** (*Dietary Energy*)
   - **Pridať filter** → **Dátum začiatku** · **je dnes** (*Start Date is Today*)
   - Limit nechaj vypnutý
2. **Vypočítať štatistiku** (*Calculate Statistics*) → **Súčet** (*Sum*) zo **Zdravotných vzoriek**
   - výsledok si premenuj na **kcal** (ťukni na výsledok akcie → *Premenovať*)

**Makrá**: rovnaké dve akcie ešte 4×. Tip: podrž akcie 1–2 → *Duplikovať* a zmeň iba typ.

| typ vzorky | premenuj výsledok na |
|---|---|
| Sacharidy (*Carbohydrates*) | carbs |
| Bielkoviny (*Protein*) | protein |
| Tuky celkom (*Total Fat*) | fat |
| Vláknina (*Fiber*) | fiber |

**Dátum**

3. **Formátovať dátum** (*Format Date*): **Aktuálny dátum**, formát **Vlastný** → `yyyy-MM-dd`

**Zostavenie a kopírovanie**

4. **Slovník** (*Dictionary*): pridaj položky (kľúče musia byť presne takto, malými písmenami):

   | kľúč | typ | hodnota |
   |---|---|---|
   | app | Text | `makra-zdravie` |
   | date | Text | *Formátovaný dátum* |
   | kcal | Číslo | *kcal* |
   | carbs | Číslo | *carbs* |
   | protein | Číslo | *protein* |
   | fat | Číslo | *fat* |
   | fiber | Číslo | *fiber* |

5. **Kopírovať do schránky** (*Copy to Clipboard*): **Slovník**
6. *(voliteľné)* **Zobraziť oznámenie**: `Skopírované – otvor Makrá a ťukni Zo Zdravia`

## 2. Spúšťanie jedným tlačidlom
- **Akčné tlačidlo** (iPhone 16 Pro): Nastavenia → Akčné tlačidlo → **Skratka** → *Makrá zo Zdravia*
- alebo widget Skratky na ploche
- alebo Nastavenia → Prístupnosť → Dotyk → **Ťuknutie na zadnú stranu**

## 3. Použitie
1. Spusti skratku (prvýkrát sa opýta na prístup k Zdraviu → *Povoliť*).
2. Otvor **Makrá** → **Deň** → **Zo Zdravia** → iPhone ukáže bublinu **Vložiť** → ťukni.
3. Kalórie a makrá sa vyplnia (tlačidlo **Vrátiť** to zruší). Kroky a posilku dopíšeš ako doteraz.

Skratku môžeš spustiť aj viackrát za deň – vždy prepíše jedlo za daný deň aktuálnym súčtom.

## Keď niečo nesedí
- **Hodnoty sú 0** – medzi akcie 1 a 2 vlož **Získať podrobnosti o zdravotnej vzorke → Hodnota**
  (*Get Details of Health Sample → Value*) a štatistiku počítaj z nej.
- **Appka hlási kJ** – v Zdraví prepni jednotku energie na kcal (krok 0).
- **„V schránke nie sú údaje“** – skratka sa nespustila celá, alebo si medzitým skopíroval niečo iné.
