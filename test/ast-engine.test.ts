import { describe, expect, it } from 'vitest'
import {
  parseSourceFileAst,
  parseTsJsAst,
  parsePythonAst,
  parseRustAst,
  resolveRelativeImport,
} from '../src/ast/parser'
import { DependencyGraph } from '../src/ast/dependency-graph'

describe('AST Engine - Parser', () => {
  it('parses TypeScript imports, exports, and types', () => {
    const tsCode = `
import React, { useState, useEffect as useEff } from 'react';
import { HelperUtil } from './utils';
import config from '../config';

export interface UserConfig {
  id: string;
  active: boolean;
}

export type Status = 'idle' | 'running';

export class Manager {
  start() {}
}

export function calculateMetrics(a: number, b: number): number {
  return a + b;
}

export const executeTask = async (task: string) => {
  return true;
};
    `
    const ast = parseTsJsAst('src/components/manager.ts', tsCode)
    expect(ast.language).toBe('typescript')
    expect(ast.imports.length).toBe(3)
    expect(ast.imports[0].rawSpecifier).toBe('react')
    expect(ast.imports[0].isRelative).toBe(false)
    expect(ast.imports[1].rawSpecifier).toBe('./utils')
    expect(ast.imports[1].isRelative).toBe(true)
    expect(ast.imports[1].importedSymbols).toContain('HelperUtil')

    expect(ast.exports.map((e) => e.name)).toEqual([
      'UserConfig',
      'Status',
      'Manager',
      'calculateMetrics',
      'executeTask',
    ])
    expect(ast.exports.find((e) => e.name === 'Manager')?.kind).toBe('class')
    expect(ast.exports.find((e) => e.name === 'calculateMetrics')?.kind).toBe('function')
  })

  it('parses Python imports and top-level functions', () => {
    const pyCode = `
import os, sys
from typing import List, Optional
from .local_module import MyHelper

class DataPipeline:
    def run(self):
        pass

def process_batch(items: list):
    return len(items)

def _private_worker():
    pass
    `
    const ast = parsePythonAst('app/pipeline.py', pyCode)
    expect(ast.language).toBe('python')
    expect(ast.imports.length).toBe(4) // os, sys, typing, .local_module
    expect(ast.exports.map((e) => e.name)).toEqual(['DataPipeline', 'process_batch'])
  })

  it('parses Rust use statements and pub declarations', () => {
    const rustCode = `
use std::collections::HashMap;
use crate::models::{User, Account};

pub struct ServiceContext {
    pub id: u64,
}

pub trait Runner {
    fn execute(&self);
}

pub async fn run_service(ctx: ServiceContext) {
    // ...
}
    `
    const ast = parseRustAst('src/service.rs', rustCode)
    expect(ast.language).toBe('rust')
    expect(ast.imports.length).toBe(2)
    expect(ast.exports.map((e) => e.name)).toEqual(['ServiceContext', 'Runner', 'run_service'])
  })

  it('resolves relative imports correctly across files', () => {
    const allFiles = [
      'src/components/button.tsx',
      'src/components/utils.ts',
      'src/lib/logger/index.ts',
      'src/index.ts',
    ]

    expect(resolveRelativeImport('src/components/button.tsx', './utils', allFiles)).toBe('src/components/utils.ts')
    expect(resolveRelativeImport('src/components/button.tsx', '../lib/logger', allFiles)).toBe('src/lib/logger/index.ts')
    expect(resolveRelativeImport('src/components/button.tsx', 'external-pkg', allFiles)).toBeNull()
  })
})

describe('AST Engine - DependencyGraph & PageRank', () => {
  it('constructs DAG and calculates deep dependents and PageRank', () => {
    const fileA = parseSourceFileAst('src/index.ts', `import { B } from './b'; import { C } from './c';`)
    const fileB = parseSourceFileAst('src/b.ts', `import { C } from './c'; export const B = 1;`)
    const fileC = parseSourceFileAst('src/c.ts', `export const C = 2;`) // C is the core hub imported by A and B

    const graph = new DependencyGraph([fileA, fileB, fileC])

    // Verify direct dependencies
    expect(graph.getDependencies('src/index.ts')).toEqual(expect.arrayContaining(['src/b.ts', 'src/c.ts']))
    expect(graph.getDependencies('src/b.ts')).toEqual(['src/c.ts'])
    expect(graph.getDependencies('src/c.ts')).toEqual([])

    // Verify dependents
    expect(graph.getDependents('src/c.ts')).toEqual(expect.arrayContaining(['src/index.ts', 'src/b.ts']))

    // Verify deep dependents of C (if C changes, both B and index are affected)
    const deepOfC = graph.getDeepDependents('src/c.ts')
    expect(deepOfC).toEqual(expect.arrayContaining(['src/b.ts', 'src/index.ts']))

    // Analysis & PageRank
    const analysis = graph.analyze()
    expect(analysis.nodeCount).toBe(3)
    expect(analysis.edgeCount).toBe(3)

    // C should have the highest hub score because it is imported by B and A
    expect(analysis.hubs[0].filePath).toBe('src/c.ts')
    expect(analysis.hubs[0].inDegree).toBe(2)
  })
})
