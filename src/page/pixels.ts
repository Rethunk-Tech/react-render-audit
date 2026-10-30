/** Runs in the page: draws two screenshots, marks the pixels whose channels moved more than `tolerance` in red over a
 * faded copy of the second, and returns the changed share and the picture as base64. */
export const comparePixels = async ({
  a,
  b,
  tolerance,
}: {
  a: string
  b: string
  tolerance: number
}) => {
  const load = async (src: string) => {
    const img = new Image()
    img.src = src
    await img.decode()
    return img
  }
  const [x, y] = await Promise.all([load(a), load(b)])
  const w = Math.max(x.width, y.width)
  const h = Math.max(x.height, y.height)
  const pixels = (img: HTMLImageElement) => {
    const c = new OffscreenCanvas(w, h)
    const ctx = c.getContext('2d') as OffscreenCanvasRenderingContext2D
    ctx.drawImage(img, 0, 0)
    return ctx.getImageData(0, 0, w, h)
  }
  const pa = pixels(x).data
  const shown = pixels(y)
  const pb = shown.data
  let changed = 0
  for (let i = 0; i < pa.length; i += 4) {
    const moved =
      Math.abs((pa[i] ?? 0) - (pb[i] ?? 0)) > tolerance ||
      Math.abs((pa[i + 1] ?? 0) - (pb[i + 1] ?? 0)) > tolerance ||
      Math.abs((pa[i + 2] ?? 0) - (pb[i + 2] ?? 0)) > tolerance
    if (moved) {
      changed += 1
      pb.set([255, 0, 0, 255], i)
    } else {
      pb[i + 3] = 70
    }
  }
  const c = new OffscreenCanvas(w, h)
  const ctx = c.getContext('2d') as OffscreenCanvasRenderingContext2D
  ctx.putImageData(shown, 0, 0)
  const blob = await c.convertToBlob({ type: 'image/png' })
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return { changed: changed / (w * h), png: btoa(binary) }
}
