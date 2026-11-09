# Δήλωση εισοδημάτων Trading 212 στο Ε1 (φορολογικό έτος 2025, υποβολή 2026)

Main primary source used: the AADE Ε1 instruction booklet for tax year 2025 ("«Βιβλιαράκι» οδηγιών Ε1", issued 16.03.2026, updated 22.03.2026), as republished on taxheaven: https://www.taxheaven.gr/circulars/52411/bibliaraki-odhgiwn-e1 (abbrev. **[Booklet]**). I could not get the PDF directly from aade.gr; a forin.gr segmented copy also exists: https://www.forin.gr/assistant/guide/89/e1-odhgies-sumplhrwshs-ths-dhlwshs-eisodhmatos-fusikwn-proswpwn-forologiko-etos-2025?isegment=1459. Pairs of codes are always (υπόχρεος / σύζυγος-ΜΣΣ).

## 1. Ε1 codes for dividends, interest, capital gains, losses

### Takeaway
For tax year 2025, foreign dividends go in **Υποπίνακας 4Δ1, codes 295-296**. Foreign interest goes in **669-670**. Foreign tax withheld on dividends, interest or royalties goes in **683-684**. Taxable gains on foreign securities go in **Πίνακας 4Ε, codes 865-866**. Codes 829-830 are now for **domestic** issuers only. Current-year securities losses go in **871-872** and losses carried forward in **873-874**. Exempt gains (listed shares, holding under 0.5%) go in **Πίνακας 6, codes 659-660**.

### Cited Findings
**Dividends (Υποπίνακας 4Δ1)** — [Booklet](https://www.taxheaven.gr/circulars/52411/bibliaraki-odhgiwn-e1)
- 291-292: Greek-source dividends (gross, before withholding). 293-294: Greek tax withheld on them.
- **295-296: foreign-source dividends.** 297-298: tax withheld in Greece by mistake on foreign dividends.
- Dividend rate for dividends received in 2025: **5%** ("πέντε τοις εκατό (5%)").
- **683-684: foreign tax paid on dividends, interest and royalties**, where both the foreign state and Greece have taxing rights. Payment is proven with the documents of **ΠΟΛ.1026/2014**.

**Interest (Υποπίνακας 4Δ1)** — [Booklet](https://www.taxheaven.gr/circulars/52411/bibliaraki-odhgiwn-e1)
- 667-668: Greek-source interest (gross). **669-670: foreign-source interest.**
- 675-676: Greek tax withheld on Greek interest. 677-678: tax withheld in Greece on foreign interest.
- Royalties (not relevant to T212): 671-674, with tax in 679-682.
- Corporate bond interest is taxed at 15% up to 11/4/2025 and **5%** after that. The booklet excerpt did not state the general interest rate.
- General interest rate 15% WHT; corporate bond interest reduced to 5% from 11 April 2025 — [PwC Greece individual, income determination](https://taxsummaries.pwc.com/greece/individual/income-determination) (last reviewed 08-09-2026).

**Capital gains (Πίνακας 4Ε, art. 42 ΚΦΕ)** — [Booklet](https://www.taxheaven.gr/circulars/52411/bibliaraki-odhgiwn-e1)
- 829-830: gain on **domestic** securities, with the issuer's ΑΦΜ.
- **865-866: gain on foreign securities.**
- **867-868: foreign tax** on gains under art. 42 and 42Α, split by article.
- **871-872: current-year loss** from securities, split domestic/foreign. Carried forward for 5 years.
- **873-874: loss carried forward from prior years.** The εκκαθάριση deducts it from current-year gain.
- 875-876: gains on shares in shipowning companies.
- **Exempt gains do not go in 4Ε.** Gains on listed shares where the seller holds under 0.5%, or shares acquired before 1.1.2009, go in **Πίνακας 6, codes 659-660**. Gains on corporate bonds and on domestic mutual funds also go there.
- **Losses from tax-exempt securities are not entered in 871-872.**
- Codes 659-660 cover "εισοδήματα που απαλλάσσονται του φόρου ή φορολογούνται με ειδικό τρόπο". Examples include Greek government bond interest and gains on listed shares held under 0.5% (section 2.13.2) — [Booklet](https://www.taxheaven.gr/circulars/52411/bibliaraki-odhgiwn-e1)
- Older instructions described 829-830 as gains on securities "έχουν εκδοθεί από ημεδαπή επιχείρηση" — [taxheaven 2017 app](https://www.taxheaven.gr/dil2017/e1pin47.html). Forum users still cite 829 for foreign ETFs — [e-forologia forum](https://www.e-forologia.gr/forum/viewTopic.aspx?id=54075) (anecdotal, outdated against 865-866).

**Statute (art. 42 ΚΦΕ ν.4172/2013)**
- Par. 1 taxes gains on transfers of listed shares **only where the seller holds at least 0.5%** of share capital. It also covers unlisted shares, bonds and derivatives. It refers to a "οργανωμένη αγορά ή πολυμερή μηχανισμό διαπραγμάτευσης" and to securities acquired from 1.1.2009 — [taxheaven art.42](https://www.taxheaven.gr/law/4172/2013/arthro/42)
- Par. 5: a loss is carried forward 5 years and offsets only future art. 42 gains — [taxheaven art.42](https://www.taxheaven.gr/law/4172/2013/arthro/42)
- Rate 15% on taxable gains. Listed shares with a holding under 0.5% are exempt — [PwC](https://taxsummaries.pwc.com/greece/individual/income-determination)
- Gains on shares of foreign companies fall within art. 42. Foreign-currency trades must be converted to EUR to compute the gain — [e-forologia article 02/09/25](https://www.e-forologia.gr/cms/viewContents.aspx?id=236660)

### Inferences
- Proposed software mapping per year, in EUR:
  - Gross foreign dividends → 295
  - US/other WHT on dividends and interest → 683
  - Interest on T212 cash → 669 (if it is foreign-source; see gaps)
  - Exempt listed-share gains (net) → 659
  - Taxable gains (e.g. non-listed, ≥0.5%, possibly some ETFs/derivatives/CFDs) → 865, with any foreign tax in 867
  - Taxable losses → 871
  - Prior losses still within 5 years → 873
- Exempt and taxable buckets must be netted separately, because exempt losses cannot go to 871.
- The foreign tax credit is capped at the Greek tax due. For a US dividend with 15% WHT under the treaty against Greek 5%, the excess 10% is lost. This cap is stated in the booklet in the context of art. 9 ΚΦΕ (the excerpt was in the art. 5Β section). Applying it to 683-684 is an inference consistent with art. 9.

### Gaps
- **Foreign-listed shares under the 0.5% exemption:** the art. 42 excerpt says "οργανωμένη αγορά ή ΠΜΔ" without a geographic limit. I found no explicit AADE text confirming that shares on NYSE or NASDAQ qualify. Common practice treats them as exempt, but this is **unverified**.
- **ETFs / UCITS funds:** the booklet mentions only domestic mutual funds as exempt (659-660). Foreign UCITS ETFs (e.g. Irish-domiciled) may be taxable in 865-866 at 15%, or treated as listed shares. **Unresolved.** It needs a ΔΕΔ decision or circular.
- **Source of T212 interest on cash:** foreign (669-670) is most likely, but the paying entity depends on T212 UK vs Trading 212 Markets Ltd (CY) / EU GmbH, and the money-market fund structure. **Unverified.**
- I could not obtain the official Ε1 form PDF from aade.gr. Codes come from the taxheaven republication of the official booklet.

## 2. Exempt gains, share purchases, and justifying spending (τεκμήρια / άρθρο 32-33 ΚΦΕ)

### Takeaway
Yes. Exempt gains must still be declared, in 659-660. Buying shares is an asset-acquisition expense: **Πίνακας 6, codes 743-744** ("αγορά επιχειρήσεων… μεριδίων… χρεογράφων"), which must be covered by income or capital. When shares are sold, the **returned invested capital** goes in **781-782** (amounts that are not income), and the gain goes in 4Ε or 659-660.

### Cited Findings
- Section 2.12.3: asset-acquisition expenses include **743-744** for purchase of businesses, company capital, shares and "χρεογράφων" (which includes shares and bonds). Unlisted securities require the issuer's ΑΦΜ (2.12.3.4). Related codes: 719-728, 735-736 (real estate), 759-760 (loans granted) — [Booklet](https://www.taxheaven.gr/circulars/52411/bibliaraki-odhgiwn-e1)
- Codes **781-782** take "ποσά που δεν αποτελούν εισόδημα" — sale of property or other assets, loans, inheritances, gifts.
  - For share sales in the year, "αναγράφεται το ποσό που αντιστοιχεί στην επιστροφή του επενδεδυμένου κεφαλαίου" (shares acquired from 1.1.2014). Any gain goes in 4Ε if taxable, or Πίνακας 6 if not.
  - Amounts from assets acquired after 1.1.1988 must be reduced by their acquisition cost — [Booklet](https://www.taxheaven.gr/circulars/52411/bibliaraki-odhgiwn-e1)
- An earlier fetch of the same booklet linked 781-782 to lease-termination compensation (ν.4690/2020) and to insurance investment-capital returns. These are other uses of the same catch-all code — [Booklet](https://www.taxheaven.gr/circulars/52411/bibliaraki-odhgiwn-e1)
- **787-788:** consumption of capital already taxed or exempt from prior years, with supporting certificates — [Booklet](https://www.taxheaven.gr/circulars/52411/bibliaraki-odhgiwn-e1)
- An older forin.gr Q&A "κωδικοί 29-30" also covers this area: https://www.forin.gr/questions/question/1412/kwdikoi-29-30 (not read in full).

### Inferences
- Software should output per year:
  - (a) total purchase cost of securities in EUR → 743. Whether this is gross purchases or net new money is debated in practice; see gaps.
  - (b) cost basis of shares sold → 781, as returned capital.
  - (c) realized gain → 659 or 865.
- For frequent traders, gross purchases in 743 can create a large τεκμήριο. Sale proceeds in 781 and prior-year capital in 787 offset it.

### Gaps
- **Gross vs net purchases in 743-744 for intra-year trading:** I found no explicit AADE guidance. Practitioners differ. **Unverified.**
- Whether the 781-782 "returned capital" for shares bought before 2014 follows the same rule was not checked.

## 3. Automatic assessment and documentation

### Takeaway
The εκκαθάριση computes the tax from the amounts declared in 4Δ1 and 4Ε: 5% on dividends, 15% on interest and gains. It deducts carried-forward losses (873-874) automatically and credits declared foreign tax (683-684, 867-868) up to the Greek tax due. Foreign income is **not prefilled**; the taxpayer self-declares it. Foreign tax must be supportable under ΠΟΛ.1026/2014.

### Cited Findings
- The εκκαθάριση deducts carried-forward loss 873-874 from the current year's gain — [Booklet](https://www.taxheaven.gr/circulars/52411/bibliaraki-odhgiwn-e1)
- Foreign tax in 683-684 is credited where both states have taxing rights. Proof follows **ΠΟΛ.1026/2014** — [Booklet](https://www.taxheaven.gr/circulars/52411/bibliaraki-odhgiwn-e1)
- The foreign tax credit is limited to the Greek tax on that income, and excess is not refunded (art. 9 ΚΦΕ, stated in the booklet's 041-042 section) — [Booklet](https://www.taxheaven.gr/circulars/52411/bibliaraki-odhgiwn-e1)
- ΔΕΔ 309/2026 deals with a dispute over a US tax credit on foreign dividends — [taxheaven ΔΕΔ 309/2026](https://www.taxheaven.gr/circulars/53518/ded-309-2026) (not read in full)

### Inferences
- Keep for each year: the broker annual statement or the dividends report with WHT per payment, the trade history, and the FX rates used. The ΠΟΛ.1026/2014 documents are typically a certificate or statement from the payer or foreign tax authority showing the tax withheld.
- For US securities, the W-8BEN rate (15%) and broker statements are commonly accepted in practice. This is **anecdotal and unverified**.

### Gaps
- The full text of ΠΟΛ.1026/2014 (required supporting documents) was not fetched.
- Which FX rate to use (ECB daily on transaction date vs other) was not confirmed from an AADE source.

## 4. CRS/DAC2 and other cross-checks

### Takeaway
AADE receives foreign account data through automatic exchange with about 93 jurisdictions. It ran targeted cross-checks of foreign deposits and interest in 2026. No source names Trading 212 specifically. The practical implication is that undeclared foreign dividends, interest or gains can be detected.

### Cited Findings
- AADE uses automatic exchange with 93 countries for a new round of cross-checks. Auditors had to check at least 10% of foreign deposit-interest data by 31/7/2026 and 50% by 31/10/2026 (this reportedly concerned tax year 2020 data) — [newmoney](https://www.newmoney.gr/roh/palmos-oikonomias/oikonomia/sto-mikroskopio-tis-aade-adilota-isodimata-ke-katathesis-exoterikou/); [powergame](https://www.powergame.gr/forologia/1387910/anoigoun-oi-fakeloi-ton-eisodimaton-exoterikou-i-aade-pata-to-koubi-ton-diastavroseon/)
- AADE business plan 2026 — [aade.gr](https://www.aade.gr/sites/default/files/2026-05/epixeirisiako_sxeidio2026_0.pdf) (not read)
- **ν.5273/2026** ratified the OECD crypto framework (CARF/DAC8). AADE is the competent authority from 1/1/2026 — [powergame](https://www.powergame.gr/forologia/1306649/ti-einai-to-bancapp-pos-i-aade-tha-parakolouthei-xenes-trapezes-kai-ilektronika-portofolia/); [in.gr](https://www.in.gr/2026/02/04/economy/oikonomikes-eidiseis/psifiako-mploko-sta-crypto-ti-tha-elegxetai/)
- Decision **Α.1041/2026** (in force 18/02/2026) extends the BANCAPP data-transmission system. It reportedly concerns foreign banks and e-wallets — [powergame](https://www.powergame.gr/forologia/1306649/ti-einai-to-bancapp-pos-i-aade-tha-parakolouthei-xenes-trapezes-kai-ilektronika-portofolia/) (news source)

### Inferences
- CRS reports year-end balance plus gross dividends, interest and sale proceeds per account. AADE can compare sale proceeds and dividends with what was declared in 295, 865, 659 and 781. This reflects the general CRS standard, not a sourced AADE statement.

### Gaps
- I found no source confirming which Trading 212 entity reports CRS for Greek clients, or which fields it reports.

## 5. Reforms 2025-2026

### Takeaway
I found **no change to the art. 42 capital-gains exemption or the 15% rate**, and **no change to the 5% dividend rate**, in ν.5246/2025 or later sources. Changes found: corporate bond interest cut to 5% from 11/4/2025, new Ε1 4Ε coding that separates foreign gains (865-866) from domestic (829-830), and crypto/CARF reporting from 2026.

### Cited Findings
- ν.5246/2025 (ΦΕΚ Α' 198/11-11-2025), "tax reform for demographics and the middle class", is mainly about the income-tax scale and property income. It applies from tax year 2026. None of the search results mention a dividend or capital-gains change. It was later consolidated with ν.5297/2026 — [taxheaven ν.5246/2025](https://www.taxheaven.gr/law/5246/2025); [art.47](https://www.taxheaven.gr/law/5246/2025/arthro/47); [AADE ΦΕΚ excerpt](https://www.aade.gr/sites/default/files/2025-11/%CE%91%CE%A0%CE%9F%CE%A3%CE%A0%CE%91%CE%A3%CE%9C%CE%91%20%CE%A6%CE%95%CE%9A%20%CE%91%20198_2025%20%CE%9D%205246_2025.pdf); [KPMG 20-11-2025](https://kpmg.com/gr/en/insights/2025/11/tax-updates-20112025.html)
- Dividends 5% WHT; listed shares under 0.5% exempt; otherwise 15%; corporate bond interest 5% from 11/4/2025. PwC lists no other 2025/2026 change to these items — [PwC](https://taxsummaries.pwc.com/greece/individual/income-determination) (reviewed 08-09-2026)
- From tax year 2025, intra-group dividends and gains on participations in non-EU entities are exempt. This is a corporate measure, not relevant to retail investors — [KPMG 10-12-2024](https://kpmg.com/gr/el/insights/2024/12/tax-updates-10122024.html)
- A taxheaven page for **ν.5313/2026 art. 96** appeared in results about art. 42 — [taxheaven](https://www.taxheaven.gr/law/5313/2026/arthro/96). **Not read; it may touch securities or crypto taxation. Needs checking.**
- A forin.gr article covers a bill on a new tax framework for crypto-assets — [forin](https://www.forin.gr/articles/article/92613/nomosxedio-neo-forologiko-plaisio-gia-ta-kruptostoixeia)

### Gaps
- I did not verify whether ν.5193/2025 is the law that cut bond interest to 5%.
- I did not confirm the contents of ν.5313/2026 art. 96 or the crypto bill, including whether crypto gains would get Ε1 codes for tax year 2026.
- New Ε1 codes for tax year 2026 (filed 2027) are not yet published.
- I did not confirm whether the special solidarity contribution (ειδική εισφορά αλληλεγγύης) applies to investment income for 2025. It was abolished in stages from 2023-2024 per general knowledge — **unverified**.

## 6. Deadlines and payment, tax year 2025

### Takeaway
Returns were filed **16 March to 15 July 2026**. Early-filing discounts were 4%, 3% and 2% if the tax was paid in one lump sum by 31/7/2026. Otherwise the tax was paid in **8 monthly instalments**, the first by 31/7/2026 and the last in February 2027.

### Cited Findings
- Discounts: 4% if filed by end of April, 3% for 1 May to 15 June, 2% for 16 June to 15 July. Payment had to be a lump sum by 31/7/2026. There were 8 instalments from 31/7. An amended return by 15/7 counted as original without penalty — [powergame](https://www.powergame.gr/forologia/1301859/forologikes-diloseis-2026-pote-xekina-i-ypovoli-tous-ti-ischyei-me-tin-ekptosi-forou/); [cnn.gr](https://www.cnn.gr/oikonomia/chrima/story/538729/analytikos-odigos-gia-tis-forologikes-diloseis-telos-xronou-gia-tin-ekptosi-forou-3); [parapolitika](https://www.parapolitika.gr/oikonomia/article/1754401/forologikes-diloseis-teleutaia-eukairia-eos-tis-15-iouliou-gia-14-ekat-forologoumenous-pos-na-diorthosete-lathi-horis-prostimo/)
- Sources conflict on the 4% cutoff: some news gives 15 May — [powergame 4%](https://www.powergame.gr/forologia/1348556/forologikes-diloseis-pote-ligei-i-prothesmia-gia-to-bonous-tou-4/). One search snippet claimed a 24/07/2026 deadline — [taxrevenue.gr](https://taxrevenue.gr/odigies-symplirwsis-e1-2026/) (unconfirmed, likely an error).

### Inferences
- Today is 2026-11-09, so the tax year 2025 deadlines have passed. Late or amended returns now carry penalties under the ΚΦΔ. The rules for that were not researched.

### Gaps
- I did not cite the official AADE decision setting the 2026 deadlines.
