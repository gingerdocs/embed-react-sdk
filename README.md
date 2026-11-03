# @gingerdocs/react

[![npm](https://img.shields.io/npm/v/%40gingerdocs%2Freact?label=npm)](https://www.npmjs.com/package/@gingerdocs/react) [![CI](https://github.com/gingerdocs/embed-react-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/gingerdocs/embed-react-sdk/actions/workflows/ci.yml) [![licence](https://img.shields.io/npm/l/%40gingerdocs%2Freact)](https://github.com/gingerdocs/embed-react-sdk/blob/main/LICENSE)

React wrapper for [`@gingerdocs/embed`](https://github.com/gingerdocs/embed-sdk).

```bash
npm install @gingerdocs/react @gingerdocs/embed
```

**Read [`@gingerdocs/embed`'s README](https://github.com/gingerdocs/embed-sdk#readme) first** — the session
model, the security requirements, and the loud warning that **webhooks are the
source of truth** all live there and all apply here. This package is a component
around that one; it adds no behaviour of its own, on purpose.

```jsx
import { GingerDocsEmbed } from '@gingerdocs/react'

function Signing({ session }) {
  return (
    <GingerDocsEmbed
      url={session.url}
      sessionId={session.id}
      onEvent={event => {
        if (event.type === 'completed') showConfirmation()
        if (event.type === 'session_expired') refetchSession()
      }}
      style={{ height: '80vh' }}
    />
  )
}
```

## Props

| Prop | Type | Notes |
| --- | --- | --- |
| `url` | `string` | **Required.** From the mint response, verbatim. Changing it remounts — it is a different session. |
| `sessionId` | `string` | The `id` from the same response. Recommended. |
| `locale` | `string` | The frame's language, overriding the session's `locale` — see [`@gingerdocs/embed`](https://github.com/gingerdocs/embed-sdk#readme) for what outranks it. Changing it remounts the frame, which starts over. |
| `title` | `string` | `title` on the iframe. |
| `expand` | `'modal' \| 'none'` | Passed straight through. Default `'modal'`: the frame's Expand control pins the iframe over your page and locks its scroll, restoring both on Collapse — **including when React unmounts the component mid-modal**. `'none'` opts out and the frame hides the control. See [`@gingerdocs/embed`](https://github.com/gingerdocs/embed-sdk#expand). |
| `onEvent` | `(event) => void` | One handler for every event in the catalog. Safe to pass inline — see below. |
| `style` | `CSSProperties` | Styles for the wrapper element; the iframe fills it. |
| `className` | `string` | |

**`onEvent` is safe to pass inline.** It is held behind a ref rather than being
an effect dependency, so a new function identity on every render does not tear
the iframe down and rebuild it. That distinction is not cosmetic: a rebuild
loses a signature in progress and re-exchanges the session, retiring the frame's
current bearer.

One handler rather than nine `onCompleted`-style props for the same reason — nine
props would each need memoising by you, and forgetting one would produce exactly
that bug. `event.type` is a union, so the compiler narrows it.
