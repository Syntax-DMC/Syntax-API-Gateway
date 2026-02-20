import { registryService } from './registry.service';
import { explorerService } from './explorer.service';
import { autoResolverService } from './auto-resolver.service';
import {
  ApiDefinition,
  DependencyDef,
  OrchestratorApiCall,
  OrchestratorCallResult,
  OrchestratorResult,
  ExecutionLayer,
  ExecutionPlan,
} from '../types';

function buildApiPath(def: ApiDefinition, params?: Record<string, string>): string {
  let finalPath = def.path;

  // Substitute path parameters: {plant} -> value
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      finalPath = finalPath.replace(`{${key}}`, encodeURIComponent(value));
    }
  }

  // Append query parameters that match definition's query_params
  const queryParts: string[] = [];
  if (def.query_params && def.query_params.length > 0 && params) {
    for (const qp of def.query_params) {
      const val = params[qp.name];
      if (val !== undefined && val !== '') {
        // Only add as query param if not already a path param substitution
        if (!def.path.includes(`{${qp.name}}`)) {
          queryParts.push(`${encodeURIComponent(qp.name)}=${encodeURIComponent(val)}`);
        }
      }
    }
  }
  if (queryParts.length > 0) {
    finalPath += (finalPath.includes('?') ? '&' : '?') + queryParts.join('&');
  }

  return finalPath;
}

/**
 * Extract a value from an object using a dot-path string.
 * Supports bracket notation:
 *   "value[0].plant"  → obj.value[0].plant
 *   "value[].material" → obj.value[0].material  (empty [] = first element)
 */
function extractByDotPath(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) return undefined;

  // Normalize bracket notation to dots:
  //   "value[0].plant"   → "value.0.plant"
  //   "value[].material"  → "value.0.material"  (empty [] → first element)
  const normalized = path
    .replace(/\[\]/g, '[0]')
    .replace(/\[(\d+)\]/g, '.$1');
  const segments = normalized.split('.');

  let current: unknown = obj;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

class OrchestratorService {
  async executeQuery(
    connectionId: string,
    tenantId: string,
    userId: string,
    calls: OrchestratorApiCall[],
    mode: 'parallel' | 'sequential' = 'parallel'
  ): Promise<OrchestratorResult> {
    if (mode === 'sequential') {
      return this.executeSequential(connectionId, tenantId, userId, calls);
    }
    return this.executeParallel(connectionId, tenantId, userId, calls);
  }

  /**
   * Auto-resolved execution: takes slugs + context, builds dependency graph automatically,
   * then executes sequentially with injected parameters.
   */
  async executeAutoResolved(
    connectionId: string,
    tenantId: string,
    userId: string,
    slugs: string[],
    context: Record<string, string>,
    overrides?: Record<string, Record<string, { source_slug: string; source_path: string }>>
  ): Promise<OrchestratorResult> {
    const resolved = await autoResolverService.resolve(slugs, context, tenantId, overrides);
    const dynamicDeps = autoResolverService.buildDynamicDeps(resolved);

    return this.executeSequential(connectionId, tenantId, userId, resolved.calls, dynamicDeps);
  }

  async validateQuery(
    tenantId: string,
    calls: OrchestratorApiCall[],
    mode: 'parallel' | 'sequential' = 'parallel'
  ): Promise<ExecutionPlan> {
    const resolvedSlugs: string[] = [];
    const unresolvedSlugs: string[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];
    const defsMap = new Map<string, ApiDefinition>();

    // Resolve all slugs
    for (const call of calls) {
      const def = await registryService.getBySlug(call.slug, tenantId);
      if (!def) {
        unresolvedSlugs.push(call.slug);
      } else {
        if (!def.is_active) {
          warnings.push(`API definition '${call.slug}' is inactive`);
        }
        resolvedSlugs.push(call.slug);
        defsMap.set(call.slug, def);
      }
    }

    // Build dependency edges
    const callSlugs = new Set(calls.map((c) => c.slug));
    const dependencyEdges: ExecutionPlan['dependencyEdges'] = [];

    for (const [slug, def] of defsMap) {
      if (def.depends_on) {
        for (const dep of def.depends_on) {
          if (callSlugs.has(dep.api_slug)) {
            dependencyEdges.push({
              from: dep.api_slug,
              to: slug,
              mappings: dep.field_mappings,
            });
          } else if (defsMap.has(slug)) {
            warnings.push(`'${slug}' depends on '${dep.api_slug}' which is not in the call set`);
          }
        }
      }
    }

    // Build layers
    let layers: ExecutionLayer[];
    if (mode === 'sequential') {
      const sortResult = this.topologicalSort(
        calls.map((c) => c.slug).filter((s) => defsMap.has(s)),
        defsMap
      );
      layers = sortResult.layers;
      errors.push(...sortResult.errors);
    } else {
      // Parallel: all in layer 0
      layers = [{ layer: 0, slugs: resolvedSlugs }];
    }

    return {
      mode,
      layers,
      resolvedSlugs,
      unresolvedSlugs,
      dependencyEdges,
      warnings,
      errors,
    };
  }

  private topologicalSort(
    slugs: string[],
    defsMap: Map<string, ApiDefinition>
  ): { layers: ExecutionLayer[]; errors: string[] } {
    const errors: string[] = [];
    const slugSet = new Set(slugs);

    // Build adjacency: inDegree for each slug (only considering deps within the call set)
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>(); // from → [to]

    for (const slug of slugs) {
      inDegree.set(slug, 0);
      dependents.set(slug, []);
    }

    for (const slug of slugs) {
      const def = defsMap.get(slug);
      if (!def?.depends_on) continue;
      for (const dep of def.depends_on) {
        if (slugSet.has(dep.api_slug)) {
          inDegree.set(slug, (inDegree.get(slug) || 0) + 1);
          dependents.get(dep.api_slug)!.push(slug);
        }
      }
    }

    // Kahn's algorithm: peel off zero-in-degree nodes layer by layer
    const layers: ExecutionLayer[] = [];
    let remaining = new Set(slugs);

    while (remaining.size > 0) {
      const zeroInDegree = [...remaining].filter((s) => (inDegree.get(s) || 0) === 0);

      if (zeroInDegree.length === 0) {
        // Circular dependency detected
        errors.push(`Circular dependency detected among: ${[...remaining].join(', ')}`);
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

    return { layers, errors };
  }

  private async executeParallel(
    connectionId: string,
    tenantId: string,
    userId: string,
    calls: OrchestratorApiCall[]
  ): Promise<OrchestratorResult> {
    const overallStart = Date.now();

    const promises = calls.map((call) => this.executeSingle(connectionId, tenantId, userId, call));
    const settled = await Promise.allSettled(promises);

    const results: OrchestratorCallResult[] = settled.map((outcome, i) => {
      if (outcome.status === 'fulfilled') {
        return { ...outcome.value, layer: 0 };
      }
      return {
        slug: calls[i].slug,
        status: 'rejected' as const,
        error: (outcome.reason as Error)?.message || 'Unknown error',
        layer: 0,
      };
    });

    return {
      totalDurationMs: Date.now() - overallStart,
      mode: 'parallel',
      results,
    };
  }

  private async executeSequential(
    connectionId: string,
    tenantId: string,
    userId: string,
    calls: OrchestratorApiCall[],
    dynamicDeps?: Map<string, DependencyDef[]>
  ): Promise<OrchestratorResult> {
    const overallStart = Date.now();

    // Resolve all definitions up front
    const defsMap = new Map<string, ApiDefinition>();
    const allResults: OrchestratorCallResult[] = [];

    for (const call of calls) {
      const def = await registryService.getBySlug(call.slug, tenantId);
      if (def) {
        defsMap.set(call.slug, def);
      }
    }

    // When dynamicDeps are provided, temporarily inject them into the defs for topological sort
    if (dynamicDeps) {
      for (const [slug, deps] of dynamicDeps) {
        const def = defsMap.get(slug);
        if (def) {
          // Merge dynamic deps with any existing static deps
          defsMap.set(slug, { ...def, depends_on: [...def.depends_on, ...deps] });
        }
      }
    }

    // Run topological sort
    const resolvedSlugs = calls.map((c) => c.slug).filter((s) => defsMap.has(s));
    const { layers, errors } = this.topologicalSort(resolvedSlugs, defsMap);

    if (errors.length > 0) {
      // Return error results for all calls
      for (const call of calls) {
        allResults.push({
          slug: call.slug,
          status: 'rejected',
          error: errors[0],
          durationMs: 0,
        });
      }
      return {
        totalDurationMs: Date.now() - overallStart,
        mode: 'sequential',
        layers,
        results: allResults,
      };
    }

    // Context map: slug → responseBody (from fulfilled calls)
    const responseContext = new Map<string, unknown>();
    // Build a lookup: slug → original call
    const callMap = new Map<string, OrchestratorApiCall>();
    for (const call of calls) {
      callMap.set(call.slug, call);
    }

    // Handle unresolved slugs (not in defsMap)
    for (const call of calls) {
      if (!defsMap.has(call.slug)) {
        allResults.push({
          slug: call.slug,
          status: 'rejected',
          error: `API definition not found: ${call.slug}`,
          durationMs: 0,
        });
      }
    }

    // Execute layer by layer
    for (const layer of layers) {
      const layerCalls = layer.slugs.map((slug) => {
        const originalCall = callMap.get(slug)!;
        const def = defsMap.get(slug)!;
        const injectedParams: Record<string, string> = {};

        // Inject fields from prior layer responses
        if (def.depends_on) {
          for (const dep of def.depends_on) {
            if (responseContext.has(dep.api_slug)) {
              const depResponse = responseContext.get(dep.api_slug);
              for (const mapping of dep.field_mappings) {
                const extracted = extractByDotPath(depResponse, mapping.source);
                if (extracted !== undefined) {
                  injectedParams[mapping.target] = String(extracted);
                }
              }
            }
          }
        }

        // Merge injected params with user-provided params (user params take precedence)
        const mergedParams = { ...injectedParams, ...originalCall.params };

        return {
          call: { ...originalCall, params: mergedParams },
          slug,
          layerNum: layer.layer,
          injectedParams: Object.keys(injectedParams).length > 0 ? injectedParams : undefined,
        };
      });

      // Execute all calls in this layer in parallel
      const promises = layerCalls.map(({ call, slug, layerNum, injectedParams }) =>
        this.executeSingle(connectionId, tenantId, userId, call).then((result) => ({
          ...result,
          slug,
          layer: layerNum,
          injectedParams,
        }))
      );

      const settled = await Promise.allSettled(promises);

      for (let i = 0; i < settled.length; i++) {
        const outcome = settled[i];
        if (outcome.status === 'fulfilled') {
          const result = outcome.value;
          allResults.push(result);
          if (result.status === 'fulfilled') {
            responseContext.set(result.slug, result.responseBody);
          }
        } else {
          allResults.push({
            slug: layerCalls[i].slug,
            status: 'rejected',
            error: (outcome.reason as Error)?.message || 'Unknown error',
            layer: layerCalls[i].layerNum,
          });
        }
      }
    }

    return {
      totalDurationMs: Date.now() - overallStart,
      mode: 'sequential',
      layers,
      results: allResults,
    };
  }

  private async executeSingle(
    connectionId: string,
    tenantId: string,
    userId: string,
    call: OrchestratorApiCall
  ): Promise<OrchestratorCallResult> {
    const start = Date.now();

    // Resolve slug → definition
    const def = await registryService.getBySlug(call.slug, tenantId);
    if (!def) {
      return {
        slug: call.slug,
        status: 'rejected',
        durationMs: Date.now() - start,
        error: `API definition not found: ${call.slug}`,
      };
    }
    if (!def.is_active) {
      return {
        slug: call.slug,
        status: 'rejected',
        durationMs: Date.now() - start,
        error: `API definition is inactive: ${call.slug}`,
      };
    }

    // Build path from definition + params
    const finalPath = buildApiPath(def, call.params);

    try {
      const result = await explorerService.execute(userId, tenantId, {
        connectionId,
        method: def.method,
        path: finalPath,
        headers: call.headers || undefined,
        body: call.body || undefined,
      });

      // Parse response body as JSON if possible
      let responseBody: unknown = result.responseBody;
      if (typeof result.responseBody === 'string') {
        try {
          responseBody = JSON.parse(result.responseBody);
        } catch {
          // Keep as string
        }
      }

      return {
        slug: call.slug,
        status: 'fulfilled',
        method: def.method,
        requestPath: finalPath,
        requestParams: call.params,
        statusCode: result.statusCode,
        responseHeaders: result.responseHeaders,
        responseBody,
        responseSizeBytes: result.responseSizeBytes,
        durationMs: result.durationMs,
      };
    } catch (err) {
      return {
        slug: call.slug,
        status: 'rejected',
        method: def.method,
        requestPath: finalPath,
        requestParams: call.params,
        durationMs: Date.now() - start,
        error: (err as Error).message,
      };
    }
  }
}

export const orchestratorService = new OrchestratorService();
