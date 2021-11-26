import AgentKeepAlive from 'agentkeepalive'
import axios from 'axios'
import { PageWithAncestors } from './component'

class Api {
  client = axios.create({
    baseURL: process.env.DOSGATO_API_URL,
    httpAgent: new AgentKeepAlive(),
    httpsAgent: new AgentKeepAlive.HttpsAgent()
  })

  async query <T = any> (query: string, variables?: any, token?: string) {
    const resp = (await this.client.post('/', { query, variables }, {
      headers: { authorization: `Bearer ${token ?? process.env.DOS_GATO_ANON_TOKEN!}` }
    })).data
    if (resp.errors?.length) throw new Error(resp.errors[0].message)
    return resp.data as T
  }

  async getLaunchedPage (hostname: string, path: string, schemaversion: Date): Promise<PageWithAncestors|undefined> {
    const data = await this.query(`
      getLaunchedPage ($launchUrl: String!, $schemaversion: DateTime!) {
        pages (filter: { launchedUrls: [$launchUrl] }) {
          data (schemaversion: $schemaversion, published: true)
        }
      }
    `, { launchUrl: `http://${hostname}${path}`, schemaversion })
    return data.pages[0]?.data
  }

  async getPreviewPage (token: string, pagetreeId: string, path: string, schemaversion: Date, published?: true, version?: number): Promise<PageWithAncestors|undefined> {
    return await this.query(`
      getPreviewPage ($pagetreeId: ID!, $path: String!, $published: Boolean, $version: Int) {
        pages (filter: { pagetreeIds: [$pagetreeId], paths: [$path] }) {
          data (schemaversion: $schemaversion, published: $published, version: $version)
        }
      }
    `, { pagetreeId, path, schemaversion, published, version }, token)
  }
}

export const api = new Api()
