// Iterative Kosaraju traversal avoids exhausting the JS call stack on long chains.
export function components(nodes: string[], edges: { from: string; to: string }[]): string[][] {
  const forward = new Map(nodes.map(n => [n, new Set<string>()]));
  const backward = new Map(nodes.map(n => [n, new Set<string>()]));
  for (const { from, to } of edges) { forward.get(from)?.add(to); backward.get(to)?.add(from); }
  const seen = new Set<string>();
  const order: string[] = [];
  for (const start of nodes) {
    if (seen.has(start)) continue;
    const stack: [string, boolean][] = [[start, false]];
    while (stack.length) {
      const [node, finished] = stack.pop()!;
      if (finished) { order.push(node); continue; }
      if (seen.has(node)) continue;
      seen.add(node);
      stack.push([node, true]);
      for (const next of forward.get(node) ?? []) if (!seen.has(next)) stack.push([next, false]);
    }
  }
  seen.clear();
  const groups: string[][] = [];
  for (const start of order.reverse()) {
    if (seen.has(start)) continue;
    const group: string[] = [];
    const stack = [start];
    while (stack.length) {
      const node = stack.pop()!;
      if (seen.has(node)) continue;
      seen.add(node); group.push(node);
      for (const next of backward.get(node) ?? []) if (!seen.has(next)) stack.push(next);
    }
    if (group.length > 1 || forward.get(start)?.has(start)) groups.push(group.sort());
  }
  return groups.sort((a, b) => a[0]!.localeCompare(b[0]!, 'en'));
}

export function cyclePath(group: string[], edges: { from: string; to: string }[]): string[] {
  const members = new Set(group);
  const start = group[0]!;
  const forward = new Map<string, string[]>();
  for (const { from, to } of edges) {
    if (members.has(from) && members.has(to)) {
      const targets = forward.get(from) ?? [];
      targets.push(to); forward.set(from, targets);
    }
  }
  const first = forward.get(start)?.[0];
  if (!first || first === start) return [start, start];
  const parents = new Map<string, string | undefined>([[first, undefined]]);
  const queue = [first];
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i]!;
    if (node === start) break;
    for (const next of forward.get(node) ?? []) if (!parents.has(next)) { parents.set(next, node); queue.push(next); }
  }
  const reverse = [start];
  let p = parents.get(start);
  while (p !== undefined) { reverse.push(p); p = parents.get(p); }
  return [start, ...reverse.reverse()];
}
