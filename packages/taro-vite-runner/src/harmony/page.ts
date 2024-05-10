import path from 'node:path'

import { removeHeadSlash } from '@tarojs/helper'

import { addLeadingSlash, appendVirtualModulePrefix, stripVirtualModulePrefix, virtualModulePrefixREG } from '../utils'
import { PageParser } from './template'

import type { ViteHarmonyCompilerContext } from '@tarojs/taro/types/compile/viteCompilerContext'
import type { PluginOption } from 'vite'
import type { TaroHarmonyPageMeta } from './template/page'

export const PAGE_SUFFIX = '?page-loader=true'
export const TARO_TABBAR_PAGE_PATH = 'taro_tabbar'

export default function (viteCompilerContext: ViteHarmonyCompilerContext): PluginOption {
  const name = 'taro:vite-harmony-page'

  return {
    name,
    enforce: 'pre',
    resolveId (source, importer, options) {
      if ((viteCompilerContext?.isPage(source) || viteCompilerContext?.isComponent(source)) && options.isEntry) {
        if (viteCompilerContext.getPageById(source)?.isNative) return null
        return appendVirtualModulePrefix(source + PAGE_SUFFIX)
      } else if (source.includes(TARO_TABBAR_PAGE_PATH) && options.isEntry) {
        return appendVirtualModulePrefix(source)
      } else if (source.endsWith(PAGE_SUFFIX)) {
        return appendVirtualModulePrefix(source)
      } else if (virtualModulePrefixREG.test(importer || '')) {
        importer = stripVirtualModulePrefix(importer || '')
        if (source.includes(TARO_TABBAR_PAGE_PATH) && source === importer.replace(PAGE_SUFFIX, '')) {
          return appendVirtualModulePrefix(source)
        } else {
          return this.resolve(source, importer, options)
        }
      }
      return null
    },
    load (id) {
      if (!viteCompilerContext) return
      const { taroConfig, cwd: appPath, app, loaderMeta } = viteCompilerContext
      const appConfig = app.config
      const { sourceRoot = 'src' } = taroConfig
      const appRoot = path.resolve(appPath, sourceRoot)
      const parse = new PageParser(appPath, appConfig, taroConfig, loaderMeta)
      const tabbarList = appConfig.tabBar?.list || []
      const rawId = stripVirtualModulePrefix(id).replace(PAGE_SUFFIX, '')

      if (id.endsWith(PAGE_SUFFIX)) {
        const page = viteCompilerContext.getPageById(rawId) || viteCompilerContext.getComponentById(rawId)
        // Note: 组件编译模式下禁用 TabBar 页面生成
        const isTabbarPage = !taroConfig.isBuildNativeComp &&
          tabbarList.some(item => item.pagePath === page?.name)

        if (!page) {
          viteCompilerContext.logger.warn(`编译页面 ${rawId} 失败!`)
          process.exit(1)
        }

        if (isTabbarPage) {
          if (tabbarList[0].pagePath === page.name) {
            const tabbarPages = tabbarList.map(item => viteCompilerContext.pages.find((e: TaroHarmonyPageMeta) => {
              if (e.name === item.pagePath) {
                e.originName = item.pagePath
                return true
              }
            })!)
            const tabbarId = path.join(appRoot, `${TARO_TABBAR_PAGE_PATH}`)
            this.emitFile({
              type: 'prebuilt-chunk',
              fileName: viteCompilerContext.getTargetFilePath(TARO_TABBAR_PAGE_PATH, '.ets'),
              code: parse.parse(tabbarId, tabbarPages as TaroHarmonyPageMeta[], name, this.resolve),
              exports: ['default'],
            })
          }
        } else {
          const list: string[] = []
          const key = Object.keys(taroConfig.router?.customRoutes || {}).find(e => [page.name, addLeadingSlash(page.name)].includes(e))
          if (key) {
            const alias = taroConfig.router?.customRoutes![key]
            if (alias instanceof Array) {
              list.push(...alias)
            } else {
              list.push(alias)
            }
          } else {
            list.push(page.name)
          }

          list.forEach(pageName => {
            pageName = removeHeadSlash(pageName)
            if (!pageName) {
              pageName = 'index'
            }

            this.emitFile({
              type: 'prebuilt-chunk',
              fileName: viteCompilerContext.getTargetFilePath(pageName, '.ets'),
              code: parse.parse(path.resolve(appRoot, pageName), {
                ...page,
                originName: page.name,
                name: pageName,
              } as TaroHarmonyPageMeta, name, this.resolve),
              exports: ['default'],
            })
          })
        }
        return parse.parseEntry(rawId, page as TaroHarmonyPageMeta)
      }
    },
  }
}
