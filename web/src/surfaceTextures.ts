import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

// Deterministic tiny local textures, generated once; no downloads or per-frame work.
export function surfaceTexture(kind: 'pitch'|'wood'|'grass') {
  const canvas = document.createElement('canvas'); canvas.width=256; canvas.height=256
  const c = canvas.getContext('2d')!
  c.fillStyle = kind === 'grass' ? '#e1e7cf' : kind === 'pitch' ? '#baa77f' : '#e4c994'; c.fillRect(0,0,256,256)
  let seed=47
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}
  for(let i=0;i<2400;i++) {
    c.fillStyle = random()>.5 ? 'rgba(65,47,24,.09)' : 'rgba(255,244,193,.13)'
    c.fillRect(random()*256,random()*256,kind==='wood' ? .7 : 1+random()*3,kind==='wood' ? 12+random()*90 : 1+random()*4)
  }
  const texture=new CanvasTexture(canvas); texture.colorSpace=SRGBColorSpace
  texture.wrapS=texture.wrapT=RepeatWrapping
  if(kind==='pitch') texture.repeat.set(2,10)
  if(kind==='grass') texture.repeat.set(24,24)
  return texture
}
