import { IconifyIcon } from '@iconify/svelte'

export interface SvelteComponent {
  $set: (props?: Record<string, any>) => void
  $on: (event: string, callback: (event: any) => void) => () => void
  $destroy: () => void
  [accessor: string]: any
}

// We're extending IconifyIcon here so that templates can provide a raw SVG
// instead of an IconifyIcon by puting the SVG contents into `body` and
// setting `raw` true.
export interface IconOrSVG extends IconifyIcon {
  raw?: true
}

export interface UITemplate {
  templateKey: string

  // A svelte component that expects to be inside a @dosgato/dialog Form component
  dialog: SvelteComponent

  // if present this SVG will be used when presenting users with
  // an array of choices of templates to create. Ideally it should look
  // a lot like the template will look on a webpage. It will be presented
  // about 1-1.5 inches wide
  preview?: IconOrSVG

  // if present this icon will be used to represent the template in various
  // UI contexts. It will be presented about 3mm wide. Falls back to the
  // preview image.
  icon?: IconOrSVG
}
