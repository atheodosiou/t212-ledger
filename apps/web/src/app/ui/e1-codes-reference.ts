import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { E1_GROUP_LABEL, E1_REFERENCE, E1_REFERENCE_YEAR, type E1Group } from '../core/e1-codes';

const GROUPS: E1Group[] = ['info', 'income', 'gains', 'justification'];

/** The Ε1 codes for investments, in AADE's words, and what the app puts in each. */
@Component({
  selector: 'app-e1-codes-reference',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section id="e1-codes" class="scroll-mt-40" aria-labelledby="e1-codes-title">
      <div class="p-4 sm:p-5">
        <h2 id="e1-codes-title" class="font-semibold">Κωδικοί Ε1 για επενδύσεις</h2>
        <p class="mt-1 max-w-3xl text-sm text-muted">
          Οι κωδικοί και οι περιγραφές τους είναι αυτοί που ορίζει η ΑΑΔΕ στο έντυπο Ε1 του
          φορολογικού έτους {{ year }} (δηλώσεις που υποβλήθηκαν το {{ year + 1 }}). Τους πήραμε από
          μια υποβληθείσα δήλωση εκείνου του έτους. Η ΑΑΔΕ μπορεί να αλλάξει αριθμούς ή διατυπώσεις
          από χρονιά σε χρονιά. Για τον σύζυγο ή ΜΣΣ ισχύει ο επόμενος αριθμός (π.χ. 296 αντί για
          295). Τα ποσά για κάθε έτος είναι στη σελίδα
          <a routerLink="/taxes" class="font-medium text-brand hover:underline">Φόροι</a>.
        </p>
      </div>

      @for (g of groups; track g) {
        <h3 class="border-t border-line bg-canvas/60 px-4 py-2 text-sm font-medium sm:px-5">
          {{ groupLabel[g] }}
        </h3>
        <!-- Fixed layout: the columns line up from one group to the next. On a phone each
             code is a card, its long texts one under the other. -->
        <table class="w-full text-sm max-sm:block sm:table-fixed">
          <thead class="text-left text-xs text-muted max-sm:sr-only">
            <tr>
              <th class="w-36 px-4 py-2 font-medium sm:pl-5">Κωδικός</th>
              <th class="w-[34%] px-4 py-2 font-medium">Περιγραφή ΑΑΔΕ</th>
              <th class="px-4 py-2 font-medium">Τι βάζει η εφαρμογή</th>
              <th class="w-44 px-4 py-2 font-medium sm:pr-5">Αποτέλεσμα</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-line max-sm:block">
            @for (c of rows(g); track c.code) {
              <tr class="align-top max-sm:block max-sm:px-4 max-sm:py-3">
                <td
                  class="px-4 py-2.5 max-sm:flex max-sm:items-center max-sm:gap-3 max-sm:p-0 sm:pl-5"
                >
                  <span
                    class="inline-block w-12 shrink-0 rounded-md bg-canvas py-1 text-center font-semibold tabular-nums"
                    >{{ c.code }}</span
                  >
                  <span class="block text-xs text-muted sm:mt-1">{{ c.where }}</span>
                </td>
                <td class="px-4 py-2.5 italic text-muted max-sm:block max-sm:p-0 max-sm:pt-2">
                  <span class="block text-xs font-medium not-italic sm:hidden">Περιγραφή ΑΑΔΕ</span>
                  «{{ c.aade }}»
                </td>
                <td class="px-4 py-2.5 max-sm:block max-sm:p-0 max-sm:pt-2">
                  <span class="block text-xs font-medium text-muted sm:hidden"
                    >Τι βάζει η εφαρμογή</span
                  >
                  {{ c.app }}
                </td>
                <td class="px-4 py-2.5 text-muted max-sm:block max-sm:p-0 max-sm:pt-2 sm:pr-5">
                  <span class="text-xs font-medium sm:hidden">Αποτέλεσμα: </span>{{ c.effect }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      }

      <p
        class="m-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 sm:m-5"
      >
        <strong>Μόνο για ενημέρωση.</strong> Δεν είναι φορολογική συμβουλή. Ορισμένα σημεία (π.χ. τι
        μπαίνει στο 743 και στο 781, ή αν οι τόκοι μετρητών είναι τόκος) δεν έχουν επίσημη απάντηση
        και οι λογιστές διαφωνούν. Πάντα να ελέγχεις τους κωδικούς και τα ποσά με τον λογιστή σου
        πριν υποβάλεις τη δήλωση.
      </p>
    </section>
  `,
})
export class E1CodesReference {
  protected readonly year = E1_REFERENCE_YEAR;
  protected readonly groups = GROUPS;
  protected readonly groupLabel = E1_GROUP_LABEL;

  protected rows(group: E1Group) {
    return E1_REFERENCE.filter((c) => c.group === group);
  }
}
