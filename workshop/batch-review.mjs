/** MIT: offline, per-example human review of pending face/foreground labels. */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createLabelReviewConfig } from './label-review.mjs'

const sha256 = value => createHash('sha256').update(value).digest('hex')
const jsonForHTML = value => JSON.stringify(value).replaceAll('<', '\\u003c')
const toolLicense = readFileSync(new URL('../LICENSE', import.meta.url), 'utf8').replaceAll('--', '—')

function mountBatch() {
  const batch = JSON.parse(document.getElementById('batch-config').textContent)
  const $ = id => document.getElementById(id)
  const reviews = new Map(), storage = new Map()
  const key = item => 'kithmoot-label-review-v1:' + item.config.review_id
  const verdictText = value => value === 'looks-good' ? 'Looks good' : 'Needs changes'
  let current = 0

  for (const item of batch.items) {
    try {
      const old = JSON.parse(localStorage.getItem(key(item)) ?? 'null')
      if (old?.format !== 'kithmoot-label-review-v1' || old.scope !== 'labels-only'
        || old.review_id !== item.config.review_id || !['looks-good', 'needs-changes'].includes(old.verdict)
        || typeof old.reviewer !== 'string' || old.reviewer.length > 160
        || typeof old.notes !== 'string' || old.notes.length > 8000
        || typeof old.reviewed_at !== 'string' || !Number.isFinite(Date.parse(old.reviewed_at))) continue
      // Restore feedback, rebuilding identities and permission flags from this draft.
      reviews.set(item.config.review_id, {
        format: 'kithmoot-label-review-v1', scope: 'labels-only', ...item.config,
        reviewer: old.reviewer, notes: old.notes, verdict: old.verdict, reviewed_at: old.reviewed_at,
        labels_approved: old.verdict === 'looks-good', training_rights_approved: false, eligible_for_training: false,
      })
      storage.set(item.config.review_id, true)
    } catch { /* A portable download also works with browser storage disabled. */ }
  }

  function summary() {
    const accepted = [...reviews.values()].filter(review => review.labels_approved).length
    $('progress').textContent = `${reviews.size} of ${batch.items.length} reviewed · Looks good: ${accepted} · Needs changes: ${reviews.size - accepted}`
    $('save-all').disabled = reviews.size === 0
    $('next-pending').disabled = reviews.size === batch.items.length
    for (const [index, item] of batch.items.entries()) {
      const record = reviews.get(item.config.review_id)
      $('example').options[index].textContent = `${index + 1}. ${item.title} — ${record ? verdictText(record.verdict) : 'Pending'}`
    }
  }
  function show() {
    const item = batch.items[current], record = reviews.get(item.config.review_id)
    $('example').value = String(current)
    $('example-title').textContent = `${current + 1} of ${batch.items.length}: ${item.title}`
    $('instructions').textContent = item.instructions
    $('context').textContent = item.context
    $('preview').src = item.preview
    $('preview').alt = item.title + ': face boxes beside a draft foreground cutout'
    $('reviewer').value = record?.reviewer ?? batch.reviewer
    $('notes').value = record?.notes ?? ''
    $('previous').disabled = current === 0
    $('next').disabled = current === batch.items.length - 1
    for (const verdict of ['looks-good', 'needs-changes']) $(verdict).setAttribute('aria-pressed', String(record?.verdict === verdict))
    $('review-status').textContent = !record ? 'Check this example, then choose a verdict.'
      : verdictText(record.verdict) + (storage.get(item.config.review_id)
        ? ' — saved in this browser.' : ' — marked for this session; browser storage is unavailable. Download your reviews before closing.')
    summary()
  }
  function save(verdict) {
    const item = batch.items[current]
    const record = {
      format: 'kithmoot-label-review-v1', scope: 'labels-only', ...item.config,
      reviewer: $('reviewer').value.trim(), notes: $('notes').value,
      verdict, reviewed_at: new Date().toISOString(), labels_approved: verdict === 'looks-good',
      training_rights_approved: false, eligible_for_training: false,
    }
    reviews.set(item.config.review_id, record)
    try { localStorage.setItem(key(item), JSON.stringify(record)); storage.set(item.config.review_id, true) }
    catch { storage.set(item.config.review_id, false) }
    // Keep the text caret in place when saving edits to a reviewed example.
    const active = document.activeElement, start = active?.selectionStart, end = active?.selectionEnd
    show()
    if (typeof start === 'number') active.setSelectionRange(start, end)
  }
  for (const verdict of ['looks-good', 'needs-changes']) $(verdict).addEventListener('click', () => save(verdict))
  for (const id of ['reviewer', 'notes']) $(id).addEventListener('input', () => {
    const record = reviews.get(batch.items[current].config.review_id)
    if (record) save(record.verdict)
  })
  $('example').addEventListener('change', () => { current = Number($('example').value); show() })
  $('previous').addEventListener('click', () => { if (current > 0) { current--; show() } })
  $('next').addEventListener('click', () => { if (current < batch.items.length - 1) { current++; show() } })
  $('next-pending').addEventListener('click', () => {
    for (let step = 1; step <= batch.items.length; step++) {
      const index = (current + step) % batch.items.length
      if (!reviews.has(batch.items[index].config.review_id)) { current = index; show(); break }
    }
  })
  $('save-all').addEventListener('click', () => {
    const record = {
      format: 'kithmoot-label-review-batch-v1', scope: 'labels-only', batch_id: batch.batch_id,
      saved_at: new Date().toISOString(),
      reviews: batch.items.flatMap(item => reviews.has(item.config.review_id) ? [reviews.get(item.config.review_id)] : []),
      pending_review_ids: batch.items.filter(item => !reviews.has(item.config.review_id)).map(item => item.config.review_id),
      training_rights_approved: false, eligible_for_training: false,
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2) + '\n'], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url; link.download = 'kithmoot-label-batch-' + batch.batch_id.slice(0, 16) + '.json'
    document.body.append(link); link.click(); link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  })
  batch.items.forEach((item, index) => {
    const option = document.createElement('option'); option.value = String(index); $('example').append(option)
  })
  $('batch-title').textContent = batch.title; document.title = 'KithMoot — ' + batch.title
  show()
}

export function createBatchReviewHTML(items, { title = 'Label review batch', reviewer = '' } = {}) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 24) throw new Error('Use 1 to 24 label drafts.')
  if (typeof title !== 'string' || !title.trim() || title.length > 160) throw new Error('Invalid batch title.')
  if (typeof reviewer !== 'string' || reviewer.length > 160) throw new Error('Reviewer is too long.')
  let bytes = 0
  const ids = new Set(), prepared = items.map(item => {
    for (const [name, limit] of [['title', 160], ['instructions', 2000], ['context', 2000]]) {
      if (typeof item[name] !== 'string' || !item[name].trim() || item[name].length > limit) throw new Error('Invalid item ' + name + '.')
    }
    const config = createLabelReviewConfig(item.draft, item.preview)
    if (ids.has(config.review_id)) throw new Error('Duplicate label draft in batch.')
    ids.add(config.review_id); bytes += item.preview.length
    if (bytes > 32 * 1024 * 1024) throw new Error('Batch previews exceed 32 MiB.')
    return { title: item.title, instructions: item.instructions, context: item.context,
      config, preview: 'data:image/png;base64,' + item.preview.toString('base64') }
  })
  const batch = { title, reviewer, batch_id: sha256(JSON.stringify([...ids])), items: prepared }
  return `<!doctype html>
<!-- Review tool code: ${toolLicense}
Imagery retains its own source terms; the code licence grants no imagery rights. -->
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>KithMoot — Label review batch</title><style>
*{box-sizing:border-box}html{color-scheme:dark}body{font:18px/1.5 system-ui,sans-serif;max-width:1800px;margin:24px auto;padding:0 20px;background:#0d1c27;color:#edf5f7}
h1{font-size:28px;margin:0 0 8px}h2{font-size:23px}p{margin:8px 0 16px}.hint{font-size:16px;color:#b3cad3}
img{display:block;width:100%;height:auto;border:1px solid #34505e;border-radius:8px}.actions{display:flex;flex-wrap:wrap;gap:12px;margin:16px 0}
button,input,textarea,select{font:inherit;max-width:100%}button{cursor:pointer;border:2px solid #65808d;border-radius:7px;padding:10px 18px;background:#193341;color:inherit}
button[aria-pressed=true]{border-color:#82e3c4;background:#185441}#needs-changes[aria-pressed=true]{border-color:#ffbf70;background:#654020}button:disabled{opacity:.5;cursor:default}
button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid #ffb338;outline-offset:3px}
label{display:block;margin:12px 0}input,textarea,select{display:block;width:100%;border:1px solid #65808d;border-radius:5px;padding:8px;background:#132936;color:inherit}
input,textarea{max-width:850px}textarea{min-height:80px;resize:vertical}#progress,#review-status{font-weight:600}.review{margin:18px 0;padding:18px;border:1px solid #34505e;border-radius:8px}
@media(prefers-color-scheme:light){html{color-scheme:light}body{background:#f5fafb;color:#142a36}.review,img{border-color:#9aafb8}button,input,textarea,select{background:white;color:#142a36}button[aria-pressed=true]{background:#cfeddf;border-color:#26775c}#needs-changes[aria-pressed=true]{background:#ffecd3;border-color:#915815}.hint{color:#405d6a}}
</style></head><body>
<h1 id="batch-title">Label review batch</h1>
<p>Check every face box and the foreground cutout. Keep hands and objects being shown to the camera. Remove the room and cast shadows.</p>
<p id="progress" role="status" aria-live="polite"></p>
<label>Example<select id="example"></select></label>
<div class="actions"><button id="previous" type="button">Previous</button><button id="next" type="button">Next</button><button id="next-pending" type="button">Next unreviewed</button></div>
<h2 id="example-title"></h2><p id="instructions"></p><p id="context" class="hint"></p>
<img id="preview" alt="Pending label comparison">
<section class="review" aria-label="Your label review">
<label>Reviewer (optional)<input id="reviewer" maxlength="160" autocomplete="name"></label>
<label>Note (optional)<textarea id="notes" maxlength="8000" placeholder="Describe anything that needs changing."></textarea></label>
<div class="actions"><button id="looks-good" type="button" aria-pressed="false">Looks good</button><button id="needs-changes" type="button" aria-pressed="false">Needs changes</button><button id="save-all" type="button" disabled>Save all reviews</button></div>
<p id="review-status" role="status" aria-live="polite"></p>
<p class="hint">These verdicts review labels only. Source-use review is separate. Save all reviews downloads your decisions and lists unfinished examples. This offline page sends no data anywhere.</p>
</section>
<script id="batch-config" type="application/json">${jsonForHTML(batch)}</script>
<script>(${mountBatch.toString()})();</script></body></html>\n`
}

async function main(args) {
  const values = new Map(), overwrite = args.includes('--overwrite')
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--overwrite') continue
    if (!['--batch', '--output', '--reviewer'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Use --batch batch.json --output review.html [--reviewer name] [--overwrite]')
    if (values.has(args[i])) throw new Error('Repeated option: ' + args[i])
    values.set(args[i], args[++i])
  }
  if (!values.has('--batch') || !values.has('--output')) throw new Error('Use --batch batch.json --output review.html [--reviewer name] [--overwrite]')
  const input = resolve(values.get('--batch')), output = resolve(values.get('--output'))
  const manifest = JSON.parse(await readFile(input, 'utf8'))
  if (manifest?.format !== 'kithmoot-pending-label-batch-v1' || !Array.isArray(manifest.items)
    || manifest.items.length < 1 || manifest.items.length > 24) throw new Error('Expected a pending label batch with 1 to 24 items.')
  const inputs = new Set([input]), items = []
  for (const item of manifest.items) {
    if (typeof item.draft !== 'string' || !item.draft || typeof item.preview !== 'string' || !item.preview) throw new Error('Each item needs draft and preview paths.')
    const draftPath = resolve(dirname(input), item.draft), previewPath = resolve(dirname(input), item.preview)
    inputs.add(draftPath); inputs.add(previewPath)
    const [draft, preview] = await Promise.all([readFile(draftPath, 'utf8'), readFile(previewPath)])
    items.push({ ...item, draft: JSON.parse(draft), preview })
  }
  if (inputs.has(output)) throw new Error('Output must differ from all batch inputs.')
  const html = createBatchReviewHTML(items, { title: manifest.title, reviewer: values.get('--reviewer') ?? '' })
  await writeFile(output, html, { flag: overwrite ? 'w' : 'wx' })
  process.stdout.write(JSON.stringify({ review_page: output, examples: items.length, scope: 'labels-only', eligible_for_training: false }) + '\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1 })
}
