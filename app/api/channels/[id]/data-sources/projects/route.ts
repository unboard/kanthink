import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { channelDataSources } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { ensureSchema } from '@/lib/db/ensure-schema';

/**
 * Parse Mixpanel MCP SSE response into JSON.
 */
function parseMcpResponse(rawText: string): Record<string, unknown> | null {
  try {
    return JSON.parse(rawText);
  } catch {
    const dataLines = rawText.split('\n').filter((l: string) => l.startsWith('data: '));
    const lastDataLine = dataLines[dataLines.length - 1];
    if (lastDataLine) {
      return JSON.parse(lastDataLine.slice(6));
    }
    return null;
  }
}

/**
 * Call a Mixpanel MCP tool.
 */
async function callMcp(
  mcpUrl: string,
  token: string,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<{ result?: string; error?: string }> {
  try {
    const res = await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { error: `HTTP ${res.status}: ${errText.slice(0, 200)}` };
    }

    const rawText = await res.text();
    const data = parseMcpResponse(rawText);
    if (!data) return { error: 'Unexpected response format' };

    if (data.error) {
      const err = data.error as Record<string, unknown>;
      return { error: (err.message as string) || JSON.stringify(err) };
    }

    const result = data.result as Record<string, unknown> | undefined;
    const content = result?.content;
    if (content && Array.isArray(content)) {
      return { result: content.map((c: { text?: string }) => c.text || '').join('\n') };
    }

    return { result: JSON.stringify(result || data).slice(0, 5000) };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }
}

function getMcpUrl(metadata: Record<string, unknown> | null): string {
  const region = (metadata?.region as string) || 'us';
  return region === 'eu' ? 'https://mcp-eu.mixpanel.com/mcp'
    : region === 'in' ? 'https://mcp-in.mixpanel.com/mcp'
    : 'https://mcp.mixpanel.com/mcp';
}

// GET /api/channels/[id]/data-sources/projects — list Mixpanel projects with MCP status
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await ensureSchema();
  const { id: channelId } = await params;

  const [source] = await db
    .select()
    .from(channelDataSources)
    .where(and(eq(channelDataSources.channelId, channelId), eq(channelDataSources.provider, 'mixpanel')))
    .limit(1);

  if (!source?.accessToken || source.status !== 'active') {
    return NextResponse.json({ error: 'Mixpanel not connected' }, { status: 404 });
  }

  const metadata = source.metadata as Record<string, unknown> | null;
  const mcpUrl = getMcpUrl(metadata);
  const token = source.accessToken;

  // Get all projects
  const projectsResult = await callMcp(mcpUrl, token, 'Get-Projects');
  if (projectsResult.error || !projectsResult.result) {
    return NextResponse.json({ error: projectsResult.error || 'Failed to fetch projects' }, { status: 500 });
  }

  let projectData: Record<string, { id: number; name: string }>;
  try {
    projectData = JSON.parse(projectsResult.result);
  } catch {
    return NextResponse.json({ error: 'Failed to parse projects response' }, { status: 500 });
  }

  // For each project, check if MCP is enabled by calling Get-Events
  const projects: Array<{ id: number; name: string; mcpEnabled: boolean }> = [];

  const entries = Object.entries(projectData);
  // Sort non-deprecated first
  const sorted = [
    ...entries.filter(([, p]) => !p.name.toLowerCase().includes('deprecated')),
    ...entries.filter(([, p]) => p.name.toLowerCase().includes('deprecated')),
  ];

  for (const [id, proj] of sorted) {
    const numId = parseInt(id, 10);
    const eventsResult = await callMcp(mcpUrl, token, 'Get-Events', { project_id: numId });
    const mcpEnabled = !!(eventsResult.result && !eventsResult.result.includes('not enabled'));
    projects.push({ id: numId, name: proj.name, mcpEnabled });
  }

  // Also return currently selected project from metadata
  const selectedProjectId = (metadata as Record<string, unknown>)?.projectId ?? null;

  return NextResponse.json({ projects, selectedProjectId });
}
