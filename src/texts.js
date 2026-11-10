// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget layout: results of
// the Configuration actions, of the scene actions and of the widget button,
// their errors, and the spoken summary of `read_tasks`. Four languages, the
// four of the Gladys interface; German says "du", Spanish "usted".
// test/i18n.test.js checks every table.
//
// Every message is a function of `{ name, date, count }`: a task name, a
// formatted date and a number, used or not.
// -----------------------------------------------------------------------------

export const LANGUAGE_FALLBACK = 'en';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const MESSAGES = {
  en: {
    created: ({ name, date }) =>
      `Task "${name}" created, next due on ${date}. Add it in Discovery for the dashboard and the scenes.`,
    updated: ({ name, date }) => `Task "${name}" changed, next due on ${date}.`,
    deleted: ({ name }) => `Task "${name}" deleted. Delete its device in Gladys too.`,
    done: ({ name, date }) => `"${name}" done, next time on ${date}.`,
    noTasks: () => 'No task yet: create one with the button above.',
    summary: ({ name, date }) => `${name}: ${date}`,
    unknownTask: () => 'This task no longer exists: choose another one.',
    noTaskNamed: ({ name }) => `No task is named "${name}".`,
    emptyName: () => 'Enter a name, or choose a suggested task.',
    badPeriod: () =>
      'Give the period: every 1 to 120 days, weeks, months or years, 10 years at most.',
    badNotice: () => 'The notice is 0 to 365 days, and shorter than the period.',
    badTemplate: () => 'Unknown suggested task: choose one from the list.',
    tooManyTasks: ({ count }) => `${count} tasks at most.`,
    badDate: ({ name }) => `Date not understood ("${name}"): e.g. 2026-03-14, 14/03/2026, -7.`,
    futureDate: () => 'This date is in the future: give the day it was done.',
    saveFailed: () => 'The tasks could not be saved in /data: see the integration logs.',
    inDays: ({ count }) => `in ${count} d`,
    today: () => 'today',
    lateDays: ({ count }) => `${count} d late`,
    readItem: ({ name, date }) => `${name} (${date})`,
    readNothing: () => 'No maintenance due.',
  },
  fr: {
    created: ({ name, date }) =>
      `Tâche « ${name} » créée, prochaine échéance le ${date}. Ajoutez-la dans Découverte pour le tableau de bord et les scènes.`,
    updated: ({ name, date }) => `Tâche « ${name} » modifiée, prochaine échéance le ${date}.`,
    deleted: ({ name }) => `Tâche « ${name} » supprimée. Supprimez aussi son appareil dans Gladys.`,
    done: ({ name, date }) => `« ${name} » fait, prochaine fois le ${date}.`,
    noTasks: () => 'Aucune tâche pour le moment : créez-en une avec le bouton ci-dessus.',
    summary: ({ name, date }) => `${name} : ${date}`,
    unknownTask: () => "Cette tâche n'existe plus : choisissez-en une autre.",
    noTaskNamed: ({ name }) => `Aucune tâche ne s'appelle « ${name} ».`,
    emptyName: () => 'Saisissez un nom, ou choisissez une tâche proposée.',
    badPeriod: () =>
      'Indiquez la période : tous les 1 à 120 jours, semaines, mois ou ans, 10 ans au plus.',
    badNotice: () =>
      'Le délai de prévenance va de 0 à 365 jours, et reste plus court que la période.',
    badTemplate: () => 'Tâche proposée inconnue : choisissez-en une dans la liste.',
    tooManyTasks: ({ count }) => `${count} tâches au maximum.`,
    badDate: ({ name }) => `Date incomprise (« ${name} ») : ex. 2026-03-14, 14/03/2026, -7.`,
    futureDate: () => 'Cette date est dans le futur : indiquez le jour où ça a été fait.',
    saveFailed: () =>
      "Les tâches n'ont pas pu être enregistrées dans /data : voir les logs de l'intégration.",
    inDays: ({ count }) => `dans ${count} j`,
    today: () => "aujourd'hui",
    lateDays: ({ count }) => `retard de ${count} j`,
    readItem: ({ name, date }) => `${name} (${date})`,
    readNothing: () => 'Aucun entretien à prévoir.',
  },
  de: {
    created: ({ name, date }) =>
      `Aufgabe „${name}“ erstellt, nächste Fälligkeit am ${date}. Füge sie unter Erkennung hinzu, für Dashboard und Szenen.`,
    updated: ({ name, date }) => `Aufgabe „${name}“ geändert, nächste Fälligkeit am ${date}.`,
    deleted: ({ name }) => `Aufgabe „${name}“ gelöscht. Lösche auch ihr Gerät in Gladys.`,
    done: ({ name, date }) => `„${name}“ erledigt, nächstes Mal am ${date}.`,
    noTasks: () => 'Noch keine Aufgabe: Erstelle eine mit der Schaltfläche oben.',
    summary: ({ name, date }) => `${name}: ${date}`,
    unknownTask: () => 'Diese Aufgabe gibt es nicht mehr: Wähle eine andere.',
    noTaskNamed: ({ name }) => `Keine Aufgabe heißt „${name}“.`,
    emptyName: () => 'Gib einen Namen ein oder wähle eine vorgeschlagene Aufgabe.',
    badPeriod: () =>
      'Gib den Zeitraum an: alle 1 bis 120 Tage, Wochen, Monate oder Jahre, höchstens 10 Jahre.',
    badNotice: () => 'Die Vorwarnzeit beträgt 0 bis 365 Tage und ist kürzer als der Zeitraum.',
    badTemplate: () => 'Unbekannte vorgeschlagene Aufgabe: Wähle eine aus der Liste.',
    tooManyTasks: ({ count }) => `Höchstens ${count} Aufgaben.`,
    badDate: ({ name }) => `Datum nicht verstanden („${name}“): z. B. 2026-03-14, 14.03.2026, -7.`,
    futureDate: () =>
      'Dieses Datum liegt in der Zukunft: Gib den Tag an, an dem es erledigt wurde.',
    saveFailed: () =>
      'Die Aufgaben konnten nicht in /data gespeichert werden: Sieh dir die Protokolle der Integration an.',
    inDays: ({ count }) => `in ${count} T.`,
    today: () => 'heute',
    lateDays: ({ count }) => `${count} T. überfällig`,
    readItem: ({ name, date }) => `${name} (${date})`,
    readNothing: () => 'Keine Wartung fällig.',
  },
  es: {
    created: ({ name, date }) =>
      `Tarea «${name}» creada, próximo vencimiento el ${date}. Añádala en Descubrimiento para el panel y las escenas.`,
    updated: ({ name, date }) => `Tarea «${name}» modificada, próximo vencimiento el ${date}.`,
    deleted: ({ name }) => `Tarea «${name}» eliminada. Elimine también su dispositivo en Gladys.`,
    done: ({ name, date }) => `«${name}» hecho, la próxima vez el ${date}.`,
    noTasks: () => 'Todavía no hay ninguna tarea: cree una con el botón de arriba.',
    summary: ({ name, date }) => `${name}: ${date}`,
    unknownTask: () => 'Esta tarea ya no existe: elija otra.',
    noTaskNamed: ({ name }) => `Ninguna tarea se llama «${name}».`,
    emptyName: () => 'Introduzca un nombre o elija una tarea propuesta.',
    badPeriod: () =>
      'Indique el periodo: cada 1 a 120 días, semanas, meses o años, 10 años como máximo.',
    badNotice: () => 'El aviso previo va de 0 a 365 días y es más corto que el periodo.',
    badTemplate: () => 'Tarea propuesta desconocida: elija una de la lista.',
    tooManyTasks: ({ count }) => `${count} tareas como máximo.`,
    badDate: ({ name }) => `Fecha no entendida («${name}»): p. ej. 2026-03-14, 14/03/2026, -7.`,
    futureDate: () => 'Esta fecha está en el futuro: indique el día en que se hizo.',
    saveFailed: () =>
      'No se han podido guardar las tareas en /data: consulte los registros de la integración.',
    inDays: ({ count }) => `en ${count} d`,
    today: () => 'hoy',
    lateDays: ({ count }) => `${count} d de retraso`,
    readItem: ({ name, date }) => `${name} (${date})`,
    readNothing: () => 'Ningún mantenimiento pendiente.',
  },
};

const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];

/** A message in one language. */
export function message(key, language, { name = '', date = '', count = 0 } = {}) {
  return pick(MESSAGES, language)[key]({
    name: fit(String(name), 40),
    date: fit(String(date), 40),
    count,
  });
}

/** The same message in every language (Configuration screen, toasts). */
export const allLanguages = (key, params) =>
  Object.fromEntries(
    Object.keys(MESSAGES).map((language) => [language, message(key, language, params)]),
  );

/** Like allLanguages, the params computed per language (formatted dates). */
export const perLanguage = (key, paramsOf) =>
  Object.fromEntries(
    Object.keys(MESSAGES).map((language) => [language, message(key, language, paramsOf(language))]),
  );

/**
 * An error the user caused and can fix: thrown by the hub, shown in the
 * language of whoever sees it (the configured language).
 */
export class UserError extends Error {
  constructor(key, params = {}) {
    super(message(key, LANGUAGE_FALLBACK, params));
    this.name = 'UserError';
    this.key = key;
    this.params = params;
  }

  localized(language) {
    return message(this.key, language, this.params);
  }
}
