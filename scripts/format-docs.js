#!/usr/bin/env node
/**
 * 📝 Markdown 文档格式化工具喵~
 * 支持格式化标题、代码块、空行和缩进！
 *
 * 用法:
 *   node scripts/format-docs.js                    # 格式化默认文档 (public/docs/home.md)
 *   node scripts/format-docs.js <文件路径>         # 格式化指定文件
 *   node scripts/format-docs.js --dir <目录>       # 格式化整个目录的 .md 文件
 *   node scripts/format-docs.js --check            # 只检查不写入 (dry-run)
 *
 */

const fs = require('fs')
const path = require('path')

// ======================== 配置 ========================
const CONFIG = {
  maxConsecutiveBlankLines: 2, // 最大连续空行数
  codeBlockLang: true, // 代码块是否保留语言标记
  headingSpaceBefore: true, // 标题前是否确保空行
  headingSpaceAfter: true, // 标题后是否确保空行
  listIndent: 2, // 列表缩进空格数
  encodeSpecialChars: false, // 是否编码特殊字符
  removeTrailingSpaces: true, // 是否删除行尾空格
}

const DEFAULT_FILE = path.resolve(__dirname, '..', 'public', 'docs', 'home.md')

// ======================== 颜色工具 ========================
const color = (code) => (s) => `\x1b[${code}m${s}\x1b[0m`
const green = color('32')
const cyan = color('36')
const yellow = color('33')
const red = color('31')
const bold = color('1')
const dim = color('2')

// ======================== 核心格式化函数 ========================

/**
 * 解析 Markdown 的块结构，返回块数组
 * 块类型: 'heading', 'code', 'list', 'paragraph', 'empty', 'hr', 'blockquote', 'table', 'html'
 */
function parseBlocks(lines) {
  const blocks = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // 空行
    if (trimmed === '') {
      blocks.push({ type: 'empty', lines: [line], raw: line })
      i++
      continue
    }

    // 代码块 (``` 或 ~~~)
    if (/^```/.test(trimmed) || /^~~~/.test(trimmed)) {
      const marker = trimmed.match(/^(```|~~~)/)[1]
      const lang = trimmed.slice(marker.length).trim()
      const start = i
      i++
      while (i < lines.length && !lines[i].trim().startsWith(marker)) {
        i++
      }
      if (i < lines.length) i++ // 跳过结束标记
      const codeLines = lines.slice(start, i)
      blocks.push({
        type: 'code',
        lines: codeLines,
        lang,
        marker,
        raw: codeLines.join('\n'),
      })
      continue
    }

    // 标题
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      blocks.push({
        type: 'heading',
        lines: [line],
        level,
        text: headingMatch[2],
        raw: line,
      })
      i++
      continue
    }

    // 分割线
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(trimmed)) {
      blocks.push({ type: 'hr', lines: [line], raw: line })
      i++
      continue
    }

    // HTML 注释或标签
    if (/^<!--/.test(trimmed) || /^<\w+/.test(trimmed)) {
      const start = i
      i++
      while (i < lines.length) {
        const t = lines[i].trim()
        if (/-->/.test(t) || /<\/\w+>/.test(t)) {
          i++
          break
        }
        i++
      }
      const htmlLines = lines.slice(start, i)
      blocks.push({ type: 'html', lines: htmlLines, raw: htmlLines.join('\n') })
      continue
    }

    // 引用块 (注: 空行不吞噬,留给后续解析,避免干扰上下文的空行判断)
    if (/^>/.test(trimmed)) {
      const start = i
      i++
      while (i < lines.length && lines[i].trimStart().startsWith('>')) {
        i++
      }
      const quoteLines = lines.slice(start, i)
      blocks.push({
        type: 'blockquote',
        lines: quoteLines,
        raw: quoteLines.join('\n'),
      })
      continue
    }

    // 表格
    if (
      /\|/.test(trimmed) &&
      lines[i + 1] &&
      /^\|[\s\-:]+\|/.test(lines[i + 1].trim())
    ) {
      const start = i
      i += 2
      while (i < lines.length && /\|/.test(lines[i].trim())) {
        i++
      }
      const tableLines = lines.slice(start, i)
      blocks.push({
        type: 'table',
        lines: tableLines,
        raw: tableLines.join('\n'),
      })
      continue
    }

    // 列表项（有序或无序）
    if (/^(\s*[-*+]\s|\s*\d+\.\s)/.test(line)) {
      const start = i
      i++
      while (i < lines.length) {
        const t = lines[i].trim()
        if (t === '') {
          i++
          break
        }
        if (/^(\s*[-*+]\s|\s*\d+\.\s)/.test(lines[i])) {
          i++
          continue
        }
        // 缩进 continuation
        if (/^\s{2,}/.test(lines[i])) {
          i++
          continue
        }
        break
      }
      const listLines = lines.slice(start, i)
      blocks.push({ type: 'list', lines: listLines, raw: listLines.join('\n') })
      continue
    }

    // 普通段落
    const start = i
    i++
    while (i < lines.length && lines[i].trim() !== '') {
      // 如果遇到新的块元素则停止
      const t = lines[i].trim()
      if (
        /^#{1,6}\s/.test(t) ||
        /^```/.test(t) ||
        /^~~~/.test(t) ||
        /^(\s*[-*+]\s|\s*\d+\.\s)/.test(lines[i])
      )
        break
      // 分割线
      if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(t)) break
      i++
    }
    const paraLines = lines.slice(start, i)
    blocks.push({
      type: 'paragraph',
      lines: paraLines,
      raw: paraLines.join('\n'),
    })
  }

  return blocks
}

/**
 * 格式化文档
 */
function formatMarkdown(input, options = {}) {
  const cfg = { ...CONFIG, ...options }
  const lines = input.split('\n')
  let blocks = parseBlocks(lines)

  // ---------- 格式化步骤 ----------

  // 1. 确保标题前后有空行
  if (cfg.headingSpaceBefore || cfg.headingSpaceAfter) {
    blocks = blocks.map((block, idx) => {
      if (block.type !== 'heading') return block

      const newLines = [...block.lines]

      // 标题前加空行（如果不是第一个块且前一个不是空行）
      if (
        cfg.headingSpaceBefore &&
        idx > 0 &&
        blocks[idx - 1].type !== 'empty'
      ) {
        newLines.unshift('')
      }

      // 标题后加空行（如果不是最后一个块且后一个不是空行）
      if (
        cfg.headingSpaceAfter &&
        idx < blocks.length - 1 &&
        blocks[idx + 1].type !== 'empty'
      ) {
        newLines.push('')
      }

      return { ...block, lines: newLines }
    })
  }

  // 2. 格式化代码块
  blocks = blocks.map((block, idx) => {
    if (block.type !== 'code') return block

    const newLines = [...block.lines]

    // 先提取代码块标记信息 (第一行是 ``` 或 ~~~)
    const markerMatch = newLines[0].trim().match(/^(```|~~~)/)
    if (!markerMatch) return block // 安全兜底
    const marker = markerMatch[1]
    const lang = newLines[0].trim().slice(marker.length).trim().toLowerCase()

    // 标准化语言标记
    const indent = newLines[0].match(/^\s*/)[0]
    newLines[0] = lang ? `${indent}${marker}${lang}` : `${indent}${marker}`

    // 确保代码块前后有空行（插在标准化之后，因为只动第一行）
    if (
      idx > 0 &&
      blocks[idx - 1].type !== 'empty' &&
      blocks[idx - 1].type !== 'code'
    ) {
      newLines.unshift('')
    }
    if (
      idx < blocks.length - 1 &&
      blocks[idx + 1].type !== 'empty' &&
      blocks[idx + 1].type !== 'code'
    ) {
      newLines.push('')
    }

    return { ...block, lines: newLines }
  })

  // 3. 压缩多余空行
  blocks = compressEmptyLines(blocks, cfg.maxConsecutiveBlankLines)

  // 4. 删除行尾空格
  if (cfg.removeTrailingSpaces) {
    blocks = blocks.map((block) => ({
      ...block,
      lines: block.lines.map((l) => l.replace(/[ \t]+$/, '')),
    }))
  }

  // 5. 修复列表缩进
  blocks = blocks.map((block) => {
    if (block.type !== 'list') return block
    return {
      ...block,
      lines: block.lines.map((line) => {
        const trimmed = line.trimStart()
        // 检测列表标记
        if (/^[-*+]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
          const indent = line.length - line.trimStart().length
          // 如果是顶层列表项，确保缩进为0
          if (indent % cfg.listIndent !== 0) {
            const normalizedIndent =
              Math.round(indent / cfg.listIndent) * cfg.listIndent
            return ' '.repeat(normalizedIndent) + trimmed
          }
        }
        return line
      }),
    }
  })

  // 重新拼装
  const resultLines = blocks.flatMap((b) => b.lines)

  // 处理文件开头和结尾的空行
  while (resultLines.length > 0 && resultLines[0] === '') resultLines.shift()
  while (resultLines.length > 0 && resultLines[resultLines.length - 1] === '')
    resultLines.pop()
  resultLines.push('') // 文件结尾留一个空行

  return resultLines.join('\n')
}

/**
 * 压缩连续空行块
 */
function compressEmptyLines(blocks, maxBlank) {
  const result = []
  let blankCount = 0

  for (const block of blocks) {
    if (block.type === 'empty') {
      blankCount++
      if (blankCount <= maxBlank) {
        result.push(block)
      }
    } else {
      blankCount = 0
      result.push(block)
    }
  }

  return result
}

// ======================== 统计信息 ========================

function getStats(input) {
  const lines = input.split('\n')
  const blocks = parseBlocks(lines)

  return {
    totalLines: lines.length,
    nonEmptyLines: lines.filter((l) => l.trim() !== '').length,
    headings: blocks.filter((b) => b.type === 'heading').length,
    codeBlocks: blocks.filter((b) => b.type === 'code').length,
    lists: blocks.filter((b) => b.type === 'list').length,
    tables: blocks.filter((b) => b.type === 'table').length,
    blockquotes: blocks.filter((b) => b.type === 'blockquote').length,
    hr: blocks.filter((b) => b.type === 'hr').length,
    characters: input.length,
  }
}

function printStats(stats) {
  console.log(bold('\n📊 文档统计信息:'))
  console.log(`  总行数:         ${cyan(String(stats.totalLines))}`)
  console.log(`  非空行数:       ${cyan(String(stats.nonEmptyLines))}`)
  console.log(`  字符数:         ${cyan(String(stats.characters))}`)
  console.log(`  标题数:         ${cyan(String(stats.headings))}`)
  console.log(`  代码块数:       ${cyan(String(stats.codeBlocks))}`)
  console.log(`  列表数:         ${cyan(String(stats.lists))}`)
  console.log(`  表格数:         ${cyan(String(stats.tables))}`)
  console.log(`  引用块数:       ${cyan(String(stats.blockquotes))}`)
  console.log(`  分割线数:       ${cyan(String(stats.hr))}`)
}

// ======================== 文件处理 ========================

function readFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8')
    // 统一换行符为 \n，避免 Windows 的 \r\n 导致 diff 不稳定
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    return content
  } catch (err) {
    console.error(red(`❌ 无法读取文件: ${filePath}`))
    console.error(dim(err.message))
    process.exit(1)
  }
}

function writeFile(filePath, content) {
  try {
    fs.writeFileSync(filePath, content, 'utf-8')
    console.log(green(`✅ 已写入: ${filePath}`))
  } catch (err) {
    console.error(red(`❌ 写入失败: ${filePath}`))
    console.error(dim(err.message))
    process.exit(1)
  }
}

function processFile(filePath, options) {
  const relativePath = path.relative(process.cwd(), filePath)
  console.log(bold(`\n📄 处理文件: ${cyan(relativePath)}`))

  const input = readFile(filePath)
  const statsBefore = getStats(input)

  if (options.verbose) {
    console.log(dim('  格式化前:'))
    printStats(statsBefore)
  }

  const formatted = formatMarkdown(input, options)
  const statsAfter = getStats(formatted)

  const hasChanges = input !== formatted

  if (options.check) {
    if (hasChanges) {
      console.log(yellow('  ⚠️  文件需要格式化 (dry-run, 未写入)'))
      const added = statsAfter.totalLines - statsBefore.totalLines
      console.log(dim(`  行数变化: ${added > 0 ? '+' : ''}${added}`))
    } else {
      console.log(green('  ✅ 文件已格式良好'))
    }
    return hasChanges ? 1 : 0
  }

  if (hasChanges) {
    writeFile(filePath, formatted)
    console.log(green('  ✨ 格式化完成!'))
    if (options.verbose) {
      printStats(statsAfter)
    }
  } else {
    console.log(green('  ✅ 文档已经格式良好,无需修改'))
  }

  return 0
}

function processDirectory(dirPath, options) {
  let exitCode = 0
  const files = fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(dirPath, f))

  if (files.length === 0) {
    console.log(yellow(`⚠️  在 ${dirPath} 中未找到 .md 文件`))
    return 0
  }

  console.log(
    bold(`\n📁 扫描目录: ${cyan(dirPath)} (${files.length} 个文件)\n`),
  )

  for (const file of files) {
    const ret = processFile(file, options)
    if (ret !== 0) exitCode = ret
  }

  return exitCode
}

// ======================== CLI ========================

function printHelp() {
  console.log(
    bold(`
📝 Markdown 文档格式化工具 v1.0.0

${cyan('用法:')}
  node scripts/format-docs.js [文件路径] [选项]

${cyan('参数:')}
  文件路径                要格式化的 .md 文件 (默认: public/docs/home.md)

${cyan('选项:')}
  --dir, -d <目录>        格式化整个目录下的所有 .md 文件
  --check, -c             dry-run 模式,只检查不写入
  --verbose, -v          显示详细统计信息
  --help, -h             显示帮助信息

${cyan('示例:')}
  node scripts/format-docs.js
  node scripts/format-docs.js README.md
  node scripts/format-docs.js --dir docs/
  node scripts/format-docs.js --check
`),
  )
}

function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    file: null,
    dir: null,
    check: false,
    verbose: false,
    help: false,
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dir':
      case '-d':
        options.dir = args[++i]
        break
      case '--check':
      case '-c':
        options.check = true
        break
      case '--verbose':
      case '-v':
        options.verbose = true
        break
      case '--help':
      case '-h':
        options.help = true
        break
      default:
        if (!args[i].startsWith('--') && !args[i].startsWith('-')) {
          options.file = path.resolve(process.cwd(), args[i])
        }
    }
  }

  return options
}

// ======================== 主函数 ========================

function main() {
  const options = parseArgs()

  if (options.help) {
    printHelp()
    return 0
  }

  console.log(bold(`\n${cyan('🐱 文档格式化工具')} ${dim('(用❤️制作)')}\n`))

  if (options.dir) {
    const dirPath = path.resolve(process.cwd(), options.dir)
    if (!fs.existsSync(dirPath)) {
      console.error(red(`❌ 目录不存在: ${dirPath}`))
      return 1
    }
    return processDirectory(dirPath, options)
  }

  const filePath = options.file || DEFAULT_FILE
  if (!fs.existsSync(filePath)) {
    console.error(red(`❌ 文件不存在: ${filePath}`))
    return 1
  }

  return processFile(filePath, options)
}

// ======================== 启动 ========================

if (require.main === module) {
  const exitCode = main()
  process.exit(exitCode)
}

module.exports = { formatMarkdown, getStats, parseBlocks }
