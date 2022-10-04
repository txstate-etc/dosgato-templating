export interface SvelteComponent {
  $set: (props?: Record<string, any>) => void
  $on: (event: string, callback: (event: any) => void) => () => void
  $destroy: () => void
  [accessor: string]: any
}

// extremely brief version of the IconifyIcon definition so we don't have to import
// the whole library, may need to keep this in sync with @iconify/svelte (currently 3.0.0)
interface IconifyIcon {
  body: string
  rotate?: number
  hFlip?: boolean
  vFlip?: boolean
  left?: number
  top?: number
  width?: number
  height?: number
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
