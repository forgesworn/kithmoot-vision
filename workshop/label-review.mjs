/** MIT: portable, local-only visual feedback for pending label drafts. */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const jsonForHTML = value => JSON.stringify(value).replaceAll('<', '\\u003c')
const toolLicense = readFileSync(new URL('../LICENSE', import.meta.url), 'utf8').replaceAll('--', '—')

// Kept self-contained so generated pages work offline, including file:// URLs.
function mountReview() {
  const config = JSON.parse(document.getElementById('review-config').textContent)
  const $ = id => document.getElementById(id)
  const key = 'kithmoot-label-review-v1:' + config.review_id
  let verdict, record, stored = false

  function snapshot() {
    return {
      format: 'kithmoot-label-review-v1', scope: 'labels-only',
      ...config, reviewer: $('reviewer').value.trim(), notes: $('notes').value,
      verdict, reviewed_at: new Date().toISOString(),
      labels_approved: verdict === 'looks-good',
      training_rights_approved: false, eligible_for_training: false,
    }
  }
  function show() {
    $('looks-good').setAttribute('aria-pressed', String(verdict === 'looks-good'))
    $('needs-changes').setAttribute('aria-pressed', String(verdict === 'needs-changes'))
    $('save-review').disabled = !record
    $('review-status').textContent = !record ? 'Choose a verdict below.'
      : (verdict === 'looks-good' ? 'Looks good' : 'Needs changes') + (stored
        ? ' — saved in this browser. Use Save review to keep a portable copy.'
        : ' — marked for this session. Use Save review to keep your feedback; browser storage is unavailable.')
  }
  function save() {
    record = snapshot()
    try { localStorage.setItem(key, JSON.stringify(record)); stored = true }
    catch { stored = false }
    show()
  }
  for (const value of ['looks-good', 'needs-changes']) {
    $(value).addEventListener('click', () => { verdict = value; save() })
  }
  for (const id of ['reviewer', 'notes']) $(id).addEventListener('input', () => { if (verdict) save() })
  $('save-review').addEventListener('click', () => {
    if (!record) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2) + '\n'], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url; link.download = 'kithmoot-label-review-' + config.review_id.slice(0, 16) + '.json'
    document.body.append(link); link.click(); link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  })
  try {
    const previous = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (previous?.format === 'kithmoot-label-review-v1' && previous.scope === 'labels-only'
      && previous.review_id === config.review_id
      && ['looks-good', 'needs-changes'].includes(previous.verdict)
      && typeof previous.reviewer === 'string' && previous.reviewer.length <= 160
      && typeof previous.notes === 'string' && previous.notes.length <= 8000) {
      verdict = previous.verdict
      $('reviewer').value = previous.reviewer; $('notes').value = previous.notes
      // Rebuild immutable identities and permission flags from this draft.
      record = { ...snapshot(), reviewed_at: previous.reviewed_at }
      stored = true
    }
  } catch { /* Saving a JSON copy also works without browser storage. */ }
  show()
}

export function createLabelReviewHTML(draft, preview, { reviewer = '' } = {}) {
  if (draft?.format !== 'kithmoot-pending-label-draft-v1') throw new Error('Expected a pending label draft.')
  for (const value of [draft.source_sha256, draft.frame?.sha256, draft.foreground?.sha256]) {
    if (!isHash(value)) throw new Error('Source, frame and foreground need SHA-256 identities.')
  }
  const { width, height } = draft.frame
  if (![width, height].every(value => Number.isInteger(value) && value >= 16 && value <= 8192)
    || width * height > 16_777_216) throw new Error('Invalid frame dimensions.')
  const boxes = draft.face_boxes_xywh_pixels
  if (!Array.isArray(boxes) || boxes.length > 100 || boxes.some(box => !Array.isArray(box) || box.length !== 4
    || !box.every(Number.isFinite) || box[0] < 0 || box[1] < 0 || box[2] <= 0 || box[3] <= 0
    || box[0] + box[2] > width || box[1] + box[3] > height)) throw new Error('Invalid face boxes.')
  if (!Number.isFinite(draft.requested_time_seconds) || draft.requested_time_seconds < 0) throw new Error('Invalid frame time.')
  if (typeof reviewer !== 'string' || reviewer.length > 160) throw new Error('Reviewer is too long.')
  if (!Buffer.isBuffer(preview) || preview.length < 33 || preview.length > 32 * 1024 * 1024
    || !preview.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || preview.toString('ascii', 12, 16) !== 'IHDR') throw new Error('Use a PNG preview up to 32 MiB.')
  const previewWidth = preview.readUInt32BE(16), previewHeight = preview.readUInt32BE(20)
  if (!previewWidth || !previewHeight || previewWidth > 8192 || previewHeight > 8192
    || previewWidth * previewHeight > 20_000_000) throw new Error('PNG preview dimensions are too large.')
  const identity = {
    source_sha256: draft.source_sha256, frame_sha256: draft.frame.sha256,
    foreground_sha256: draft.foreground.sha256, preview_sha256: sha256(preview),
    frame_width: width, frame_height: height, time_seconds: draft.requested_time_seconds,
    face_boxes_xywh_pixels: boxes,
  }
  const config = { ...identity, review_id: sha256(JSON.stringify(identity)), reviewer }
  return `<!doctype html>
<!-- Review tool code: ${toolLicense}
Imagery retains its own source terms; the code licence grants no imagery rights. -->
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>KithMoot — First label review</title>
<style>
*{box-sizing:border-box}html{color-scheme:dark}body{font:18px/1.5 system-ui,sans-serif;margin:24px auto;padding:0 20px;max-width:1800px;background:#0d1c27;color:#edf5f7}
h1{font-size:28px;margin:0 0 8px}p{margin:8px 0 16px}img{display:block;width:100%;height:auto;border:1px solid #34505e;border-radius:8px}
.review{margin:18px 0;padding:18px;border:1px solid #34505e;border-radius:8px}.actions{display:flex;flex-wrap:wrap;gap:12px;margin:16px 0}
button,input,textarea{font:inherit}button{cursor:pointer;border:2px solid #65808d;border-radius:7px;padding:10px 18px;background:#193341;color:inherit}
button[aria-pressed=true]{border-color:#82e3c4;background:#185441}#needs-changes[aria-pressed=true]{border-color:#ffbf70;background:#654020}
button:disabled{opacity:.5;cursor:default}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid #ffb338;outline-offset:3px}
label{display:block;margin:12px 0}input,textarea{display:block;width:100%;max-width:850px;border:1px solid #65808d;border-radius:5px;padding:8px;background:#132936;color:inherit}
textarea{min-height:80px;resize:vertical}.hint{color:#b3cad3;font-size:16px}#review-status{font-weight:600}
@media(prefers-color-scheme:light){html{color-scheme:light}body{background:#f5fafb;color:#142a36}.review,img{border-color:#9aafb8}button,input,textarea{background:white;color:#142a36}button[aria-pressed=true]{background:#cfeddf;border-color:#26775c}#needs-changes[aria-pressed=true]{background:#ffecd3;border-color:#915815}.hint{color:#405d6a}}
</style></head><body>
<h1>First label review</h1>
<p>Check that the orange box contains the whole face, and that the right-hand image keeps the person while removing the wall and shadow.</p>
<img alt="Source frame with an orange face box, beside a draft foreground cutout" src="data:image/png;base64,${preview.toString('base64')}">
<section class="review" aria-label="Your label review">
<p>Look closely at the hair, ears, beard and shoulders.</p>
<label>Reviewer (optional)<input id="reviewer" maxlength="160" autocomplete="name"></label>
<label>Note (optional)<textarea id="notes" maxlength="8000" placeholder="Describe anything that needs changing."></textarea></label>
<div class="actions"><button id="looks-good" type="button" aria-pressed="false">Looks good</button><button id="needs-changes" type="button" aria-pressed="false">Needs changes</button><button id="save-review" type="button" disabled>Save review</button></div>
<p id="review-status" role="status" aria-live="polite"></p>
<p class="hint">Your verdict reviews these labels. Training rights are handled separately. Save review downloads a JSON copy; this page sends no data anywhere.</p>
</section>
<script id="review-config" type="application/json">${jsonForHTML(config)}</script>
<script>document.getElementById('reviewer').value=JSON.parse(document.getElementById('review-config').textContent).reviewer;(${mountReview.toString()})();</script>
</body></html>\n`
}

async function main(args) {
  const values = new Map(), overwrite = args.includes('--overwrite')
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--overwrite') continue
    if (!['--draft', '--preview', '--output', '--reviewer'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Use --draft draft.json --preview preview.png --output review.html [--reviewer name] [--overwrite]')
    if (values.has(args[i])) throw new Error('Repeated option: ' + args[i])
    values.set(args[i], args[++i])
  }
  if (!['--draft', '--preview', '--output'].every(key => values.has(key))) throw new Error('Use --draft draft.json --preview preview.png --output review.html [--reviewer name] [--overwrite]')
  const draftPath = resolve(values.get('--draft')), previewPath = resolve(values.get('--preview')), output = resolve(values.get('--output'))
  if ([draftPath, previewPath].includes(output)) throw new Error('Output must differ from the draft and preview.')
  const [draft, preview] = await Promise.all([readFile(draftPath, 'utf8'), readFile(previewPath)])
  const html = createLabelReviewHTML(JSON.parse(draft), preview, { reviewer: values.get('--reviewer') ?? '' })
  await writeFile(output, html, { flag: overwrite ? 'w' : 'wx' })
  process.stdout.write(JSON.stringify({ review_page: output, scope: 'labels-only', eligible_for_training: false }) + '\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1 })
}
