/**
 * The drawer has one root element that every sheet paints into. A sheet that loads data asynchronously must not paint after
 * the person has moved on, and one that holds a live subscription must let go of it when it is replaced or closed.
 */
interface Claimed extends HTMLElement { _sheet?: { dispose?: () => void } }

/** Marks `root` as owned by the calling sheet. The returned function says whether it still is. */
export function claim(root: HTMLElement, dispose?: () => void): () => boolean {
  release(root)
  const me = { dispose }
  ;(root as Claimed)._sheet = me
  return () => (root as Claimed)._sheet === me
}

/** Ends the current sheet's claim and runs its cleanup. */
export function release(root: HTMLElement) {
  const c = root as Claimed
  const prev = c._sheet
  c._sheet = undefined
  prev?.dispose?.()
}
