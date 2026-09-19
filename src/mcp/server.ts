import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { LLMWikiBridge } from '../bridge/client.js'
import { buildWorkspaceGraph, formatZhifangsiMap } from './helpers.js'
import {
  loadInvariantsFromWorkspace,
  checkInvariants,
  formatInvariantReport,
} from '../invariants/checker.js'
import * as fs from 'fs'
import * as path from 'path'

export function createZhifangsiMcpServer(bridge = new LLMWikiBridge()) {
  const server = new Server(
    {
      name: 'zhifangsi',
      version: '1.0.0',
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
            '获取当前代码库的职方司全景战略舆图。包含基于 PageRank 的核心关隘文件（Hubs）、已注册模块、业务流和架构守则。',
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
          name: 'zhifangsi_module_info',
          description:
            '查询特定模块的职责定义、公共 API 导出契约与深度依赖影响范围。',
          inputSchema: {
            type: 'object',
            properties: {
              module_name: {
                type: 'string',
                description: '模块名称，如 graph-renderer 或 wiki-store',
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
            '在代码库知识舆图中检索。若 LLM Wiki 桌面端在线，将自动调用 LanceDB 向量+关键词混合检索。',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: '检索关键词或意图描述',
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
            '对代码库执行架构关防守则（Invariants）静态合规检查，检测是否存在跨层越权调用、非法依赖或单向数据流违规。',
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
        return {
          content: [{ type: 'text', text }],
        }
      }

      case 'zhifangsi_module_info': {
        const moduleName = String(args.module_name)
        const wikiPath = path.join(targetDir, 'wiki', 'modules', `${moduleName}.md`)
        let wikiContent = ''
        if (fs.existsSync(wikiPath)) {
          wikiContent = fs.readFileSync(wikiPath, 'utf-8')
        }

        const graph = buildWorkspaceGraph(targetDir)
        const dependents = graph.getDependents(moduleName)
        const deepDependents = graph.getDeepDependents(moduleName)

        const text = [
          `# 模块详细档案: ${moduleName}`,
          wikiContent ? `\n## 架构文档 (wiki/modules/${moduleName}.md)\n${wikiContent}` : '*暂无专门的 wiki 架构文档*',
          `\n## 依赖拓扑关联`,
          `- 直接依赖方: ${dependents.length > 0 ? dependents.map((d: string) => `\`${d}\``).join(', ') : '无'}`,
          `- 深度影响闭包: ${deepDependents.length > 0 ? deepDependents.map((d: string) => `\`${d}\``).join(', ') : '无'}`,
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

        return {
          content: [
            {
              type: 'text',
              text: `未在本地或 LLM Wiki 中检索到与 "${query}" 匹配的架构条目。建议确保 LLM Wiki 桌面端已启动或运行 \`zhifangsi map\` 生成舆图。`,
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
                text: 'LLM Wiki 桌面端离线。职方司当前以【纯本地独立模式】运行（仅依赖本地 AST 与 Markdown 舆图）。若需图谱可视化与向量检索，请启动 LLM Wiki 客户端。',
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
                },
                null,
                2
              ),
            },
          ],
        }
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
