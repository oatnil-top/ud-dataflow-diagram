import type { i18n as I18n } from 'i18next'
import en from './en.json'
import zh from './zh.json'

/**
 * Register this package's strings on a host's i18next instance.
 *
 * ⛔ Never merge these by spreading them into the host's resource object. ud's
 * i18n/config.ts merges its locale files with `{...a, ...b}`, and every one of this
 * package's keys lives under the single top-level key `resources` — so a spread would
 * replace the host's ENTIRE `resources` namespace with just the diagram's slice, taking
 * ~74 unrelated keys (`resources.upload`, `resources.title`, …) down with it. The damage
 * would be invisible in this package's own strings, which is what makes it worth a
 * function instead of a JSON export.
 *
 * `addResourceBundle` with deep=true merges instead of replacing; overwrite=false means a
 * host that has already translated one of these keys keeps its own wording.
 */
export function registerDataflowMessages(i18n: I18n): void {
  i18n.addResourceBundle('en', 'translation', { resources: { dataflow: en } }, true, false)
  i18n.addResourceBundle('zh', 'translation', { resources: { dataflow: zh } }, true, false)
}
