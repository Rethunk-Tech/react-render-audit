import type { Page } from '@playwright/test'

/** A boxed element (an edge or a fill with rounded corners) that sits inside another one on the screen. Dialog, menu
 * and popover papers are the surface their content sits on, not a card, so they do not count as the outer box. */
export interface NestedBox {
  inner: string
  outer: string
  text: string
}

export interface BoxOptions {
  /** Selector for surfaces content sits on (dialog or menu papers), which never count as the outer box. */
  surfaces?: string
  /** Elements, and their insides, that are not judged (buttons and inputs draw their own box). */
  controls?: string
  /** Class names starting with this are named in the findings; the app's own components, usually. */
  ownClassPrefix?: string
}

export function nestedBoxes(
  page: Page,
  { surfaces = '', controls = 'input, textarea', ownClassPrefix = '' }: BoxOptions = {},
): Promise<NestedBox[]> {
  return page.evaluate(
    ({ surfaceSelector, controlSelector, prefix }) => {
      const MinCardWidthPx = 120
      const MinCardHeightPx = 28
      const clear = (c: string) => c === 'rgba(0, 0, 0, 0)' || c === 'transparent'
      const boxed = (el: Element): boolean => {
        const s = getComputedStyle(el)
        const radius = Number.parseFloat(s.borderTopLeftRadius) > 0
        const edge = ['Top', 'Right', 'Bottom', 'Left'].every(
          (side) =>
            Number.parseFloat(s.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 &&
            !clear(s.getPropertyValue(`border-${side.toLowerCase()}-color`)),
        )
        const box = el.getBoundingClientRect()
        const big = box.width >= MinCardWidthPx && box.height >= MinCardHeightPx
        return radius && big && (edge || !clear(s.backgroundColor))
      }
      const name = (el: Element) => {
        const aria = el.getAttribute('aria-label')
        const cls = [...el.classList]
          .filter((c) => prefix !== '' && c.startsWith(prefix))
          .slice(0, 2)
          .join('.')
        return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}${aria ? `[${aria}]` : ''}`
      }
      const out: NestedBox[] = []
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect()
        if (
          r.width === 0 ||
          r.height === 0 ||
          (controlSelector !== '' && el.closest(controlSelector))
        ) {
          continue
        }
        if (!boxed(el)) {
          continue
        }
        let up = el.parentElement
        while (up && up !== document.body) {
          if (surfaceSelector !== '' && up.matches(surfaceSelector)) {
            break
          }
          if (boxed(up)) {
            out.push({
              inner: name(el),
              outer: name(up),
              text: (el.textContent ?? '').trim().slice(0, 60),
            })
            break
          }
          up = up.parentElement
        }
      }
      return out
    },
    { surfaceSelector: surfaces, controlSelector: controls, prefix: ownClassPrefix },
  )
}
