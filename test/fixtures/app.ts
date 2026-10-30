import { createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'

function Label({ count }: { count: number }) {
  return createElement('span', { className: 'label' }, `count ${count}`)
}

function Counter() {
  const [count, setCount] = useState(0)
  return createElement(
    'div',
    null,
    createElement(
      'button',
      { className: 'inc', type: 'button', onClick: () => setCount((n) => n + 1) },
      'inc',
    ),
    createElement(Label, { count }),
  )
}

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(createElement(Counter))
}
