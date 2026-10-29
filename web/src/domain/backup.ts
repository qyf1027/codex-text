import { validateWorkspace } from './validation';
import type { WorkspaceV1 } from './model';

export type WorkspaceBackup = { schemaVersion: '1.0.0'; exportType: 'workspace'; id: string; exportedAt: string; workspace: WorkspaceV1 };

export function makeWorkspaceBackup(workspace: WorkspaceV1, at = new Date().toISOString()): WorkspaceBackup {
  const issues = validateWorkspace(workspace);
  if (issues.length) throw new Error(`无法备份：${issues[0]}`);
  return { schemaVersion: '1.0.0', exportType: 'workspace', id: workspace.id, exportedAt: at, workspace: structuredClone(workspace) };
}

export function parseWorkspaceBackup(input: unknown): WorkspaceV1 {
  if (!input || typeof input !== 'object') throw new Error('备份不是 JSON 对象');
  const value = input as Partial<WorkspaceBackup>;
  if (value.schemaVersion !== '1.0.0' || value.exportType !== 'workspace') throw new Error('备份版本或类型不受支持');
  if (!value.workspace || value.workspace.schemaVersion !== 1) throw new Error('缺少受支持的工作区数据');
  const issues = validateWorkspace(value.workspace);
  if (issues.length) throw new Error(`备份校验失败：${issues[0]}`);
  return structuredClone(value.workspace);
}
