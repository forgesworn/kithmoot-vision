/** Real browser review/export, using only original synthetic test pictures. */
import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { chromium, webkit, expect } from '@playwright/test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { request } from 'node:http'
import { pathToFileURL } from 'node:url'
import { createWorkshopServer } from './serve.mjs'
import { createLabelReviewHTML } from './label-review.mjs'
import { createBatchReviewHTML } from './batch-review.mjs'

let server, browser, origin, temporary
before(async () => {
  temporary = await mkdtemp(join(process.env.VISION_LAB_TEMP_ROOT ?? tmpdir(), 'kithmoot-workshop-browser-'))
  server = createWorkshopServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = 'http://127.0.0.1:' + server.address().port
  browser = await chromium.launch()
})
after(async () => {
  await browser?.close()
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
  if (temporary) await rm(temporary, { recursive: true, force: true })
})

test('workshop serves only explicit static files and refuses uploads and foreign hosts', async () => {
  const foreign = await new Promise((resolve, reject) => {
    const req = request(origin, { headers: { Host: 'unrelated.example' } }, res => { res.resume(); resolve(res.statusCode) })
    req.on('error', reject); req.end()
  })
  assert.equal(foreign, 403)
  assert.equal((await fetch(origin, { method: 'POST', body: 'private footage' })).status, 405)
  assert.equal((await fetch(origin + '/sources.json', { method: 'PUT', body: '{}' })).status, 405)
  assert.equal((await fetch(origin + '/%2e%2e/pyproject.toml')).status, 404)
  const response = await fetch(origin)
  assert.equal(response.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.ok(response.headers.get('content-security-policy').includes("script-src 'self'"))
  const candidates = await (await fetch(origin + '/sources.json')).json()
  assert.ok(candidates.sources.every(source => source.approved === false && source.automatic_download === false))
})

test('human source review and high-resolution labels export an importable dataset without network uploads', { timeout: 60_000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
  const page = await context.newPage(), errors = [], outgoing = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (request.method() !== 'GET' || ![origin + '/', 'blob:', 'data:'].some(prefix => request.url().startsWith(prefix))) outgoing.push(request.url()) })
  try {
    await page.goto(origin)
    await expect(page.locator('#candidates')).toContainText('pending human review')
    await expect(page.locator('#capture')).toBeDisabled()
    await expect(page.locator('#export-training')).toBeDisabled()
    for (const [index, split] of ['train', 'validation', 'test'].entries()) {
      const images = await page.evaluate(index => {
        const c = document.createElement('canvas'); c.width = 640; c.height = 384
        const ctx = c.getContext('2d'); ctx.fillStyle = ['#386b80', '#77659b', '#757b36'][index]; ctx.fillRect(0, 0, 640, 384)
        ctx.fillStyle = '#b98260'; ctx.fillRect(260, 50, 120, 120); ctx.fillStyle = '#ddd'; ctx.fillRect(220, 170, 200, 214)
        const rgb = c.toDataURL().split(',')[1]
        ctx.fillStyle = 'black'; ctx.fillRect(0, 0, 640, 384); ctx.fillStyle = 'white'; ctx.fillRect(260, 50, 120, 120); ctx.fillRect(220, 170, 200, 214)
        return { rgb, alpha: c.toDataURL().split(',')[1] }
      }, index)
      await page.locator('#footage').setInputFiles({ name: split + '.png', mimeType: 'image/png', buffer: Buffer.from(images.rgb, 'base64') })
      await expect(page.locator('#file-state')).toContainText('SHA-256')
      const fileHash = (await page.locator('#file-state').textContent()).match(/[a-f0-9]{64}/)[0]
      await page.locator('#source-notes').setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'kithmoot-workshop-source-notes-v1', source: { sha256: 'f'.repeat(64), title: 'Wrong source' } })) })
      await expect(page.locator('#status')).toContainText('do not match')
      await page.locator('#source-notes').setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'kithmoot-workshop-source-notes-v1', source: { sha256: fileHash, title: split + ' original synthetic fixture', licence: 'PROJECT-OWNED' } })) })
      await expect(page.locator('#status')).toContainText('Human rights review is still required')
      await expect(page.locator('#mit-rights')).not.toBeChecked()
      await page.locator('#url').fill('https://example.invalid/original-synthetic-fixture')
      await page.locator('#licence').selectOption('PROJECT-OWNED')
      await page.locator('#reviewer').fill('Automated fixture; no real footage')
      await page.locator('#terms').fill('Original synthetic test drawings. MIT training and weights permitted.')
      await page.locator('#permission-basis').fill('No real people. Tests verify the workflow, not camera accuracy.')
      await page.locator('#subjects').fill(split + '-synthetic-subject')
      await page.locator('#scene').fill(split + '-scene')
      await page.locator('#sequence').fill(split + '-take')
      await page.locator('#split').selectOption(split)
      await page.locator('#approve-source').click()
      await expect(page.locator('#capture')).toBeDisabled()
      for (const id of ['synthetic', 'training-rights', 'commercial-rights', 'mit-rights', 'subject-rights']) await page.locator('#' + id).check()
      await page.locator('#approve-source').click()
      await expect(page.locator('#source-state')).toContainText('Source review saved')
      await page.locator('#tasks').selectOption('both')
      await page.locator('#capture').click()
      assert.equal(await page.locator('#editor').evaluate(canvas => canvas.width), 640)
      await page.locator('#editor').scrollIntoViewIfNeeded()
      const box = await page.locator('#editor').boundingBox()
      await page.mouse.move(box.x + box.width * 260 / 640, box.y + box.height * 50 / 384)
      await page.mouse.down(); await page.mouse.move(box.x + box.width * 380 / 640, box.y + box.height * 170 / 384); await page.mouse.up()
      await page.locator('#alpha-file').setInputFiles({ name: 'mask.png', mimeType: 'image/png', buffer: Buffer.from(images.alpha, 'base64') })
      await expect(page.locator('#status')).toContainText('Mask imported as a draft')
      await page.locator('#save-frame').click()
      await expect(page.locator('#status')).toContainText('Review each selected task')
      await page.locator('#faces-reviewed').check(); await page.locator('#foreground-reviewed').check()
      await page.locator('#save-frame').click()
      await expect(page.locator('#sample-state')).toContainText((index + 1) + ' of 24')
    }
    const download = page.waitForEvent('download')
    await page.locator('#export-training').click()
    const exported = join(temporary, 'reviewed.json'); await (await download).saveAs(exported)
    const bundle = JSON.parse(await readFile(exported, 'utf8'))
    assert.equal(bundle.format, 'kithmoot-model-workshop-v1')
    assert.equal(bundle.public_model_permission, true)
    assert.equal(bundle.sources.length, 3); assert.equal(bundle.samples.length, 3)
    assert.ok(bundle.sources.every(source => source.synthetic && source.licence === 'PROJECT-OWNED' && /^[a-f0-9]{64}$/.test(source.sha256)))
    for (const sample of bundle.samples) {
      assert.equal(sample.faces.length, 1)
      assert.ok(Math.abs(sample.faces[0][0] - 260 / 640) < .01)
      assert.deepEqual(sample.labels, { faces: true, foreground: true })
    }
    if (process.env.VISION_WORKSHOP_EXPORT) await writeFile(process.env.VISION_WORKSHOP_EXPORT, JSON.stringify(bundle), { flag: 'wx' })
    // The review is portable and editable, and duplicate people are caught
    // even when every original file and frame has a different hash.
    bundle.format = 'kithmoot-model-workshop-project-v1'
    bundle.sources[2].subjects = bundle.sources[0].subjects
    await page.locator('#project-file').setInputFiles({ name: 'review.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bundle)) })
    await expect(page.locator('#status')).toContainText('Saved review opened locally')
    await page.locator('#export-training').click()
    await expect(page.locator('#status')).toContainText('must stay within one split')
    await page.getByRole('button', { name: 'Edit frame', exact: true }).first().click()
    await expect(page.locator('#frame-state')).toContainText('Editing reviewed frame 1')
    await expect(page.locator('#faces-reviewed')).not.toBeChecked()
    await page.locator('#clear-project').click()
    await expect(page.locator('#sample-state')).toContainText('0 of 24')
    assert.deepEqual(errors, []); assert.deepEqual(outgoing, [])
  } finally { await context.close() }
})

test('review screen fits phone and desktop layouts in light and dark', async () => {
  for (const colorScheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme })
    try {
      const page = await context.newPage(); await page.goto(origin)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Model Workshop')
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      if (process.env.VISION_WORKSHOP_ARTIFACTS) {
        await mkdir(process.env.VISION_WORKSHOP_ARTIFACTS, { recursive: true })
        await page.screenshot({ path: join(process.env.VISION_WORKSHOP_ARTIFACTS, 'workshop-' + colorScheme + '.png'), fullPage: true })
      }
    } finally { await context.close() }
  }
})

test('local video can be sought and captured without camera or microphone access', { timeout: 30_000 }, async () => {
  const context = await browser.newContext()
  try {
    const page = await context.newPage(); await page.goto(origin)
    const bytes = await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 192
      const ctx = canvas.getContext('2d'), stream = canvas.captureStream(15), chunks = []
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' })
      const done = new Promise(resolve => recorder.onstop = resolve)
      recorder.ondataavailable = event => chunks.push(event.data)
      ctx.fillStyle = '#246080'; ctx.fillRect(0, 0, 320, 192); recorder.start()
      await new Promise(resolve => setTimeout(resolve, 500))
      ctx.fillStyle = '#907030'; ctx.fillRect(0, 0, 320, 192)
      await new Promise(resolve => setTimeout(resolve, 500))
      recorder.stop(); await done; stream.getTracks().forEach(track => track.stop())
      return [...new Uint8Array(await new Blob(chunks).arrayBuffer())]
    })
    await page.locator('#footage').setInputFiles({ name: 'original-fixture.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes) })
    await expect(page.locator('#file-state')).toContainText('SHA-256')
    await expect(page.locator('#video')).toBeVisible()
    await page.locator('#url').fill('https://example.invalid/original-video-fixture')
    await page.locator('#licence').selectOption('PROJECT-OWNED')
    await page.locator('#reviewer').fill('Automated synthetic video fixture')
    await page.locator('#terms').fill('Original generated test frames; MIT use permitted.')
    await page.locator('#permission-basis').fill('No real subjects or external material.')
    for (const id of ['subjects', 'scene', 'sequence']) await page.locator('#' + id).fill('original-video-' + id)
    for (const id of ['synthetic', 'training-rights', 'commercial-rights', 'mit-rights', 'subject-rights']) await page.locator('#' + id).check()
    await page.locator('#approve-source').click()
    const actualTime = await page.locator('#video').evaluate(video => new Promise(resolve => { video.addEventListener('seeked', () => resolve(video.currentTime), { once: true }); video.currentTime = .65 }))
    // Browser-recorded clips may end at their last encoded frame; seeking
    // beyond it clamps to that frame rather than the recorder stop time.
    assert.ok(actualTime >= .4)
    await page.locator('#capture').click()
    await expect(page.locator('#frame-state')).toContainText(actualTime.toFixed(2) + ' s')
    assert.equal(await page.locator('#editor').evaluate(canvas => canvas.width), 320)
    const pixel = await page.locator('#editor').evaluate(canvas => [...canvas.getContext('2d').getImageData(10, 10, 1, 1).data])
    ;[144, 112, 48].forEach((value, index) => assert.ok(Math.abs(pixel[index] - value) < 8))
    await page.locator('#faces-reviewed').check(); await page.locator('#save-frame').click()
    await expect(page.locator('#sample-state')).toContainText('1 of 24')
  } finally { await context.close() }
})

async function labelFixture(page) {
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 48
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#386b80'; ctx.fillRect(0, 0, 64, 48)
    ctx.fillStyle = '#b98260'; ctx.fillRect(24, 8, 16, 16)
    return canvas.toDataURL().split(',')[1]
  })
  return {
    preview: Buffer.from(data, 'base64'),
    draft: { format: 'kithmoot-pending-label-draft-v1', source_sha256: '1'.repeat(64),
      frame: { sha256: '2'.repeat(64), width: 64, height: 48 },
      foreground: { sha256: '3'.repeat(64) }, requested_time_seconds: 2,
      face_boxes_xywh_pixels: [[24, 8, 16, 16]], source_rights_status: 'pending' },
  }
}

test('standalone label decisions persist, export without training grants and reset for revised labels', { timeout: 30_000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  try {
    const page = await context.newPage(), outgoing = [], errors = []
    page.on('request', request => { if (/^https?:/.test(request.url())) outgoing.push(request.url()) })
    page.on('pageerror', error => errors.push(error.message))
    const { draft, preview } = await labelFixture(page)
    assert.throws(() => createLabelReviewHTML({ ...draft, source_sha256: 'unknown' }, preview), /SHA-256/)
    assert.throws(() => createLabelReviewHTML({ ...draft, face_boxes_xywh_pixels: [[60, 8, 16, 16]] }, preview), /face boxes/)
    assert.throws(() => createLabelReviewHTML(draft, Buffer.from('not an image')), /PNG/)
    const reviewer = '</script><script>window.unexpectedExecution=true</script>'
    const htmlPath = join(temporary, 'label-review.html')
    await writeFile(htmlPath, createLabelReviewHTML(draft, preview, { reviewer }))
    await page.goto(pathToFileURL(htmlPath).href)
    await expect(page.locator('img')).toBeVisible()
    assert.equal(await page.locator('img').evaluate(image => image.naturalWidth), 64)
    await expect(page.locator('#reviewer')).toHaveValue(reviewer)
    assert.equal(await page.evaluate(() => window.unexpectedExecution), undefined)
    await expect(page.locator('#save-review')).toBeDisabled()
    await page.getByRole('button', { name: 'Looks good', exact: true }).click()
    await page.locator('#notes').fill('Face, hair and sleeves look right.\nKeep this note verbatim.')
    await expect(page.locator('#review-status')).toContainText('saved in this browser')
    await page.reload()
    await expect(page.locator('#looks-good')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#notes')).toHaveValue('Face, hair and sleeves look right.\nKeep this note verbatim.')
    const downloaded = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Save review', exact: true }).click()
    const destination = join(temporary, 'label-feedback.json'); await (await downloaded).saveAs(destination)
    const review = JSON.parse(await readFile(destination, 'utf8'))
    assert.equal(review.format, 'kithmoot-label-review-v1'); assert.equal(review.scope, 'labels-only')
    assert.equal(review.verdict, 'looks-good'); assert.equal(review.labels_approved, true)
    assert.equal(review.training_rights_approved, false); assert.equal(review.eligible_for_training, false)
    assert.equal(review.source_sha256, draft.source_sha256)
    assert.equal(review.foreground_sha256, draft.foreground.sha256)
    assert.deepEqual(review.face_boxes_xywh_pixels, draft.face_boxes_xywh_pixels)
    assert.match(review.preview_sha256, /^[a-f0-9]{64}$/)
    assert.equal(review.notes, 'Face, hair and sleeves look right.\nKeep this note verbatim.')
    await page.getByRole('button', { name: 'Needs changes', exact: true }).click()
    await page.reload()
    await expect(page.locator('#needs-changes')).toHaveAttribute('aria-pressed', 'true')
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('kithmoot-label-review-v1:' + JSON.parse(document.getElementById('review-config').textContent).review_id)))
    assert.equal(stored.labels_approved, false); assert.equal(stored.eligible_for_training, false)
    const revised = { ...draft, face_boxes_xywh_pixels: [[23, 8, 17, 16]] }
    await writeFile(htmlPath, createLabelReviewHTML(revised, preview))
    await page.reload()
    await expect(page.locator('#looks-good')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('#needs-changes')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('#save-review')).toBeDisabled()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    assert.deepEqual(errors, []); assert.deepEqual(outgoing, [])
  } finally { await context.close() }
})

test('label review offers an honest export fallback when local browser storage is unavailable', { timeout: 30_000 }, async () => {
  const context = await browser.newContext()
  try {
    const page = await context.newPage(), { draft, preview } = await labelFixture(page)
    await page.addInitScript(() => Object.defineProperty(window, 'localStorage', {
      get() { throw new DOMException('Storage disabled', 'SecurityError') },
    }))
    const htmlPath = join(temporary, 'label-review-without-storage.html')
    await writeFile(htmlPath, createLabelReviewHTML(draft, preview))
    await page.goto(pathToFileURL(htmlPath).href)
    await page.getByRole('button', { name: 'Looks good', exact: true }).click()
    await expect(page.locator('#review-status')).toContainText('for this session')
    await expect(page.locator('#review-status')).toContainText('storage is unavailable')
    const downloaded = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Save review', exact: true }).click()
    const destination = join(temporary, 'label-feedback-without-storage.json'); await (await downloaded).saveAs(destination)
    const review = JSON.parse(await readFile(destination, 'utf8'))
    assert.equal(review.labels_approved, true)
    assert.equal(review.training_rights_approved, false); assert.equal(review.eligible_for_training, false)
  } finally { await context.close() }
})

test('batch review keeps decisions separate, exports unfinished work and invalidates revised labels', { timeout: 30_000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' })
  try {
    const page = await context.newPage(), outgoing = [], errors = []
    page.on('request', request => { if (/^https?:/.test(request.url())) outgoing.push(request.url()) })
    page.on('pageerror', error => errors.push(error.message))
    const { draft, preview } = await labelFixture(page)
    const items = [
      { title: '</script><script>window.unexpectedExecution=true</script>', instructions: 'Check both face boxes and the held object.',
        context: 'Original synthetic fixture; no real people.', preview,
        draft: { ...draft, face_boxes_xywh_pixels: [[8, 8, 16, 16], [40, 8, 16, 16]] } },
      { title: 'Empty room', instructions: 'No boxes and no foreground.', context: 'Background negative fixture.', preview,
        draft: { ...draft, frame: { ...draft.frame, sha256: '4'.repeat(64) }, face_boxes_xywh_pixels: [] } },
      { title: 'Third example', instructions: 'Check hair edges.', context: 'Same group; one split only.', preview,
        draft: { ...draft, requested_time_seconds: 3 } },
    ]
    const htmlPath = join(temporary, 'batch-review.html')
    assert.throws(() => createBatchReviewHTML([]), /1 to 24/)
    assert.throws(() => createBatchReviewHTML([items[0], items[0]]), /Duplicate/)
    await writeFile(htmlPath, createBatchReviewHTML(items))
    await page.goto(pathToFileURL(htmlPath).href)
    await expect(page.locator('#progress')).toContainText('0 of 3 reviewed')
    await expect(page.locator('#example-title')).toContainText(items[0].title)
    assert.equal(await page.evaluate(() => window.unexpectedExecution), undefined)
    await expect(page.locator('#preview')).toBeVisible()
    await expect(page.locator('#save-all')).toBeDisabled()
    await page.locator('#reviewer').fill('Fixture reviewer')
    await page.locator('#looks-good').click()
    await page.locator('#notes').fill('Both faces and the object look right.\nKeep this note.')
    await page.locator('#next').click()
    await expect(page.locator('#example-title')).toContainText('Empty room')
    await expect(page.locator('#looks-good')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('#notes')).toHaveValue('')
    await page.locator('#needs-changes').click()
    await page.locator('#notes').fill('Remove the remaining room pixels.')
    await expect(page.locator('#progress')).toContainText('2 of 3 reviewed · Looks good: 1 · Needs changes: 1')
    await page.reload()
    await expect(page.locator('#notes')).toHaveValue('Both faces and the object look right.\nKeep this note.')
    const download = page.waitForEvent('download')
    await page.locator('#save-all').click()
    const destination = join(temporary, 'batch-feedback.json'); await (await download).saveAs(destination)
    const feedback = JSON.parse(await readFile(destination, 'utf8'))
    assert.equal(feedback.format, 'kithmoot-label-review-batch-v1')
    assert.equal(feedback.reviews.length, 2); assert.equal(feedback.pending_review_ids.length, 1)
    assert.equal(feedback.reviews[0].face_boxes_xywh_pixels.length, 2)
    assert.deepEqual(feedback.reviews[1].face_boxes_xywh_pixels, [])
    assert.equal(feedback.reviews[1].verdict, 'needs-changes'); assert.equal(feedback.reviews[1].labels_approved, false)
    assert.equal(feedback.training_rights_approved, false); assert.equal(feedback.eligible_for_training, false)
    assert.ok(feedback.reviews.every(record => record.training_rights_approved === false && record.eligible_for_training === false))
    await page.locator('#next-pending').click()
    await expect(page.locator('#example')).toHaveValue('2')
    // Stored identities and flags are rebuilt, never promoted into training grants.
    await page.evaluate(() => {
      const batch = JSON.parse(document.getElementById('batch-config').textContent)
      const key = 'kithmoot-label-review-v1:' + batch.items[1].config.review_id
      const review = JSON.parse(localStorage.getItem(key))
      Object.assign(review, { training_rights_approved: true, eligible_for_training: true, source_sha256: 'f'.repeat(64) })
      localStorage.setItem(key, JSON.stringify(review))
    })
    const revised = [...items]; revised[0] = { ...items[0], draft: { ...items[0].draft, face_boxes_xywh_pixels: [[9, 8, 15, 16], [40, 8, 16, 16]] } }
    await writeFile(htmlPath, createBatchReviewHTML(revised)); await page.reload()
    await expect(page.locator('#progress')).toContainText('1 of 3 reviewed')
    await expect(page.locator('#looks-good')).toHaveAttribute('aria-pressed', 'false')
    await page.locator('#next').click()
    await expect(page.locator('#needs-changes')).toHaveAttribute('aria-pressed', 'true')
    const correctedDownload = page.waitForEvent('download'); await page.locator('#save-all').click()
    const correctedPath = join(temporary, 'batch-feedback-revised.json'); await (await correctedDownload).saveAs(correctedPath)
    const corrected = JSON.parse(await readFile(correctedPath, 'utf8'))
    assert.equal(corrected.reviews[0].source_sha256, draft.source_sha256)
    assert.equal(corrected.reviews[0].training_rights_approved, false); assert.equal(corrected.reviews[0].eligible_for_training, false)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    assert.deepEqual(errors, []); assert.deepEqual(outgoing, [])
  } finally { await context.close() }
})

test('batch feedback downloads when browser storage is unavailable', { timeout: 30_000 }, async () => {
  const context = await browser.newContext()
  try {
    const page = await context.newPage(), { draft, preview } = await labelFixture(page)
    await page.addInitScript(() => Object.defineProperty(window, 'localStorage', {
      get() { throw new DOMException('Storage disabled', 'SecurityError') },
    }))
    const htmlPath = join(temporary, 'batch-without-storage.html')
    await writeFile(htmlPath, createBatchReviewHTML([{ title: 'Foreground fixture', instructions: 'Check the mask.', context: 'Original test drawing.', draft, preview }]))
    await page.goto(pathToFileURL(htmlPath).href)
    await page.locator('#looks-good').click()
    await expect(page.locator('#review-status')).toContainText('storage is unavailable')
    const download = page.waitForEvent('download'); await page.locator('#save-all').click()
    const destination = join(temporary, 'batch-without-storage.json'); await (await download).saveAs(destination)
    const feedback = JSON.parse(await readFile(destination, 'utf8'))
    assert.equal(feedback.reviews[0].labels_approved, true); assert.equal(feedback.eligible_for_training, false)
    await expect(page.locator('#next-pending')).toBeDisabled()
  } finally { await context.close() }
})

test('WebKit can review and download standalone local pages', {
  timeout: 60_000, skip: process.env.VISION_WORKSHOP_WEBKIT !== '1',
}, async t => {
  const safariEngine = await webkit.launch()
  t.after(() => safariEngine.close())
  const context = await safariEngine.newContext(), page = await context.newPage()
  const { draft, preview } = await labelFixture(page)
  const htmlPath = join(temporary, 'label-review-webkit.html')
  const html = createLabelReviewHTML(draft, preview, { reviewer: 'Synthetic fixture reviewer' })
  assert.ok(html.includes('Copyright (c) 2026 TheCryptoDonkey'))
  await writeFile(htmlPath, html)
  await page.goto(pathToFileURL(htmlPath).href)
  await page.getByRole('button', { name: 'Looks good', exact: true }).click()
  await expect(page.locator('#looks-good')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('#save-review')).toBeEnabled()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save review', exact: true }).click()
  const destination = join(temporary, 'label-feedback-webkit.json'); await (await downloaded).saveAs(destination)
  const review = JSON.parse(await readFile(destination, 'utf8'))
  assert.equal(review.verdict, 'looks-good'); assert.equal(review.labels_approved, true)
  assert.equal(review.training_rights_approved, false); assert.equal(review.eligible_for_training, false)
  const persisted = (await page.locator('#review-status').textContent()).includes('saved in this browser')
  await page.reload()
  await expect(page.locator('#looks-good')).toHaveAttribute('aria-pressed', String(persisted))
  const batchPath = join(temporary, 'batch-webkit.html')
  await writeFile(batchPath, createBatchReviewHTML([{ title: 'WebKit fixture', instructions: 'Check the face box.', context: 'Original test drawing.', draft, preview }]))
  await page.goto(pathToFileURL(batchPath).href)
  await page.locator('#looks-good').click()
  const batchDownload = page.waitForEvent('download'); await page.locator('#save-all').click()
  const batchDestination = join(temporary, 'batch-feedback-webkit.json'); await (await batchDownload).saveAs(batchDestination)
  const batchFeedback = JSON.parse(await readFile(batchDestination, 'utf8'))
  assert.equal(batchFeedback.reviews[0].labels_approved, true); assert.equal(batchFeedback.eligible_for_training, false)
})
