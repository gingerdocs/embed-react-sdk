import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { GingerDocsEmbed } from './index'

/**
 * The core's type declarations, from wherever `@gingerdocs/embed` is installed
 * — see "the full catalog" below.
 *
 * Resolved through `require` rather than imported: the package's `exports`
 * map exposes only its entry, so `@gingerdocs/embed/dist/index.d.ts` is not an
 * importable path, and the declarations are a type-level file anyway. The
 * entry resolves to `dist/`, and `index.d.ts` sits beside it.
 */
const coreDeclarations = readFileSync(
  join(dirname(createRequire(import.meta.url).resolve('@gingerdocs/embed')), 'index.d.ts'),
  'utf8',
)

/**
 * `@gingerdocs/react`.
 *
 * The wrapper owns three things and is tested on exactly those: it mounts the
 * core SDK into its own element, it tears down on unmount, and — the one that
 * matters — **it does not rebuild the iframe when the host passes a new inline
 * handler**, which is what every host does on every render.
 *
 * Everything else (origin filtering, session pinning, iframe attributes) lives
 * in `@gingerdocs/embed` and is tested there. A second copy of those assertions
 * here would be a second place to keep them true.
 */

const EMBED_ORIGIN = 'https://app.gingerdocs.test'
const URL_ONE = `${EMBED_ORIGIN}/embed#token=gdet_one`
const URL_TWO = `${EMBED_ORIGIN}/embed#token=gdet_two`

function post(body: unknown, origin = EMBED_ORIGIN): void {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: body, origin }))
  })
}

function message(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { source: 'gingerdocs-embed', type: 'ready', sessionId: 'sess-1', payload: {}, ...overrides }
}

afterEach(() => { cleanup() })

describe('<GingerDocsEmbed>', () => {
  it('mounts an iframe and forwards every event to one handler', () => {
    const seen: string[] = []
    const { container } = render(<GingerDocsEmbed url={URL_ONE} onEvent={e => seen.push(e.type)} />)

    const frame = container.querySelector('iframe')
    expect(frame).not.toBeNull()
    expect(frame!.getAttribute('referrerpolicy')).toBe('strict-origin')

    post(message({ type: 'ready' }))
    post(message({ type: 'viewed' }))
    post(message({ type: 'completed' }))

    expect(seen).toEqual(['ready', 'viewed', 'completed'])
  })

  /**
   * The trap this component exists to avoid.
   *
   * A host writing `onEvent={e => setState(e)}` — which is the obvious thing —
   * hands a new function identity on every render. With `onEvent` in the
   * effect's deps that unmounts and rebuilds the iframe each time: a signature
   * in progress is lost, and the session's single-use fragment token is spent
   * again on every render.
   */
  it('does not rebuild the iframe when the handler identity changes', () => {
    const { container, rerender } = render(<GingerDocsEmbed url={URL_ONE} onEvent={() => {}} />)
    const first = container.querySelector('iframe')

    for (let i = 0; i < 5; i++) {
      rerender(<GingerDocsEmbed url={URL_ONE} onEvent={() => {}} />)
    }

    expect(container.querySelectorAll('iframe')).toHaveLength(1)
    expect(container.querySelector('iframe')).toBe(first)
  })

  /** …and the latest handler is the one that runs, not the one from mount. */
  it('calls the newest handler after a re-render', () => {
    const early: string[] = []
    const late: string[] = []

    const { rerender } = render(<GingerDocsEmbed url={URL_ONE} onEvent={e => early.push(e.type)} />)
    rerender(<GingerDocsEmbed url={URL_ONE} onEvent={e => late.push(e.type)} />)

    post(message())

    expect(early).toEqual([])
    expect(late).toEqual(['ready'])
  })

  /** A new `url` *is* a new session, so that one does rebuild. */
  it('rebuilds when the url changes', () => {
    const { container, rerender } = render(<GingerDocsEmbed url={URL_ONE} />)
    expect(container.querySelector('iframe')!.src).toBe(URL_ONE)

    rerender(<GingerDocsEmbed url={URL_TWO} />)

    expect(container.querySelectorAll('iframe')).toHaveLength(1)
    expect(container.querySelector('iframe')!.src).toBe(URL_TWO)
  })

  it('removes the frame and stops listening on unmount', () => {
    const seen: string[] = []
    const { container, unmount } = render(<GingerDocsEmbed url={URL_ONE} onEvent={e => seen.push(e.type)} />)

    unmount()

    expect(container.querySelector('iframe')).toBeNull()

    post(message())
    expect(seen).toEqual([])
  })
})

/**
 * E6's two additions, and they are the same kind of thing: a name and an option
 * that have to survive the trip through this wrapper.
 *
 * The catalog is here because it did *not* survive, twice. E3 added
 * `template_created` to the core union and this wrapper's subscription list was
 * not updated; E10-9 did the same with `document_deleted`. Each time the one
 * wrapper that promises to forward every event quietly forwarded all but one,
 * and each time this test passed — its expected list was a copy kept by hand,
 * which is the same list that had drifted.
 *
 * So the expected list is the core's own union (E10-27), read from the type
 * declarations of whichever `@gingerdocs/embed` is installed. A file read
 * rather than an import because the union is a type — the core carries no
 * runtime copy, to stay inside its size budget. It used to read the core's
 * *source* from the sibling folder; since the two packages live in separate
 * repos (2026-11-02) the declarations are the one artifact both layouts have.
 * The price is that a stale local build hides a new event until the core is
 * rebuilt — in `docsloop` that is `npm run build` in `packages/embed`, in the
 * React repo it is installing the newer published core.
 */
describe('the full catalog', () => {
  const NAMES = unionMembers(coreDeclarations, 'GingerDocsEventName')

  it('reads the core union — a parser that matched nothing would pass anything', () => {
    expect(NAMES.length).toBeGreaterThan(10)
    expect(NAMES).toContain('document_deleted')
    expect(NAMES).toContain('template_created')
  })

  it('forwards every event in the core catalog, in order', () => {
    const seen: string[] = []
    render(<GingerDocsEmbed url={URL_ONE} onEvent={e => seen.push(e.type)} />)

    for (const type of NAMES) post(message({ type }))

    expect(seen).toEqual(NAMES)
  })
})

/**
 * The members of `export type X = 'a' | 'b' | …;`, in declaration order.
 *
 * `tsc` emits the union on one line and drops the source's comments, so the
 * declaration runs from `=` to the terminating `;` and every quoted name in
 * between is a member. (The source-reading cousin in
 * `frontend/src/embed/eventCatalog.test.ts` matches one member per line
 * instead; both answer the same list.)
 */
function unionMembers(declarations: string, name: string): string[] {
  const start = declarations.indexOf(`export type ${name} =`)
  if (start === -1) throw new Error(`${name} is not exported where the test expects it`)

  const body = declarations.slice(start, declarations.indexOf(';', start))

  return [...body.matchAll(/'([a-z_]+)'/g)].map(m => m[1])
}

describe('expand', () => {
  it('passes the host opt-out through to the core SDK', () => {
    const { container } = render(
      <GingerDocsEmbed url={URL_ONE} expand="none" onEvent={() => {}} />,
    )
    const frame = container.querySelector('iframe')!
    const before = frame.getAttribute('style')

    post(message({ type: 'expanded' }))

    // Opted out: the frame is left exactly where the host put it. Without the
    // prop reaching `mount()` the default would have pinned it.
    expect(frame.getAttribute('style')).toBe(before)
    expect(document.body.style.overflow).toBe('')
  })

  it('expands by default, and puts the page back when React unmounts it', () => {
    const { container, unmount } = render(<GingerDocsEmbed url={URL_ONE} onEvent={() => {}} />)
    const frame = container.querySelector('iframe')!

    post(message({ type: 'expanded' }))

    expect(frame.style.position).toBe('fixed')
    expect(document.body.style.overflow).toBe('hidden')

    // A host that routes away mid-modal must not be left with a page that
    // cannot scroll — React's teardown reaches the SDK's `unmount()`.
    unmount()
    expect(document.body.style.overflow).toBe('')
  })
})
