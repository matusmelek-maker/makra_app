# Automatická záloha na GitHub – návod (raz, cca 5 minút)

Appka Makrá potom po každej zmene sama pošle zálohu (JSON) do tvojho **súkromného** repozitára
`matusmelek-maker/makra_data`. Na GitHube ostáva história všetkých verzií, takže sa dá vrátiť
aj k staršej. Repozitár je súkromný – vidíš ho len ty.

Na to appka potrebuje **token** – kľúč, ktorý smie zapisovať **iba** do repozitára `makra_data`.

---

## 1. Vytvor token
Najľahšie na počítači (na iPhone v Safari to ide tiež):

1. Prihlás sa na GitHub a otvor **https://github.com/settings/personal-access-tokens/new**
   (*Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token*).
2. **Token name:** `Makrá záloha`
3. **Expiration:** vyber najdlhšiu možnosť (napr. 1 rok). Keď token vyprší, appka ti to napíše
   a vytvoríš nový.
4. **Repository access:** **Only select repositories** → vyber **makra_data**.
5. **Permissions → Repository permissions → Contents** → **Read and write**.
   (*Metadata: Read-only* sa zapne samo, nič iné netreba.)
6. Dole **Generate token** a token **skopíruj** – začína `github_pat_…` a GitHub ti ho ukáže iba raz.
   Ak ho robíš na počítači, pošli si ho do iPhonu (napr. cez Poznámky alebo AirDrop) a potom ho odtiaľ zmaž.

## 2. Vlož token do appky
1. V iPhone otvor appku **Makrá** → **Nastavenia** → **Automatická záloha**.
2. Repozitár nechaj `matusmelek-maker/makra_data`, do poľa **Token** vlož skopírovaný token.
3. Ťukni **Uložiť a zálohovať teraz** → má sa ukázať **✓ Posledná záloha …**.

Hotovo. Odteraz sa zálohuje samo – pri zmene (najviac raz za 1,5 minúty) a vždy, keď appku zavrieš.

---

## Keď niečo potrebuješ
- **Nový telefón / appka sa stratila:** pridaj appku na plochu, v Nastaveniach vlož token a ťukni
  **Obnoviť z GitHubu**.
- **Staršia verzia:** na GitHube v repozitári `makra_data` → súbor `makra-data.json` → **History**.
  Alebo povedz Claudovi, nech ju stiahne.
- **„Token je neplatný alebo vypršal“:** sprav nový token podľa kroku 1 a vlož ho (Odpojiť → vložiť nový).
- **„Automatické zálohovanie som zastavil“:** v telefóne je oveľa menej dní ako v poslednej zálohe
  (napr. po vymazaní). Appka tak chráni zálohu pred prepísaním. Ak je to v poriadku, ťukni **Zálohovať teraz**,
  inak najprv **Obnoviť z GitHubu**.
- Token je uložený len v tomto telefóne, nie je v zálohe ani v kóde appky. Smie čítať a zapisovať
  iba repozitár `makra_data`.
