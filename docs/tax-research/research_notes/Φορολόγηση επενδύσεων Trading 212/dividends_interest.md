# Greek income tax on foreign dividends and cash interest received through Trading 212 (Greek tax-resident individual, tax year 2025 and changes for 2026)

Scope: a Greek tax-resident individual (not a business) who receives dividends on foreign shares/ETFs and interest on uninvested cash through Trading 212 (Trading 212 Markets Ltd, Cyprus, or Trading 212 UK Ltd). The tax year is 2025 (return filed in 2026). Changes for 2026 are noted.

Primary source used throughout: AADE, "ΔΗΛΩΣΗ Ε1 2025 Οδηγίες συμπλήρωσης", Athens 16 March 2026 (the official E1 instructions for tax year 2025): https://www.aade.gr/sites/default/files/2026-03/Odigies_E1_2026_0.pdf. Below this is called "E1 instructions 2026". Page numbers are the printed page numbers in that PDF.

---

## 1. Dividend tax rate for individuals (ΚΦΕ ν.4172/2013 άρθρο 40)

### Takeaway
Foreign dividends are taxed at a flat 5% under άρθρο 40 παρ.1 ΚΦΕ. This applies to tax year 2025, and the current consolidated text still says 5% in Nov 2026, so 2026 is also 5%. The 5% rate was introduced by ν.4646/2019 (άρθρο 24 παρ.1) for income acquired from 1.1.2020. Note that the dividend rate is in **παρ.1** and the interest rate is in **παρ.2** (not both in παρ.1).

### Cited Findings
- Current text of άρθρο 40 παρ.1 ΚΦΕ: "Τα μερίσματα φορολογούνται με συντελεστή πέντε τοις εκατό (5%)." — [taxheaven, ν.4172/2013 άρθρο 40](https://www.taxheaven.gr/law/4172/2013/arthro/40)
- Same article, παρ.2: "Οι τόκοι φορολογούνται με συντελεστή δεκαπέντε τοις εκατό (15%)". Interest on corporate bonds under άρθρο 37 παρ.5 received by Greek-resident individuals is taxed at 5%. Παρ.3: royalties are taxed at 20%. — [taxheaven, άρθρο 40](https://www.taxheaven.gr/law/4172/2013/arthro/40)
- The official E1 instructions for tax year 2025 say: "Ο φορολογικός συντελεστής για τα μερίσματα που αποκτώνται κατά το φορολογικό έτος 2025 είναι πέντε τοις εκατό (5%)." (section 2.9, p.60) — [E1 instructions 2026](https://www.aade.gr/sites/default/files/2026-03/Odigies_E1_2026_0.pdf)
- Amending law: ν.4646/2019, άρθρο 24 παρ.1, cut the dividend rate from 10% to 5%. AADE circular Ε.2012/2020 gives the implementing guidance. — [taxheaven Ε.2012/2020](https://www.taxheaven.gr/circulars/32269/e-2012-2020); [lawspot on Ε.2012/2020](https://www.lawspot.gr/nomika-nea/meiosi-toy-syntelesti-forologias-kai-parakratisis-foroy-merismaton-apo-10-se-5-egkyklios/); [e-nomothesia Ε.2012/2020](https://www.e-nomothesia.gr/kat-oikonomia/forologia/egkuklios-aade-e2012-2020.html)
- PwC Greece Tax Flash: the 5% rate applies to income acquired from 01.01.2020. — [PwC Tax Flash (GR)](https://www.pwc.com/gr/en/tax-services/news/assets/Tax%20Flash%20-%20Tax%20Law_gr.pdf)
- Rate history (useful context for the software only). The rate was 15% for income from 1.1.2017 under ν.4387/2016, and 15% up to tax year 2018. It was then 10%, and 5% from 2020. — [accountingsolutions.gr](https://www.accountingsolutions.gr/newsroom/2019/05/merismata-fusikon-prosopon-apo-hores-me-sadf.aspx); [e-forologia](https://www.e-forologia.gr/cms/viewContents.aspx?id=212821)
- **2026 law changes.** Ν.5246/2025 ("Φορολογική μεταρρύθμιση…", ΦΕΚ Α' 198/11.11.2025) applies from 1.1.2026. It changes the general scale for salaries, pensions and business income, and the rental income scale. I found no change to the 5% dividend rate or the 15% interest rate. — [KPMG Φορολογικά Νέα 20.11.2025](https://kpmg.com/gr/el/home/insights/2025/11/tax-updates-20112025.html); [taxheaven ν.5246/2025](https://www.taxheaven.gr/law/5246/2025)
- **2026 codification.** Decision 147165 ΕΞ 2026 (ΦΕΚ Β' 5732/22.09.2026) published an *administrative codification* of the ΚΦΕ: ν.4172/2013 as amended, including by ν.5264/2025. It is not a new code, so ν.4172/2013 article numbers remain the legal reference. — [taxheaven 147165 ΕΞ 16-09-2026](https://www.taxheaven.gr/circulars/55404/147165-ex-16-09-2026)

### Inferences
- For software: `DIVIDEND_RATE_GR = 0.05` for tax years 2020 to 2026 inclusive. Greek dividend tax is a separate flat tax (αυτοτελής φορολόγηση). It does not enter the progressive scale.
- Nothing found suggests any change for tax year 2026. The rate should still be parameterised per tax year.

### Gaps
- I did not read the ΦΕΚ text of ν.4646/2019 άρθρο 24 directly. The citation comes from AADE Ε.2012/2020 and professional summaries.
- I did not read the full text of ν.5246/2025 article by article. The statement "no change to dividends/interest" rests on summaries plus the current art. 40 text.

---

## 2. Foreign tax credit (ΚΦΕ άρθρο 9): cap, granularity, documentation, circulars

### Takeaway
Άρθρο 9 lets Greek tax be reduced by the foreign tax paid "για αυτό το εισόδημα". Άρθρο 9 παρ.2 caps the credit at the Greek tax that corresponds to *that income*. The wording points to a per-income (per item) cap, and with a flat 5% rate per item and per category gives the same answer. Proof of the foreign tax follows ΠΟΛ.1026/2014 (ΦΕΚ Β' 170). The amount goes in E1 codes 683-684, where the filer also flags whether the country has a treaty (ΣΑΔΦ) with the credit method.

### Cited Findings
- Άρθρο 9 παρ.1 ΚΦΕ: the Greek tax is "μειώνεται κατά το ποσό του φόρου που καταβλήθηκε στην αλλοδαπή για αυτό το εισόδημα". — [taxheaven, ν.4172/2013 άρθρο 9](https://www.taxheaven.gr/law/4172/2013/arthro/9)
- Άρθρο 9 παρ.2 ΚΦΕ: "Η μείωση του φόρου εισοδήματος που προβλέπεται στην προηγούμενη παράγραφο δεν δύναται να υπερβαίνει το ποσό του φόρου που αναλογεί για το εισόδημα αυτό στην Ελλάδα." — [taxheaven, άρθρο 9](https://www.taxheaven.gr/law/4172/2013/arthro/9)
- Professional commentary (Δ. Λεβεντάκης, Ecovis Hellas, 16.07.2021) reads the credit per item of foreign income ("για αυτό το εισόδημα") and describes no per-country or per-basket limitation for individuals. It cites ΠΟΛ.1060/2015 (instructions on arts 9, 68, 71 ΚΦΕ), ΠΟΛ.1026/2014 (documents), and Ε.2089/2021, which followed ΣτΕ 652/2020 and 653/2020 (Greece–Cyprus treaty cases). — [taxheaven article "Η έκπτωση του φόρου που καταβλήθηκε στην αλλοδαπή"](https://www.taxheaven.gr/circulars/36976/arora-h-ekptwsh-toy-foroy-poy-katablhohke-sthn-allodaph)
- E1 instructions, codes 683-684: "Φόρος που παρακρατήθηκε ή/και καταβλήθηκε στην αλλοδαπή στα εισοδήματα (μερίσματα, τόκους και δικαιώματα) αλλοδαπής που έχει δικαίωμα φορολόγησης και η Ελλάδα." Payment is proven with the documents of ΠΟΛ.1026/22.01.2014 (ΦΕΚ 170Β'), referring to άρθρο 20 ΚΦΔ. (§2.9.14, p.64) — [E1 instructions 2026](https://www.aade.gr/sites/default/files/2026-03/Odigies_E1_2026_0.pdf)
- E1 instructions, general rule for every foreign-tax code: the filer chooses either "χώρες με τις οποίες υφίσταται ΣΑΔΦ και στη ΣΑΔΦ προβλέπεται η μέθοδος της πίστωσης" or "λοιπές περιπτώσεις". The rule applies to codes 651-652, 265-266, 469-470, 653-654, **683-684 (dividends, interest, royalties)** and 867-868. (§2.5.13, p.45-46) — [E1 instructions 2026](https://www.aade.gr/sites/default/files/2026-03/Odigies_E1_2026_0.pdf)
- E1 instructions: "για εισοδήματα από τις Η.Π.Α. … θα συμπληρώνεται μόνο το ποσό του ομοσπονδιακού φόρου των Η.Π.Α. και όχι και ο πολιτειακός φόρος" (pp.46 and 78). — [E1 instructions 2026](https://www.aade.gr/sites/default/files/2026-03/Odigies_E1_2026_0.pdf)
- E1 instructions on codes 295-296: proof of foreign tax follows ΠΟΛ.1026/2014. Separately, to credit the *underlying foreign corporate tax* under treaties with the countries listed in circular Ε.2018/2019, the documents set by that circular are needed. — [E1 instructions 2026, §2.9.2 p.61](https://www.aade.gr/sites/default/files/2026-03/Odigies_E1_2026_0.pdf); [e-forologia on ΣΑΔΦ & Ε.2018/2019](https://www.e-forologia.gr/cms/viewContents.aspx?id=212821)
- ΠΟΛ.1026/22.1.2014 "Καθορισμός δικαιολογητικών εγγράφων για την πίστωση φόρου αλλοδαπής…" (ΦΕΚ Β' 170/30.01.2014) is the document-requirements decision. — [taxheaven ΠΟΛ.1026/2014](https://www.taxheaven.gr/circulars/18119/pol-1026-22-1-2014); [oenet summary](https://www.oenet.gr/online/oen/forologika-themata-pol/item/15268-καθορισμός-δικαιολογητικών-εγγράφων-για-την-πίστωση-φόρου-αλλοδαπής,-σύμφωνα-με-την-παράγραφο-1-του-άρθρου-9-του-ν-4172-2013-και-την-παράγραφο-2-του-άρθρου-16-του-ν-4174-2013-πολ-1026-2014)
- ΠΟΛ.1042/2015 §5: an individual must include foreign dividends in the annual return whether or not the money is brought into Greece. The individual must keep the supporting documents with an official Greek translation. — [taxheaven ΠΟΛ.1042/2015](https://www.taxheaven.gr/circulars/20376/pol-1042-26-1-2015)
- E1 instructions: if a foreign tax amount is entered for income in 4Δ1 and nothing shows Greek tax already paid, the tax due is assessed through the return or a corrective assessment. — [E1 instructions 2026, §2.9.2 p.61](https://www.aade.gr/sites/default/files/2026-03/Odigies_E1_2026_0.pdf)

### Inferences
- **Per item vs per country vs per category.** The statute ("για το εισόδημα αυτό") points to a per-item cap. For dividends with a flat 5%, a per-item cap and a per-country cap give *different* results when withholding differs within a country (e.g. 0% on one stock, 30% on another). A per-item cap gives the *lower* credit, so it is the conservative choice. The E1 form only collects aggregate 683-684 amounts with a ΣΑΔΦ/other flag, so AADE's own liquidation engine effectively caps in aggregate. Recommended software approach: compute `credit_i = min(foreign_tax_i, 0.05 × gross_i)` per dividend event, and report the sum. Optionally also show the aggregate figure (`min(Σforeign_tax, 0.05 × Σgross)`), and flag that the per-item figure is the defensible one.
- **What goes in 683-684.** With per-item capping, the amount to enter is arguably the actual foreign tax paid, and the E1 liquidation applies the cap. It is unclear whether AADE caps per country, per flag, or in total when it liquidates. Software should show both "foreign tax actually withheld" and "creditable amount".
- **Documentation for T212 users.** In practice this means the Trading 212 annual statement/dividend report showing gross, withholding and net per payment. Whether a broker statement satisfies ΠΟΛ.1026/2014 without a foreign tax-authority certificate is not settled in the sources I could read (see Gaps).

### Gaps
- I could not read the full text of ΠΟΛ.1026/2014, so I cannot confirm whether a broker statement (rather than a foreign tax-authority certificate) suffices, or whether apostille and official translation are required for broker statements. A search summary mentioned a ΔΕΔ (dispute resolution) decision where credit was refused for lack of official translation and Hague apostille under ΠΟΛ.1026/2014. I could not pin the specific decision URL, so treat this as unverified but as a real risk.
- "ΠΟΛ 1032/2015" (named in the brief) did not come up in searches as a foreign-tax-credit circular. The relevant circulars found are ΠΟΛ.1026/2014, ΠΟΛ.1042/2015, ΠΟΛ.1060/2015 and Ε.2089/2021.
- I found no AADE text stating explicitly whether the art. 9(2) cap is applied per item, per country or per category for individuals' dividends.

---

## 3. Greece–USA treaty and typical withholding from US, IE, NL, DE, FR, UK

### Takeaway
**Important correction to the brief's premise.** The 1950 Greece–USA convention (ratified by ν.δ. 2548/1953) does **not** reduce US withholding on dividends. Greek residents therefore suffer the US statutory **30%**, not 15%, even with a W-8BEN. US-source portfolio interest is 0% under the treaty. Other countries: Ireland 0% on Irish UCITS ETFs (unverified here), NL 15%, DE 25% treaty cap (26.375% domestic), FR 12.8% domestic (no treaty cap), UK 0% domestic.

### Cited Findings
- PwC US withholding table (adapted from the IRS treaty tables), treaty rates: Greece dividends 30 / 30 (portfolio / substantial), interest 0. Ireland, Netherlands, Germany, France, UK are each 15 / 5 / 0. Cyprus 15 / 5 / 10. Non-treaty 30 / 30 / 30. — [PwC Worldwide Tax Summaries, United States – Withholding taxes](https://taxsummaries.pwc.com/united-states/corporate/withholding-taxes)
- IRS Table 1 (Rev. May 2023) is the primary source for the rates above. Its PDF text layout is too garbled to quote a row reliably, but it is the authoritative check. Its footnote notes that for Greece, among others, certain rates are 0 if a new treaty has not entered into force. — [IRS Tax Treaty Table 1 (PDF)](https://www.irs.gov/pub/irs-lbi/tax-treaty-table-1.pdf)
- A secondary source on the US–Greece treaty: "The treaty does not provide for a withholding tax rate on dividends, so the domestic rate applies." — [HCO, United States-Greece Income Tax Treaty](https://www.hco.com/insights/united-states-greece-income-tax-treaty)
- Treaty basics: signed Athens 20 Feb 1950, with a Protocol of 20 Apr 1953. The Greek ratification is ν.δ. 2548/1953 (forin.gr lists "law 2548/1953 Convention for the avoidance of double taxation between Greece and U.S.A."). — [forin.gr ν.δ. 2548/1953](https://forin.gr/laws/law/108/law-2548-1953-convention-for-the-avoidance-of-double-taxation-between-greece-and-u-s-a); [gocodebook US tax treaty Greece](https://gocodebook.com/library/us/federal/us-tax-treaty-greece)
- Some general websites claim the US–Greece treaty caps dividends at 15%. These conflict with PwC and IRS-derived tables and look unreliable. — e.g. [sonicwallet US dividend WHT by country](https://www.sonicwallet.com/learn/invest-from-abroad/us-dividend-withholding-tax-by-country), which itself lists Greece at 30%. The 15% claims appear in other generic sites I did not cite.
- Trading 212 community (anecdotal): users note that "countries that have double taxation treaty with US have 15% withheld", while a Greek user asked why 30% was withheld despite a W-8BEN. That matches the 30% rate above. Users also note that Irish-domiciled ETFs holding US stocks suffer 15% inside the fund. — search results from [community.trading212.com, W8-BEN/Withholding Tax issues](https://community.trading212.com/t/w8-ben-withholding-tax-issues/29470) and [US Dividend Withholding Tax](https://community.trading212.com/t/us-dividend-withholding-tax/27126). Anecdotal; I did not open the threads to confirm which one has the Greek user's post.
- **Germany:** domestic 25% + 5.5% solidarity surcharge (26.375%). Treaty rate for Greece: dividends 25, interest 10. Germany's refund of the excess above 15% in the PwC footnote applies only to *corporate* recipients. — [PwC Germany – Withholding taxes](https://taxsummaries.pwc.com/germany/corporate/withholding-taxes)
- **France:** domestic WHT for individual beneficiaries is 12.8%. For Greece, "The domestic tax rate applies because there is no specific provision in the tax treaty" (note 9). — [PwC France – Withholding taxes](https://taxsummaries.pwc.com/france/corporate/withholding-taxes)
- **Netherlands:** domestic dividend WHT is 15%. Greece treaty row: "0 (6) or 5/15 (2)". 15% is the portfolio rate, 5% applies for ≥25% corporate holdings, and 0% applies under the EU Parent-Subsidiary Directive. — [PwC Netherlands – Withholding taxes](https://taxsummaries.pwc.com/netherlands/corporate/withholding-taxes)
- **Credit vs treaty.** The E1 form asks whether the foreign tax was paid in a ΣΑΔΦ country whose treaty provides the credit method, or "λοιπές περιπτώσεις". Where no treaty applies, the domestic credit in art. 9 ΚΦΕ still applies (the e-forologia commentary says that for dividends without a ΣΑΔΦ, art. 9 ΚΦΕ applies). — [E1 instructions 2026 p.45-46](https://www.aade.gr/sites/default/files/2026-03/Odigies_E1_2026_0.pdf); [e-forologia](https://www.e-forologia.gr/cms/viewContents.aspx?id=212821)

### Inferences
- For a typical T212 portfolio of US shares, Greek residents lose 30% at source, and the Greek 5% is fully covered by the credit, so the Greek tax due is 0. The excess 25 points are lost (see section 4).
- Ireland: Irish UCITS ETFs generally do not withhold Irish dividend WHT for non-Irish holders who make the standard declaration. This is from general knowledge and **not verified** in this research. The IRS Table/PwC Ireland 25% figure is the domestic WHT on ordinary Irish companies. Software should read the withholding actually reported by T212 per payment rather than assume a rate by country.
- UK: the UK levies no WHT on dividends. This is from general knowledge, **not verified** here.
- Software should treat "country" as the issuer's country of tax residence (ISIN prefix is a reasonable proxy, but not always correct). The E1 instructions (for capital gains, p.78) say that for securities held with a foreign custodian, the custodian's country is examined to choose the ΣΑΔΦ flag. Whether AADE expects the same logic for dividends is unclear.

### Gaps
- I did not read the 1950 convention text itself, so I cannot cite the article numbers (dividends, credit method). I could not verify the Greek-side credit article of the treaty.
- I found no official Trading 212 statement on which US rate it applies to Greek residents.
- Ireland and UK withholding were not verified against a primary source in this research.
- I did not separately verify the Germany 26.375% to 25% treaty-cap reclaim procedure for Greek individuals (via Bundeszentralamt für Steuern).

---

## 4. When foreign withholding (e.g. US 30%, or 15%) exceeds the Greek 5%: is the excess lost?

### Takeaway
Yes. The credit is capped at the Greek tax on that income (art. 9 παρ.2), and AADE does not refund the excess foreign tax. The only way to recover any excess is a reclaim in the *source* country under that country's rules or treaty. For US dividends to Greek residents, there is no treaty-reduced rate, so no IRS reclaim from 30% is available.

### Cited Findings
- Art. 9 παρ.2 cap: credit "δεν δύναται να υπερβαίνει το ποσό του φόρου που αναλογεί για το εισόδημα αυτό στην Ελλάδα." — [taxheaven άρθρο 9](https://www.taxheaven.gr/law/4172/2013/arthro/9)
- e-forologia: if the foreign tax exceeds the Greek tax on that income, "δεν διενεργείται επιστροφή του επιπλέον φόρου". — [e-forologia, ΣΑΔΦ και πίστωση φόρου μερισμάτων αλλοδαπής](https://www.e-forologia.gr/cms/viewContents.aspx?id=212821)
- ΠΟΛ.1060/2015 (as quoted by Λεβεντάκης): "σε περίπτωση πιστωτικού υπολοίπου, το ποσό αυτό δεν επιστρέφεται". Ε.2089/2021 (after ΣτΕ 652-653/2020) changed the *order*: in treaty cases the foreign tax is offset first, "κατά προτεραιότητα έναντι των λοιπών φόρων", and any remaining balance of withholdings/prepayments then follows the art. 68(3) refund rule. No carry-forward is mentioned. — [taxheaven, Λεβεντάκης 16.07.2021](https://www.taxheaven.gr/circulars/36976/arora-h-ekptwsh-toy-foroy-poy-katablhohke-sthn-allodaph)
- US treaty rate for Greek residents on dividends is 30%, so there is no treaty excess to reclaim from the IRS. — [PwC US withholding taxes](https://taxsummaries.pwc.com/united-states/corporate/withholding-taxes)

### Inferences
- Ε.2089/2021 does not lift the art. 9(2) cap. It only puts foreign tax first in the offset order, so other Greek prepayments become refundable rather than the foreign tax being wasted against them. Software should therefore never produce a negative Greek dividend tax per item. `greek_due_i = max(0, 0.05 × gross_i − foreign_tax_i)`
- Excess foreign tax from one dividend should not be used against Greek tax on other income (e.g. interest or salary). That follows from "για το εισόδημα αυτό".
- Where a source-country reclaim exists (e.g. French or German statutory rate above the treaty rate), it is outside Greek tax and outside what T212 provides.

### Gaps
- The full ΠΟΛ.1060/2015 and Ε.2089/2021 texts were read only through a secondary article.

---

## 5. Interest on uninvested cash at Trading 212

### Takeaway
Interest paid by T212 is taxed in Greece as interest (τόκοι, άρθρο 37 definition) at **15%** under άρθρο 40 παρ.2 ΚΦΕ. It is declared in E1 codes **669-670** (foreign-source interest, before tax), with any foreign tax in **683-684**. Trading 212 Markets Ltd (Cyprus) pays non-Cypriot residents gross, so there is normally no foreign tax to credit and Greek tax = 15% × gross. Classification risk: part of the cash sits in qualifying money market funds (QMMFs). Trading 212 presents the payment as "interest" and the sources treat it as such. The UCITS-distribution argument below is unresolved.

### Cited Findings
- Art. 40 παρ.2: "Οι τόκοι φορολογούνται με συντελεστή δεκαπέντε τοις εκατό (15%)". — [taxheaven άρθρο 40](https://www.taxheaven.gr/law/4172/2013/arthro/40)
- ΠΟΛ.1042/2015 §6: under art. 37 παρ.1, "τόκοι" means income from claims of any kind, including premiums and repos/reverse repos. §12: for interest from abroad not paid through a Greek paying agent, "ο φόρος (15%) επιβάλλεται με την ετήσια δήλωση φορολογίας εισοδήματος". Foreign-currency interest is converted at the exchange rate on the date it is credited. — [taxheaven ΠΟΛ.1042/2015](https://www.taxheaven.gr/circulars/20376/pol-1042-26-1-2015)
- E1 instructions §2.9.5: codes 669-670 "Τόκοι (προ φόρου) αλλοδαπής προέλευσης". The filer selects the sub-type: bank deposits, listed Greek corporate bonds acquired up to 11/4/2025 (15%), after 11/4/2025 (5%), or "από οποιαδήποτε άλλη αιτία". §2.9.11: codes 677-678 for tax withheld *in Greece* on foreign interest. §2.9.14: codes 683-684 for tax withheld abroad. — [E1 instructions 2026 pp.62-64](https://www.aade.gr/sites/default/files/2026-03/Odigies_E1_2026_0.pdf)
- Trading 212 Help Centre: for Trading 212 Markets Ltd, Cyprus residents pay 17% withholding plus 2.65% GHS. For other residents "your interest will be paid to you gross". "Trading 212 EU: Interest on cash taxes will be automatically deducted from your account." For UK ISA there is no tax. The page consistently calls the payment "interest". — [Trading 212 Help Centre article 15472255836957](https://helpcentre.trading212.com/hc/en-us/articles/15472255836957)
- Trading 212 holds client cash for interest through qualifying money market funds and banks. Opting into interest means accepting QMMFs. — [trading212.com/interest-on-cash](https://www.trading212.com/interest-on-cash) (as summarised in search results); [financialinterest.com explainer](https://financialinterest.com/trading-212-interest-on-cash/)
- ΠΟΛ.1042/2015 §3 treats distributions from UCITS units as dividends, and gives EU/EEA UCITS the same (exempt) treatment as domestic funds. The E1 instructions list "αφορολόγητα κέρδη από ημεδαπά ΕΕ/ΕΟΧ/ΕΖΕΖ αμοιβαία κεφάλαια" among tax-exempt income (Πίνακας 6, codes 659-660). Only distributions of funds "εγκατεστημένα σε τρίτες χώρες" go in taxable code 295. — [taxheaven ΠΟΛ.1042/2015](https://www.taxheaven.gr/circulars/20376/pol-1042-26-1-2015); [E1 instructions 2026 pp.61, 76, 104](https://www.aade.gr/sites/default/files/2026-03/Odigies_E1_2026_0.pdf)
- Anecdotal, Ireland: one Irish forum user claimed T212 interest is MMF-based and so falls under Irish fund (exit tax) rules. This is user commentary only. — [r/irishpersonalfinance mirror](https://nyc1.lr.ggtyler.dev/r/irishpersonalfinance/comments/199qi19/trading_212_interest_cgt_allowance)

### Inferences
- Default treatment for software: T212 cash interest is foreign-source interest, declared in 669-670 with sub-type "οποιαδήποτε άλλη αιτία" or "τραπεζικές καταθέσεις". Greek tax = 15% × gross EUR amount, minus any foreign tax (normally zero for Markets Ltd non-Cypriot clients), capped per art. 9(2).
- Which sub-type to select (bank deposit vs other) is a judgement call. Both are taxed at 15%, so the tax computation is unaffected.
- **Alternative view (unresolved).** Trading 212 is a nominee and the client legally holds QMMF units. A Greek accountant *could* argue the income is a distribution from EU UCITS (exempt under ΠΟΛ.1042/2015 §3 / Πίνακας 6). Nothing found supports this for T212 specifically, and T212's own documents label it interest. The conservative and default choice is 15% interest. The software could offer a toggle with a warning.
- If the account is with a "Trading 212 EU" entity that deducts tax automatically, that deducted tax is a foreign tax for 683-684 only if it is a tax of the foreign state, proved under ΠΟΛ.1026/2014. Software should capture whatever T212 reports as withheld.

### Gaps
- I did not identify which Trading 212 legal entity serves Greek residents in 2025-2026: Markets Ltd (Cyprus) vs a newer "Trading 212 EU" entity whose interest is taxed at source. The help page mentions both.
- I found no AADE ruling or ΔΕΔ decision on broker cash interest backed by money market funds.

---

## 6. Exchange rate for converting foreign-currency dividends, interest and withholding

### Takeaway
The official E1 guidance converts foreign tax at the euro/foreign-currency rate on the date the tax was paid abroad. For *periodic* payments it uses the **average annual rate set by the Bank of Greece**. ΠΟΛ.1042/2015 converts foreign-currency interest at the rate on the date of crediting. In practice, the ECB euro reference rate on the payment date (which the Bank of Greece republishes) is the defensible per-event choice. The BoG annual average is an officially sanctioned alternative for recurring payments.

### Cited Findings
- E1 instructions: "Στην περίπτωση που ο φόρος αλλοδαπής έχει καταβληθεί σε άλλο νόμισμα πέραν του ευρώ (π.χ. σε δολάρια Η.Π.Α.), … λαμβάνεται υπόψη η ισοτιμία ευρώ και ξένου νομίσματος, όπως αυτή προκύπτει κατά την ημερομηνία καταβολής του φόρου στην αλλοδαπή που αναγράφεται στη σχετική βεβαίωση … Σε περίπτωση, όμως, πληρωμών που καταβάλλονται περιοδικά, η μετατροπή θα πρέπει να γίνει με βάση τη μέση ετήσια ισοτιμία, όπως αυτή καθορίζεται από την Τράπεζα της Ελλάδος." The instructions state this applies "για όλες τις περιπτώσεις και όλες τις κατηγορίες εισοδημάτων" where foreign tax credit is claimed. (§2.11, p.78) — [E1 instructions 2026](https://www.aade.gr/sites/default/files/2026-03/Odigies_E1_2026_0.pdf)
- E1 instructions, for foreign salaries: conversion "με βάση την επίσημη ισοτιμία του ευρώ προς το ξένο νόμισμα, κατά το χρόνο καταβολής" (p.~47). — [E1 instructions 2026](https://www.aade.gr/sites/default/files/2026-03/Odigies_E1_2026_0.pdf)
- ΠΟΛ.1042/2015 §12: foreign-currency interest is converted at the exchange rate on the date the interest is credited. — [taxheaven ΠΟΛ.1042/2015](https://www.taxheaven.gr/circulars/20376/pol-1042-26-1-2015)

### Inferences
- US dividends are paid quarterly, i.e. "periodically". Strictly, the guidance therefore permits the BoG annual average rate. The more common practitioner approach (official rate on the payment date) is also consistent with the guidance. Recommended software default: the ECB reference rate for the payment date, using the previous business day's rate if the payment date has none. Offer the BoG annual average as an option. Use the same rate for the gross dividend and its withholding so the credit cap stays consistent.
- If T212 already credits the dividend in EUR (account currency EUR, with FX by T212), the EUR amounts T212 reports reflect T212's FX rate, not an official rate. The guidance points to official rates, so software should recompute from the original-currency amounts where T212 reports them.

### Gaps
- I did not find a specific AADE statement naming the "ECB reference rate". The guidance says "επίσημη ισοτιμία" and "Τράπεζα της Ελλάδος". BoG publishes the ECB euro reference rates daily, but this was not verified on the BoG site in this research.

---

## 7. E1 form codes for the 2025 return (filed 2026), and how the tax is settled

### Takeaway
All codes are in **Πίνακας 4, Υποπίνακας 4Δ1 "Μερίσματα, τόκοι, δικαιώματα"**:
- foreign dividends gross: **295-296**
- foreign interest gross: **669-670**
- tax withheld abroad on dividends, interest and royalties: **683-684**, flagged "ΣΑΔΦ με μέθοδο πίστωσης" or "λοιπές περιπτώσεις"
- tax withheld *in Greece* on foreign dividends/interest: 297-298 / 677-678 (not applicable to T212)

The codes in the brief are wrong: 659-660 are exempt income (Πίνακας 6) and 293-294 are Greek tax withheld on *domestic* dividends. There is no withholding in Greece, so the 5% / 15% Greek tax is assessed through the E1 liquidation (εκκαθάριση). Odd/even pairs are taxpayer/spouse.

### Cited Findings
- §2.9 Υποπίνακας 4Δ1 (p.59-60): income from capital acquired in 2025 is declared there, including foreign tax "εφόσον και η αλλοδαπή χώρα και η Ελλάδα είχαν δικαίωμα φορολόγησης". Declaration "είναι υποχρεωτική, είτε αποκτήθηκαν στην Ελλάδα, είτε στην αλλοδαπή και ανεξάρτητα από το αν τα χρηματικά ποσά παρέμειναν στην αλλοδαπή". — [E1 instructions 2026](https://www.aade.gr/sites/default/files/2026-03/Odigies_E1_2026_0.pdf)
- §2.9.1 codes 291-292: *domestic* dividends. §2.9.8 codes 293-294: "Φόρος που παρακρατήθηκε για μερίσματα ημεδαπής προέλευσης". — [E1 instructions 2026 pp.60, 64](https://www.aade.gr/sites/default/files/2026-03/Odigies_E1_2026_0.pdf)
- §2.9.2 codes 295-296: "Αναγράφονται τα μερίσματα και προμερίσματα (πριν από την αφαίρεση τυχόν παρακρατούμενου φόρου) των εισηγμένων και μη εισηγμένων μετοχών αλλοδαπής, … η διανομή κερδών αμοιβαίων κεφαλαίων που είναι εγκατεστημένα σε τρίτες χώρες …". Proof of foreign tax follows ΠΟΛ.1026/2014. Whether income is domestic or foreign follows art. 5 παρ.1 περ. ι΄, ια΄ and παρ.2 ΚΦΕ. — [E1 instructions 2026 p.61](https://www.aade.gr/sites/default/files/2026-03/Odigies_E1_2026_0.pdf)
- §2.9.9 codes 297-298: Greek tax withheld "εκ παραδρομής" by a Greek institution on foreign dividends. — [E1 instructions 2026 p.64](https://www.aade.gr/sites/default/files/2026-03/Odigies_E1_2026_0.pdf)
- §2.9.4 codes 667-668: domestic interest. §2.9.5 codes 669-670: "Τόκοι (προ φόρου) αλλοδαπής προέλευσης". For foreign dividends and interest through a *Greek* custodian, the country is not entered, but the custodian's ΑΦΜ is. — [E1 instructions 2026 pp.62-63](https://www.aade.gr/sites/default/files/2026-03/Odigies_E1_2026_0.pdf)
- §2.9.14 codes 683-684: foreign tax on dividends, interest and royalties. If Greece has no taxing right, the income is exempt and goes in Πίνακας 6. — [E1 instructions 2026 p.64](https://www.aade.gr/sites/default/files/2026-03/Odigies_E1_2026_0.pdf)
- Codes 659-660 (Πίνακας 6) are for exempt or specially taxed income, e.g. gains on listed shares with <0.5% holding, and gains from Greek or EU/EEA mutual funds. — [E1 instructions 2026 p.76](https://www.aade.gr/sites/default/files/2026-03/Odigies_E1_2026_0.pdf)
- §2.9.2: if income is entered in 4Δ1 and no withheld tax is entered, "υπολογίζεται ο φόρος που αναλογεί και επιβάλλεται με την πράξη διοικητικού ή διορθωτικού προσδιορισμού φόρου", i.e. assessed through the return. — [E1 instructions 2026 p.61](https://www.aade.gr/sites/default/files/2026-03/Odigies_E1_2026_0.pdf)
- ΠΟΛ.1042/2015 §5 and §12: tax on foreign dividends and interest is imposed via the annual return when no Greek paying agent withholds it. — [taxheaven ΠΟΛ.1042/2015](https://www.taxheaven.gr/circulars/20376/pol-1042-26-1-2015)
- A practitioner forum describes in practice the code 295 sub-table, where gross amount, tax amount and country are entered. — [e-forologia forum (via search summary)](https://www.e-forologia.gr/forum/viewTopic.aspx?id=56767)
- Other guides to the same E1 instructions: [forin.gr Ε1 οδηγίες 2025, Πίνακας 4Δ1](https://www.forin.gr/assistant/guide/89/e1-odhgies-sumplhrwshs-ths-dhlwshs-eisodhmatos-fusikwn-proswpwn-forologiko-etos-2025?isegment=1454) (403 to automated fetch); [taxheaven «Βιβλιαράκι» Ε1](https://www.taxheaven.gr/circulars/52411/bibliaraki-odhgiwn-e1)

### Inferences
- Export mapping for software (taxpayer column, odd code; spouse uses the even code):
  - Σ(gross foreign dividends EUR) → **295**. The online form opens a sub-table per country/payer with gross amount, tax and country.
  - Σ(gross T212 cash interest EUR) → **669**, sub-type "τραπεζικές καταθέσεις" or "οποιαδήποτε άλλη αιτία".
  - Σ(foreign tax withheld EUR, federal only for the US) → **683**, split by flag ("ΣΑΔΦ με πίστωση" vs "λοιπές περιπτώσεις").
- Since T212 is a foreign broker and not a Greek custodian, the foreign-country selection should be filled per country. The "no country, custodian ΑΦΜ" rule applies only to Greek custodians.

### Gaps
- I could not see the online myAADE sub-table field layout (exact columns: country, payer, gross, tax) for 295 and 669. The PDF describes codes, not every UI field.
- Codes for tax year 2026 (return filed 2027) are not yet published. They usually carry over but must be re-checked.

---

## 8. Ειδική εισφορά αλληλεγγύης (special solidarity contribution)

### Takeaway
Abolished for **all** income acquired from 1.1.2023 (ν.4972/2022 άρθρο 177, amending άρθρο 43Α / transitional rules of ΚΦΕ). No solidarity contribution applies to 2025 or 2026 dividends or interest.

### Cited Findings
- Art. 177 ν.4972/2022 abolishes the special solidarity contribution of art. 43Α ν.4172/2013 "για όλα τα εισοδήματα που αποκτώνται από την 1η.1.2023 και εφεξής". — [odigostoupoliti: Καταργείται η ειδική εισφορά αλληλεγγύης από 01-01-2023](https://www.odigostoupoliti.eu/katargeitai-eidiki-eisfora-allilengyis-apo-01-01-2023/); [cnn.gr](https://www.cnn.gr/oikonomia/chrima/story/329358/telos-kai-me-ti-voyla-i-eisforas-allileggyis-gia-oloys-apo-to-2023); [taxheaven news](https://www.taxheaven.gr/news/60823/telos-h-eidikh-eisfora-allhleggyhs-gia-oloys-h-oxi)
- The E1 instructions 2026 contain no solidarity-contribution computation. A text search of the PDF found the word "αλληλεγγύη" only in the introductory sentence. — [E1 instructions 2026](https://www.aade.gr/sites/default/files/2026-03/Odigies_E1_2026_0.pdf)

### Inferences
- Software: no solidarity contribution for tax years ≥ 2023.

### Gaps
- I did not read the ΦΕΚ text of ν.4972/2022 art. 177 directly. The sources are news and professional sites, all consistent.

---

## 9. Timing: when is dividend and interest income recognised?

### Takeaway
For a cash-account individual, foreign dividends and interest belong to the tax year in which they are paid or credited (payment date). Domestic guidance ties dividend income to approval, with payment being decisive for payments after 1.1.2019. For listed foreign shares paid through a broker, the payment date is the practical and consistent choice. The ex-date and record date are not used.

### Cited Findings
- ΠΟΛ.1042/2015 §19: for dividends, the relevant point is when the competent bodies approve the distribution, treated as the time the payment becomes due (rules apply to payments from 1.1.2014). — [taxheaven ΠΟΛ.1042/2015](https://www.taxheaven.gr/circulars/20376/pol-1042-26-1-2015)
- Ε.2092/2019: for profits of legal entities keeping books, the time of the right to collect is the "χρόνος καταβολής τους στον δικαιούχο, μέσω πίστωσης του τραπεζικού του λογαριασμού ή με άλλο τρόπο", for payments after 1.1.2019 (references ΠΟΛ.1223/2015). — [taxheaven Ε.2092/2019](https://www.taxheaven.gr/circulars/30963/e-2092-2019?output=printer)
- E1 instructions: interim dividends (προμερίσματα) paid in 2025 but approved in 2026 belong to 2026 (domestic rule, §2.9.1). Partner drawings of partnerships count when paid. — [E1 instructions 2026 p.60-61](https://www.aade.gr/sites/default/files/2026-03/Odigies_E1_2026_0.pdf)
- ΠΟΛ.1042/2015 §12: foreign interest is converted at the date of crediting, implying recognition on crediting. — [taxheaven ΠΟΛ.1042/2015](https://www.taxheaven.gr/circulars/20376/pol-1042-26-1-2015)

### Inferences
- Software rule: `tax_year = year(payment_date)` for dividends (T212 "Dividend" transaction time) and for interest (T212 "Interest on cash" credit time). Edge case: a dividend with an ex-date in December and payment in January belongs to the following year.
- Approval-date nuance matters mainly for Greek non-listed companies and interim dividends, not for foreign listed shares through T212.

### Gaps
- I found no explicit AADE text stating the recognition date for *foreign listed* dividends received by individuals. The payment-date rule is inferred from Ε.2092/2019, ΠΟΛ.1042/2015 and general practice.

---

## Summary formulae for software (derived from the findings above, tax years 2025 and 2026)

- Per dividend event i (EUR amounts at the official rate on the payment date):
  - `gross_i`
  - `foreign_tax_i` (for the US, federal only)
  - `credit_i = min(foreign_tax_i, 0.05 × gross_i)`
  - `gr_tax_i = 0.05 × gross_i − credit_i`
- Per interest event j:
  - `gr_tax_j = 0.15 × gross_j − min(foreign_tax_j, 0.15 × gross_j)`
  - Foreign tax is normally 0 for Trading 212 Markets Ltd and non-Cypriot residents.
- E1 2025 codes: 295 (Σ gross dividends), 669 (Σ gross interest), 683 (Σ foreign tax, split by ΣΑΔΦ flag). No solidarity contribution. The Greek tax is assessed in the E1 liquidation.
- Main uncertainty flags:
  - per-item vs aggregate cap
  - whether QMMF-based interest could be treated as EU UCITS distributions
  - whether a broker statement is sufficient documentation under ΠΟΛ.1026/2014 (apostille/translation)
  - US 30% vs 15% for Greek residents: the sources say 30%, so check actual T212 withholding
