import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { LLMWikiBridge } from '../bridge/client.js'
import {
  buildWorkspaceGraph,
  formatZhifangsiMap,
  searchLocalWorkspace,
  generateNeighborhoodSkeleton,
  analyzeChangeImpact,
} from './helpers.js'
import {
  loadInvariantsFromWorkspace,
  checkInvariants,
  formatInvariantReport,
} from '../invariants/checker.js'
import { extractFrontmatter } from '../invariants/parser.js'
import { generateCodebaseSkeleton } from '../ast/skeletonizer.js'
import { bootstrapWikiModules } from '../init/scaffold.js'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

export function createZhifangsiMcpServer(bridge = new LLMWikiBridge()) {
  const server = new Server(
    {
      name: 'zhifangsi',
      version: '1.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'zhifangsi_map',
          description:
            '获取并生成当前代码库的职方司全景战略舆图。包含基于 PageRank 的核心关隘文件（Hubs）、循环依赖预警、已注册模块、业务流和架构守则，支持持久化保存为 Markdown 文件。',
          inputSchema: {
            type: 'object',
            properties: {
              target_dir: {
                type: 'string',
                description: '代码库根路径，缺省为当前工作目录',
              },
              output_file: {
                type: 'string',
                description: '可选，舆图 Markdown 保存文件路径，如 CODEBASE_MAP.md',
              },
            },
          },
        },
        {
          name: 'zhifangsi_module_info',
          description:
            '查询特定模块的职责定义、公共 API 导出契约与深度依赖影响范围（支持模块名或目录路径）。',
          inputSchema: {
            type: 'object',
            properties: {
              module_name: {
                type: 'string',
                description: '模块名称或源码子目录，如 ast、invariants、src/bridge',
              },
              target_dir: {
                type: 'string',
                description: '代码库根路径，缺省为当前工作目录',
              },
            },
            required: ['module_name'],
          },
        },
        {
          name: 'zhifangsi_workflow_trace',
          description:
            '追踪特定业务流的端到端调用时序与阶段步骤。',
          inputSchema: {
            type: 'object',
            properties: {
              workflow_name: {
                type: 'string',
                description: '业务流名称，如 ingest-pipeline 或 search-flow',
              },
              target_dir: {
                type: 'string',
                description: '代码库根路径，缺省为当前工作目录',
              },
            },
            required: ['workflow_name'],
          },
        },
        {
          name: 'zhifangsi_search',
          description:
            '在代码库知识舆图中检索。若 LLM Wiki 桌面端在线则调用 LanceDB 混合检索，离线时自动回退到本地 Wiki + AST 导出符号混合检索。',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: '检索关键词、符号名或意图描述',
              },
              target_dir: {
                type: 'string',
                description: '代码库根路径，缺省为当前工作目录',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'zhifangsi_bridge_status',
          description:
            '检查与 LLM Wiki 桌面端（127.0.0.1:19828）的桥接协同状态。',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'zhifangsi_check_invariants',
          description:
            '对代码库执行架构关防守则（Invariants）静态合规检查，检测跨层越权调用、非法依赖、循环依赖及 Wiki 舆图失真（Drift）。',
          inputSchema: {
            type: 'object',
            properties: {
              target_dir: {
                type: 'string',
                description: '代码库根路径，缺省为当前工作目录',
              },
            },
          },
        },
        {
          name: 'zhifangsi_skeleton',
          description:
            '基于局部性原理（Inline & Spill）提取代码高信息密度骨架（85%+ Token 降噪）。指定 target 时内联该文件/模块骨架与 1 跳邻居契约，未指定时提取全库骨架。',
          inputSchema: {
            type: 'object',
            properties: {
              target: {
                type: 'string',
                description: '可选，目标文件路径或模块名（如 src/ast/parser.ts 或 ast）；省略则提取全库骨架',
              },
              hops: {
                type: 'number',
                description: '可选，局部邻域展开跳数，默认为 1',
              },
              target_dir: {
                type: 'string',
                description: '代码库根路径，缺省为当前工作目录',
              },
            },
          },
        },
        {
          name: 'zhifangsi_impact',
          description:
            '评估拟修改文件的变更爆炸半径、波及模块、建议回归验证的业务流水线（Workflows），并检测是否触碰高 PageRank 核心关隘以防多 Worker 并发撞车。',
          inputSchema: {
            type: 'object',
            properties: {
              files: {
                type: 'array',
                items: { type: 'string' },
                description: '拟修改的文件路径或模块名称列表',
              },
              target_dir: {
                type: 'string',
                description: '代码库根路径，缺省为当前工作目录',
              },
            },
            required: ['files'],
          },
        },
        {
          name: 'zhifangsi_bootstrap',
          description:
            '存量代码库冷启动自动建档：基于 AST 目录拓扑自动聚类生成 wiki/modules/*.md 模块档案（含核心入口、导出 API 签名契约与跨模块双链依赖）。',
          inputSchema: {
            type: 'object',
            properties: {
              target_dir: {
                type: 'string',
                description: '代码库根路径，缺省为当前工作目录',
              },
              force: {
                type: 'boolean',
                description: '是否覆盖已存在的模块档案，默认为 false',
              },
            },
          },
        },
      ],
    }
  })

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params
    const targetDir = (args.target_dir as string) || process.cwd()

    switch (name) {
      case 'zhifangsi_map': {
        const bridgeOnline = await bridge.isAvailable()
        const graph = buildWorkspaceGraph(targetDir)
        const text = formatZhifangsiMap(targetDir, graph, bridgeOnline)
        const outputFile = args.output_file ? path.resolve(targetDir, String(args.output_file)) : null
        if (outputFile) {
          fs.writeFileSync(outputFile, text, 'utf-8')
        }
        return {
          content: [
            { type: 'text', text },
            ...(outputFile ? [{ type: 'text', text: `✔ 战略舆图已持久化写入: \`${outputFile}\`` }] : []),
          ],
        }
      }

      case 'zhifangsi_module_info': {
        const moduleName = String(args.module_name)
        const wikiPath = path.join(targetDir, 'wiki', 'modules', `${moduleName}.md`)
        let wikiContent = ''
        const explicitPaths: string[] = []

        if (fs.existsSync(wikiPath)) {
          wikiContent = fs.readFileSync(wikiPath, 'utf-8')
          const { data } = extractFrontmatter(wikiContent)
          if (typeof data.path === 'string' && data.path) explicitPaths.push(data.path)
          if (Array.isArray(data.entrypoints)) {
            explicitPaths.push(...data.entrypoints.map(String))
          }
        }

        const graph = buildWorkspaceGraph(targetDir)
        const moduleFiles = graph.resolveModuleFiles(moduleName, explicitPaths)
        const dependencies = graph.getModuleDependencies(moduleFiles)
        const dependents = graph.getModuleDependents(moduleFiles)
        const deepDependents = graph.getModuleDeepDependents(moduleFiles)

        const exportedSymbols: string[] = []
        for (const mf of moduleFiles) {
          const info = graph.getFileInfo(mf)
          info?.exports.forEach((e) => {
            exportedSymbols.push(`- \`${e.signature}\` (\`${mf}:${e.line}\`)`)
          })
        }

        const text = [
          `# 模块详细档案: ${moduleName}`,
          wikiContent ? `\n## 架构文档 (wiki/modules/${moduleName}.md)\n${wikiContent}` : '*暂无专门的 wiki 架构文档*',
          `\n## AST 实测拓扑与导出契约`,
          `- 匹配源码文件 (${moduleFiles.length}): ${moduleFiles.length > 0 ? moduleFiles.map((f) => `\`${f}\``).join(', ') : '未匹配到源码文件'}`,
          `- 直接下游依赖 (${dependencies.length}): ${dependencies.length > 0 ? dependencies.map((d) => `\`${d}\``).join(', ') : '无'}`,
          `- 直接依赖方 (${dependents.length}): ${dependents.length > 0 ? dependents.map((d) => `\`${d}\``).join(', ') : '无'}`,
          `- 深度影响闭包 (${deepDependents.length}): ${deepDependents.length > 0 ? deepDependents.map((d) => `\`${d}\``).join(', ') : '无'}`,
          ...(exportedSymbols.length > 0
            ? [`\n## 公共导出符号 (${exportedSymbols.length})`, ...exportedSymbols.slice(0, 30)]
            : []),
        ].join('\n')

        return {
          content: [{ type: 'text', text }],
        }
      }

      case 'zhifangsi_workflow_trace': {
        const workflowName = String(args.workflow_name)
        const flowPath = path.join(targetDir, 'wiki', 'workflows', `${workflowName}.md`)
        let content = ''
        if (fs.existsSync(flowPath)) {
          content = fs.readFileSync(flowPath, 'utf-8')
        } else {
          content = `未找到业务流档案: wiki/workflows/${workflowName}.md`
        }
        return {
          content: [{ type: 'text', text: content }],
        }
      }

      case 'zhifangsi_search': {
        const query = String(args.query)
        const bridgeOnline = await bridge.isAvailable()
        if (bridgeOnline) {
          const project = await bridge.findProjectByPath(targetDir)
          if (project) {
            const results = await bridge.search(project.id, query)
            if (results && results.hits?.length > 0) {
              const text = [
                `# 职方司检索结果 (来源: LLM Wiki LanceDB 混合检索)`,
                ...results.hits.map((h) => `- **${h.title}** (\`${h.path}\`) [评分: ${h.vectorScore ?? 'N/A'}]\n  ${h.snippet || ''}`),
              ].join('\n')
              return { content: [{ type: 'text', text }] }
            }
          }
        }

        // Local Standalone Fallback: search local wiki/**/*.md + AST symbols
        const graph = buildWorkspaceGraph(targetDir)
        const localHits = searchLocalWorkspace(targetDir, query, graph)
        if (localHits.length > 0) {
          const text = [
            `# 职方司检索结果 (来源: 本地 Wiki + AST 符号混合检索)`,
            ...localHits.map(
              (h) => `- **${h.title}** (\`${h.path}\`) [相关度: ${h.score}]\n  ${h.snippet}`
            ),
          ].join('\n')
          return { content: [{ type: 'text', text }] }
        }

        return {
          content: [
            {
              type: 'text',
              text: `未在本地或 LLM Wiki 中检索到与 "${query}" 匹配的架构条目或导出符号。`,
            },
          ],
        }
      }

      case 'zhifangsi_bridge_status': {
        const isOnline = await bridge.isAvailable()
        if (!isOnline) {
          return {
            content: [
              {
                type: 'text',
                text: 'LLM Wiki 桌面端离线。职方司当前以【纯本地独立模式】运行（支持本地 AST 测绘、骨架提取、不变量巡检与本地符号检索）。若需图谱可视化与向量检索，请启动 LLM Wiki 客户端。',
              },
            ],
          }
        }

        const projects = await bridge.listProjects()
        const text = [
          '# LLM Wiki 桌面桥接正常在线 ✅',
          `API 地址: 127.0.0.1:19828`,
          `已挂载项目数: ${projects.length}`,
          ...projects.map((p) => `- [${p.name}] \`${p.path}\``),
        ].join('\n')

        return {
          content: [{ type: 'text', text }],
        }
      }

      case 'zhifangsi_check_invariants': {
        const graph = buildWorkspaceGraph(targetDir)
        const invariants = loadInvariantsFromWorkspace(targetDir)
        const report = checkInvariants(invariants, graph, { rootDir: targetDir })
        const text = formatInvariantReport(report, { colored: false })
        return {
          content: [
            { type: 'text', text },
            {
              type: 'text',
              text: JSON.stringify(
                {
                  passed: report.passed,
                  totalInvariants: report.totalInvariants,
                  totalFilesChecked: report.totalFilesChecked,
                  totalViolations: report.totalViolations,
                  summary: report.summary,
                  violations: report.violations,
                  draftViolations: report.draftViolations,
                  driftWarnings: report.driftWarnings,
                },
                null,
                2
              ),
            },
          ],
        }
      }

      case 'zhifangsi_skeleton': {
        const target = args.target ? String(args.target) : ''
        const hops = typeof args.hops === 'number' ? args.hops : 1
        if (target) {
          const graph = buildWorkspaceGraph(targetDir)
          const text = generateNeighborhoodSkeleton(targetDir, target, graph, hops)
          return { content: [{ type: 'text', text }] }
        } else {
          const res = generateCodebaseSkeleton(targetDir)
          return { content: [{ type: 'text', text: res.markdown }] }
        }
      }

      case 'zhifangsi_impact': {
        const files = Array.isArray(args.files) ? args.files.map(String) : [String(args.files || '')]
        const graph = buildWorkspaceGraph(targetDir)
        const result = analyzeChangeImpact(targetDir, files, graph)
        return {
          content: [
            { type: 'text', text: result.markdown },
            { type: 'text', text: JSON.stringify(result, null, 2) },
          ],
        }
      }

      case 'zhifangsi_bootstrap': {
        const force = Boolean(args.force)
        const graph = buildWorkspaceGraph(targetDir)
        const res = bootstrapWikiModules(targetDir, graph, { force })
        const text = [
          `# 职方司冷启动模块聚类建档完成`,
          `- 新生成模块档案 (${res.modulesCreated.length}): ${res.modulesCreated.length > 0 ? res.modulesCreated.map((m) => `\`${m}\``).join(', ') : '无'}`,
          `- 已存在并跳过 (${res.modulesSkipped.length}): ${res.modulesSkipped.length > 0 ? res.modulesSkipped.map((m) => `\`${m}\``).join(', ') : '无'}`,
        ].join('\n')
        return { content: [{ type: 'text', text }] }
      }

      default:
        return {
          content: [{ type: 'text', text: `未知工具指令: ${name}` }],
        }
    }
  })

  return server
}

export async function runZhifangsiMcpServer() {
  const server = createZhifangsiMcpServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  runZhifangsiMcpServer().catch((err) => {
    console.error('[Zhifangsi MCP Error]', err)
    process.exit(1)
  })
}
