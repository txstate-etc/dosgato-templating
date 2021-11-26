/**
 * These types are shared with the API. Might need to go somewhere central eventually.
 */

export interface ComponentData {
  templateKey: string
  areas: Record<string, ComponentData[]>
}

export interface PageData extends ComponentData {
  savedAtVersion: Date
}
