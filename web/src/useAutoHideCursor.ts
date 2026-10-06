import { useLayoutEffect } from 'react'
import './autoHideCursor.css'

export const CURSOR_IDLE_MS = 2500

export default function useAutoHideCursor(active: boolean) {
  useLayoutEffect(() => {
    const classes = document.body.classList
    let timer: ReturnType<typeof setTimeout> | undefined
    const show = () => {
      clearTimeout(timer)
      classes.remove('game-cursor-hidden')
      if (active) timer = setTimeout(() => classes.add('game-cursor-hidden'), CURSOR_IDLE_MS)
    }
    show()
    if (active) window.addEventListener('mousemove', show, { passive: true })
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousemove', show)
      classes.remove('game-cursor-hidden')
    }
  }, [active])
}
