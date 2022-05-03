import { IconifyIcon } from '@iconify/svelte'
import { SvelteComponent } from 'svelte'

export interface UITemplate {
  templateKey: string

  // A svelte component that expects to be inside a @dosgato/dialog Form component
  dialog: SvelteComponent

  // if present this SVG will be used when presenting users with
  // an array of choices of templates to create. Ideally it should look
  // a lot like the template will look on a webpage. It will be presented
  // about 1-1.5 inches wide
  preview?: IconifyIcon

  // if present this icon will be used to represent the template in various
  // UI contexts. It will be presented about 3mm wide. Falls back to the
  // preview image.
  icon?: IconifyIcon
}
