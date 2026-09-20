import { describe, it, expect } from 'vitest';
import { buildAgentConfig, buildWorkflowYaml, providerSecretKey, slugify } from '../src/modules/ci/helpers.js';
import type { AgentRow } from '../src/db/rows.js';

function agentRow(overrides: Partial<AgentRow> = {}): AgentRow {
  return {
    id: 'ag1',
    workspaceId: 'ws1',
    name: 'Security Reviewer',
    description: '',
    provider: 'openai',
    model: 'gpt-4.1',
    systemPrompt: 'You are a security reviewer.',
    outputSchema: null,
    strategy: 'single-pass',
    ciFailOn: 'critical',
    repoIntel: true,
    enabled: true,
    version: 1,
    createdBy: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('slugify', () => {
  it('lowercases, spaces to hyphens', () => {
    expect(slugify('Security Reviewer')).toBe('security-reviewer');
  });

  it('strips non-alphanumeric characters', () => {
    expect(slugify('API Contract Reviewer!! (v2)')).toBe('api-contract-reviewer-v2');
  });

  it('collapses repeated separators and trims leading/trailing hyphens', () => {
    expect(slugify('  --Test--  ')).toBe('test');
  });

  it('falls back to "agent" for a name with no alphanumeric characters', () => {
    expect(slugify('!!!')).toBe('agent');
  });
});

describe('providerSecretKey', () => {
  it('maps each known provider to its secret env var name', () => {
    expect(providerSecretKey('openai')).toBe('OPENAI_API_KEY');
    expect(providerSecretKey('anthropic')).toBe('ANTHROPIC_API_KEY');
    expect(providerSecretKey('openrouter')).toBe('OPENROUTER_API_KEY');
  });

  it('defaults to OPENAI_API_KEY for an unknown provider', () => {
    expect(providerSecretKey('mystery')).toBe('OPENAI_API_KEY');
  });
});

describe('buildWorkflowYaml', () => {
  it('references the agent-slug config path and the matching provider secret', () => {
    const yaml = buildWorkflowYaml('security-reviewer', 'anthropic');
    expect(yaml).toContain('.devdigest/security-reviewer.json');
    expect(yaml).toContain('ANTHROPIC_API_KEY');
    expect(yaml).toContain('pull_request');
    expect(yaml).toContain('devdigest review --pr');
  });
});

describe('buildAgentConfig', () => {
  it('embeds RESOLVED skill bodies, not ids — a standalone runner has no DB to resolve ids against', () => {
    const json = buildAgentConfig(agentRow(), ['RULE A: flag secrets.', 'RULE B: prefer async/await.']);
    const parsed = JSON.parse(json);
    expect(parsed.skills).toEqual(['RULE A: flag secrets.', 'RULE B: prefer async/await.']);
    expect(parsed.provider).toBe('openai');
    expect(parsed.model).toBe('gpt-4.1');
    expect(parsed.system_prompt).toBe('You are a security reviewer.');
  });

  it('is valid, parseable JSON with a trailing newline', () => {
    const json = buildAgentConfig(agentRow(), []);
    expect(() => JSON.parse(json)).not.toThrow();
    expect(json.endsWith('\n')).toBe(true);
  });
});
