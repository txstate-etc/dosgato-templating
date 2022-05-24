import { htmlEncode, randomid } from 'txstate-utils'

export interface EditBarOpts {
  extraClass?: string
  label?: string
  editMode?: boolean
}

export function editBar (path: string, opts: EditBarOpts & { label: string }) {
  if (!opts.editMode) return ''
  const id = randomid()
  return `
<div class="dg-edit-bar ${opts.extraClass ?? ''}" data-path="${htmlEncode(path)}">
  <span id="${id}" class="dg-edit-bar-label">${htmlEncode(opts.label)}</span>
  <button onClick="window.dgEditing.edit" aria-describedby="${id}">Edit</button>
  <button onClick="window.dgEditing.move" aria-describedby="${id}">Move</button>
  <button onClick="window.dgEditing.del" aria-describedby="${id}">Trash</button>
</div>
  `.trim()
}

export function newBar (path: string, opts: EditBarOpts & { label: string }) {
  if (!opts.editMode) return ''
  return `
<div class="dg-new-bar ${opts.extraClass ?? ''}" data-path="${htmlEncode(path)}">
  <button>${htmlEncode(opts.label)}</button>
</div>
  `.trim()
}
