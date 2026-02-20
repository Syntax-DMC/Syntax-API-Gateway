import { registryService } from './registry.service';
import {
  ApiDefinition,
  OrchestratorApiCall,
  ExecutionLayer,
  DependencyDef,
  AutoResolveResult,
  AutoResolveApiDetail,
} from '../types';

interface ProviderEntry {
  slug: string;
  path: string;
}

class AutoResolverService {
  /**
   * Resolve a set of API slugs + context into an execution plan.
   * Automatically builds dependency graph from response_fields ↔ query_params matching.
   */
  async resolve(
    slugs: string[],
    context: Record<string, string>,
    tenantId: string,
    overrides?: Record<string, Record<string, { source_slug: string; source_path: string }>>
  ): Promise<AutoResolveResult> {
    const warnings: string[] = [];
    const unresolvedParams: { slug: string; param: string }[] = [];
    const dependencyEdges: AutoResolveResult['dependencyEdges'] = [];
    const apiDetails: Record<string, AutoResolveApiDetail> = {};

    // 1. Fetch all definitions in one query
    const defs = new Map<string, ApiDefinition>();
    const allDefs = await registryService.getBySlugs(slugs, tenantId);
    for (const def of allDefs) {
      defs.set(def.slug, def);
    }
    for (const slug of slugs) {
      if (!defs.has(slug)) {
        warnings.push(`API definition not found: ${slug}`);
      }
    }

    // 2. Build providers map: leafName → [{ slug, path }]
    const providers = new Map<string, ProviderEntry[]>();
    for (const [slug, def] of defs) {
      for (const field of def.response_fields || []) {
        const leaf = field.leaf_name;
        if (!providers.has(leaf)) providers.set(leaf, []);
        providers.get(leaf)!.push({ slug, path: field.path });
      }
    }

    // 3. For each API, resolve its query_params
    const callParamsMap = new Map<string, Record<string, string>>();
    const depsMap = new Map<string, { source_slug: string; source: string; target: string }[]>();

    for (const [slug, def] of defs) {
      const contextParams: string[] = [];
      const injectedParams: Record<string, { source_slug: string; source_path: string }> = {};
      const unresolvedForApi: string[] = [];
      const params: Record<string, string> = {};
      const mappings: { source_slug: string; source: string; target: string }[] = [];

      for (const qp of def.query_params) {
        // Check user overrides first
        if (overrides?.[slug]?.[qp.name]) {
          const ov = overrides[slug][qp.name];
          mappings.push({ source_slug: ov.source_slug, source: ov.source_path, target: qp.name });
          injectedParams[qp.name] = { source_slug: ov.source_slug, source_path: ov.source_path };
          continue;
        }

        // Check context
        if (context[qp.name] !== undefined) {
          params[qp.name] = context[qp.name];
          contextParams.push(qp.name);
          continue;
        }

        // Check providers (but not self)
        const providerList = providers.get(qp.name)?.filter(p => p.slug !== slug);
        if (providerList && providerList.length > 0) {
          if (providerList.length > 1) {
            warnings.push(
              `Ambiguous: param "${qp.name}" for "${slug}" can be provided by: ${providerList.map(p => p.slug).join(', ')}. Using "${providerList[0].slug}".`
            );
          }
          const chosen = providerList[0];
          mappings.push({ source_slug: chosen.slug, source: chosen.path, target: qp.name });
          injectedParams[qp.name] = { source_slug: chosen.slug, source_path: chosen.path };
        } else if (qp.required) {
          unresolvedParams.push({ slug, param: qp.name });
          unresolvedForApi.push(qp.name);
        }
      }

      callParamsMap.set(slug, params);
      if (mappings.length > 0) {
        depsMap.set(slug, mappings);

        // Group by source_slug for dependency edges
        const bySource = new Map<string, { source: string; target: string }[]>();
        for (const m of mappings) {
          if (!bySource.has(m.source_slug)) bySource.set(m.source_slug, []);
          bySource.get(m.source_slug)!.push({ source: m.source, target: m.target });
        }
        for (const [from, maps] of bySource) {
          dependencyEdges.push({ from, to: slug, mappings: maps });
        }
      }

      apiDetails[slug] = {
        method: def.method,
        name: def.name,
        path: def.path,
        query_params: def.query_params,
        response_fields: def.response_fields || [],
        contextParams,
        injectedParams,
        unresolvedParams: unresolvedForApi,
      };
    }

    // 4. Topological sort
    const resolvedSlugs = slugs.filter(s => defs.has(s));
    const layers = this.topologicalSort(resolvedSlugs, dependencyEdges);

    // 5. Build OrchestratorApiCall[]
    const calls: OrchestratorApiCall[] = resolvedSlugs.map(slug => ({
      slug,
      params: callParamsMap.get(slug) || {},
    }));

    return { calls, layers, dependencyEdges, warnings, unresolvedParams, apiDetails };
  }

  /**
   * Build DependencyDef[] map from auto-resolve result for the orchestrator.
   */
  buildDynamicDeps(result: AutoResolveResult): Map<string, DependencyDef[]> {
    const dynamicDeps = new Map<string, DependencyDef[]>();

    // Group edges by target slug
    for (const edge of result.dependencyEdges) {
      if (!dynamicDeps.has(edge.to)) dynamicDeps.set(edge.to, []);
      dynamicDeps.get(edge.to)!.push({
        api_slug: edge.from,
        field_mappings: edge.mappings,
      });
    }

    return dynamicDeps;
  }

  private topologicalSort(
    slugs: string[],
    edges: AutoResolveResult['dependencyEdges']
  ): ExecutionLayer[] {
    const slugSet = new Set(slugs);

    // Build adjacency: inDegree for each slug
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>(); // from → [to]

    for (const slug of slugs) {
      inDegree.set(slug, 0);
      dependents.set(slug, []);
    }

    for (const edge of edges) {
      if (slugSet.has(edge.from) && slugSet.has(edge.to)) {
        inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
        dependents.get(edge.from)!.push(edge.to);
      }
    }

    // Kahn's algorithm
    const layers: ExecutionLayer[] = [];
    const remaining = new Set(slugs);

    while (remaining.size > 0) {
      const zeroInDegree = [...remaining].filter(s => (inDegree.get(s) || 0) === 0);

      if (zeroInDegree.length === 0) {
        // Circular dependency
        break;
      }

      layers.push({ layer: layers.length, slugs: zeroInDegree });

      for (const slug of zeroInDegree) {
        remaining.delete(slug);
        for (const dep of dependents.get(slug) || []) {
          inDegree.set(dep, (inDegree.get(dep) || 0) - 1);
        }
      }
    }

    return layers;
  }
}

export const autoResolverService = new AutoResolverService();
