import { useEffect, useMemo, useState } from 'react';

import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Alert, Badge, Button, Input, Skeleton } from '@open-zentra/foundation-design-system';
import { Icon } from '@open-zentra/foundation-icons';

import type { TokenSource } from '../../api';
import type { IdentityContext } from '../../types';
import {
  cloneDefaultWorkflow,
  getWorkflow,
  listWorkflows,
  publishWorkflow,
  saveWorkflow,
  type WorkflowDetail,
  type WorkflowDocument,
  type WorkflowNodeData,
} from './api';

type FlowNode = Node<WorkflowNodeData, 'trigger' | 'agent' | 'result'>;
type FlowEdge = Edge<{ route?: string; is_loop?: boolean; max_iterations?: number }>;
const DEFAULT_ID = 'default-analytics';

const WorkflowNode = ({ data, type, selected }: NodeProps<FlowNode>) => (
  <div className={`min-w-52 rounded-lg border px-4 py-3 shadow-sm transition ${type === 'trigger' ? 'border-primary/50 bg-primary/5' : type === 'result' ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border bg-card'} ${selected ? 'ring-2 ring-primary/30' : ''}`}>
    {type !== 'trigger' ? <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-foreground-muted" /> : null}
    <div className="flex items-center justify-between gap-3"><p className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground-muted">{type === 'agent' ? 'Agent' : type}</p>{data.controller ? <Badge size="sm" intent="primary">Controller</Badge> : null}</div>
    <p className="mt-2 text-sm font-semibold tracking-[-0.02em]">{data.label}</p>
    <p className="mt-1 max-w-48 text-xs leading-5 text-foreground-muted">{data.responsibility}</p>
    {type !== 'result' ? <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-primary" /> : null}
  </div>
);

const NODE_TYPES: NodeTypes = { trigger: WorkflowNode, agent: WorkflowNode, result: WorkflowNode };
const toNodes = (workflow: WorkflowDetail): FlowNode[] => workflow.definition.nodes as FlowNode[];
const toEdges = (workflow: WorkflowDetail): FlowEdge[] => workflow.definition.edges.map((edge) => ({ ...edge, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed }, label: edge.data?.route, labelStyle: { fill: '#64748b', fontSize: 10 }, animated: Boolean(edge.data?.is_loop) }));
const toDocument = (nodes: FlowNode[], edges: FlowEdge[]): WorkflowDocument => ({ nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data })), edges: edges.map(({ id, source, target, data }) => ({ id, source, target, data })) });
const canManage = (role: string) => role === 'owner' || role === 'admin';

export const WorkflowStudioPage = ({ getToken, identity }: { readonly getToken: TokenSource; readonly identity: IdentityContext }) => {
  const queryClient = useQueryClient();
  const [workflowId, setWorkflowId] = useState(DEFAULT_ID);
  const [name, setName] = useState('Analytics trust loop');
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [edgeId, setEdgeId] = useState<string | null>(null);
  const [simulationStep, setSimulationStep] = useState(0);
  const manage = canManage(identity.role);
  const workflows = useQuery({ queryKey: ['workflows'], queryFn: () => listWorkflows(getToken) });
  const detail = useQuery({ queryKey: ['workflow', workflowId], queryFn: () => getWorkflow(getToken, workflowId) });
  const workflow = detail.data;
  const editable = Boolean(workflow && !workflow.is_system && manage);

  useEffect(() => {
    if (!workflow) return;
    setName(workflow.name);
    setNodes(toNodes(workflow));
    setEdges(toEdges(workflow));
    setNodeId(null);
    setEdgeId(null);
  }, [workflow, setEdges, setNodes]);

  const clone = useMutation({ mutationFn: () => cloneDefaultWorkflow(getToken, 'Analytics workflow'), onSuccess: (created) => { queryClient.setQueryData(['workflow', created.workflow_id], created); void queryClient.invalidateQueries({ queryKey: ['workflows'] }); setWorkflowId(created.workflow_id); } });
  const save = useMutation({ mutationFn: () => saveWorkflow(getToken, workflowId, name, toDocument(nodes, edges)), onSuccess: (saved) => { queryClient.setQueryData(['workflow', saved.workflow_id], saved); void queryClient.invalidateQueries({ queryKey: ['workflows'] }); } });
  const publish = useMutation({ mutationFn: () => publishWorkflow(getToken, workflowId), onSuccess: (published) => queryClient.setQueryData(['workflow', published.workflow_id], published) });
  const selectedNode = useMemo(() => nodes.find((node) => node.id === nodeId) ?? null, [nodeId, nodes]);
  const selectedEdge = useMemo(() => edges.find((edge) => edge.id === edgeId) ?? null, [edgeId, edges]);
  const changeNode = (patch: Partial<WorkflowNodeData>) => selectedNode && setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, ...patch } } : node));
  const connect = (connection: Connection) => editable && setEdges((current) => addEdge({ ...connection, id: `${connection.source}-${connection.target}-${Date.now()}`, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed }, data: { route: 'success' } }, current));
  const addAgent = () => { const id = `agent-${nodes.length + 1}`; setNodes((current) => [...current, { id, type: 'agent', position: { x: 560, y: 500 }, data: { label: 'New agent', responsibility: 'Define this agent\'s work.', skills: [], tools: [] } }]); setNodeId(id); };
  const runSimulation = () => { setSimulationStep(1); window.setTimeout(() => setSimulationStep(2), 650); window.setTimeout(() => setSimulationStep(3), 1300); window.setTimeout(() => setSimulationStep(4), 1950); window.setTimeout(() => setSimulationStep(5), 2600); window.setTimeout(() => setSimulationStep(6), 3250); };

  if (detail.isPending || workflows.isPending) return <div className="flex h-full items-center justify-center"><Skeleton className="h-[620px] w-[92%]" /></div>;
  if (detail.error || !workflow) return <div className="p-8"><Alert intent="error" title="Workflow Studio could not be loaded">{detail.error?.message ?? 'No workflow was returned.'}</Alert></div>;

  return <div className="flex h-full min-h-0 flex-col bg-background">
    <header className="flex flex-wrap items-center gap-4 border-b border-border px-6 py-4"><div className="min-w-48 flex-1"><p className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground-muted">Workflow Studio</p><h1 className="mt-1 text-xl font-semibold tracking-[-0.035em]">{name}</h1></div><Badge intent={workflow.is_system ? 'secondary' : workflow.published_version ? 'primary' : 'default'}>{workflow.is_system ? 'System default' : workflow.published_version ? `Published v${workflow.published_version}` : 'Draft'}</Badge>{workflow.is_system && manage ? <Button size="sm" intent="secondary" loading={clone.isPending} onClick={() => clone.mutate()} start={<Icon name="copy" size="sm" />}>Clone to edit</Button> : null}{editable ? <><Button size="sm" intent="secondary" loading={save.isPending} onClick={() => save.mutate()} start={<Icon name="save" size="sm" />}>Save draft</Button><Button size="sm" loading={publish.isPending} onClick={() => publish.mutate()} start={<Icon name="upload" size="sm" />}>Publish</Button></> : null}</header>
    {(save.error || publish.error || clone.error) ? <Alert className="mx-6 mt-4" intent="error" title="Workflow could not be saved">{(save.error ?? publish.error ?? clone.error)?.message}</Alert> : null}
    <div className="flex min-h-0 flex-1"><aside className="hidden w-60 shrink-0 border-r border-border p-4 lg:block"><p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground-muted">Your workflows</p><div className="space-y-1">{workflows.data?.map((item) => <button key={item.workflow_id} type="button" onClick={() => setWorkflowId(item.workflow_id)} className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${item.workflow_id === workflowId ? 'bg-primary/10 text-primary' : 'text-foreground-muted hover:bg-secondary hover:text-foreground'}`}><span className="block truncate font-medium">{item.name}</span><span className="mt-0.5 block text-xs opacity-70">{item.is_system ? 'System default' : item.published_version ? `Version ${item.published_version}` : 'Draft'}</span></button>)}</div></aside>
      <section className="relative min-h-0 flex-1"><ReactFlow nodes={nodes.map((node, index) => ({ ...node, selected: node.id === nodeId || index + 1 === simulationStep }))} edges={edges} nodeTypes={NODE_TYPES} onNodesChange={editable ? onNodesChange : undefined} onEdgesChange={editable ? onEdgesChange : undefined} onConnect={connect} onNodeClick={(_, node) => { setNodeId(node.id); setEdgeId(null); }} onEdgeClick={(_, edge) => { setEdgeId(edge.id); setNodeId(null); }} nodesConnectable={editable} nodesDraggable={editable} elementsSelectable fitView minZoom={0.35} maxZoom={1.5} proOptions={{ hideAttribution: true }}><Background variant={BackgroundVariant.Dots} gap={18} size={1} /><Controls showInteractive={false} /></ReactFlow><div className="absolute bottom-5 left-5 z-10 flex gap-2">{editable ? <Button size="sm" intent="secondary" onClick={addAgent} start={<Icon name="plus" size="sm" />}>Add agent</Button> : null}<Button size="sm" intent="secondary" onClick={runSimulation} start={<Icon name="send" size="sm" />}>Simulate flow</Button></div></section>
      <aside className="w-80 shrink-0 overflow-y-auto border-l border-border bg-card p-5"><p className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground-muted">Inspector</p>{selectedNode ? <div className="mt-5 space-y-4"><Input value={selectedNode.data.label} disabled={!editable} onChange={(event) => changeNode({ label: event.target.value })} aria-label="Node name" /><label className="block text-xs font-medium text-foreground-muted">Responsibility<textarea className="mt-1 min-h-20 w-full rounded-md border border-border bg-background p-2 text-sm disabled:opacity-70" disabled={!editable} value={selectedNode.data.responsibility ?? ''} onChange={(event) => changeNode({ responsibility: event.target.value })} /></label>{selectedNode.type === 'agent' ? <><label className="block text-xs font-medium text-foreground-muted">Skills<Input className="mt-1" disabled={!editable} value={(selectedNode.data.skills ?? []).join(', ')} onChange={(event) => changeNode({ skills: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} /></label><label className="block text-xs font-medium text-foreground-muted">Tools<Input className="mt-1" disabled={!editable} value={(selectedNode.data.tools ?? []).join(', ')} onChange={(event) => changeNode({ tools: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!editable} checked={Boolean(selectedNode.data.controller)} onChange={(event) => changeNode({ controller: event.target.checked })} /> Workflow controller</label></> : null}</div> : selectedEdge ? <div className="mt-5 space-y-3"><p className="text-sm font-medium">Route from {selectedEdge.source} to {selectedEdge.target}</p><label className="block text-xs font-medium text-foreground-muted">Route<Input className="mt-1" disabled={!editable} value={selectedEdge.data?.route ?? ''} onChange={(event) => setEdges((current) => current.map((edge) => edge.id === selectedEdge.id ? { ...edge, label: event.target.value, data: { ...edge.data, route: event.target.value } } : edge))} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!editable} checked={Boolean(selectedEdge.data?.is_loop)} onChange={(event) => setEdges((current) => current.map((edge) => edge.id === selectedEdge.id ? { ...edge, animated: event.target.checked, data: { ...edge.data, is_loop: event.target.checked, max_iterations: event.target.checked ? edge.data?.max_iterations ?? 3 : undefined } } : edge))} /> Bounded loop</label>{selectedEdge.data?.is_loop ? <label className="block text-xs font-medium text-foreground-muted">Maximum iterations<Input className="mt-1" type="number" min="1" disabled={!editable} value={selectedEdge.data.max_iterations ?? 3} onChange={(event) => setEdges((current) => current.map((edge) => edge.id === selectedEdge.id ? { ...edge, data: { ...edge.data, max_iterations: Number(event.target.value) } } : edge))} /></label> : null}</div> : <div className="mt-5 space-y-3 text-sm leading-6 text-foreground-muted"><p>Choose a node to configure its responsibility, Skills, Tools, and controller role.</p><p>Edges carry explicit artifacts and route conditions. The animated recheck edge shows the bounded evaluator loop.</p><Badge intent="secondary">Simulation only</Badge><p className="text-xs">Custom workflows are persisted and versioned, but only the system default executes through Nexus today.</p></div>}</aside>
    </div>
  </div>;
};
