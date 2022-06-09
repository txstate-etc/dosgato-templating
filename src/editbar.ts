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
<div class="dg-edit-bar ${opts.extraClass ?? ''}" data-path="${htmlEncode(path)}" draggable="true" ondragstart="window.dgEditing.drag(event)" ondragover="window.dgEditing.over(event)" ondragend="window.dgEditing.drop(event)">
  <span id="${id}" class="dg-edit-bar-label">${htmlEncode(opts.label)}</span>
  <button onclick="window.dgEditing.edit(event)" aria-describedby="${id}">Edit</button>
  <button onclick="window.dgEditing.move(event)" aria-describedby="${id}">Move</button>
  <button onclick="window.dgEditing.del(event)" aria-describedby="${id}">Trash</button>
</div>
  `.trim()
}

export function newBar (path: string, opts: EditBarOpts & { label: string }) {
  if (!opts.editMode) return ''
  return `
<div role="button" onclick="window.dgEditing.create(event)" class="dg-new-bar ${opts.extraClass ?? ''}" data-path="${htmlEncode(path)}">
  ${htmlEncode(opts.label)}
</div>
  `.trim()
}
