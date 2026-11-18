import { afterAll, afterEach, expect, test } from 'bun:test'
import { comparePixels } from './pixels.ts'

type Img = { width: number; height: number; data: ArrayLike<number | undefined> }

const images = new Map<string, Img>()

class FakeImage {
  src = ''
  width = 0
  height = 0
  data: ArrayLike<number | undefined> = []
  async decode() {
    const img = images.get(this.src)
    if (!img) {
      throw new Error(`missing ${this.src}`)
    }
    this.width = img.width
    this.height = img.height
    this.data = img.data
  }
}

class FakeCanvas {
  #w: number
  #h: number
  #drawn: ArrayLike<number | undefined> = []
  #put: { data: Uint8ClampedArray } | null = null
  constructor(w: number, h: number) {
    this.#w = w
    this.#h = h
  }
  getContext() {
    return {
      drawImage: (img: FakeImage) => {
        this.#drawn = img.data
      },
      getImageData: () => ({
        data: this.#drawn,
        width: this.#w,
        height: this.#h,
      }),
      putImageData: (shown: { data: Uint8ClampedArray }) => {
        this.#put = shown
      },
    }
  }
  async convertToBlob() {
    const put = this.#put
    if (!put) {
      return new Blob()
    }
    return new Blob([Uint8Array.from(put.data)])
  }
}

const prevImage = globalThis.Image
const prevCanvas = globalThis.OffscreenCanvas

globalThis.Image = FakeImage as unknown as typeof Image
globalThis.OffscreenCanvas = FakeCanvas as unknown as typeof OffscreenCanvas

afterEach(() => {
  images.clear()
})

afterAll(() => {
  globalThis.Image = prevImage
  globalThis.OffscreenCanvas = prevCanvas
})

test('marks moved rgb in red and fades pixels within tolerance', async () => {
  images.set('a', {
    width: 2,
    height: 1,
    data: Uint8ClampedArray.from([10, 20, 30, 255, 1, 2, 3, 255]),
  })
  images.set('b', {
    width: 1,
    height: 1,
    data: Uint8ClampedArray.from([10, 20, 40, 255]),
  })

  const { changed, png } = await comparePixels({ a: 'a', b: 'b', tolerance: 5 })
  const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0))

  expect(changed).toBe(0.5)
  expect([...bytes]).toEqual([255, 0, 0, 255])
})

test('treats missing channels as 0 and leaves matching pixels faded', async () => {
  images.set('a', { width: 1, height: 1, data: { length: 4 } })
  images.set('b', {
    width: 1,
    height: 1,
    data: Uint8ClampedArray.from([0, 0, 0, 255]),
  })

  const { changed, png } = await comparePixels({ a: 'a', b: 'b', tolerance: 0 })
  const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0))

  expect(changed).toBe(0)
  expect([...bytes]).toEqual([0, 0, 0, 70])
})
