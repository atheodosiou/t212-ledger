import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Who runs the service and how to reach them. Required before a public launch. */
export const OPERATOR = {
  name: 'Anastasios Theodosiou',
  /** Where people write about their data. */
  contactEmail: 'anastasios.theodosiou@gmail.com',
};

@Component({
  selector: 'app-privacy-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article
      class="mx-auto max-w-2xl text-sm leading-relaxed [&_h2]:mt-6 [&_h2]:font-semibold [&_h2]:text-base [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-2 [&_ul]:mt-2"
    >
      <a routerLink="/" class="text-xs text-muted hover:text-ink">‹ Αρχική</a>
      <h1 class="text-2xl font-semibold tracking-tight">Απόρρητο</h1>
      <p class="text-muted">Τι κρατάμε, γιατί, για πόσο, και πώς το παίρνεις πίσω ή το σβήνεις.</p>

      <h2>Τι κρατάμε</h2>
      <ul>
        <li>
          Το email και το όνομά σου, και ένα αναγνωριστικό του λογαριασμού Google σου (όχι τον
          κωδικό σου).
        </li>
        <li>
          Τα API keys του Trading 212 που συνδέεις, κρυπτογραφημένα (AES-256-GCM). Δεν εμφανίζονται
          ποτέ ξανά, ούτε σε σένα.
        </li>
        <li>
          Το ιστορικό συναλλαγών, μερισμάτων και κινήσεων μετρητών, όπως το επιστρέφει το Trading
          212, και τις κινήσεις και αναφορές που υπολογίζουμε από αυτό.
        </li>
        <li>
          Τις συνδέσεις σου (πότε, από ποιον browser), για να μένεις συνδεδεμένος και να μπορείς να
          αποσυνδεθείς παντού.
        </li>
        <li>
          Logs του server με μέθοδο, διαδρομή, αποτέλεσμα και διάρκεια κάθε αιτήματος. Ποτέ
          περιεχόμενο αιτημάτων, keys ή cookies.
        </li>
      </ul>

      <h2>Γιατί</h2>
      <p>
        Μόνο για να σου δείξουμε το ιστορικό σου και να φτιάξουμε τις αναφορές. Δεν πουλάμε, δεν
        μοιραζόμαστε και δεν χρησιμοποιούμε τα δεδομένα για διαφήμιση. Δεν υπάρχουν analytics ή
        cookies τρίτων: το μόνο cookie είναι αυτό της σύνδεσης.
      </p>

      <h2>Ποιοι άλλοι εμπλέκονται</h2>
      <ul>
        <li>Η Google, μόνο για τη σύνδεση.</li>
        <li>Το Trading 212, από όπου διαβάζουμε τα δεδομένα σου με το key που μας δίνεις.</li>
        <li>Η Contabo, που φιλοξενεί τον server και τη βάση δεδομένων.</li>
      </ul>
      <p>
        Προτείνουμε key μόνο για ανάγνωση: η εφαρμογή δεν κάνει ποτέ συναλλαγές. Μπορείς να το
        ανακαλέσεις όποτε θέλεις από το Trading 212.
      </p>

      <h2>Για πόσο</h2>
      <p>
        Όσο έχεις λογαριασμό. Όταν τον διαγράψεις, όλα σβήνονται αμέσως. Τα ημερήσια αντίγραφα
        ασφαλείας κρατιούνται 14 ημέρες και μετά σβήνονται.
      </p>

      <h2>Τα δικαιώματά σου</h2>
      <p>
        Από τη σελίδα <a routerLink="/settings" class="underline">Ο λογαριασμός μου</a> κατεβάζεις
        όλα τα δεδομένα σου σε ένα αρχείο και διαγράφεις τον λογαριασμό σου οριστικά.
        @if (operator.contactEmail) {
          Για οτιδήποτε άλλο γράψε στο
          <a [href]="'mailto:' + operator.contactEmail" class="underline">{{
            operator.contactEmail
          }}</a
          >.
        }
      </p>
      <p class="text-muted">Υπεύθυνος: {{ operator.name }}.</p>
    </article>
  `,
})
export class PrivacyPage {
  protected readonly operator = OPERATOR;
}
