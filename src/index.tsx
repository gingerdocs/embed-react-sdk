import { useEffect, useRef } from 'react'
import {
  mount,
  type GingerDocsEvent,
  type GingerDocsEventName,
  type GingerDocsEmbedInstance,
  type MountOptions,
} from '@gingerdocs/embed'

export type {
  GingerDocsEvent,
  GingerDocsEventName,
  GingerDocsEmbedInstance,
} from '@gingerdocs/embed'

/**
 * `@gingerdocs/react` — a thin wrapper around `@gingerdocs/embed`.
 *
 * Thin is the design, not a shortcut. Everything about the embed — the iframe
 * attributes, the origin and session checks, the event catalog — lives in the
 * core package, because a React-shaped copy of any of it would be a second
 * implementation of a security check. What is here is the part React actually
 * owns: mounting into a ref, tearing down on unmount, and not re-mounting on
 * every render.
 */

export interface GingerDocsEmbedProps extends Omit<MountOptions, 'style'> {
  /**
   * One handler for every event, rather than nine optional props.
   *
   * Nine props would each need memoising by the caller to avoid re-mounting,
   * and a host who forgot one would get a frame that reloaded mid-signature.
   * One handler behind a ref (below) has no such trap, and `event.type` is a
   * union the compiler narrows on.
   */
  onEvent?: (event: GingerDocsEvent) => void

  /** Styles for the wrapper element. The iframe fills it. */
  style?: React.CSSProperties

  className?: string
}

export function GingerDocsEmbed({
  url,
  sessionId,
  locale,
  title,
  expand,
  onEvent,
  style,
  className,
}: GingerDocsEmbedProps): React.ReactElement {
  const container = useRef<HTMLDivElement>(null)
  const instance  = useRef<GingerDocsEmbedInstance | null>(null)

  /**
   * The handler behind a ref, and this is the whole reason the component is not
   * one line.
   *
   * Every host will pass an inline arrow, whose identity changes on every
   * render. In the effect's dependency array that would tear the iframe down
   * and rebuild it on each render — losing a signature in progress, and
   * spending the session's single-use fragment token on every mount until the
   * grace window is the only thing keeping the embed alive.
   */
  const handler = useRef(onEvent)
  useEffect(() => { handler.current = onEvent }, [onEvent])

  useEffect(() => {
    if (container.current === null) return

    const embed = mount(container.current, { url, sessionId, locale, title, expand })
    instance.current = embed

    // One subscription per type, all forwarding to the ref. `on()` returns its
    // own unsubscribe, so teardown does not have to remember what it added.
    const off = EVENT_NAMES.map(type =>
      embed.on(type, event => { handler.current?.(event) }),
    )

    return () => {
      off.forEach(fn => fn())
      embed.unmount()
      instance.current = null
    }
    // `onEvent` is deliberately absent — see the ref above. A change of `url`
    // *should* rebuild: it is a different session.
  }, [url, sessionId, locale, title, expand])

  return <div ref={container} style={{ width: '100%', height: '100%', ...style }} className={className} />
}

/**
 * The catalog, as a value.
 *
 * The core package exports `GingerDocsEventName` as a *type*, which cannot be
 * iterated — so this list exists to subscribe to all of them.
 *
 * **A key set rather than an array, and that is the whole point of the shape.**
 * `readonly GingerDocsEventName[]` only checked that each entry *is* a name; it
 * never checked that every name is an entry, so when E3 added `template_created`
 * to the core union this list did not fail to compile — it silently stopped
 * forwarding one event, in the React wrapper only, and nothing said so. Under
 * `satisfies Record<GingerDocsEventName, true>` a missing name is a compile
 * error and a name that no longer exists is one too, which is what the previous
 * comment here claimed and did not deliver.
 *
 * **…but only against a freshly built core.** The type comes from
 * `@gingerdocs/embed`'s `dist/`, and vitest does not type-check, so when E10-9
 * added `document_deleted` to the core union this list went without it and
 * nothing failed — the same failure as `template_created`, and as silent. The test
 * now reads the core's union from source and fails on any difference, so
 * `npm test` catches what the compiler only catches on a build (E10-27).
 */
const EVENT_NAMES = Object.keys({
  ready: true,
  viewed: true,
  signed: true,
  completed: true,
  declined: true,
  session_expiring: true,
  session_expired: true,
  error: true,
  document_created: true,
  document_sent: true,
  document_deleted: true,
  template_created: true,
  expanded: true,
  collapsed: true,
} satisfies Record<GingerDocsEventName, true>) as GingerDocsEventName[]

// No `export default`. Rollup's MIXED_EXPORTS warning is the whole reason:
// mixing a default with named exports puts the component behind
// `GingerDocsReact.default` on the UMD global, which is not what anyone
// reaching for a `<script>` tag expects and is not what the README documents.
// `packages/embed` dropped its default for the same reason in D3; this one was
// missed there and surfaced in D7's publish dry-run.
//
// `import GingerDocsEmbed from '@gingerdocs/react'` therefore does not work —
// `import { GingerDocsEmbed }` does. That is the trade, and it is the right way
// round: one named export that behaves identically in every module system beats
// a default that behaves differently in one of them.
