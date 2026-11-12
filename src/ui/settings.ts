import { LOCALES, getLocale, t } from '../i18n'
import { prefs, setPref, type Units } from '../prefs'
import { currentTheme, setTheme } from '../theme'
import { contactEmail } from '../auth'
import { syncState } from '../sync'
import { esc } from './format'
import { swatchesHtml, wireSwatches } from './profile'
import { icons } from './icons'

export interface SettingsCtx {
  back(): void
  /** whether a backend is configured at all, so account and sharing rows make sense */
  cloud: boolean
  signedIn: boolean
  handle?: string
  homeName?: string
  openAccount(): void
  openLanguage(): void
  openShared(): void
  openHome(): void
  exportData(): void
  importFile(file: File): Promise<void>
  eraseAll(): Promise<void>
}

const row = (act: string, icon: string, title: string, note: string, go = true) =>
  `<li><button data-set="${act}"><span>${icon}</span><b>${title}</b><small>${note}</small>${go ? `<i class="go" aria-hidden="true">${icons.chevron}</i>` : ''}</button></li>`

const seg = (attr: string, name: string, value: string, opts: [string, string][]) => `
  <div class="seg" role="radiogroup" aria-label="${esc(name)}">${opts.map(([v, label]) =>
    `<button type="button" role="radio" ${attr}="${v}" aria-checked="${v === value}">${esc(label)}</button>`).join('')}</div>`

const toggle = (key: string, on: boolean, title: string, note: string) => `
  <li class="switch-row"><label><span class="sw-text"><b>${title}</b><small>${note}</small></span>
    <input type="checkbox" role="switch" data-toggle="${key}" ${on ? 'checked' : ''} /><i class="sw" aria-hidden="true"></i></label></li>`

/** One page for everything that is not a trip: account, look, map behaviour, data and the legal links. */
export function renderSettings(root: HTMLElement, ctx: SettingsCtx) {
  let sure = false // the erase button asks twice
  const render = () => {
    const p = prefs()
    const lang = LOCALES.find(l => l.code === getLocale())?.name ?? 'English'
    const acct = ctx.signedIn
      ? row('account', icons.user, `@${esc(ctx.handle ?? '')}`, t(`acct.sync.${syncState() === 'off' ? 'syncing' : syncState()}`))
      : row('account', icons.user, t('acct.row'), t('acct.rowNote'))
    root.innerHTML = `
      <div class="sheet settings">
        <button class="x" data-act="close" aria-label="${t('close')}">${icons.close}</button>
        <h2 class="title">${t('set.title')}</h2>

        ${ctx.cloud ? `<h3 class="sub-title">${t('set.secAccount')}</h3>
        <ul class="setting">${acct}${ctx.signedIn ? row('shared', icons.globe, t('set.shared'), t('set.sharedNote')) : ''}</ul>` : ''}

        <h3 class="sub-title">${t('set.secLook')}</h3>
        <ul class="setting">
          <li class="ctl"><b>${t('set.theme')}</b>${seg('data-theme', t('set.theme'), currentTheme(), [['light', t('set.themeLight')], ['dark', t('set.themeDark')]])}</li>
          <li class="ctl ctl-col"><b>${t('acct.accent')}</b>${swatchesHtml()}</li>
          ${row('language', icons.globe, t('set.language'), esc(lang))}
        </ul>

        <h3 class="sub-title">${t('set.secMap')}</h3>
        <ul class="setting">
          ${row('home', icons.pin, ctx.homeName ? t('set.home', { name: esc(ctx.homeName) }) : t('set.chooseHome'), t('set.homeNote'))}
          <li class="ctl"><b>${t('set.units')}</b>${seg('data-seg', t('set.units'), p.units, [['km', t('set.unitKm')], ['mi', t('set.unitMi')]])}</li>
          ${toggle('spin', p.spin, t('set.spin'), t('set.spinNote'))}
          ${toggle('haptics', p.haptics, t('set.haptics'), t('set.hapticsNote'))}
        </ul>

        <h3 class="sub-title">${t('set.secData')}</h3>
        <ul class="setting">
          ${row('export', icons.download, t('set.export'), t('set.exportNote'), false)}
          <li><label><span>${icons.upload}</span><b>${t('set.import')}</b><small>${t('set.importNote')}</small><input id="import" type="file" accept="application/json" hidden /></label></li>
          <li><button data-set="erase" class="${sure ? 'sure' : ''}"><span>${icons.close}</span><b>${sure ? t('set.eraseConfirm') : t('set.erase')}</b><small>${t('set.eraseNote')}</small></button></li>
        </ul>

        <h3 class="sub-title">${t('set.secAbout')}</h3>
        <p class="fine">${ctx.cloud ? t('set.fineCloud') : t('set.fine')}</p>
        ${ctx.cloud ? `<p class="fine"><a href="./privacy.html" target="_blank" rel="noopener">${t('acct.privacy')}</a> · <a href="./terms.html" target="_blank" rel="noopener">${t('acct.terms')}</a> · <a href="mailto:${esc(contactEmail)}">${t('set.contact')}</a></p>` : ''}
        <p class="fine">${t('set.version', { v: esc(__APP_VERSION__) })}</p>
      </div>`

    wireSwatches(root, ctx.signedIn)
  }
  render()

  root.onclick = e => {
    const el = e.target as HTMLElement
    const theme = el.closest<HTMLElement>('button[data-theme]')
    if (theme) { setTheme(theme.dataset.theme as 'light' | 'dark'); render(); return }
    const unit = el.closest<HTMLElement>('[data-seg]')
    if (unit) { setPref('units', unit.dataset.seg as Units); render(); return }
    const k = el.closest<HTMLElement>('[data-set]')?.dataset.set
    if (!k) return
    if (k === 'account') ctx.openAccount()
    else if (k === 'shared') ctx.openShared()
    else if (k === 'language') ctx.openLanguage()
    else if (k === 'home') ctx.openHome()
    else if (k === 'export') ctx.exportData()
    else if (k === 'erase') {
      if (!sure) { sure = true; render(); setTimeout(() => { if (sure) { sure = false; if (root.isConnected) render() } }, 4000); return }
      sure = false
      void ctx.eraseAll().then(render)
    }
  }
  root.onchange = e => {
    const el = e.target as HTMLInputElement
    if (el.dataset.toggle) { setPref(el.dataset.toggle as 'spin' | 'haptics', el.checked); return }
    if (el.id === 'import' && el.files?.[0]) void ctx.importFile(el.files[0]).then(() => { el.value = '' })
  }
}
