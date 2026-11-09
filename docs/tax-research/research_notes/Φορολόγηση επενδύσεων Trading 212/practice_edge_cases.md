# Φορολόγηση επενδύσεων Trading 212: how Greek practitioners and investors treat it, where they disagree, and edge cases

Research date: 2026-11-09. Scope: Greek tax-resident individual, tax years 2025–2026.
Source labels: **[AUTH]** = law, circular or AADE decision; **[PRACT]** = article by an accountant or lawyer (professional opinion, not binding); **[BROKER]** = Trading 212 or another broker; **[ANEC]** = forum or community post (anecdotal).

## Q1. Gains on US/foreign single stocks bought via Trading 212/Revolut/IBKR/eToro: exempt (<0.5%) or 15%?

### Takeaway
Authoritative guidance treats foreign listed shares exactly like Greek ones. If the seller holds less than 0.5% of the company's capital at the time of sale, the gain falls outside art. 42 ΚΦΕ. It is still declared, as exempt, in Table 6 code 659 (the companion code 660 is for the spouse). Only a minority of practitioner sources state a flat "15% on US stocks/ETFs", and those concern non-UCITS ETFs, not single shares. No serious source found holds that US single stocks below 0.5% are taxed at 15%. Gains are taxed at 15% (codes 865/866) when the 0.5% threshold is exceeded, for unlisted shares, and for non-UCITS fund units.

### Cited Findings
- **[AUTH]** ΠΟΛ.1032/26.1.2015: "shares" covers both domestic and foreign companies because the law makes no distinction. Section 3 expressly covers shares listed on a foreign exchange. A Greek resident who holds less than 0.5% *at the time of sale* is outside the tax, whatever the acquisition date and however many shares are sold. Shares acquired before 1.1.2009 are exempt whatever the percentage. Where holdings straddle 1.1.2009, FIFO is accepted, and the investor should keep a broker holdings statement for audit. — [Taxheaven, ΠΟΛ 1032/2015](https://www.taxheaven.gr/circulars/20353)
- **[PRACT]** Dr. Dimitrios Melas, e-forologia, 02/09/2025: foreign listed shares held below 0.5% are not subject to art. 42 tax. He cites the AADE decision Α.1032/2025 (the 2025 E1 instructions): sub-0.5% listed gains go in Table 6 codes 659–660, not sub-table 4E. Taxable gains go in codes 865–866, and foreign tax withheld in 867–868. Foreign tax credit is capped at the Greek tax and requires ΠΟΛ.1026/2014 documents. His worked example applies 15% without checking the holding percentage, which could confuse readers. — [e-forologia](https://www.e-forologia.gr/cms/viewContents.aspx?id=236660)
- **[PRACT]** Ourwallet.gr (site of chartered accountant Κώστας Στουπάκης), updated 09/02/2026: the listed-share rules apply when the holding is no more than 0.5%. Gains on EU/third-country shares in treaty countries are reported in code 659 with no additional Greek tax. US shares have no withholding on gains. — [ourwallet.gr](https://ourwallet.gr/pos-forologountai-ependyseis/)
- **[PRACT]** AT Office (Αντώνης Τσίτσης, Λογιστής Α' τάξης), 24/04/2026: the article does not discuss single US stocks or the 0.5% rule at all. It says US ETFs bought directly (VOO, QQQ) are taxed at 15% on gains. It also says an explicit tax-free threshold "Δεν προβλέπεται ρητά". A reader could mistakenly generalise this to all US securities. — [atoffice.com.gr](https://www.atoffice.com.gr/nea/forologisi-crypto-etf-odigos-gia-idiotes-ependytes-2026/)
- **[ANEC]** xaa.gr forum, March–Sept 2025. The common practice reported is: purchases in code 743, sale proceeds in 781, net gain in 659. User "Nernia" adds commissions to 743 and reports 781 net of expenses. User "Τυφών" says accountants are poorly informed and many active traders declare nothing. User "fotis_77" (Sept 2025) changed accountants twice and filled 743 himself. — [xaa.gr thread](https://xaa.gr/index.php?topic=118.60)

### Inferences
- Software can treat single listed shares (any exchange) held by a retail investor as exempt under art. 42, reported in code 659, plus 743/781 for the τεκμήρια (deemed-income presumptions) and the πόθεν έσχες (source-of-funds) trail. It should still provide a "holding ≥0.5%" override that switches the gain to codes 865/866 at 15%.
- The "15%" figures that circulate concern non-UCITS ETFs and other non-share securities (see Q2) and CFDs/derivatives. They do not apply to plain shares below 0.5%.

### Gaps
- I could not fetch the full text of Α.1032/2025 or the 2026 E1 instructions (tax year 2025) to confirm the code numbers for the current year. The report writer should confirm them on aade.gr.
- I found no Greek court decision disputing the application of the 0.5% rule to foreign-listed shares.

## Q2. ETFs: UCITS (VWCE, CSPX) vs US ETFs; accumulating vs distributing

### Takeaway
There is broad consensus that units of EU/EEA UCITS (Irish or Luxembourg ETFs) are exempt on both gains and distributions under ν.4099/2012 art. 103 combined with ΠΟΛ.1032/2015 and CJEU C-370/11. Both are declared in code 659, and accumulating and distributing funds are treated the same. Non-UCITS (US-domiciled) ETFs are taxed at 15% on gains (code 865) and 5% on distributions (code 295). The main open dispute is a ΔΕΔ (AADE dispute-resolution directorate) decision that denied the exemption.

### Cited Findings
- **[AUTH]** ΠΟΛ.1032/2015: units of UCITS established in Greece, the EU or the EEA fall within the scope. The art. 103(5) ν.4099/2012 exemption still applies, and EU/EEA UCITS unitholders are treated like domestic ones (C-370/11). Gains from third-country UCITS are taxable. — [Taxheaven](https://www.taxheaven.gr/circulars/20353)
- **[PRACT]** Georgios Stouraitis (lawyer, KST Law), updated 10/07/2026:
  - UCITS units are exempt on gains and dividends, declared in E1 codes 659–660. Losses are not deductible.
  - Non-UCITS (third-country) funds are taxed at 15% on gains (code 865) and 5% on dividends (code 295).
  - What decides treatment is the UCITS label and domicile, not the index. An Irish ETF tracking the S&P 500 is exempt.
  - Exempt income must still be declared.
  - ΔΕΔ 1159/2024 rejected the exemption by requiring a Greek licence. The author calls this legally wrong. The taxpayer lost mainly because she had not declared the income and lacked UCITS proof.
  - He recommends keeping the KID or prospectus and relies on CJEU C-18/23 (Feb 2025).
  - This is law-firm advocacy. — [kstlaw.gr](https://kstlaw.gr/%CE%B1%CF%86%CE%BF%CF%81%CE%BF%CE%BB%CF%8C%CE%B3%CE%B7%CF%84%CE%B5%CF%82-%CE%B5%CF%80%CE%B5%CE%BD%CE%B4%CF%8D%CF%83%CE%B5%CE%B9%CF%82-%CE%BF%CF%83%CE%B5%CE%BA%CE%B1-etf/)
- **[PRACT]** Ourwallet.gr (09/02/2026): UCITS are exempt (code 659) whatever the underlying assets. Non-UCITS are 15% on gains (865) and 5% on dividends (295); a Gold ETC is the example given. The EU list of UCITS marketed in Greece covers marketing permission, not tax exemption. The author disagrees with a ΔΕΔ decision that taxed undeclared German fund gains. — [ourwallet.gr](https://ourwallet.gr/pos-forologountai-ependyseis/)
- **[PRACT]** AT Office (24/04/2026): VWCE and CSPX are exempt on gains and dividends. Accumulating and distributing funds are treated the same. US ETFs (VOO, QQQ) are 15% on gains. — [atoffice.com.gr](https://www.atoffice.com.gr/nea/forologisi-crypto-etf-odigos-gia-idiotes-ependytes-2026/)
- **[PRACT]** Myrtakis: tax on gains and dividends from EU ETFs is zero, citing art. 103. — [myrtakis.gr](https://www.myrtakis.gr/etf-forologiki-antimetopisi/). MoneyMinority: zero for both accumulating and distributing. — [moneyminority.com](https://moneyminority.com/ucits-etfs-forologia/). Taliro: for accumulating ETFs, report only sales, in codes 659–660. — [taliro.gr](https://taliro.gr/en/blog/ucits-etfs-tax-calculations/)
- **[AUTH, partial]** A ΔΕΔ decision numbered 1159 (Thessaloniki, 08/05/2024) exists on forin. I could only see the preamble, so I could not confirm from the primary text that it is the UCITS case cited by KST Law. — [forin ΔΕΔ doc 85038](https://www.forin.gr/cases/ded/document/85038?get=1)

### Inferences
- Software needs an instrument classification: UCITS (EU/EEA domicile, ISIN prefix IE/LU/DE/FR…) → exempt, code 659. US-domiciled ETF (ISIN prefix US) → 15% gains, 5% distributions. ETCs/ETNs (e.g. physical gold ETCs, which are debt securities, not UCITS) → treated by practitioners as taxable at 15% (code 865). The ISIN prefix is a reasonable proxy, but the UCITS status should be user-confirmable.
- Accumulating ETFs produce no annual taxable event. The only reporting is at sale (659) plus 743/781.
- Losses on exempt instruments have no tax value. Do not offset them against taxable 865 gains.

### Gaps
- No AADE circular was found addressing ETCs explicitly. The ETC treatment above is practitioner opinion only.

## Q3. Trading 212 specifics

### Takeaway
Trading 212 provides no Greek-specific tax statement. Its only formal tax document (Capital Income Statement/Steuerbescheinigung) is documented for German residents. Interest on cash is paid gross to non-German EU clients and practitioners classify it as foreign interest at 15%. Cash may sit in qualifying money market funds (QMMFs), which raises an unresolved characterisation question. Including the 0.15% FX fee and other costs in the acquisition cost is consistent with ΠΟΛ.1032/2015 ("costs directly tied to buying or selling"), but no source addresses it explicitly. Share lending income for EU clients is uncertain.

### Cited Findings
- **[BROKER]** Trading 212's Capital Income Statement article covers German residents. It can show interest on cash and tax deducted. From 5 Jan 2026, German residents have automatic withholding and a Steuerbescheinigung. Nothing comparable exists for Greece. — [T212 Help: Capital Income Statement](https://helpcentre.trading212.com/hc/en-us/articles/25976246710813-How-do-I-get-a-Capital-Income-Statement); [T212 Help: Non-EUR cash interest, German residents](https://helpcentre.trading212.com/hc/en-us/articles/31873218870557-Non-EUR-Cash-Interest-Update-for-German-Tax-Resident-Effective-5-Jan-2026)
- **[BROKER]** Interest on cash: for Trading 212 EU GmbH clients, cash may be held in QMMFs with the client's consent. The interest cap is €100,000 EUR per account from 3 Dec 2026, and cash above the cap earns 0%. — [T212 Help: Interest on cash](https://helpcentre.trading212.com/hc/en-us/articles/15475153380637-Interest-on-cash)
- **[3rd party]** For non-German EU clients, interest is paid gross and the country of residence may tax it. — [investingintheweb](https://investingintheweb.com/brokers/trading-212-interest-on-cash/)
- **[PRACT]** Foreign interest (e.g. P2P interest, foreign government bond coupons) is taxed at 15% in code 669. — [ourwallet.gr](https://ourwallet.gr/pos-forologountai-ependyseis/). The same site's comments say Revolut flexible cash funds can be declared exempt in 659 with a broker certificate proving UCITS status, and that Trading 212/IBKR must be judged "case by case". — same source
- **[3rd party]** Trading 212 entity: EU residents were onboarded through Trading 212 Markets Ltd (CySEC, Cyprus) from 2021. The German entity (ex-FXFlat, renamed Feb 2026) has been onboarding some countries, e.g. new Portuguese clients. No report says Greek clients were moved. — [T212 community](https://community.trading212.com/t/eu-registrations-open/49304); [financemagnates](https://www.financemagnates.com/forex/analysis/trading-212-put-44-million-into-its-overseas-units-nearly-half-in-germany/)
- **[AUTH]** Acquisition cost includes costs directly tied to the purchase or sale; the circular lists brokerage commissions, exchange fees and transaction tax. Where shares were bought in several lots, the circular uses average cost (total cost ÷ quantity). It does not address currency conversion. — [ΠΟΛ.1032/2015](https://www.taxheaven.gr/circulars/20353)
- **[ANEC]** Practice among investors: add commissions to 743 and subtract expenses from 781. — [xaa.gr](https://xaa.gr/index.php?topic=118.60)
- **[3rd party/ANEC]** Share lending: Trading 212 says it launched lending in 2022 and keeps 50% of the income. Community posts conflict on whether EU clients receive lending interest and whether participation is opt-in or default. — [T212 community: Share Lending Interest (T212 Markets)](https://community.trading212.com/t/share-lending-interest-t212-markets/65800); [investingintheweb review](https://investingintheweb.com/reviews/trading-212-review/)
- **[ANEC]** Securities lending: interest from lending on the Athens exchange is exempt under art. 37(6) ΚΦΕ. For IBKR lending, a commenter got the answer "659", while the asker had assumed 669 (taxable foreign interest). The question was unresolved. — [ourwallet.gr comments](https://ourwallet.gr/pos-forologountai-ependyseis/)
- **[ANEC]** A Greek user on the T212 community reports that dividends are shown in the original currency without an FX rate, so euro withholding cannot be proven to the tax office. — [T212 community, via search summary](https://community.trading212.com/t/dividend-statement-foreign-tax-paid/1342) (Greek post not located on page 5; treat as unverified)

### Inferences
- **Interest on cash:** default to foreign interest at 15% in code 669, with no Greek withholding. Flag the QMMF case: if the account statement shows money-market-fund distributions rather than bank interest, a UCITS MMF characterisation (exempt, code 659) is arguable, but no Greek source confirms it for Trading 212.
- **FX fee (0.15%):** it is a cost directly tied to the purchase or sale, so include it in acquisition cost and in sale costs. This follows the logic of ΠΟΛ.1032/2015 and is not an explicit ruling. It only matters for taxable (865) positions; for exempt positions it affects the 743/781 figures.
- **Card deposit fees:** not tied to a specific purchase, so better excluded from acquisition cost (inference; no source).
- **Fractional shares:** no Greek source treats them differently. They are ordinary shares of the same company; use quantity × price in the average-cost calculation.
- **"Dividend adjustment" refunds** (e.g. a reclaim after 30% vs 15% withholding): the T212 community shows such reimbursements happen, e.g. BTI wrongly subject to US withholding in 2020. Software should net them against the original withholding, so gross dividend and foreign tax stay consistent. — [T212 community thread](https://community.trading212.com/t/dividend-statement-foreign-tax-paid/1342?page=5)
- **Currency conversion:** no circular specifies it. A conservative default is the ECB/Bank of Greece reference rate on the transaction date, or the actual T212 conversion rate when the trade was FX-converted. Document the choice.

### Gaps
- No official T212 statement on whether Greek clients are under Markets Ltd (CY) or EU GmbH (DE). This affects the interest/QMMF wording on statements.
- No Greek source on the tax characterisation of T212 cash interest or share lending income.
- Card deposit fee treatment: no source.

## Q4. Corporate actions: splits, reverse splits, spin-offs, mergers, ticker changes, bonus shares

### Takeaway
Splits and reverse splits are explicitly not taxable events. The acquisition date is kept and the per-share cost is adjusted (Ε.2016/2024). Bonus shares from capitalisation of reserves reduce the per-share cost (ΠΟΛ.1032/2015). There is no AADE guidance on foreign spin-offs, stock-for-stock or cash mergers for individuals.

### Cited Findings
- **[AUTH]** Ε.2016/06-03-2024: a split or reverse split is not a "transfer" under art. 42. The number of shares changes but the capital does not, and the original acquisition date is kept (relevant for pre-2009 shares). Cost per share is adjusted proportionally, e.g. a €100 share split 1:2 gives a €50 cost per share. The circular also covers art. 42(4) subparagraphs 3–5 (ν.5024/2023): contributing listed titles to a company in which the contributor is sole shareholder is not taxed at contribution and carries over the original cost. — [AADE Ε.2016/2024](https://www.aade.gr/egkyklioi-kai-apofaseis/e-2016-06-03-2024); [Taxheaven summary](https://www.taxheaven.gr/news/66729/forologhsh-yperaxias-metabibashs-metoxwn-eishgmenwn-se-periptwseis-stock-split-h-reverse-stock-split)
- **[AUTH]** ΠΟΛ.1032/2015:
  - Free shares from capitalisation of reserves reduce the per-share acquisition cost.
  - For inherited or gifted shares, the cost is the value used for inheritance or gift tax (per ν.4549/2018, from 2018).
  - Successive buys use average cost.
  - Losses carry forward 5 years and may only offset gains in the same category.
  - All taxable transactions in a year are netted algebraically.
  - [Taxheaven ΠΟΛ.1032/2015](https://www.taxheaven.gr/circulars/20353)
- **[ANEC]** A reader of ourwallet asked how to declare about €50 of free shares (a promotion); the thread has no answer. — [ourwallet.gr](https://ourwallet.gr/pos-forologountai-ependyseis/)

### Inferences
- **Splits and reverse splits:** do not create a disposal. Keep the total cost and acquisition date and rescale quantity and per-share cost. Cash-in-lieu for fractions on a reverse split is a small sale; for <0.5% shares it is exempt (659).
- **Ticker or ISIN changes:** not a disposal; carry over cost and date.
- **Spin-offs:**
  - Option (a): the new shares are a distribution in kind, i.e. a dividend at market value (5%, code 295), with that value becoming the new shares' cost.
  - Option (b): treat it like bonus shares and allocate the parent's cost by relative market value, with no income.
  - No Greek guidance exists. Option (b) mirrors the bonus-share logic of ΠΟΛ.1032/2015; option (a) is the conservative view. Software should make this a user-selectable policy.
- **Cash mergers:** a disposal at the cash price (exempt if below 0.5%).
- **Stock-for-stock mergers:** no Greek rule for individuals holding foreign shares. Treat it as a disposal plus reacquisition, or as carry-over. For <0.5% listed shares the result is exempt either way, so it mostly affects the 743/781 figures.
- **Stock dividends / scrip:** by analogy with bonus shares from reserves, cost is reduced, but a scrip offered *in lieu* of a cash dividend could be seen as a dividend. Unresolved.

### Gaps
- No AADE circular, answer or ΔΕΔ decision found on foreign spin-offs, mergers or scrip dividends for individuals.

## Q5. W-8BEN, US withholding on dividends, Irish ETFs

### Takeaway
This is the sharpest factual disagreement. Several Greek practitioner sources (AT Office, others) say W-8BEN reduces US dividend withholding to 15%. Ourwallet and broker evidence (Lightyear; a Greek user on the T212 community) say Greek residents suffer 30%, because the 1950 Greece–US treaty has no reduced dividend rate. The Greek side taxes foreign dividends at 5% (code 295), with a credit capped at the Greek tax, so with 15% or 30% withholding no additional Greek tax is due either way. What changes is the amount of foreign tax reported and the size of the credit.

### Cited Findings
- **[PRACT]** Ourwallet.gr (09/02/2026): the Greece–US treaty does not cover dividends, so the 30% IRS withholding is final. Report the gross dividend in code 295 (Greek tax 5%), with a credit requiring an IRS or broker certificate (ΠΟΛ.1026/2014). The same article elsewhere says W-8BEN gives 15%, so it contradicts itself. — [ourwallet.gr](https://ourwallet.gr/pos-forologountai-ependyseis/)
- **[PRACT]** AT Office (24/04/2026): US dividends 30%, reduced to 15% with W-8BEN under the Greece–US treaty; the credit "απαιτεί επιπλέον διαδικασίες". — [atoffice.com.gr](https://www.atoffice.com.gr/nea/forologisi-crypto-etf-odigos-gia-idiotes-ependytes-2026/)
- **[BROKER, other broker]** Lightyear help centre: for tax residents of Croatia, Greece and Hungary, US dividend withholding is 30%. — [Lightyear](https://lightyear.com/en-eu/help/trading-and-investments/dividend-taxes)
- **[ANEC]** Trading 212 community: a Greek user reports 30% withholding despite a W-8BEN. Others claim a "0%" treaty rate; another replies that 5% is the Greek domestic rate. Unresolved. — [T212 community: W8-BEN/Withholding Tax issues](https://community.trading212.com/t/w8-ben-withholding-tax-issues/29470)
- **[PRACT]** Freeman Law: the US–Greece treaty provides no dividend withholding rate, so the domestic 30% applies. — [freemanlaw.com](https://freemanlaw.com/international-tax-treaties/greece/)
- **[PRACT]** e-forologia (Melas, 09/2025): the credit cannot exceed the Greek tax, and withholding above 15% abroad is "not accepted" for the credit. (I could not check how this interacts with dividends taxed at 5%.) — [e-forologia](https://www.e-forologia.gr/cms/viewContents.aspx?id=236660)
- **[ANEC]** One Greek-focused blog says that because Trading 212 is foreign, *all* dividends, even from Greek shares, go in code 295 rather than 291. — via search of [taklischris.eu](https://www.taklischris.eu/economy-investments/category/muepsilontauomicronchi941sigmaf) (not fetched; anecdotal)

### Inferences
- Software should read the actual withholding per dividend from the T212 export (it differs by issuer country) rather than assume 15%. Compute Greek tax as max(0, 5% × gross − creditable foreign tax), with the credit capped at 5% of gross. With US withholding of 15% or 30%, the additional Greek tax is 0 either way.
- **Irish UCITS ETFs:** the 15% US withholding that the fund itself suffers on its US dividends is a fund-level cost the investor cannot reclaim. Ireland imposes no withholding on ETF distributions to non-Irish residents (general knowledge; not sourced here). Distributions from UCITS are exempt in Greece (659) anyway.

### Gaps
- I could not render the IRS Tax Treaty Table 1 PDF to quote the Greece rows (dividends and interest). The report writer should verify on [IRS table 1](https://www.irs.gov/pub/irs-lbi/tax-treaty-table-1.pdf).
- No Trading 212 page found stating the withholding rate it applies to Greek residents.

## Q6. Common mistakes (per accountants and forums)

### Takeaway
The recurring mistakes are: not declaring exempt gains and UCITS income at all, especially relevant given the ΔΕΔ cases; misplacing UCITS income in taxable codes; mishandling 743/781; and lacking documentation in euros.

### Cited Findings
- **[PRACT]** Mistakes that appear in the ourwallet article and comments:
  - Treating the EU marketing list of UCITS as a tax-exemption list.
  - Putting UCITS in code 667 or 865 instead of 659.
  - Filling 743 totals without declaring the related trades.
  - Having a broker statement that is not given to the accountant.
  - Forgetting net-of-tax returns.
  - [ourwallet.gr](https://ourwallet.gr/pos-forologountai-ependyseis/)
- **[PRACT]** Exempt income must be declared. In the ΔΕΔ case the taxpayer lost largely because the income was undeclared and she lacked UCITS documents. — [kstlaw.gr](https://kstlaw.gr/%CE%B1%CF%86%CE%BF%CF%81%CE%BF%CE%BB%CF%8C%CE%B3%CE%B7%CF%84%CE%B5%CF%82-%CE%B5%CF%80%CE%B5%CE%BD%CE%B4%CF%8D%CF%83%CE%B5%CE%B9%CF%82-%CE%BF%CF%83%CE%B5%CE%BA%CE%B1-etf/)
- **[PRACT]** The taxable event is the sale, not the withdrawal to a bank. Fund domicile, not the market invested in, decides UCITS treatment. — [atoffice.com.gr](https://www.atoffice.com.gr/nea/forologisi-crypto-etf-odigos-gia-idiotes-ependytes-2026/)
- **[ANEC]**
  - One poster's accountant advised declaring unrealised FX gains; the poster disagreed.
  - Netting trades can show money the investor does not actually have.
  - Accountants are poorly informed and investors fill 743 themselves.
  - [xaa.gr](https://xaa.gr/index.php?topic=118.60)

### Inferences
- The product should output: (1) gross purchases → 743; (2) net sale proceeds → 781; (3) exempt gains → 659; (4) taxable gains → 865; (5) dividends → 295 with foreign tax; (6) interest → 669. It should also produce an EUR-denominated per-transaction appendix as documentary support.

### Gaps
- No accountant source specifically on whether 743 should be gross purchases or net new money; practice varies (anecdotal).

## Q7. Official AADE answers on foreign brokers like Trading 212

### Takeaway
I found no AADE answer, Ε. circular or ΔΕΔ decision that names Trading 212, Revolut, eToro or IBKR. The governing guidance is generic: ΠΟΛ.1032/2015 (foreign shares and EU UCITS), ΠΟΛ.1026/2014 (foreign tax credit documents), Ε.2016/2024 (splits), and the yearly E1 instructions (Α.1032/2025 for tax year 2024). Relevant ΔΕΔ practice concerns undeclared foreign fund gains (ΔΕΔ 1159/2024 per KST Law).

### Cited Findings
- **[AUTH]** ΠΟΛ.1032/2015 — [Taxheaven](https://www.taxheaven.gr/circulars/20353); Ε.2016/2024 — [AADE](https://www.aade.gr/egkyklioi-kai-apofaseis/e-2016-06-03-2024); Α.1032/2025 cited by [e-forologia](https://www.e-forologia.gr/cms/viewContents.aspx?id=236660)
- **[PRACT]** Ourwallet cites ΔΕΔ crypto decisions 417/2023 and 1699e/2023, and ΠΟΛ.1082/2018 on netting within a category. — [ourwallet.gr](https://ourwallet.gr/pos-forologountai-ependyseis/)
- **[PRACT]** Foreign income is now visible to AADE through automatic exchange of financial account data. — [kstlaw.gr](https://kstlaw.gr/%CE%B1%CF%86%CE%BF%CF%81%CE%BF%CE%BB%CF%8C%CE%B3%CE%B7%CF%84%CE%B5%CF%82-%CE%B5%CF%80%CE%B5%CE%BD%CE%B4%CF%8D%CF%83%CE%B5%CE%B9%CF%82-%CE%BF%CF%83%CE%B5%CE%BA%CE%B1-etf/)

### Inferences
- Because AADE receives CRS data from Cyprus and Germany, non-declaration is riskier than practitioners' "many declare nothing" anecdotes suggest.

### Gaps
- r/PersonalFinanceGreece and insomnia.gr threads could not be retrieved by the search tool. Reddit-specific anecdotal positions are therefore missing.
- Full texts of ΔΕΔ 1159/2024 and Ε.2016/2024 (forin returned 403) were not read directly; their content comes from secondary summaries.
